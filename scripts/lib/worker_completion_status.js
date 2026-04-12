"use strict";

const releaseApprovedStates = new Set([
  "RELEASE_APPROVED",
  "RELEASE_APPROVED_WITH_ASSUMPTIONS",
]);

function safeString(value, max = 320) {
  if (typeof value !== "string") {
    return "";
  }
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, max) : "";
}

function clampInt(value, min = 0, max = 999999, fallback = 0) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.max(min, Math.min(max, Math.round(parsed)));
}

function uniqueStrings(values, max = 16) {
  const out = [];
  for (const value of Array.isArray(values) ? values : []) {
    const text = safeString(value, 320);
    if (!text || out.includes(text)) {
      continue;
    }
    out.push(text);
    if (out.length >= max) {
      break;
    }
  }
  return out;
}

function booleanFromFlag(value, fallback = false) {
  if (typeof value === "boolean") {
    return value;
  }
  const numeric = Number(value);
  if (Number.isFinite(numeric)) {
    return numeric > 0;
  }
  return fallback;
}

function buildFailedCriteria({
  headlineWorkerOutcome,
  adoptionReady,
  latentIntentAligned,
  literalRequirementAligned,
  taskOutcomeCompleted,
  releaseApproved,
  minimalHitlSatisfied,
  constitutionalCompliance,
  boundaryCompliance,
}) {
  const checks = [
    { id: "headlineWorkerOutcome", passed: headlineWorkerOutcome === "ADOPTABLE_COMPLETE", detail: `headline worker outcome = ${headlineWorkerOutcome || "UNKNOWN"}` },
    { id: "adoptionReady", passed: adoptionReady, detail: `adoptionReady = ${String(adoptionReady)}` },
    { id: "latentIntentAligned", passed: latentIntentAligned, detail: `latentIntentAligned = ${String(latentIntentAligned)}` },
    { id: "literalRequirementAligned", passed: literalRequirementAligned, detail: `literalRequirementAligned = ${String(literalRequirementAligned)}` },
    { id: "taskOutcomeStatus", passed: taskOutcomeCompleted, detail: `taskOutcomeStatus completed = ${String(taskOutcomeCompleted)}` },
    { id: "releaseState", passed: releaseApproved, detail: `releaseState approved = ${String(releaseApproved)}` },
    { id: "minimalHitlSatisfied", passed: minimalHitlSatisfied, detail: `minimalHitlSatisfied = ${String(minimalHitlSatisfied)}` },
    { id: "constitutionalCompliance", passed: constitutionalCompliance, detail: `constitutionalCompliance = ${String(constitutionalCompliance)}` },
    { id: "boundaryCompliance", passed: boundaryCompliance, detail: `boundaryCompliance = ${String(boundaryCompliance)}` },
  ];
  return checks.filter((entry) => !entry.passed).map((entry) => ({ id: entry.id, detail: entry.detail }));
}

