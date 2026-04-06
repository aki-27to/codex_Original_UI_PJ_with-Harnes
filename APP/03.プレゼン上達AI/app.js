const state = {
  pending: false,
  evaluation: null,
  chatHistory: [],
  transcript: "",
  transcriptInterim: "",
  questionText: "",
  questionInterim: "",
  recognition: null,
  recognitionSupported: false,
  recognitionMode: "",
  recording: false,
  questionListening: false,
  questionSilenceTimer: null,
  recordingStartedAt: 0,
  recordedMs: 0,
  timerId: null,
  runtime: {
    aiReady: false,
    aiModel: "",
    kokoroReachable: false,
    kokoroError: "",
  },
  voice: {
    provider: "kokoro",
    enabled: true,
    audio: null,
    audioUrl: "",
    abortController: null,
    speaking: false,
    browserTtsSupported: typeof window !== "undefined" && "speechSynthesis" in window,
    kokoroVoice: "jf_alpha",
    kokoroLangCode: "j",
    kokoroSpeed: 1,
  },
};

const QUESTION_SILENCE_MS = 1300;

const el = {
  aiBadge: byId("aiBadge"),
  kokoroBadge: byId("kokoroBadge"),
  ttsEnabled: byId("ttsEnabled"),
  ttsProviderSelect: byId("ttsProviderSelect"),
  kokoroVoiceInput: byId("kokoroVoiceInput"),
  kokoroLangInput: byId("kokoroLangInput"),
  kokoroSpeedInput: byId("kokoroSpeedInput"),
  categorySelect: byId("categorySelect"),
  titleInput: byId("titleInput"),
  audienceInput: byId("audienceInput"),
  goalInput: byId("goalInput"),
  recordBtn: byId("recordBtn"),
  pauseBtn: byId("pauseBtn"),
  evaluateBtn: byId("evaluateBtn"),
  resetBtn: byId("resetBtn"),
  timerChip: byId("timerChip"),
  charsChip: byId("charsChip"),
  sentencesChip: byId("sentencesChip"),
  fillersChip: byId("fillersChip"),
  sessionStatus: byId("sessionStatus"),
  recognitionStatus: byId("recognitionStatus"),
  voiceHint: byId("voiceHint"),
  transcriptInput: byId("transcriptInput"),
  transcriptBadge: byId("transcriptBadge"),
  evaluationSection: byId("evaluationSection"),
  evaluationGrid: byId("evaluationGrid"),
  evaluationStatus: byId("evaluationStatus"),
  coachLog: byId("coachLog"),
  coachForm: byId("coachForm"),
  coachInput: byId("coachInput"),
  sendCoachBtn: byId("sendCoachBtn"),
  voiceQuestionBtn: byId("voiceQuestionBtn"),
  stopAudioBtn: byId("stopAudioBtn"),
  compatibilityNote: byId("compatibilityNote"),
  chatMessageTemplate: byId("chatMessageTemplate"),
};

function byId(id) {
  return document.getElementById(id);
}

function resolveAppBasePath() {
  const pathname = compactText(window.location && window.location.pathname ? window.location.pathname : "", 240);
  if (pathname === "/apps/presentation-coach" || pathname.startsWith("/apps/presentation-coach/")) {
    return "/apps/presentation-coach";
  }
  return "";
}

function buildAppApiPath(pathname) {
  const normalized = compactText(pathname, 240);
  if (!normalized) return "/api";
  const suffix = normalized.startsWith("/") ? normalized : `/${normalized}`;
  return `${resolveAppBasePath()}/api${suffix}`;
}

function compactText(value, maxLength = 4000) {
  const normalized = String(value || "")
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  if (!normalized) return "";
  return normalized.length > maxLength ? normalized.slice(0, maxLength) : normalized;
}

function compactSingleLine(value, maxLength = 240) {
  return compactText(String(value || "").replace(/\s+/g, " "), maxLength);
}

function normalizeTranscriptText(value, maxLength = 24000) {
  return compactText(value, maxLength);
}

function joinTranscriptText(...parts) {
  const filtered = parts.map((part) => compactText(part, 12000)).filter(Boolean);
  return filtered.join("\n");
}

function joinInlineText(...parts) {
  const filtered = parts.map((part) => compactSingleLine(part, 1200)).filter(Boolean);
  return filtered.join(" ");
}

