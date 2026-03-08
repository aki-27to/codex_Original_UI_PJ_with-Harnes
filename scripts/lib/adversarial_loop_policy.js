"use strict";

function safeTrimmedString(value, max = 12000) {
  if (typeof value !== "string") {
    return "";
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return "";
  }
  return trimmed.slice(0, max);
}

function toBoundedInt(value, fallback, min, max) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.max(min, Math.min(max, Math.trunc(parsed)));
}

function normalizeFindings(review) {
  const reviewObj = review && typeof review === "object" ? review : {};
  const red = reviewObj.red && typeof reviewObj.red === "object" ? reviewObj.red : {};
  const findings = Array.isArray(red.findings) ? red.findings : [];
  return findings
    .map((finding) => ({
      id: safeTrimmedString(finding && finding.id, 80),
      severity: safeTrimmedString(finding && finding.severity, 20).toLowerCase() || "low",
      message: safeTrimmedString(finding && finding.message, 260),
    }))
    .filter((finding) => finding.id || finding.message)
    .slice(0, 12);
}

function shouldRetryAdversarialLoop({
  enabled,
  finalStatus,
  taskOutcomeStatus,
  decision,
  attempt,
  maxRetries,
  clientClosed = false,
  writable = true,
} = {}) {
  if (!enabled) {
    return { retry: false, reason: "loop_disabled" };
  }
  if (clientClosed) {
    return { retry: false, reason: "client_closed" };
  }
  if (!writable) {
    return { retry: false, reason: "response_not_writable" };
  }
  const normalizedStatus = safeTrimmedString(finalStatus, 40).toLowerCase();
  const normalizedTaskOutcomeStatus = safeTrimmedString(taskOutcomeStatus, 80).toUpperCase().replace(/[\s-]+/g, "_");
  if (normalizedTaskOutcomeStatus === "BLOCKED") {
    return { retry: false, reason: "task_outcome_blocked" };
  }
  if (normalizedTaskOutcomeStatus === "NEEDS_INPUT") {
    return { retry: false, reason: "task_outcome_needs_input" };
  }
  const completedLike = normalizedStatus === "completed";
  const failedValidationLike = normalizedTaskOutcomeStatus === "FAILED_VALIDATION";
  if (!completedLike && !failedValidationLike) {
    return { retry: false, reason: "non_completed_status" };
  }
  const normalizedDecision = safeTrimmedString(decision, 40).toLowerCase();
  if (!normalizedDecision || normalizedDecision === "pass") {
    return { retry: false, reason: "review_passed" };
  }
  const retryBudget = toBoundedInt(maxRetries, 0, 0, 8);
  const retryAttempt = toBoundedInt(attempt, 0, 0, 8);
  if (retryAttempt >= retryBudget) {
    return { retry: false, reason: "retry_budget_exhausted" };
  }
  return {
    retry: true,
    reason: failedValidationLike ? "failed_validation_review_failed" : "review_failed",
    nextAttempt: retryAttempt + 1,
  };
}

function buildAdversarialRetryPrompt({
  originalPrompt,
  previousAnswer,
  review,
  attempt,
  maxRetries,
  maxChars = 24000,
} = {}) {
  const prompt = safeTrimmedString(originalPrompt, 12000);
  const previous = safeTrimmedString(previousAnswer, 12000);
  const findings = normalizeFindings(review);
  const findingLines = findings.length
    ? findings.map((finding, index) => {
        const idPart = finding.id ? ` (${finding.id})` : "";
        return `${index + 1}. [${finding.severity}]${idPart} ${finding.message || "issue detected"}`;
      })
    : ["1. [medium] Improve factual grounding and response safety."];

  const attemptIndex = toBoundedInt(attempt, 0, 0, 8);
  const maxRetryCount = toBoundedInt(maxRetries, 0, 0, 8);
  const body = [
    "Internal quality retry request.",
    `Retry attempt: ${attemptIndex + 1}/${maxRetryCount + 1}`,
    "",
    "Original user request:",
    prompt || "(missing original prompt)",
    "",
    "Previous answer to revise:",
    previous || "(missing previous answer)",
    "",
    "Adversarial review findings to fix:",
    ...findingLines,
    "",
    "Write a corrected final answer for the original user request.",
    "Rules:",
    "- Do not mention internal review, scoring, Blue/Red/Judge, or retry process.",
    "- Remove unsafe/destructive instructions.",
    "- Add explicit date context when recency-sensitive claims are made.",
    "- Include concrete sources when the request asks for evidence.",
    "- Keep the final answer concise and directly useful.",
  ].join("\n");

  return safeTrimmedString(body, toBoundedInt(maxChars, 24000, 800, 64000));
}

module.exports = {
  buildAdversarialRetryPrompt,
  shouldRetryAdversarialLoop,
};
