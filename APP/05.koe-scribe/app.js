const EXEC_STREAM_CONTENT_TYPE = "application/x-ndjson";
const EXEC_TIMEOUT_MS = 1000 * 60 * 60 * 2;

const state = {
  selectedFile: null,
  uploadedFileSignature: "",
  uploadedMedia: null,
  controller: null,
  runtime: {
    controlToken: "",
    controlTokenHeader: "x-codex-control-token",
  },
};

const el = {
  runtimeStatus: document.getElementById("runtimeStatus"),
  videoFile: document.getElementById("videoFile"),
  dropzone: document.getElementById("dropzone"),
  fileName: document.getElementById("fileName"),
  fileMeta: document.getElementById("fileMeta"),
  videoPath: document.getElementById("videoPath"),
  outputDir: document.getElementById("outputDir"),
  language: document.getElementById("language"),
  engine: document.getElementById("engine"),
  quality: document.getElementById("quality"),
  glossary: document.getElementById("glossary"),
  makeSrt: document.getElementById("makeSrt"),
  makeVtt: document.getElementById("makeVtt"),
  makeMarkdown: document.getElementById("makeMarkdown"),
  externalConsent: document.getElementById("externalConsent"),
  planBtn: document.getElementById("planBtn"),
  runBtn: document.getElementById("runBtn"),
  stopBtn: document.getElementById("stopBtn"),
  modeLabel: document.getElementById("modeLabel"),
  outputLabel: document.getElementById("outputLabel"),
  progressBar: document.getElementById("progressBar"),
  transcriptOutput: document.getElementById("transcriptOutput"),
  promptOutput: document.getElementById("promptOutput"),
  eventLog: document.getElementById("eventLog"),
};

function text(value, max = 24000) {
  if (typeof value !== "string") return "";
  return value.replace(/\r\n/g, "\n").trim().slice(0, max);
}