function nowLabel() {
  return new Date().toLocaleTimeString("ja-JP", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function setBadge(element, status, text) {
  if (!element) return;
  element.className = `badge ${status}`;
  element.textContent = text;
}

function setPending(active) {
  state.pending = Boolean(active);
  if (el.evaluateBtn) el.evaluateBtn.disabled = state.pending;
  if (el.sendCoachBtn) el.sendCoachBtn.disabled = state.pending;
  if (el.recordBtn) el.recordBtn.disabled = state.pending && !state.recording;
  if (el.voiceQuestionBtn) el.voiceQuestionBtn.disabled = state.pending;
}

function appendChatMessage(role, label, text) {
  if (!el.coachLog || !el.chatMessageTemplate) return;
  const fragment = el.chatMessageTemplate.content.cloneNode(true);
  const article = fragment.querySelector(".chat-message");
  const meta = fragment.querySelector(".chat-meta");
  const body = fragment.querySelector(".chat-body");
  if (!article || !meta || !body) return;
  article.classList.add(role);
  meta.textContent = `${label} ${nowLabel()}`;
  body.textContent = text;
  el.coachLog.appendChild(fragment);
  el.coachLog.scrollTop = el.coachLog.scrollHeight;
}

function formatDuration(totalMs) {
  const totalSeconds = Math.max(0, Math.floor(totalMs / 1000));
  const minutes = String(Math.floor(totalSeconds / 60)).padStart(2, "0");
  const seconds = String(totalSeconds % 60).padStart(2, "0");
  return `${minutes}:${seconds}`;
}

function buildTranscriptMetrics(text, durationSec = 0) {
  const normalized = normalizeTranscriptText(text);
  const charCount = normalized.length;
  const sentenceCount = Math.max(0, (normalized.match(/[。！？!?]/g) || []).length);
  const fillerPatterns = [
    /えーと/g,
    /えっと/g,
    /あの/g,
    /そのー?/g,
    /なんか/g,
    /ま、/g,
    /\bum\b/gi,
    /\buh\b/gi,
  ];
  const fillerCount = fillerPatterns.reduce((sum, pattern) => sum + (normalized.match(pattern) || []).length, 0);
  const charsPerMinute = durationSec > 0 ? Math.round(charCount / (durationSec / 60)) : 0;
  return {
    charCount,
    sentenceCount,
    fillerCount,
    charsPerMinute,
  };
}

function updateTranscriptMetrics(metrics = null) {
  const durationSec = state.recording
    ? Math.floor((state.recordedMs + (Date.now() - state.recordingStartedAt)) / 1000)
    : Math.floor(state.recordedMs / 1000);
  const nextMetrics = metrics || buildTranscriptMetrics(joinTranscriptText(state.transcript, state.transcriptInterim), durationSec);
  if (el.charsChip) el.charsChip.textContent = `${nextMetrics.charCount} 文字`;
  if (el.sentencesChip) el.sentencesChip.textContent = `${nextMetrics.sentenceCount} 文`;
  if (el.fillersChip) el.fillersChip.textContent = `フィラー ${nextMetrics.fillerCount}`;
}

function updateTimerChip() {
  if (!el.timerChip) return;
  const elapsed = state.recording
    ? state.recordedMs + (Date.now() - state.recordingStartedAt)
    : state.recordedMs;
  el.timerChip.textContent = formatDuration(elapsed);
}

function startTimer() {
  stopTimer();
  updateTimerChip();
  state.timerId = window.setInterval(() => {
    updateTimerChip();
    updateTranscriptMetrics();
  }, 500);
}

function stopTimer() {
  if (state.timerId !== null) {
    clearInterval(state.timerId);
    state.timerId = null;
  }
}

function clearQuestionSilenceTimer() {
  if (state.questionSilenceTimer !== null) {
    clearTimeout(state.questionSilenceTimer);
    state.questionSilenceTimer = null;
  }
}

function setSessionStatus(text) {
  if (el.sessionStatus) el.sessionStatus.textContent = text;
}

function setRecognitionStatus(text) {
  if (el.recognitionStatus) el.recognitionStatus.textContent = text;
}

function renderTranscript() {
  if (!el.transcriptInput) return;
  el.transcriptInput.value = joinTranscriptText(state.transcript, state.transcriptInterim);
  updateTranscriptMetrics();
}

function renderQuestionInput() {
  if (!el.coachInput) return;
  el.coachInput.value = joinInlineText(state.questionText, state.questionInterim);
}

function setRecordingVisual(active) {
  document.body.classList.toggle("recording", Boolean(active));
  if (el.recordBtn) {
    el.recordBtn.classList.toggle("is-recording", Boolean(active));
    el.recordBtn.textContent = active ? "録音中" : "発表開始";
  }
  if (el.pauseBtn) {
    el.pauseBtn.disabled = !active;
  }
  if (el.transcriptBadge) {
    el.transcriptBadge.textContent = active ? "リアルタイム反映中" : "編集可能";
    el.transcriptBadge.className = `badge ${active ? "pending" : "neutral"}`;
  }
}

function stopSpeechPlayback() {
  if (state.voice.abortController) {
    try {
      state.voice.abortController.abort();
    } catch {
    }
    state.voice.abortController = null;
  }
  if (state.voice.audio) {
    try {
      state.voice.audio.pause();
    } catch {
    }
    state.voice.audio = null;
  }
  if (state.voice.audioUrl) {
    URL.revokeObjectURL(state.voice.audioUrl);
    state.voice.audioUrl = "";
  }
  if (window.speechSynthesis) {
    window.speechSynthesis.cancel();
  }
  state.voice.speaking = false;
}

function updateTtsProviderUi() {
  if (el.ttsProviderSelect) {
    el.ttsProviderSelect.value = state.voice.provider;
  }
}

function fallbackFromKokoroIfNeeded() {
  if (state.voice.provider !== "kokoro" || state.runtime.kokoroReachable) return;
  if (state.voice.browserTtsSupported) {
    state.voice.provider = "browser";
  } else {
    state.voice.provider = "off";
  }
  updateTtsProviderUi();
}

function updateCompatibilityNote() {
  if (!el.compatibilityNote) return;
  const parts = [];
  if (!state.recognitionSupported) {
    parts.push("このブラウザは音声入力に非対応です。");
  } else {
    parts.push("音声入力は利用できます。");
  }
  if (state.runtime.kokoroReachable) {
    parts.push("Kokoro は利用可能です。");
  } else if (state.voice.browserTtsSupported) {
    parts.push("Kokoro が不達でもブラウザ音声に自動切替します。");
  } else {
    parts.push("Kokoro が不達で、ブラウザ音声も使えません。");
  }
  el.compatibilityNote.textContent = parts.join(" ");
}

async function safeParseJson(response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

async function speakText(text) {
  const spoken = compactText(text, 1200);
  if (!spoken || !state.voice.enabled) return;
  stopSpeechPlayback();
  fallbackFromKokoroIfNeeded();

  if (state.voice.provider === "off") return;

  if (state.voice.provider === "browser") {
    if (!state.voice.browserTtsSupported || !window.speechSynthesis) {
      appendChatMessage("error", "Error", "ブラウザ音声が使えません。");
      return;
    }
    const utterance = new SpeechSynthesisUtterance(spoken);
    utterance.lang = "ja-JP";
    state.voice.speaking = true;
    utterance.onend = () => {
      state.voice.speaking = false;
    };
    utterance.onerror = () => {
      state.voice.speaking = false;
    };
    window.speechSynthesis.speak(utterance);
    return;
  }

  const abortController = new AbortController();
  state.voice.abortController = abortController;
  state.voice.speaking = true;

  try {
    const response = await fetch(buildAppApiPath("/voice/kokoro"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text: spoken,
        voice: compactSingleLine(state.voice.kokoroVoice, 80) || "jf_alpha",
        langCode: compactSingleLine(state.voice.kokoroLangCode, 8) || "j",
        speed: Number(state.voice.kokoroSpeed) || 1,
      }),
      signal: abortController.signal,
    });
    if (!response.ok) {
      const payload = await safeParseJson(response);
      throw new Error(
        compactSingleLine(
          payload && payload.error ? payload.error : `Kokoro request failed: HTTP ${response.status}`,
          240
        )
      );
    }
    const blob = await response.blob();
    const audioUrl = URL.createObjectURL(blob);
    state.voice.audioUrl = audioUrl;
    const audio = new Audio(audioUrl);
    state.voice.audio = audio;
    audio.onended = () => {
      state.voice.speaking = false;
      state.voice.audio = null;
      if (state.voice.audioUrl === audioUrl) {
        URL.revokeObjectURL(audioUrl);
        state.voice.audioUrl = "";
      }
    };
    audio.onerror = () => {
      state.voice.speaking = false;
      state.voice.audio = null;
    };
    await audio.play();
  } catch (error) {
    if (error && error.name !== "AbortError") {
      appendChatMessage("error", "Error", compactSingleLine(error.message || "音声再生に失敗しました。", 240));
    }
    state.voice.speaking = false;
  } finally {
    if (state.voice.abortController === abortController) {
      state.voice.abortController = null;
    }
  }
}

function pickRecognitionTranscript(result) {
  if (!result || typeof result.length !== "number") return "";
  let best = "";
  let bestScore = -Infinity;
  for (let index = 0; index < result.length; index += 1) {
    const candidate = result[index];
    if (!candidate || typeof candidate.transcript !== "string") continue;
    const text = compactSingleLine(candidate.transcript, 1000);
    if (!text) continue;
    const confidence = Number.isFinite(Number(candidate.confidence)) ? Number(candidate.confidence) : 0;
    const score = confidence * 100 + Math.min(60, text.length);
    if (score > bestScore) {
      bestScore = score;
      best = text;
    }
  }
  return best;
}

function startRecognition(mode) {
  if (!state.recognitionSupported || !state.recognition) {
    setRecognitionStatus("このブラウザでは音声認識が使えません。Chrome 系ブラウザで開いてください。");
    return;
  }
  if (state.pending) return;
  if (state.recognitionMode && state.recognitionMode !== mode) {
    stopRecognition();
  }
  state.recognitionMode = mode;
  try {
    state.recognition.start();
  } catch {
  }
}

function stopRecognition() {
  clearQuestionSilenceTimer();
  if (state.recognition) {
    try {
      state.recognition.stop();
    } catch {
    }
  }
}

function startPresentationRecording() {
  stopSpeechPlayback();
  state.questionListening = false;
  clearQuestionSilenceTimer();
  if (!state.recording) {
    state.recording = true;
    state.recordingStartedAt = Date.now();
    startTimer();
    setRecordingVisual(true);
    setSessionStatus("発表を録音中です。最後まで話してから一時停止または講評を受けてください。");
  }
  setRecognitionStatus("音声認識中です。話した内容は右側に追記されます。");
  startRecognition("presentation");
}

function pausePresentationRecording() {
  if (!state.recording) return;
  state.recordedMs += Math.max(0, Date.now() - state.recordingStartedAt);
  state.recordingStartedAt = 0;
  state.recording = false;
  state.transcriptInterim = "";
  stopTimer();
  updateTimerChip();
  renderTranscript();
  setRecordingVisual(false);
  setSessionStatus("録音を止めました。書き起こしを修正してから講評に送れます。");
  setRecognitionStatus("音声認識は停止中です。");
  stopRecognition();
}

function handleRecognitionResult(event) {
  let finalChunk = "";
  let interimChunk = "";
  for (let index = event.resultIndex; index < event.results.length; index += 1) {
    const result = event.results[index];
    const transcript = pickRecognitionTranscript(result);
    if (!transcript) continue;
    if (result.isFinal) {
      finalChunk = state.recognitionMode === "question"
        ? joinInlineText(finalChunk, transcript)
        : joinTranscriptText(finalChunk, transcript);
    } else {
      interimChunk = joinInlineText(interimChunk, transcript);
    }
  }

  if (state.recognitionMode === "presentation") {
    if (finalChunk) state.transcript = joinTranscriptText(state.transcript, finalChunk);
    state.transcriptInterim = interimChunk;
    renderTranscript();
    return;
  }

  if (state.recognitionMode === "question") {
    if (finalChunk) state.questionText = joinInlineText(state.questionText, finalChunk);
    state.questionInterim = interimChunk;
    renderQuestionInput();
    clearQuestionSilenceTimer();
    state.questionSilenceTimer = window.setTimeout(() => {
      finishVoiceQuestion();
    }, QUESTION_SILENCE_MS);
  }
}

function finishVoiceQuestion() {
  state.questionListening = false;
  clearQuestionSilenceTimer();
  stopRecognition();
  state.questionInterim = "";
  renderQuestionInput();
  const question = compactText(el.coachInput ? el.coachInput.value : "", 2000);
  if (!question) return;
  sendCoachQuestion(question);
}

function initRecognition() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    state.recognitionSupported = false;
    setRecognitionStatus("このブラウザは Web Speech API をサポートしていません。");
    if (el.recordBtn) el.recordBtn.disabled = true;
    if (el.pauseBtn) el.pauseBtn.disabled = true;
    if (el.voiceQuestionBtn) el.voiceQuestionBtn.disabled = true;
    updateCompatibilityNote();
    return;
  }

  const recognition = new SpeechRecognition();
  recognition.lang = "ja-JP";
  recognition.continuous = true;
  recognition.interimResults = true;
  recognition.maxAlternatives = 3;

  recognition.onstart = () => {
    if (state.recognitionMode === "presentation") {
      setRecognitionStatus("発表を書き起こしています。");
    } else if (state.recognitionMode === "question") {
      state.questionListening = true;
      setRecognitionStatus("追質問を聞き取っています。1.3 秒黙ると自動送信します。");
    }
  };

  recognition.onresult = handleRecognitionResult;

  recognition.onerror = (event) => {
    const code = compactSingleLine(event && event.error ? event.error : "unknown", 80);
    if (code === "aborted") return;
    if (code === "not-allowed" || code === "service-not-allowed") {
      if (state.recognitionMode === "question") {
        state.questionListening = false;
        state.questionInterim = "";
        clearQuestionSilenceTimer();
        renderQuestionInput();
      }
      setRecognitionStatus("マイク権限が拒否されました。");
      pausePresentationRecording();
      return;
    }
    if (code === "audio-capture") {
      if (state.recognitionMode === "question") {
        state.questionListening = false;
        state.questionInterim = "";
        clearQuestionSilenceTimer();
        renderQuestionInput();
      }
      setRecognitionStatus("マイクを取得できません。");
      pausePresentationRecording();
      return;
    }
    if (code === "no-speech") {
      setRecognitionStatus("音声を待っています。");
      return;
    }
    setRecognitionStatus(`音声認識エラー: ${code}`);
  };

  recognition.onend = () => {
    if (state.recognitionMode === "presentation" && state.recording && !state.pending) {
      window.setTimeout(() => startRecognition("presentation"), 220);
      return;
    }
    if (state.recognitionMode === "question" && state.questionListening && !state.pending) {
      window.setTimeout(() => startRecognition("question"), 220);
      return;
    }
    state.recognitionMode = "";
  };

  state.recognition = recognition;
  state.recognitionSupported = true;
  setRecognitionStatus("マイク待機中です。");
  updateCompatibilityNote();
}

