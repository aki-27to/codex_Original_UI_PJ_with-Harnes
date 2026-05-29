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
  const requiredFields = Array.isArray(spec.requiredFields) ? spec.requiredFields : [];
  const observableMarkers = Array.isArray(spec.observableCheckMarkers) ? spec.observableCheckMarkers : [];
  const rejectPatterns = Array.isArray(spec.subjectiveDoneWhenRejectPatterns)
    ? spec.subjectiveDoneWhenRejectPatterns.map(normalizePattern).filter(Boolean)
    : [];

  const missingFields = requiredFields.filter((field) => fieldIsMissing(input, field));
  const statedChecks = normalizeList(input && input.statedChecks);
  const minimumStatedChecks = Number.isFinite(spec.minimumStatedChecks) ? spec.minimumStatedChecks : 1;
  const weakChecks = statedChecks.filter((entry) => !checkHasObservableMarker(entry, observableMarkers));
  const searchableText = [
    safeString(input && input.endState, 4000),
    safeString(input && input.doneWhen, 4000),
    safeString(input && input.objective, 4000),
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
  if (fieldIsMissing(input, "evidencePlan")) {
    reasons.push("missing_evidence_plan");
  }
  if (fieldIsMissing(input, "stopControls")) {
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

module.exports = {
  defaultGoalPreflightContractPath,
  loadGoalPreflightContract,
  validateGoalPreflight,
};
