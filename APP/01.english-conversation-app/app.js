const state = {
  pending: false,
  controller: null,
  messages: [],
  conversation: {
    ready: false,
    configured: false,
    provider: "app-server",
    model: "",
    error: "",
    endpoint: buildAppApiPath("/conversation/direct"),
    mode: "normal",
    personaUserId: "",
    personaMemory: {
      turns: 0,
      factsCount: 0,
      topicsCount: 0,
      recentFacts: [],
      recentTopics: [],
      updatedAt: 0,
    },
  },
  voice: {
    recognition: null,
    supportedInput: false,
    supportedTts: typeof window !== "undefined" && "speechSynthesis" in window,
    listening: false,
    speaking: false,
    realtimeActive: false,
    pausedForTurn: false,
    enabledTts: true,
    preferredLang: "en-US",
    recognitionLang: "en-US",
    ttsProvider: "browser",
    selectedVoiceUri: "",
    piperModel: "en_US-lessac-high",
    piperSpeaker: "",
    piperPreparing: false,
    piperPrepared: false,
    piperPrepareError: "",
    kokoroAudio: null,
    kokoroAbortController: null,
    silenceMs: 1200,
    silenceTimer: null,
    baseText: "",
    finalText: "",
    interimText: "",
    interimSinceMs: 0,
  },
};

const HISTORY_LIMIT = 12;
const CONVERSATION_MODE_STORAGE_KEY = "english_conversation_mode";
const CONVERSATION_PERSONA_USER_ID_STORAGE_KEY = "english_conversation_persona_user_id";
const CONVERSATION_PERSONA_MEMORY_SUMMARY_STORAGE_KEY = "english_conversation_persona_memory_summary";
const TTS_VOICE_STORAGE_KEY = "english_conversation_tts_voice_uri";
const TTS_PROVIDER_STORAGE_KEY = "english_conversation_tts_provider";
const RECOGNITION_LANG_STORAGE_KEY = "english_conversation_recognition_lang";
const PIPER_MODEL_STORAGE_KEY = "english_conversation_piper_model";
const PIPER_SPEAKER_STORAGE_KEY = "english_conversation_piper_speaker";
let piperPreparePromise = null;

const el = {
  connectionBadge: byId("connectionBadge"),
  conversationModeSelect: byId("conversationModeSelect"),
  levelSelect: byId("levelSelect"),
  topicInput: byId("topicInput"),
  conversationModeHint: byId("conversationModeHint"),
  personaMemoryStatus: byId("personaMemoryStatus"),
  personaResetBtn: byId("personaResetBtn"),
  chatLog: byId("chatLog"),
  composer: byId("composer"),
  messageInput: byId("messageInput"),
  sendBtn: byId("sendBtn"),
  stopBtn: byId("stopBtn"),
  newSessionBtn: byId("newSessionBtn"),
  voiceInputBtn: byId("voiceInputBtn"),
  silenceMsSelect: byId("silenceMsSelect"),
  recognitionLangSelect: byId("recognitionLangSelect"),
  ttsProviderSelect: byId("ttsProviderSelect"),
  voiceSelect: byId("voiceSelect"),
  piperModelInput: byId("piperModelInput"),
  piperSpeakerInput: byId("piperSpeakerInput"),
  ttsEnabled: byId("ttsEnabled"),
  ttsEngineHint: byId("ttsEngineHint"),
  voiceStatus: byId("voiceStatus"),
  messageTemplate: byId("messageTemplate"),
};

function byId(id) {
  return document.getElementById(id);
}

function resolveAppBasePath() {
  const pathname = compactText(window.location && window.location.pathname ? window.location.pathname : "", 240);
  if (pathname === "/apps/english-conversation-app" || pathname.startsWith("/apps/english-conversation-app/")) {
    return "/apps/english-conversation-app";
  }
  return "";
}

function buildAppApiPath(pathname) {
  const normalized = compactText(pathname, 240);
  if (!normalized) return "/api";
  const suffix = normalized.startsWith("/") ? normalized : `/${normalized}`;
  return `${resolveAppBasePath()}/api${suffix}`;
}

function getAvatarBridge() {
  if (typeof window === "undefined") return null;
  const candidate = window.__avatarBridge;
  return candidate && typeof candidate === "object" ? candidate : null;
}

function setAvatarTalking(active) {
  const bridge = getAvatarBridge();
  if (!bridge || typeof bridge.setTalking !== "function") return;
  try {
    bridge.setTalking(Boolean(active));
  } catch {
  }
}

function setAvatarAudioElement(audioElement) {
  const bridge = getAvatarBridge();
  if (!bridge || typeof bridge.setAudioElement !== "function") return;
  try {
    bridge.setAudioElement(audioElement || null);
  } catch {
  }
}

function pulseAvatarSpeechCue(strength = 0.75, durationMs = 120) {
  const bridge = getAvatarBridge();
  if (!bridge || typeof bridge.pulseSpeech !== "function") return;
  try {
    bridge.pulseSpeech(strength, durationMs);
  } catch {
  }
}

let avatarSpeechCueTimer = null;
let avatarBoundaryMode = false;
let avatarBoundaryCount = 0;
let avatarLastBoundaryMs = 0;

function clampNumber(value, min, max) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return min;
  return Math.max(min, Math.min(max, numeric));
}

function resetAvatarBoundarySync() {
  avatarBoundaryMode = false;
  avatarBoundaryCount = 0;
  avatarLastBoundaryMs = 0;
}

function stopAvatarSpeechCueTrack() {
  if (avatarSpeechCueTimer !== null) {
    clearTimeout(avatarSpeechCueTimer);
    avatarSpeechCueTimer = null;
  }
}

function startAvatarSpeechCueTrack(
  text,
  { intervalMs = 320, strengthFloor = 0.4, strengthCeil = 0.78 } = {}
) {
  stopAvatarSpeechCueTrack();
  const safeText = compactText(text, 24000);
  if (!safeText) return;
  const words = safeText.split(/\s+/).filter(Boolean).slice(0, 360);
  if (!words.length) return;
  let index = 0;
  const baseInterval = clampNumber(Math.trunc(Number(intervalMs) || 320), 160, 520);
  const lowStrength = clampNumber(strengthFloor, 0.2, 0.92);
  const highStrength = clampNumber(Math.max(strengthCeil, lowStrength + 0.02), lowStrength, 1);

  const run = () => {
    if (index >= words.length) {
      avatarSpeechCueTimer = null;
      return;
    }
    const word = words[index];
    index += 1;

    const syllableHint = Math.max(1, (word.match(/[aeiouy]+/gi) || []).length);
    const normalized = clampNumber((syllableHint - 1) / 4, 0, 1);
    const strength = lowStrength + (highStrength - lowStrength) * normalized;
    const duration = Math.max(80, Math.min(240, 90 + Math.trunc(word.length * 7)));
    pulseAvatarSpeechCue(strength, duration);

    const punctuationPause = /[,.!?;:]$/.test(word) ? 150 : 0;
    avatarSpeechCueTimer = window.setTimeout(run, baseInterval + punctuationPause);
  };

  run();
}

function noteAvatarSpeechBoundary(event, utteranceText) {
  avatarBoundaryCount += 1;

  const elapsedMs = Number.isFinite(Number(event && event.elapsedTime))
    ? Math.max(0, Math.trunc(Number(event.elapsedTime) * 1000))
    : 0;
  let intervalMs = 0;
  if (elapsedMs > 0) {
    if (avatarLastBoundaryMs > 0) {
      intervalMs = Math.max(70, elapsedMs - avatarLastBoundaryMs);
    }
    avatarLastBoundaryMs = elapsedMs;
  }

  // Switch to boundary-driven sync once boundaries are frequent enough.
  if (!avatarBoundaryMode && avatarBoundaryCount >= 3 && intervalMs > 0 && intervalMs < 680) {
    avatarBoundaryMode = true;
    stopAvatarSpeechCueTrack();
  }

  const charIndex = Number.isFinite(Number(event && event.charIndex))
    ? Math.max(0, Math.trunc(Number(event.charIndex)))
    : -1;
  const charLength = Number.isFinite(Number(event && event.charLength))
    ? Math.max(1, Math.trunc(Number(event.charLength)))
    : 2;
  const segment =
    charIndex >= 0 && typeof utteranceText === "string"
      ? compactText(utteranceText.slice(charIndex, charIndex + Math.min(20, charLength + 8)), 80)
      : "";
  const syllableHint = Math.max(1, (segment.match(/[aeiouy]+/gi) || []).length);
  const cadenceBoost = intervalMs > 0 ? clampNumber(300 / intervalMs, 0.75, 1.35) : 1;
  const strength = clampNumber((0.42 + syllableHint * 0.12) * cadenceBoost, 0.4, 1);
  const duration = intervalMs > 0
    ? clampNumber(Math.trunc(intervalMs * 0.68), 90, 280)
    : clampNumber(95 + charLength * 10, 90, 250);
  pulseAvatarSpeechCue(strength, duration);
}