async function loadRuntime() {
  try {
    const response = await fetch(buildAppApiPath("/runtime"), { cache: "no-store" });
    const payload = await response.json();
    state.runtime.aiReady = Boolean(payload && payload.ai && payload.ai.ready);
    state.runtime.aiModel = compactSingleLine(payload && payload.ai ? payload.ai.model : "", 120);
    state.runtime.kokoroReachable = Boolean(payload && payload.kokoro && payload.kokoro.reachable);
    state.runtime.kokoroError = compactSingleLine(payload && payload.kokoro ? payload.kokoro.error : "", 180);

    setBadge(
      el.aiBadge,
      state.runtime.aiReady ? "connected" : "failed",
      state.runtime.aiReady
        ? `AI: ${state.runtime.aiModel || "ready"}`
        : "AI 実行環境に接続できません"
    );

    setBadge(
      el.kokoroBadge,
      state.runtime.kokoroReachable ? "connected" : "failed",
      state.runtime.kokoroReachable
        ? `Kokoro: ${compactSingleLine(payload.kokoro.voice, 80)} / ${compactSingleLine(payload.kokoro.langCode, 8)}`
        : "Kokoro 未起動"
    );

    if (el.voiceHint) {
      el.voiceHint.textContent = state.runtime.kokoroReachable
        ? "Kokoro 経由の日本語読み上げを使えます。"
        : `Kokoro が見つかりません。${state.runtime.kokoroError || "必要なら後から起動してください。"} ブラウザ音声にも切り替えられます。`;
    }
    fallbackFromKokoroIfNeeded();
    updateCompatibilityNote();
  } catch {
    setBadge(el.aiBadge, "failed", "AI 状態を取得できません");
    setBadge(el.kokoroBadge, "failed", "Kokoro 状態を取得できません");
    updateCompatibilityNote();
  }
}

