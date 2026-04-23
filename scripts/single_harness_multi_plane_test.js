#!/usr/bin/env node
"use strict";

const assert = require("assert");
const fs = require("fs");
const net = require("net");
const path = require("path");
const {
  loadAuthorityRegistry,
} = require("./lib/authority_registry");
const {
  loadHarnessPlaneContract,
} = require("./lib/harness_plane_contract");
const {
  loadAdoptionReadinessContract,
} = require("./lib/adoption_readiness_policy");
const {
  loadIterationControlContract,
} = require("./lib/iteration_control_policy");
const {
  loadWorkerDecisionSurfaceContract,
} = require("./lib/worker_decision_surface");
const {
  buildGovernanceRuntimeSurface,
  buildTurnGovernanceBundle,
} = require("./lib/governance_bundle");
const {
  assertEvalLaneAccess,
  isProtectedEvalPath,
  loadEvalLanePolicy,
} = require("./lib/eval_lane_policy");
const {
  exportGovernancePublicBundle,
} = require("./lib/governance_public_bundle");
const {
  requestJson,
  startHarnessForPhase1,
} = require("./lib/harness_api_client");

const workspaceRoot = path.resolve(__dirname, "..");

function read(relativePath) {
  return fs.readFileSync(path.join(workspaceRoot, relativePath), "utf8");
}

function readJson(relativePath) {
  return JSON.parse(read(relativePath));
}

function makeProbeSuite(suiteId) {
  return {
    schema: "harness-eval-suite.v1",
    suiteId,
    description: "single harness multi-plane probe",
    cases: [
      {
        id: `${suiteId}-case`,
        title: `${suiteId}-case`,
        driver: "task_outcome_probe",
        input: {
          turnStatus: "completed",
        },
        expect: {
          mode: "json_fields",
          fields: {
            status: "COMPLETED",
            reason: "completed_default",
          },
        },
      },
    ],
  };
}

function makeVariant(label, profile) {
  return {
    label,
    agentName: "default",
    executionProfile: profile,
    requestUserInputPolicy: "blocked",
    webSearch: 0,
  };
}

function findAvailablePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = address && typeof address === "object" ? Number(address.port) : 0;
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        if (!Number.isInteger(port) || port <= 0) {
          reject(new Error("failed to allocate an available localhost port"));
          return;
        }
        resolve(port);
      });
    });
  });
}

async function withHarness(check) {
  const port = await findAvailablePort();
  const harness = await startHarnessForPhase1({
    workspaceRoot,
    proofRoot: path.join(workspaceRoot, "logs", "archive", "raw", "phase1_runs", `single-harness-${Date.now()}`),
    port,
    envOverrides: {
      CODEX_HOLDOUT_EVAL_UNLOCK: "",
      CODEX_BLACKBOX_EVAL_UNLOCK: "",
    },
  });
  try {
    await check(harness);
  } finally {
    await harness.handle.stop();
  }
}

