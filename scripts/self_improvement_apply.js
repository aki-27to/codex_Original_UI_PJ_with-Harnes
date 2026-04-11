#!/usr/bin/env node
"use strict";

const path = require("path");
const fs = require("fs");
const { execFileSync } = require("child_process");
const {
  appendImprovementAuditLog,
  createCheckpoint,
  restoreCheckpoint,
} = require("./lib/improvement_checkpoint");
const { loadEvalLanePolicy } = require("./lib/eval_lane_policy");
const { runPublicRegression } = require("./run_public_regression");
const {
  applySimulatedBreak,
  buildTargetedRegressionPlan,
  collectManagedTargets,
  loadLearningPolicyByLane,
  refreshSelfImprovementArtifacts,
  summarizeSelfImprovementResult,
} = require("./lib/self_improvement_phase1");
const { assertOperationalModeAllowed } = require("./lib/deployment_guards");

const workspaceRoot = path.resolve(__dirname, "..");

function readFlag(prefix) {
  const found = process.argv.find((entry) => entry.startsWith(`${prefix}=`));
  return found ? found.split("=", 2)[1] : "";
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function runTargetedCheck(checkId) {
  const normalized = String(checkId || "").trim().toLowerCase();
  if (!normalized) {
    return null;
  }
  try {
    if (normalized === "self_improvement_gate") {
      execFileSync("node", ["scripts/self_improvement_eval_gate.js"], {
        cwd: workspaceRoot,
        stdio: "pipe",
        encoding: "utf8",
      });
      return { checkId, status: "passed" };
    }
    if (normalized === "skill_portfolio_audit") {
      execFileSync("node", ["scripts/skill_portfolio_audit.js", "--json"], {
        cwd: workspaceRoot,
        stdio: "pipe",
        encoding: "utf8",
      });
      return { checkId, status: "passed" };
    }
    return { checkId, status: "skipped", reason: "no_direct_executor" };
  } catch (error) {
    return {
      checkId,
      status: "failed",
      reason: error instanceof Error ? error.message : String(error),
    };
  }
}

async function main() {
  const lane = readFlag("--lane") || "openai_blog";
  const simulateBreak = readFlag("--simulate-break");
  assertOperationalModeAllowed({
    workspaceRoot,
    actionType: "self_improvement",
    taskFamily: "tool_learning_or_new_tool_adoption",
    environment: "sandbox",
  });
  const loaded = loadLearningPolicyByLane(lane);
  const evalLanePolicy = loadEvalLanePolicy(undefined, { workspaceRoot });
  const protectedRoots = Array.isArray(evalLanePolicy.protectedPaths) ? evalLanePolicy.protectedPaths : [];
  const extraTargets = simulateBreak ? [path.join(workspaceRoot, "scripts", "config", "public_regression_overlay.json")] : [];
  const checkpoint = createCheckpoint({
    workspaceRoot,
    label: `self-improvement-${loaded.lane}`,
    targets: collectManagedTargets(loaded.policy, extraTargets),
    protectedRoots,
    metadata: {
      lane: loaded.lane,
      simulateBreak: simulateBreak || "",
    },
  });
  const auditLogPath = appendImprovementAuditLog({
    workspaceRoot,
    entry: {
      action: "apply_started",
      lane: loaded.lane,
      checkpointId: checkpoint.checkpointId,
      checkpointRoot: path.relative(workspaceRoot, checkpoint.checkpointRoot).replace(/\\/g, "/"),
      simulateBreak: simulateBreak || "",
    },
  });
  try {
    applySimulatedBreak(simulateBreak, workspaceRoot);
    const result = refreshSelfImprovementArtifacts({ policy: loaded.policy });
    const targetedRegressionPlan = buildTargetedRegressionPlan({
      policy: loaded.policy,
      result,
      lane: loaded.lane,
    });
    const targetedRegressionPlanPath = String(result && result.paths && result.paths.statePath || "").replace(/_state\.json$/i, "_targeted_regression_plan.json");
    if (targetedRegressionPlanPath) {
      writeJson(targetedRegressionPlanPath, targetedRegressionPlan);
    }
    const targetedRegressionResults = (Array.isArray(targetedRegressionPlan.targetedChecks) ? targetedRegressionPlan.targetedChecks : [])
      .map((checkId) => runTargetedCheck(checkId))
      .filter(Boolean);
    const targetedRegressionFailed = targetedRegressionResults.some((entry) => entry && entry.status === "failed");
    const regression = await runPublicRegression({
      actor: "optimizer",
      label: `post-apply-${loaded.lane}`,
      port: 57574,
    });
    if (!regression.ok || targetedRegressionFailed) {
      const rollback = restoreCheckpoint({ checkpointRoot: checkpoint.checkpointRoot });
      appendImprovementAuditLog({
        workspaceRoot,
        entry: {
          action: "apply_rolled_back",
          lane: loaded.lane,
          checkpointId: checkpoint.checkpointId,
          reason: !regression.ok ? "public_regression_failed" : "targeted_regression_failed",
          verifierVerdict: regression.report.verifier.verdict,
          targetedRegressionPlan,
          targetedRegressionResults,
          rollback,
        },
      });
      console.log(`[self-improvement-apply] lane=${loaded.lane} result=ROLLED_BACK verifier=${regression.report.verifier.verdict} checkpoint=${checkpoint.checkpointId}`);
      process.exitCode = 1;
      return;
    }
    appendImprovementAuditLog({
      workspaceRoot,
      entry: {
        action: "apply_succeeded",
        lane: loaded.lane,
        checkpointId: checkpoint.checkpointId,
        result: summarizeSelfImprovementResult(result),
        verifierVerdict: regression.report.verifier.verdict,
        targetedRegressionPlan,
        targetedRegressionResults,
      },
    });
    console.log(`[self-improvement-apply] lane=${loaded.lane} result=APPLIED verifier=${regression.report.verifier.verdict} audit=${path.relative(workspaceRoot, auditLogPath).replace(/\\/g, "/")}`);
  } catch (error) {
    const rollback = restoreCheckpoint({ checkpointRoot: checkpoint.checkpointRoot });
    appendImprovementAuditLog({
      workspaceRoot,
      entry: {
        action: "apply_rolled_back",
        lane: loaded.lane,
        checkpointId: checkpoint.checkpointId,
        reason: "apply_error",
        error: error instanceof Error ? error.message : String(error),
        rollback,
      },
    });
    throw error;
  }
}

main().catch((error) => {
  console.error(`[self-improvement-apply] FAIL ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