function collectScenario() {
  return {
    category: compactSingleLine(el.categorySelect && el.categorySelect.value ? el.categorySelect.value : "", 80),
    title: compactSingleLine(el.titleInput && el.titleInput.value ? el.titleInput.value : "", 160),
    audience: compactSingleLine(el.audienceInput && el.audienceInput.value ? el.audienceInput.value : "", 160),
    goal: compactText(el.goalInput && el.goalInput.value ? el.goalInput.value : "", 800),
  };
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function buildInsightCard(title, items, options = {}) {
  const card = document.createElement("article");
  card.className = `insight-card${options.wide ? " wide" : ""}`;
  card.innerHTML = `<h3>${escapeHtml(title)}</h3>`;
  const list = document.createElement("ul");
  list.className = options.listClass || "card-list";
  (Array.isArray(items) ? items : []).forEach((item) => {
    const li = document.createElement("li");
    li.innerHTML = options.itemRenderer ? options.itemRenderer(item) : `<p>${escapeHtml(String(item || ""))}</p>`;
    list.appendChild(li);
  });
  card.appendChild(list);
  return card;
}

function renderResearchCards(evaluation) {
  if (!evaluation || !el.evaluationGrid) return;

  if (evaluation.workResearch) {
    const workResearchCard = document.createElement("article");
    workResearchCard.className = "insight-card full";
    const anchors = Array.isArray(evaluation.workResearch.factualAnchors)
      ? evaluation.workResearch.factualAnchors
          .map((item) => `<li>${escapeHtml(item)}</li>`)
          .join("")
      : "";
    workResearchCard.innerHTML = `
      <h3>作品理解の確認</h3>
      <p><strong>調査の根拠</strong> ${escapeHtml(evaluation.workResearch.researchBasis || "")}</p>
      <p><strong>題材の核</strong> ${escapeHtml(evaluation.workResearch.canonicalSummary || "")}</p>
      <p><strong>発表とのズレ</strong> ${escapeHtml(evaluation.workResearch.presentationGap || "")}</p>
      ${anchors ? `<ul class="card-list compact">${anchors}</ul>` : ""}
    `;
    el.evaluationGrid.appendChild(workResearchCard);
  }

  if (evaluation.presenterAnalysis) {
    const presenterCard = document.createElement("article");
    presenterCard.className = "insight-card full";
    presenterCard.innerHTML = `
      <h3>あなたが崩れる本質</h3>
      <p><strong>根本原因</strong> ${escapeHtml(evaluation.presenterAnalysis.rootCause || "")}</p>
      <p><strong>根拠</strong> ${escapeHtml(evaluation.presenterAnalysis.evidence || "")}</p>
      <p><strong>一番効く矯正点</strong> ${escapeHtml(evaluation.presenterAnalysis.improvementLeverage || "")}</p>
    `;
    el.evaluationGrid.appendChild(presenterCard);
  }
}

function renderEvaluation(evaluation, metrics) {
  if (!evaluation || !el.evaluationGrid || !el.evaluationSection) return;
  el.evaluationSection.classList.remove("is-empty");
  el.evaluationGrid.innerHTML = "";

  const scoreCard = document.createElement("article");
  scoreCard.className = "score-card";
  const score = Number.isFinite(Number(evaluation.overallScore)) ? Math.max(0, Math.min(100, Number(evaluation.overallScore))) : 0;
  const angle = Math.round((score / 100) * 360);
  scoreCard.innerHTML = `
    <h3>総合評価</h3>
    <div class="score-ring" style="background: conic-gradient(var(--accent) ${angle}deg, rgba(22, 33, 50, 0.12) ${angle}deg);">
      <div class="score-value">
        <strong>${score}</strong>
        <span>score</span>
      </div>
    </div>
    <p class="score-verdict">${escapeHtml(evaluation.readinessLabel)}</p>
    <p class="score-verdict">${escapeHtml(evaluation.summary)}</p>
  `;
  el.evaluationGrid.appendChild(scoreCard);
  renderResearchCards(evaluation);

  el.evaluationGrid.appendChild(buildInsightCard("光っていた点", evaluation.strengths || [], {
    listClass: "card-list",
    itemRenderer: (item) => `
      <strong>${escapeHtml(item.title)}</strong>
      <p>${escapeHtml(item.detail)}</p>
      <p>${escapeHtml(item.evidence)}</p>
    `,
  }));

  el.evaluationGrid.appendChild(buildInsightCard("弱点の本質", evaluation.blindSpots || [], {
    listClass: "card-list",
    itemRenderer: (item) => `
      <strong>${escapeHtml(item.title)}</strong>
      <p>${escapeHtml(item.detail)}</p>
      <p>${escapeHtml(item.whyItHurts)}</p>
      <p>${escapeHtml(item.fix)}</p>
    `,
  }));

  el.evaluationGrid.appendChild(buildInsightCard("改善ロードマップ", evaluation.actionPlan || [], {
    listClass: "card-list",
    wide: true,
    itemRenderer: (item) => `
      <strong>${escapeHtml(item.step)}</strong>
      <p>${escapeHtml(item.purpose)}</p>
      <p>${escapeHtml(item.drill)}</p>
    `,
  }));

  const openingCard = document.createElement("article");
  openingCard.className = "opening-card";
  openingCard.innerHTML = `
    <h3>冒頭の言い換え例</h3>
    <p>${escapeHtml(evaluation.improvedOpening)}</p>
  `;
  el.evaluationGrid.appendChild(openingCard);

  const promptsCard = document.createElement("article");
  promptsCard.className = "insight-card full";
  promptsCard.innerHTML = `<h3>次に聞くと効果的な質問</h3>`;
  const promptRow = document.createElement("div");
  promptRow.className = "coach-prompts";
  (Array.isArray(evaluation.coachQuestions) ? evaluation.coachQuestions : []).forEach((promptText) => {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = promptText;
    button.addEventListener("click", () => {
      if (el.coachInput) el.coachInput.value = promptText;
      state.questionText = compactSingleLine(promptText, 400);
      state.questionInterim = "";
      sendCoachQuestion(promptText);
    });
    promptRow.appendChild(button);
  });
  promptsCard.appendChild(promptRow);
  el.evaluationGrid.appendChild(promptsCard);

  if (metrics) {
    updateTranscriptMetrics(metrics);
  }
}

async function evaluatePresentation() {
  if (state.questionListening) {
    state.questionListening = false;
    clearQuestionSilenceTimer();
    stopRecognition();
    state.questionInterim = "";
    renderQuestionInput();
  }
  pausePresentationRecording();
  const transcript = normalizeTranscriptText(el.transcriptInput ? el.transcriptInput.value : "", 24000);
  if (!transcript || transcript.length < 40) {
    appendChatMessage("error", "Error", "講評するには、もう少し長い発表の書き起こしが必要です。");
    return;
  }

  state.transcript = transcript;
  state.transcriptInterim = "";
  renderTranscript();
  stopSpeechPlayback();
  setPending(true);
  setSessionStatus("AI が発表を分析しています。");
  setBadge(el.evaluationStatus, "pending", "分析中");

  try {
    const response = await fetch(buildAppApiPath("/presentation/evaluate"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...collectScenario(),
        transcript,
        durationSec: Math.floor(state.recordedMs / 1000),
      }),
    });
    const payload = await response.json();
    if (!response.ok || !payload || payload.ok !== true) {
      throw new Error(payload && payload.error ? payload.error : `HTTP ${response.status}`);
    }

    state.evaluation = payload.evaluation;
    renderEvaluation(payload.evaluation, payload.metrics || null);
    appendChatMessage("assistant", "プレゼン上達AI", payload.evaluation.summary);
    setBadge(el.evaluationStatus, "connected", "講評を更新しました");
    setSessionStatus("講評を作成しました。下の追質問で深掘りできます。");
    await speakText(payload.evaluation.spokenFeedback);
  } catch (error) {
    appendChatMessage("error", "Error", compactSingleLine(error.message || "講評に失敗しました。", 260));
    setBadge(el.evaluationStatus, "failed", "講評に失敗");
    setSessionStatus("講評に失敗しました。時間をおいて再試行してください。");
  } finally {
    setPending(false);
  }
}

