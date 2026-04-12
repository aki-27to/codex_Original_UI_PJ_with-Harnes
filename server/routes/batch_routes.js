"use strict";

function createBatchRoutes(ctx) {
  return [
    {
      method: "GET",
      match: (pathname) => pathname === "/api/batch/status",
      async handle({ res }) {
        ctx.sendJson(res, 200, ctx.getPocStatusSnapshot());
      },
    },
    {
      method: "POST",
      match: (pathname) => pathname === "/api/batch/run",
      async handle({ req, res, pathname }) {
        try {
          const raw = await ctx.readRequestBody(req, ctx.execRequestBodyLimitBytes);
          const body = raw ? JSON.parse(raw) : {};
          const prompt = ctx.safeString(body.prompt, 24000);
          if (!prompt) {
            ctx.sendJson(res, 400, { ok: false, error: "prompt is required" });
            return;
          }
          const mode = ctx.normalizePocBatchMode(body.mode);
          const cwd = ctx.normalizeWorkingDirectory(body.cwd, ctx.workspaceRoot);
          const workspaceGuardViolation = ctx.buildWorkspaceGuardViolation(cwd);
          if (workspaceGuardViolation) {
            ctx.logOperation(
              "api.batch_blocked",
              {
                path: pathname,
                reason:
                  ctx.safeString(
                    workspaceGuardViolation.payload && workspaceGuardViolation.payload.code,
                    80
                  ) || "outside_locked_workspace",
                cwd: ctx.summarizePathForOperationLog(cwd, 220),
                lockedRoot: ctx.summarizePathForOperationLog(ctx.workspaceGuardLockedRoot, 220),
              },
              "standard"
            );
            ctx.sendJson(res, workspaceGuardViolation.statusCode, workspaceGuardViolation.payload);
            return;
          }
          const result = await ctx.executePocBatchRun({
            prompt,
            mode,
            cwd,
            source: "manual",
          });
          ctx.sendJson(res, 200, result);
        } catch (error) {
          ctx.sendJson(res, 500, {
            ok: false,
            error: error && error.message ? error.message : String(error),
          });
        }
      },
    },
    {
      method: "POST",
      match: (pathname) => pathname === "/api/batch/scheduler",
      async handle({ req, res }) {
        try {
          const raw = await ctx.readRequestBody(req, ctx.defaultRequestBodyLimitBytes);
          const body = raw ? JSON.parse(raw) : {};
          const scheduler = ctx.setPocSchedulerConfig({
            enabled: ctx.normalizeBooleanFlag(body.enabled),
            intervalSec: body.intervalSec,
          });
          ctx.sendJson(res, 200, { ok: true, scheduler });
        } catch (error) {
          ctx.sendJson(res, 500, {
            ok: false,
            error: error && error.message ? error.message : String(error),
          });
        }
      },
    },
  ];
}

module.exports = {
  createBatchRoutes,
};
