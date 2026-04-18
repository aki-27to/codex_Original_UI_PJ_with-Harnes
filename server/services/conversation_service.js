"use strict";

function createConversationService(deps) {
  const {
    validateLocalOriginRequest,
    logOperation,
    safeString,
    requestHeaderValue,
    sendJson,
    validateJsonMutationContentType,
    conversationApiRequiredContentType,
    readRequestBody,
    piperVoiceRequestBodyLimitBytes,
    normalizeBooleanFlag,
    defaultPiperModelId,
    nowTs,
    preparePiperModel,
    workspaceRoot,
    resolvePiperVoiceRequestErrorStatus,
    summarizeErrorForOperationLog,
    speakWithPiper,
    kokoroVoiceRequestBodyLimitBytes,
    kokoroDefaultModel,
    kokoroDefaultVoice,
    kokoroDefaultLangCode,
    requestKokoroSpeech,
    resolveKokoroVoiceRequestErrorStatus,
    conversationRequestBodyLimitBytes,
    normalizeConversationMessage,
    normalizeConversationMode,
    normalizeConversationPersonaUserId,
    normalizeConversationLevel,
    normalizeConversationTopic,
    normalizeConversationHistoryItems,
    getConversationPersonaContextForUser,
    conversationProvider,
    conversationAppServerModel,
    summarizeTextForOperationLog,
    runConversationViaAppServer,
    updateConversationPersonaMemoryForUser,
    resolveConversationRequestErrorStatus,
    conversationRequestTimeoutMs,
    defaultRequestBodyLimitBytes,
    resetConversationPersonaMemoryForUser,
    isRequestBodyTooLargeError,
  } = deps;

  async function handleVoicePiperPrepareRequest({ req, res }) {
    try {
      const originValidation = validateLocalOriginRequest(req);
      if (!originValidation.ok) {
        logOperation(
          "api.voice.piper_prepare_blocked",
          {
            reason: safeString(originValidation.error, 180),
            status: Number.isFinite(Number(originValidation.status))
              ? Math.trunc(Number(originValidation.status))
              : 403,
            origin: safeString(requestHeaderValue(req, "origin"), 220),
            referer: safeString(requestHeaderValue(req, "referer"), 220),
            host: safeString(requestHeaderValue(req, "host"), 120),
          },
          "standard"
        );
        sendJson(res, originValidation.status, { ok: false, error: originValidation.error });
        return;
      }
      const contentTypeValidation = validateJsonMutationContentType(req, {
        required: true,
        expectedMime: conversationApiRequiredContentType,
      });
      if (!contentTypeValidation.ok) {
        logOperation(
          "api.voice.piper_prepare_blocked",
          {
            reason: safeString(contentTypeValidation.error, 180),
            status: Number.isFinite(Number(contentTypeValidation.status))
              ? Math.trunc(Number(contentTypeValidation.status))
              : 415,
            origin: safeString(requestHeaderValue(req, "origin"), 220),
            referer: safeString(requestHeaderValue(req, "referer"), 220),
            host: safeString(requestHeaderValue(req, "host"), 120),
            contentType: safeString(requestHeaderValue(req, "content-type"), 120),
          },
          "standard"
        );
        sendJson(res, contentTypeValidation.status, { ok: false, error: contentTypeValidation.error });
        return;
      }
      const raw = await readRequestBody(req, piperVoiceRequestBodyLimitBytes);
      const body = raw ? JSON.parse(raw) : {};
      const model = safeString(body.model, 120) || defaultPiperModelId;
      const speaker = Object.prototype.hasOwnProperty.call(body, "speaker") ? body.speaker : null;
      const autoDownload = Object.prototype.hasOwnProperty.call(body, "autoDownload")
        ? normalizeBooleanFlag(body.autoDownload)
        : true;
      const warmup = Object.prototype.hasOwnProperty.call(body, "warmup")
        ? normalizeBooleanFlag(body.warmup)
        : true;
      const warmupText = safeString(body.warmupText, 240) || "piper warmup";
      const startedAt = nowTs();
      logOperation(
        "api.voice.piper_prepare",
        {
          model: safeString(model, 120),
          speaker: Number.isFinite(Number(speaker)) ? Math.max(0, Math.trunc(Number(speaker))) : null,
          autoDownload: autoDownload ? 1 : 0,
          warmup: warmup ? 1 : 0,
        },
        "standard"
      );
      const prepared = await preparePiperModel({
        workspaceRoot,
        model,
        speaker,
        autoDownload,
        warmup,
        warmupText,
      });
      const latencyMs = Math.max(0, nowTs() - startedAt);
      logOperation(
        "api.voice.piper_prepare_done",
        {
          model: safeString(prepared && prepared.modelId, 120) || safeString(model, 120),
          speaker: Number.isFinite(Number(prepared && prepared.speaker))
            ? Math.max(0, Math.trunc(Number(prepared.speaker)))
            : null,
          downloadedModel: prepared && prepared.downloadedModel ? 1 : 0,
          warmedUp: prepared && prepared.warmedUp ? 1 : 0,
          ms: latencyMs,
        },
        "standard"
      );
      sendJson(res, 200, {
        ok: true,
        provider: "piper",
        model: safeString(prepared && prepared.modelId, 120) || safeString(model, 120),
        speaker: Number.isFinite(Number(prepared && prepared.speaker))
          ? Math.max(0, Math.trunc(Number(prepared.speaker)))
          : null,
        downloadedModel: prepared && prepared.downloadedModel ? 1 : 0,
        warmedUp: prepared && prepared.warmedUp ? 1 : 0,
        autoDownload: autoDownload ? 1 : 0,
        warmup: warmup ? 1 : 0,
        latencyMs,
      });
    } catch (error) {
      const statusCode = resolvePiperVoiceRequestErrorStatus(error);
      logOperation(
        "api.voice.piper_prepare_failed",
        {
          status: statusCode,
          err: summarizeErrorForOperationLog(error, 220),
          code: safeString(error && error.code ? String(error.code) : "", 80),
        },
        "standard"
      );
      sendJson(res, statusCode, {
        ok: false,
        error: error && error.message ? error.message : String(error),
        code: safeString(error && error.code ? String(error.code) : "", 80) || undefined,
      });
    }
  }

  async function handleVoicePiperRequest({ req, res }) {
    try {
      const originValidation = validateLocalOriginRequest(req);
      if (!originValidation.ok) {
        logOperation(
          "api.voice.piper_blocked",
          {
            reason: safeString(originValidation.error, 180),
            status: Number.isFinite(Number(originValidation.status))
              ? Math.trunc(Number(originValidation.status))
              : 403,
            origin: safeString(requestHeaderValue(req, "origin"), 220),
            referer: safeString(requestHeaderValue(req, "referer"), 220),
            host: safeString(requestHeaderValue(req, "host"), 120),
          },
          "standard"
        );
        sendJson(res, originValidation.status, { ok: false, error: originValidation.error });
        return;
      }
      const contentTypeValidation = validateJsonMutationContentType(req, {
        required: true,
        expectedMime: conversationApiRequiredContentType,
      });
      if (!contentTypeValidation.ok) {
        logOperation(
          "api.voice.piper_blocked",
          {
            reason: safeString(contentTypeValidation.error, 180),
            status: Number.isFinite(Number(contentTypeValidation.status))
              ? Math.trunc(Number(contentTypeValidation.status))
              : 415,
            origin: safeString(requestHeaderValue(req, "origin"), 220),
            referer: safeString(requestHeaderValue(req, "referer"), 220),
            host: safeString(requestHeaderValue(req, "host"), 120),
            contentType: safeString(requestHeaderValue(req, "content-type"), 120),
          },
          "standard"
        );
        sendJson(res, contentTypeValidation.status, { ok: false, error: contentTypeValidation.error });
        return;
      }
      const raw = await readRequestBody(req, piperVoiceRequestBodyLimitBytes);
      const body = raw ? JSON.parse(raw) : {};
      const text = safeString(typeof body.text === "string" ? body.text : body.message, 24000);
      if (!text) {
        sendJson(res, 400, { ok: false, error: "text is required" });
        return;
      }
      const model = safeString(body.model, 120) || defaultPiperModelId;
      const speaker = Object.prototype.hasOwnProperty.call(body, "speaker") ? body.speaker : null;
      const autoDownload = Object.prototype.hasOwnProperty.call(body, "autoDownload")
        ? normalizeBooleanFlag(body.autoDownload)
        : true;
      const startedAt = nowTs();
      logOperation(
        "api.voice.piper",
        {
          model: safeString(model, 120),
          speaker: Number.isFinite(Number(speaker)) ? Math.max(0, Math.trunc(Number(speaker))) : null,
          chars: text.length,
          autoDownload: autoDownload ? 1 : 0,
        },
        "standard"
      );
      const playback = await speakWithPiper({
        workspaceRoot,
        text,
        model,
        speaker,
        autoDownload,
      });
      const latencyMs = Math.max(0, nowTs() - startedAt);
      logOperation(
        "api.voice.piper_done",
        {
          model: safeString(playback && playback.modelId, 120) || safeString(model, 120),
          speaker: Number.isFinite(Number(playback && playback.speaker))
            ? Math.max(0, Math.trunc(Number(playback.speaker)))
            : null,
          downloadedModel: playback && playback.downloadedModel ? 1 : 0,
          ms: latencyMs,
        },
        "standard"
      );
      sendJson(res, 200, {
        ok: true,
        provider: "piper",
        model: safeString(playback && playback.modelId, 120) || safeString(model, 120),
        speaker: Number.isFinite(Number(playback && playback.speaker))
          ? Math.max(0, Math.trunc(Number(playback.speaker)))
          : null,
        downloadedModel: playback && playback.downloadedModel ? 1 : 0,
        autoDownload: autoDownload ? 1 : 0,
        latencyMs,
      });
    } catch (error) {
      const statusCode = resolvePiperVoiceRequestErrorStatus(error);
      logOperation(
        "api.voice.piper_failed",
        {
          status: statusCode,
          err: summarizeErrorForOperationLog(error, 220),
          code: safeString(error && error.code ? String(error.code) : "", 80),
        },
        "standard"
      );
      sendJson(res, statusCode, {
        ok: false,
        error: error && error.message ? error.message : String(error),
        code: safeString(error && error.code ? String(error.code) : "", 80) || undefined,
      });
    }
  }

  async function handleVoiceKokoroRequest({ req, res }) {
    try {
      const originValidation = validateLocalOriginRequest(req);
      if (!originValidation.ok) {
        logOperation(
          "api.voice.kokoro_blocked",
          {
            reason: safeString(originValidation.error, 180),
            status: Number.isFinite(Number(originValidation.status))
              ? Math.trunc(Number(originValidation.status))
              : 403,
            origin: safeString(requestHeaderValue(req, "origin"), 220),
            referer: safeString(requestHeaderValue(req, "referer"), 220),
            host: safeString(requestHeaderValue(req, "host"), 120),
          },
          "standard"
        );
        sendJson(res, originValidation.status, { ok: false, error: originValidation.error });
        return;
      }
      const contentTypeValidation = validateJsonMutationContentType(req, {
        required: true,
        expectedMime: conversationApiRequiredContentType,
      });
      if (!contentTypeValidation.ok) {
        logOperation(
          "api.voice.kokoro_blocked",
          {
            reason: safeString(contentTypeValidation.error, 180),
            status: Number.isFinite(Number(contentTypeValidation.status))
              ? Math.trunc(Number(contentTypeValidation.status))
              : 415,
            origin: safeString(requestHeaderValue(req, "origin"), 220),
            referer: safeString(requestHeaderValue(req, "referer"), 220),
            host: safeString(requestHeaderValue(req, "host"), 120),
            contentType: safeString(requestHeaderValue(req, "content-type"), 120),
          },
          "standard"
        );
        sendJson(res, contentTypeValidation.status, { ok: false, error: contentTypeValidation.error });
        return;
      }
      const raw = await readRequestBody(req, kokoroVoiceRequestBodyLimitBytes);
      const body = raw ? JSON.parse(raw) : {};
      const text = safeString(typeof body.text === "string" ? body.text : body.message, 24000);
      if (!text) {
        sendJson(res, 400, { ok: false, error: "text is required" });
        return;
      }
      const model = safeString(body.model, 80) || kokoroDefaultModel;
      const voice = safeString(body.voice, 80) || kokoroDefaultVoice;
      const langCode = safeString(body.langCode, 8)
        || safeString(body.lang_code, 8)
        || kokoroDefaultLangCode;
      const speed = Object.prototype.hasOwnProperty.call(body, "speed") ? Number(body.speed) : undefined;
      const startedAt = nowTs();
      logOperation(
        "api.voice.kokoro",
        {
          model: safeString(model, 80),
          voice: safeString(voice, 80),
          langCode: safeString(langCode, 8),
          chars: text.length,
          speed: Number.isFinite(Number(speed)) ? Number(speed) : null,
        },
        "standard"
      );
      const result = await requestKokoroSpeech({ text, model, voice, langCode, speed });
      const latencyMs = Math.max(0, nowTs() - startedAt);
      logOperation(
        "api.voice.kokoro_done",
        {
          model: safeString(model, 80),
          voice: safeString(voice, 80),
          langCode: safeString(langCode, 8),
          bytes: result && result.audio ? result.audio.length : 0,
          ms: latencyMs,
        },
        "standard"
      );
      const contentType = safeString(result && result.contentType ? result.contentType : "audio/mpeg", 120)
        || "audio/mpeg";
      const audioBuffer = result && result.audio ? result.audio : Buffer.alloc(0);
      res.writeHead(200, {
        "Content-Type": contentType,
        "Content-Length": audioBuffer.length,
        "Cache-Control": "no-store",
      });
      res.end(audioBuffer);
    } catch (error) {
      const statusCode = resolveKokoroVoiceRequestErrorStatus(error);
      logOperation(
        "api.voice.kokoro_failed",
        {
          status: statusCode,
          err: summarizeErrorForOperationLog(error, 220),
          code: safeString(error && error.code ? String(error.code) : "", 80),
        },
        "standard"
      );
      sendJson(res, statusCode, {
        ok: false,
        error: error && error.message ? error.message : String(error),
        code: safeString(error && error.code ? String(error.code) : "", 80) || undefined,
      });
    }
  }

  async function handleConversationDirectRequest({ req, res }) {
    try {
      const originValidation = validateLocalOriginRequest(req);
      if (!originValidation.ok) {
        logOperation(
          "api.conversation.blocked",
          {
            reason: safeString(originValidation.error, 180),
            status: Number.isFinite(Number(originValidation.status))
              ? Math.trunc(Number(originValidation.status))
              : 403,
            origin: safeString(requestHeaderValue(req, "origin"), 220),
            referer: safeString(requestHeaderValue(req, "referer"), 220),
            host: safeString(requestHeaderValue(req, "host"), 120),
          },
          "standard"
        );
        sendJson(res, originValidation.status, { ok: false, error: originValidation.error });
        return;
      }
      const contentTypeValidation = validateJsonMutationContentType(req, {
        required: true,
        expectedMime: conversationApiRequiredContentType,
      });
      if (!contentTypeValidation.ok) {
        logOperation(
          "api.conversation.blocked",
          {
            reason: safeString(contentTypeValidation.error, 180),
            status: Number.isFinite(Number(contentTypeValidation.status))
              ? Math.trunc(Number(contentTypeValidation.status))
              : 415,
            origin: safeString(requestHeaderValue(req, "origin"), 220),
            referer: safeString(requestHeaderValue(req, "referer"), 220),
            host: safeString(requestHeaderValue(req, "host"), 120),
            contentType: safeString(requestHeaderValue(req, "content-type"), 120),
          },
          "standard"
        );
        sendJson(res, contentTypeValidation.status, { ok: false, error: contentTypeValidation.error });
        return;
      }
      const raw = await readRequestBody(req, conversationRequestBodyLimitBytes);
      const body = raw ? JSON.parse(raw) : {};
      const message = normalizeConversationMessage(body.message || body.prompt);
      if (!message) {
        sendJson(res, 400, { ok: false, error: "message is required" });
        return;
      }
      const mode = normalizeConversationMode(body.mode);
      const personaUserId = normalizeConversationPersonaUserId(body.personaUserId);
      const level = normalizeConversationLevel(body.level);
      const topic = normalizeConversationTopic(body.topic);
      const history = normalizeConversationHistoryItems(body.history);
      let personaContext = { facts: [], topics: [], turns: 0, updatedAt: 0 };
      let personaSummary = {
        turns: 0,
        factsCount: 0,
        topicsCount: 0,
        recentFacts: [],
        recentTopics: [],
        updatedAt: 0,
      };
      if (mode === "persona_friend") {
        const personaSnapshot = getConversationPersonaContextForUser(personaUserId);
        personaContext = personaSnapshot.context;
        personaSummary = personaSnapshot.summary;
      }
      const model = conversationAppServerModel;
      const startedAt = nowTs();
      logOperation(
        "api.conversation.direct",
        {
          provider: conversationProvider,
          model: safeString(model, 120),
          mode,
          personaUserId: mode === "persona_friend" ? safeString(personaUserId, 120) : "",
          personaFacts:
            mode === "persona_friend" && personaContext && Array.isArray(personaContext.facts)
              ? personaContext.facts.length
              : 0,
          level,
          topic: safeString(topic, 120),
          historyItems: history.length,
          message: summarizeTextForOperationLog(message, 2400),
        },
        "standard"
      );
      const response = await runConversationViaAppServer({
        message,
        history,
        level,
        topic,
        mode,
        memoryContext: mode === "persona_friend" ? personaContext : null,
        timeoutMs: conversationRequestTimeoutMs,
      });
      if (mode === "persona_friend") {
        const updatedPersona = updateConversationPersonaMemoryForUser({
          userId: personaUserId,
          message,
          topic,
        });
        personaSummary = updatedPersona.summary;
      }
      const latencyMs = Math.max(0, nowTs() - startedAt);
      logOperation(
        "api.conversation.direct_done",
        {
          provider: conversationProvider,
          model: safeString(response && response.model, 120) || safeString(model, 120),
          mode,
          personaUserId: mode === "persona_friend" ? safeString(personaUserId, 120) : "",
          personaFacts:
            mode === "persona_friend"
              ? Number.isFinite(Number(personaSummary.factsCount))
                ? Math.max(0, Math.trunc(Number(personaSummary.factsCount)))
                : 0
              : 0,
          ms: latencyMs,
          usage:
            response && response.usage && typeof response.usage === "object"
              ? {
                  totalTokens: Number.isFinite(Number(response.usage.totalTokens))
                    ? Math.max(0, Math.trunc(Number(response.usage.totalTokens)))
                    : 0,
                  inputTokens: Number.isFinite(Number(response.usage.inputTokens))
                    ? Math.max(0, Math.trunc(Number(response.usage.inputTokens)))
                    : 0,
                  outputTokens: Number.isFinite(Number(response.usage.outputTokens))
                    ? Math.max(0, Math.trunc(Number(response.usage.outputTokens)))
                    : 0,
                }
              : { totalTokens: 0, inputTokens: 0, outputTokens: 0 },
        },
        "standard"
      );
      sendJson(res, 200, {
        ok: true,
        route: "conversation-app-server",
        provider: conversationProvider,
        model: safeString(response && response.model, 120) || safeString(model, 120),
        mode,
        id: safeString(response && response.id, 120) || null,
        text: safeString(response && response.text, 24000),
        usage:
          response && response.usage && typeof response.usage === "object"
            ? response.usage
            : { totalTokens: 0, inputTokens: 0, outputTokens: 0 },
        latencyMs,
        persona:
          mode === "persona_friend"
            ? {
                userId: personaUserId,
                memory: personaSummary,
              }
            : null,
      });
    } catch (error) {
      const statusCode = resolveConversationRequestErrorStatus(error);
      logOperation(
        "api.conversation.direct_failed",
        {
          status: statusCode,
          err: summarizeErrorForOperationLog(error, 220),
          origin: safeString(requestHeaderValue(req, "origin"), 220),
          referer: safeString(requestHeaderValue(req, "referer"), 220),
          host: safeString(requestHeaderValue(req, "host"), 120),
        },
        "standard"
      );
      sendJson(res, statusCode, { ok: false, error: error && error.message ? error.message : String(error) });
    }
  }

  async function handleConversationPersonaResetRequest({ req, res }) {
    try {
      const originValidation = validateLocalOriginRequest(req);
      if (!originValidation.ok) {
        logOperation(
          "api.conversation.persona_reset_blocked",
          {
            reason: safeString(originValidation.error, 180),
            status: Number.isFinite(Number(originValidation.status))
              ? Math.trunc(Number(originValidation.status))
              : 403,
            origin: safeString(requestHeaderValue(req, "origin"), 220),
            referer: safeString(requestHeaderValue(req, "referer"), 220),
            host: safeString(requestHeaderValue(req, "host"), 120),
          },
          "standard"
        );
        sendJson(res, originValidation.status, { ok: false, error: originValidation.error });
        return;
      }
      const contentTypeValidation = validateJsonMutationContentType(req, {
        required: true,
        expectedMime: conversationApiRequiredContentType,
      });
      if (!contentTypeValidation.ok) {
        logOperation(
          "api.conversation.persona_reset_blocked",
          {
            reason: safeString(contentTypeValidation.error, 180),
            status: Number.isFinite(Number(contentTypeValidation.status))
              ? Math.trunc(Number(contentTypeValidation.status))
              : 415,
            origin: safeString(requestHeaderValue(req, "origin"), 220),
            referer: safeString(requestHeaderValue(req, "referer"), 220),
            host: safeString(requestHeaderValue(req, "host"), 120),
            contentType: safeString(requestHeaderValue(req, "content-type"), 120),
          },
          "standard"
        );
        sendJson(res, contentTypeValidation.status, { ok: false, error: contentTypeValidation.error });
        return;
      }
      const raw = await readRequestBody(req, defaultRequestBodyLimitBytes);
      const body = raw ? JSON.parse(raw) : {};
      const personaUserId = normalizeConversationPersonaUserId(body.personaUserId);
      const resetResult = resetConversationPersonaMemoryForUser(personaUserId);
      logOperation(
        "api.conversation.persona_reset",
        {
          personaUserId: safeString(personaUserId, 120),
        },
        "standard"
      );
      sendJson(res, 200, {
        ok: true,
        mode: "persona_friend",
        persona: {
          userId: resetResult.userId,
          memory: resetResult.summary,
        },
      });
    } catch (error) {
      const statusCode = isRequestBodyTooLargeError(error) ? 413 : error instanceof SyntaxError ? 400 : 500;
      logOperation(
        "api.conversation.persona_reset_failed",
        {
          status: statusCode,
          err: summarizeErrorForOperationLog(error, 220),
          origin: safeString(requestHeaderValue(req, "origin"), 220),
          referer: safeString(requestHeaderValue(req, "referer"), 220),
          host: safeString(requestHeaderValue(req, "host"), 120),
        },
        "standard"
      );
      sendJson(res, statusCode, { ok: false, error: error && error.message ? error.message : String(error) });
    }
  }

  return {
    handleVoicePiperPrepareRequest,
    handleVoicePiperRequest,
    handleVoiceKokoroRequest,
    handleConversationDirectRequest,
    handleConversationPersonaResetRequest,
  };
}

module.exports = {
  createConversationService,
};
