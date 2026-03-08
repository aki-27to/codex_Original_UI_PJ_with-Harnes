"use strict";

const fs = require("fs");
const path = require("path");

const defaultEvalSuitePath = path.join(__dirname, "..", "config", "eval_suite_default.json");
const allowedExpectModes = new Set(["exact", "includes", "regex", "json_fields"]);
const allowedEvalDrivers = new Set([
  "exec",
  "agent_governance_probe",
  "agent_registry_probe",
  "idempotency_bridge_probe",
  "task_outcome_probe",
  "turn_task_outcome_probe",
  "parent_dispatch_guard_probe",
  "request_user_input_probe",
  "requirement_rbj_probe",
  "planning_mode_probe",
  "planning_contract_probe",
  "adversarial_shadow_probe",
  "adversarial_loop_probe",
]);

function safeString(value, max = 2000) {
  if (typeof value !== "string") {
    return "";
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return "";
  }
  return trimmed.slice(0, max);
}

function clampNumber(value, fallback, min, max) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.max(min, Math.min(max, parsed));
}

function sanitizeJsonValue(value, depth = 0) {
  if (depth > 6) {
    return null;
  }
  if (value == null) {
    return null;
  }
  if (typeof value === "string") {
    return safeString(value, 24000);
  }
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value === "boolean") {
    return value;
  }
  if (Array.isArray(value)) {
    return value.slice(0, 40).map((entry) => sanitizeJsonValue(entry, depth + 1));
  }
  if (typeof value === "object") {
    const out = {};
    for (const [key, entry] of Object.entries(value).slice(0, 40)) {
      const normalizedKey = safeString(key, 120);
      if (!normalizedKey) {
        continue;
      }
      out[normalizedKey] = sanitizeJsonValue(entry, depth + 1);
    }
    return out;
  }
  return null;
}

function normalizeExpectation(expectation) {
  const payload = expectation && typeof expectation === "object" ? expectation : {};
  const modeRaw = safeString(payload.mode || payload.type, 40).toLowerCase();
  const mode = allowedExpectModes.has(modeRaw) ? modeRaw : "includes";

  if (mode === "json_fields") {
    const fieldsSource = payload.fields && typeof payload.fields === "object" ? payload.fields : {};
    const fields = Object.entries(fieldsSource).reduce((acc, [key, value]) => {
      const normalizedKey = safeString(key, 120);
      if (!normalizedKey) {
        return acc;
      }
      acc[normalizedKey] = value;
      return acc;
    }, {});
    return {
      mode,
      fields,
      ignoreCase: Boolean(payload.ignoreCase),
    };
  }

  return {
    mode,
    value: safeString(payload.value, 8000),
    flags: safeString(payload.flags, 8) || "",
    ignoreCase: Boolean(payload.ignoreCase),
  };
}

function normalizeEvalCase(entry, index) {
  const payload = entry && typeof entry === "object" ? entry : {};
  const driverRaw = safeString(payload.driver, 80).toLowerCase();
  const driver = allowedEvalDrivers.has(driverRaw) ? driverRaw : "exec";
  const prompt = safeString(payload.prompt, 24000);
  if (driver === "exec" && !prompt) {
    return null;
  }
  const id = safeString(payload.id, 120) || `case-${index + 1}`;
  const weight = clampNumber(payload.weight, 1, 0.1, 20);
  return {
    id,
    title: safeString(payload.title, 200) || id,
    prompt,
    tags: Array.isArray(payload.tags)
      ? payload.tags.map((tag) => safeString(tag, 40).toLowerCase()).filter(Boolean).slice(0, 12)
      : [],
    driver,
    input: payload.input && typeof payload.input === "object" ? sanitizeJsonValue(payload.input) : {},
    weight,
    expect: normalizeExpectation(payload.expect),
  };
}

