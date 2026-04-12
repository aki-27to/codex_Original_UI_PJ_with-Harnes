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
  loadAdoptionReadinessContract,
} = require("./lib/adoption_readiness_policy");
const {
  loadIterationControlContract,
} = require("./lib/iteration_control_policy");

const workspaceRoot = path.resolve(__dirname, "..");

function main() {
  const registry = loadAuthorityRegistry();
  const adoptionReadinessContract = loadAdoptionReadinessContract();
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
    summarizePathForOperationLog(value) {
      return String(value || "");
    },
  });
  assert.strictEqual(runtimeSurface.authorityModel.schema, "authority-registry.v1", "runtime surface must expose authority summary");
  assert.strictEqual(runtimeSurface.deploymentPosture.activeProfile, "portable_local", "runtime surface must resolve portable_local for reference-safe defaults");
  assert.strictEqual(runtimeSurface.iterationControlSummary.schema, "iteration-control-contract.v1", "runtime surface must expose iteration control summary");
  assert.strictEqual(runtimeSurface.adoptionReadinessSummary.schema, "adoption-readiness-evaluator-contract.v1", "runtime surface must expose adoption readiness summary");
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
  assert.strictEqual(adoptionReadiness.schema, "adoption-readiness-eval.v1", "public export must emit adoption readiness eval");
  assert.ok(String(iterationDecision.action || "").length > 0, "public export must emit iteration decision action");
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
