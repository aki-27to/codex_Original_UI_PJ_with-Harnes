"use strict";

const fs = require("fs");
const path = require("path");

const defaultTaskOutcomeContractPath = path.join(__dirname, "..", "config", "task_outcome_contract.json");

const defaultTaskOutcomeContractDefinition = Object.freeze({
  schema: "task-outcome-contract.v1",
  version: "2026-03-13.r4",
  statuses: [
    { id: "COMPLETED", class: "success", terminal: true },
    { id: "BLOCKED", class: "blocked", terminal: true },
    { id: "NEEDS_INPUT", class: "needs_input", terminal: true },
    { id: "FAILED_VALIDATION", class: "validation_failure", terminal: true },
    { id: "PARTIAL", class: "partial", terminal: true },
  ],
  turnStateDefaults: {
    completed: "COMPLETED",
    interrupted: "BLOCKED",
    failed: "BLOCKED",
  },
  turnStateHints: {
    completed: ["COMPLETED", "PARTIAL"],
    interrupted: ["BLOCKED", "NEEDS_INPUT"],
    failed: ["FAILED_VALIDATION", "BLOCKED", "NEEDS_INPUT"],
  },
  reasonMap: {
    interactive_approval_unavailable: "NEEDS_INPUT",
    high_risk_requires_request: "NEEDS_INPUT",
    danger_full_access_high_risk_guard: "NEEDS_INPUT",
    legacy_only_requires_parent_override: "BLOCKED",
    path_out_of_scope: "BLOCKED",
    verification_scope_violation: "BLOCKED",
    agent_read_only_role: "BLOCKED",
    parent_dispatch_guard_block: "FAILED_VALIDATION",
    missing_required_evidence: "FAILED_VALIDATION",
    intent_taste_memory_missing: "FAILED_VALIDATION",
    intent_benchmark_missing: "FAILED_VALIDATION",
    intent_workspace_lock_missing: "FAILED_VALIDATION",
    intent_visual_review_missing: "FAILED_VALIDATION",
    intent_reviewer_missing: "FAILED_VALIDATION",
    intent_technical_verification_missing: "FAILED_VALIDATION",
    intent_documentation_sync_missing: "FAILED_VALIDATION",
    intent_first_gate_missing: "FAILED_VALIDATION",
    workspace_lock_required: "NEEDS_INPUT",
    visual_review_missing: "FAILED_VALIDATION",
    benchmark_superiority_unproven: "FAILED_VALIDATION",
    partial_delivery: "PARTIAL",
  },
});

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

function normalizeBoolean(value, fallback = false) {
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value === "number") {
    return Number.isFinite(value) ? value !== 0 : fallback;
  }
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["1", "true", "yes", "on"].includes(normalized)) {
      return true;
    }
    if (["0", "false", "no", "off"].includes(normalized)) {
      return false;
    }
  }
  return fallback;
}

function normalizeStatusId(value) {
  return safeString(value, 80)
    .toUpperCase()
    .replace(/[\s-]+/g, "_");
}

function normalizeReasonToken(value) {
  return safeString(value, 120)
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
}

function normalizeTurnState(value) {
  const normalized = safeString(value, 60).toLowerCase();
  if (normalized === "completed") {
    return "completed";
  }
  if (normalized === "failed") {
    return "failed";
  }
  if (normalized === "interrupted" || normalized === "cancelled" || normalized === "canceled") {
    return "interrupted";
  }
  if (normalized === "in_progress" || normalized === "inprogress" || normalized === "queued" || normalized === "pending" || normalized === "running") {
    return "in_progress";
  }
  return "";
}

function normalizeStatusEntries(values) {
  const source = Array.isArray(values) ? values : defaultTaskOutcomeContractDefinition.statuses;
  const entries = [];
  const seen = new Set();
  for (const value of source) {
    const raw = value && typeof value === "object" ? value : {};
    const id = normalizeStatusId(raw.id || raw.status);
    if (!id || seen.has(id)) {
      continue;
    }
    seen.add(id);
    entries.push(Object.freeze({
      id,
      class: safeString(raw.class, 80).toLowerCase() || "unknown",
      terminal: normalizeBoolean(raw.terminal, true),
    }));
  }
  return entries.length ? entries : defaultTaskOutcomeContractDefinition.statuses.slice();
}