async function sendCoachQuestion(questionInput = "") {
  if (state.questionListening) {
    state.questionListening = false;
    clearQuestionSilenceTimer();
    stopRecognition();
    state.questionInterim = "";
    renderQuestionInput();
  }
  if (!state.evaluation) {
    appendChatMessage("system", "System", "まずは発表を評価してから追質問してください。");
    return;
  }
  const question = compactText(questionInput || (el.coachInput ? el.coachInput.value : ""), 2000);
  if (!question) return;
  stopSpeechPlayback();
  setPending(true);
  appendChatMessage("user", "You", question);
  state.chatHistory.push({ role: "user", text: question });
  if (el.coachInput) el.coachInput.value = "";
  state.questionText = "";
  state.questionInterim = "";

  try {
    const response = await fetch(buildAppApiPath("/presentation/chat"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...collectScenario(),
        transcript: state.transcript,
        evaluation: state.evaluation,
        question,
        history: state.chatHistory.slice(-8),
      }),
    });
    const payload = await response.json();
    if (!response.ok || !payload || payload.ok !== true) {
      throw new Error(payload && payload.error ? payload.error : `HTTP ${response.status}`);
    }
    appendChatMessage("assistant", "プレゼン上達AI", payload.reply.reply);
    state.chatHistory.push({ role: "assistant", text: payload.reply.reply });
    await speakText(payload.reply.spokenReply || payload.reply.reply);
  } catch (error) {
    appendChatMessage("error", "Error", compactSingleLine(error.message || "追質問に失敗しました。", 260));
  } finally {
    setPending(false);
  }
}

