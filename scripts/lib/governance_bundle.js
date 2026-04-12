"use strict";

const {
  buildAuthorityRuntimeSummary,
} = require("./authority_registry");
const {
  buildDeploymentPostureRuntimeSummary,
} = require("./deployment_posture_profile");
const {
  evaluateAdoptionReadiness,
  evaluateEvalRunAdoptionReadiness,
} = require("./adoption_readiness_policy");
const {
  buildEscalationDecision,
  buildIterationDecision,
} = require("./iteration_control_policy");
const {
  buildWorkerDecisionSurface,
  summarizeWorkerDecisionSurfaceContract,
} = require("./worker_decision_surface");
const {
  summarizeHarnessPlaneContract,
} = require("./harness_plane_contract");

function safeString(value, max = 240) {
  if (typeof value !== "string") {
    return "";
  }
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, max) : "";
}

function summarizePath(targetPath, summarizePathForOperationLog) {
  if (typeof summarizePathForOperationLog === "function") {
    return summarizePathForOperationLog(targetPath, 220);
  }
  return safeString(targetPath, 220);
}

function detectMissingEvidenceFromBlockers(blockers) {
  return (Array.isArray(blockers) ? blockers : [])
    .filter((entry) => /evidence/i.test(safeString(entry, 160)));
}

function deriveRecommendedReleaseState(iterationAction, existingState = "") {
  const normalizedAction = safeString(iterationAction, 80).toUpperCase();
  if (normalizedAction === "RELEASE") {
    return safeString(existingState, 80) || "RELEASE_APPROVED";
  }
  if (normalizedAction === "NEEDS_INPUT") {
    return "EXTERNAL_ACTION_REQUIRED";
  }
  return "RELEASE_BLOCKED";
}

function buildGovernanceRuntimeSurface({
  registry,
  authorityRegistryPath,
  approvalPolicy,
  sandboxMode,
  autoCommitAndPush,
  iterationControlContract,
  iterationControlContractPath,
  adoptionReadinessContract,
  adoptionReadinessContractPath,
  workerDecisionSurfaceContract,
  workerDecisionSurfaceContractPath,
  harnessPlaneContract,
  harnessPlaneContractPath,
  summarizePathForOperationLog,
} = {}) {
  const authorityModel = buildAuthorityRuntimeSummary({ registry });
  const deploymentPosture = buildDeploymentPostureRuntimeSummary({
    approvalPolicy,
    sandboxMode,
    autoCommitAndPush,
  });
  const iterationControlSummary = {
    schema: safeString(iterationControlContract && iterationControlContract.schema, 80) || "iteration-control-contract.v1",
    version: safeString(iterationControlContract && iterationControlContract.version, 80) || "",
    path: summarizePath(iterationControlContractPath, summarizePathForOperationLog),
    qualityThresholds: iterationControlContract && iterationControlContract.qualityThresholds ? iterationControlContract.qualityThresholds : {},
    improvementDeltaThreshold: Number.isFinite(Number(iterationControlContract && iterationControlContract.improvementDeltaThreshold))
      ? Number(iterationControlContract.improvementDeltaThreshold)
      : 0,
    budgets: iterationControlContract && iterationControlContract.budgets ? iterationControlContract.budgets : {},
    riskThresholds: iterationControlContract && iterationControlContract.riskThresholds ? iterationControlContract.riskThresholds : {},
    releaseConditions: Array.isArray(iterationControlContract && iterationControlContract.releaseConditions)
      ? iterationControlContract.releaseConditions
      : [],
    escalationConditions: Array.isArray(iterationControlContract && iterationControlContract.escalationConditions)
      ? iterationControlContract.escalationConditions
      : [],
    failClosedConditions: Array.isArray(iterationControlContract && iterationControlContract.failClosedConditions)
      ? iterationControlContract.failClosedConditions
      : [],
    validationFailureConditions: Array.isArray(iterationControlContract && iterationControlContract.validationFailureConditions)
      ? iterationControlContract.validationFailureConditions
      : [],
    retryConditions: Array.isArray(iterationControlContract && iterationControlContract.retryConditions)
      ? iterationControlContract.retryConditions
      : [],
    releaseState: "fail_closed",
  };
  const adoptionReadinessSummary = {
    schema: safeString(adoptionReadinessContract && adoptionReadinessContract.schema, 80) || "adoption-readiness-evaluator-contract.v1",
    version: safeString(adoptionReadinessContract && adoptionReadinessContract.version, 80) || "",
    path: summarizePath(adoptionReadinessContractPath, summarizePathForOperationLog),
    dimensions: Array.isArray(adoptionReadinessContract && adoptionReadinessContract.dimensions)
      ? adoptionReadinessContract.dimensions
      : [],
    dimensionCount: Array.isArray(adoptionReadinessContract && adoptionReadinessContract.dimensions)
      ? adoptionReadinessContract.dimensions.length
      : 0,
    hardGates: adoptionReadinessContract && adoptionReadinessContract.hardGates ? adoptionReadinessContract.hardGates : {},
    proceduralClosureRule: adoptionReadinessContract && adoptionReadinessContract.proceduralClosureRule
      ? adoptionReadinessContract.proceduralClosureRule
      : {},
  };
  const workerDecisionSurfaceSummary = {
    ...summarizeWorkerDecisionSurfaceContract(workerDecisionSurfaceContract),
    path: summarizePath(workerDecisionSurfaceContractPath, summarizePathForOperationLog),
  };
  const harnessPlaneSummary = {
    ...summarizeHarnessPlaneContract(harnessPlaneContract),
    path: summarizePath(harnessPlaneContractPath, summarizePathForOperationLog),
  };
  if (authorityRegistryPath) {
    authorityModel.registryPath = summarizePath(authorityRegistryPath, summarizePathForOperationLog);
  }
  return {
    authorityModel,
    deploymentPosture,
    iterationControlSummary,
    adoptionReadinessSummary,
    workerDecisionSurfaceSummary,
    harnessPlaneSummary,
  };
}

