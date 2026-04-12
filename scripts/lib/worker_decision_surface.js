"use strict";

const fs = require("fs");
const path = require("path");

const workspaceRoot = path.resolve(__dirname, "..", "..");
const defaultWorkerDecisionSurfaceContractPath = path.join(
  workspaceRoot,
  "scripts",
  "config",
  "worker_decision_surface_contract.json"
);

const defaultWorkerDecisionSurfaceContractDefinition = Object.freeze({
  schema: "worker-decision-surface-contract.v1",
  version: "2026-04-12.r1",
  artifactSchema: "worker-decision-surface.v1",
  defaultScope: "worker_decision",
  decisionQuestion: "Can the governed worker stop here without unnecessary human interruption?",
  topLevelOutcomes: Object.freeze([
    "ADOPTABLE_COMPLETE",
    "AUTONOMOUS_RETRY",
    "NEEDS_USER_JUDGMENT",
    "EXTERNALLY_BLOCKED",
    "FAILED_VALIDATION",
  ]),
  minimalHitlModes: Object.freeze([
    "close_in_place",
    "continue_autonomously",
    "user_judgment_required",
    "external_blocker",
    "fail_closed",
  ]),
  releaseApprovedStates: Object.freeze([
    "RELEASE_APPROVED",
    "RELEASE_APPROVED_WITH_ASSUMPTIONS",
  ]),
  adoptionReadinessThreshold: 0.8,
  requiredFields: Object.freeze([
    "scope",
    "exportSessionId",
    "topLevelOutcome",
    "topLevelSummary",
    "taskOutcomeStatus",
    "releaseState",
    "adoptionReadiness",
    "latentIntentAlignment",
    "minimalHitl",
    "operatorAction",
    "evidenceSummary",
  ]),
});

function safeString(value, max = 240) {
  if (typeof value !== "string") {
    return "";
  }
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, max) : "";
}

function clamp01(value, fallback = 0) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.max(0, Math.min(1, parsed));
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

function normalizeUpperList(values, fallback) {
  const source = Array.isArray(values) ? values : fallback;
  const out = [];
  for (const value of source) {
    const normalized = safeString(value, 120).toUpperCase();
    if (!normalized || out.includes(normalized)) {
      continue;
    }
    out.push(normalized);
  }
  return Object.freeze(out.length ? out : fallback.slice());
}

function normalizeLowerList(values, fallback) {
  const source = Array.isArray(values) ? values : fallback;
  const out = [];
  for (const value of source) {
    const normalized = safeString(value, 120).toLowerCase();
    if (!normalized || out.includes(normalized)) {
      continue;
    }
    out.push(normalized);
  }
  return Object.freeze(out.length ? out : fallback.slice());
}

function normalizeContract(input) {
  const payload = input && typeof input === "object" ? input : {};
  return Object.freeze({
    schema: safeString(payload.schema, 120) || defaultWorkerDecisionSurfaceContractDefinition.schema,
    version: safeString(payload.version, 120) || defaultWorkerDecisionSurfaceContractDefinition.version,
    artifactSchema: safeString(payload.artifactSchema, 120) || defaultWorkerDecisionSurfaceContractDefinition.artifactSchema,
    defaultScope: safeString(payload.defaultScope, 120) || defaultWorkerDecisionSurfaceContractDefinition.defaultScope,
    decisionQuestion: safeString(payload.decisionQuestion, 200) || defaultWorkerDecisionSurfaceContractDefinition.decisionQuestion,
    topLevelOutcomes: normalizeUpperList(
      payload.topLevelOutcomes,
      defaultWorkerDecisionSurfaceContractDefinition.topLevelOutcomes
    ),
    minimalHitlModes: normalizeLowerList(
      payload.minimalHitlModes,
      defaultWorkerDecisionSurfaceContractDefinition.minimalHitlModes
    ),
    releaseApprovedStates: normalizeUpperList(
      payload.releaseApprovedStates,
      defaultWorkerDecisionSurfaceContractDefinition.releaseApprovedStates
    ),
    adoptionReadinessThreshold: clamp01(
      payload.adoptionReadinessThreshold,
      defaultWorkerDecisionSurfaceContractDefinition.adoptionReadinessThreshold
    ),
    requiredFields: Object.freeze(
      Array.isArray(payload.requiredFields)
        ? payload.requiredFields.map((entry) => safeString(entry, 120)).filter(Boolean).slice(0, 24)
        : defaultWorkerDecisionSurfaceContractDefinition.requiredFields.slice()
    ),
  });
}

function loadWorkerDecisionSurfaceContract(filePath = defaultWorkerDecisionSurfaceContractPath) {
  const raw = fs.readFileSync(path.resolve(filePath), "utf8");
  return normalizeContract(raw ? JSON.parse(raw) : {});
}