function resetSession() {
  stopRecognition();
  stopSpeechPlayback();
  clearQuestionSilenceTimer();
  pausePresentationRecording();
  state.evaluation = null;
  state.chatHistory = [];
  state.transcript = "";
  state.transcriptInterim = "";
  state.questionText = "";
  state.questionInterim = "";
  state.questionListening = false;
  state.recognitionMode = "";
  state.recordedMs = 0;
  state.recordingStartedAt = 0;
  if (el.transcriptInput) el.transcriptInput.value = "";
  if (el.coachInput) el.coachInput.value = "";
  if (el.evaluationGrid) {
    el.evaluationGrid.innerHTML = `
      <article class="empty-card">
        <h3>ここに講評が表示されます</h3>
        <p>発表を録音して「講評を受ける」を押すと、良かった点、弱点の本質、改善ステップ、言い換え例が並びます。</p>
      </article>
    `;
  }
  if (el.evaluationSection) el.evaluationSection.classList.add("is-empty");
  if (el.coachLog) el.coachLog.innerHTML = "";
  setBadge(el.evaluationStatus, "neutral", "まだ未評価");
  setRecordingVisual(false);
  updateTimerChip();
  updateTranscriptMetrics();
  appendChatMessage("system", "System", "題材をセットして発表を録音してください。講評後はここで深掘りできます。");
  setSessionStatus("準備完了。録音を始めると文字起こしが増えていきます。");
  setRecognitionStatus("マイク待機中です。");
}