function setSpeakingState(active) {
  state.voice.speaking = Boolean(active);
  setAvatarTalking(state.voice.speaking);
}

function cancelBrowserSpeechSynthesis() {
  if (typeof window !== "undefined" && window.speechSynthesis) {
    try {
      window.speechSynthesis.cancel();
    } catch {
    }
  }
  resetAvatarBoundarySync();
  stopAvatarSpeechCueTrack();
  setAvatarAudioElement(null);
}

function nowLabel() {
  return new Date().toLocaleTimeString("ja-JP", { hour12: false });
}

function compactText(value, max = 24000) {
  if (typeof value !== "string") return "";
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized ? normalized.slice(0, max) : "";
}

function joinText(...parts) {
  return compactText(parts.map((part) => compactText(String(part || ""), 4000)).filter(Boolean).join(" "));
}

function normalizeConversationMode(value) {
  return compactText(value, 40).toLowerCase() === "persona_friend" ? "persona_friend" : "normal";
}

function isPersonaMode() {
  return normalizeConversationMode(state.conversation.mode) === "persona_friend";
}

function emptyPersonaMemorySummary() {
  return {
    turns: 0,
    factsCount: 0,
    topicsCount: 0,
    recentFacts: [],
    recentTopics: [],
    updatedAt: 0,
  };
}

function normalizePersonaMemorySummary(summary) {
  const source = summary && typeof summary === "object" ? summary : {};
  const turns = Number.isFinite(Number(source.turns)) ? Math.max(0, Math.trunc(Number(source.turns))) : 0;
  const factsCount = Number.isFinite(Number(source.factsCount)) ? Math.max(0, Math.trunc(Number(source.factsCount))) : 0;
  const topicsCount = Number.isFinite(Number(source.topicsCount)) ? Math.max(0, Math.trunc(Number(source.topicsCount))) : 0;
  const recentFacts = Array.isArray(source.recentFacts)
    ? source.recentFacts.map((item) => compactText(String(item || ""), 160)).filter(Boolean).slice(-3)
    : [];
  const recentTopics = Array.isArray(source.recentTopics)
    ? source.recentTopics.map((item) => compactText(String(item || ""), 80)).filter(Boolean).slice(-2)
    : [];
  const updatedAt = Number.isFinite(Number(source.updatedAt)) ? Math.max(0, Math.trunc(Number(source.updatedAt))) : 0;
  return {
    turns,
    factsCount,
    topicsCount,
    recentFacts,
    recentTopics,
    updatedAt,
  };
}

function createPersonaUserId() {
  const uuid =
    typeof window !== "undefined" && window.crypto && typeof window.crypto.randomUUID === "function"
      ? window.crypto.randomUUID()
      : `local_${Date.now()}_${Math.random().toString(16).slice(2, 10)}`;
  return compactText(uuid, 80).toLowerCase().replace(/[^a-z0-9._-]+/g, "-");
}

function loadStoredConversationMode() {
  if (typeof window === "undefined" || !window.localStorage) return "normal";
  try {
    return normalizeConversationMode(window.localStorage.getItem(CONVERSATION_MODE_STORAGE_KEY));
  } catch {
    return "normal";
  }
}

function storeConversationMode(value) {
  if (typeof window === "undefined" || !window.localStorage) return;
  try {
    window.localStorage.setItem(CONVERSATION_MODE_STORAGE_KEY, normalizeConversationMode(value));
  } catch {
  }
}

function normalizeRecognitionLang(value) {
  const normalized = compactText(value, 24).toLowerCase();
  if (normalized === "en-gb") return "en-GB";
  if (normalized === "en-au") return "en-AU";
  if (normalized === "ja-jp") return "ja-JP";
  return "en-US";
}

function loadStoredRecognitionLang() {
  if (typeof window === "undefined" || !window.localStorage) return "en-US";
  try {
    return normalizeRecognitionLang(window.localStorage.getItem(RECOGNITION_LANG_STORAGE_KEY));
  } catch {
    return "en-US";
  }
}

function storeRecognitionLang(value) {
  if (typeof window === "undefined" || !window.localStorage) return;
  try {
    window.localStorage.setItem(RECOGNITION_LANG_STORAGE_KEY, normalizeRecognitionLang(value));
  } catch {
  }
}

function loadOrCreatePersonaUserId() {
  if (typeof window === "undefined" || !window.localStorage) return "local_user";
  try {
    const stored = compactText(window.localStorage.getItem(CONVERSATION_PERSONA_USER_ID_STORAGE_KEY), 80)
      .toLowerCase()
      .replace(/[^a-z0-9._-]+/g, "-");
    if (stored) return stored;
    const created = createPersonaUserId();
    window.localStorage.setItem(CONVERSATION_PERSONA_USER_ID_STORAGE_KEY, created);
    return created;
  } catch {
    return "local_user";
  }
}

function loadStoredPersonaMemorySummary() {
  if (typeof window === "undefined" || !window.localStorage) return emptyPersonaMemorySummary();
  try {
    const raw = window.localStorage.getItem(CONVERSATION_PERSONA_MEMORY_SUMMARY_STORAGE_KEY);
    if (!raw) return emptyPersonaMemorySummary();
    const parsed = JSON.parse(raw);
    return normalizePersonaMemorySummary(parsed);
  } catch {
    return emptyPersonaMemorySummary();
  }
}

function storePersonaMemorySummary(summary) {
  if (typeof window === "undefined" || !window.localStorage) return;
  try {
    const normalized = normalizePersonaMemorySummary(summary);
    window.localStorage.setItem(
      CONVERSATION_PERSONA_MEMORY_SUMMARY_STORAGE_KEY,
      JSON.stringify(normalized)
    );
  } catch {
  }
}

function setConnectionBadge(kind, text) {
  if (!el.connectionBadge) return;
  el.connectionBadge.className = `badge ${kind}`;
  el.connectionBadge.textContent = text;
}

function personaMemoryLabel() {
  const memory = normalizePersonaMemorySummary(state.conversation.personaMemory);
  if (!memory.factsCount && !memory.topicsCount && !memory.turns) {
    return "Friend memory: empty";
  }
  const facts = `facts ${memory.factsCount}`;
  const topics = `topics ${memory.topicsCount}`;
  const turns = `turns ${memory.turns}`;
  const hints = [];
  if (Array.isArray(memory.recentFacts) && memory.recentFacts.length) {
    hints.push(memory.recentFacts[0]);
  }
  if (Array.isArray(memory.recentTopics) && memory.recentTopics.length) {
    hints.push(`topic: ${memory.recentTopics[0]}`);
  }
  const suffix = hints.length ? ` / ${hints.join(" | ")}` : "";
  return `Friend memory: ${facts}, ${topics}, ${turns}${suffix}`;
}

function updateConversationModeUi() {
  const mode = normalizeConversationMode(state.conversation.mode);
  state.conversation.mode = mode;
  const persona = mode === "persona_friend";

  if (typeof document !== "undefined" && document.body) {
    document.body.classList.toggle("mode-persona", persona);
  }

  if (el.conversationModeSelect) {
    el.conversationModeSelect.value = mode;
    el.conversationModeSelect.disabled = state.pending;
  }

  if (el.conversationModeHint) {
    el.conversationModeHint.textContent = persona
      ? "Friend Persona mode: AI talks as your close American friend."
      : "Normal mode: neutral conversation partner.";
  }

  if (el.personaMemoryStatus) {
    el.personaMemoryStatus.hidden = !persona;
    el.personaMemoryStatus.textContent = persona ? personaMemoryLabel() : "";
  }

  if (el.personaResetBtn) {
    el.personaResetBtn.hidden = !persona;
    el.personaResetBtn.disabled = !persona || state.pending;
  }
}

