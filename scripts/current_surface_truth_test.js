#!/usr/bin/env node
"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");

const workspaceRoot = path.resolve(__dirname, "..");
const originalRequestUserInputPolicy = process.env.CODEX_REQUEST_USER_INPUT_POLICY;
delete process.env.CODEX_REQUEST_USER_INPUT_POLICY;
const server = require(path.join(workspaceRoot, "server.js"));
if (typeof originalRequestUserInputPolicy === "string") {
  process.env.CODEX_REQUEST_USER_INPUT_POLICY = originalRequestUserInputPolicy;
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function taskOutcomeStatus(summary) {
  const finalOutcome = summary && summary.finalOutcome && typeof summary.finalOutcome === "object"
    ? summary.finalOutcome
    : {};
  return String(finalOutcome.taskOutcomeStatus || finalOutcome.status || "UNKNOWN").toUpperCase();
}

function hasReviewLoadSummary(summary) {
  return (
    Number(summary && summary.totalStep4DurationMs || 0) > 0
    || Number(summary && summary.evidenceCollectionTimeMs || 0) > 0
    || Number(summary && summary.reviewerTimeMs || 0) > 0
    || Number(summary && summary.testerTimeMs || 0) > 0
    || Number(summary && summary.docSyncVerificationTimeMs || 0) > 0
    || Boolean(summary && summary.dominantBottleneck && summary.dominantBottleneck !== "none")
  );
}

function assertNonEmptyString(value, label) {
  assert.strictEqual(typeof value, "string", `${label} must be a string`);
  assert.ok(value.trim().length > 0, `${label} must not be empty`);
}

function main() {
  server.refreshCurrentLogSurface("current_surface_truth_test");

  const currentRoot = path.join(workspaceRoot, "logs", "current");
  const allowedFiles = [
    "design_conformance_summary.json",
    "latest_run_summary.json",
    "latest_signoff_summary.json",
    "operator_summary.json",
    "review_load_breakdown.json",
  ];
  const currentFiles = fs.readdirSync(currentRoot, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .sort();

  assert.deepStrictEqual(currentFiles, allowedFiles, "current surface must contain exactly the fixed five files");
  assert.ok(!fs.existsSync(path.join(currentRoot, "runtime_snapshot.json")), "runtime_snapshot.json must not exist in current");

  const operatorSummary = readJson(path.join(currentRoot, "operator_summary.json"));
  const designSummary = readJson(path.join(currentRoot, "design_conformance_summary.json"));
  const latestRunSummary = readJson(path.join(currentRoot, "latest_run_summary.json"));
  const reviewLoadSummary = readJson(path.join(currentRoot, "review_load_breakdown.json"));
  const latestSignoffSummary = readJson(path.join(currentRoot, "latest_signoff_summary.json"));
  const bundleSignoffSummary = readJson(path.join(workspaceRoot, latestSignoffSummary.bundleRef.summaryPath));
  const bundleRoot = path.join(workspaceRoot, latestSignoffSummary.bundleRef.bundlePath);
  const bundleSurfaceMap = readJson(path.join(bundleRoot, "bundle_surface_map.json"));
  const latestOverview = readJson(path.join(workspaceRoot, "output", "memory_public", "latest_overview.json"));
  const workerDecisionSurface = readJson(path.join(workspaceRoot, "output", "governance_public", "worker_decision_surface.json"));
  const workerCompletionStatus = readJson(path.join(workspaceRoot, "output", "governance_public", "worker_completion_status.json"));
  const goalCompletionStatus = readJson(path.join(workspaceRoot, "output", "agi_readiness", "goal_completion_status.json"));
  const openUnknownsRegister = readJson(path.join(workspaceRoot, "output", "agi_readiness", "open_unknowns_register.json"));

  const designConformanceStatus = String(designSummary.overallDesignConformance && designSummary.overallDesignConformance.status || "fail");
  const latestRunStatus = taskOutcomeStatus(latestRunSummary);
  const signoffStatus = latestSignoffSummary.allPassed ? "PASS" : "FAIL";
  const reviewLoadStatus = hasReviewLoadSummary(reviewLoadSummary) ? "REVIEW_SUMMARY_AVAILABLE" : "MISSING";
  const recommendedDecision = latestSignoffSummary.signoffReady && designConformanceStatus === "pass" && latestRunStatus === "COMPLETED"
    ? "SAFE_TO_SIGNOFF"
    : latestRunStatus === "UNKNOWN" || reviewLoadStatus === "MISSING"
      ? "CURRENT_TRUTH_INCOMPLETE"
      : latestRunStatus === "COMPLETED"
        ? "REVIEW_BEFORE_SIGNOFF"
        : "DO_NOT_SIGNOFF";

  assert.strictEqual(operatorSummary.designConformanceStatus, designConformanceStatus, "operator designConformanceStatus must match design summary");
  assert.strictEqual(operatorSummary.latestRunStatus, latestRunStatus, "operator latestRunStatus must match latest run summary");
  assert.strictEqual(operatorSummary.signoffStatus, signoffStatus, "operator signoffStatus must match latest signoff summary");
  assert.strictEqual(operatorSummary.reviewLoadStatus, reviewLoadStatus, "operator reviewLoadStatus must match review summary");
  assert.strictEqual(operatorSummary.topLineDecision, recommendedDecision, "operator topLineDecision must be derived from subordinate summaries");
  assert.strictEqual(operatorSummary.recommendedDecision, recommendedDecision, "operator recommendedDecision must align with subordinate summaries");
  assert.strictEqual(operatorSummary.postureSummary.requestUserInputPolicy, "auto-default", "operator posture summary must expose the live autonomy-first request-user-input policy");
  assert.strictEqual(operatorSummary.postureSummary.parentDispatchGuardMode, "enforce", "operator posture summary must expose the live parent dispatch guard mode");
  assert.strictEqual(operatorSummary.postureSummary.defaultExecAgent, "default", "operator posture summary must expose the live default exec agent");
  assert.strictEqual(typeof reviewLoadSummary.outcomeConversionTimeMs, "number", "review_load_breakdown.outcomeConversionTimeMs must be preserved");
  assert.ok(Array.isArray(reviewLoadSummary.requiredEvidenceFailures), "review_load_breakdown.requiredEvidenceFailures must be preserved");
  assert.ok(Array.isArray(reviewLoadSummary.reviewerFindingSummary), "review_load_breakdown.reviewerFindingSummary must be preserved");
  assert.ok(Array.isArray(reviewLoadSummary.testerResultSummary), "review_load_breakdown.testerResultSummary must be preserved");

  const designChecks = [
    "defaultExecAgentIsDefault",
    "runtimeRequestUserInputPolicyAutonomyFirst",
    "requestUserInputPolicyBlocked",
    "parentDispatchGuardEnforced",
    "retiredWorkerNotRoutable",
    "planningDepthSelectorWorking",
    "assuranceDepthSelectorWorking",
    "specialistDispatchObservedWhenImplementationOccurred",
    "reviewerObservedWhenRequired",
    "testerObservedWhenRequired",
    "taskOutcomeSemanticsValid",
    "docSyncEvidencePresentWhenRequired",
    "signoffCriteriaSatisfied",
  ];
  for (const key of designChecks) {
    const check = designSummary[key];
    assert.ok(check && typeof check === "object", `${key} must exist`);
    assert.strictEqual(check.status, "pass", `${key} must be pass for the current passing signoff bundle`);
    assertNonEmptyString(check.reason, `${key}.reason`);
    assertNonEmptyString(check.evidenceRef, `${key}.evidenceRef`);
  }
  assert.strictEqual(designSummary.overallDesignConformance.status, "pass", "overallDesignConformance must be pass");

  assertNonEmptyString(latestRunSummary.runId, "latest_run_summary.runId");
  assertNonEmptyString(latestRunSummary.threadId, "latest_run_summary.threadId");
  assertNonEmptyString(latestRunSummary.turnId, "latest_run_summary.turnId");
  assertNonEmptyString(latestRunSummary.selectedPlanningDepth, "latest_run_summary.selectedPlanningDepth");
  assertNonEmptyString(latestRunSummary.selectedAssuranceDepth, "latest_run_summary.selectedAssuranceDepth");
  assert.ok(latestRunSummary.finalOutcome && Object.keys(latestRunSummary.finalOutcome).length > 0, "latest_run_summary.finalOutcome must be populated");
  assert.ok(Array.isArray(latestRunSummary.usedAgents) && latestRunSummary.usedAgents.length > 0, "latest_run_summary.usedAgents must be populated");
  assert.ok(Number(latestRunSummary.dispatchCount) > 0, "latest_run_summary.dispatchCount must be populated");
  assert.ok(Number(latestRunSummary.dispatchSuccessCount) > 0, "latest_run_summary.dispatchSuccessCount must be populated");
  assertNonEmptyString(latestRunSummary.evidenceRefs.bundlePath, "latest_run_summary.evidenceRefs.bundlePath");
  assertNonEmptyString(latestRunSummary.evidenceRefs.signoffSummaryPath, "latest_run_summary.evidenceRefs.signoffSummaryPath");
  assertNonEmptyString(latestRunSummary.signoffRef.bundlePath, "latest_run_summary.signoffRef.bundlePath");
  assert.strictEqual(latestRunSummary.signoffRef.allPassed, true, "latest_run_summary.signoffRef.allPassed must be true");

  assert.strictEqual(latestSignoffSummary.allPassed, Boolean(bundleSignoffSummary.allPassed), "latest_signoff_summary allPassed must match bundle truth");
  assert.strictEqual(latestSignoffSummary.runtimePostureSafe, Boolean(bundleSignoffSummary.assertions && bundleSignoffSummary.assertions.runtimePostureSafe), "latest_signoff_summary runtimePostureSafe must match bundle truth");
  assert.strictEqual(latestSignoffSummary.coreHarnessWorkflowPassed, Boolean(bundleSignoffSummary.assertions && bundleSignoffSummary.assertions.coreHarnessWorkflowPassed), "latest_signoff_summary coreHarnessWorkflowPassed must match bundle truth");
  assert.strictEqual(latestSignoffSummary.naturalTaskTracePassed, Boolean(bundleSignoffSummary.assertions && bundleSignoffSummary.assertions.naturalTaskTracePassed), "latest_signoff_summary naturalTaskTracePassed must match bundle truth");
  assert.strictEqual(latestSignoffSummary.signoffReady, Boolean(bundleSignoffSummary.allPassed), "latest_signoff_summary signoffReady must match bundle truth");
  assert.strictEqual(workerDecisionSurface.scope, "worker_decision", "worker decision surface must expose worker_decision scope");
  assertNonEmptyString(workerDecisionSurface.exportSessionId, "worker_decision_surface.exportSessionId");
  assertNonEmptyString(workerDecisionSurface.topLevelOutcome, "worker_decision_surface.topLevelOutcome");
  assert.strictEqual(workerCompletionStatus.scope, "worker_completion", "worker completion companion must expose worker_completion scope");
  assert.strictEqual(workerCompletionStatus.exportSessionId, workerDecisionSurface.exportSessionId, "worker completion companion must share exportSessionId with the worker headline");
  assertNonEmptyString(workerCompletionStatus.workerGoalStatus, "worker_completion_status.workerGoalStatus");
  assert.strictEqual(workerCompletionStatus.backgroundArtifactSessionConsistency, "aligned", "worker completion companion must trust aligned background readiness artifacts in current truth");
  assert.strictEqual(Boolean(workerCompletionStatus.backgroundArtifactInputsTrusted), true, "worker completion companion must mark current-truth background artifacts as trusted");
  assert.ok(!Array.isArray(goalCompletionStatus.requiredNextActions) || !goalCompletionStatus.requiredNextActions.includes("worker completion companion diverges from the worker headline or its background readiness basis"), "goal completion current truth must not retain a stale worker-companion divergence blocker");
  assert.ok(!Array.isArray(openUnknownsRegister.items) || !openUnknownsRegister.items.some((entry) => String(entry && entry.summary) === "worker completion companion diverges from the worker headline or its background readiness basis"), "open unknowns current truth must not retain a stale worker-companion divergence blocker");
  assert.strictEqual(latestOverview.headlineScope, "worker_decision", "latest overview headline scope must be worker_decision");
  assert.strictEqual(latestOverview.workerCompletionStatusPath, "output/governance_public/worker_completion_status.json", "latest overview must point at the worker completion companion");
  assert.strictEqual(latestOverview.goalCompletion.scope, "program_readiness", "latest overview goal completion must expose program_readiness scope");
  assert.strictEqual(latestOverview.subjectiveCompletion.scope, "subjective_companion", "latest overview subjective completion must expose subjective_companion scope");
  assert.strictEqual(latestOverview.compatibilityCompletion.scope, "compatibility_layer", "latest overview compatibility completion must expose compatibility_layer scope");
  assert.strictEqual(latestOverview.workerDecisionSurface.exportSessionId, workerDecisionSurface.exportSessionId, "latest overview worker decision surface must share exportSessionId with the headline artifact");

  const allowedBundleTopLevel = [
    "bundle_surface_map.json",
    "conformance_report.json",
    "core_harness_workflow_run.json",
    "latest_run_summary.json",
    "natural_task_trace_summary.json",
    "operator_view_summary.json",
    "raw",
    "review_load_breakdown.json",
    "runtime_snapshot.json",
    "signoff_summary.json",
  ];
  const actualBundleTopLevel = fs.readdirSync(bundleRoot, { withFileTypes: true })
    .map((entry) => entry.name)
    .sort();
  assert.deepStrictEqual(actualBundleTopLevel, allowedBundleTopLevel, "signoff bundle top-level must contain only the fixed summary-first contract plus raw/");

  const expectedTopLevelSummaryEntries = [
    `${latestSignoffSummary.bundleRef.bundlePath}/signoff_summary.json`,
    `${latestSignoffSummary.bundleRef.bundlePath}/runtime_snapshot.json`,
    `${latestSignoffSummary.bundleRef.bundlePath}/core_harness_workflow_run.json`,
    `${latestSignoffSummary.bundleRef.bundlePath}/natural_task_trace_summary.json`,
    `${latestSignoffSummary.bundleRef.bundlePath}/latest_run_summary.json`,
    `${latestSignoffSummary.bundleRef.bundlePath}/review_load_breakdown.json`,
    `${latestSignoffSummary.bundleRef.bundlePath}/conformance_report.json`,
    `${latestSignoffSummary.bundleRef.bundlePath}/operator_view_summary.json`,
    `${latestSignoffSummary.bundleRef.bundlePath}/bundle_surface_map.json`,
  ];
  const expectedOpenFirstEntries = [
    ...expectedTopLevelSummaryEntries,
    `${latestSignoffSummary.bundleRef.bundlePath}/raw/relocated_top_level/lane_latency_summary.json`,
    `${latestSignoffSummary.bundleRef.bundlePath}/raw/relocated_top_level/signoff_resume_state.json`,
    `${latestSignoffSummary.bundleRef.bundlePath}/raw/relocated_top_level/baseline_comparison_report.json`,
    `${latestSignoffSummary.bundleRef.bundlePath}/raw/relocated_top_level/speed_vs_assurance_report.md`,
  ];
  assert.deepStrictEqual(bundleSurfaceMap.topLevelSummaries, expectedTopLevelSummaryEntries, "bundle_surface_map.topLevelSummaries must list the fixed bundle top-level summaries");
  assert.deepStrictEqual(bundleSurfaceMap.openFirst, expectedOpenFirstEntries, "bundle_surface_map.openFirst must list the fixed operator-facing signoff review set");

  const loggingSpec = fs.readFileSync(path.join(workspaceRoot, "docs", "HARNESS_LOGGING_SPEC.md"), "utf8");
  const loggingMap = fs.readFileSync(path.join(workspaceRoot, "docs", "HARNESS_LOGGING_MAP.md"), "utf8");
  const currentArchitecture = fs.readFileSync(path.join(workspaceRoot, "docs", "CURRENT_ARCHITECTURE.md"), "utf8");
  const docsText = [loggingSpec, loggingMap, currentArchitecture].join("\n");

  for (const fileName of allowedFiles) {
    assert.ok(docsText.includes(fileName), `docs must reference ${fileName}`);
  }
  for (const disallowed of [
    "logs/current/runtime_snapshot.json",
    "logs/current/conformance_report.json",
    "logs/current/operator_view_summary.json",
  ]) {
    assert.ok(!docsText.includes(disallowed), `docs must not present ${disallowed} as current truth`);
  }
  process.stdout.write("PASS current_surface_truth_test\n");
}

main();
