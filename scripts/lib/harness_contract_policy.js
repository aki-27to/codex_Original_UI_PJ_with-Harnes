"use strict";

const fs = require("fs");
const path = require("path");

const defaultHarnessTurnContractSpecPath = path.join(__dirname, "..", "config", "harness_contract_spec.json");

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

function normalizeStateList(values, fallback = ["in_progress", "completed", "interrupted", "failed"]) {
  if (!Array.isArray(values)) {
    return fallback.slice();
  }
  const unique = [];
  for (const entry of values) {
    const normalized = safeString(entry, 60).toLowerCase();
    if (!normalized) {
      continue;
    }
    if (!unique.includes(normalized)) {
      unique.push(normalized);
    }
  }
  return unique.length ? unique : fallback.slice();
}

function normalizeTransitionList(transitions) {
  if (!Array.isArray(transitions)) {
    return [];
  }
  const result = [];
  for (const item of transitions) {
    if (!item || typeof item !== "object") {
      continue;
    }
    const from = safeString(item.from, 60).toLowerCase();
    const to = safeString(item.to, 60).toLowerCase();
    if (!from || !to) {
      continue;
    }
    result.push({ from, to });
  }
  return result;
}

function normalizeTaskOutcomeBridge(input) {
  const source = input && typeof input === "object" ? input : {};
  const allowedByTurnState = {};
  for (const [turnState, values] of Object.entries(source.allowedByTurnState || {})) {
    const normalizedTurnState = safeString(turnState, 60).toLowerCase();
    if (!normalizedTurnState || !Array.isArray(values)) {
      continue;
    }
    const unique = [];
    for (const value of values) {
      const normalizedValue = safeString(value, 80).toUpperCase().replace(/[\s-]+/g, "_");
      if (!normalizedValue || unique.includes(normalizedValue)) {
        continue;
      }
      unique.push(normalizedValue);
    }
    if (unique.length) {
      allowedByTurnState[normalizedTurnState] = unique;
    }
  }
  if (!Object.keys(allowedByTurnState).length) {
    allowedByTurnState.completed = ["COMPLETED", "PARTIAL"];
    allowedByTurnState.interrupted = ["BLOCKED", "NEEDS_INPUT"];
    allowedByTurnState.failed = ["FAILED_VALIDATION", "BLOCKED", "NEEDS_INPUT"];
  }
  return {
    allowedByTurnState,
  };
}

function normalizeHarnessTurnContractSpec(input) {
  const payload = input && typeof input === "object" ? input : {};
  const turn = payload.turn && typeof payload.turn === "object" ? payload.turn : {};
  const states = normalizeStateList(turn.states);
  const terminalStates = normalizeStateList(turn.terminalStates, ["completed", "interrupted", "failed"]);
  const terminalEvent = safeString(turn.terminalEvent, 120) || "turn/completed";
  const transitions = normalizeTransitionList(turn.transitions);

  return {
    schema: "harness-turn-contract.v1",
    turn: {
      states,
      terminalStates,
      terminalEvent,
      transitions: transitions.length
        ? transitions
        : terminalStates.map((terminal) => ({ from: "in_progress", to: terminal })),
    },
    taskOutcomeBridge: normalizeTaskOutcomeBridge(payload.taskOutcomeBridge),
  };
}

function loadHarnessTurnContractSpec(filePath = defaultHarnessTurnContractSpecPath) {
  const absolutePath = path.resolve(filePath);
  const raw = fs.readFileSync(absolutePath, "utf8");
  const parsed = raw ? JSON.parse(raw) : {};
  return normalizeHarnessTurnContractSpec(parsed);
}

function validateTurnTransition({ from, to, spec }) {
  const contract = normalizeHarnessTurnContractSpec(spec);
  const source = safeString(from, 60).toLowerCase() || "in_progress";
  const target = safeString(to, 60).toLowerCase();
  if (!target) {
    return { ok: false, reason: "missing_target_state" };
  }
  if (!contract.turn.states.includes(target)) {
    return { ok: false, reason: "target_state_not_allowed", from: source, to: target };
  }
  const matched = contract.turn.transitions.some((entry) => entry.from === source && entry.to === target);
  return {
    ok: matched,
    reason: matched ? "ok" : "transition_not_allowed",
    from: source,
    to: target,
  };
}

function validateTurnTerminalContract({ status, terminalEvent, spec }) {
  const contract = normalizeHarnessTurnContractSpec(spec);
  const normalizedStatus = safeString(status, 60).toLowerCase();
  const normalizedEvent = safeString(terminalEvent, 120) || contract.turn.terminalEvent;
  const statusOk = contract.turn.terminalStates.includes(normalizedStatus);
  const eventOk = normalizedEvent === contract.turn.terminalEvent;
  return {
    ok: Boolean(statusOk && eventOk),
    reason: statusOk
      ? eventOk
        ? "ok"
        : "terminal_event_mismatch"
      : "terminal_state_not_allowed",
    status: normalizedStatus,
    terminalEvent: normalizedEvent,
    expectedTerminalEvent: contract.turn.terminalEvent,
  };
}

function validateTurnTaskOutcomeContract({ turnStatus, taskOutcomeStatus, spec }) {
  const contract = normalizeHarnessTurnContractSpec(spec);
  const normalizedTurnStatus = safeString(turnStatus, 60).toLowerCase();
  const normalizedTaskOutcomeStatus = safeString(taskOutcomeStatus, 80).toUpperCase().replace(/[\s-]+/g, "_");
  if (!normalizedTurnStatus) {
    return { ok: false, reason: "missing_turn_state", turnStatus: "", taskOutcomeStatus: normalizedTaskOutcomeStatus };
  }
  if (!normalizedTaskOutcomeStatus) {
    return { ok: false, reason: "missing_task_outcome_status", turnStatus: normalizedTurnStatus, taskOutcomeStatus: "" };
  }
  const allowed = Array.isArray(contract.taskOutcomeBridge.allowedByTurnState[normalizedTurnStatus])
    ? contract.taskOutcomeBridge.allowedByTurnState[normalizedTurnStatus]
    : [];
  const ok = allowed.includes(normalizedTaskOutcomeStatus);
  return {
    ok,
    reason: ok ? "ok" : "task_outcome_bridge_mismatch",
    turnStatus: normalizedTurnStatus,
    taskOutcomeStatus: normalizedTaskOutcomeStatus,
    allowedStatuses: allowed,
  };
}

module.exports = {
  defaultHarnessTurnContractSpecPath,
  normalizeHarnessTurnContractSpec,
  loadHarnessTurnContractSpec,
  validateTurnTransition,
  validateTurnTerminalContract,
  validateTurnTaskOutcomeContract,
};