function setPersonaMemorySummary(summary) {
  state.conversation.personaMemory = normalizePersonaMemorySummary(summary || emptyPersonaMemorySummary());
  storePersonaMemorySummary(state.conversation.personaMemory);
  updateConversationModeUi();
}

function loadStoredVoiceUri() {
  if (typeof window === "undefined" || !window.localStorage) return "";
  try {
    return compactText(window.localStorage.getItem(TTS_VOICE_STORAGE_KEY), 240);
  } catch {
    return "";
  }
}

function storeSelectedVoiceUri(value) {
  if (typeof window === "undefined" || !window.localStorage) return;
  try {
    const normalized = compactText(value, 240);
    if (normalized) {
      window.localStorage.setItem(TTS_VOICE_STORAGE_KEY, normalized);
    } else {
      window.localStorage.removeItem(TTS_VOICE_STORAGE_KEY);
    }
  } catch {
  }
}

function normalizeTtsProvider(value) {
  const normalized = compactText(value, 24).toLowerCase();
  if (normalized === "piper") return "piper";
  if (normalized === "kokoro") return "kokoro";
  return "browser";
}

function loadStoredTtsProvider() {
  if (typeof window === "undefined" || !window.localStorage) return "browser";
  try {
    return normalizeTtsProvider(window.localStorage.getItem(TTS_PROVIDER_STORAGE_KEY));
  } catch {
    return "browser";
  }
}

function storeTtsProvider(value) {
  if (typeof window === "undefined" || !window.localStorage) return;
  try {
    window.localStorage.setItem(TTS_PROVIDER_STORAGE_KEY, normalizeTtsProvider(value));
  } catch {
  }
}

function loadStoredPiperModel() {
  if (typeof window === "undefined" || !window.localStorage) return "en_US-lessac-high";
  try {
    const stored = compactText(window.localStorage.getItem(PIPER_MODEL_STORAGE_KEY), 120);
    return stored || "en_US-lessac-high";
  } catch {
    return "en_US-lessac-high";
  }
}

function storePiperModel(value) {
  if (typeof window === "undefined" || !window.localStorage) return;
  try {
    const normalized = compactText(value, 120);
    if (normalized) {
      window.localStorage.setItem(PIPER_MODEL_STORAGE_KEY, normalized);
    } else {
      window.localStorage.removeItem(PIPER_MODEL_STORAGE_KEY);
    }
  } catch {
  }
}

function loadStoredPiperSpeaker() {
  if (typeof window === "undefined" || !window.localStorage) return "";
  try {
    return compactText(window.localStorage.getItem(PIPER_SPEAKER_STORAGE_KEY), 12);
  } catch {
    return "";
  }
}

function storePiperSpeaker(value) {
  if (typeof window === "undefined" || !window.localStorage) return;
  try {
    const normalized = compactText(value, 12);
    if (normalized) {
      window.localStorage.setItem(PIPER_SPEAKER_STORAGE_KEY, normalized);
    } else {
      window.localStorage.removeItem(PIPER_SPEAKER_STORAGE_KEY);
    }
  } catch {
  }
}

function isPiperTtsProvider() {
  return normalizeTtsProvider(state.voice.ttsProvider) === "piper";
}

function isKokoroTtsProvider() {
  return normalizeTtsProvider(state.voice.ttsProvider) === "kokoro";
}

function isBrowserTtsProvider() {
  return !isPiperTtsProvider() && !isKokoroTtsProvider();
}

function providerDisplayName(provider) {
  const normalized = compactText(provider, 40).toLowerCase();
  if (normalized === "app-server") return "Codex app-server";
  if (normalized === "harness-proxy") return "Harness backend";
  return normalized || "Conversation provider";
}

function setPending(pending) {
  state.pending = Boolean(pending);
  if (el.sendBtn) el.sendBtn.disabled = state.pending;
  if (el.messageInput) el.messageInput.disabled = state.pending;
  if (el.stopBtn) el.stopBtn.disabled = !state.pending;
  updateVoiceControls();
  updateConversationModeUi();
}

function updateChatEmptyState() {
  if (!el.chatLog) return;
  el.chatLog.classList.toggle("empty", el.chatLog.childElementCount === 0);
}

function createMessage(role, label, text, extraClass = "") {
  if (!el.messageTemplate || !el.chatLog) return null;
  const fragment = el.messageTemplate.content.cloneNode(true);
  const node = fragment.querySelector(".message");
  const meta = fragment.querySelector(".message-meta");
  const body = fragment.querySelector(".message-body");
  if (!node || !meta || !body) return null;

  node.classList.add(role);
  if (extraClass) node.classList.add(extraClass);
  meta.textContent = `${label} ${nowLabel()}`;
  body.textContent = text || "";
  el.chatLog.appendChild(fragment);
  el.chatLog.scrollTop = el.chatLog.scrollHeight;
  updateChatEmptyState();

  const appended = el.chatLog.lastElementChild;
  return {
    node: appended,
    body: appended ? appended.querySelector(".message-body") : null,
  };
}

function appendSystemMessage(text) {
  createMessage("system", "System", text);
}

function appendErrorMessage(text) {
  createMessage("error", "Error", text, "error");
}

function pushHistory(role, text) {
  const normalized = compactText(text, 2200);
  if (!normalized) return;
  state.messages.push({ role, text: normalized });
  if (state.messages.length > 40) {
    state.messages = state.messages.slice(-40);
  }
}

function historyForRequest() {
  return state.messages.slice(-HISTORY_LIMIT).map((item) => ({
    role: item.role,
    text: item.text,
  }));
}

function setVoiceStatus(text, kind = "ready") {
  if (!el.voiceStatus) return;
  el.voiceStatus.className = `voice-status ${kind}`;
  el.voiceStatus.textContent = text;
}

function updateTtsEngineHint() {
  if (!el.ttsEngineHint) return;
  if (!state.voice.enabledTts) {
    el.ttsEngineHint.textContent = "Reply playback is off.";
    return;
  }
  if (isPiperTtsProvider()) {
    const model = compactText(state.voice.piperModel, 120);
    const speaker = compactText(state.voice.piperSpeaker, 12);
    const suffix = speaker ? ` speaker=${speaker}` : "";
    if (state.voice.piperPreparing) {
      el.ttsEngineHint.textContent = `TTS: Piper (${model || "model not set"}${suffix}) is preparing now...`;
      return;
    }
    if (state.voice.piperPrepared) {
      el.ttsEngineHint.textContent = `TTS: Piper (${model || "model not set"}${suffix}) is ready (preloaded).`;
      return;
    }
    if (state.voice.piperPrepareError) {
      el.ttsEngineHint.textContent = `TTS: Piper not ready: ${compactText(state.voice.piperPrepareError, 100)}`;
      return;
    }
    el.ttsEngineHint.textContent = `TTS: Piper (${model || "model not set"}${suffix}) is not prepared yet.`;
    return;
  }
  if (isKokoroTtsProvider()) {
    el.ttsEngineHint.textContent = "TTS: Kokoro FastAPI (local container at :8880 via /api/voice/kokoro).";
    return;
  }
  if (!state.voice.supportedTts) {
    el.ttsEngineHint.textContent = "Browser TTS is unavailable in this browser. Switch to Piper or Kokoro.";
    return;
  }
  el.ttsEngineHint.textContent = "TTS: Microsoft / browser voice (local, no extra API cost).";
}