function summarizeWorkerDecisionSurfaceContract(contract) {
  const normalized = normalizeContract(contract);
  return {
    schema: normalized.schema,
    version: normalized.version,
    artifactSchema: normalized.artifactSchema,
    defaultScope: normalized.defaultScope,
    decisionQuestion: normalized.decisionQuestion,
    topLevelOutcomes: normalized.topLevelOutcomes.slice(),
    minimalHitlModes: normalized.minimalHitlModes.slice(),
    releaseApprovedStates: normalized.releaseApprovedStates.slice(),
    adoptionReadinessThreshold: Number(normalized.adoptionReadinessThreshold.toFixed(4)),
    requiredFields: normalized.requiredFields.slice(),
  };
}

function buildSummary({
  topLevelOutcome,
  releaseApproved,
  minimalHitlMode,
  humanInterruptionRequired,
}) {
  if (topLevelOutcome === "ADOPTABLE_COMPLETE") {
    return "The worker can close in place: adoption readiness passed, latent intent stayed aligned, and no extra human interruption is required.";
  }
  if (topLevelOutcome === "NEEDS_USER_JUDGMENT") {
    return "The worker cannot close in place: explicit user judgment is required before adoption.";
  }
  if (topLevelOutcome === "EXTERNALLY_BLOCKED") {
    return "The worker cannot complete autonomously: an external blocker remains.";
  }
  if (topLevelOutcome === "FAILED_VALIDATION") {
    return "The worker must fail closed: validation or contract integrity gates did not pass.";
  }
  if (!releaseApproved && minimalHitlMode === "continue_autonomously" && !humanInterruptionRequired) {
    return "The worker should continue autonomously: value remains before adoption-ready completion.";
  }
  return "The worker is not yet adoption-ready and should not claim completion.";
}

