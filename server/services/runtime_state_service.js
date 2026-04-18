"use strict";

function createRuntimeStateService(deps) {
  const {
    listAgentsSnapshot,
    getLatestTurnSnapshot,
    getActiveExecRequestCount,
  } = deps;

  function toInt(value) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? Math.max(0, Math.trunc(parsed)) : 0;
  }

  function normalizeTurn(turn) {
    if (!turn || typeof turn !== "object") {
      return null;
    }
    const status = typeof (turn.terminal_status || turn.terminalStatus || turn.status) === "string"
      ? String(turn.terminal_status || turn.terminalStatus || turn.status).trim().toLowerCase()
      : "";
    const normalized = {
      turnId: typeof (turn.turn_id || turn.turnId) === "string" ? String(turn.turn_id || turn.turnId).trim() : "",
      threadId: typeof (turn.thread_id || turn.threadId) === "string" ? String(turn.thread_id || turn.threadId).trim() : "",
      agentName: typeof (turn.agent_name || turn.agentName) === "string" ? String(turn.agent_name || turn.agentName).trim() : "",
      status,
      startedAt: toInt(turn.started_at || turn.startedAt || turn.created_at || turn.createdAt || turn.updated_at || turn.updatedAt),
      completedAt: toInt(turn.completed_at || turn.completedAt || turn.updated_at || turn.updatedAt),
    };
    normalized.terminal = ["completed", "failed", "interrupted", "aborted", "needs_input"].includes(status);
    return normalized;
  }

  function activeEntryMatchesTerminalLatestTurn(entry, latestTurn) {
    if (!entry || typeof entry !== "object" || !latestTurn || !latestTurn.terminal) {
      return false;
    }
    const turnId = typeof entry.activeTurnId === "string"
      ? entry.activeTurnId.trim()
      : (typeof entry.turnId === "string" ? entry.turnId.trim() : "");
    const threadId = typeof entry.threadId === "string" ? entry.threadId.trim() : "";
    const sessionRef = typeof entry.sessionRef === "string" ? entry.sessionRef.trim() : "";
    const agentName = typeof (entry.name || entry.agentName) === "string" ? String(entry.name || entry.agentName).trim() : "";
    if (turnId && latestTurn.turnId && turnId === latestTurn.turnId) {
      return true;
    }
    if (
      agentName
      && latestTurn.agentName
      && agentName === latestTurn.agentName
      && latestTurn.threadId
      && ((threadId && threadId === latestTurn.threadId) || (sessionRef && sessionRef === latestTurn.threadId))
    ) {
      return true;
    }
    return false;
  }

  function buildTurnRuntimeSnapshot() {
    const agents = Array.isArray(listAgentsSnapshot()) ? listAgentsSnapshot() : [];
    const latestTurn = normalizeTurn(getLatestTurnSnapshot());
    const activeTurns = agents
      .filter((entry) => entry && typeof entry === "object" && typeof entry.activeTurnId === "string" && entry.activeTurnId.trim())
      .filter((entry) => !activeEntryMatchesTerminalLatestTurn(entry, latestTurn))
      .map((entry) => ({
        agentName: typeof entry.name === "string" ? entry.name : "",
        threadId: typeof entry.threadId === "string" ? entry.threadId : "",
        sessionRef: typeof entry.sessionRef === "string" ? entry.sessionRef : "",
        turnId: entry.activeTurnId,
      }));
    return {
      sourceOfTruth: "server_runtime",
      activeExecRequests: toInt(getActiveExecRequestCount()),
      activeTurns,
      latestTurn,
      terminalLatestTurn: latestTurn && latestTurn.terminal ? latestTurn : null,
    };
  }

  return Object.freeze({
    buildTurnRuntimeSnapshot,
  });
}

module.exports = {
  createRuntimeStateService,
};
