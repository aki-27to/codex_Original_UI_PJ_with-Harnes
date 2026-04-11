"use strict";

const fs = require("fs");
const path = require("path");

const workspaceRoot = path.resolve(__dirname, "..", "..");
const defaultContractPath = path.join(workspaceRoot, "scripts", "config", "adoption_readiness_evaluator_contract.json");

function safeString(value, max = 400) {
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

function normalizeContract(input) {
  const source = input && typeof input === "object" ? input : {};
  const weights = source.weights && typeof source.weights === "object" ? source.weights : {};
  return Object.freeze({
    schema: safeString(source.schema, 120) || "adoption-readiness-evaluator-contract.v1",
    version: safeString(source.version, 120) || "builtin",
    dimensions: Array.isArray(source.dimensions)
      ? source.dimensions.map((entry) => safeString(entry, 120)).filter(Boolean)
      : [],
    weights: Object.freeze({
      literal_requirement_alignment: clamp01(weights.literal_requirement_alignment, 0.22),
      latent_intent_alignment: clamp01(weights.latent_intent_alignment, 0.2),
      boundary_compliance: clamp01(weights.boundary_compliance, 0.2),
      artifact_quality: clamp01(weights.artifact_quality, 0.14),
      residual_risk: clamp01(weights.residual_risk, 0.12),
      iteration_value_remaining: clamp01(weights.iteration_value_remaining, 0.12),
    }),
  });
}

function loadAdoptionReadinessContract(filePath = defaultContractPath) {
  const raw = fs.readFileSync(path.resolve(filePath), "utf8");
  return normalizeContract(raw ? JSON.parse(raw) : {});
}

function ratio(numerator, denominator, fallback = 0) {
  const left = Number(numerator);
  const right = Number(denominator);
  if (!Number.isFinite(left) || !Number.isFinite(right) || right <= 0) {
    return fallback;
  }
  return clamp01(left / right, fallback);
}

function summarizeDimension(id, score, reason, evidenceRefs, blockers, assumptions, residualRisks) {
  return {
    id,
    score: Number(clamp01(score, 0).toFixed(4)),
    reason: safeString(reason, 320),
    evidenceRefs: uniqueStrings(evidenceRefs, 12),
    blockers: uniqueStrings(blockers, 12),
    assumptions: uniqueStrings(assumptions, 12),
    residualRisks: uniqueStrings(residualRisks, 12),
  };
}

function evaluateAdoptionReadiness(input = {}, contract = loadAdoptionReadinessContract()) {
  const acceptanceResults = Array.isArray(input.acceptanceResults) ? input.acceptanceResults : [];
  const passCount = acceptanceResults.filter((entry) => safeString(entry && entry.status, 40).toUpperCase() === "PASS").length;
  const failCount = acceptanceResults.filter((entry) => safeString(entry && entry.status, 40).toUpperCase() === "FAIL").length;
  const total = acceptanceResults.length;
  const missingEvidence = uniqueStrings(input.missingEvidence || input.requiredEvidenceFailures, 12);
  const residualRisks = uniqueStrings(input.residualRisks, 12);
  const assumptions = uniqueStrings(input.assumptions, 12);
  const evidenceRefs = uniqueStrings(input.evidenceRefs, 16);
  const finalOutcome = input.finalOutcome && typeof input.finalOutcome === "object" ? input.finalOutcome : {};
  const reviewBundle = input.reviewBundle && typeof input.reviewBundle === "object" ? input.reviewBundle : {};
  const clauseCompletionScorecard = input.clauseCompletionScorecard && typeof input.clauseCompletionScorecard === "object"
    ? input.clauseCompletionScorecard
    : {};
  const iterationDecision = input.iterationDecision && typeof input.iterationDecision === "object" ? input.iterationDecision : {};
  const literalScore = total > 0 ? ratio(passCount, total, failCount ? 0.25 : 1) : 0.5;
  const latentScore = (() => {
    const clauseStatus = safeString(clauseCompletionScorecard.status, 40).toUpperCase();
    if (clauseStatus === "PASS") return 0.92;
    if (clauseStatus === "WARN") return 0.68;
    if (clauseStatus === "FAIL") return 0.24;
    const releaseState = safeString(reviewBundle.recommended_release_state, 80).toUpperCase();
    if (releaseState === "RELEASE_APPROVED") return 0.9;
    if (releaseState === "RELEASE_APPROVED_WITH_ASSUMPTIONS") return 0.76;
    if (releaseState === "EXTERNAL_ACTION_REQUIRED") return 0.38;
    if (releaseState === "RELEASE_BLOCKED") return 0.2;
    return 0.5;
  })();
  const boundaryScore = (() => {
    if (missingEvidence.length) return 0.12;
    const outcome = safeString(finalOutcome.taskOutcomeStatus, 80).toUpperCase();
    if (outcome === "FAILED_VALIDATION" || outcome === "BLOCKED") return 0.2;
    if (safeString(iterationDecision.action, 80).toUpperCase() === "NEEDS_INPUT") return 0.35;
    return 1;
  })();
  const artifactQualityScore = (() => {
    const expectedRefs = Math.max(1, Number(input.expectedEvidenceRefCount) || 6);
    const coverage = clamp01(evidenceRefs.length / expectedRefs, 0);
    return Number((coverage * (missingEvidence.length ? 0.65 : 1)).toFixed(4));
  })();
  const residualRiskScore = (() => {
    const riskPenalty = Math.min(1, residualRisks.length / Math.max(1, Number(input.maxResidualRiskItems) || 6));
    return Number((1 - riskPenalty).toFixed(4));
  })();
  const iterationValueRemainingScore = (() => {
    const action = safeString(iterationDecision.action, 80).toUpperCase();
    if (action === "RELEASE") return 0.08;
    if (action === "RETRY") return 0.72;
    if (action === "FAILED_VALIDATION") return 0.66;
    if (action === "BLOCKED") return 0.58;
    if (action === "NEEDS_INPUT") return 0.52;
    return clamp01(iterationDecision.valueRemainingScore, 0.4);
  })();
  const adoptionReadinessScore = Number((
    literalScore * contract.weights.literal_requirement_alignment
    + latentScore * contract.weights.latent_intent_alignment
    + boundaryScore * contract.weights.boundary_compliance
    + artifactQualityScore * contract.weights.artifact_quality
    + residualRiskScore * contract.weights.residual_risk
    + (1 - iterationValueRemainingScore) * contract.weights.iteration_value_remaining
  ).toFixed(4));
  const blockers = uniqueStrings([
    ...missingEvidence,
    ...(Array.isArray(reviewBundle.blockers) ? reviewBundle.blockers : []),
    ...(Array.isArray(iterationDecision.blockers) ? iterationDecision.blockers : []),
  ], 16);
  return {
    schema: "adoption-readiness-eval.v1",
    generatedAt: new Date().toISOString(),
    completedStateObserved: safeString(finalOutcome.taskOutcomeStatus, 80).toUpperCase() === "COMPLETED" ? 1 : 0,
    dimensions: [
      summarizeDimension(
        "literal_requirement_alignment",
        literalScore,
        total > 0 ? `${passCount}/${total} acceptance checks passed` : "no acceptance checks were recorded",
        evidenceRefs,
        failCount ? ["acceptance_failures_present"] : [],
        assumptions,
        residualRisks
      ),
      summarizeDimension(
        "latent_intent_alignment",
        latentScore,
        `clause score ${safeString(clauseCompletionScorecard.status, 40) || "UNSET"} with release hint ${safeString(reviewBundle.recommended_release_state, 80) || "unset"}`,
        evidenceRefs,
        blockers,
        assumptions,
        residualRisks
      ),
      summarizeDimension(
        "boundary_compliance",
        boundaryScore,
        missingEvidence.length ? "required evidence or validation gates are still missing" : "boundary checks remain within governed thresholds",
        evidenceRefs,
        missingEvidence,
        assumptions,
        residualRisks
      ),
      summarizeDimension(
        "artifact_quality",
        artifactQualityScore,
        `${evidenceRefs.length} evidence refs captured`,
        evidenceRefs,
        missingEvidence,
        assumptions,
        residualRisks
      ),
      summarizeDimension(
        "residual_risk",
        residualRiskScore,
        residualRisks.length ? `${residualRisks.length} residual risk item(s) remain` : "no residual risk items recorded",
        evidenceRefs,
        blockers,
        assumptions,
        residualRisks
      ),
      summarizeDimension(
        "iteration_value_remaining",
        1 - iterationValueRemainingScore,
        `iteration action ${safeString(iterationDecision.action, 80) || "UNSET"}`,
        evidenceRefs,
        blockers,
        assumptions,
        residualRisks
      ),
      summarizeDimension(
        "adoption_readiness",
        adoptionReadinessScore,
        blockers.length ? "adoption remains gated by blockers or evidence debt" : "ready for governed release judgment",
        evidenceRefs,
        blockers,
        assumptions,
        residualRisks
      ),
    ],
    scores: {
      literal_requirement_alignment: Number(literalScore.toFixed(4)),
      latent_intent_alignment: Number(latentScore.toFixed(4)),
      boundary_compliance: Number(boundaryScore.toFixed(4)),
      artifact_quality: Number(artifactQualityScore.toFixed(4)),
      residual_risk: Number(residualRiskScore.toFixed(4)),
      iteration_value_remaining: Number(iterationValueRemainingScore.toFixed(4)),
      adoption_readiness: adoptionReadinessScore,
    },
    blockers,
    assumptions,
    residualRisks,
    evidenceRefs,
  };
}

function evaluateEvalRunAdoptionReadiness({ suite, runs, verifier, comparison } = {}, contract = loadAdoptionReadinessContract()) {
  const primaryRun = Array.isArray(runs) && runs.length ? runs[0] : {};
  const cases = Array.isArray(primaryRun && primaryRun.cases) ? primaryRun.cases : [];
  const acceptanceResults = cases.map((entry) => ({
    id: safeString(entry && entry.id, 120),
    status: entry && entry.passed ? "PASS" : "FAIL",
  }));
  const verifierVerdict = safeString(verifier && verifier.verdict, 80).toUpperCase();
  const iterationDecision = {
    action: verifierVerdict === "PASS" ? "RELEASE" : "RETRY",
    blockers: verifierVerdict === "PASS" ? [] : ["independent_verifier_not_pass"],
  };
  return evaluateAdoptionReadiness({
    acceptanceResults,
    expectedEvidenceRefCount: Math.max(1, cases.length || 1),
    evidenceRefs: [
      `suite:${safeString(suite && suite.suiteId, 120) || "eval"}`,
      `verifier:${verifierVerdict || "UNKNOWN"}`,
      `comparison:${safeString(comparison && comparison.reason, 120) || "single_variant"}`,
    ],
    reviewBundle: {
      recommended_release_state: verifierVerdict === "PASS" ? "RELEASE_APPROVED" : "RELEASE_BLOCKED",
      blockers: verifierVerdict === "PASS" ? [] : ["independent_verifier_not_pass"],
    },
    finalOutcome: {
      taskOutcomeStatus: verifierVerdict === "PASS" ? "COMPLETED" : "FAILED_VALIDATION",
    },
    clauseCompletionScorecard: {
      status: verifierVerdict === "PASS" ? "PASS" : "FAIL",
    },
    iterationDecision,
    residualRisks: verifierVerdict === "PASS" ? [] : ["eval_run_has_failing_cases"],
  }, contract);
}

module.exports = {
  defaultContractPath,
  loadAdoptionReadinessContract,
  evaluateAdoptionReadiness,
  evaluateEvalRunAdoptionReadiness,
};
