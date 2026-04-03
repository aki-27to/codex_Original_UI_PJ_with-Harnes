#!/usr/bin/env node
"use strict";

const path = require("path");
const {
  appendImprovementAuditLog,
  createCheckpoint,
  restoreCheckpoint,
} = require("./lib/improvement_checkpoint");
const { loadEvalLanePolicy } = require("./lib/eval_lane_policy");
const { runPublicRegression } = require("./run_public_regression");
const {
  applySimulatedBreak,
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
    const regression = await runPublicRegression({
      actor: "optimizer",
      label: `post-apply-${loaded.lane}`,
      port: 57574,
    });
    if (!regression.ok) {
      const rollback = restoreCheckpoint({ checkpointRoot: checkpoint.checkpointRoot });
      appendImprovementAuditLog({
        workspaceRoot,
        entry: {
          action: "apply_rolled_back",
          lane: loaded.lane,
          checkpointId: checkpoint.checkpointId,
          reason: "public_regression_failed",
          verifierVerdict: regression.report.verifier.verdict,
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
