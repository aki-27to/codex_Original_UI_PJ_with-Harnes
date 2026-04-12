#!/usr/bin/env node
"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const {
  buildEvalRunGovernanceBundle,
  buildGovernanceRuntimeSurface,
  buildTurnGovernanceBundle,
} = require("./lib/governance_bundle");
const {
  assertExportableSignoffSummary,
  exportGovernancePublicBundle,
} = require("./lib/governance_public_bundle");
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
  loadWorkerDecisionSurfaceContract,
} = require("./lib/worker_decision_surface");
const {
  loadIterationControlContract,
} = require("./lib/iteration_control_policy");

const workspaceRoot = path.resolve(__dirname, "..");

function main() {
  const registry = loadAuthorityRegistry();
  const harnessPlaneContract = loadHarnessPlaneContract();
  const adoptionReadinessContract = loadAdoptionReadinessContract();
  const workerDecisionSurfaceContract = loadWorkerDecisionSurfaceContract();
  const iterationControlContract = loadIterationControlContract();

  const runtimeSurface = buildGovernanceRuntimeSurface({
    registry,
    authorityRegistryPath: "scripts/config/authority_registry.json",
    approvalPolicy: "on-request",
    sandboxMode: "workspace-write",
    autoCommitAndPush: false,
    iterationControlContract,
    iterationControlContractPath: "scripts/config/iteration_control_contract.json",
    adoptionReadinessContract,
    adoptionReadinessContractPath: "scripts/config/adoption_readiness_evaluator_contract.json",
    workerDecisionSurfaceContract,
    workerDecisionSurfaceContractPath: "scripts/config/worker_decision_surface_contract.json",
    harnessPlaneContract,
    harnessPlaneContractPath: "scripts/config/harness_plane_contract.json",
    summarizePathForOperationLog(value) {
      return String(value || "");
    },
  });
  assert.strictEqual(runtimeSurface.authorityModel.schema, "authority-registry.v1", "runtime surface must expose authority summary");
  assert.strictEqual(runtimeSurface.deploymentPosture.activeProfile, "portable_local", "runtime surface must resolve portable_local for reference-safe defaults");
  assert.strictEqual(runtimeSurface.iterationControlSummary.schema, "iteration-control-contract.v1", "runtime surface must expose iteration control summary");
  assert.strictEqual(runtimeSurface.adoptionReadinessSummary.schema, "adoption-readiness-evaluator-contract.v1", "runtime surface must expose adoption readiness summary");
  assert.strictEqual(runtimeSurface.workerDecisionSurfaceSummary.schema, "worker-decision-surface-contract.v1", "runtime surface must expose worker decision surface summary");
  assert.strictEqual(runtimeSurface.harnessPlaneSummary.schema, "single-harness-multi-plane-contract.v1", "runtime surface must expose harness plane summary");
  assert.strictEqual(runtimeSurface.harnessPlaneSummary.primaryRoutes.execution, "POST /api/exec", "runtime surface must expose execution primary route");
  assert.strictEqual(runtimeSurface.harnessPlaneSummary.primaryRoutes.evaluation, "POST /api/eval/run", "runtime surface must expose evaluation primary route");
  assert.strictEqual(runtimeSurface.harnessPlaneSummary.planes.governance.headlineSurface, "output/governance_public/worker_decision_surface.json", "runtime surface must expose governance headline surface");
  assert.strictEqual(Number(runtimeSurface.iterationControlSummary.qualityThresholds.task_contract_integrity), 0.92, "runtime surface must expose task-contract integrity threshold");
  assert(runtimeSurface.adoptionReadinessSummary.hardGates && runtimeSurface.adoptionReadinessSummary.hardGates.task_contract_integrity, "runtime surface must expose adoption hard gates");

  const evalBundle = buildEvalRunGovernanceBundle({
    suite: {
      suiteId: "test-suite",
      cases: [{ id: "case-1" }],
    },
    runs: [{
      cases: [{ id: "case-1", passed: true }],
    }],
    verifier: {
      verdict: "PASS",
      reason: "all_green",
    },
    comparison: {
      winner: "single",
      reason: "single_variant",
    },
    reportId: "eval-test-run",
    adoptionReadinessContract,
    iterationControlContract,
    buildReleaseDecision(input) {
      return {
        terminal_state: input.reviewBundle.recommended_release_state,
        finalOutcome: input.finalOutcome,
      };
    },
  });
  assert.strictEqual(evalBundle.iterationDecision.action, "RELEASE", "passing eval bundle should recommend release");
  assert.strictEqual(evalBundle.releaseDecision.terminal_state, "RELEASE_APPROVED", "release decision should track iteration release state");
  assert.strictEqual(evalBundle.escalationDecision.escalationRequired, 0, "release-ready eval bundle should not escalate");
  assert.strictEqual(evalBundle.workerDecisionSurface.topLevelOutcome, "ADOPTABLE_COMPLETE", "passing eval bundle should expose adoptable worker outcome");
  assert.strictEqual(evalBundle.workerDecisionSurface.scope, "worker_decision", "worker decision surface must expose worker_decision scope");

  const turnBundle = buildTurnGovernanceBundle({
    acceptanceResults: [{ id: "acc-1", status: "PASS" }],
    childEvidenceLedger: [],
    missingRequiredEvidence: [],
    currentTurnSummary: {
      finalOutcome: {
        taskOutcomeStatus: "COMPLETED",
        taskOutcomeReason: "completed_default",
      },
      residualRisks: [],
      assumptions: [],
    },
    clauseCompletionScorecard: {
      status: "PASS",
      clauses: [],
    },
    evidenceContractSpec: {
      requiredTurnArtifacts: ["review_bundle.json", "release_decision.json"],
    },
    iterationControlContract,
    adoptionReadinessContract,
    observedStepCount: 4,
    startedAt: Date.now() - 1000,
    now: Date.now(),
    threadId: "thread-test",
    finalStatus: "completed",
    taskOutcomeStatus: "COMPLETED",
    selection: {},
    requirementContract: {},
    dispatchPlan: {},
    buildReviewBundle(input) {
      return {
        schema: "review-bundle.v1",
        blockers: [],
        recommended_release_state: "",
        acceptanceCount: Array.isArray(input.acceptanceResults) ? input.acceptanceResults.length : 0,
      };
    },
    buildReleaseDecision(input) {
      return {
        terminal_state: input.reviewBundle.recommended_release_state,
        finalOutcome: input.finalOutcome,
      };
    },
    buildConformanceReport(input) {
      return {
        evidenceRefs: input.evidenceRefs,
        replayBundleRefs: input.replayBundleRefs,
      };
    },
  });
  assert.strictEqual(turnBundle.iterationDecision.action, "RELEASE", "passing turn bundle should recommend release");
  assert.strictEqual(turnBundle.reviewBundle.recommended_release_state, "RELEASE_APPROVED", "turn review bundle should carry release state");
  assert(turnBundle.reviewBundle.adoption_readiness, "turn bundle must embed adoption readiness into review bundle");
  assert(Number(turnBundle.adoptionReadinessEval.scores.task_contract_integrity) >= 0.92, "turn bundle must score task-contract integrity");
  assert(turnBundle.conformanceReport.evidenceRefs.includes("iteration_decision.json"), "turn conformance report must reference iteration decision artifact");
  assert.strictEqual(turnBundle.workerDecisionSurface.topLevelOutcome, "ADOPTABLE_COMPLETE", "passing turn bundle should expose adoptable worker outcome");

  const exportOutputDir = path.join(workspaceRoot, "runtime", "output-transient", "governance_public_test");
  fs.rmSync(exportOutputDir, { recursive: true, force: true });
  const publicExport = exportGovernancePublicBundle({
    outputDir: exportOutputDir,
  });
  for (const fileName of [
    "request_frame.json",
    "routing_decision.json",
    "task_outcomes.json",
    "review_bundle.json",
    "adoption_readiness_eval.json",
    "iteration_decision.json",
    "escalation_decision.json",
    "worker_decision_surface.json",
    "release_decision.json",
    "bundle_overview.json",
    "bundle_overview.md",
    "export_manifest.json",
  ]) {
    assert(fs.existsSync(path.join(exportOutputDir, fileName)), `public governance export must include ${fileName}`);
  }
  const exportedManifest = JSON.parse(fs.readFileSync(path.join(exportOutputDir, "export_manifest.json"), "utf8"));
  assert(
    exportedManifest.exportedArtifacts.some((entry) => entry.file === "adoption_readiness_eval.json" && entry.derived === 1),
    "public governance export must record derived adoption_readiness_eval.json"
  );
  const adoptionReadiness = JSON.parse(fs.readFileSync(path.join(exportOutputDir, "adoption_readiness_eval.json"), "utf8"));
  const iterationDecision = JSON.parse(fs.readFileSync(path.join(exportOutputDir, "iteration_decision.json"), "utf8"));
  const workerDecisionSurface = JSON.parse(fs.readFileSync(path.join(exportOutputDir, "worker_decision_surface.json"), "utf8"));
  assert.strictEqual(adoptionReadiness.schema, "adoption-readiness-eval.v1", "public export must emit adoption readiness eval");
  assert.strictEqual(adoptionReadiness.scope, "adoption_readiness", "public export must scope adoption readiness eval");
  assert.ok(String(iterationDecision.action || "").length > 0, "public export must emit iteration decision action");
  assert.strictEqual(iterationDecision.scope, "iteration_control", "public export must scope iteration decision");
  assert.strictEqual(workerDecisionSurface.schema, "worker-decision-surface.v1", "public export must emit worker decision surface");
  assert.strictEqual(workerDecisionSurface.scope, "worker_decision", "public export worker decision surface must expose worker_decision scope");
  assert.ok(String(workerDecisionSurface.exportSessionId || "").length > 0, "public export worker decision surface must expose exportSessionId");
  assert.strictEqual(adoptionReadiness.exportSessionId, workerDecisionSurface.exportSessionId, "derived governance artifacts must share exportSessionId");
  assert.strictEqual(iterationDecision.exportSessionId, workerDecisionSurface.exportSessionId, "derived governance artifacts must share exportSessionId");
  assert.strictEqual(workerDecisionSurface.topLevelOutcome, "ADOPTABLE_COMPLETE", "public export worker decision surface must summarize adoptable completion");
  assert.ok(String(workerDecisionSurface.topLevelSummary || "").length > 0, "public export worker decision surface must expose topLevelSummary");
  assert.strictEqual(publicExport.overview.workerDecision.scope, "worker_decision", "public overview must expose worker decision scope");
  assert.strictEqual(publicExport.overview.harnessIdentity.mode, "single_governed_harness", "public overview must expose single harness identity");
  assert.strictEqual(publicExport.overview.primaryRoutes.execution, "POST /api/exec", "public overview must expose execution route");
  assert.strictEqual(publicExport.overview.primaryRoutes.evaluation, "POST /api/eval/run", "public overview must expose evaluation route");
  assert.strictEqual(publicExport.overview.planes.governance.headlineSurface, "output/governance_public/worker_decision_surface.json", "public overview must expose governance headline surface");
  for (const fileName of fs.readdirSync(exportOutputDir)) {
    const extension = path.extname(fileName).toLowerCase();
    if (extension !== ".json" && extension !== ".md") {
      continue;
    }
    const text = fs.readFileSync(path.join(exportOutputDir, fileName), "utf8");
    assert(!text.includes(workspaceRoot), `public export must redact workspace-root absolute paths: ${fileName}`);
  }
  assert.strictEqual(
    publicExport.overview.finalDecision,
    "RELEASE_APPROVED",
    "public governance export must surface the signoff final decision"
  );

  assert.doesNotThrow(
    () => assertExportableSignoffSummary({
      allPassed: true,
      runtimePostureSafe: true,
      signoffReady: true,
      finalDecision: "RELEASE_APPROVED",
    }, path.join(workspaceRoot, "logs", "current", "latest_signoff_summary.json")),
    "signoff-ready summary must be exportable"
  );
  assert.throws(
    () => assertExportableSignoffSummary({
      allPassed: true,
      runtimePostureSafe: true,
      signoffReady: false,
      finalDecision: "RELEASE_APPROVED",
    }, path.join(workspaceRoot, "logs", "current", "latest_signoff_summary.json")),
    /signoffReady/,
    "public governance export must reject non-signoff-ready summaries"
  );
  assert.throws(
    () => assertExportableSignoffSummary({
      allPassed: true,
      runtimePostureSafe: true,
      signoffReady: true,
      finalDecision: "RELEASE_BLOCKED",
    }, path.join(workspaceRoot, "logs", "current", "latest_signoff_summary.json")),
    /finalDecision/,
    "public governance export must reject unapproved release decisions"
  );

  process.stdout.write("PASS governance_bundle_test\n");
}

main();