async function loadConversationRuntime() {
  const wasReady = state.conversation.ready;
  try {
    const response = await fetch(buildAppApiPath("/conversation/runtime"), { cache: "no-store" });
    if (!response.ok) throw new Error(`runtime HTTP ${response.status}`);
    const payload = await response.json();
    const configured = Boolean(payload && payload.configured);
    const provider = compactText(payload && payload.provider, 40) || "app-server";
    const providerName = providerDisplayName(provider);
    const runtimeError = compactText(payload && payload.error, 220);
    state.conversation.ready = configured;
    state.conversation.configured = configured;
    state.conversation.provider = provider;
    state.conversation.model = compactText(payload && payload.model, 120);
    state.conversation.endpoint =
      compactText(payload && payload.endpoint, 120) === "POST /api/conversation/direct"
        ? buildAppApiPath("/conversation/direct")
        : buildAppApiPath("/conversation/direct");
    const runtimeDefaultMode = normalizeConversationMode(payload && payload.defaultMode);
    state.conversation.mode = normalizeConversationMode(state.conversation.mode || runtimeDefaultMode);
    state.conversation.error = configured
      ? ""
      : runtimeError || `${providerName} is not configured on server.`;
    if (configured) {
      setConnectionBadge("connected", `${providerName} ready (${state.conversation.model || "default"})`);
      if (!state.voice.realtimeActive && !state.voice.listening) {
        setVoiceStatus("Realtime is off.", "ready");
      }
    } else {
      setConnectionBadge("failed", compactText(state.conversation.error || `${providerName} not configured`, 120));
      if (state.voice.realtimeActive || wasReady) {
        deactivateRealtimeConversation(`Realtime stopped: ${state.conversation.error}`);
      }
      if (state.voice.supportedInput) {
        setVoiceStatus(state.conversation.error, "error");
      }
    }
  } catch (_error) {
    state.conversation.ready = false;
    state.conversation.configured = false;
    state.conversation.error = "Conversation API is unreachable.";
    setConnectionBadge("disconnected", "Conversation API offline");
    if (state.voice.realtimeActive) {
      deactivateRealtimeConversation("Realtime stopped: Conversation API offline.");
    } else if (state.voice.supportedInput) {
      setVoiceStatus("Conversation API offline.", "error");
    }
  } finally {
    setPending(state.pending);
  }
}

async function ensureConversationReady() {
  if (state.conversation.ready) return true;
  setConnectionBadge("pending", "Connecting...");
  await loadConversationRuntime();
  return state.conversation.ready;
}

function clearSilenceTimer() {
  if (state.voice.silenceTimer !== null) {
    clearTimeout(state.voice.silenceTimer);
    state.voice.silenceTimer = null;
  }
}

function composeLiveTranscript() {
  return joinText(state.voice.baseText, state.voice.finalText, state.voice.interimText);
}

function renderLiveTranscript() {
  if (!el.messageInput) return;
  el.messageInput.value = composeLiveTranscript();
}

function resetVoiceBuffers() {
  state.voice.baseText = "";
  state.voice.finalText = "";
  state.voice.interimText = "";
  state.voice.interimSinceMs = 0;
  renderLiveTranscript();
}

function stopVoiceRecognition() {
  if (!state.voice.supportedInput || !state.voice.recognition || !state.voice.listening) return;
  try {
    state.voice.recognition.stop();
  } catch (_error) {
  }
}

function speechReadyText(text) {
  return compactText(String(text || "").replace(/\[(error|stopped)\]/gi, ""), 24000);
}

function estimateSpeechTimeoutMs(text) {
  const spoken = speechReadyText(text);
  const estimated = 7000 + spoken.length * 45;
  return clampNumber(Math.trunc(estimated), 7000, 30000);
}

function isEnglishVoice(voice) {
  const lang = compactText(voice && voice.lang, 24);
  return /^en(-|_)/i.test(lang);
}

function isMicrosoftVoice(voice) {
  const name = compactText(voice && voice.name, 160);
  const uri = compactText(voice && voice.voiceURI, 160);
  return /microsoft/i.test(name) || /microsoft/i.test(uri);
}

function listTtsVoices() {
  if (!state.voice.supportedTts || !window.speechSynthesis) return [];
  const voices = window.speechSynthesis.getVoices();
  if (!Array.isArray(voices) || !voices.length) return [];
  const englishVoices = voices.filter((voice) => isEnglishVoice(voice));
  if (!englishVoices.length) return voices;
  const microsoftEnglish = englishVoices.filter((voice) => isMicrosoftVoice(voice));
  return microsoftEnglish.length ? microsoftEnglish : englishVoices;
}

function chooseEnglishVoice(voicesInput = null) {
  const voices = Array.isArray(voicesInput) ? voicesInput : listTtsVoices();
  if (!Array.isArray(voices) || !voices.length) return null;
  return (
    voices.find((voice) => /^en(-|_)/i.test(String(voice.lang || ""))) ||
    voices.find((voice) => /english/i.test(String(voice.name || ""))) ||
    null
  );
}

function voiceOptionLabel(voice) {
  const name = compactText(voice && voice.name, 120) || "Voice";
  const lang = compactText(voice && voice.lang, 24) || "unknown";
  return `${name} (${lang})`;
}

function resolveConfiguredVoice(voices) {
  if (!Array.isArray(voices) || !voices.length) return null;
  const preferredUri = compactText(state.voice.selectedVoiceUri, 240);
  if (preferredUri) {
    const exact = voices.find((voice) => compactText(voice && voice.voiceURI, 240) === preferredUri);
    if (exact) return exact;
  }
  return chooseEnglishVoice(voices);
}

function renderVoiceOptions() {
  if (!el.voiceSelect) return;
  const voices = listTtsVoices();
  el.voiceSelect.innerHTML = "";
  const autoOption = document.createElement("option");
  autoOption.value = "";
  autoOption.textContent = "Auto (Microsoft/English)";
  el.voiceSelect.appendChild(autoOption);
  if (Array.isArray(voices) && voices.length) {
    for (const voice of voices) {
      const uri = compactText(voice && voice.voiceURI, 240);
      if (!uri) continue;
      const option = document.createElement("option");
      option.value = uri;
      option.textContent = voiceOptionLabel(voice);
      el.voiceSelect.appendChild(option);
    }
  }
  const selected = compactText(state.voice.selectedVoiceUri, 240);
  if (selected) {
    const hasSelected = Array.from(el.voiceSelect.options).some((option) => option.value === selected);
    el.voiceSelect.value = hasSelected ? selected : "";
    if (!hasSelected) {
      state.voice.selectedVoiceUri = "";
      storeSelectedVoiceUri("");
    }
  } else {
    el.voiceSelect.value = "";
  }
}

function parsePiperSpeaker(rawValue) {
  const normalized = compactText(rawValue, 12);
  if (!normalized) return null;
  if (!/^\d+$/.test(normalized)) return null;
  const parsed = Number(normalized);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : null;
}

