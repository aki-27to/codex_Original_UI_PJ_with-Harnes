const TURN_PHASES = [
  { id: "opening-a", speaker: "a", label: "A / 開幕主張", stage: "opening" },
  { id: "opening-b", speaker: "b", label: "B / 開幕主張", stage: "opening" },
  { id: "rebuttal-a", speaker: "a", label: "A / 反論", stage: "rebuttal" },
  { id: "rebuttal-b", speaker: "b", label: "B / 反論", stage: "rebuttal" },
  { id: "closing-a", speaker: "a", label: "A / 締め", stage: "closing" },
  { id: "closing-b", speaker: "b", label: "B / 締め", stage: "closing" },
];

const EXEC_STREAM_CONTENT_TYPE = "application/x-ndjson";
const EXEC_TIMEOUT_MS = 180000;

const UI_TEXT = {
  defaultHeadline: "まだ議題はセットされていません",
  defaultDeck:
    "上の入力欄で論点を決めると、ここに現在のテーマと対戦の焦点が表示されます。開幕前でも、何が始まる画面なのかを一目で理解できる密度を保ちます。",
  emptyKicker: "No transcript yet",
  emptyTitle: "議題を入れた瞬間、この中央盤面が試合ログに切り替わります。",
  emptyBody:
    "入力前でも完成済みのダッシュボードには見せません。対戦が始まる気配、役割差、進行順、ログの受け皿まで最初から画面に埋め込みます。",
  initialEvent: "待機中。上の入力欄に論題を入れると、ここへ進行ログが積み上がります。",
  missingTopic: "議題が空です。最初に論題をひとつ入力してください。",
};

const state = {
  topic: "",
  pending: false,
  controller: null,
  currentPhaseIndex: -1,
  messages: [],
  runtime: {
    controlToken: "",
    controlTokenHeader: "x-codex-control-token",
  },
};

const el = {
  runtimeStatus: document.getElementById("runtimeStatus"),
  topicHeadline: document.getElementById("topicHeadline"),
  topicDeck: document.getElementById("topicDeck"),
  phaseList: document.getElementById("phaseList"),
  eventLog: document.getElementById("eventLog"),
  chatLog: document.getElementById("chatLog"),
  messageTemplate: document.getElementById("messageTemplate"),
  turnCounter: document.getElementById("turnCounter"),
  debateState: document.getElementById("debateState"),
  composer: document.getElementById("composer"),
  topicInput: document.getElementById("topicInput"),
  restartBtn: document.getElementById("restartBtn"),
  stopBtn: document.getElementById("stopBtn"),
  submitBtn: document.getElementById("submitBtn"),
};

function compactText(value, max = 24000) {
  if (typeof value !== "string") return "";
  const normalized = value.replace(/\r\n/g, "\n").replace(/[ \t]+\n/g, "\n").trim();
  return normalized ? normalized.slice(0, max) : "";
}

function sentenceChunks(text) {
  return compactText(text, 3200)
    .replace(/\s+/g, " ")
    .match(/[^。！？!?]+[。！？!?]?/g) || [];
}

function clipDebateTurnText(text) {
  const sentences = sentenceChunks(text)
    .map((item) => compactText(item, 160))
    .filter(Boolean)
    .slice(0, 3);
  if (!sentences.length) return compactText(text, 320);
  return sentences.join("\n\n");
}

function shouldClipDebateTurn(text) {
  const normalized = compactText(text, 3200);
  return normalized.length >= 220 && sentenceChunks(normalized).length >= 3;
}

function resolveAppBasePath() {
  const pathname = compactText(window.location && window.location.pathname ? window.location.pathname : "", 240);
  if (pathname === "/apps/ai-debate-chat" || pathname.startsWith("/apps/ai-debate-chat/")) {
    return "/apps/ai-debate-chat";
  }
  return "";
}

function buildAppApiPath(pathname) {
  const normalized = compactText(pathname, 240);
  const suffix = normalized.startsWith("/") ? normalized : `/${normalized}`;
  return `${resolveAppBasePath()}/api${suffix}`;
}