function buildWorkerDecisionSurface(input = {}, contract = loadWorkerDecisionSurfaceContract()) {
  const normalizedContract = normalizeContract(contract);
  const finalOutcome = input.finalOutcome && typeof input.finalOutcome === "object" ? input.finalOutcome : {};
  const adoptionReadinessEval = input.adoptionReadinessEval && typeof input.adoptionReadinessEval === "object"
    ? input.adoptionReadinessEval
    : {};
  const iterationDecision = input.iterationDecision && typeof input.iterationDecision === "object" ? input.iterationDecision : {};
  const escalationDecision = input.escalationDecision && typeof input.escalationDecision === "object" ? input.escalationDecision : {};
  const releaseDecision = input.releaseDecision && typeof input.releaseDecision === "object" ? input.releaseDecision : {};
  const reviewBundle = input.reviewBundle && typeof input.reviewBundle === "object" ? input.reviewBundle : {};
  const requestFrame = input.requestFrame && typeof input.requestFrame === "object" ? input.requestFrame : {};
  const taskOutcomes = input.taskOutcomes && typeof input.taskOutcomes === "object" ? input.taskOutcomes : {};
  const scores = adoptionReadinessEval.scores && typeof adoptionReadinessEval.scores === "object"
    ? adoptionReadinessEval.scores
    : {};
  const taskOutcomeStatus = safeString(finalOutcome.taskOutcomeStatus, 80).toUpperCase();
  const taskOutcomeReason = safeString(finalOutcome.taskOutcomeReason, 160).toLowerCase();
  const iterationAction = safeString(iterationDecision.action, 80).toUpperCase();
  const releaseState = safeString(releaseDecision.terminal_state || reviewBundle.recommended_release_state, 80).toUpperCase();
  const releaseApproved = normalizedContract.releaseApprovedStates.includes(releaseState);
  const adoptionReadiness = clamp01(scores.adoption_readiness, 0);
  const literalAlignment = clamp01(scores.literal_requirement_alignment, 0);
  const latentIntentAlignment = clamp01(scores.latent_intent_alignment, 0);
  const taskContractIntegrity = clamp01(scores.task_contract_integrity, 0);
  const boundaryCompliance = clamp01(scores.boundary_compliance, 0);
  const blockers = uniqueStrings([
    ...(Array.isArray(adoptionReadinessEval.blockers) ? adoptionReadinessEval.blockers : []),
    ...(Array.isArray(iterationDecision.blockers) ? iterationDecision.blockers : []),
    ...(Array.isArray(releaseDecision.blocker_list) ? releaseDecision.blocker_list : []),
  ], 16);
  const residualRisks = uniqueStrings([
    ...(Array.isArray(adoptionReadinessEval.residualRisks) ? adoptionReadinessEval.residualRisks : []),
    ...(Array.isArray(iterationDecision.residualRisks) ? iterationDecision.residualRisks : []),
  ], 16);
  const assumptions = uniqueStrings([
    ...(Array.isArray(adoptionReadinessEval.assumptions) ? adoptionReadinessEval.assumptions : []),
    ...(Array.isArray(iterationDecision.assumptions) ? iterationDecision.assumptions : []),
  ], 12);
  const criticalFailures = uniqueStrings(adoptionReadinessEval.criticalFailures, 12);
  const evidenceRefs = uniqueStrings([
    ...(Array.isArray(input.evidenceRefs) ? input.evidenceRefs : []),
    ...(Array.isArray(adoptionReadinessEval.evidenceRefs) ? adoptionReadinessEval.evidenceRefs : []),
  ], 24);
  const supportingArtifacts = uniqueStrings([
    ...(Array.isArray(input.supportingArtifacts) ? input.supportingArtifacts : []),
    ...(Array.isArray(input.evidenceRefs) ? input.evidenceRefs : []),
    ...(Array.isArray(adoptionReadinessEval.supportingArtifacts) ? adoptionReadinessEval.supportingArtifacts : []),
  ], 24);
  const exportSessionId = safeString(input.exportSessionId, 120);
  const explicitUserJudgmentRequired = Boolean(
    escalationDecision.escalationRequired
    && (iterationAction === "NEEDS_INPUT" || releaseState === "EXTERNAL_ACTION_REQUIRED")
  );
  let topLevelOutcome = "AUTONOMOUS_RETRY";
  let minimalHitlMode = "continue_autonomously";
  let operatorAction = "CONTINUE_AUTONOMOUSLY";
  if (iterationAction === "RELEASE" && releaseApproved && taskOutcomeStatus === "COMPLETED") {
    topLevelOutcome = "ADOPTABLE_COMPLETE";
    minimalHitlMode = "close_in_place";
    operatorAction = "ADOPT";
  } else if (explicitUserJudgmentRequired || releaseState === "EXTERNAL_ACTION_REQUIRED" || iterationAction === "NEEDS_INPUT") {
    topLevelOutcome = "NEEDS_USER_JUDGMENT";
    minimalHitlMode = "user_judgment_required";
    operatorAction = "ASK_USER";
  } else if (taskOutcomeStatus === "BLOCKED" || iterationAction === "BLOCKED") {
    topLevelOutcome = "EXTERNALLY_BLOCKED";
    minimalHitlMode = "external_blocker";
    operatorAction = "UNBLOCK_EXTERNALLY";
  } else if (taskOutcomeStatus === "FAILED_VALIDATION" || iterationAction === "FAILED_VALIDATION" || criticalFailures.length) {
    topLevelOutcome = "FAILED_VALIDATION";
    minimalHitlMode = "fail_closed";
    operatorAction = "REMEDIATE";
  }
  const humanInterruptionRequired = topLevelOutcome === "NEEDS_USER_JUDGMENT" || topLevelOutcome === "EXTERNALLY_BLOCKED" ? 1 : 0;
  const taskOutcomeEntries = Array.isArray(taskOutcomes.task_outcomes) ? taskOutcomes.task_outcomes : [];
  const valueThesis = safeString(
    requestFrame.userValueFrame && requestFrame.userValueFrame.valueThesis,
    280
  );
  return {
    schema: normalizedContract.artifactSchema,
    generatedAt: new Date().toISOString(),
    scope: normalizedContract.defaultScope,
    exportSessionId,
    decisionQuestion: normalizedContract.decisionQuestion,
    topLevelOutcome,
    topLevelSummary: buildSummary({
      topLevelOutcome,
      releaseApproved,
      minimalHitlMode,
      humanInterruptionRequired,
    }),
    taskOutcomeStatus: taskOutcomeStatus || "BLOCKED",
    taskOutcomeReason: taskOutcomeReason || "unknown",
    releaseState: releaseState || "RELEASE_BLOCKED",
    releaseApproved: releaseApproved ? 1 : 0,
    adoptionReady: adoptionReadiness >= normalizedContract.adoptionReadinessThreshold && releaseApproved ? 1 : 0,
    adoptionReadiness,
    adoptionReadinessThreshold: Number(normalizedContract.adoptionReadinessThreshold.toFixed(4)),
    latentIntentAlignment,
    literalRequirementAlignment: literalAlignment,
    taskContractIntegrity,
    boundaryCompliance,
    constitutionalCompliance: boundaryCompliance,
    minimalHitl: {
      mode: minimalHitlMode,
      humanInterruptionRequired,
      explicitUserJudgmentRequired: explicitUserJudgmentRequired ? 1 : 0,
    },
    operatorAction,
    supportingArtifacts,
    evidenceSummary: {
      evidenceRefCount: evidenceRefs.length,
      supportingArtifactCount: supportingArtifacts.length,
      blockerCount: blockers.length,
      residualRiskCount: residualRisks.length,
      assumptionCount: assumptions.length,
      taskOutcomeCount: taskOutcomeEntries.length,
    },
    blockers,
    residualRisks,
    assumptions,
    intentTrace: {
      valueThesis,
      goalComparison: adoptionReadinessEval.goalComparison && typeof adoptionReadinessEval.goalComparison === "object"
        ? adoptionReadinessEval.goalComparison
        : {},
    },
  };
}

module.exports = {
  defaultWorkerDecisionSurfaceContractPath,
  buildWorkerDecisionSurface,
  loadWorkerDecisionSurfaceContract,
  summarizeWorkerDecisionSurfaceContract,
};