async function main() {
  const results = [];
  async function runCheck(name, fn) {
    try {
      await fn();
      console.log(`PASS ${name}`);
      results.push({ name, ok: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`FAIL ${name} :: ${message}`);
      results.push({ name, ok: false, error: message });
    }
  }

  await runCheck("contract defines four planes and strict checks", async () => {
    const contract = loadHarnessPlaneContract();
    const strictCheckIds = contract.strictChecks.map((entry) => entry.id);
    assert.strictEqual(contract.schema, "single-harness-multi-plane-contract.v1", "schema mismatch");
    assert.strictEqual(contract.repoIdentity.mode, "single_governed_harness", "repo identity mismatch");
    assert.strictEqual(contract.primaryRoutes.execution, "POST /api/exec", "execution route mismatch");
    assert.strictEqual(contract.primaryRoutes.evaluation, "POST /api/eval/run", "evaluation route mismatch");
    for (const planeId of ["execution", "evaluation", "monitoring", "governance"]) {
      assert(contract.planes[planeId], `missing plane ${planeId}`);
    }
    for (const checkId of [
      "execution_plane_defined",
      "evaluation_plane_defined",
      "monitoring_plane_defined",
      "governance_plane_defined",
      "execution_plane_primary_route_is_api_exec",
      "evaluation_plane_primary_route_is_api_eval_run",
      "worker_decision_surface_scoped_to_governance",
      "goal_completion_scoped_to_program_readiness",
      "subjective_completion_scoped_to_companion",
      "compatibility_completion_scoped_to_compatibility",
      "protected_eval_assets_not_exposed_to_execution",
      "hidden_holdout_not_required_by_exec_path",
      "governance_not_promoted_from_exec_self_claim_alone",
      "docs_aligned_with_single_harness_multi_plane_architecture",
    ]) {
      assert(strictCheckIds.includes(checkId), `missing strict check ${checkId}`);
    }
  });

  await runCheck("docs align with single harness multi-plane semantics", async () => {
    const readme = read("README.md");
    const architecture = read("docs/CURRENT_ARCHITECTURE.md");
    const completion = read("docs/AGI_OPERATIONAL_COMPLETION.md");
    const runbook = read("docs/APP_SERVER_PROTOCOL_RUNBOOK.md");
    const planeDoc = read("docs/SINGLE_HARNESS_MULTI_PLANE.md");
    for (const doc of [readme, architecture, completion, runbook, planeDoc]) {
      assert(doc.includes("POST /api/exec"), "doc must mention POST /api/exec");
      assert(doc.includes("POST /api/eval/run"), "doc must mention POST /api/eval/run");
    }
    assert(readme.includes("single governed harness"), "README must describe the single governed harness");
    assert(architecture.includes("Execution plane"), "CURRENT_ARCHITECTURE must define the execution plane");
    assert(architecture.includes("Monitoring plane"), "CURRENT_ARCHITECTURE must define the monitoring plane");
    assert(completion.includes("worker_decision_surface.json"), "AGI_OPERATIONAL_COMPLETION must keep worker decision surface");
    assert(completion.includes("program-readiness"), "AGI_OPERATIONAL_COMPLETION must scope goal completion to program readiness");
    assert(runbook.includes("protected/holdout"), "APP_SERVER_PROTOCOL_RUNBOOK must mention protected holdout assets");
    assert(planeDoc.includes("split point is trust boundary"), "plane doc must describe the trust boundary split");
    assert(planeDoc.includes("sovereign"), "plane doc must describe the sovereign alias rule");
  });

  await runCheck("runtime summary exposes plane contract", async () => {
    const runtimeSurface = buildGovernanceRuntimeSurface({
      registry: loadAuthorityRegistry(),
      authorityRegistryPath: "scripts/config/authority_registry.json",
      approvalPolicy: "never",
      sandboxMode: "danger-full-access",
      autoCommitAndPush: false,
      iterationControlContract: loadIterationControlContract(),
      iterationControlContractPath: "scripts/config/iteration_control_contract.json",
      adoptionReadinessContract: loadAdoptionReadinessContract(),
      adoptionReadinessContractPath: "scripts/config/adoption_readiness_evaluator_contract.json",
      workerDecisionSurfaceContract: loadWorkerDecisionSurfaceContract(),
      workerDecisionSurfaceContractPath: "scripts/config/worker_decision_surface_contract.json",
      harnessPlaneContract: loadHarnessPlaneContract(),
      harnessPlaneContractPath: "scripts/config/harness_plane_contract.json",
      summarizePathForOperationLog(value) {
        return String(value || "");
      },
    });
    assert.strictEqual(runtimeSurface.harnessPlaneSummary.schema, "single-harness-multi-plane-contract.v1", "runtime harness plane summary schema mismatch");
    assert.strictEqual(runtimeSurface.harnessPlaneSummary.primaryRoutes.execution, "POST /api/exec", "runtime execution route mismatch");
    assert.strictEqual(runtimeSurface.harnessPlaneSummary.primaryRoutes.evaluation, "POST /api/eval/run", "runtime evaluation route mismatch");
    assert.strictEqual(runtimeSurface.harnessPlaneSummary.planes.governance.headlineSurface, "output/governance_public/worker_decision_surface.json", "runtime governance headline mismatch");
  });

  await runCheck("server routes preserve execution and evaluation primary paths", async () => {
    const requestHandlerText = read("server/request_handler.js");
    const overviewRoutesText = read("server/routes/overview_routes.js");
    const execRoutesText = read("server/routes/exec_routes.js");
    const evalRoutesText = read("server/routes/eval_routes.js");
    const evalServiceText = read("server/services/eval_service.js");
    assert(requestHandlerText.includes("createOverviewRoutes"), "request handler must register overview routes");
    assert(requestHandlerText.includes("createExecRoutes"), "request handler must register exec routes");
    assert(requestHandlerText.includes("createEvalRoutes"), "request handler must register eval routes");
    assert(overviewRoutesText.includes('pathname === "/api/harness/overview"'), "overview routes must expose GET /api/harness/overview");
    assert(execRoutesText.includes('pathname === "/api/exec"'), "exec routes must expose POST /api/exec");
    assert(evalRoutesText.includes('pathname === "/api/eval/run"'), "eval routes must expose POST /api/eval/run");
    assert(evalServiceText.includes("assertEvalLaneAccess"), "eval service must enforce configured eval lane access");
  });

  await runCheck("execution route block does not reference protected eval assets", async () => {
    const execBlock = read("server/routes/exec_routes.js");
    for (const forbiddenMarker of [
      "protected/holdout",
      "protected/blackbox",
      "hidden_holdout",
      "CODEX_HOLDOUT_EVAL_UNLOCK",
      "CODEX_BLACKBOX_EVAL_UNLOCK",
      "grader internals",
    ]) {
      assert(!execBlock.includes(forbiddenMarker), `exec block must not reference ${forbiddenMarker}`);
    }
  });

  await runCheck("worker current-truth surfaces stay scope-separated", async () => {
    const workerDecision = readJson("output/governance_public/worker_decision_surface.json");
    const goalCompletion = readJson("output/agi_readiness/goal_completion_status.json");
    const subjective = readJson("output/agi_readiness/subjective_goal_completion_status.json");
    const compatibilityPath = path.join(workspaceRoot, "output", "agi_readiness", "compatibility_completion_status.json");
    const latestOverview = readJson("output/memory_public/latest_overview.json");
    const compatibility = fs.existsSync(compatibilityPath)
      ? readJson("output/agi_readiness/compatibility_completion_status.json")
      : latestOverview.compatibilityCompletion;
    assert.strictEqual(workerDecision.scope, "worker_decision", "worker decision scope mismatch");
    assert.strictEqual(goalCompletion.scope, "program_readiness", "goal completion scope mismatch");
    assert.strictEqual(subjective.scope, "subjective_companion", "subjective completion scope mismatch");
    assert.strictEqual(compatibility.scope, "compatibility_layer", "compatibility completion scope mismatch");
  });

  await runCheck("protected eval paths stay fail-closed for execution-side actors", async () => {
    const policy = loadEvalLanePolicy(undefined, { workspaceRoot });
    assert.strictEqual(isProtectedEvalPath(policy, path.join(workspaceRoot, "protected", "holdout", "eval_suite_holdout.json")), true, "holdout suite path must be protected");
    assert.strictEqual(isProtectedEvalPath(policy, path.join(workspaceRoot, "protected", "blackbox", "agi_readiness_blackbox_suite.json")), true, "blackbox suite path must be protected");
    assert.throws(
      () => assertEvalLaneAccess({ policy, laneId: "hidden_holdout", actor: "optimizer", env: {} }),
      /eval_lane_access_denied/,
      "optimizer must not read hidden holdout lanes"
    );
    assert.throws(
      () => assertEvalLaneAccess({ policy, laneId: "blackbox_readiness", actor: "runtime", env: {} }),
      /eval_lane_access_denied/,
      "runtime must not read blackbox lanes"
    );
    assert.throws(
      () => assertEvalLaneAccess({ policy, laneId: "hidden_holdout", actor: "developer", env: {} }),
      /eval_lane_unlock_required/,
      "hidden holdout lanes must require an unlock signal"
    );
  });

  await runCheck("governance does not promote from exec self-claim alone", async () => {
    const iterationControlContract = loadIterationControlContract();
    const adoptionReadinessContract = loadAdoptionReadinessContract();
    const harnessContract = readJson("scripts/config/harness_contract_spec.json");
    assert.strictEqual(harnessContract.runDecisionBridge.completedTaskOutcomeDoesNotImplyReleaseApproved, true, "turn contract must reject release from completed outcome alone");
    assert.strictEqual(harnessContract.runDecisionBridge.governancePromotionRequiresEvalOrProtectedValidation, true, "turn contract must require eval/protected validation for promotion");
    const bundle = buildTurnGovernanceBundle({
      acceptanceResults: [],
      childEvidenceLedger: [],
      missingRequiredEvidence: ["review_bundle.json"],
      currentTurnSummary: {
        finalOutcome: {
          taskOutcomeStatus: "COMPLETED",
          taskOutcomeReason: "completed_default",
        },
        residualRisks: [],
        assumptions: [],
      },
      clauseCompletionScorecard: {
        status: "FAIL",
        clauses: [],
      },
      evidenceContractSpec: {
        requiredTurnArtifacts: ["review_bundle.json", "release_decision.json"],
      },
      iterationControlContract,
      adoptionReadinessContract,
      observedStepCount: 1,
      startedAt: Date.now() - 1000,
      now: Date.now(),
      threadId: "single-harness-test",
      finalStatus: "completed",
      taskOutcomeStatus: "COMPLETED",
      selection: {},
      requirementContract: {},
      dispatchPlan: {},
      buildReviewBundle() {
        return {
          schema: "review-bundle.v1",
          recommended_release_state: "RELEASE_APPROVED",
          blockers: ["missing evidence"],
        };
      },
      buildReleaseDecision(input) {
        return {
          terminal_state: input.reviewBundle.recommended_release_state,
          finalOutcome: input.finalOutcome,
        };
      },
      buildConformanceReport() {
        return {};
      },
    });
    assert.notStrictEqual(bundle.iterationDecision.action, "RELEASE", "iteration decision must not release from completed self-claim alone");
    assert.notStrictEqual(bundle.releaseDecision.terminal_state, "RELEASE_APPROVED", "release decision must not approve from completed self-claim alone");
  });

  await runCheck("runtime api and eval api enforce single-harness multi-plane semantics", async () => {
    await withHarness(async (harness) => {
      const runtimeRes = await requestJson({ port: harness.port, path: "/api/runtime", headers: harness.authHeaders, timeoutMs: 20000 });
      assert.strictEqual(runtimeRes.statusCode, 200, "runtime request must succeed");
      assert(runtimeRes.json && runtimeRes.json.harnessPlanes, "runtime must expose harnessPlanes");
      assert.strictEqual(runtimeRes.json.harnessPlanes.primaryRoutes.execution, "POST /api/exec", "runtime execution route mismatch");
      assert.strictEqual(runtimeRes.json.harnessPlanes.primaryRoutes.evaluation, "POST /api/eval/run", "runtime evaluation route mismatch");

      const deniedProtected = await requestJson({
        port: harness.port,
        path: "/api/eval/run",
        method: "POST",
        headers: harness.authHeaders,
        body: {
          laneId: "hidden_holdout",
          actor: "developer",
          suite: makeProbeSuite("hidden-holdout-probe"),
          variants: [makeVariant("holdout-probe", "eval-holdout-regression")],
        },
        timeoutMs: 20000,
      });
      assert.strictEqual(deniedProtected.statusCode, 423, "protected lane without unlock must fail closed");

      const publicEval = await requestJson({
        port: harness.port,
        path: "/api/eval/run",
        method: "POST",
        headers: harness.authHeaders,
        body: {
          laneId: "public_regression",
          actor: "ci",
          suite: makeProbeSuite("public-probe"),
          variants: [makeVariant("public-probe", "eval-public-regression")],
        },
        timeoutMs: 120000,
      });
      assert.strictEqual(publicEval.statusCode, 200, "public eval lane must remain available");
      assert(publicEval.json && publicEval.json.ok === true, "public eval lane must return ok");
    });
  });

  await runCheck("public governance export overview carries plane and current-truth summaries", async () => {
    const outputDir = path.join(workspaceRoot, "runtime", "output-transient", `single_harness_export_${Date.now()}`);
    fs.rmSync(outputDir, { recursive: true, force: true });
    const exported = exportGovernancePublicBundle({ outputDir });
    assert.strictEqual(exported.overview.harnessIdentity.mode, "single_governed_harness", "export overview must expose single harness identity");
    assert.strictEqual(exported.overview.primaryRoutes.execution, "POST /api/exec", "export overview must expose execution route");
    assert.strictEqual(exported.overview.primaryRoutes.evaluation, "POST /api/eval/run", "export overview must expose evaluation route");
    assert.strictEqual(exported.overview.planes.governance.headlineSurface, "output/governance_public/worker_decision_surface.json", "export overview must expose governance headline surface");
    assert.strictEqual(exported.overview.currentTruthSurfaces.programReadinessSurface, "output/agi_readiness/goal_completion_status.json", "export overview must expose program readiness surface");
  });

  const failed = results.filter((entry) => !entry.ok);
  if (failed.length) {
    process.exitCode = 1;
    return;
  }
  console.log("PASS");
}

main().catch((error) => {
  console.error(`FAIL fatal :: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