function normalizeTurnStateDefaults(input, validStatusIds) {
  const source = input && typeof input === "object" ? input : defaultTaskOutcomeContractDefinition.turnStateDefaults;
  const out = {};
  for (const [turnState, statusId] of Object.entries(source)) {
    const normalizedTurnState = normalizeTurnState(turnState);
    const normalizedStatus = normalizeStatusId(statusId);
    if (!normalizedTurnState || !validStatusIds.has(normalizedStatus)) {
      continue;
    }
    out[normalizedTurnState] = normalizedStatus;
  }
  for (const [turnState, statusId] of Object.entries(defaultTaskOutcomeContractDefinition.turnStateDefaults)) {
    if (!Object.prototype.hasOwnProperty.call(out, turnState)) {
      out[turnState] = statusId;
    }
  }
  return Object.freeze(out);
}

function normalizeTurnStateHints(input, validStatusIds) {
  const source = input && typeof input === "object" ? input : defaultTaskOutcomeContractDefinition.turnStateHints;
  const out = {};
  for (const [turnState, values] of Object.entries(source)) {
    const normalizedTurnState = normalizeTurnState(turnState);
    if (!normalizedTurnState || !Array.isArray(values)) {
      continue;
    }
    const unique = [];
    for (const value of values) {
      const normalizedStatus = normalizeStatusId(value);
      if (!normalizedStatus || !validStatusIds.has(normalizedStatus) || unique.includes(normalizedStatus)) {
        continue;
      }
      unique.push(normalizedStatus);
    }
    if (unique.length) {
      out[normalizedTurnState] = Object.freeze(unique);
    }
  }
  for (const [turnState, values] of Object.entries(defaultTaskOutcomeContractDefinition.turnStateHints)) {
    if (!Object.prototype.hasOwnProperty.call(out, turnState)) {
      out[turnState] = Object.freeze(values.slice());
    }
  }
  return Object.freeze(out);
}

function normalizeReasonMap(input, validStatusIds) {
  const source = input && typeof input === "object" ? input : defaultTaskOutcomeContractDefinition.reasonMap;
  const out = {};
  for (const [rawReason, rawStatus] of Object.entries(source)) {
    const reason = normalizeReasonToken(rawReason);
    const status = normalizeStatusId(rawStatus);
    if (!reason || !status || !validStatusIds.has(status)) {
      continue;
    }
    out[reason] = status;
  }
  for (const [rawReason, rawStatus] of Object.entries(defaultTaskOutcomeContractDefinition.reasonMap)) {
    if (!Object.prototype.hasOwnProperty.call(out, rawReason)) {
      out[rawReason] = rawStatus;
    }
  }
  return Object.freeze(out);
}

function normalizeTaskOutcomeContract(input) {
  const payload = input && typeof input === "object" ? input : {};
  const statuses = normalizeStatusEntries(payload.statuses);
  const validStatusIds = new Set(statuses.map((entry) => entry.id));
  return Object.freeze({
    schema: safeString(payload.schema, 120) || defaultTaskOutcomeContractDefinition.schema,
    version: safeString(payload.version, 120) || defaultTaskOutcomeContractDefinition.version,
    statuses: Object.freeze(statuses),
    turnStateDefaults: normalizeTurnStateDefaults(payload.turnStateDefaults, validStatusIds),
    turnStateHints: normalizeTurnStateHints(payload.turnStateHints, validStatusIds),
    reasonMap: normalizeReasonMap(payload.reasonMap, validStatusIds),
  });
}

function loadTaskOutcomeContract(filePath = defaultTaskOutcomeContractPath) {
  const absolutePath = path.resolve(filePath);
  const raw = fs.readFileSync(absolutePath, "utf8");
  const parsed = raw ? JSON.parse(raw) : {};
  return normalizeTaskOutcomeContract(parsed);
}

function validateTaskOutcomeStatus({ status, spec }) {
  const contract = normalizeTaskOutcomeContract(spec);
  const normalizedStatus = normalizeStatusId(status);
  if (!normalizedStatus) {
    return { ok: false, reason: "missing_task_outcome_status", status: "" };
  }
  if (!contract.statuses.some((entry) => entry.id === normalizedStatus)) {
    return { ok: false, reason: "task_outcome_status_not_allowed", status: normalizedStatus };
  }
  return { ok: true, reason: "ok", status: normalizedStatus };
}

