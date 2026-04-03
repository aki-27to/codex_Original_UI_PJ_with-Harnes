"use strict";

function safeString(value, max = 2000) {
  if (typeof value !== "string") return "";
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, max) : "";
}

function uniqueStrings(values, max = 24) {
  const out = [];
  for (const entry of Array.isArray(values) ? values : []) {
    const text = safeString(entry, 120);
    if (!text || out.includes(text)) continue;
    out.push(text);
    if (out.length >= max) break;
  }
  return out;
}

function normalizeVerifierPolicy(input) {
  const source = input && typeof input === "object" ? input : {};
  const minPassRate = Number.isFinite(Number(source.minPassRate)) ? Math.max(0, Math.min(1, Number(source.minPassRate))) : 1;
  const minScoreRate = Number.isFinite(Number(source.minScoreRate)) ? Math.max(0, Math.min(1, Number(source.minScoreRate))) : 1;
  return {
    requireAllCasesPass: source.requireAllCasesPass !== false,
    minPassRate: Number(minPassRate.toFixed(4)),
    minScoreRate: Number(minScoreRate.toFixed(4)),
    blockedTaskOutcomeStatuses: uniqueStrings(source.blockedTaskOutcomeStatuses, 12).map((entry) => entry.toUpperCase()),
    allowedExecutorStatuses: uniqueStrings(source.allowedExecutorStatuses, 12).map((entry) => entry.toLowerCase()),
  };
}

function summarizeVariant(run) {
  const source = run && typeof run === "object" ? run : {};
  return {
    variant: safeString(source.variant && source.variant.label, 80) || safeString(source.label, 80) || "variant",
    passRate: Number.isFinite(Number(source.passRate)) ? Number(Number(source.passRate).toFixed(4)) : 0,
    scoreRate: Number.isFinite(Number(source.scoreRate)) ? Number(Number(source.scoreRate).toFixed(4)) : 0,
    sampleSize: Number.isFinite(Number(source.sampleSize)) ? Math.max(0, Math.trunc(Number(source.sampleSize))) : 0,
    failedCases: Number.isFinite(Number(source.failedCases)) ? Math.max(0, Math.trunc(Number(source.failedCases))) : 0,
    avgLatencyMs: Number.isFinite(Number(source.avgLatencyMs)) ? Number(Number(source.avgLatencyMs).toFixed(2)) : 0,
  };
}

function buildIndependentVerifierReport({ laneId = "", suite = null, runs = [], policy = null, source = "eval" } = {}) {
  const verifierPolicy = normalizeVerifierPolicy(policy);
  const failures = [];
  const variants = [];
  for (const run of Array.isArray(runs) ? runs : []) {
    variants.push(summarizeVariant(run));
    const runLabel = safeString(run && run.variant && run.variant.label, 80) || safeString(run && run.label, 80) || "variant";
    if (Number(run && run.passRate) < verifierPolicy.minPassRate) {
      failures.push({
        type: "pass_rate_below_threshold",
        variant: runLabel,
        observed: Number.isFinite(Number(run && run.passRate)) ? Number(Number(run.passRate).toFixed(4)) : 0,
        expected: verifierPolicy.minPassRate,
      });
    }
    if (Number(run && run.scoreRate) < verifierPolicy.minScoreRate) {
      failures.push({
        type: "score_rate_below_threshold",
        variant: runLabel,
        observed: Number.isFinite(Number(run && run.scoreRate)) ? Number(Number(run.scoreRate).toFixed(4)) : 0,
        expected: verifierPolicy.minScoreRate,
      });
    }
    for (const caseResult of Array.isArray(run && run.cases) ? run.cases : []) {
      const caseId = safeString(caseResult && caseResult.caseId, 120) || "case";
      const executorStatus = safeString(caseResult && caseResult.status, 80).toLowerCase();
      const taskOutcomeStatus = safeString(caseResult && caseResult.taskOutcomeStatus, 80).toUpperCase();
      if (verifierPolicy.requireAllCasesPass && !(caseResult && caseResult.passed)) {
        failures.push({
          type: "grader_failed",
          variant: runLabel,
          caseId,
          reason: safeString(caseResult && caseResult.reason, 160) || "grader_failed",
          turnId: safeString(caseResult && caseResult.turnId, 160),
          outputPreview: safeString(caseResult && caseResult.output && caseResult.output.preview, 240),
        });
      }
      if (executorStatus && verifierPolicy.allowedExecutorStatuses.length && !verifierPolicy.allowedExecutorStatuses.includes(executorStatus)) {
        failures.push({
          type: "executor_status_disallowed",
          variant: runLabel,
          caseId,
          observed: executorStatus,
          expected: verifierPolicy.allowedExecutorStatuses,
          turnId: safeString(caseResult && caseResult.turnId, 160),
        });
      }
      if (taskOutcomeStatus && verifierPolicy.blockedTaskOutcomeStatuses.includes(taskOutcomeStatus)) {
        failures.push({
          type: "task_outcome_blocked",
          variant: runLabel,
          caseId,
          observed: taskOutcomeStatus,
          reason: safeString(caseResult && caseResult.taskOutcomeReason, 160),
          turnId: safeString(caseResult && caseResult.turnId, 160),
        });
      }
    }
  }
  return {
    schema: "independent-verifier-report.v1",
    generatedAt: new Date().toISOString(),
    source: safeString(source, 80) || "eval",
    laneId: safeString(laneId, 80),
    suiteId: safeString(suite && suite.suiteId, 120),
    verdict: failures.length ? "FAIL" : "PASS",
    reason: failures.length ? "verifier_detected_regression" : "all_verifier_checks_passed",
    policy: verifierPolicy,
    variantSummaries: variants,
    failureCount: failures.length,
    failures,
  };
}

module.exports = {
  buildIndependentVerifierReport,
  normalizeVerifierPolicy,
};
