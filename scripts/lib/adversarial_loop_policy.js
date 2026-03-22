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

function isExecutionTaskPrompt(prompt) {
  const text = safeTrimmedString(prompt, 16000).toLowerCase();
  if (!text) {
    return false;
  }
  return [
    "use apply_patch",
    "implementation is explicitly requested now",
    "change only these files",
    "change only ",
    "delegate the implementation",
    "request independent read-only reviewer",
    "request independent read-only reviewer and tester checks",
    "acceptance criteria",
    "final reply must be exactly",
    "owned paths:",
    "[requirement_lock_v1]",
  ].some((needle) => text.includes(needle));
}

function formatDispatchLine(dispatch, index) {
  const item = dispatch && typeof dispatch === "object" ? dispatch : {};
  const ownerAgent = safeTrimmedString(item.ownerAgent, 80) || `specialist_${index + 1}`;
  const ownedPaths = Array.isArray(item.ownedPaths)
    ? item.ownedPaths.map((entry) => safeTrimmedString(entry, 120)).filter(Boolean).slice(0, 4)
    : [];
  const acceptanceChecks = Array.isArray(item.acceptanceChecks)
    ? item.acceptanceChecks.map((entry) => safeTrimmedString(entry, 80)).filter(Boolean).slice(0, 3)
    : [];
  const segments = [`${index + 1}. ${ownerAgent}`];
  if (ownedPaths.length) {
    segments.push(`owned paths: ${ownedPaths.join(", ")}`);
  }
  if (acceptanceChecks.length) {
    segments.push(`acceptance checks: ${acceptanceChecks.join(", ")}`);
  }
  return segments.join(" | ");
}

function buildExecutionRetryContract(dispatchPlan) {
  const plan = dispatchPlan && typeof dispatchPlan === "object" ? dispatchPlan : {};
  const dispatches = Array.isArray(plan.dispatches) ? plan.dispatches : [];
  if (!dispatches.length && !plan.reviewerRequired && !plan.testerRequired) {
    return [];
  }
  const lines = [
    "[REQUIREMENT_LOCK_V1]",
    "Execution contract for this retry:",
  ];
  if (dispatches.length) {
    lines.push("Planned specialist dispatches:");
    dispatches.forEach((dispatch, index) => {
      lines.push(formatDispatchLine(dispatch, index));
    });
  }
  lines.push(`Reviewer evidence required: ${plan.reviewerRequired ? "yes" : "no"}`);
  lines.push(`Tester evidence required: ${plan.testerRequired ? "yes" : "no"}`);
  lines.push(`Dedicated tests required: ${plan.dedicatedTestsRequired ? "yes" : "no"}`);
  return lines;
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
  executionTask,
  dispatchPlan,
  attempt,
  maxRetries,
  maxChars = 24000,
} = {}) {
  const prompt = safeTrimmedString(originalPrompt, 12000);
  const previous = safeTrimmedString(previousAnswer, 12000);
  const findings = normalizeFindings(review);
  const executionTaskRequired = typeof executionTask === "boolean" ? executionTask : isExecutionTaskPrompt(prompt);
  const executionRetryContract = executionTaskRequired ? buildExecutionRetryContract(dispatchPlan) : [];
  const findingLines = findings.length
    ? findings.map((finding, index) => {
        const idPart = finding.id ? ` (${finding.id})` : "";
        return `${index + 1}. [${finding.severity}]${idPart} ${finding.message || "issue detected"}`;
      })
    : ["1. [medium] Improve factual grounding and response safety."];

  const attemptIndex = toBoundedInt(attempt, 0, 0, 8);
  const maxRetryCount = toBoundedInt(maxRetries, 0, 0, 8);
  const body = executionTaskRequired
    ? [
        "Internal quality retry request.",
        `Retry attempt: ${attemptIndex + 1}/${maxRetryCount + 1}`,
        "",
        ...executionRetryContract,
        ...(executionRetryContract.length ? [""] : []),
        "Original user request:",
        prompt || "(missing original prompt)",
        "",
        "Previous answer to revise:",
        previous || "(missing previous answer)",
        "",
        "Adversarial review findings to fix:",
        ...findingLines,
        "",
        "Re-attempt the original user request as an execution task.",
        "Rules:",
        "- Do not merely rewrite the previous answer.",
        "- Actually perform the required edits, tool calls, specialist delegation, reviewer/tester checks, and verification before finalizing.",
        "- Preserve the original scope, acceptance checks, and exact-reply contract.",
        "- If the previous attempt claimed completion without evidence, gather the missing evidence first and only then send the final answer.",
        "- Do not mention internal review, scoring, Blue/Red/Judge, or retry process.",
        "- Remove unsafe/destructive instructions.",
        "- Add explicit date context when recency-sensitive claims are made.",
        "- Include concrete sources when the request asks for evidence unless an exact-reply contract forbids extra text.",
        "- For short fact/status prompts, lead with the direct answer in the first line or sentence.",
        "- Close in place. Do not append optional next-step offers, option menus, or follow-up fishing unless the user explicitly asked for them.",
        "- Keep the final answer concise and directly useful after the work is complete.",
      ].join("\n")
    : [
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
        "- For short fact/status prompts, lead with the direct answer in the first line or sentence.",
        "- Close in place. Do not append optional next-step offers, option menus, or follow-up fishing unless the user explicitly asked for them.",
        "- Keep the final answer concise and directly useful.",
      ].join("\n");

  return safeTrimmedString(body, toBoundedInt(maxChars, 24000, 800, 64000));
}

module.exports = {
  buildAdversarialRetryPrompt,
  shouldRetryAdversarialLoop,
};