function buildEvalRunGovernanceBundle({
  suite,
  runs,
  verifier,
  comparison,
  reportId,
  adoptionReadinessContract,
  iterationControlContract,
  buildReleaseDecision,
} = {}) {
  const verifierVerdict = safeString(verifier && verifier.verdict, 80).toUpperCase();
  const finalOutcome = {
    taskOutcomeStatus: verifierVerdict === "PASS" ? "COMPLETED" : "FAILED_VALIDATION",
    taskOutcomeReason: safeString(verifier && verifier.reason, 160) || "independent_verifier",
  };
  const adoptionReadiness = evaluateEvalRunAdoptionReadiness({
    suite,
    runs,
    verifier,
    comparison,
  }, adoptionReadinessContract);
  const missingEvidence = detectMissingEvidenceFromBlockers(adoptionReadiness && adoptionReadiness.blockers);
  const iterationDecision = buildIterationDecision({
    evaluator: adoptionReadiness,
    finalOutcome,
    residualRisks: Array.isArray(adoptionReadiness && adoptionReadiness.residualRisks) ? adoptionReadiness.residualRisks : [],
    missingEvidence,
    stepCount: Array.isArray(suite && suite.cases) ? suite.cases.length : 0,
  }, iterationControlContract);
  const reviewBundle = {
    schema: "review-bundle.v1",
    recommended_release_state: deriveRecommendedReleaseState(iterationDecision.action),
    blockers: Array.isArray(adoptionReadiness && adoptionReadiness.blockers) ? adoptionReadiness.blockers : [],
  };
  const releaseDecision = buildReleaseDecision({
    finalOutcome: {
      taskOutcomeStatus: finalOutcome.taskOutcomeStatus,
      taskOutcomeReason: safeString(iterationDecision && iterationDecision.reason, 160) || "eval_iteration_decision",
    },
    reviewBundle,
    signoffRefs: ["verifier", "comparison"],
    replayBundleRefs: [safeString(reportId, 160)],
    residualRisks: Array.isArray(adoptionReadiness && adoptionReadiness.residualRisks) ? adoptionReadiness.residualRisks : [],
    assumptions: Array.isArray(adoptionReadiness && adoptionReadiness.assumptions) ? adoptionReadiness.assumptions : [],
    missingEvidence,
    clauseCompletionScorecard: {
      status: iterationDecision.action === "RELEASE" ? "PASS" : "FAIL",
      clauses: [],
    },
    rationaleNotes: [
      `adoption_readiness=${Number(adoptionReadiness && adoptionReadiness.scores && adoptionReadiness.scores.adoption_readiness || 0).toFixed(4)}`,
      `iteration_action=${safeString(iterationDecision && iterationDecision.action, 80) || "UNSET"}`,
    ],
  });
  const escalationDecision = buildEscalationDecision({
    contract: iterationControlContract,
    iterationDecision,
    finalOutcome: {
      taskOutcomeReason: safeString(iterationDecision && iterationDecision.reason, 160) || "eval_iteration_decision",
    },
  });
  const workerDecisionSurface = buildWorkerDecisionSurface({
    finalOutcome,
    adoptionReadinessEval: adoptionReadiness,
    iterationDecision,
    escalationDecision,
    releaseDecision,
    reviewBundle,
  });
  return {
    finalOutcome,
    adoptionReadiness,
    iterationDecision,
    reviewBundle,
    releaseDecision,
    escalationDecision,
    workerDecisionSurface,
  };
}

