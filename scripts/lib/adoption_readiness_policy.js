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

function normalizeReasonToken(value) {
  return safeString(value, 200)
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
}

function uniqueReasonTokens(values, max = 24) {
  const out = [];
  for (const value of Array.isArray(values) ? values : []) {
    const token = normalizeReasonToken(value);
    if (!token || out.includes(token)) {
      continue;
    }
    out.push(token);
    if (out.length >= max) {
      break;
    }
  }
  return out;
}

function normalizeContract(input) {
  const source = input && typeof input === "object" ? input : {};
  const weights = source.weights && typeof source.weights === "object" ? source.weights : {};
  const hardGates = source.hardGates && typeof source.hardGates === "object" ? source.hardGates : {};
  const proceduralClosureRule = source.proceduralClosureRule && typeof source.proceduralClosureRule === "object"
    ? source.proceduralClosureRule
    : {};
  const normalizeGate = (value, fallbackMin, fallbackFailureClass) => {
    const gate = value && typeof value === "object" ? value : {};
    return Object.freeze({
      min: clamp01(gate.min, fallbackMin),
      failureClass: safeString(gate.failureClass, 80).toLowerCase() || fallbackFailureClass,
    });
  };
  return Object.freeze({
    schema: safeString(source.schema, 120) || "adoption-readiness-evaluator-contract.v1",
    version: safeString(source.version, 120) || "builtin",
    dimensions: Array.isArray(source.dimensions)
      ? source.dimensions.map((entry) => safeString(entry, 120)).filter(Boolean)
      : [],
    weights: Object.freeze({
      literal_requirement_alignment: clamp01(weights.literal_requirement_alignment, 0.2),
      latent_intent_alignment: clamp01(weights.latent_intent_alignment, 0.18),
      task_contract_integrity: clamp01(weights.task_contract_integrity, 0.18),
      boundary_compliance: clamp01(weights.boundary_compliance, 0.18),
      artifact_quality: clamp01(weights.artifact_quality, 0.12),
      residual_risk: clamp01(weights.residual_risk, 0.07),
      iteration_value_remaining: clamp01(weights.iteration_value_remaining, 0.07),
    }),
    hardGates: Object.freeze({
      literal_requirement_alignment: normalizeGate(hardGates.literal_requirement_alignment, 0.84, "validation_failure"),
      latent_intent_alignment: normalizeGate(hardGates.latent_intent_alignment, 0.78, "retry_required"),
      task_contract_integrity: normalizeGate(hardGates.task_contract_integrity, 0.92, "validation_failure"),
      boundary_compliance: normalizeGate(hardGates.boundary_compliance, 0.99, "fail_closed"),
    }),
    judgmentInputs: Object.freeze(
      Array.isArray(source.judgmentInputs)
        ? source.judgmentInputs.map((entry) => safeString(entry, 120)).filter(Boolean).slice(0, 16)
        : []
    ),
    proceduralClosureRule: Object.freeze({
      proceduralClosureIsNotSuccess: Boolean(proceduralClosureRule.proceduralClosureIsNotSuccess),
      completedStateWithoutAdoptionReadinessFails: Boolean(
        proceduralClosureRule.completedStateWithoutAdoptionReadinessFails
      ),
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
  const reviewBlockers = uniqueStrings(reviewBundle.blockers, 12);
  const iterationBlockers = uniqueStrings(iterationDecision.blockers, 12);
  const clauseStatus = safeString(clauseCompletionScorecard.status, 40).toUpperCase();
  const releaseState = safeString(reviewBundle.recommended_release_state, 80).toUpperCase();
  const finalOutcomeStatus = safeString(finalOutcome.taskOutcomeStatus, 80).toUpperCase();
  const finalOutcomeReason = normalizeReasonToken(finalOutcome.taskOutcomeReason);
  const reasonTokens = uniqueReasonTokens([
    finalOutcomeReason,
    ...missingEvidence,
    ...reviewBlockers,
    ...iterationBlockers,
    ...(Array.isArray(input.reasonTokens) ? input.reasonTokens : []),
    ...(input.goalComparison && Array.isArray(input.goalComparison.signals) ? input.goalComparison.signals : []),
  ], 32);
  const hasReason = (...patterns) => reasonTokens.some((token) =>
    patterns.some((pattern) => token === pattern || token.includes(pattern))
  );
  const goalSubstitutionDetected = Boolean(input.goalSubstitutionDetected)
    || hasReason(
      "goal_substitution",
      "silent_requirement_rewrite",
      "silent_task_contract_rewrite",
      "runtime_post_lock_drift",
      "task_contract_integrity_below_threshold"
    );
  const silentTaskContractRewriteDetected = Boolean(input.silentTaskContractRewriteDetected)
    || hasReason("silent_requirement_rewrite", "silent_task_contract_rewrite");
  const taskContractRevisionRequired = Boolean(input.taskContractRevisionRequired)
    || hasReason("task_contract_revision_requires_user_adoption", "return_to_intake_required");
  const explicitUserJudgmentRequired = Boolean(input.explicitUserJudgmentRequired)
    || hasReason("explicit_user_judgment_required", "high_risk_requires_request");
  const proceduralClosureOnly = Boolean(input.proceduralClosureOnly)
    || (
      contract.proceduralClosureRule.proceduralClosureIsNotSuccess
      && finalOutcomeStatus === "COMPLETED"
      && (
        goalSubstitutionDetected
        || taskContractRevisionRequired
        || clauseStatus === "FAIL"
        || (releaseState && !["RELEASE_APPROVED", "RELEASE_APPROVED_WITH_ASSUMPTIONS"].includes(releaseState))
      )
    );
  const explicitGoalComparison = input.goalComparison && typeof input.goalComparison === "object"
    ? input.goalComparison
    : {};
  const literalScore = (() => {
    const explicit = Number(input.literalRequirementAlignmentScore);
    let score = Number.isFinite(explicit)
      ? clamp01(explicit, 0.5)
      : total > 0
        ? ratio(passCount, total, failCount ? 0.25 : 1)
        : 0.5;
    if (goalSubstitutionDetected) {
      score = Math.min(score, 0.24);
    } else if (silentTaskContractRewriteDetected) {
      score = Math.min(score, 0.38);
    }
    return Number(score.toFixed(4));
  })();
  const latentScore = (() => {
    const explicit = Number(input.latentIntentAlignmentScore);
    if (Number.isFinite(explicit)) {
      return Number(clamp01(explicit, 0.5).toFixed(4));
    }
    let score = 0.5;
    if (clauseStatus === "PASS") score = 0.92;
    else if (clauseStatus === "WARN") score = 0.68;
    else if (clauseStatus === "FAIL") score = 0.24;
    else if (releaseState === "RELEASE_APPROVED") score = 0.9;
    else if (releaseState === "RELEASE_APPROVED_WITH_ASSUMPTIONS") score = 0.76;
    else if (releaseState === "EXTERNAL_ACTION_REQUIRED") score = 0.38;
    else if (releaseState === "RELEASE_BLOCKED") score = 0.2;
    if (hasReason("latent_intent_alignment_below_threshold", "intent_")) {
      score = Math.min(score, 0.34);
    }
    if (goalSubstitutionDetected) {
      score = Math.min(score, 0.28);
    }
    if (proceduralClosureOnly) {
      score = Math.min(score, 0.58);
    }
    if (explicitUserJudgmentRequired && releaseState === "EXTERNAL_ACTION_REQUIRED") {
      score = Math.min(score, 0.56);
    }
    return Number(score.toFixed(4));
  })();
  const taskContractIntegrityScore = (() => {
    const explicit = Number(input.taskContractIntegrityScore);
    if (Number.isFinite(explicit)) {
      return Number(clamp01(explicit, 0.5).toFixed(4));
    }
    let score = 1;
    if (goalSubstitutionDetected) {
      score = 0.05;
    } else if (silentTaskContractRewriteDetected) {
      score = 0.12;
    } else if (taskContractRevisionRequired) {
      score = 0.52;
    } else if (proceduralClosureOnly) {
      score = 0.34;
    } else if (clauseStatus === "FAIL" && total > 0 && passCount < total) {
      score = 0.8;
    }
    return Number(score.toFixed(4));
  })();
  const boundaryScore = (() => {
    const explicit = Number(input.boundaryComplianceScore);
    if (Number.isFinite(explicit)) {
      return Number(clamp01(explicit, 0.5).toFixed(4));
    }
    if (missingEvidence.length) return 0.12;
    if (finalOutcomeStatus === "FAILED_VALIDATION" || finalOutcomeStatus === "BLOCKED") return 0.2;
    if (safeString(iterationDecision.action, 80).toUpperCase() === "NEEDS_INPUT") return 0.35;
    return 1;
  })();
  const artifactQualityScore = (() => {
    const explicit = Number(input.artifactQualityScore);
    if (Number.isFinite(explicit)) {
      return Number(clamp01(explicit, 0.5).toFixed(4));
    }
    const expectedRefs = Math.max(1, Number(input.expectedEvidenceRefCount) || 6);
    const coverage = clamp01(evidenceRefs.length / expectedRefs, 0);
    const penalty = missingEvidence.length ? 0.65 : 1;
    const proceduralPenalty = proceduralClosureOnly ? 0.7 : 1;
    return Number((coverage * penalty * proceduralPenalty).toFixed(4));
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
  const rawAdoptionReadinessScore = Number((
    literalScore * contract.weights.literal_requirement_alignment
    + latentScore * contract.weights.latent_intent_alignment
    + taskContractIntegrityScore * contract.weights.task_contract_integrity
    + boundaryScore * contract.weights.boundary_compliance
    + artifactQualityScore * contract.weights.artifact_quality
    + residualRiskScore * contract.weights.residual_risk
    + (1 - iterationValueRemainingScore) * contract.weights.iteration_value_remaining
  ).toFixed(4));
  const gateResults = Object.entries(contract.hardGates).map(([id, gate]) => {
    const score = Number({
      literal_requirement_alignment: literalScore,
      latent_intent_alignment: latentScore,
      task_contract_integrity: taskContractIntegrityScore,
      boundary_compliance: boundaryScore,
    }[id] || 0);
    return {
      id,
      min: Number(gate.min.toFixed(4)),
      score: Number(score.toFixed(4)),
      pass: score >= gate.min ? 1 : 0,
      failureClass: safeString(gate.failureClass, 80).toLowerCase() || "validation_failure",
    };
  });
  const criticalFailures = uniqueStrings(
    gateResults
      .filter((entry) => !entry.pass && ["validation_failure", "fail_closed"].includes(entry.failureClass))
      .map((entry) => entry.id),
    12
  );
  const retryRequired = uniqueStrings(
    gateResults
      .filter((entry) => !entry.pass && entry.failureClass === "retry_required")
      .map((entry) => entry.id),
    12
  );
  let adoptionReadinessScore = rawAdoptionReadinessScore;
  if (goalSubstitutionDetected) {
    adoptionReadinessScore = Math.min(adoptionReadinessScore, 0.18);
  } else if (silentTaskContractRewriteDetected) {
    adoptionReadinessScore = Math.min(adoptionReadinessScore, 0.28);
  } else if (proceduralClosureOnly && contract.proceduralClosureRule.completedStateWithoutAdoptionReadinessFails) {
    adoptionReadinessScore = Math.min(adoptionReadinessScore, 0.45);
  } else if (criticalFailures.length) {
    adoptionReadinessScore = Math.min(adoptionReadinessScore, 0.49);
  } else if (retryRequired.length || taskContractRevisionRequired) {
    adoptionReadinessScore = Math.min(adoptionReadinessScore, 0.79);
  }
  adoptionReadinessScore = Number(adoptionReadinessScore.toFixed(4));
  const blockers = uniqueStrings([
    ...missingEvidence,
    ...reviewBlockers,
    ...iterationBlockers,
    ...(goalSubstitutionDetected ? ["goal_substitution_detected"] : []),
    ...(silentTaskContractRewriteDetected ? ["silent_task_contract_rewrite"] : []),
    ...(taskContractRevisionRequired ? ["task_contract_revision_requires_user_adoption"] : []),
    ...(proceduralClosureOnly ? ["procedural_closure_without_adoption"] : []),
    ...criticalFailures,
    ...retryRequired,
  ], 16);
  const releaseEligibility = Boolean(
    gateResults.every((entry) => entry.pass === 1)
    && adoptionReadinessScore >= 0.8
    && blockers.length === 0
  );
  const goalComparison = {
    originalRequestAligned: literalScore >= contract.hardGates.literal_requirement_alignment.min ? 1 : 0,
    latentIntentAligned: latentScore >= contract.hardGates.latent_intent_alignment.min ? 1 : 0,
    replannedGoalConsistent: taskContractIntegrityScore >= contract.hardGates.task_contract_integrity.min ? 1 : 0,
    proceduralClosureOnly: proceduralClosureOnly ? 1 : 0,
    explicitSignals: explicitGoalComparison,
  };
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
        "task_contract_integrity",
        taskContractIntegrityScore,
        goalSubstitutionDetected
          ? "internal goal substitution or silent rewrite was detected"
          : taskContractRevisionRequired
            ? "task-contract revision requires explicit adoption before release"
            : proceduralClosureOnly
              ? "procedural closure was observed without sufficient adoption evidence"
              : "locked task contract remains intact",
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
        releaseEligibility ? "ready for governed release judgment" : "adoption remains gated by blockers, contract drift, or evidence debt",
        evidenceRefs,
        blockers,
        assumptions,
        residualRisks
      ),
    ],
    scores: {
      literal_requirement_alignment: Number(literalScore.toFixed(4)),
      latent_intent_alignment: Number(latentScore.toFixed(4)),
      task_contract_integrity: Number(taskContractIntegrityScore.toFixed(4)),
      boundary_compliance: Number(boundaryScore.toFixed(4)),
      artifact_quality: Number(artifactQualityScore.toFixed(4)),
      residual_risk: Number(residualRiskScore.toFixed(4)),
      iteration_value_remaining: Number(iterationValueRemainingScore.toFixed(4)),
      adoption_readiness: adoptionReadinessScore,
    },
    gateResults,
    criticalFailures,
    releaseEligibility: {
      eligible: releaseEligibility ? 1 : 0,
      blockedBy: blockers,
      proceduralClosureOnly: proceduralClosureOnly ? 1 : 0,
    },
    goalComparison,
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
      taskOutcomeReason: verifierVerdict === "PASS" ? "eval_run_release_ready" : "independent_verifier_not_pass",
    },
    clauseCompletionScorecard: {
      status: verifierVerdict === "PASS" ? "PASS" : "FAIL",
    },
    taskContractIntegrityScore: verifierVerdict === "PASS" ? 1 : 0.22,
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