async function ensurePiperPrepared({ announce = false, force = false } = {}) {
  if (!force && !isPiperTtsProvider()) return false;
  if (state.voice.piperPrepared && !force) return true;
  if (piperPreparePromise) return piperPreparePromise;
  const model = compactText(state.voice.piperModel, 120);
  if (!model || !/-high$/i.test(model)) {
    state.voice.piperPrepared = false;
    state.voice.piperPrepareError = "Piper model must end with -high.";
    updateVoiceControls();
    return false;
  }
  const speaker = parsePiperSpeaker(state.voice.piperSpeaker);
  state.voice.piperPreparing = true;
  state.voice.piperPrepareError = "";
  if (announce) {
    setVoiceStatus(`Preparing Piper (${model})...`, "ready");
  }
  updateVoiceControls();

  piperPreparePromise = (async () => {
    try {
      const payload = {
        model,
        autoDownload: true,
        warmup: true,
      };
      if (speaker !== null) payload.speaker = speaker;
      const response = await fetch(buildAppApiPath("/voice/piper/prepare"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      let bodyJson = null;
      let bodyText = "";
      try {
        bodyText = await response.text();
        bodyJson = bodyText ? JSON.parse(bodyText) : null;
      } catch {
        bodyJson = null;
      }
      if (!response.ok || !bodyJson || bodyJson.ok !== true) {
        const reason =
          (bodyJson && typeof bodyJson.error === "string" && compactText(bodyJson.error, 220)) ||
          `Piper prepare failed (HTTP ${response.status}).`;
        throw new Error(reason);
      }
      state.voice.piperPrepared = true;
      state.voice.piperPrepareError = "";
      if (announce) {
        setVoiceStatus(`Piper ready: ${model}`, "ready");
      }
      return true;
    } catch (error) {
      const message = compactText(error && error.message ? error.message : "Piper prepare failed", 220);
      state.voice.piperPrepared = false;
      state.voice.piperPrepareError = message;
      if (announce) {
        setVoiceStatus(message, "error");
      }
      return false;
    } finally {
      state.voice.piperPreparing = false;
      piperPreparePromise = null;
      updateVoiceControls();
    }
  })();
  return piperPreparePromise;
}

async function speakAssistantTextWithPiper(text) {
  const model = compactText(state.voice.piperModel, 120);
  if (!model) {
    setVoiceStatus("Piper model is required.", "error");
    return false;
  }
  if (!/-high$/i.test(model)) {
    setVoiceStatus("Piper model must end with -high.", "error");
    return false;
  }

  const speaker = parsePiperSpeaker(state.voice.piperSpeaker);
  if (!state.voice.piperPrepared) {
    const prepared = await ensurePiperPrepared({ announce: true });
    if (!prepared) return false;
  }
  let failed = false;
  setSpeakingState(true);
  setAvatarAudioElement(null);
  startAvatarSpeechCueTrack(text, { intervalMs: 310 });
  setVoiceStatus(`Speaking via Piper (${model})...`, "speaking");
  try {
    const payload = {
      text,
      model,
      autoDownload: false,
    };
    if (speaker !== null) payload.speaker = speaker;

    const response = await fetch(buildAppApiPath("/voice/piper"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    let bodyJson = null;
    let bodyText = "";
    try {
      bodyText = await response.text();
      bodyJson = bodyText ? JSON.parse(bodyText) : null;
    } catch {
      bodyJson = null;
    }

    if (!response.ok || !bodyJson || bodyJson.ok !== true) {
      if (response.status === 404) {
        const reason =
          (bodyJson && typeof bodyJson.error === "string" && compactText(bodyJson.error, 220)) ||
          "Piper model is not prepared yet.";
        state.voice.piperPrepared = false;
        state.voice.piperPrepareError = reason;
        setVoiceStatus(reason, "error");
        updateVoiceControls();
        return false;
      }
      const reason =
        (bodyJson && typeof bodyJson.error === "string" && compactText(bodyJson.error, 220)) ||
        `Piper playback request failed (HTTP ${response.status}).`;
      throw new Error(reason);
    }
    return true;
  } catch (error) {
    failed = true;
    const message = compactText(error && error.message ? error.message : "Piper playback failed", 220);
    setVoiceStatus(message, "error");
    appendErrorMessage(message);
    return false;
  } finally {
    stopAvatarSpeechCueTrack();
    setAvatarAudioElement(null);
    setSpeakingState(false);
    if (!failed && !state.voice.realtimeActive && !state.voice.listening) {
      setVoiceStatus("Realtime is off.", "ready");
    }
  }
}

function stopKokoroPlayback() {
  if (state.voice.kokoroAbortController) {
    try {
      state.voice.kokoroAbortController.abort();
    } catch (_error) {
    }
    state.voice.kokoroAbortController = null;
  }
  const currentAudio = state.voice.kokoroAudio;
  if (currentAudio) {
    try {
      currentAudio.pause();
      currentAudio.currentTime = 0;
    } catch (_error) {
    }
    const objectUrl = currentAudio.__objectUrl;
    if (objectUrl) {
      try {
        URL.revokeObjectURL(objectUrl);
      } catch (_error) {
      }
    }
  }
  state.voice.kokoroAudio = null;
  stopAvatarSpeechCueTrack();
  setAvatarAudioElement(null);
}

async function speakAssistantTextWithKokoro(text) {
  stopKokoroPlayback();
  const abortController = typeof AbortController === "function" ? new AbortController() : null;
  state.voice.kokoroAbortController = abortController;
  let failed = false;
  let audio = null;
  setSpeakingState(true);
  setAvatarAudioElement(null);
  setVoiceStatus("Speaking via Kokoro...", "speaking");
  try {
    const response = await fetch(buildAppApiPath("/voice/kokoro"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
      signal: abortController ? abortController.signal : undefined,
    });

    if (!response.ok) {
      let reason = `Kokoro playback request failed (HTTP ${response.status}).`;
      try {
        const bodyText = await response.text();
        if (bodyText) {
          const parsed = JSON.parse(bodyText);
          if (parsed && typeof parsed.error === "string") {
            reason = compactText(parsed.error, 220);
          }
        }
      } catch {
      }
      throw new Error(reason);
    }

    const audioBlob = await response.blob();
    if (!audioBlob || !audioBlob.size) {
      throw new Error("Kokoro returned empty audio.");
    }

    const objectUrl = URL.createObjectURL(audioBlob);
    audio = new Audio(objectUrl);
    audio.__objectUrl = objectUrl;
    state.voice.kokoroAudio = audio;
    setAvatarAudioElement(audio);
    pulseAvatarSpeechCue(0.95, 140);

    await new Promise((resolve, reject) => {
      const cleanup = () => {
        audio.onended = null;
        audio.onerror = null;
      };
      audio.onended = () => {
        cleanup();
        resolve(true);
      };
      audio.onerror = () => {
        cleanup();
        reject(new Error("Kokoro audio playback failed."));
      };
      audio.play().catch((error) => {
        cleanup();
        reject(error instanceof Error ? error : new Error("Kokoro audio playback failed."));
      });
    });
    return true;
  } catch (error) {
    if (error && error.name === "AbortError") {
      return false;
    }
    failed = true;
    const message = compactText(error && error.message ? error.message : "Kokoro playback failed", 220);
    setVoiceStatus(message, "error");
    appendErrorMessage(message);
    return false;
  } finally {
    if (audio) {
      const objectUrl = audio.__objectUrl;
      if (objectUrl) {
        try {
          URL.revokeObjectURL(objectUrl);
        } catch (_error) {
        }
      }
      if (state.voice.kokoroAudio === audio) {
        state.voice.kokoroAudio = null;
      }
    }
    if (state.voice.kokoroAbortController === abortController) {
      state.voice.kokoroAbortController = null;
    }
    stopAvatarSpeechCueTrack();
    setAvatarAudioElement(null);
    setSpeakingState(false);
    if (!failed && !state.voice.realtimeActive && !state.voice.listening) {
      setVoiceStatus("Realtime is off.", "ready");
    }
  }
}

function speakAssistantTextWithBrowser(text) {
  return new Promise((resolve) => {
    if (!state.voice.supportedTts || !window.speechSynthesis) {
      setVoiceStatus("Browser TTS unavailable. Switch to Piper.", "error");
      resolve(false);
      return;
    }
    const synth = window.speechSynthesis;
    cancelBrowserSpeechSynthesis();
    const utter = new SpeechSynthesisUtterance(text);
    utter.lang = state.voice.preferredLang;
    const selectedVoice = resolveConfiguredVoice(listTtsVoices());
    if (selectedVoice) utter.voice = selectedVoice;
    utter.rate = 1;
    utter.pitch = 1;
    utter.onstart = () => {
      setSpeakingState(true);
      setAvatarAudioElement(null);
      resetAvatarBoundarySync();
      startAvatarSpeechCueTrack(text, {
        intervalMs: 285,
        strengthFloor: 0.35,
        strengthCeil: 0.72,
      });
      setVoiceStatus("Speaking response...", "speaking");
    };
    const finalize = (ok) => {
      resetAvatarBoundarySync();
      stopAvatarSpeechCueTrack();
      setAvatarAudioElement(null);
      setSpeakingState(false);
      if (!state.voice.realtimeActive && !state.voice.listening) {
        setVoiceStatus("Realtime is off.", "ready");
      }
      resolve(ok);
    };
    utter.onboundary = (event) => {
      noteAvatarSpeechBoundary(event, text);
    };
    utter.onend = () => finalize(true);
    utter.onerror = () => {
      setVoiceStatus("Voice playback failed.", "error");
      finalize(false);
    };
    synth.speak(utter);
  });
}

function speakAssistantText(text) {
  if (!state.voice.enabledTts) return Promise.resolve(false);
  const spoken = speechReadyText(text);
  if (!spoken) return Promise.resolve(false);
  if (isPiperTtsProvider()) {
    return speakAssistantTextWithPiper(spoken);
  }
  if (isKokoroTtsProvider()) {
    return speakAssistantTextWithKokoro(spoken);
  }
  return speakAssistantTextWithBrowser(spoken);
}

async function speakAssistantTextWithTimeout(text) {
  const spoken = speechReadyText(text);
  if (!spoken) return false;
  let timeoutId = null;
  try {
    const timeoutMs = estimateSpeechTimeoutMs(spoken);
    const timeoutPromise = new Promise((resolve) => {
      timeoutId = window.setTimeout(() => {
        cancelBrowserSpeechSynthesis();
        stopKokoroPlayback();
        setSpeakingState(false);
        setVoiceStatus("TTS timeout. Continue without audio.", "error");
        resolve(false);
      }, timeoutMs);
    });
    return await Promise.race([speakAssistantText(spoken), timeoutPromise]);
  } finally {
    if (timeoutId !== null) {
      clearTimeout(timeoutId);
    }
  }
}

function updateVoiceControls() {
  if (!el.voiceInputBtn) return;
  if (!state.voice.supportedInput) {
    el.voiceInputBtn.textContent = "Realtime Unavailable";
    el.voiceInputBtn.disabled = true;
  } else if (!state.conversation.ready) {
    el.voiceInputBtn.textContent = "Realtime Locked";
    el.voiceInputBtn.disabled = true;
  } else {
    el.voiceInputBtn.textContent = state.voice.realtimeActive ? "Stop Realtime Talk" : "Start Realtime Talk";
    el.voiceInputBtn.disabled = false;
  }
  if (el.silenceMsSelect) {
    el.silenceMsSelect.disabled = !state.voice.supportedInput || !state.conversation.ready || state.pending;
  }
  if (el.recognitionLangSelect) {
    el.recognitionLangSelect.disabled = !state.voice.supportedInput || state.pending;
    el.recognitionLangSelect.value = normalizeRecognitionLang(state.voice.recognitionLang);
  }
  if (el.ttsProviderSelect) {
    el.ttsProviderSelect.disabled = false;
    el.ttsProviderSelect.value = normalizeTtsProvider(state.voice.ttsProvider);
  }
  if (el.voiceSelect) {
    el.voiceSelect.disabled = !state.voice.enabledTts || !state.voice.supportedTts || !isBrowserTtsProvider();
  }
  if (el.piperModelInput) {
    el.piperModelInput.disabled = !state.voice.enabledTts || !isPiperTtsProvider();
  }
  if (el.piperSpeakerInput) {
    el.piperSpeakerInput.disabled = !state.voice.enabledTts || !isPiperTtsProvider();
  }
  updateTtsEngineHint();
}

function scheduleSilenceFlush() {
  clearSilenceTimer();
  if (!state.voice.realtimeActive || state.pending || state.voice.pausedForTurn) return;
  const hasFinal = compactText(state.voice.finalText, 1200).length > 0;
  const hasInterim = compactText(state.voice.interimText, 1200).length > 0;
  const delayMs = hasFinal
    ? state.voice.silenceMs
    : hasInterim
      ? Math.min(2600, state.voice.silenceMs + 700)
      : state.voice.silenceMs;
  state.voice.silenceTimer = window.setTimeout(() => {
    flushVoiceUtterance();
  }, delayMs);
}

function startVoiceRecognition({ manual = false } = {}) {
  if (!state.voice.supportedInput || !state.voice.recognition) {
    setVoiceStatus("Speech recognition is unavailable.", "error");
    return false;
  }
  if (state.voice.listening) return true;
  if (state.pending || state.voice.speaking || state.voice.pausedForTurn) {
    if (manual) setVoiceStatus("Waiting for current response...", "ready");
    return false;
  }
  if (!state.voice.baseText) {
    state.voice.baseText = compactText(el.messageInput && el.messageInput.value ? el.messageInput.value : "", 1200);
  }
  try {
    state.voice.recognition.start();
    return true;
  } catch (_error) {
    setVoiceStatus("Could not start microphone. Retry.", "error");
    return false;
  }
}

function deactivateRealtimeConversation(reason = "Realtime is off.") {
  state.voice.realtimeActive = false;
  state.voice.pausedForTurn = false;
  clearSilenceTimer();
  stopVoiceRecognition();
  resetVoiceBuffers();
  if (state.voice.supportedTts && window.speechSynthesis) {
    window.speechSynthesis.cancel();
  }
  stopKokoroPlayback();
  setSpeakingState(false);
  updateVoiceControls();
  setVoiceStatus(reason, "ready");
}

function pauseRealtimeForTurn() {
  if (!state.voice.realtimeActive) return;
  state.voice.pausedForTurn = true;
  clearSilenceTimer();
  state.voice.interimText = "";
  state.voice.interimSinceMs = 0;
  renderLiveTranscript();
  stopVoiceRecognition();
}

function resumeRealtimeAfterTurn() {
  if (!state.voice.realtimeActive) return;
  state.voice.pausedForTurn = false;
  resetVoiceBuffers();
  if (state.pending || state.voice.speaking) return;
  startVoiceRecognition();
}

function toggleRealtimeConversation() {
  if (!state.voice.supportedInput) {
    setVoiceStatus("Speech recognition is unavailable in this browser.", "error");
    return;
  }
  if (!state.conversation.ready) {
    setVoiceStatus(state.conversation.error || "Realtime is unavailable right now.", "error");
    appendErrorMessage(state.conversation.error || "Conversation provider is not configured.");
    return;
  }
  if (state.voice.realtimeActive) {
    deactivateRealtimeConversation("Realtime stopped.");
    appendSystemMessage("Realtime conversation stopped.");
    return;
  }
  state.voice.realtimeActive = true;
  state.voice.pausedForTurn = false;
  state.voice.baseText = compactText(el.messageInput && el.messageInput.value ? el.messageInput.value : "", 1200);
  state.voice.finalText = "";
  state.voice.interimText = "";
  state.voice.interimSinceMs = 0;
  renderLiveTranscript();
  updateVoiceControls();
  setVoiceStatus(`Realtime on. Auto-send after ${state.voice.silenceMs / 1000}s silence.`, "ready");
  appendSystemMessage("Realtime conversation started. Speak naturally; speech is auto-sent after silence.");
  startVoiceRecognition({ manual: true });
}

function pickRecognitionTranscript(result) {
  if (!result || typeof result.length !== "number") {
    return "";
  }
  let best = "";
  let bestScore = -Infinity;
  for (let i = 0; i < result.length; i += 1) {
    const alternative = result[i];
    if (!alternative || typeof alternative.transcript !== "string") continue;
    const transcript = compactText(alternative.transcript, 1200);
    if (!transcript) continue;
    const confidence = Number.isFinite(Number(alternative.confidence))
      ? Math.max(0, Number(alternative.confidence))
      : 0;
    const score = confidence * 100 + Math.min(80, transcript.length);
    if (score > bestScore) {
      bestScore = score;
      best = transcript;
    }
  }
  return best;
}

function handleRecognitionResult(event) {
  let finalChunk = "";
  let interimChunk = "";
  for (let i = event.resultIndex; i < event.results.length; i += 1) {
    const result = event.results[i];
    const transcript = pickRecognitionTranscript(result);
    if (!transcript) continue;
    if (result.isFinal) {
      finalChunk = joinText(finalChunk, transcript);
    } else {
      interimChunk = joinText(interimChunk, transcript);
    }
  }
  if (finalChunk) {
    state.voice.finalText = joinText(state.voice.finalText, finalChunk);
    state.voice.interimSinceMs = 0;
  }
  state.voice.interimText = interimChunk;
  if (interimChunk) {
    state.voice.interimSinceMs = Number(state.voice.interimSinceMs) || Date.now();
  } else {
    state.voice.interimSinceMs = 0;
  }
  renderLiveTranscript();
  if (state.voice.realtimeActive) {
    scheduleSilenceFlush();
  }
}

function initVoice() {
  state.voice.recognitionLang = loadStoredRecognitionLang();
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (SpeechRecognition) {
    state.voice.supportedInput = true;
    const recognition = new SpeechRecognition();
    recognition.lang = state.voice.recognitionLang;
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.maxAlternatives = 3;

    recognition.onstart = () => {
      state.voice.listening = true;
      updateVoiceControls();
      setVoiceStatus(
        `Listening (${normalizeRecognitionLang(state.voice.recognitionLang)})... auto-send at ${state.voice.silenceMs / 1000}s silence`,
        "listening"
      );
    };

    recognition.onresult = handleRecognitionResult;

    recognition.onerror = (event) => {
      const code = compactText(event && event.error ? event.error : "unknown", 80);
      if (code === "aborted") return;
      if (code === "not-allowed" || code === "service-not-allowed") {
        deactivateRealtimeConversation("Microphone permission denied.");
        setVoiceStatus("Microphone permission denied.", "error");
        return;
      }
      if (code === "audio-capture") {
        deactivateRealtimeConversation("Microphone device unavailable.");
        setVoiceStatus("Microphone device unavailable.", "error");
        return;
      }
      if (code === "no-speech") {
        setVoiceStatus(
          `Listening (${normalizeRecognitionLang(state.voice.recognitionLang)})... no speech detected yet`,
          "listening"
        );
        return;
      }
      setVoiceStatus(`Voice input error: ${code || "unknown"}`, "error");
    };

    recognition.onend = () => {
      state.voice.listening = false;
      updateVoiceControls();
      if (state.voice.realtimeActive && !state.voice.pausedForTurn && !state.pending && !state.voice.speaking) {
        window.setTimeout(() => {
          startVoiceRecognition();
        }, 280);
        return;
      }
      if (!state.voice.realtimeActive && !state.voice.speaking) {
        setVoiceStatus("Realtime is off.", "ready");
      }
    };

    state.voice.recognition = recognition;
  } else {
    state.voice.supportedInput = false;
    setVoiceStatus("Speech recognition unavailable in this browser.", "error");
  }

  if (state.voice.supportedTts && window.speechSynthesis && typeof window.speechSynthesis.onvoiceschanged !== "undefined") {
    window.speechSynthesis.onvoiceschanged = () => {
      renderVoiceOptions();
      updateVoiceControls();
    };
  }

  state.voice.ttsProvider = loadStoredTtsProvider();
  state.voice.selectedVoiceUri = loadStoredVoiceUri();
  state.voice.piperModel = loadStoredPiperModel();
  state.voice.piperSpeaker = loadStoredPiperSpeaker();
  state.voice.piperPreparing = false;
  state.voice.piperPrepared = false;
  state.voice.piperPrepareError = "";
  state.voice.kokoroAudio = null;
  state.voice.kokoroAbortController = null;
  piperPreparePromise = null;

  if (el.ttsProviderSelect) {
    el.ttsProviderSelect.value = normalizeTtsProvider(state.voice.ttsProvider);
  }
  if (el.recognitionLangSelect) {
    el.recognitionLangSelect.value = normalizeRecognitionLang(state.voice.recognitionLang);
  }
  if (el.piperModelInput) {
    el.piperModelInput.value = state.voice.piperModel;
  }
  if (el.piperSpeakerInput) {
    el.piperSpeakerInput.value = state.voice.piperSpeaker;
  }
  if (el.ttsEnabled) {
    el.ttsEnabled.checked = state.voice.enabledTts;
  }

  renderVoiceOptions();

  if (el.silenceMsSelect) {
    const parsed = Number(el.silenceMsSelect.value);
    if (Number.isFinite(parsed) && parsed > 300) state.voice.silenceMs = Math.trunc(parsed);
  }

  updateVoiceControls();
  if (/-high$/i.test(compactText(state.voice.piperModel, 120))) {
    ensurePiperPrepared({
      announce: false,
      force: !isPiperTtsProvider(),
    }).catch(() => {});
  }
}

function parseApiErrorPayload(payload, fallbackText) {
  if (payload && typeof payload === "object" && typeof payload.error === "string") {
    return compactText(payload.error, 240);
  }
  return compactText(fallbackText, 240) || "unknown error";
}

async function resetPersonaMemory() {
  if (state.pending || !isPersonaMode()) return;
  const ready = await ensureConversationReady();
  if (!ready) {
    appendErrorMessage(state.conversation.error || "Conversation API is unavailable.");
    return;
  }

  setPending(true);
  try {
    const response = await fetch(buildAppApiPath("/conversation/persona/reset"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        personaUserId: state.conversation.personaUserId,
      }),
    });
    const bodyText = await response.text();
    let bodyJson = null;
    try {
      bodyJson = bodyText ? JSON.parse(bodyText) : null;
    } catch {
      bodyJson = null;
    }
    if (!response.ok || !bodyJson || bodyJson.ok !== true) {
      throw new Error(parseApiErrorPayload(bodyJson, `HTTP ${response.status} ${bodyText}`));
    }
    const memory = bodyJson && bodyJson.persona && bodyJson.persona.memory ? bodyJson.persona.memory : emptyPersonaMemorySummary();
    setPersonaMemorySummary(memory);
    appendSystemMessage("Friend memory was reset.");
  } catch (error) {
    appendErrorMessage(compactText(error && error.message ? error.message : "Failed to reset friend memory", 260));
  } finally {
    setPending(false);
  }
}

async function syncPersonaMemoryFromServer({ silent = true } = {}) {
  if (!isPersonaMode()) return false;
  const ready = await ensureConversationReady();
  if (!ready) {
    if (!silent) appendErrorMessage(state.conversation.error || "Conversation API is unavailable.");
    return false;
  }
  try {
    const params = new URLSearchParams({
      personaUserId: state.conversation.personaUserId || "local_user",
    });
    const response = await fetch(`${buildAppApiPath("/conversation/persona/memory")}?${params.toString()}`, { cache: "no-store" });
    const bodyText = await response.text();
    let bodyJson = null;
    try {
      bodyJson = bodyText ? JSON.parse(bodyText) : null;
    } catch {
      bodyJson = null;
    }
    if (!response.ok || !bodyJson || bodyJson.ok !== true) {
      throw new Error(parseApiErrorPayload(bodyJson, `HTTP ${response.status} ${bodyText}`));
    }
    const memory = bodyJson && bodyJson.persona && bodyJson.persona.memory
      ? bodyJson.persona.memory
      : emptyPersonaMemorySummary();
    setPersonaMemorySummary(memory);
    return true;
  } catch (error) {
    if (!silent) {
      appendErrorMessage(
        compactText(error && error.message ? error.message : "Failed to load friend memory", 260)
      );
    }
    return false;
  }
}

async function sendMessage(inputText = "", options = {}) {
  if (state.pending) return;
  const fromVoice = Boolean(options && options.fromVoice);
  const rawInput =
    typeof inputText === "string" && inputText.length
      ? inputText
      : (el.messageInput && el.messageInput.value ? el.messageInput.value : "");
  const userText = compactText(rawInput, 2000);
  if (!userText) return;

  if (fromVoice || state.voice.realtimeActive) {
    pauseRealtimeForTurn();
  }
  cancelBrowserSpeechSynthesis();
  stopKokoroPlayback();
  setSpeakingState(false);

  const ready = await ensureConversationReady();
  if (!ready) {
    appendErrorMessage(state.conversation.error || "Conversation API is unavailable.");
    if (fromVoice || state.voice.realtimeActive) resumeRealtimeAfterTurn();
    return;
  }

  const requestHistory = historyForRequest();
  createMessage("user", "You", userText);
  pushHistory("user", userText);
  if (el.messageInput) el.messageInput.value = "";

  const assistantView = createMessage("assistant", "AI", "");
  if (!assistantView || !assistantView.body) {
    appendErrorMessage("UI render failed.");
    if (fromVoice || state.voice.realtimeActive) resumeRealtimeAfterTurn();
    return;
  }

  const payload = {
    message: userText,
    history: requestHistory,
    level: el.levelSelect && el.levelSelect.value ? el.levelSelect.value : "intermediate",
    topic: compactText(el.topicInput && el.topicInput.value ? el.topicInput.value : "", 140),
    mode: normalizeConversationMode(state.conversation.mode),
    personaUserId: state.conversation.personaUserId || "local_user",
  };

  state.controller = new AbortController();
  setPending(true);
  setConnectionBadge("pending", "Thinking...");

  try {
    const response = await fetch(state.conversation.endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: state.controller.signal,
    });

    let bodyText = "";
    let bodyJson = null;
    try {
      bodyText = await response.text();
      bodyJson = bodyText ? JSON.parse(bodyText) : null;
    } catch {
      bodyJson = null;
    }

    if (!response.ok) {
      throw new Error(parseApiErrorPayload(bodyJson, `HTTP ${response.status} ${bodyText}`));
    }
    if (!bodyJson || bodyJson.ok !== true) {
      throw new Error(parseApiErrorPayload(bodyJson, "Invalid API response"));
    }

    const assistantText = compactText(bodyJson.text, 24000) || "(empty response)";
    assistantView.body.textContent = assistantText;
    pushHistory("assistant", assistantText);

    const responseMode = normalizeConversationMode(bodyJson.mode || state.conversation.mode);
    if (responseMode !== state.conversation.mode) {
      state.conversation.mode = responseMode;
      storeConversationMode(responseMode);
    }
    if (responseMode === "persona_friend") {
      const memorySummary = bodyJson && bodyJson.persona && bodyJson.persona.memory ? bodyJson.persona.memory : null;
      setPersonaMemorySummary(memorySummary || state.conversation.personaMemory);
    }

    const providerName = providerDisplayName(state.conversation.provider);
    const modelText = compactText(bodyJson.model, 120) || state.conversation.model || "conversation-model";
    setConnectionBadge("connected", `${providerName}: ${modelText}`);
    await speakAssistantTextWithTimeout(assistantText);
  } catch (error) {
    if (error && error.name === "AbortError") {
      assistantView.body.textContent = "[stopped]";
      setConnectionBadge("disconnected", "Stopped");
    } else {
      appendErrorMessage(compactText(error && error.message ? error.message : "Request failed", 300));
      setConnectionBadge("failed", "Request failed");
    }
  } finally {
    state.controller = null;
    setPending(false);
    updateChatEmptyState();
    if (fromVoice || state.voice.realtimeActive) resumeRealtimeAfterTurn();
  }
}

function flushVoiceUtterance() {
  clearSilenceTimer();
  if (!state.voice.realtimeActive || state.pending) return;
  const finalized = joinText(state.voice.baseText, state.voice.finalText);
  const interimOnly = !finalized && compactText(state.voice.interimText, 1200);
  if (interimOnly) {
    const interimAge = Math.max(0, Date.now() - (Number(state.voice.interimSinceMs) || 0));
    const holdMs = Math.max(1300, state.voice.silenceMs + 250);
    if (interimAge < holdMs) {
      scheduleSilenceFlush();
      return;
    }
  }
  const utterance = finalized || composeLiveTranscript();
  if (!utterance) return;
  resetVoiceBuffers();
  sendMessage(utterance, { fromVoice: true }).catch((error) => {
    appendErrorMessage(compactText(error && error.message ? error.message : "Voice send failed", 220));
  });
}

function resetConversation() {
  state.messages = [];
  if (el.chatLog) el.chatLog.innerHTML = "";
  cancelBrowserSpeechSynthesis();
  stopKokoroPlayback();
  clearSilenceTimer();
  resetVoiceBuffers();
  appendSystemMessage("Started a new conversation.");
  updateChatEmptyState();
}

function bindEvents() {
  if (el.composer) {
    el.composer.addEventListener("submit", (event) => {
      event.preventDefault();
      sendMessage().catch((error) => appendErrorMessage(compactText(error && error.message ? error.message : "Send failed", 220)));
    });
  }

  if (el.sendBtn) {
    el.sendBtn.addEventListener("click", (event) => {
      event.preventDefault();
      sendMessage().catch((error) => appendErrorMessage(compactText(error && error.message ? error.message : "Send failed", 220)));
    });
  }

  if (el.messageInput) {
    el.messageInput.addEventListener("keydown", (event) => {
      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        sendMessage().catch((error) => appendErrorMessage(compactText(error && error.message ? error.message : "Send failed", 220)));
      }
    });
  }

  if (el.stopBtn) {
    el.stopBtn.addEventListener("click", () => {
      if (state.controller) state.controller.abort();
      clearSilenceTimer();
      cancelBrowserSpeechSynthesis();
      stopKokoroPlayback();
      setSpeakingState(false);
    });
  }

  if (el.newSessionBtn) {
    el.newSessionBtn.addEventListener("click", resetConversation);
  }

  if (el.conversationModeSelect) {
    el.conversationModeSelect.addEventListener("change", () => {
      const nextMode = normalizeConversationMode(el.conversationModeSelect.value);
      if (nextMode === state.conversation.mode) {
        updateConversationModeUi();
        return;
      }
      state.conversation.mode = nextMode;
      storeConversationMode(nextMode);
      setPersonaMemorySummary(state.conversation.personaMemory);
      appendSystemMessage(
        nextMode === "persona_friend"
          ? "Switched to Friend Persona mode."
          : "Switched to Normal mode."
      );
      if (nextMode === "persona_friend") {
        syncPersonaMemoryFromServer({ silent: true }).catch(() => {});
      }
    });
  }

  if (el.personaResetBtn) {
    el.personaResetBtn.addEventListener("click", () => {
      resetPersonaMemory().catch((error) => {
        appendErrorMessage(compactText(error && error.message ? error.message : "Failed to reset friend memory", 260));
      });
    });
  }

  if (el.voiceInputBtn) {
    el.voiceInputBtn.addEventListener("click", () => {
      toggleRealtimeConversation();
    });
  }

  if (el.silenceMsSelect) {
    el.silenceMsSelect.addEventListener("change", () => {
      const parsed = Number(el.silenceMsSelect.value);
      if (!Number.isFinite(parsed) || parsed < 300) return;
      state.voice.silenceMs = Math.trunc(parsed);
      if (state.voice.realtimeActive) {
        setVoiceStatus(`Realtime on. Auto-send after ${state.voice.silenceMs / 1000}s silence.`, "ready");
      }
      scheduleSilenceFlush();
    });
  }

  if (el.recognitionLangSelect) {
    el.recognitionLangSelect.addEventListener("change", () => {
      const nextLang = normalizeRecognitionLang(el.recognitionLangSelect.value);
      state.voice.recognitionLang = nextLang;
      storeRecognitionLang(nextLang);
      if (state.voice.recognition) {
        state.voice.recognition.lang = nextLang;
      }
      if (state.voice.realtimeActive) {
        stopVoiceRecognition();
        window.setTimeout(() => {
          if (state.voice.realtimeActive && !state.pending && !state.voice.speaking) {
            startVoiceRecognition({ manual: true });
          }
        }, 180);
      }
      updateVoiceControls();
    });
  }

  if (el.ttsEnabled) {
    el.ttsEnabled.addEventListener("change", () => {
      state.voice.enabledTts = Boolean(el.ttsEnabled.checked);
      if (!state.voice.enabledTts) {
        cancelBrowserSpeechSynthesis();
        stopKokoroPlayback();
        setSpeakingState(false);
        if (!state.voice.realtimeActive) setVoiceStatus("Realtime is off.", "ready");
      }
      updateVoiceControls();
    });
  }

  if (el.ttsProviderSelect) {
    el.ttsProviderSelect.addEventListener("change", () => {
      const next = normalizeTtsProvider(el.ttsProviderSelect.value);
      state.voice.ttsProvider = next;
      storeTtsProvider(next);
      cancelBrowserSpeechSynthesis();
      stopKokoroPlayback();
      setSpeakingState(false);
      if (next === "browser") {
        renderVoiceOptions();
        state.voice.piperPrepareError = "";
      } else if (next === "piper") {
        ensurePiperPrepared({ announce: true }).catch(() => {});
      } else {
        state.voice.piperPrepareError = "";
      }
      updateVoiceControls();
    });
  }

  if (el.voiceSelect) {
    el.voiceSelect.addEventListener("change", () => {
      const next = compactText(el.voiceSelect.value, 240);
      state.voice.selectedVoiceUri = next;
      storeSelectedVoiceUri(next);
    });
  }

  if (el.piperModelInput) {
    el.piperModelInput.addEventListener("change", () => {
      const next = compactText(el.piperModelInput.value, 120);
      state.voice.piperModel = next || "en_US-lessac-high";
      el.piperModelInput.value = state.voice.piperModel;
      storePiperModel(state.voice.piperModel);
      state.voice.piperPrepared = false;
      state.voice.piperPrepareError = "";
      updateTtsEngineHint();
      ensurePiperPrepared({ announce: false, force: true }).catch(() => {});
    });
  }

  if (el.piperSpeakerInput) {
    el.piperSpeakerInput.addEventListener("change", () => {
      const next = compactText(el.piperSpeakerInput.value, 12);
      const speaker = parsePiperSpeaker(next);
      state.voice.piperSpeaker = speaker === null ? "" : String(speaker);
      el.piperSpeakerInput.value = state.voice.piperSpeaker;
      storePiperSpeaker(state.voice.piperSpeaker);
      state.voice.piperPrepared = false;
      state.voice.piperPrepareError = "";
      updateTtsEngineHint();
      ensurePiperPrepared({ announce: false, force: true }).catch(() => {});
    });
  }
}

async function boot() {
  state.conversation.mode = loadStoredConversationMode();
  state.conversation.personaUserId = loadOrCreatePersonaUserId();
  state.conversation.personaMemory = loadStoredPersonaMemorySummary();
  updateConversationModeUi();
  bindEvents();
  initVoice();
  updateChatEmptyState();
  appendSystemMessage("English realtime conversation app is ready.");
  await loadConversationRuntime();
  if (isPersonaMode()) {
    await syncPersonaMemoryFromServer({ silent: true });
  }
  window.setInterval(() => {
    if (!state.pending) {
      loadConversationRuntime().catch(() => {});
    }
  }, 15000);
}

boot().catch(() => {
  appendErrorMessage("Initialization failed. Reload the page.");
});