function nowTimeLabel() {
  return new Date().toLocaleTimeString("ja-JP", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

function setRuntimeStatus(text) {
  if (el.runtimeStatus) el.runtimeStatus.textContent = text;
}

function setDebateState(text) {
  if (el.debateState) el.debateState.textContent = text;
}

function buildExecHeaders() {
  const token = compactText(state.runtime.controlToken, 240);
  if (!token) {
    throw new Error("control API token unavailable");
  }
  const headerName = compactText(state.runtime.controlTokenHeader, 120) || "x-codex-control-token";
  return {
    "Content-Type": "application/json; charset=utf-8",
    [headerName]: token,
  };
}

function setPending(pending) {
  state.pending = Boolean(pending);
  if (el.submitBtn) el.submitBtn.disabled = state.pending;
  if (el.stopBtn) el.stopBtn.disabled = !state.pending;
  if (el.topicInput) el.topicInput.disabled = state.pending;
}

function setTurnCounter(value) {
  if (el.turnCounter) {
    el.turnCounter.textContent = `${value} / ${TURN_PHASES.length}`;
  }
}

function renderEmptyState() {
  if (!el.chatLog) return;
  el.chatLog.innerHTML = `
    <article class="log-empty">
      <p class="section-kicker">${UI_TEXT.emptyKicker}</p>
      <h3>${UI_TEXT.emptyTitle}</h3>
      <p>${UI_TEXT.emptyBody}</p>
    </article>
  `;
}

function renderInitialEventLog() {
  if (!el.eventLog) return;
  el.eventLog.innerHTML = `<p class="event-item">${UI_TEXT.initialEvent}</p>`;
}

function clearEmptyState() {
  const empty = el.chatLog ? el.chatLog.querySelector(".log-empty") : null;
  if (empty) empty.remove();
}

function setTopicUi(topic) {
  const normalized = compactText(topic, 400);
  if (el.topicHeadline) {
    el.topicHeadline.textContent = normalized || UI_TEXT.defaultHeadline;
  }
  if (el.topicDeck) {
    el.topicDeck.textContent = normalized
      ? "この論題を起点に、A は導入価値と速度を、B は運用コストと失敗条件を押し返します。反論込みの 6 ターンで、読み味より判断材料を優先してぶつけ合います。"
      : UI_TEXT.defaultDeck;
  }
}

function resetPhaseList() {
  if (!el.phaseList) return;
  Array.from(el.phaseList.querySelectorAll("li")).forEach((item) => {
    item.classList.remove("is-active", "is-complete");
  });
}

function markPhase(phaseId, status) {
  if (!el.phaseList) return;
  const item = el.phaseList.querySelector(`[data-phase="${phaseId}"]`);
  if (!item) return;
  if (status === "active") {
    item.classList.add("is-active");
    item.classList.remove("is-complete");
  } else if (status === "complete") {
    item.classList.remove("is-active");
    item.classList.add("is-complete");
  }
}

function appendEvent(text) {
  if (!el.eventLog) return;
  const entry = document.createElement("p");
  entry.className = "event-item";
  entry.textContent = compactText(text, 400);
  el.eventLog.prepend(entry);
  while (el.eventLog.childElementCount > 8) {
    el.eventLog.removeChild(el.eventLog.lastElementChild);
  }
}

function createMessageView(role, name, phaseLabel) {
  if (!el.messageTemplate || !el.chatLog) return null;
  clearEmptyState();
  const fragment = el.messageTemplate.content.cloneNode(true);
  const root = fragment.querySelector(".message");
  const roleEl = fragment.querySelector(".message-role");
  const phaseEl = fragment.querySelector(".message-phase");
  const nameEl = fragment.querySelector(".message-name");
  const timeEl = fragment.querySelector(".message-time");
  const bodyEl = fragment.querySelector(".message-body");
  if (!root || !roleEl || !phaseEl || !nameEl || !timeEl || !bodyEl) return null;

  root.classList.add(`message-${role}`);
  roleEl.textContent = role === "a" ? "A" : role === "b" ? "B" : "SYS";
  phaseEl.textContent = phaseLabel;
  nameEl.textContent = name;
  timeEl.textContent = nowTimeLabel();
  bodyEl.textContent = "";
  el.chatLog.appendChild(fragment);
  el.chatLog.scrollTop = el.chatLog.scrollHeight;
  const appended = el.chatLog.lastElementChild;
  return appended ? appended.querySelector(".message-body") : null;
}

function addSystemMessage(text, phaseLabel = "system") {
  const bodyEl = createMessageView("system", "System", phaseLabel);
  if (bodyEl) bodyEl.textContent = compactText(text, 4000);
}

function pushTranscriptMessage({ speaker, name, phaseLabel, text }) {
  const bodyEl = createMessageView(speaker, name, phaseLabel);
  if (!bodyEl) return null;
  bodyEl.textContent = text;
  return bodyEl;
}

function collectTranscriptForPrompt() {
  return state.messages.map((entry) => `${entry.name}: ${entry.text}`).join("\n\n").slice(-7000);
}

function speakerProfile(speaker) {
  if (speaker === "a") {
    return {
      name: "A / 構想派",
      stance:
        "あなたは構想派です。導入価値、処理速度、設計の伸びしろ、先行優位を根拠にして前へ進める立場で話してください。",
    };
  }

  return {
    name: "B / 懐疑派",
    stance:
      "あなたは懐疑派です。運用コスト、失敗条件、現場での摩擦、監査や責任分界の観点から慎重さを求める立場で話してください。",
  };
}

function buildPrompt({ topic, speaker, phase, opponentText }) {
  const profile = speakerProfile(speaker);
  const transcript = collectTranscriptForPrompt();
  const phaseInstruction =
    phase === "opening"
      ? "最初の立場表明です。結論を先に言い、押さえる論点を2つ以内に絞ってください。"
      : phase === "rebuttal"
        ? "相手の直前発言の弱点を具体的に突き、反証か代案を一つ返してください。"
        : "締めの発言です。採るべき判断を最初に言い切り、最後に決定打を一つ残してください。";

  const blocks = [
    "あなたは討論アプリの話者です。ユーザーの論題について、相手の主張を受けた会話として返答してください。",
    `論題: ${topic}`,
    profile.stance,
    phaseInstruction,
  ];

  if (compactText(opponentText, 2400)) {
    blocks.push(`相手の直前発言:\n${compactText(opponentText, 2400)}`);
  }

  if (transcript) {
    blocks.push(`ここまでのログ:\n${transcript}`);
  }

  blocks.push(
    [
      "出力ルール:",
      "- 日本語だけで書く",
      "- 箇条書きやMarkdownは使わない",
      "- 2段落以内で返す",
      "- 抽象論よりも実務、体験、コスト、導入条件を優先する",
      "- 相手の主張に触れずに独り言を言わない",
      "- メタ発言、役割説明、AI だという自己言及は禁止",
      "- 全体で 110 から 190 文字程度に収める",
    ].join("\n")
  );

  return blocks.join("\n\n");
}

function isExecStreamResponse(response) {
  if (!response) return false;
  const contentType = String(response.headers.get("content-type") || "").toLowerCase();
  return response.ok && contentType.includes(EXEC_STREAM_CONTENT_TYPE);
}

async function streamExecPrompt({ prompt, signal, onDelta }) {
  const payload = {
    prompt,
    agentName: "default",
    sandboxMode: "workspace-write",
    approvalPolicy: "never",
    cwd: "C:\\Users\\akima\\dev\\codex_Original_UI_PJ_with-Harnes\\APP\\03.ai-debate-chat",
    forceNewSession: true,
    requestUserInputPolicy: "blocked",
    disableSlashRouter: true,
    webSearch: false,
    modelReasoningEffort: "low",
    executionProfile: "conversation-app-server",
    executionIntent: "ai-debate-chat",
    executionSource: "app_ai_debate_chat",
  };

  const timeoutController = new AbortController();
  const requestController = new AbortController();
  const combinedController = new AbortController();
  const timeoutId = window.setTimeout(() => {
    timeoutController.abort(new DOMException("Exec request timed out", "TimeoutError"));
  }, EXEC_TIMEOUT_MS);

  let truncated = false;
  let finalText = "";

  const forwardAbort = (event) => {
    combinedController.abort(event && event.target && event.target.reason ? event.target.reason : undefined);
  };

  if (signal) {
    if (signal.aborted) combinedController.abort(signal.reason);
    else signal.addEventListener("abort", forwardAbort, { once: true });
  }
  timeoutController.signal.addEventListener("abort", forwardAbort, { once: true });
  requestController.signal.addEventListener("abort", forwardAbort, { once: true });

  try {
    const response = await fetch(buildAppApiPath("/exec"), {
      method: "POST",
      headers: buildExecHeaders(),
      body: JSON.stringify(payload),
      signal: combinedController.signal,
    });

    if (!isExecStreamResponse(response)) {
      const bodyText = await response.text();
      throw new Error(`HTTP ${response.status} ${bodyText}`.trim());
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let terminalStatus = "completed";
    let terminalError = "";

    const handleEvent = (event) => {
      if (!event || typeof event.type !== "string") return;
      if (event.type === "delta" && typeof event.text === "string") {
        finalText += event.text;
        if (shouldClipDebateTurn(finalText)) {
          finalText = clipDebateTurnText(finalText);
          truncated = true;
          requestController.abort(new DOMException("Turn clipped after sufficient text", "AbortError"));
        }
        if (typeof onDelta === "function") onDelta(finalText);
      } else if (event.type === "final" && typeof event.text === "string") {
        finalText = clipDebateTurnText(event.text);
        if (typeof onDelta === "function") onDelta(finalText);
      } else if (event.type === "status") {
        terminalStatus = String(event.status || terminalStatus);
      } else if (event.type === "error") {
        terminalStatus = "failed";
        terminalError = compactText(event.text || "runtime error", 400);
      }
    };

    const flush = (chunk, force = false) => {
      if (chunk) buffer += chunk;
      while (true) {
        const lineBreak = buffer.indexOf("\n");
        if (lineBreak < 0) break;
        const line = buffer.slice(0, lineBreak).trim();
        buffer = buffer.slice(lineBreak + 1);
        if (!line) continue;
        try {
          handleEvent(JSON.parse(line));
        } catch {
        }
      }
      if (force && buffer.trim()) {
        try {
          handleEvent(JSON.parse(buffer.trim()));
        } catch {
        }
        buffer = "";
      }
    };

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      flush(decoder.decode(value, { stream: true }));
      if (truncated) break;
    }
    flush(decoder.decode(), true);

    const normalized = clipDebateTurnText(finalText);
    if (!truncated && terminalStatus !== "completed") {
      throw new Error(terminalError || `status=${terminalStatus}`);
    }
    if (!normalized) {
      throw new Error("empty response");
    }
    return normalized;
  } catch (error) {
    if (truncated) {
      const normalized = clipDebateTurnText(finalText);
      if (normalized) return normalized;
    }
    throw error;
  } finally {
    window.clearTimeout(timeoutId);
    if (signal) signal.removeEventListener("abort", forwardAbort);
    timeoutController.signal.removeEventListener("abort", forwardAbort);
    requestController.signal.removeEventListener("abort", forwardAbort);
  }
}

function isAbortLikeError(error) {
  const message = compactText(error && error.message ? error.message : "", 240);
  return error && (error.name === "AbortError" || message.includes("aborted"));
}

async function runPhase(phase, index) {
  state.currentPhaseIndex = index;
  markPhase(phase.id, "active");
  setTurnCounter(index + 1);
  setDebateState(phase.label);
  appendEvent(`${phase.label} を送信しました。`);

  const opponent = [...state.messages].reverse().find((entry) => entry.speaker !== phase.speaker);
  const profile = speakerProfile(phase.speaker);
  const messageBody = pushTranscriptMessage({
    speaker: phase.speaker,
    name: profile.name,
    phaseLabel: phase.label,
    text: "",
  });
  if (!messageBody || !messageBody.parentElement || !messageBody.parentElement.parentElement) {
    throw new Error("message view missing");
  }

  const messageRoot = messageBody.parentElement.parentElement;
  messageRoot.classList.add("message-streaming");

  const text = await streamExecPrompt({
    prompt: buildPrompt({
      topic: state.topic,
      speaker: phase.speaker,
      phase: phase.stage,
      opponentText: opponent ? opponent.text : "",
    }),
    signal: state.controller ? state.controller.signal : null,
    onDelta: (deltaText) => {
      messageBody.textContent = deltaText;
      if (el.chatLog) el.chatLog.scrollTop = el.chatLog.scrollHeight;
    },
  });

  messageRoot.classList.remove("message-streaming");
  messageBody.textContent = text;
  state.messages.push({
    speaker: phase.speaker,
    name: profile.name,
    phase: phase.label,
    text,
  });
  markPhase(phase.id, "complete");
  appendEvent(`${phase.label} が着地しました。`);
}

async function startDebate(topic) {
  state.topic = topic;
  setTopicUi(topic);
  resetPhaseList();
  state.messages = [];
  state.currentPhaseIndex = -1;
  renderEmptyState();
  clearEmptyState();
  setTurnCounter(0);
  setDebateState("Dispatching");
  addSystemMessage(`論題をセットしました: ${topic}`, "brief");
  appendEvent("論題を反映しました。6 ターンの対戦を開始します。");

  state.controller = new AbortController();
  setPending(true);

  try {
    for (let index = 0; index < TURN_PHASES.length; index += 1) {
      await runPhase(TURN_PHASES[index], index);
    }
    setDebateState("Completed");
    appendEvent("全 6 ターンの対戦が完了しました。");
  } catch (error) {
    if (isAbortLikeError(error)) {
      addSystemMessage("対戦を中断しました。必要ならそのまま論題を変えて再開できます。", "stopped");
      appendEvent("実行を中断しました。");
      setDebateState("Stopped");
    } else {
      const message = compactText(error && error.message ? error.message : "討論の生成に失敗しました。", 300);
      addSystemMessage(message.startsWith("HTTP") || message.startsWith("status=") ? message : `エラー: ${message}`, "error");
      appendEvent(`討論が停止しました: ${message}`);
      setDebateState("Error");
    }
  } finally {
    state.controller = null;
    setPending(false);
  }
}

function resetDebate() {
  if (state.controller) state.controller.abort();
  state.topic = "";
  state.messages = [];
  state.currentPhaseIndex = -1;
  if (el.topicInput) el.topicInput.value = "";
  renderEmptyState();
  renderInitialEventLog();
  resetPhaseList();
  setTurnCounter(0);
  setDebateState("Ready");
  setTopicUi("");
  setPending(false);
}

async function loadRuntime() {
  try {
    const response = await fetch(buildAppApiPath("/runtime"), { cache: "no-store" });
    const payload = await response.json();
    if (!response.ok || !payload || payload.mode !== "app-server") {
      throw new Error("runtime unavailable");
    }

    state.runtime.controlToken = compactText(
      payload && payload.controlApi && payload.controlApi.token ? payload.controlApi.token : "",
      400
    );
    state.runtime.controlTokenHeader = compactText(
      payload && payload.controlApi && payload.controlApi.tokenHeader ? payload.controlApi.tokenHeader : "",
      120
    ) || "x-codex-control-token";
    setRuntimeStatus(`connected / ${compactText(payload.defaultExecAgent || "default", 80)}`);
  } catch {
    state.runtime.controlToken = "";
    setRuntimeStatus("preview / runtime offline");
  }
}

function bindEvents() {
  if (el.composer) {
    el.composer.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (state.pending) return;
      const topic = compactText(el.topicInput ? el.topicInput.value : "", 400);
      if (!topic) {
        appendEvent(UI_TEXT.missingTopic);
        return;
      }
      await startDebate(topic);
    });
  }

  if (el.stopBtn) {
    el.stopBtn.addEventListener("click", () => {
      if (state.controller) {
        state.controller.abort();
      }
    });
  }

  if (el.restartBtn) {
    el.restartBtn.addEventListener("click", resetDebate);
  }
}

async function boot() {
  renderEmptyState();
  renderInitialEventLog();
  bindEvents();
  setTurnCounter(0);
  setDebateState("Ready");
  setTopicUi("");
  setPending(false);
  await loadRuntime();
}

boot().catch(() => {
  setRuntimeStatus("preview / boot error");
});
