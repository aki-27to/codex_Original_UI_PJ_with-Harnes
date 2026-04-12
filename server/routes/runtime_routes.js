"use strict";

function createRuntimeRoutes(ctx) {
  return [
    {
      method: "GET",
      match: (pathname) => pathname === "/api/intent/profile",
      async handle({ res }) {
        ctx.sendJson(res, 200, ctx.buildIntentFirstApiSnapshot());
      },
    },
    {
      method: "POST",
      match: (pathname) => pathname === "/api/intent/profile",
      async handle({ req, res }) {
        try {
          const validation = ctx.validateControlMutationRequest(req, {
            action: "exec",
            enforceActionAllowlist: false,
          });
          if (!validation.ok) {
            ctx.sendJson(res, validation.status, { ok: false, error: validation.error });
            return;
          }
          const contentTypeValidation = ctx.validateJsonMutationContentType(req, {
            required: true,
            expectedMime: ctx.execApiRequiredContentType,
          });
          if (!contentTypeValidation.ok) {
            ctx.sendJson(res, contentTypeValidation.status, {
              ok: false,
              error: contentTypeValidation.error,
            });
            return;
          }
          const raw = await ctx.readRequestBody(req, ctx.defaultRequestBodyLimitBytes);
          const body = raw ? JSON.parse(raw) : {};
          const action = ctx.safeString(body && body.action, 80).toLowerCase();
          if (action && action !== "update_intent_profile") {
            ctx.sendJson(res, 400, { ok: false, error: `unsupported action: ${action}` });
            return;
          }
          ctx.sendJson(
            res,
            200,
            ctx.updateIntentProfileStore(
              body && body.profile && typeof body.profile === "object" ? body.profile : {}
            )
          );
        } catch (error) {
          ctx.sendJson(res, 400, {
            ok: false,
            error: error && error.message ? error.message : String(error),
          });
        }
      },
    },
    {
      method: "POST",
      match: (pathname) => pathname === "/api/intent/profile/reset",
      async handle({ req, res }) {
        try {
          const validation = ctx.validateControlMutationRequest(req, {
            action: "exec",
            enforceActionAllowlist: false,
          });
          if (!validation.ok) {
            ctx.sendJson(res, validation.status, { ok: false, error: validation.error });
            return;
          }
          const contentTypeValidation = ctx.validateJsonMutationContentType(req, {
            required: true,
            expectedMime: ctx.execApiRequiredContentType,
          });
          if (!contentTypeValidation.ok) {
            ctx.sendJson(res, contentTypeValidation.status, {
              ok: false,
              error: contentTypeValidation.error,
            });
            return;
          }
          const raw = await ctx.readRequestBody(req, ctx.defaultRequestBodyLimitBytes);
          const body = raw ? JSON.parse(raw) : {};
          const action = ctx.safeString(body && body.action, 80).toLowerCase();
          if (action && action !== "reset_intent_profile") {
            ctx.sendJson(res, 400, { ok: false, error: `unsupported action: ${action}` });
            return;
          }
          ctx.sendJson(res, 200, ctx.resetIntentProfileStore());
        } catch (error) {
          ctx.sendJson(res, 400, {
            ok: false,
            error: error && error.message ? error.message : String(error),
          });
        }
      },
    },
    {
      method: "POST",
      match: (pathname) => pathname === "/api/workspace/lock",
      async handle({ req, res }) {
        try {
          const validation = ctx.validateControlMutationRequest(req, {
            action: "exec",
            enforceActionAllowlist: false,
          });
          if (!validation.ok) {
            ctx.sendJson(res, validation.status, { ok: false, error: validation.error });
            return;
          }
          const contentTypeValidation = ctx.validateJsonMutationContentType(req, {
            required: true,
            expectedMime: ctx.execApiRequiredContentType,
          });
          if (!contentTypeValidation.ok) {
            ctx.sendJson(res, contentTypeValidation.status, {
              ok: false,
              error: contentTypeValidation.error,
            });
            return;
          }
          const raw = await ctx.readRequestBody(req, ctx.defaultRequestBodyLimitBytes);
          const body = raw ? JSON.parse(raw) : {};
          const action = ctx.safeString(body && body.action, 80).toLowerCase();
          if (action !== "lock_workspace_directory") {
            ctx.sendJson(res, 400, {
              ok: false,
              error: `unsupported action: ${action || "(empty)"}`,
            });
            return;
          }
          const requestedPath = ctx.safeString(body && body.path, 2000);
          if (!requestedPath) {
            ctx.sendJson(res, 400, { ok: false, error: "path is required" });
            return;
          }
          ctx.sendJson(res, 200, ctx.lockWorkspaceDirectory(requestedPath));
        } catch (error) {
          ctx.sendJson(res, 400, {
            ok: false,
            error: error && error.message ? error.message : String(error),
          });
        }
      },
    },
    {
      method: "POST",
      match: (pathname) => pathname === "/api/workspace/unlock",
      async handle({ req, res }) {
        try {
          const validation = ctx.validateControlMutationRequest(req, {
            action: "exec",
            enforceActionAllowlist: false,
          });
          if (!validation.ok) {
            ctx.sendJson(res, validation.status, { ok: false, error: validation.error });
            return;
          }
          const contentTypeValidation = ctx.validateJsonMutationContentType(req, {
            required: true,
            expectedMime: ctx.execApiRequiredContentType,
          });
          if (!contentTypeValidation.ok) {
            ctx.sendJson(res, contentTypeValidation.status, {
              ok: false,
              error: contentTypeValidation.error,
            });
            return;
          }
          const raw = await ctx.readRequestBody(req, ctx.defaultRequestBodyLimitBytes);
          const body = raw ? JSON.parse(raw) : {};
          const action = ctx.safeString(body && body.action, 80).toLowerCase();
          if (action !== "unlock_workspace_directory") {
            ctx.sendJson(res, 400, {
              ok: false,
              error: `unsupported action: ${action || "(empty)"}`,
            });
            return;
          }
          ctx.sendJson(res, 200, ctx.unlockWorkspaceDirectory());
        } catch (error) {
          ctx.sendJson(res, 400, {
            ok: false,
            error: error && error.message ? error.message : String(error),
          });
        }
      },
    },
    {
      method: "GET",
      match: (pathname) => pathname === "/api/harness/overview",
      async handle({ res }) {
        ctx.sendJson(res, 200, ctx.buildHarnessOverviewSnapshot());
      },
    },
    {
      method: "GET",
      match: (pathname) => pathname === "/api/conversation/runtime",
      async handle({ res }) {
        ctx.sendJson(res, 200, ctx.getConversationRuntimeSnapshot());
      },
    },
    {
      method: "GET",
      match: (pathname) => pathname === "/api/conversation/persona/memory",
      async handle({ res, url }) {
        try {
          const personaUserId = ctx.normalizeConversationPersonaUserId(
            url.searchParams.get("personaUserId")
          );
          const snapshot = ctx.getConversationPersonaContextForUser(personaUserId);
          ctx.sendJson(res, 200, {
            ok: true,
            mode: "persona_friend",
            persona: {
              userId: snapshot.userId,
              memory: snapshot.summary,
            },
          });
        } catch (error) {
          ctx.sendJson(res, 500, {
            ok: false,
            error: error && error.message ? error.message : String(error),
          });
        }
      },
    },
    {
      method: "GET",
      match: (pathname) => pathname === "/api/agent-topography",
      async handle({ res }) {
        ctx.sendJson(res, 200, { agents: ctx.getAgentTopographySnapshot() });
      },
    },
    {
      method: "GET",
      match: (pathname) => pathname === "/api/continuity/task",
      async handle({ res, url }) {
        try {
          const taskId = ctx.safeString(
            url.searchParams.get("task_id") || url.searchParams.get("taskId"),
            120
          );
          if (!taskId) {
            ctx.sendJson(res, 400, { ok: false, error: "task_id is required" });
            return;
          }
          const sessionId = ctx.safeString(
            url.searchParams.get("session_id") || url.searchParams.get("sessionId"),
            120
          );
          const requestedMode = ctx.safeString(url.searchParams.get("mode"), 80) || "operating_summary";
          const limitRaw = Number(url.searchParams.get("limit"));
          const limit = Number.isFinite(limitRaw)
            ? Math.max(1, Math.min(256, Math.trunc(limitRaw)))
            : null;
          const payload = ctx.inspectContinuityTask({
            workspaceRoot: ctx.workspaceRoot,
            taskId,
            sessionId,
            mode: requestedMode,
            limit,
          });
          if (payload && payload.ok === false) {
            const errorCode = ctx.safeString(payload.errorCode, 120);
            const statusCode = errorCode.startsWith("continuity_task_not_found") ? 404 : 409;
            ctx.sendJson(res, statusCode, payload);
            return;
          }
          ctx.sendJson(res, 200, {
            ok: true,
            taskId,
            sessionId: sessionId || "",
            mode: requestedMode,
            payload,
          });
        } catch (error) {
          const message = ctx.safeString(
            error && error.message ? error.message : String(error),
            600
          );
          const statusCode = message.startsWith("continuity_task_not_found") ? 404 : 400;
          ctx.sendJson(res, statusCode, { ok: false, error: message });
        }
      },
    },
    {
      method: "GET",
      match: (pathname) => pathname === "/api/continuity/tasks",
      async handle({ res, url }) {
        try {
          const requestedState = ctx.safeString(url.searchParams.get("state"), 80) || "all";
          const requestedMode = ctx.safeString(url.searchParams.get("mode"), 80);
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
          const payload = ctx.inspectContinuityTask({
            workspaceRoot: ctx.workspaceRoot,
            mode,
            limit,
          });
          if (payload && payload.ok === false) {
            ctx.sendJson(res, 409, payload);
            return;
          }
          ctx.sendJson(res, 200, {
            ok: true,
            state: requestedState,
            mode,
            payload,
          });
        } catch (error) {
          ctx.sendJson(res, 400, {
            ok: false,
            error: error && error.message ? error.message : String(error),
          });
        }
      },
    },
    {
      method: "POST",
      match: (pathname) => pathname === "/api/requirement-guard/validate",
      async handle({ req, res }) {
        try {
          const raw = await ctx.readRequestBody(req);
          const body = raw ? JSON.parse(raw) : {};
          const inputValue = Object.prototype.hasOwnProperty.call(
            body,
            ctx.requirementGuardMatcherDefaults.inputKey
          )
            ? body[ctx.requirementGuardMatcherDefaults.inputKey]
            : body.inputValue;
          if (inputValue === undefined) {
            ctx.sendJson(res, 400, {
              ok: false,
              error: `${ctx.requirementGuardMatcherDefaults.inputKey} is required`,
            });
            return;
          }
          const result = ctx.evaluateRequirementGuardMatch(inputValue);
          const matcher = ctx.getRequirementGuardMatcherSnapshot();
          ctx.sendJson(res, 200, {
            ok: true,
            requirement: {
              id: ctx.requirementGuardExtensionConfig.id,
              originalRequirement: ctx.requirementGuardOriginalRequirement,
            },
            matcher,
            result,
          });
        } catch (error) {
          ctx.sendJson(res, 400, {
            ok: false,
            error: error && error.message ? error.message : String(error),
          });
        }
      },
    },
    {
      method: "GET",
      match: (pathname) => pathname === "/api/diagnostics",
      async handle({ res }) {
        ctx.sendJson(res, 200, ctx.getDiagnosticsSnapshot());
      },
    },
    {
      method: "GET",
      match: (pathname) => pathname === "/api/slo/status",
      async handle({ res }) {
        const snapshot = ctx.buildSloRuntimeSnapshot();
        ctx.maybeEmitSloAlert(snapshot, { reason: "api_slo_status" });
        ctx.sendJson(res, 200, { ok: true, slo: snapshot });
      },
    },
  ];
}

module.exports = {
  createRuntimeRoutes,
};