function normalizeEvalSuite(input, { fallbackId = "default-v1" } = {}) {
  const payload = input && typeof input === "object" ? input : {};
  const casesSource = Array.isArray(payload.cases) ? payload.cases : [];
  const cases = [];
  for (let i = 0; i < casesSource.length; i += 1) {
    const normalized = normalizeEvalCase(casesSource[i], i);
    if (normalized) {
      cases.push(normalized);
    }
  }
  if (!cases.length) {
    throw new Error("evaluation suite requires at least one valid case");
  }
  return {
    schema: "harness-eval-suite.v1",
    suiteId: safeString(payload.suiteId, 120) || fallbackId,
    description: safeString(payload.description, 400) || "Harness evaluation suite",
    outputSchema: payload.outputSchema && typeof payload.outputSchema === "object" ? payload.outputSchema : {},
    cases,
  };
}

function loadEvalSuiteFromFile(filePath = defaultEvalSuitePath) {
  const absolutePath = path.resolve(filePath);
  const raw = fs.readFileSync(absolutePath, "utf8");
  const parsed = raw ? JSON.parse(raw) : {};
  return normalizeEvalSuite(parsed, {
    fallbackId: path.basename(absolutePath, path.extname(absolutePath)) || "default-v1",
  });
}

function buildRegexWithFlags(pattern, flags = "") {
  const normalizedFlags = safeString(flags, 8).replace(/[^gimsuy]/g, "");
  return new RegExp(pattern, normalizedFlags);
}

function readPathValue(obj, dotPath) {
  if (!obj || typeof obj !== "object") {
    return undefined;
  }
  const segments = String(dotPath || "")
    .split(".")
    .map((part) => part.trim())
    .filter(Boolean)
    .slice(0, 20);
  if (!segments.length) {
    return undefined;
  }
  let cursor = obj;
  for (const segment of segments) {
    if (!cursor || typeof cursor !== "object" || !Object.prototype.hasOwnProperty.call(cursor, segment)) {
      return undefined;
    }
    cursor = cursor[segment];
  }
  return cursor;
}

function evaluateEvalCaseOutput(finalText, expectation) {
  const text = typeof finalText === "string" ? finalText.trim() : "";
  const expect = normalizeExpectation(expectation);
  if (expect.mode === "exact") {
    const left = expect.ignoreCase ? text.toLowerCase() : text;
    const right = expect.ignoreCase ? String(expect.value || "").toLowerCase() : String(expect.value || "");
    const passed = left === right;
    return {
      passed,
      reason: passed ? "exact_match" : "exact_mismatch",
      details: { expected: expect.value, actual: text.slice(0, 2000) },
    };
  }
  if (expect.mode === "includes") {
    const left = expect.ignoreCase ? text.toLowerCase() : text;
    const right = expect.ignoreCase ? String(expect.value || "").toLowerCase() : String(expect.value || "");
    const passed = right ? left.includes(right) : text.length > 0;
    return {
      passed,
      reason: passed ? "includes_match" : "includes_mismatch",
      details: { expected: expect.value, actual: text.slice(0, 2000) },
    };
  }
  if (expect.mode === "regex") {
    try {
      const pattern = buildRegexWithFlags(expect.value || ".*", expect.flags);
      const passed = pattern.test(text);
      return {
        passed,
        reason: passed ? "regex_match" : "regex_mismatch",
        details: { expected: expect.value, flags: expect.flags || "", actual: text.slice(0, 2000) },
      };
    } catch (error) {
      return {
        passed: false,
        reason: "regex_invalid",
        details: { expected: expect.value, flags: expect.flags || "", error: error instanceof Error ? error.message : String(error) },
      };
    }
  }

  // json_fields
  let parsed = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch (error) {
    return {
      passed: false,
      reason: "json_parse_failed",
      details: { error: error instanceof Error ? error.message : String(error), actual: text.slice(0, 2000) },
    };
  }
  const failedFields = [];
  for (const [dotPath, expectedValue] of Object.entries(expect.fields || {})) {
    const actualValue = readPathValue(parsed, dotPath);
    if (JSON.stringify(actualValue) !== JSON.stringify(expectedValue)) {
      failedFields.push({ path: dotPath, expected: expectedValue, actual: actualValue });
    }
  }
  return {
    passed: failedFields.length === 0,
    reason: failedFields.length === 0 ? "json_fields_match" : "json_fields_mismatch",
    details: {
      checkedFields: Object.keys(expect.fields || {}).length,
      failedFields,
    },
  };
}

