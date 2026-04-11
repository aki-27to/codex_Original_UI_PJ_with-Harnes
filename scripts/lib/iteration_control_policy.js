"use strict";

const fs = require("fs");
const path = require("path");

const workspaceRoot = path.resolve(__dirname, "..", "..");
const defaultIterationControlContractPath = path.join(workspaceRoot, "scripts", "config", "iteration_control_contract.json");

function safeString(value, max = 240) {
  if (typeof value !== "string") {
    return "";
  }
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, max) : "";
}

function uniqueStrings(values, max = 16) {
  const out = [];
  for (const value of Array.isArray(values) ? values : []) {
    const text = safeString(value, 240);
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

function clampNumber(value, fallback, min, max) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.max(min, Math.min(max, parsed));
}

function normalizeIterationControlContract(input) {
  const source = input && typeof input === "object" ? input : {};
  const qualityThresholds = source.qualityThresholds && typeof source.qualityThresholds === "object" ? source.qualityThresholds : {};
  const budgets = source.budgets && typeof source.budgets === "object" ? source.budgets : {};
  const riskThresholds = source.riskThresholds && typeof source.riskThresholds === "object" ? source.riskThresholds : {};
  return Object.freeze({
    schema: safeString(source.schema, 120) || "iteration-control-contract.v1",
    version: safeString(source.version, 120) || "builtin",
    qualityThresholds: Object.freeze({
      literal_requirement_alignment: clampNumber(qualityThresholds.literal_requirement_alignment, 0.84, 0, 1),
      latent_intent_alignment: clampNumber(qualityThresholds.latent_intent_alignment, 0.78, 0, 1),
      boundary_compliance: clampNumber(qualityThresholds.boundary_compliance, 0.99, 0, 1),
      artifact_quality: clampNumber(qualityThresholds.artifact_quality, 0.8, 0, 1),
      residual_risk: clampNumber(qualityThresholds.residual_risk, 0.68, 0, 1),
      adoption_readiness: clampNumber(qualityThresholds.adoption_readiness, 0.8, 0, 1),
      iteration_value_remaining_max: clampNumber(qualityThresholds.iteration_value_remaining_max, 0.24, 0, 1),
    }),
    improvementDeltaThreshold: clampNumber(source.improvementDeltaThreshold, 0.03, 0, 1),
    budgets: Object.freeze({
      wallClockMs: clampNumber(budgets.wallClockMs, 3600000, 1000, 86400000),
      stepBudget: clampNumber(budgets.stepBudget, 24, 1, 1000),
      tokenBudget: clampNumber(budgets.tokenBudget, 400000, 100, 100000000),
    }),
    riskThresholds: Object.freeze({
      maxResidualRiskItems: clampNumber(riskThresholds.maxResidualRiskItems, 6, 0, 200),
      maxRequiredEvidenceFailures: clampNumber(riskThresholds.maxRequiredEvidenceFailures, 0, 0, 200),
      highRiskTaskOutcomeStates: Array.isArray(riskThresholds.highRiskTaskOutcomeStates)
        ? riskThresholds.highRiskTaskOutcomeStates.map((entry) => safeString(entry, 80).toUpperCase()).filter(Boolean)
        : ["FAILED_VALIDATION", "BLOCKED"],
    }),
    releaseConditions: Array.isArray(source.releaseConditions) ? source.releaseConditions.map((entry) => safeString(entry, 160)).filter(Boolean) : [],
    escalationConditions: Array.isArray(source.escalationConditions) ? source.escalationConditions.map((entry) => safeString(entry, 160)).filter(Boolean) : [],
    failClosedConditions: Array.isArray(source.failClosedConditions) ? source.failClosedConditions.map((entry) => safeString(entry, 160)).filter(Boolean) : [],
    artifactSchemas: Object.freeze({
      iterationDecision: safeString(source.artifactSchemas && source.artifactSchemas.iterationDecision, 120) || "iteration-decision.v1",
      releaseDecision: safeString(source.artifactSchemas && source.artifactSchemas.releaseDecision, 120) || "release-decision.v2",
      escalationDecision: safeString(source.artifactSchemas && source.artifactSchemas.escalationDecision, 120) || "escalation-decision.v1",
      adoptionReadiness: safeString(source.artifactSchemas && source.artifactSchemas.adoptionReadiness, 120) || "adoption-readiness-eval.v1",
    }),
  });
}

function loadIterationControlContract(filePath = defaultIterationControlContractPath) {
  const raw = fs.readFileSync(path.resolve(filePath), "utf8");
  return normalizeIterationControlContract(raw ? JSON.parse(raw) : {});
}

function evaluateBudgetState({ contract, startedAt, now, stepCount, tokenCount }) {
  const budgets = contract.budgets;
  const elapsedMs = Math.max(0, Number(now) - Number(startedAt || now));
  const steps = Math.max(0, Math.trunc(Number(stepCount) || 0));
  const tokens = Math.max(0, Math.trunc(Number(tokenCount) || 0));
  return {
    elapsedMs,
    stepCount: steps,
    tokenCount: tokens,
    wallClockExceeded: elapsedMs > budgets.wallClockMs,
    stepBudgetExceeded: steps > budgets.stepBudget,
    tokenBudgetExceeded: tokens > budgets.tokenBudget,
  };
}

function buildIterationDecision(input = {}, contract = loadIterationControlContract()) {
  const evaluator = input.evaluator && typeof input.evaluator === "object" ? input.evaluator : {};
  const scores = evaluator.scores && typeof evaluator.scores === "object" ? evaluator.scores : {};
  const finalOutcome = input.finalOutcome && typeof input.finalOutcome === "object" ? input.finalOutcome : {};
  const taskOutcomeStatus = safeString(finalOutcome.taskOutcomeStatus, 80).toUpperCase();
  const blockers = uniqueStrings([
    ...(Array.isArray(evaluator.blockers) ? evaluator.blockers : []),
    ...(Array.isArray(input.blockers) ? input.blockers : []),
  ], 16);
  const missingEvidence = uniqueStrings(input.missingEvidence || input.requiredEvidenceFailures, 12);
  const residualRisks = uniqueStrings(input.residualRisks, 12);
  const budgetState = evaluateBudgetState({
    contract,
    startedAt: input.startedAt,
    now: input.now || Date.now(),
    stepCount: input.stepCount,
    tokenCount: input.tokenCount,
  });
  const valueRemaining = clampNumber(scores.iteration_value_remaining, 0.5, 0, 1);
  let action = "RETRY";
  let reason = "iteration_value_remaining";
  if (safeString(input.explicitAction, 80).toUpperCase() === "NEEDS_INPUT") {
    action = "NEEDS_INPUT";
    reason = "explicit_user_judgment_required";
  } else if (taskOutcomeStatus === "BLOCKED") {
    action = "BLOCKED";
    reason = "task_outcome_blocked";
  } else if (taskOutcomeStatus === "FAILED_VALIDATION" || missingEvidence.length) {
    action = "FAILED_VALIDATION";
    reason = missingEvidence.length ? "required_evidence_failures_present" : "task_outcome_failed_validation";
  } else if (budgetState.wallClockExceeded || budgetState.stepBudgetExceeded || budgetState.tokenBudgetExceeded) {
    action = blockers.length ? "BLOCKED" : "NEEDS_INPUT";
    reason = "budget_exhausted_while_value_remaining";
  } else if (
    clampNumber(scores.boundary_compliance, 0, 0, 1) >= contract.qualityThresholds.boundary_compliance
    && clampNumber(scores.adoption_readiness, 0, 0, 1) >= contract.qualityThresholds.adoption_readiness
    && valueRemaining <= contract.qualityThresholds.iteration_value_remaining_max
    && missingEvidence.length <= contract.riskThresholds.maxRequiredEvidenceFailures
  ) {
    action = "RELEASE";
    reason = "release_conditions_satisfied";
  }
  return {
    schema: contract.artifactSchemas.iterationDecision,
    generatedAt: new Date().toISOString(),
    action,
    reason,
    blockers,
    assumptions: uniqueStrings(input.assumptions, 12),
    residualRisks,
    qualityThresholds: contract.qualityThresholds,
    budgets: budgetState,
    valueRemainingScore: Number(valueRemaining.toFixed(4)),
    improvementDelta: Number(clampNumber(input.improvementDelta, 0, -1, 1).toFixed(4)),
    failClosed: action === "FAILED_VALIDATION" || action === "BLOCKED" ? 1 : 0,
  };
}

function buildEscalationDecision({ contract = loadIterationControlContract(), iterationDecision = {}, finalOutcome = {} } = {}) {
  const action = safeString(iterationDecision.action, 80).toUpperCase();
  const needed = ["NEEDS_INPUT", "BLOCKED", "FAILED_VALIDATION"].includes(action);
  return {
    schema: contract.artifactSchemas.escalationDecision,
    generatedAt: new Date().toISOString(),
    escalationRequired: needed ? 1 : 0,
    action,
    reason: safeString(iterationDecision.reason, 200) || safeString(finalOutcome.taskOutcomeReason, 200) || "not_required",
    blockers: uniqueStrings(iterationDecision.blockers, 12),
    assumptions: uniqueStrings(iterationDecision.assumptions, 12),
    residualRisks: uniqueStrings(iterationDecision.residualRisks, 12),
  };
}

module.exports = {
  defaultIterationControlContractPath,
  loadIterationControlContract,
  normalizeIterationControlContract,
  buildIterationDecision,
  buildEscalationDecision,
};
