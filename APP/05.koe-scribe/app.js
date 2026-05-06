const EXEC_STREAM_CONTENT_TYPE = "application/x-ndjson";
const EXEC_TIMEOUT_MS = 1000 * 60 * 60 * 2;

const state = {
  selectedFile: null,
  uploadedFileSignature: "",
  uploadedMedia: null,
  controller: null,
  latestTranscript: "",
  workingTimer: null,
  runtime: {
    controlToken: "",
    controlTokenHeader: "x-codex-control-token",
    transcriptionReady: false,
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
  runBtn: document.getElementById("runBtn"),
  stopBtn: document.getElementById("stopBtn"),
  copyBtn: document.getElementById("copyBtn"),
  progressBar: document.getElementById("progressBar"),
  transcriptOutput: document.getElementById("transcriptOutput"),
};

function text(value, max = 24000) {
  if (typeof value !== "string") return "";
  return value.replace(/\r\n/g, "\n").trim().slice(0, max);
}

function setRuntimeStatus(label, status) {
  if (!el.runtimeStatus) return;
  el.runtimeStatus.textContent = label;
  el.runtimeStatus.classList.toggle("is-ready", status === "ready");
  el.runtimeStatus.classList.toggle("is-offline", status === "offline");
}

function setProgress(percent) {
  if (!el.progressBar) return;
  const value = Math.max(0, Math.min(100, Number(percent) || 0));
  el.progressBar.style.width = `${value}%`;
}

function restartRequiredMessage() {
  return [
    "古いKoeScribeサーバーが動いています。",
    "",
    "この画面が診断レポートだけを返す場合、文字起こし処理が入る前のサーバープロセスに接続しています。",
    "起動用.bat のウィンドウを閉じて、もう一度起動してください。",
  ].join("\n");
}

function isLegacyDiagnosticOutput(value) {
  const body = text(value, 12000);
  return body.includes("KoeScribe standalone isolated run")
    && body.includes("Actual speech-to-text execution is not wired");
}

function canCopy(value) {
  const body = text(value, 1000000);
  return Boolean(body && body !== "待機中" && body !== "実行中");
}

function setTranscript(textValue, options = {}) {
  const value = textValue || "待機中";
  state.latestTranscript = value;
  if (el.transcriptOutput) el.transcriptOutput.textContent = value;
  if (el.copyBtn) {
    const copyable = options.copyable == null ? canCopy(value) : Boolean(options.copyable);
    el.copyBtn.disabled = !copyable;
    if (el.copyBtn.textContent !== "全文コピー") el.copyBtn.textContent = "全文コピー";
  }
}

function stopWorkingMessage() {
  if (state.workingTimer) {
    window.clearInterval(state.workingTimer);
    state.workingTimer = null;
  }
}

function startWorkingMessage(label) {
  stopWorkingMessage();
  let tick = 0;
  const render = () => {
    const dots = ".".repeat((tick % 3) + 1);
    setTranscript(`${label}${dots}`, { copyable: false });
    tick += 1;
  };
  render();
  state.workingTimer = window.setInterval(render, 550);
}

function setPending(pending) {
  const active = Boolean(pending);
  if (el.runBtn) el.runBtn.disabled = active || !state.runtime.transcriptionReady;
  if (el.stopBtn) el.stopBtn.disabled = !active;
  if (active && el.copyBtn) el.copyBtn.disabled = true;
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

function wavFileName(fileName) {
  const raw = text(fileName || "media", 260) || "media";
  const withoutExt = raw.replace(/\.[^.]+$/, "");
  return `${withoutExt || "media"}.wav`;
}

function audioBufferToMono(audioBuffer) {
  const length = audioBuffer.length;
  const channels = Math.max(1, audioBuffer.numberOfChannels || 1);
  const mono = new Float32Array(length);
  for (let channel = 0; channel < channels; channel += 1) {
    const data = audioBuffer.getChannelData(channel);
    for (let index = 0; index < length; index += 1) {
      mono[index] += data[index] / channels;
    }
  }
  return mono;
}

function encodeWavPcm16(samples, sampleRate) {
  const bytesPerSample = 2;
  const buffer = new ArrayBuffer(44 + samples.length * bytesPerSample);
  const view = new DataView(buffer);
  const writeString = (offset, value) => {
    for (let index = 0; index < value.length; index += 1) {
      view.setUint8(offset + index, value.charCodeAt(index));
    }
  };
  writeString(0, "RIFF");
  view.setUint32(4, 36 + samples.length * bytesPerSample, true);
  writeString(8, "WAVE");
  writeString(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * bytesPerSample, true);
  view.setUint16(32, bytesPerSample, true);
  view.setUint16(34, 8 * bytesPerSample, true);
  writeString(36, "data");
  view.setUint32(40, samples.length * bytesPerSample, true);
  let offset = 44;
  for (let index = 0; index < samples.length; index += 1) {
    const sample = Math.max(-1, Math.min(1, samples[index] || 0));
    view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
    offset += bytesPerSample;
  }
  return new Blob([buffer], { type: "audio/wav" });
}

async function decodeMediaToWav(file) {
  const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextCtor || !window.OfflineAudioContext) {
    throw new Error("This browser cannot prepare local WAV audio for transcription.");
  }
  const inputBuffer = await file.arrayBuffer();
  const decodeContext = new AudioContextCtor();
  let decoded = null;
  try {
    decoded = await decodeContext.decodeAudioData(inputBuffer.slice(0));
  } finally {
    if (decodeContext && typeof decodeContext.close === "function") {
      decodeContext.close().catch(() => {});
    }
  }
  const sampleRate = 16000;
  const frameCount = Math.max(1, Math.ceil(decoded.duration * sampleRate));
  const offline = new OfflineAudioContext(1, frameCount, sampleRate);
  const source = offline.createBufferSource();
  source.buffer = decoded;
  source.connect(offline.destination);
  source.start(0);
  const rendered = await offline.startRendering();
  return encodeWavPcm16(audioBufferToMono(rendered), sampleRate);
}

async function prepareUploadAsset(file) {
  const type = text(file && file.type ? file.type : "", 120).toLowerCase();
  const name = text(file && file.name ? file.name : "media", 260) || "media";
  if (type.includes("wav") || /\.wav$/i.test(name)) {
    return { blob: file, name, type: type || "audio/wav" };
  }
  startWorkingMessage("音声を準備中");
  const wavBlob = await decodeMediaToWav(file);
  return {
    blob: wavBlob,
    name: wavFileName(name),
    type: "audio/wav",
  };
}

async function uploadSelectedFileIfNeeded(job) {
  if (job.videoPath || !state.selectedFile) return null;

  const signature = fileSignature(state.selectedFile);
  if (state.uploadedMedia && state.uploadedFileSignature === signature) {
    return state.uploadedMedia;
  }

  startWorkingMessage("アップロード中");
  setProgress(12);
  const uploadAsset = await prepareUploadAsset(state.selectedFile);

  const response = await fetch(buildAppApiPath("/media/upload"), {
    method: "POST",
    headers: buildControlHeaders({
      "Content-Type": uploadAsset.type || "application/octet-stream",
      "x-koe-scribe-file-name": encodeURIComponent(uploadAsset.name || "media"),
      "x-koe-scribe-file-type": uploadAsset.type || "application/octet-stream",
      "x-koe-scribe-file-size": String(uploadAsset.blob && uploadAsset.blob.size ? uploadAsset.blob.size : 0),
    }),
    body: uploadAsset.blob,
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload || !payload.upload) {
    throw new Error(text(payload && payload.error ? payload.error : `upload failed: HTTP ${response.status}`, 800));
  }

  state.uploadedMedia = payload.upload;
  state.uploadedFileSignature = signature;
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
    externalConsent: engine === "codex-openai-transcription",
  };
}

function validateJob(job, forRun) {
  if (forRun && !state.runtime.transcriptionReady) {
    throw new Error(restartRequiredMessage());
  }
  if (forRun && job.engine !== "plan-only" && !job.videoPath && !state.selectedFile) {
    throw new Error("動画または音声ファイルを選択してください。");
  }
  if (!job.outputs.length) {
    throw new Error("出力形式を1つ以上選んでください。");
  }
}

function buildPrompt(job, mode) {
  return [
    "KoeScribe transcription job.",
    "",
    "Purpose:",
    "- Create an accurate transcript from the selected video or audio.",
    "- Generate selected subtitle and transcript files.",
    "- Apply the glossary to product names, technical words, and proper nouns.",
    "",
    "Input:",
    `- mode: ${mode}`,
    `- sourceMode: ${job.sourceMode || "none"}`,
    `- videoPath: ${job.videoPath || "(not provided)"}`,
    `- uploadedMediaPath: ${job.uploadedMedia && job.uploadedMedia.localPath ? job.uploadedMedia.localPath : "(none)"}`,
    `- selectedFileName: ${job.fileName || "(none)"}`,
    `- selectedFileSize: ${job.fileSize ? formatFileSize(job.fileSize) : "(unknown)"}`,
    `- selectedFileType: ${job.fileType || "(unknown)"}`,
    `- outputDir: ${job.outputDir || "per-run job directory"}`,
    `- language: ${job.language}`,
    `- engine: ${job.engine}`,
    `- quality: ${job.quality}`,
    `- outputs: ${job.outputs.join(", ")}`,
    "",
    "Glossary:",
    job.glossary || "(none)",
    "",
    "Output contract:",
    "- Return the final transcript text.",
    "- Include generated file paths.",
  ].join("\n");
}

function isExecStreamResponse(response) {
  const contentType = String(response && response.headers ? response.headers.get("content-type") || "" : "").toLowerCase();
  return Boolean(response && response.ok && contentType.includes(EXEC_STREAM_CONTENT_TYPE));
}

async function streamExecPrompt(prompt, job) {
  const payload = {
    prompt,
    job: job || null,
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
        setTranscript(finalText, { copyable: false });
        eventCount += 1;
        setProgress(Math.min(92, 24 + eventCount * 3));
      } else if (event.type === "final" && typeof event.text === "string") {
        finalText = event.text;
        if (isLegacyDiagnosticOutput(finalText)) {
          throw new Error(restartRequiredMessage());
        }
        stopWorkingMessage();
        setTranscript(finalText);
        setProgress(100);
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
        handleEvent(JSON.parse(line));
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
  if (el.fileMeta) el.fileMeta.textContent = `${formatFileSize(file.size)} / ${file.type || "unknown type"} / 実行時にローカル保存`;
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
    const hasTranscriptionWorker = Boolean(
      payload
        && payload.isolation
        && (payload.isolation.transcriptionProvider || payload.isolation.transcriptionModel)
    );
    state.runtime.transcriptionReady = hasTranscriptionWorker;
    if (!hasTranscriptionWorker) {
      setRuntimeStatus("restart required", "offline");
      setTranscript(restartRequiredMessage(), { copyable: false });
      setPending(false);
      return;
    }
    setRuntimeStatus(isStandalone ? "standalone isolated" : "runtime connected", "ready");
    setPending(false);
  } catch {
    state.runtime.controlToken = "";
    state.runtime.transcriptionReady = false;
    setRuntimeStatus("preview offline", "offline");
    setPending(false);
  }
}

async function copyTranscript() {
  const value = text(state.latestTranscript, 1000000);
  if (!canCopy(value)) return;
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(value);
    } else {
      const textarea = document.createElement("textarea");
      textarea.value = value;
      textarea.setAttribute("readonly", "");
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      textarea.remove();
    }
    if (el.copyBtn) {
      el.copyBtn.textContent = "コピー済み";
      window.setTimeout(() => {
        if (el.copyBtn) el.copyBtn.textContent = "全文コピー";
      }, 1400);
    }
  } catch (error) {
    setTranscript(`コピーに失敗しました。\n\n${value}`);
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

  if (el.copyBtn) {
    el.copyBtn.addEventListener("click", copyTranscript);
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
        startWorkingMessage("文字起こし中");
        await streamExecPrompt(prompt, job);
      } catch (error) {
        stopWorkingMessage();
        const message = error && error.message ? error.message : "実行に失敗しました。";
        setTranscript(message, { copyable: false });
        setProgress(0);
      } finally {
        stopWorkingMessage();
        setPending(false);
      }
    });
  }

  if (el.stopBtn) {
    el.stopBtn.addEventListener("click", () => {
      if (state.controller) {
        state.controller.abort();
      }
    });
  }
}

async function boot() {
  bindEvents();
  setProgress(0);
  setPending(false);
  setTranscript("待機中", { copyable: false });
  await loadRuntime();
}

boot().catch((error) => {
  setRuntimeStatus("boot error", "offline");
  setTranscript(error && error.message ? error.message : "起動に失敗しました。");
});