function summarizeEvalCaseResult({ evalCase, outputText, latencyMs, status, errorText, taskOutcomeStatus, taskOutcomeReason }) {
  const verdict = evaluateEvalCaseOutput(outputText, evalCase.expect);
  const passed = Boolean(verdict.passed);
  const weight = Number(evalCase.weight) || 1;
  const result = {
    caseId: evalCase.id,
    title: evalCase.title,
    driver: safeString(evalCase.driver, 80) || "exec",
    status: safeString(status, 40) || "unknown",
    latencyMs: Math.max(0, Math.trunc(Number(latencyMs) || 0)),
    passed,
    score: passed ? weight : 0,
    maxScore: weight,
    reason: verdict.reason,
    details: verdict.details,
    errorText: safeString(errorText, 1200),
    output: {
      chars: typeof outputText === "string" ? outputText.length : 0,
      preview: safeString(outputText, 400),
    },
  };
  const normalizedTaskOutcomeStatus = safeString(taskOutcomeStatus, 80).toUpperCase();
  const normalizedTaskOutcomeReason = safeString(taskOutcomeReason, 120);
  result.taskOutcomeStatus = normalizedTaskOutcomeStatus;
  result.taskOutcomeReason = normalizedTaskOutcomeReason;
  return result;
}

function buildEvalRunSummary({ suite, variant, caseResults, startedAt, completedAt }) {
  const results = Array.isArray(caseResults) ? caseResults : [];
  const maxScore = results.reduce((sum, item) => sum + (Number(item.maxScore) || 0), 0);
  const score = results.reduce((sum, item) => sum + (Number(item.score) || 0), 0);
  const passedCases = results.filter((item) => item && item.passed).length;
  const sampleSize = results.length;
  const passRate = sampleSize > 0 ? Number((passedCases / sampleSize).toFixed(4)) : 0;
  const avgLatencyMs = sampleSize > 0
    ? Number((results.reduce((sum, item) => sum + (Number(item.latencyMs) || 0), 0) / sampleSize).toFixed(2))
    : 0;

  return {
    suiteId: suite.suiteId,
    variant,
    startedAt,
    completedAt,
    durationMs: Math.max(0, Math.trunc(Number(completedAt) - Number(startedAt))),
    sampleSize,
    passedCases,
    failedCases: Math.max(0, sampleSize - passedCases),
    passRate,
    score: Number(score.toFixed(4)),
    maxScore: Number(maxScore.toFixed(4)),
    scoreRate: maxScore > 0 ? Number((score / maxScore).toFixed(4)) : 0,
    avgLatencyMs,
    cases: results,
  };
}

function compareEvalRuns(runA, runB) {
  const left = runA && typeof runA === "object" ? runA : null;
  const right = runB && typeof runB === "object" ? runB : null;
  if (!left || !right) {
    return { winner: "unknown", reason: "missing_run" };
  }
  if (left.scoreRate !== right.scoreRate) {
    return {
      winner: left.scoreRate > right.scoreRate ? "A" : "B",
      reason: "score_rate",
      delta: Number((left.scoreRate - right.scoreRate).toFixed(4)),
    };
  }
  if (left.passRate !== right.passRate) {
    return {
      winner: left.passRate > right.passRate ? "A" : "B",
      reason: "pass_rate",
      delta: Number((left.passRate - right.passRate).toFixed(4)),
    };
  }
  if (left.avgLatencyMs !== right.avgLatencyMs) {
    return {
      winner: left.avgLatencyMs < right.avgLatencyMs ? "A" : "B",
      reason: "avg_latency_ms",
      delta: Number((right.avgLatencyMs - left.avgLatencyMs).toFixed(2)),
    };
  }
  return {
    winner: "tie",
    reason: "all_equal",
    delta: 0,
  };
}

module.exports = {
  defaultEvalSuitePath,
  normalizeEvalSuite,
  loadEvalSuiteFromFile,
  evaluateEvalCaseOutput,
  summarizeEvalCaseResult,
  buildEvalRunSummary,
  compareEvalRuns,
  allowedEvalDrivers,
};
