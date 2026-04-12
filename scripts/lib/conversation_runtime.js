"use strict";

const http = require("http");
const https = require("https");
const fs = require("fs");
const path = require("path");
const { EventEmitter } = require("events");

const {
  conversationModeValues,
  defaultConversationMode,
  defaultPersonaUserId,
  normalizeConversationMode: normalizeConversationModePolicy,
  normalizePersonaUserId: normalizePersonaUserIdPolicy,
  createDefaultPersonaMemoryStore,
  normalizePersonaMemoryStore,
  ensurePersonaMemoryRecord,
  applyPersonaMemoryUpdate,
  selectPersonaMemoryContext,
  buildConversationPromptSections,
} = require("./conversation_persona_policy");

function createConversationRuntime(options = {}) {
  const {
    workspaceRoot,
    conversationApiRequiredContentType,
    conversationRequestBodyLimitBytes,
    conversationRequestTimeoutMs,
    conversationDefaultMaxTokens,
    conversationExecModelName,
    conversationExecModelReasoningEffort,
    conversationProvider,
    conversationAppServerModel,
    conversationPersonaMemoryPath,
    conversationPersonaMemoryContextFacts = 5,
    conversationPersonaMemoryContextTopics = 3,
    kokoroVoiceRequestBodyLimitBytes,
    kokoroVoiceRequestTimeoutMs,
    kokoroVoiceServiceBaseUrl,
    kokoroDefaultModel,
    kokoroDefaultVoice,
    kokoroDefaultLangCode,
    safeString,
    normalizeExecutionState,
    summarizeErrorForOperationLog,
    summarizePathForOperationLog,
    logOperation,
    runCodexExecStreaming,
    isRequestBodyTooLargeError,
  } = options;

  let conversationPersonaMemoryLoaded = false;
  let conversationPersonaMemoryStore = createDefaultPersonaMemoryStore();

  function conversationApiConfigured() {
    return true;
  }

  function getConversationRuntimeSnapshot() {
    return {
      ok: true,
      mode: "app-server",
      provider: conversationProvider,
      model: conversationAppServerModel,
      modelReasoningEffort: conversationExecModelReasoningEffort,
      configured: conversationApiConfigured(),
      setupHint: "",
      originCheck: true,
      contentType: conversationApiRequiredContentType,
      endpoint: "POST /api/conversation/direct",
      modeOptions: conversationModeValues.slice(),
      defaultMode: defaultConversationMode,
      persona: {
        mode: "persona_friend",
        userIdField: "personaUserId",
        memory: {
          enabled: true,
          resetEndpoint: "POST /api/conversation/persona/reset",
          storage: summarizePathForOperationLog(conversationPersonaMemoryPath, 220),
        },
      },
      limits: {
        bodyBytes: conversationRequestBodyLimitBytes,
        timeoutMs: conversationRequestTimeoutMs,
        maxTokens: conversationDefaultMaxTokens,
        historyItems: 14,
      },
      policies: {
        requestUserInput: "blocked",
        parentDispatchGuardExemptProfile: "conversation-app-server",
      },
    };
  }

  function getKokoroVoiceRuntimeSnapshot() {
    return {
      provider: "kokoro",
      endpoint: "POST /api/voice/kokoro",
      serviceBaseUrl: kokoroVoiceServiceBaseUrl,
      model: kokoroDefaultModel,
      voice: kokoroDefaultVoice,
      langCode: kokoroDefaultLangCode,
      originCheck: true,
      contentType: conversationApiRequiredContentType,
      limits: {
        bodyBytes: kokoroVoiceRequestBodyLimitBytes,
        timeoutMs: kokoroVoiceRequestTimeoutMs,
      },
    };
  }
  function normalizeConversationMessage(value) {
    return safeString(value, 2000);
  }

  function normalizeConversationMode(value) {
    return normalizeConversationModePolicy(value, defaultConversationMode);
  }

  function normalizeConversationLevel(value) {
    const raw = safeString(value, 40).toLowerCase();
    if (raw === "beginner" || raw === "intermediate" || raw === "advanced") {
      return raw;
    }
    return "intermediate";
  }

  function normalizeConversationTopic(value) {
    return safeString(value, 140);
  }

  function normalizeConversationPersonaUserId(value) {
    return normalizePersonaUserIdPolicy(value, defaultPersonaUserId);
  }

  function normalizeConversationHistoryItems(value) {
    const source = Array.isArray(value) ? value : [];
    const normalized = [];
    for (const item of source) {
      if (!item || typeof item !== "object") {
        continue;
      }
      const role = safeString(item.role, 20).toLowerCase();
      if (role !== "user" && role !== "assistant") {
        continue;
      }
      const text = safeString(String(item.text || "").replace(/\s+/g, " "), 800);
      if (!text) {
        continue;
      }
      normalized.push({ role, text });
    }
    return normalized.slice(-14);
  }

  function normalizeConversationHistoryRoleLabel(role) {
    return role === "assistant" ? "AI" : "Learner";
  }

  function loadConversationPersonaMemoryStore() {
    if (conversationPersonaMemoryLoaded) {
      return conversationPersonaMemoryStore;
    }
    conversationPersonaMemoryLoaded = true;
    if (!fs.existsSync(conversationPersonaMemoryPath)) {
      conversationPersonaMemoryStore = createDefaultPersonaMemoryStore();
      return conversationPersonaMemoryStore;
    }
    try {
      const raw = fs.readFileSync(conversationPersonaMemoryPath, "utf8");
      const parsed = raw ? JSON.parse(raw) : {};
      conversationPersonaMemoryStore = normalizePersonaMemoryStore(parsed);
    } catch (error) {
      conversationPersonaMemoryStore = createDefaultPersonaMemoryStore();
      logOperation("conversation.persona_memory_load_failed", {
        err: summarizeErrorForOperationLog(error, 220),
        path: summarizePathForOperationLog(conversationPersonaMemoryPath, 220),
      }, "core");
    }
    return conversationPersonaMemoryStore;
  }

  function persistConversationPersonaMemoryStore() {
    try {
      const normalizedStore = normalizePersonaMemoryStore(conversationPersonaMemoryStore);
      conversationPersonaMemoryStore = normalizedStore;
      fs.mkdirSync(path.dirname(conversationPersonaMemoryPath), { recursive: true, mode: 0o700 });
      fs.writeFileSync(conversationPersonaMemoryPath, `${JSON.stringify(normalizedStore, null, 2)}\n`, "utf8");
      return true;
    } catch (error) {
      logOperation("conversation.persona_memory_persist_failed", {
        err: summarizeErrorForOperationLog(error, 220),
        path: summarizePathForOperationLog(conversationPersonaMemoryPath, 220),
      }, "core");
      return false;
    }
  }

  function getConversationPersonaMemoryRecord(userId) {
    const store = loadConversationPersonaMemoryStore();
    const ensured = ensurePersonaMemoryRecord(store, userId);
    conversationPersonaMemoryStore = ensured.store;
    return {
      userId: ensured.userId,
      record: ensured.record,
    };
  }

  function buildConversationPersonaMemorySummary(record, {
    maxFacts = conversationPersonaMemoryContextFacts,
    maxTopics = conversationPersonaMemoryContextTopics,
  } = {}) {
    const context = selectPersonaMemoryContext(record, { maxFacts, maxTopics });
    const facts = Array.isArray(record && record.facts) ? record.facts : [];
    const topics = Array.isArray(record && record.topics) ? record.topics : [];
    return {
      turns: Number.isFinite(Number(context.turns)) ? Math.max(0, Math.trunc(Number(context.turns))) : 0,
      factsCount: facts.length,
      topicsCount: topics.length,
      recentFacts: Array.isArray(context.facts) ? context.facts : [],
      recentTopics: Array.isArray(context.topics) ? context.topics : [],
      updatedAt: Number.isFinite(Number(context.updatedAt)) ? Math.max(0, Math.trunc(Number(context.updatedAt))) : 0,
    };
  }

  function getConversationPersonaContextForUser(userId) {
    const ensured = getConversationPersonaMemoryRecord(userId);
    const context = selectPersonaMemoryContext(ensured.record, {
      maxFacts: conversationPersonaMemoryContextFacts,
      maxTopics: conversationPersonaMemoryContextTopics,
    });
    return {
      userId: ensured.userId,
      record: ensured.record,
      context,
      summary: buildConversationPersonaMemorySummary(ensured.record),
    };
  }

  function updateConversationPersonaMemoryForUser({ userId, message, topic }) {
    const ensured = getConversationPersonaMemoryRecord(userId);
    const updatedRecord = applyPersonaMemoryUpdate(ensured.record, { message, topic, nowMs: Date.now() });
    const store = loadConversationPersonaMemoryStore();
    store.users[ensured.userId] = updatedRecord;
    conversationPersonaMemoryStore = store;
    persistConversationPersonaMemoryStore();
    return {
      userId: ensured.userId,
      record: updatedRecord,
      summary: buildConversationPersonaMemorySummary(updatedRecord),
    };
  }

  function resetConversationPersonaMemoryForUser(userId) {
    const normalizedUserId = normalizeConversationPersonaUserId(userId);
    const store = loadConversationPersonaMemoryStore();
    if (store && store.users && Object.prototype.hasOwnProperty.call(store.users, normalizedUserId)) {
      delete store.users[normalizedUserId];
      conversationPersonaMemoryStore = store;
      persistConversationPersonaMemoryStore();
    }
    return {
      userId: normalizedUserId,
      summary: {
        turns: 0,
        factsCount: 0,
        topicsCount: 0,
        recentFacts: [],
        recentTopics: [],
        updatedAt: 0,
      },
    };
  }

  function buildConversationPromptFromRequest({ message, history, level, topic, mode, memoryContext }) {
    const conversationMode = normalizeConversationMode(valueOrDefault(mode, defaultConversationMode));
    const learnerLevel = normalizeConversationLevel(level);
    const conversationTopic = normalizeConversationTopic(topic);
    const latestMessage = normalizeConversationMessage(message);
    const normalizedHistory = normalizeConversationHistoryItems(history);
    const historyLines = normalizedHistory.map((item) => `${normalizeConversationHistoryRoleLabel(item.role)}: ${safeString(item.text, 800)}`);
    const promptSections = buildConversationPromptSections({
      mode: conversationMode,
      learnerLevel,
      topic: conversationTopic,
      latestMessage,
      historyLines,
      memoryContext: conversationMode === "persona_friend" && memoryContext && typeof memoryContext === "object" ? memoryContext : null,
    });
    const parts = Array.isArray(promptSections) && promptSections.length
      ? promptSections
      : [
          "You are an American English conversation partner for speaking practice.",
          `Learner level: ${learnerLevel}.`,
          conversationTopic ? `Focus topic: ${conversationTopic}` : "Focus topic: natural daily conversation",
          "Reply in natural spoken English, 2-4 short sentences, and ask one follow-up question to continue the conversation.",
          `Learner: ${latestMessage}`,
          "AI:",
        ];
    return parts.join("\n\n");
  }

  class BufferedConversationResponse extends EventEmitter {
    constructor() {
      super();
      this.statusCode = 200;
      this.headers = {};
      this.writableEnded = false;
      this.destroyed = false;
      this.socket = { destroyed: false };
      this.buffer = "";
    }

    writeHead(statusCode, headers) {
      this.statusCode = Number.isFinite(Number(statusCode)) ? Math.trunc(Number(statusCode)) : 200;
      this.headers = headers && typeof headers === "object" ? { ...headers } : {};
    }

    write(chunk) {
      if (this.writableEnded) {
        return false;
      }
      const text = Buffer.isBuffer(chunk) ? chunk.toString("utf8") : String(chunk || "");
      if (!text) {
        return true;
      }
      this.buffer += text;
      while (true) {
        const newlineIndex = this.buffer.indexOf("\n");
        if (newlineIndex < 0) {
          break;
        }
        const line = this.buffer.slice(0, newlineIndex).trim();
        this.buffer = this.buffer.slice(newlineIndex + 1);
        if (!line) {
          continue;
        }
        try {
          const event = JSON.parse(line);
          if (event && typeof event === "object") {
            this.emit("event", event);
          }
        } catch {
          this.emit("event", { type: "raw", text: line });
        }
      }
      return true;
    }

    end(chunk) {
      if (chunk !== undefined) {
        this.write(chunk);
      }
      if (this.writableEnded) {
        return;
      }
      this.writableEnded = true;
      this.emit("finish");
      this.emit("close");
    }
  }

  async function runConversationViaAppServer({ message, history, level, topic, mode, memoryContext, timeoutMs }) {
    const prompt = buildConversationPromptFromRequest({ message, history, level, topic, mode, memoryContext });
    const responseStream = new BufferedConversationResponse();
    const effectiveTimeoutMs = Number.isFinite(Number(timeoutMs))
      ? Math.max(5000, Math.min(180000, Math.trunc(Number(timeoutMs))))
      : conversationRequestTimeoutMs;
    return new Promise((resolve, reject) => {
      let settled = false;
      let finalText = "";
      let deltaText = "";
      let terminalStatus = "";
      let terminalError = "";
      let threadId = "";
      let turnId = "";
      const settle = (error, value) => {
        if (settled) {
          return;
        }
        settled = true;
        clearTimeout(timeoutId);
        if (error) {
          reject(error);
          return;
        }
        resolve(value);
      };
      const timeoutId = setTimeout(() => {
        const error = new Error("app-server conversation timed out");
        error.statusCode = 504;
        settle(error);
        try {
          if (!responseStream.writableEnded) {
            responseStream.end();
          }
        } catch {
          // best-effort timeout cleanup
        }
      }, effectiveTimeoutMs);

      responseStream.on("event", (event) => {
        if (!event || typeof event !== "object") {
          return;
        }
        if (event.type === "turn" && event.phase === "started") {
          threadId = safeString(event.threadId, 120);
          turnId = safeString(event.turnId, 120);
          return;
        }
        if (event.type === "delta" && typeof event.text === "string") {
          deltaText = safeString(`${deltaText}${event.text}`, 24000);
          return;
        }
        if (event.type === "final" && typeof event.text === "string") {
          finalText = safeString(event.text, 24000);
          return;
        }
        if (event.type === "status") {
          terminalStatus = normalizeExecutionState(event.status, { terminalFallback: true });
          return;
        }
        if (event.type === "error" && typeof event.text === "string") {
          terminalError = safeString(event.text, 1800);
          return;
        }
        if (event.type === "raw" && typeof event.text === "string") {
          const rawText = safeString(event.text, 1800);
          if (rawText) {
            terminalError = rawText;
            if (rawText.startsWith("[error]")) {
              terminalStatus = "failed";
            }
          }
        }
      });

      responseStream.once("finish", () => {
        const normalizedStatus = normalizeExecutionState(terminalStatus, { terminalFallback: true });
        if (normalizedStatus !== "completed") {
          const messageText = safeString(terminalError, 1200) || `app-server conversation failed (${normalizedStatus})`;
          const error = new Error(messageText.startsWith("[error]") ? messageText : `[error] ${messageText}`);
          error.statusCode = normalizedStatus === "interrupted" ? 499 : 502;
          settle(error);
          return;
        }
        const text = safeString(finalText || deltaText, 24000);
        if (!text) {
          const error = new Error("app-server conversation returned an empty response");
          error.statusCode = 502;
          settle(error);
          return;
        }
        settle(null, {
          text,
          model: conversationAppServerModel,
          id: null,
          usage: { totalTokens: 0, inputTokens: 0, outputTokens: 0 },
          threadId: safeString(threadId, 120) || null,
          turnId: safeString(turnId, 120) || null,
        });
      });

      runCodexExecStreaming(responseStream, prompt, "workspace-write", {
        agentName: "default",
        approvalPolicy: "never",
        webSearch: false,
        model: conversationExecModelName,
        modelReasoningEffort: conversationExecModelReasoningEffort,
        cwd: workspaceRoot,
        requestUserInputPolicy: "blocked",
        forceNewSession: true,
        disableSlashRouter: true,
        executionProfile: "conversation-app-server",
        executionIntent: "english-conversation",
        executionSource: "conversation_app_server",
      }).catch((error) => {
        settle(error instanceof Error ? error : new Error(String(error)));
      });
    });
  }

  function resolveConversationRequestErrorStatus(error) {
    if (isRequestBodyTooLargeError(error)) {
      return 413;
    }
    if (error instanceof SyntaxError) {
      return 400;
    }
    if (Number.isFinite(Number(error && error.statusCode))) {
      return Math.max(400, Math.min(599, Math.trunc(Number(error.statusCode))));
    }
    const message = safeString(error && error.message ? error.message : String(error), 240).toLowerCase();
    if (message === "message is required") {
      return 400;
    }
    if (message.startsWith("[error] app-server conversation failed")) {
      return 502;
    }
    if (message === "app-server conversation returned an empty response") {
      return 502;
    }
    if (message === "app-server conversation timed out") {
      return 504;
    }
    return 500;
  }

  function resolvePiperVoiceRequestErrorStatus(error) {
    if (isRequestBodyTooLargeError(error)) {
      return 413;
    }
    if (error instanceof SyntaxError) {
      return 400;
    }
    if (Number.isFinite(Number(error && error.statusCode))) {
      return Math.max(400, Math.min(599, Math.trunc(Number(error.statusCode))));
    }
    const message = safeString(error && error.message ? error.message : String(error), 240).toLowerCase();
    if (message === "text is required") {
      return 400;
    }
    if (message === "piper model is required") {
      return 400;
    }
    if (message.startsWith("invalid piper model")) {
      return 400;
    }
    if (message.startsWith("piper model must end with -high")) {
      return 400;
    }
    if (message === "speaker must be a non-negative integer") {
      return 400;
    }
    return 500;
  }

  function resolveKokoroVoiceRequestErrorStatus(error) {
    if (isRequestBodyTooLargeError(error)) {
      return 413;
    }
    if (error instanceof SyntaxError) {
      return 400;
    }
    if (Number.isFinite(Number(error && error.statusCode))) {
      return Math.max(400, Math.min(599, Math.trunc(Number(error.statusCode))));
    }
    const message = safeString(error && error.message ? error.message : String(error), 240).toLowerCase();
    if (message === "text is required") {
      return 400;
    }
    if (message.startsWith("invalid kokoro speed")) {
      return 400;
    }
    if (message.startsWith("kokoro upstream failed")) {
      return 502;
    }
    return 500;
  }
  function requestKokoroSpeech({ text, model, voice, langCode, speed } = {}) {
    return new Promise((resolve, reject) => {
      let endpointUrl;
      try {
        endpointUrl = new URL("/v1/audio/speech", kokoroVoiceServiceBaseUrl);
      } catch {
        const error = new Error("kokoro endpoint url is invalid");
        error.statusCode = 500;
        reject(error);
        return;
      }
      const payload = {
        model: safeString(model, 80) || kokoroDefaultModel,
        input: safeString(text, 24000),
        voice: safeString(voice, 80) || kokoroDefaultVoice,
        response_format: "mp3",
        stream: false,
      };
      const normalizedLangCode = safeString(langCode, 8) || kokoroDefaultLangCode;
      if (normalizedLangCode) {
        payload.lang_code = normalizedLangCode;
      }
      if (Number.isFinite(Number(speed))) {
        const parsedSpeed = Number(speed);
        if (parsedSpeed < 0.25 || parsedSpeed > 4) {
          const error = new Error(`invalid kokoro speed: ${parsedSpeed}`);
          error.statusCode = 400;
          reject(error);
          return;
        }
        payload.speed = parsedSpeed;
      }
      const requestBody = Buffer.from(JSON.stringify(payload), "utf8");
      const transport = endpointUrl.protocol === "https:" ? https : http;
      const req = transport.request({
        protocol: endpointUrl.protocol,
        hostname: endpointUrl.hostname,
        port: endpointUrl.port ? Number(endpointUrl.port) : undefined,
        path: `${endpointUrl.pathname}${endpointUrl.search}`,
        method: "POST",
        headers: {
          "content-type": "application/json; charset=utf-8",
          "content-length": requestBody.length,
        },
      }, (upstream) => {
        const chunks = [];
        upstream.on("data", (chunk) => {
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        });
        upstream.on("end", () => {
          const statusCode = Number.isFinite(Number(upstream.statusCode)) ? Math.trunc(Number(upstream.statusCode)) : 502;
          const bodyBuffer = Buffer.concat(chunks);
          if (statusCode >= 200 && statusCode < 300) {
            const contentType = safeString(Array.isArray(upstream.headers["content-type"]) ? upstream.headers["content-type"][0] : upstream.headers["content-type"], 120) || "audio/mpeg";
            resolve({ audio: bodyBuffer, contentType });
            return;
          }
          let message = `kokoro upstream failed (HTTP ${statusCode})`;
          const rawBody = safeString(bodyBuffer.toString("utf8"), 1200);
          if (rawBody) {
            try {
              const parsed = JSON.parse(rawBody);
              const detail = safeString(parsed && parsed.detail ? typeof parsed.detail === "string" ? parsed.detail : JSON.stringify(parsed.detail) : "", 320);
              const parsedMessage = safeString(parsed && parsed.message ? parsed.message : "", 320);
              const parsedError = safeString(parsed && parsed.error ? parsed.error : "", 320);
              message = detail || parsedMessage || parsedError || message;
            } catch {
              message = safeString(rawBody, 320) || message;
            }
          }
          const error = new Error(message);
          error.statusCode = statusCode >= 500 ? 502 : Math.max(400, Math.min(599, statusCode));
          error.code = "kokoro_upstream_http";
          reject(error);
        });
      });
      req.setTimeout(kokoroVoiceRequestTimeoutMs, () => {
        req.destroy(new Error(`kokoro upstream timed out after ${kokoroVoiceRequestTimeoutMs}ms`));
      });
      req.on("error", (error) => {
        const wrapped = new Error(safeString(error && error.message ? error.message : "kokoro upstream request failed", 220) || "kokoro upstream request failed");
        wrapped.code = safeString(error && error.code ? String(error.code) : "", 80) || "kokoro_upstream_error";
        if (/timed out/i.test(wrapped.message)) {
          wrapped.statusCode = 504;
        } else if (wrapped.code === "ECONNREFUSED" || wrapped.code === "EHOSTUNREACH" || wrapped.code === "ENOTFOUND") {
          wrapped.statusCode = 503;
        } else {
          wrapped.statusCode = 502;
        }
        reject(wrapped);
      });
      req.write(requestBody);
      req.end();
    });
  }
  return {
    getConversationRuntimeSnapshot,
    getKokoroVoiceRuntimeSnapshot,
    normalizeConversationMessage,
    normalizeConversationMode,
    normalizeConversationLevel,
    normalizeConversationTopic,
    normalizeConversationPersonaUserId,
    normalizeConversationHistoryItems,
    getConversationPersonaContextForUser,
    updateConversationPersonaMemoryForUser,
    resetConversationPersonaMemoryForUser,
    runConversationViaAppServer,
    resolveConversationRequestErrorStatus,
    resolvePiperVoiceRequestErrorStatus,
    resolveKokoroVoiceRequestErrorStatus,
    requestKokoroSpeech,
  };
}

function valueOrDefault(value, fallback) {
  return value === undefined || value === null ? fallback : value;
}

module.exports = {
  createConversationRuntime,
};