function buildWorkerCompletionStatus(input = {}) {
  const workerDecisionSurface = input.workerDecisionSurface && typeof input.workerDecisionSurface === "object"
    ? input.workerDecisionSurface
    : {};
  const rawGoalCompletionStatus = input.goalCompletionStatus && typeof input.goalCompletionStatus === "object"
    ? input.goalCompletionStatus
    : {};
  const rawSubjectiveGoalCompletionStatus = input.subjectiveGoalCompletionStatus && typeof input.subjectiveGoalCompletionStatus === "object"
    ? input.subjectiveGoalCompletionStatus
    : {};
  const rawCompatibilityCompletionStatus = input.compatibilityCompletionStatus && typeof input.compatibilityCompletionStatus === "object"
    ? input.compatibilityCompletionStatus
    : {};
  const targetExportSessionId = safeString(input.exportSessionId || workerDecisionSurface.exportSessionId, 120);
  const rawBackgroundArtifactSessionIds = [
    safeString(rawGoalCompletionStatus.exportSessionId, 120),
    safeString(rawSubjectiveGoalCompletionStatus.exportSessionId, 120),
    safeString(rawCompatibilityCompletionStatus.exportSessionId, 120),
  ];
  const backgroundArtifactSessionIds = uniqueStrings([
    ...(Array.isArray(input.backgroundArtifactSessionIds) ? input.backgroundArtifactSessionIds : []),
    ...rawBackgroundArtifactSessionIds,
  ], 8);
  const explicitBackgroundConsistency = safeString(input.backgroundArtifactSessionConsistency, 80);
  const completeBackgroundSessionSetPresent = Boolean(
    targetExportSessionId
    && rawBackgroundArtifactSessionIds.length === 3
    && rawBackgroundArtifactSessionIds.every((value) => value)
  );
  const backgroundArtifactSessionConsistency = explicitBackgroundConsistency
    || (
      completeBackgroundSessionSetPresent
      && rawBackgroundArtifactSessionIds.every((value) => value === targetExportSessionId)
        ? "aligned"
        : backgroundArtifactSessionIds.length > 0
          ? "missing_or_mismatched"
          : "missing_or_mismatched"
    );
  const backgroundArtifactInputsTrusted = typeof input.backgroundArtifactInputsTrusted === "boolean"
    ? input.backgroundArtifactInputsTrusted
    : backgroundArtifactSessionConsistency === "aligned";
  const goalCompletionStatus = backgroundArtifactInputsTrusted ? rawGoalCompletionStatus : {};
  const subjectiveGoalCompletionStatus = backgroundArtifactInputsTrusted ? rawSubjectiveGoalCompletionStatus : {};
  const compatibilityCompletionStatus = backgroundArtifactInputsTrusted ? rawCompatibilityCompletionStatus : {};
  const runningAgendaDecisionBasis = goalCompletionStatus.runningAgendaDecisionBasis && typeof goalCompletionStatus.runningAgendaDecisionBasis === "object"
    ? goalCompletionStatus.runningAgendaDecisionBasis
    : subjectiveGoalCompletionStatus.runningAgendaDecisionBasis && typeof subjectiveGoalCompletionStatus.runningAgendaDecisionBasis === "object"
      ? subjectiveGoalCompletionStatus.runningAgendaDecisionBasis
      : {};
  const intentComparison = workerDecisionSurface.intentTrace
    && workerDecisionSurface.intentTrace.goalComparison
    && typeof workerDecisionSurface.intentTrace.goalComparison === "object"
      ? workerDecisionSurface.intentTrace.goalComparison
      : {};
  const minimalHitl = workerDecisionSurface.minimalHitl && typeof workerDecisionSurface.minimalHitl === "object"
    ? workerDecisionSurface.minimalHitl
    : {};

  const headlineWorkerOutcome = safeString(workerDecisionSurface.topLevelOutcome, 80).toUpperCase();
  const headlineWorkerComplete = headlineWorkerOutcome === "ADOPTABLE_COMPLETE";
  const taskOutcomeStatus = safeString(workerDecisionSurface.taskOutcomeStatus, 80).toUpperCase();
  const releaseState = safeString(workerDecisionSurface.releaseState, 80).toUpperCase();
  const adoptionReady = workerDecisionSurface.adoptionReady === undefined
    ? headlineWorkerComplete
    : booleanFromFlag(workerDecisionSurface.adoptionReady);
  const latentIntentAligned = intentComparison.latentIntentAligned === undefined
    ? headlineWorkerComplete
    : booleanFromFlag(intentComparison.latentIntentAligned);
  const literalRequirementAligned = intentComparison.originalRequestAligned === undefined
    ? headlineWorkerComplete
    : booleanFromFlag(intentComparison.originalRequestAligned);
  const taskOutcomeCompleted = taskOutcomeStatus
    ? taskOutcomeStatus === "COMPLETED"
    : headlineWorkerComplete;
  const releaseApproved = releaseState
    ? releaseApprovedStates.has(releaseState)
    : headlineWorkerComplete;
  const minimalHitlSatisfied = (
    minimalHitl.humanInterruptionRequired === undefined
    || minimalHitl.explicitUserJudgmentRequired === undefined
  )
    ? headlineWorkerComplete
    : (
      clampInt(minimalHitl.humanInterruptionRequired, 0, 1, 1) === 0
      && clampInt(minimalHitl.explicitUserJudgmentRequired, 0, 1, 1) === 0
    );
  const constitutionalCompliance = workerDecisionSurface.constitutionalCompliance === undefined
    ? headlineWorkerComplete
    : booleanFromFlag(workerDecisionSurface.constitutionalCompliance);
  const boundaryCompliance = workerDecisionSurface.boundaryCompliance === undefined
    ? headlineWorkerComplete
    : booleanFromFlag(workerDecisionSurface.boundaryCompliance);

  const gateRunningAgendaCount = clampInt(
    runningAgendaDecisionBasis.gateRunningAgendaCount,
    0,
    999999,
    clampInt(goalCompletionStatus.currentValues && goalCompletionStatus.currentValues.runningAgendaCount, 0, 999999, 0)
  );
  const gateBlockedAgendaCount = clampInt(
    runningAgendaDecisionBasis.gateBlockedAgendaCount,
    0,
    999999,
    clampInt(subjectiveGoalCompletionStatus.subjectiveCurrentValues && subjectiveGoalCompletionStatus.subjectiveCurrentValues.blockedAgendaCount, 0, 999999, 0)
  );
  const gateInsufficientEvidenceCount = clampInt(
    runningAgendaDecisionBasis.gateInsufficientEvidenceCount,
    0,
    999999,
    0
  );
  const supportingCurrentRunningCount = clampInt(runningAgendaDecisionBasis.supportingCurrentRunningCount, 0, 999999, gateRunningAgendaCount);
  const supportingCurrentBlockedCount = clampInt(runningAgendaDecisionBasis.supportingCurrentBlockedCount, 0, 999999, gateBlockedAgendaCount);
  const supportingCurrentInsufficientEvidenceCount = clampInt(runningAgendaDecisionBasis.supportingCurrentInsufficientEvidenceCount, 0, 999999, gateInsufficientEvidenceCount);
  const excludedMetaCompletionRunningCount = clampInt(runningAgendaDecisionBasis.excludedMetaCompletionRunningCount, 0, 999999, 0);
  const excludedMetaCompletionBlockedCount = clampInt(runningAgendaDecisionBasis.excludedMetaCompletionBlockedCount, 0, 999999, 0);
  const excludedMetaCompletionInsufficientEvidenceCount = clampInt(runningAgendaDecisionBasis.excludedMetaCompletionInsufficientEvidenceCount, 0, 999999, 0);
  const activeLearningDebtOpen = (
    supportingCurrentRunningCount > 0
    || supportingCurrentBlockedCount > 0
    || supportingCurrentInsufficientEvidenceCount > 0
  );

  const failedCriteria = buildFailedCriteria({
    headlineWorkerOutcome,
    adoptionReady,
    latentIntentAligned,
    literalRequirementAligned,
    taskOutcomeCompleted,
    releaseApproved,
    minimalHitlSatisfied,
    constitutionalCompliance,
    boundaryCompliance,
  });
  const workerGoalStatus = headlineWorkerComplete ? "WORKER_COMPLETE" : "NOT_YET";
  const whyNotYet = workerGoalStatus === "WORKER_COMPLETE"
    ? []
    : failedCriteria.map((entry) => safeString(entry.detail, 220));

  return {
    schema: "worker-completion-status.v1",
    generatedAt: new Date().toISOString(),
    exportSessionId: targetExportSessionId,
    scope: "worker_completion",
    workerGoalStatus,
    decisionQuestion: "Can the governed autonomous worker stop here and hand back an adoptable artifact without unnecessary human interruption?",
    decisionMeaning: "worker_headline_stop_semantics_with_background_program_readiness_context",
    headlineArtifactPath: safeString(input.headlineArtifactPath, 220) || "output/governance_public/worker_decision_surface.json",
    headlineWorkerOutcome,
    taskOutcomeStatus,
    releaseState,
    adoptionReady,
    latentIntentAligned,
    literalRequirementAligned,
    minimalHitlSatisfied,
    constitutionalCompliance,
    boundaryCompliance,
    gateRunningAgendaCount,
    gateBlockedAgendaCount,
    gateInsufficientEvidenceCount,
    supportingCurrentRunningCount,
    supportingCurrentBlockedCount,
    supportingCurrentInsufficientEvidenceCount,
    excludedMetaCompletionRunningCount,
    excludedMetaCompletionBlockedCount,
    excludedMetaCompletionInsufficientEvidenceCount,
    activeLearningDebtDecisionBasis: {
      mode: "supporting_non_memory_eval_open_counts_with_gate_subset_explicit",
      sourceArtifactPath: "output/agi_readiness/autonomous_learning_status.json",
      gateOpenFields: [
        "gateRunningAgendaCount",
        "gateBlockedAgendaCount",
        "gateInsufficientEvidenceCount",
      ],
      supportingOpenFields: [
        "supportingCurrentRunningCount",
        "supportingCurrentBlockedCount",
        "supportingCurrentInsufficientEvidenceCount",
      ],
      backgroundArtifactSessionConsistency,
      backgroundArtifactInputsTrusted,
    },
    activeLearningDebtOpen,
    activeLearningDebtBlocksWorkerStop: false,
    backgroundArtifactSessionConsistency,
    backgroundArtifactSessionIds,
    backgroundArtifactInputsTrusted,
    programReadinessStatus: safeString(goalCompletionStatus.goalStatus, 80) || "UNKNOWN",
    subjectiveCompanionStatus: safeString(subjectiveGoalCompletionStatus.subjectiveGoalStatus, 80) || "UNKNOWN",
    compatibilityStatus: safeString(compatibilityCompletionStatus.status, 80) || "UNKNOWN",
    programReadinessBlockingWorkerStop: false,
    supportingArtifacts: uniqueStrings([
      safeString(input.headlineArtifactPath, 220) || "output/governance_public/worker_decision_surface.json",
      "output/agi_readiness/goal_completion_status.json",
      "output/agi_readiness/subjective_goal_completion_status.json",
      "output/agi_readiness/compatibility_completion_status.json",
      "output/agi_readiness/autonomous_learning_status.json",
      "output/agi_readiness/self_directed_probe_status.json",
      "output/agi_readiness/novel_task_acquisition.json",
      ...(Array.isArray(input.supportingArtifacts) ? input.supportingArtifacts : []),
    ], 16),
    failedCriteria,
    whyNotYet,
    backgroundProgramReadinessWhyNotYet: backgroundArtifactInputsTrusted
      ? uniqueStrings(goalCompletionStatus.whyNotYet, 12)
      : [
        "background program-readiness artifacts were omitted because their export session was missing or mismatched"
      ],
  };
}

module.exports = {
  buildWorkerCompletionStatus,
};
