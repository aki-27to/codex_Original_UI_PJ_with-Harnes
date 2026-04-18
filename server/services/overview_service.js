"use strict";

function createOverviewService(deps) {
  const {
    sendJson,
    buildIntentFirstApiSnapshot,
    buildHarnessOverviewSnapshot,
    getConversationRuntimeSnapshot,
    normalizeConversationPersonaUserId,
    getConversationPersonaContextForUser,
    getAgentTopographySnapshot,
    inspectContinuityTask,
    workspaceRoot,
    safeString,
    getDiagnosticsSnapshot,
    buildSloRuntimeSnapshot,
    maybeEmitSloAlert,
  } = deps;

  function handleIntentProfileSnapshotRequest({ res }) {
    sendJson(res, 200, buildIntentFirstApiSnapshot());
  }

  function handleHarnessOverviewRequest({ res }) {
    sendJson(res, 200, buildHarnessOverviewSnapshot());
  }

  function handleConversationRuntimeRequest({ res }) {
    sendJson(res, 200, getConversationRuntimeSnapshot());
  }

  function handleConversationPersonaMemoryRequest({ res, url }) {
    try {
      const personaUserId = normalizeConversationPersonaUserId(url.searchParams.get("personaUserId"));
      const snapshot = getConversationPersonaContextForUser(personaUserId);
      sendJson(res, 200, {
        ok: true,
        mode: "persona_friend",
        persona: {
          userId: snapshot.userId,
          memory: snapshot.summary,
        },
      });
    } catch (error) {
      sendJson(res, 500, {
        ok: false,
        error: error && error.message ? error.message : String(error),
      });
    }
  }

  function handleAgentTopographyRequest({ res }) {
    sendJson(res, 200, { agents: getAgentTopographySnapshot() });
  }

  function handleContinuityTaskRequest({ res, url }) {
    try {
      const taskId = safeString(
        url.searchParams.get("task_id") || url.searchParams.get("taskId"),
        120
      );
      if (!taskId) {
        sendJson(res, 400, { ok: false, error: "task_id is required" });
        return;
      }
      const sessionId = safeString(
        url.searchParams.get("session_id") || url.searchParams.get("sessionId"),
        120
      );
      const requestedMode = safeString(url.searchParams.get("mode"), 80) || "operating_summary";
      const limitRaw = Number(url.searchParams.get("limit"));
      const limit = Number.isFinite(limitRaw)
        ? Math.max(1, Math.min(256, Math.trunc(limitRaw)))
        : null;
      const payload = inspectContinuityTask({
        workspaceRoot,
        taskId,
        sessionId,
        mode: requestedMode,
        limit,
      });
      if (payload && payload.ok === false) {
        const errorCode = safeString(payload.errorCode, 120);
        const statusCode = errorCode.startsWith("continuity_task_not_found") ? 404 : 409;
        sendJson(res, statusCode, payload);
        return;
      }
      sendJson(res, 200, {
        ok: true,
        taskId,
        sessionId: sessionId || "",
        mode: requestedMode,
        payload,
      });
    } catch (error) {
      const message = safeString(error && error.message ? error.message : String(error), 600);
      const statusCode = message.startsWith("continuity_task_not_found") ? 404 : 400;
      sendJson(res, statusCode, { ok: false, error: message });
    }
  }

  function handleContinuityTasksRequest({ res, url }) {
    try {
      const requestedState = safeString(url.searchParams.get("state"), 80) || "all";
      const requestedMode = safeString(url.searchParams.get("mode"), 80);
      const limitRaw = Number(url.searchParams.get("limit"));
      const limit = Number.isFinite(limitRaw)
        ? Math.max(1, Math.min(256, Math.trunc(limitRaw)))
        : null;
      const modeMap = {
        all: "registry",
        active: "active_tasks",
        blocked: "blocked_tasks",
        verifier_failed: "verifier_failed_tasks",
        abandoned: "abandoned_tasks",
        archived: "archived_tasks",
      };
      const mode = modeMap[requestedState] || requestedMode || "registry";
      const payload = inspectContinuityTask({
        workspaceRoot,
        mode,
        limit,
      });
      if (payload && payload.ok === false) {
        sendJson(res, 409, payload);
        return;
      }
      sendJson(res, 200, {
        ok: true,
        state: requestedState,
        mode,
        payload,
      });
    } catch (error) {
      sendJson(res, 400, {
        ok: false,
        error: error && error.message ? error.message : String(error),
      });
    }
  }

  function handleDiagnosticsRequest({ res }) {
    sendJson(res, 200, getDiagnosticsSnapshot());
  }

  function handleSloStatusRequest({ res }) {
    const snapshot = buildSloRuntimeSnapshot();
    maybeEmitSloAlert(snapshot, { reason: "api_slo_status" });
    sendJson(res, 200, { ok: true, slo: snapshot });
  }

  return Object.freeze({
    handleIntentProfileSnapshotRequest,
    handleHarnessOverviewRequest,
    handleConversationRuntimeRequest,
    handleConversationPersonaMemoryRequest,
    handleAgentTopographyRequest,
    handleContinuityTaskRequest,
    handleContinuityTasksRequest,
    handleDiagnosticsRequest,
    handleSloStatusRequest,
  });
}

module.exports = {
  createOverviewService,
};