function validateTaskOutcomeTurnCompatibility({ turnStatus, taskOutcomeStatus, spec }) {
  const contract = normalizeTaskOutcomeContract(spec);
  const normalizedTurnState = normalizeTurnState(turnStatus);
  const normalizedOutcome = normalizeStatusId(taskOutcomeStatus);
  if (!normalizedTurnState) {
    return { ok: false, reason: "missing_turn_state", turnState: "", taskOutcomeStatus: normalizedOutcome };
  }
  const statusValidation = validateTaskOutcomeStatus({ status: normalizedOutcome, spec: contract });
  if (!statusValidation.ok) {
    return {
      ok: false,
      reason: statusValidation.reason,
      turnState: normalizedTurnState,
      taskOutcomeStatus: normalizedOutcome,
    };
  }
  const allowedStatuses = Array.isArray(contract.turnStateHints[normalizedTurnState])
    ? contract.turnStateHints[normalizedTurnState]
    : [];
  const allowed = allowedStatuses.includes(statusValidation.status);
  return {
    ok: allowed,
    reason: allowed ? "ok" : "task_outcome_turn_state_mismatch",
    turnState: normalizedTurnState,
    taskOutcomeStatus: statusValidation.status,
    allowedStatuses,
  };
}

function summarizeTaskOutcomeContract(spec) {
  const contract = normalizeTaskOutcomeContract(spec);
  return {
    schema: contract.schema,
    version: contract.version,
    statuses: contract.statuses.map((entry) => entry.id),
    turnStateDefaults: contract.turnStateDefaults,
    turnStateHints: contract.turnStateHints,
    reasonMapKeys: Object.keys(contract.reasonMap).slice(0, 32),
  };
}

function classifyErrorReason(errorText) {
  const text = safeString(errorText, 2400).toLowerCase();
  if (!text) {
    return "";
  }
  if (
    (text.includes("non-interactive") && text.includes("approval")) ||
    (text.includes("non interactive") && text.includes("approval")) ||
    (text.includes("cannot prompt") && text.includes("approval")) ||
    (text.includes("approval required") && text.includes("non-interactive")) ||
    text.includes("requestuserinput")
  ) {
    return "interactive_approval_unavailable";
  }
  if (text.includes("parent dispatch guard")) {
    return "parent_dispatch_guard_block";
  }
  if (text.includes("intent-first")) {
    return "missing_required_evidence";
  }
  if (text.includes("missing evidence")) {
    return "missing_required_evidence";
  }
  return "";
}

function deriveTaskOutcome(input = {}) {
  const contract = normalizeTaskOutcomeContract(input.spec);
  const explicitStatus = normalizeStatusId(input.explicitStatus);
  const explicitValidation = validateTaskOutcomeStatus({ status: explicitStatus, spec: contract });
  if (explicitValidation.ok) {
    return {
      status: explicitValidation.status,
      reason: normalizeReasonToken(input.reason) || "explicit_status",
      source: "explicit_status",
      turnState: normalizeTurnState(input.turnStatus),
    };
  }

  const reasonCandidates = [];
  const pushReason = (value) => {
    const normalized = normalizeReasonToken(value);
    if (!normalized || reasonCandidates.includes(normalized)) {
      return;
    }
    reasonCandidates.push(normalized);
  };

  pushReason(input.reason);
  pushReason(input.approvalReason);
  pushReason(input.governanceReason);
  pushReason(classifyErrorReason(input.errorText));
  if (input.parentDispatchViolation) {
    pushReason("parent_dispatch_guard_block");
  }
  if (input.missingEvidence) {
    pushReason("missing_required_evidence");
  }
  if (input.partial) {
    pushReason("partial_delivery");
  }

  for (const reason of reasonCandidates) {
    if (Object.prototype.hasOwnProperty.call(contract.reasonMap, reason)) {
      return {
        status: contract.reasonMap[reason],
        reason,
        source: "reason_map",
        turnState: normalizeTurnState(input.turnStatus),
      };
    }
  }

  const normalizedTurnState = normalizeTurnState(input.turnStatus);
  if (normalizedTurnState && Object.prototype.hasOwnProperty.call(contract.turnStateDefaults, normalizedTurnState)) {
    return {
      status: contract.turnStateDefaults[normalizedTurnState],
      reason: `${normalizedTurnState}_default`,
      source: "turn_state_default",
      turnState: normalizedTurnState,
    };
  }

  return {
    status: "BLOCKED",
    reason: "fallback_default",
    source: "fallback",
    turnState: normalizedTurnState,
  };
}

module.exports = {
  defaultTaskOutcomeContractPath,
  deriveTaskOutcome,
  loadTaskOutcomeContract,
  normalizeTaskOutcomeContract,
  normalizeTaskOutcomeStatus: normalizeStatusId,
  summarizeTaskOutcomeContract,
  validateTaskOutcomeTurnCompatibility,
  validateTaskOutcomeStatus,
};
