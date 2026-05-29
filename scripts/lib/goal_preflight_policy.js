"use strict";

const fs = require("fs");
const path = require("path");

const defaultGoalPreflightContractPath = path.join(__dirname, "..", "config", "goal_preflight_contract.json");

function safeString(value, max = 4000) {
  if (typeof value !== "string") {
    return "";
  }
  return value.trim().slice(0, max);
}

function normalizeList(value) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((entry) => {
      if (typeof entry === "string") {
        return entry.trim();
      }
      if (entry && typeof entry === "object") {
        return Object.values(entry)
          .map((nested) => (typeof nested === "string" ? nested.trim() : ""))
          .filter(Boolean)
          .join(" ");
      }
      return "";
    })
    .filter(Boolean);
}

function normalizePattern(pattern) {
  return safeString(pattern, 200).toLowerCase();
}

function loadGoalPreflightContract(filePath = defaultGoalPreflightContractPath) {
  const raw = fs.readFileSync(path.resolve(filePath), "utf8");
  return JSON.parse(raw);
}

function normalizeGoalPreflightSpec(input) {
  const source = input && typeof input === "object" ? input : {};
  return {
    objective: safeString(source.objective || source.goal, 4000),
    endState: safeString(source.endState || source.end_state || source.doneWhen || source.done_when, 4000),
    statedChecks: normalizeList(source.statedChecks || source.stated_checks || source.checks || source.acceptanceChecks),
    constraints: normalizeList(source.constraints),
    nonGoals: normalizeList(source.nonGoals || source.non_goals),
    evaluator: safeString(source.evaluator || source.reviewer || source.tester, 1000),
    evidencePlan: normalizeList(source.evidencePlan || source.evidence_plan || source.evidence),
    stopControls: normalizeList(source.stopControls || source.stop_controls || source.stop),
    doneWhen: safeString(source.doneWhen || source.done_when, 4000),
  };
}

function fieldIsMissing(input, field) {
  const value = input ? input[field] : undefined;
  if (Array.isArray(value)) {
    return value.length === 0;
  }
  if (value && typeof value === "object") {
    return Object.keys(value).length === 0;
  }
  return safeString(value).length === 0;
}

function checkHasObservableMarker(checkText, markers) {
  const text = safeString(checkText, 4000).toLowerCase();
  if (!text) {
    return false;
  }
  return markers.some((marker) => {
    const normalizedMarker = safeString(marker, 80).toLowerCase();
    return normalizedMarker && text.includes(normalizedMarker);
  });
}

function validateGoalPreflight(input, contract = loadGoalPreflightContract()) {
  const spec = contract && typeof contract === "object" ? contract : {};
  const normalizedInput = normalizeGoalPreflightSpec(input);
  const requiredFields = Array.isArray(spec.requiredFields) ? spec.requiredFields : [];
  const observableMarkers = Array.isArray(spec.observableCheckMarkers) ? spec.observableCheckMarkers : [];
  const rejectPatterns = Array.isArray(spec.subjectiveDoneWhenRejectPatterns)
    ? spec.subjectiveDoneWhenRejectPatterns.map(normalizePattern).filter(Boolean)
    : [];

  const missingFields = requiredFields.filter((field) => fieldIsMissing(normalizedInput, field));
  const statedChecks = normalizeList(normalizedInput && normalizedInput.statedChecks);
  const minimumStatedChecks = Number.isFinite(spec.minimumStatedChecks) ? spec.minimumStatedChecks : 1;
  const weakChecks = statedChecks.filter((entry) => !checkHasObservableMarker(entry, observableMarkers));
  const searchableText = [
    safeString(normalizedInput && normalizedInput.endState, 4000),
    safeString(normalizedInput && normalizedInput.doneWhen, 4000),
    safeString(normalizedInput && normalizedInput.objective, 4000),
  ].join("\n").toLowerCase();
  const subjectiveHits = rejectPatterns.filter((pattern) => pattern && searchableText.includes(pattern));

  const reasons = [];
  if (missingFields.length) {
    reasons.push("missing_required_field");
  }
  if (statedChecks.length < minimumStatedChecks || weakChecks.length) {
    reasons.push("missing_observable_check");
  }
  if (subjectiveHits.length) {
    reasons.push("subjective_done_when");
  }
  if (fieldIsMissing(normalizedInput, "evidencePlan")) {
    reasons.push("missing_evidence_plan");
  }
  if (fieldIsMissing(normalizedInput, "stopControls")) {
    reasons.push("missing_stop_controls");
  }

  const uniqueReasons = [...new Set(reasons)];
  return {
    ok: uniqueReasons.length === 0,
    status: uniqueReasons.length === 0 ? "READY_FOR_LONG_RUN" : "FAILED_VALIDATION",
    reasons: uniqueReasons,
    missingFields,
    weakChecks,
    subjectiveHits,
    requiredFields,
  };
}

function buildGoalPreflightRecord({
  input,
  contract = loadGoalPreflightContract(),
  operation = "set",
  threadId = "",
  agentName = "",
  source = "runtime",
  rawInput = "",
  generatedAt = new Date().toISOString(),
  artifactPath = "runtime/goal_preflight.json",
} = {}) {
  const normalizedInput = normalizeGoalPreflightSpec(input);
  const validation = validateGoalPreflight(normalizedInput, contract);
  return {
    schema: "goal-preflight-runtime.v1",
    version: safeString(contract && contract.version, 80) || "unknown",
    generatedAt,
    scope: "goal_preflight",
    source,
    operation,
    threadId: safeString(threadId, 160),
    agentName: safeString(agentName, 120),
    artifactPath,
    status: validation.status,
    readyForLongRun: validation.ok,
    objective: normalizedInput.objective,
    input: normalizedInput,
    rawInput: safeString(rawInput, 4000),
    reasons: validation.reasons,
    missingFields: validation.missingFields,
    weakChecks: validation.weakChecks,
    subjectiveHits: validation.subjectiveHits,
    requiredFields: validation.requiredFields,
  };
}

module.exports = {
  buildGoalPreflightRecord,
  defaultGoalPreflightContractPath,
  loadGoalPreflightContract,
  normalizeGoalPreflightSpec,
  validateGoalPreflight,
};
