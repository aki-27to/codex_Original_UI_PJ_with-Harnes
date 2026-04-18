"use strict";

function createHarnessAppService(deps) {
  const {
    validateLocalAppBridgeRequest,
    sendJson,
    validateJsonMutationContentType,
    conversationApiRequiredContentType,
    getRegisteredAppRuntimeConfig,
    readRequestBody,
    defaultRequestBodyLimitBytes,
    safeString,
    normalizeExecModel,
    conversationExecModelName,
    normalizeAppRuntimeTimeoutMs,
    conversationRequestTimeoutMs,
    resolveAppRuntimeWorkingDirectory,
    nowTs,
    runCodexReply,
    runCodexStructuredOutput,
  } = deps;

  async function readAppBridgeRequest(req, res, appId) {
    const originValidation = validateLocalAppBridgeRequest(req);
    if (!originValidation.ok) {
      sendJson(res, originValidation.status, { ok: false, error: originValidation.error });
      return null;
    }
    const contentTypeValidation = validateJsonMutationContentType(req, {
      required: true,
      expectedMime: conversationApiRequiredContentType,
    });
    if (!contentTypeValidation.ok) {
      sendJson(res, contentTypeValidation.status, { ok: false, error: contentTypeValidation.error });
      return null;
    }
    const app = getRegisteredAppRuntimeConfig(appId);
    if (!app) {
      sendJson(res, 404, { ok: false, error: "unknown app" });
      return null;
    }
    const raw = await readRequestBody(req, defaultRequestBodyLimitBytes);
    const body = raw ? JSON.parse(raw) : {};
    const prompt = safeString(typeof body.prompt === "string" ? body.prompt : "", 24000);
    if (!prompt) {
      sendJson(res, 400, { ok: false, error: "prompt is required" });
      return null;
    }
    const model = normalizeExecModel(body.model, conversationExecModelName);
    const timeoutMs = normalizeAppRuntimeTimeoutMs(body.timeoutMs, conversationRequestTimeoutMs);
    const cwd = resolveAppRuntimeWorkingDirectory(app);
    return {
      app,
      body,
      prompt,
      model,
      timeoutMs,
      cwd,
      startedAt: nowTs(),
    };
  }

  async function handleHarnessAppReplyRequest(req, res, appId) {
    const request = await readAppBridgeRequest(req, res, appId);
    if (!request) {
      return;
    }
    const { app, body, prompt, model, timeoutMs, cwd, startedAt } = request;
    const text = await runCodexReply({
      cwd,
      prompt,
      model,
      timeoutMs,
      sandboxMode: "read-only",
    });
    sendJson(res, 200, {
      ok: true,
      appId: app.id,
      provider: "harness-codex-exec",
      model,
      text,
      latencyMs: Math.max(0, nowTs() - startedAt),
      warning: body && body.useWebSearch ? "Live web search is not available via harness-codex-exec." : "",
      citations: [],
    });
  }

  async function handleHarnessAppStructuredRequest(req, res, appId) {
    const request = await readAppBridgeRequest(req, res, appId);
    if (!request) {
      return;
    }
    const { app, body, prompt, model, timeoutMs, cwd, startedAt } = request;
    const outputSchema =
      body && body.outputSchema && typeof body.outputSchema === "object" && !Array.isArray(body.outputSchema)
        ? body.outputSchema
        : null;
    if (!outputSchema) {
      sendJson(res, 400, { ok: false, error: "outputSchema is required" });
      return;
    }
    const data = await runCodexStructuredOutput({
      cwd,
      prompt,
      outputSchema,
      model,
      timeoutMs,
      sandboxMode: "read-only",
    });
    sendJson(res, 200, {
      ok: true,
      appId: app.id,
      provider: "harness-codex-exec",
      model,
      data,
      latencyMs: Math.max(0, nowTs() - startedAt),
    });
  }

  return {
    handleHarnessAppReplyRequest,
    handleHarnessAppStructuredRequest,
  };
}

module.exports = {
  createHarnessAppService,
};