function nowLabel() {
  return new Date().toLocaleTimeString("ja-JP", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

function logEvent(message, tone = "") {
  if (!el.eventLog) return;
  const item = document.createElement("li");
  const timeEl = document.createElement("time");
  const bodyEl = document.createElement("span");
  timeEl.textContent = nowLabel();
  bodyEl.textContent = text(message, 600);
  if (tone === "error") bodyEl.className = "is-error";
  item.append(timeEl, bodyEl);
  el.eventLog.prepend(item);
}

function setRuntimeStatus(label, status) {
  if (!el.runtimeStatus) return;
  el.runtimeStatus.textContent = label;
  el.runtimeStatus.classList.toggle("is-ready", status === "ready");
  el.runtimeStatus.classList.toggle("is-offline", status === "offline");
}

function setMode(label) {
  if (el.modeLabel) el.modeLabel.textContent = label;
}

function setProgress(percent) {
  if (!el.progressBar) return;
  const value = Math.max(0, Math.min(100, Number(percent) || 0));
  el.progressBar.style.width = `${value}%`;
}

function setPending(pending) {
  const active = Boolean(pending);
  if (el.planBtn) el.planBtn.disabled = active;
  if (el.runBtn) el.runBtn.disabled = active;
  if (el.stopBtn) el.stopBtn.disabled = !active;
  setMode(active ? "running" : "ready");
}

function resolveAppBasePath() {
  const pathname = text(window.location && window.location.pathname ? window.location.pathname : "", 240);
  if (pathname === "/apps/koe-scribe" || pathname.startsWith("/apps/koe-scribe/")) {
    return "/apps/koe-scribe";
  }
  return "";
}

function buildAppApiPath(pathname) {
  const normalized = text(pathname, 240);
  const suffix = normalized.startsWith("/") ? normalized : `/${normalized}`;
  return `${resolveAppBasePath()}/api${suffix}`;
}

function buildControlHeaders(extraHeaders = {}) {
  const token = text(state.runtime.controlToken, 400);
  if (!token) throw new Error("control API token unavailable");
  return {
    [text(state.runtime.controlTokenHeader, 120) || "x-codex-control-token"]: token,
    ...extraHeaders,
  };
}

function buildExecHeaders() {
  return buildControlHeaders({
    "Content-Type": "application/json; charset=utf-8",
  });
}

function formatFileSize(bytes) {
  const size = Number(bytes) || 0;
  if (size >= 1024 * 1024 * 1024) return `${(size / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  if (size >= 1024 * 1024) return `${(size / (1024 * 1024)).toFixed(1)} MB`;
  if (size >= 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${size} B`;
}

function fileSignature(file) {
  if (!file) return "";
  return [file.name || "", file.size || 0, file.lastModified || 0].join(":");
}

async function uploadSelectedFileIfNeeded(job) {
  if (job.videoPath || !state.selectedFile) return null;

  const signature = fileSignature(state.selectedFile);
  if (state.uploadedMedia && state.uploadedFileSignature === signature) {
    return state.uploadedMedia;
  }

  logEvent(`uploading local copy: ${state.selectedFile.name}`);
  setProgress(12);

  const response = await fetch(buildAppApiPath("/media/upload"), {
    method: "POST",
    headers: buildControlHeaders({
      "Content-Type": state.selectedFile.type || "application/octet-stream",
      "x-koe-scribe-file-name": encodeURIComponent(state.selectedFile.name || "media"),
      "x-koe-scribe-file-type": state.selectedFile.type || "application/octet-stream",
      "x-koe-scribe-file-size": String(state.selectedFile.size || 0),
    }),
    body: state.selectedFile,
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload || !payload.upload) {
    throw new Error(text(payload && payload.error ? payload.error : `upload failed: HTTP ${response.status}`, 800));
  }

  state.uploadedMedia = payload.upload;
  state.uploadedFileSignature = signature;
  logEvent(`uploaded: ${payload.upload.runtimeRelativePath || payload.upload.fileName}`);
  setProgress(24);
  return state.uploadedMedia;
}

function selectedOutputs() {
  const values = [];
  if (el.makeSrt && el.makeSrt.checked) values.push("SRT");
  if (el.makeVtt && el.makeVtt.checked) values.push("VTT");
  if (el.makeMarkdown && el.makeMarkdown.checked) values.push("Markdown");
  return values.length ? values : ["Markdown"];
}

function collectJob() {
  const file = state.selectedFile;
  const uploadedMedia = state.uploadedMedia || null;
  const explicitVideoPath = text(el.videoPath ? el.videoPath.value : "", 1200);
  const engine = el.engine ? el.engine.value : "codex-openai-transcription";
  return {
    fileName: file ? file.name : "",
    fileSize: file ? file.size : 0,
    fileType: file ? file.type : "",
    sourceMode: explicitVideoPath ? "local-path" : uploadedMedia ? "uploaded-file" : file ? "browser-file" : "none",
    videoPath: explicitVideoPath || (uploadedMedia && uploadedMedia.localPath ? uploadedMedia.localPath : ""),
    uploadedMedia,
    outputDir: text(el.outputDir ? el.outputDir.value : "", 1200),
    language: el.language ? el.language.value : "ja",
    engine,
    quality: el.quality ? el.quality.value : "technical",
    glossary: text(el.glossary ? el.glossary.value : "", 4000),
    outputs: selectedOutputs(),
    externalConsent: engine === "codex-openai-transcription" || Boolean(el.externalConsent && el.externalConsent.checked),
  };
}

function validateJob(job, forRun) {
  if (forRun && job.engine !== "plan-only" && !job.videoPath && !state.selectedFile) {
    throw new Error("ローカルパスを入力してください。ブラウザのファイル選択だけでは実行側が元動画を読めません。");
  }
  if (!job.outputs.length) {
    throw new Error("出力形式を1つ以上選んでください。");
  }
  if (forRun && job.engine.startsWith("openai-") && !job.externalConsent) {
    throw new Error("OpenAI系エンジンを使う場合は外部API送信を許可してください。");
  }
}

function buildPrompt(job, mode) {
  const engineNotes = {
    "codex-openai-transcription": "Codex / OpenAI transcription route is fixed for this app. Do not ask the user to choose a separate engine.",
    "openai-whisper-srt": "OpenAI whisper-1 を優先し、SRT/VTT が必要なら response_format を使う。25MB 制限を超える場合は音声を低ビットレート化または分割してタイムコードを保つ。",
    "openai-gpt4o-text": "OpenAI gpt-4o-transcribe 系を優先し、必要に応じて JSON/text から字幕タイムコードへ後処理する。話者分離が必要なら diarization の可否を確認する。",
    "local-whisper": "ローカルの whisper.cpp または whisper CLI を優先する。未導入ならインストールせず BLOCKED として必要コマンドだけ示す。",
    "plan-only": "実ファイル処理は行わず、検証済みの実行計画だけ返す。",
  };

  return [
    "KoeScribe transcription job.",
    "",
    "目的:",
    "- 動画または音声から高精度の日本語文字起こしを作る。",
    "- 字幕ファイルと読みやすい Markdown transcript を生成する。",
    "- 専門用語を glossary に合わせて補正する。",
    "",
    "入力:",
    `- mode: ${mode}`,
    `- sourceMode: ${job.sourceMode || "none"}`,
    `- videoPath: ${job.videoPath || "(not provided)"}`,
    `- uploadedMediaPath: ${job.uploadedMedia && job.uploadedMedia.localPath ? job.uploadedMedia.localPath : "(none)"}`,
    `- selectedFileName: ${job.fileName || "(none)"}`,
    `- selectedFileSize: ${job.fileSize ? formatFileSize(job.fileSize) : "(unknown)"}`,
    `- selectedFileType: ${job.fileType || "(unknown)"}`,
    `- outputDir: ${job.outputDir || "same directory as input"}`,
    `- language: ${job.language}`,
    `- engine: ${job.engine}`,
    `- quality: ${job.quality}`,
    `- outputs: ${job.outputs.join(", ")}`,
    `- externalApiConsent: ${job.externalConsent ? "yes" : "no"}`,
    "",
    "Glossary:",
    job.glossary || "(none)",
    "",
    "実行方針:",
    "- Run inside the KoeScribe standalone server. Do not dispatch this job to shared Codex /api/exec.",
    "- まず入力ファイルの存在、サイズ、音声トラックを確認する。",
    "- ffmpeg/ffprobe/whisper/OpenAI API の利用可否を確認し、足りない依存は勝手にインストールしない。",
    "- externalApiConsent が no の場合、外部 API へ音声・動画・字幕内容を送らない。",
    "- 元動画は上書きしない。生成物は outputDir または入力動画と同じフォルダに新規作成する。",
    "- 長尺動画では音声抽出、圧縮、分割、タイムコード結合を行う。",
    "- glossary の表記を最終 transcript と subtitle に反映する。",
    "- 成果物パス、使用エンジン、実行できなかった箇所、残留リスクを最後に報告する。",
    "",
    "Engine note:",
    engineNotes[job.engine] || engineNotes["plan-only"],
    "",
    "Output contract:",
    "- generated_files: 作成した .srt/.vtt/.md/.txt などの絶対パス",
    "- transcript_summary: 内容の短い要約",
    "- quality_notes: 聞き取り不確実箇所、専門用語補正、分割処理の有無",
    "- blocked: 実行不可なら理由と次に必要な承認または依存",
  ].join("\n");
}

function updateOutputLabel() {
  if (el.outputLabel) el.outputLabel.textContent = selectedOutputs().join(" / ");
}

function setPrompt(prompt) {
  if (el.promptOutput) el.promptOutput.textContent = prompt;
}

function setTranscript(textValue) {
  if (el.transcriptOutput) el.transcriptOutput.textContent = textValue || "待機中";
}

function isExecStreamResponse(response) {
  const contentType = String(response && response.headers ? response.headers.get("content-type") || "" : "").toLowerCase();
  return Boolean(response && response.ok && contentType.includes(EXEC_STREAM_CONTENT_TYPE));
}

async function streamExecPrompt(prompt, job) {
  const payload = {
    prompt,
    uploadedMedia: job && job.uploadedMedia ? job.uploadedMedia : null,
    agentName: "default",
    sandboxMode: "workspace-write",
    approvalPolicy: "never",
    cwd: "C:\\Users\\akima\\dev\\codex_Original_UI_PJ_with-Harnes\\APP\\05.koe-scribe",
    forceNewSession: true,
    requestUserInputPolicy: "blocked",
    disableSlashRouter: true,
    webSearch: false,
    modelReasoningEffort: "medium",
    executionProfile: "conversation-app-server",
    executionIntent: "koe-scribe-transcription",
    executionSource: "app_koe_scribe",
  };

  state.controller = new AbortController();
  const timeoutId = window.setTimeout(() => {
    if (state.controller) state.controller.abort(new DOMException("Exec request timed out", "TimeoutError"));
  }, EXEC_TIMEOUT_MS);

  try {
    const response = await fetch(buildAppApiPath("/exec"), {
      method: "POST",
      headers: buildExecHeaders(),
      body: JSON.stringify(payload),
      signal: state.controller.signal,
    });

    if (!isExecStreamResponse(response)) {
      const bodyText = await response.text();
      throw new Error(`HTTP ${response.status} ${bodyText}`.trim());
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let finalText = "";
    let eventCount = 0;

    const handleEvent = (event) => {
      if (!event || typeof event.type !== "string") return;
      if (event.type === "delta" && typeof event.text === "string") {
        finalText += event.text;
        setTranscript(finalText);
        eventCount += 1;
        setProgress(Math.min(92, 12 + eventCount * 3));
      } else if (event.type === "final" && typeof event.text === "string") {
        finalText = event.text;
        setTranscript(finalText);
        setProgress(100);
      } else if (event.type === "status" && event.status) {
        logEvent(`status: ${event.status}`);
      } else if (event.type === "error") {
        throw new Error(text(event.text || "runtime error", 600));
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
        } catch (error) {
          throw error;
        }
      }
      if (force && buffer.trim()) {
        handleEvent(JSON.parse(buffer.trim()));
        buffer = "";
      }
    };

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      flush(decoder.decode(value, { stream: true }));
    }
    flush(decoder.decode(), true);
    return finalText;
  } finally {
    window.clearTimeout(timeoutId);
    state.controller = null;
  }
}

function handleFile(file) {
  state.selectedFile = file || null;
  state.uploadedFileSignature = "";
  state.uploadedMedia = null;
  if (!file) {
    if (el.fileName) el.fileName.textContent = "ファイルを選択";
    if (el.fileMeta) el.fileMeta.textContent = "MP4 / MOV / M4A / WAV";
    return;
  }
  if (el.fileName) el.fileName.textContent = file.name;
  if (el.fileMeta) el.fileMeta.textContent = `${formatFileSize(file.size)} / ${file.type || "unknown type"} / local copy on run`;
  logEvent(`selected: ${file.name}`);
}

function switchTab(tabId) {
  document.querySelectorAll(".tab").forEach((tab) => {
    tab.classList.toggle("is-active", tab.dataset.tab === tabId);
  });
  document.querySelectorAll(".tab-panel").forEach((panel) => {
    panel.classList.toggle("is-active", panel.id === `${tabId}Panel`);
  });
}

async function loadRuntime() {
  try {
    const response = await fetch(buildAppApiPath("/runtime"), { cache: "no-store" });
    const payload = await response.json();
    if (!response.ok || !payload || payload.mode !== "app-server") {
      throw new Error("runtime unavailable");
    }
    state.runtime.controlToken = text(payload && payload.controlApi && payload.controlApi.token ? payload.controlApi.token : "", 400);
    state.runtime.controlTokenHeader = text(payload && payload.controlApi && payload.controlApi.tokenHeader ? payload.controlApi.tokenHeader : "", 120) || "x-codex-control-token";
    const isStandalone = Boolean(payload && payload.isolation && payload.isolation.mode === "standalone");
    const runtimeLabel = isStandalone ? "standalone isolated" : "runtime connected";
    setRuntimeStatus(runtimeLabel, "ready");
    logEvent(runtimeLabel);
  } catch {
    state.runtime.controlToken = "";
    setRuntimeStatus("preview offline", "offline");
    logEvent("runtime offline: plan preview only");
  }
}

function bindEvents() {
  if (el.videoFile) {
    el.videoFile.addEventListener("change", () => {
      handleFile(el.videoFile.files && el.videoFile.files[0] ? el.videoFile.files[0] : null);
    });
  }

  if (el.dropzone) {
    el.dropzone.addEventListener("dragover", (event) => {
      event.preventDefault();
      el.dropzone.classList.add("is-dragging");
    });
    el.dropzone.addEventListener("dragleave", () => {
      el.dropzone.classList.remove("is-dragging");
    });
    el.dropzone.addEventListener("drop", (event) => {
      event.preventDefault();
      el.dropzone.classList.remove("is-dragging");
      const file = event.dataTransfer && event.dataTransfer.files && event.dataTransfer.files[0]
        ? event.dataTransfer.files[0]
        : null;
      handleFile(file);
    });
  }

  document.querySelectorAll(".tab").forEach((tab) => {
    tab.addEventListener("click", () => switchTab(tab.dataset.tab));
  });

  [el.makeSrt, el.makeVtt, el.makeMarkdown].forEach((input) => {
    if (input) input.addEventListener("change", updateOutputLabel);
  });

  if (el.planBtn) {
    el.planBtn.addEventListener("click", () => {
      try {
        const job = collectJob();
        validateJob(job, false);
        const prompt = buildPrompt(job, "plan");
        setPrompt(prompt);
        setTranscript("実行計画を作成しました。Prompt タブで確認できます。");
        switchTab("prompt");
        setProgress(18);
        logEvent("plan generated");
      } catch (error) {
        logEvent(error.message || "plan failed", "error");
      }
    });
  }

  if (el.runBtn) {
    el.runBtn.addEventListener("click", async () => {
      try {
        let job = collectJob();
        validateJob(job, true);
        setPending(true);
        setProgress(8);
        await uploadSelectedFileIfNeeded(job);
        job = collectJob();
        const prompt = buildPrompt(job, "run");
        setPrompt(prompt);
        setTranscript("実行中");
        switchTab("transcript");
        logEvent("job submitted");
        await streamExecPrompt(prompt, job);
        logEvent("job finished");
      } catch (error) {
        const message = error && error.message ? error.message : "job failed";
        setTranscript(message);
        logEvent(message, "error");
        setProgress(0);
      } finally {
        setPending(false);
      }
    });
  }

  if (el.stopBtn) {
    el.stopBtn.addEventListener("click", () => {
      if (state.controller) {
        state.controller.abort();
        logEvent("stop requested");
      }
    });
  }
}

async function boot() {
  bindEvents();
  updateOutputLabel();
  setProgress(0);
  setPending(false);
  logEvent("ready");
  await loadRuntime();
}

boot().catch((error) => {
  setRuntimeStatus("boot error", "offline");
  logEvent(error && error.message ? error.message : "boot error", "error");
});