function bindEvents() {
  if (el.recordBtn) {
    el.recordBtn.addEventListener("click", () => {
      if (state.recording) {
        pausePresentationRecording();
      } else {
        startPresentationRecording();
      }
    });
  }

  if (el.pauseBtn) {
    el.pauseBtn.addEventListener("click", () => {
      pausePresentationRecording();
    });
  }

  if (el.evaluateBtn) {
    el.evaluateBtn.addEventListener("click", () => {
      evaluatePresentation();
    });
  }

  if (el.resetBtn) {
    el.resetBtn.addEventListener("click", () => {
      resetSession();
    });
  }

  if (el.transcriptInput) {
    el.transcriptInput.addEventListener("input", () => {
      if (state.recording) return;
      state.transcript = normalizeTranscriptText(el.transcriptInput.value, 24000);
      updateTranscriptMetrics();
    });
  }

  if (el.coachForm) {
    el.coachForm.addEventListener("submit", (event) => {
      event.preventDefault();
      sendCoachQuestion();
    });
  }

  if (el.voiceQuestionBtn) {
    el.voiceQuestionBtn.addEventListener("click", () => {
      stopSpeechPlayback();
      if (state.recording) {
        pausePresentationRecording();
      }
      state.questionText = compactText(el.coachInput ? el.coachInput.value : "", 2000);
      state.questionInterim = "";
      renderQuestionInput();
      state.questionListening = true;
      setRecognitionStatus("追質問を聞き取ります。");
      startRecognition("question");
    });
  }

  if (el.stopAudioBtn) {
    el.stopAudioBtn.addEventListener("click", () => {
      stopSpeechPlayback();
    });
  }

  if (el.ttsEnabled) {
    el.ttsEnabled.addEventListener("change", () => {
      state.voice.enabled = Boolean(el.ttsEnabled.checked);
    });
  }

  if (el.ttsProviderSelect) {
    el.ttsProviderSelect.addEventListener("change", () => {
      state.voice.provider = compactSingleLine(el.ttsProviderSelect.value, 20) || "kokoro";
    });
  }

  if (el.kokoroVoiceInput) {
    el.kokoroVoiceInput.addEventListener("change", () => {
      state.voice.kokoroVoice = compactSingleLine(el.kokoroVoiceInput.value, 80) || "jf_alpha";
    });
  }

  if (el.kokoroLangInput) {
    el.kokoroLangInput.addEventListener("change", () => {
      state.voice.kokoroLangCode = compactSingleLine(el.kokoroLangInput.value, 8) || "j";
    });
  }

  if (el.kokoroSpeedInput) {
    el.kokoroSpeedInput.addEventListener("change", () => {
      const parsed = Number(el.kokoroSpeedInput.value);
      state.voice.kokoroSpeed = Number.isFinite(parsed) ? Math.max(0.5, Math.min(2, parsed)) : 1;
      el.kokoroSpeedInput.value = String(state.voice.kokoroSpeed.toFixed(1));
    });
  }
}

async function boot() {
  initRecognition();
  bindEvents();
  resetSession();
  await loadRuntime();
  updateCompatibilityNote();
}

boot();