function buildTurnGovernanceBundle({
  acceptanceResults,
  childEvidenceLedger,
  missingRequiredEvidence,
  currentTurnSummary,
  clauseCompletionScorecard,
  evidenceContractSpec,
  iterationControlContract,
  adoptionReadinessContract,
  observedStepCount,
  startedAt,
  now,
  threadId,
  finalStatus,
  taskOutcomeStatus,
  selection,
  requirementContract,
  dispatchPlan,
  buildReviewBundle,
  buildReleaseDecision,
  buildConformanceReport,
} = {}) {
  const summary = currentTurnSummary && typeof currentTurnSummary === "object" ? currentTurnSummary : {};
  const finalOutcomeStatus = safeString(summary && summary.finalOutcome && summary.finalOutcome.taskOutcomeStatus, 80).toUpperCase();
  const reviewBundle = buildReviewBundle({
    acceptanceResults,
    childEvidenceLedger,
    requiredEvidenceFailures: missingRequiredEvidence,
    residualRisks: summary.residualRisks,
    assumptions: summary.assumptions,
    finalOutcome: summary.finalOutcome,
    clauseCompletionScorecard,
  });
  const adoptionIterationHint = {
    action: missingRequiredEvidence && missingRequiredEvidence.length
      ? "FAILED_VALIDATION"
      : finalOutcomeStatus === "BLOCKED"
        ? "BLOCKED"
        : finalOutcomeStatus === "FAILED_VALIDATION"
          ? "FAILED_VALIDATION"
          : safeString(clauseCompletionScorecard && clauseCompletionScorecard.status, 40).toUpperCase() === "PASS"
            ? "RELEASE"
            : safeString(reviewBundle && reviewBundle.recommended_release_state, 80).toUpperCase() === "EXTERNAL_ACTION_REQUIRED"
              ? "NEEDS_INPUT"
              : "RETRY",
    blockers: Array.isArray(reviewBundle && reviewBundle.blockers) ? reviewBundle.blockers : [],
  };
  const adoptionReadinessEval = evaluateAdoptionReadiness({
    acceptanceResults,
    reviewBundle,
    finalOutcome: summary.finalOutcome,
    clauseCompletionScorecard,
    residualRisks: summary.residualRisks,
    assumptions: summary.assumptions,
    requiredEvidenceFailures: missingRequiredEvidence,
    iterationDecision: adoptionIterationHint,
    evidenceRefs: ["evidence_manifest.json", "flow_trace_summary.json", "review_load_breakdown.json", "review_bundle.json"],
    expectedEvidenceRefCount: Array.isArray(evidenceContractSpec && evidenceContractSpec.requiredTurnArtifacts)
      ? evidenceContractSpec.requiredTurnArtifacts.length
      : 7,
    maxResidualRiskItems: iterationControlContract && iterationControlContract.riskThresholds && Number.isFinite(Number(iterationControlContract.riskThresholds.maxResidualRiskItems))
      ? Number(iterationControlContract.riskThresholds.maxResidualRiskItems)
      : 6,
  }, adoptionReadinessContract);
  const iterationDecision = buildIterationDecision({
    evaluator: adoptionReadinessEval,
    finalOutcome: summary.finalOutcome,
    residualRisks: summary.residualRisks,
    assumptions: summary.assumptions,
    requiredEvidenceFailures: missingRequiredEvidence,
    stepCount: Math.max(0, Number(observedStepCount) || 0),
    startedAt,
    now,
  }, iterationControlContract);
  const escalationDecision = buildEscalationDecision({
    contract: iterationControlContract,
    iterationDecision,
    finalOutcome: summary.finalOutcome,
  });
  reviewBundle.adoption_readiness = adoptionReadinessEval;
  reviewBundle.iteration_decision = iterationDecision;
  reviewBundle.recommended_release_state = deriveRecommendedReleaseState(
    iterationDecision.action,
    reviewBundle.recommended_release_state
  );
  const releaseDecision = buildReleaseDecision({
    finalOutcome: summary.finalOutcome,
    reviewBundle,
    signoffRefs: ["review_bundle.json", "flow_trace_summary.json", "review_load_breakdown.json"],
    replayBundleRefs: [safeString(threadId, 160)],
    residualRisks: summary.residualRisks,
    assumptions: summary.assumptions,
    missingEvidence: missingRequiredEvidence,
    clauseCompletionScorecard,
    rationaleNotes: [
      `turn_status=${safeString(finalStatus, 80) || "unknown"}`,
      `task_outcome_status=${safeString(taskOutcomeStatus, 80) || "unknown"}`,
      `adoption_readiness=${Number(adoptionReadinessEval && adoptionReadinessEval.scores && adoptionReadinessEval.scores.adoption_readiness || 0).toFixed(4)}`,
      `iteration_action=${safeString(iterationDecision && iterationDecision.action, 80) || "UNSET"}`,
    ],
  });
  const conformanceReport = buildConformanceReport({
    latestRunSummary: summary,
    selection: selection && typeof selection === "object" ? selection : {},
    requirementContract: requirementContract && typeof requirementContract === "object" ? requirementContract : {},
    dispatchPlan: dispatchPlan && typeof dispatchPlan === "object" ? dispatchPlan : {},
    childEvidenceLedger,
    acceptanceResults,
    requiredEvidenceFailures: missingRequiredEvidence,
    evidenceRefs: ["evidence_manifest.json", "flow_trace_summary.json", "review_load_breakdown.json", "adoption_readiness_eval.json", "iteration_decision.json", "release_decision.json"],
    replayBundleRefs: [safeString(threadId, 160)],
    rationaleNotes: [
      `turn_status=${safeString(finalStatus, 80) || "unknown"}`,
      `task_outcome_status=${safeString(taskOutcomeStatus, 80) || "unknown"}`,
    ],
  });
  const workerDecisionSurface = buildWorkerDecisionSurface({
    finalOutcome: summary.finalOutcome,
    adoptionReadinessEval,
    iterationDecision,
    escalationDecision,
    releaseDecision,
    reviewBundle,
  });
  return {
    reviewBundle,
    adoptionReadinessEval,
    iterationDecision,
    escalationDecision,
    releaseDecision,
    conformanceReport,
    workerDecisionSurface,
  };
}

module.exports = {
  buildGovernanceRuntimeSurface,
  buildEvalRunGovernanceBundle,
  buildTurnGovernanceBundle,
  deriveRecommendedReleaseState,
};
