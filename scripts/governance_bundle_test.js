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
  deriveSupplementalGovernanceArtifacts,
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
    "worker_completion_status.json",
    "reviewer_start_here.json",
    "reviewer_start_here.md",
    "release_candidate_scope.json",
    "release_candidate_scope.md",
    "release_resolution.json",
    "release_resolution.md",
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
  assert(
    exportedManifest.exportedArtifacts.some((entry) => entry.file === "worker_completion_status.json" && entry.derived === 1),
    "public governance export must record derived worker_completion_status.json"
  );
  assert(
    exportedManifest.exportedArtifacts.some((entry) => entry.file === "reviewer_start_here.json" && entry.derived === 1),
    "public governance export must record derived reviewer_start_here.json"
  );
  assert(
    exportedManifest.exportedArtifacts.some((entry) => entry.file === "release_candidate_scope.json" && entry.derived === 1),
    "public governance export must record derived release_candidate_scope.json"
  );
  assert(
    exportedManifest.exportedArtifacts.some((entry) => entry.file === "release_resolution.json" && entry.derived === 1),
    "public governance export must record derived release_resolution.json"
  );
  const adoptionReadiness = JSON.parse(fs.readFileSync(path.join(exportOutputDir, "adoption_readiness_eval.json"), "utf8"));
  const iterationDecision = JSON.parse(fs.readFileSync(path.join(exportOutputDir, "iteration_decision.json"), "utf8"));
  const workerDecisionSurface = JSON.parse(fs.readFileSync(path.join(exportOutputDir, "worker_decision_surface.json"), "utf8"));
  const workerCompletionStatus = JSON.parse(fs.readFileSync(path.join(exportOutputDir, "worker_completion_status.json"), "utf8"));
  const reviewerStartHere = JSON.parse(fs.readFileSync(path.join(exportOutputDir, "reviewer_start_here.json"), "utf8"));
  const releaseCandidateScope = JSON.parse(fs.readFileSync(path.join(exportOutputDir, "release_candidate_scope.json"), "utf8"));
  const releaseResolution = JSON.parse(fs.readFileSync(path.join(exportOutputDir, "release_resolution.json"), "utf8"));
  assert.strictEqual(adoptionReadiness.schema, "adoption-readiness-eval.v1", "public export must emit adoption readiness eval");
  assert.strictEqual(adoptionReadiness.scope, "adoption_readiness", "public export must scope adoption readiness eval");
  assert.ok(String(iterationDecision.action || "").length > 0, "public export must emit iteration decision action");
  assert.strictEqual(iterationDecision.scope, "iteration_control", "public export must scope iteration decision");
  assert.strictEqual(workerDecisionSurface.schema, "worker-decision-surface.v1", "public export must emit worker decision surface");
  assert.strictEqual(workerDecisionSurface.scope, "worker_decision", "public export worker decision surface must expose worker_decision scope");
  assert.strictEqual(workerCompletionStatus.schema, "worker-completion-status.v1", "public export must emit worker completion companion");
  assert.strictEqual(workerCompletionStatus.scope, "worker_completion", "public export worker completion companion must expose worker_completion scope");
  assert.ok(String(workerDecisionSurface.exportSessionId || "").length > 0, "public export worker decision surface must expose exportSessionId");
  assert.strictEqual(workerCompletionStatus.exportSessionId, workerDecisionSurface.exportSessionId, "worker completion companion must share the worker headline exportSessionId");
  assert.strictEqual(adoptionReadiness.exportSessionId, workerDecisionSurface.exportSessionId, "derived governance artifacts must share exportSessionId");
  assert.strictEqual(iterationDecision.exportSessionId, workerDecisionSurface.exportSessionId, "derived governance artifacts must share exportSessionId");
  assert.strictEqual(workerDecisionSurface.topLevelOutcome, "ADOPTABLE_COMPLETE", "public export worker decision surface must summarize adoptable completion");
  assert.ok(String(workerDecisionSurface.topLevelSummary || "").length > 0, "public export worker decision surface must expose topLevelSummary");
  assert.strictEqual(workerCompletionStatus.headlineArtifactPath, "output/governance_public/worker_decision_surface.json", "worker completion companion must point at the worker headline");
  assert.strictEqual(workerCompletionStatus.headlineWorkerOutcome, workerDecisionSurface.topLevelOutcome, "worker completion companion must mirror the worker headline outcome");
  assert.strictEqual(workerCompletionStatus.decisionMeaning, "worker_headline_stop_semantics_with_background_program_readiness_context", "worker completion companion must expose its decision meaning");
  assert.strictEqual(workerCompletionStatus.workerStopDecision.presentationRole, "primary_task_verdict", "worker completion companion must mark the worker stop verdict as primary");
  assert.strictEqual(workerCompletionStatus.backgroundProgramReadiness.presentationRole, "secondary_non_blocking_context", "worker completion companion must classify program readiness as secondary context");
  assert.strictEqual(workerCompletionStatus.backgroundProgramReadiness.doesNotOverrideWorkerVerdict, true, "worker completion companion must mark background readiness as non-overriding");
  assert.strictEqual(workerCompletionStatus.backgroundArtifactSessionConsistency, "aligned", "worker completion companion must only trust aligned readiness sidecars");
  assert.strictEqual(workerCompletionStatus.backgroundArtifactInputsTrusted, true, "worker completion companion must mark aligned readiness sidecars as trusted");
  assert.strictEqual(reviewerStartHere.schema, "governance-reviewer-start-here.v1", "public export must emit reviewer-start-here surface");
  assert.strictEqual(Array.isArray(reviewerStartHere.decisionFaces), true, "reviewer-start-here must expose decision faces");
  assert.strictEqual(reviewerStartHere.decisionFaces.length, 2, "reviewer-start-here must compress top-level verdicts into two faces");
  assert.strictEqual(reviewerStartHere.decisionFaces[0].id, "task_verdict", "reviewer-start-here must lead with task verdict");
  assert.strictEqual(reviewerStartHere.decisionFaces[1].id, "program_readiness", "reviewer-start-here must expose program readiness as the second face");
  assert.strictEqual(reviewerStartHere.decisionFaces[0].presentationRole, "primary_task_verdict", "reviewer-start-here must classify the task face as primary");
  assert.strictEqual(reviewerStartHere.decisionFaces[1].presentationRole, "secondary_non_blocking_context", "reviewer-start-here must classify the program face as secondary context");
  assert.strictEqual(reviewerStartHere.decisionFaces[1].doesNotOverrideWorkerVerdict, true, "reviewer-start-here must state that background program readiness does not override the task verdict");
  assert.strictEqual(reviewerStartHere.routeTruth.execution, "POST /api/exec", "reviewer-start-here must expose execution route truth");
  assert.strictEqual(reviewerStartHere.routeTruth.evaluation, "POST /api/eval/run", "reviewer-start-here must expose evaluation route truth");
  assert.strictEqual(reviewerStartHere.externalComparison.refreshCommand, "npm run reviewer:baseline-comparison", "reviewer-start-here must expose the explicit baseline comparison refresh command");
  assert.strictEqual(reviewerStartHere.externalComparison.reportArtifact, "raw/relocated_top_level/baseline_comparison_report.json", "reviewer-start-here must expose the canonical baseline comparison artifact location");
  assert.strictEqual(typeof reviewerStartHere.externalComparison.aggregate.harnessSuccessRate, "number", "reviewer-start-here must expose harness success rate aggregate");
  assert.strictEqual(typeof reviewerStartHere.externalComparison.aggregate.baselineExtraHitlCount, "number", "reviewer-start-here must expose baseline HITL aggregate");
  assert.strictEqual(releaseCandidateScope.schema, "release-candidate-scope.v1", "public export must emit release candidate scope");
  assert.strictEqual(releaseCandidateScope.status, "ready_for_ship_decision", "release candidate scope must mark ship-decision readiness");
  assert.strictEqual(
    releaseCandidateScope.verificationResult.latestBundleName,
    JSON.parse(fs.readFileSync(path.join(exportOutputDir, "latest_signoff_summary.json"), "utf8")).bundleRef.bundleName,
    "release candidate scope must track the selected signoff bundle"
  );
  assert.strictEqual(releaseResolution.schema, "release-resolution.v1", "public export must emit release resolution");
  assert.strictEqual(releaseResolution.approvedTarget.candidateId, "rc-2026-04-18-core-harness-governed-apps", "release resolution must point at the bounded candidate");
  assert.strictEqual(releaseResolution.notApprovedTarget.decision, "NOT_APPROVED", "release resolution must keep whole-worktree approval closed");
  assert.strictEqual(publicExport.overview.workerDecision.scope, "worker_decision", "public overview must expose worker decision scope");
  assert.strictEqual(publicExport.overview.workerCompletion.scope, "worker_completion", "public overview must expose worker completion scope");
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
  assert.strictEqual(publicExport.reviewerStartHere.schema, "governance-reviewer-start-here.v1", "public export return value must expose reviewer-start-here");
  assert.strictEqual(publicExport.exportManifest.exportedArtifacts.some((entry) => entry.file === "release_resolution.md"), true, "public export return value must include release resolution markdown");
  const mismatchedSupplemental = deriveSupplementalGovernanceArtifacts({
    requestFrame: { assumption_policy: [] },
    reviewBundle: {
      blockers: [],
      missing_evidence: [],
      residual_risk: [],
      recommended_release_state: "RELEASE_APPROVED_WITH_ASSUMPTIONS",
      acceptance_checks: [{ id: "acc-1", status: "PASS" }],
    },
    releaseDecision: {
      terminal_state: "RELEASE_APPROVED_WITH_ASSUMPTIONS",
      blocker_list: [],
    },
    latestRunSummary: {
      turnId: "turn-current",
      finalOutcome: {
        taskOutcomeStatus: "COMPLETED",
        taskOutcomeReason: "completed_default",
      },
    },
    latestSignoffSummary: {
      selectedTurnId: "turn-current",
      finalDecision: "RELEASE_APPROVED_WITH_ASSUMPTIONS",
      bundleRef: {},
    },
    taskOutcomes: {
      task_outcomes: [{ id: "step-1", status: "completed" }],
    },
    evidenceContract: {
      requiredTurnArtifacts: ["review_bundle.json"],
    },
    exportedEvidenceRefs: ["review_bundle.json"],
    adoptionReadinessContract,
    iterationControlContract,
    backgroundReadinessArtifacts: {
      goalCompletionStatus: { exportSessionId: "export_stale_goal", goalStatus: "NOT_YET" },
      subjectiveGoalCompletionStatus: { exportSessionId: "export_stale_subjective", subjectiveGoalStatus: "NOT_YET" },
      compatibilityCompletionStatus: { exportSessionId: "export_stale_compatibility", status: "NOT_YET" },
    },
  });
  assert.strictEqual(mismatchedSupplemental.worker_completion_status.backgroundArtifactSessionConsistency, "missing_or_mismatched", "worker completion companion must fail closed when background readiness sessions do not match");
  assert.strictEqual(mismatchedSupplemental.worker_completion_status.backgroundArtifactInputsTrusted, false, "worker completion companion must not trust mismatched readiness sidecars");
  assert.strictEqual(mismatchedSupplemental.worker_completion_status.programReadinessStatus, "UNKNOWN", "worker completion companion must not project stale program readiness across sessions");
  assert(Array.isArray(mismatchedSupplemental.worker_completion_status.backgroundProgramReadinessWhyNotYet) && mismatchedSupplemental.worker_completion_status.backgroundProgramReadinessWhyNotYet.length > 0, "worker completion companion must explain why stale background readiness sidecars were omitted");

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
