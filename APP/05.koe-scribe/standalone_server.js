"use strict";

const crypto = require("crypto");
const fs = require("fs");
const https = require("https");
const http = require("http");
const path = require("path");
const { spawn } = require("child_process");
const { URL } = require("url");

const DEFAULT_HOST = "127.0.0.1";
const EXEC_STREAM_CONTENT_TYPE = "application/x-ndjson";
const MAX_BODY_BYTES = 1024 * 1024;
const MAX_UPLOAD_BYTES = normalizeMegabytes(process.env.CODEX_KOE_SCRIBE_MAX_UPLOAD_MB, 20 * 1024);
const TRANSCRIPTION_PROVIDER = String(process.env.CODEX_KOE_SCRIBE_PROVIDER || "codex-app").trim().toLowerCase();
const CODEX_APP_BASE_URL = String(process.env.CODEX_KOE_SCRIBE_CODEX_APP_URL || "http://127.0.0.1:57525").replace(/\/+$/, "");
const OPENAI_API_BASE_URL = String(process.env.OPENAI_BASE_URL || "https://api.openai.com/v1").replace(/\/+$/, "");
const OPENAI_TRANSCRIPTION_MODEL = process.env.CODEX_KOE_SCRIBE_OPENAI_MODEL || "gpt-4o-transcribe";
const ALLOW_WINDOWS_SPEECH_FALLBACK = normalizeBooleanFlag(process.env.CODEX_KOE_SCRIBE_ALLOW_WINDOWS_SPEECH, false);
const WINDOWS_SPEECH_TIMEOUT_MS = normalizeMilliseconds(process.env.CODEX_KOE_SCRIBE_WINDOWS_SPEECH_TIMEOUT_MS, 10 * 60 * 1000);
const staticRoot = __dirname;
const windowsSpeechScriptPath = path.join(staticRoot, "scripts", "windows_speech_transcribe.ps1");

const mimeTypes = Object.freeze({
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".txt": "text/plain; charset=utf-8",
});

function normalizeHost(value) {
  const raw = String(value || "").trim();
  return raw || DEFAULT_HOST;
}

function normalizePort(value, fallback = 0) {
  const raw = String(value == null ? "" : value).trim();
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 65535) {
    return fallback;
  }
  return parsed;
}

function normalizeMegabytes(value, fallbackMb) {
  const parsed = Number.parseInt(String(value || "").trim(), 10);
  const megabytes = Number.isFinite(parsed) && parsed > 0 ? parsed : fallbackMb;
  return megabytes * 1024 * 1024;
}

function normalizeMilliseconds(value, fallbackMs) {
  const parsed = Number.parseInt(String(value || "").trim(), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallbackMs;
  return Math.max(5000, Math.min(parsed, 60 * 60 * 1000));
}

function normalizeBooleanFlag(value, fallback) {
  const normalized = String(value == null ? "" : value).trim().toLowerCase();
  if (!normalized) return Boolean(fallback);
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  return Boolean(fallback);
}

function contentTypeFor(filePath) {
  return mimeTypes[path.extname(filePath).toLowerCase()] || "application/octet-stream";
}

function sendJson(res, statusCode, payload, extraHeaders = {}) {
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
    "Cache-Control": "no-store",
    ...extraHeaders,
  });
  res.end(body);
}

function sendNdjson(res, statusCode, events) {
  res.writeHead(statusCode, {
    "Content-Type": `${EXEC_STREAM_CONTENT_TYPE}; charset=utf-8`,
    "Cache-Control": "no-store",
  });
  events.forEach((event) => {
    res.write(`${JSON.stringify(event)}\n`);
  });
  res.end();
}

function safeDecodeURIComponent(value) {
  try {
    return { ok: true, value: decodeURIComponent(String(value || "")) };
  } catch {
    return { ok: false, value: "" };
  }
}

function isPathWithin(rootPath, candidatePath) {
  const root = path.resolve(rootPath);
  const candidate = path.resolve(candidatePath);
  return root === candidate || candidate.startsWith(`${root}${path.sep}`);
}

function resolveStaticPath(requestPath) {
  const decodedPath = safeDecodeURIComponent(requestPath || "/");
  if (!decodedPath.ok) return null;
  const normalized = decodedPath.value === "/" ? "/index.html" : decodedPath.value;
  const relativePath = normalized.replace(/^\/+/, "");
  const candidatePath = path.resolve(staticRoot, relativePath);
  if (!isPathWithin(staticRoot, candidatePath)) return null;
  return candidatePath;
}

function serveStatic(req, res, requestUrl) {
  const filePath = resolveStaticPath(requestUrl.pathname);
  if (!filePath) {
    sendJson(res, 400, { ok: false, error: "Invalid path." });
    return;
  }

  fs.stat(filePath, (statError, stats) => {
    if (statError || !stats.isFile()) {
      sendJson(res, 404, { ok: false, error: "Not found." });
      return;
    }

    const headers = {
      "Content-Type": contentTypeFor(filePath),
      "Content-Length": stats.size,
      "Cache-Control": requestUrl.pathname.startsWith("/assets/") ? "public, max-age=3600" : "no-store",
    };

    if (req.method === "HEAD") {
      res.writeHead(200, headers);
      res.end();
      return;
    }

    res.writeHead(200, headers);
    fs.createReadStream(filePath).pipe(res);
  });
}

function collectRequestJson(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let totalBytes = 0;
    req.on("data", (chunk) => {
      totalBytes += chunk.length;
      if (totalBytes > MAX_BODY_BYTES) {
        reject(new Error("Request body is too large."));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      const body = Buffer.concat(chunks).toString("utf8").trim();
      if (!body) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(body));
      } catch {
        reject(new Error("Request body must be JSON."));
      }
    });
    req.on("error", reject);
  });
}

function safeHeaderValue(req, name, max = 500) {
  const value = req.headers[String(name).toLowerCase()];
  if (Array.isArray(value)) return String(value[0] || "").slice(0, max);
  return String(value || "").slice(0, max);
}

function decodeHeaderValue(value) {
  try {
    return decodeURIComponent(String(value || ""));
  } catch {
    return String(value || "");
  }
}

function sanitizeFileName(value) {
  const decoded = decodeHeaderValue(value);
  const baseName = path.basename(decoded || "media");
  const safe = baseName.replace(/[<>:"/\\|?*\u0000-\u001F]/g, "_").replace(/\s+/g, " ").trim();
  return safe || "media";
}

function saveUpload(req, targetPath) {
  return new Promise((resolve, reject) => {
    const declaredLength = Number.parseInt(String(req.headers["content-length"] || ""), 10);
    if (Number.isFinite(declaredLength) && declaredLength > MAX_UPLOAD_BYTES) {
      reject(new Error(`Upload is too large. Max ${Math.round(MAX_UPLOAD_BYTES / 1024 / 1024)} MB.`));
      req.resume();
      return;
    }

    const output = fs.createWriteStream(targetPath, { flags: "wx" });
    let totalBytes = 0;
    let tooLarge = false;
    let settled = false;

    const cleanupAndReject = (error) => {
      if (settled) return;
      settled = true;
      output.destroy();
      fs.rm(targetPath, { force: true }, () => reject(error));
    };

    output.on("error", cleanupAndReject);
    output.on("finish", () => {
      if (settled) return;
      settled = true;
      resolve(totalBytes);
    });

    req.on("data", (chunk) => {
      totalBytes += chunk.length;
      if (totalBytes > MAX_UPLOAD_BYTES) {
        tooLarge = true;
      }
      if (!tooLarge) {
        output.write(chunk);
      }
    });

    req.on("end", () => {
      if (tooLarge) {
        cleanupAndReject(new Error(`Upload is too large. Max ${Math.round(MAX_UPLOAD_BYTES / 1024 / 1024)} MB.`));
        return;
      }
      output.end();
    });

    req.on("error", cleanupAndReject);
  });
}

async function handleMediaUpload(req, res, context) {
  const originalName = sanitizeFileName(safeHeaderValue(req, "x-koe-scribe-file-name"));
  const mediaType = safeHeaderValue(req, "x-koe-scribe-file-type", 200) || "application/octet-stream";
  const uploadId = `upload-${Date.now().toString(36)}-${crypto.randomBytes(4).toString("hex")}`;
  const uploadDir = path.join(context.runtimeRoot, "uploads", uploadId);
  const mediaPath = path.join(uploadDir, originalName);
  fs.mkdirSync(uploadDir, { recursive: true });

  try {
    const size = await saveUpload(req, mediaPath);
    sendJson(res, 200, {
      ok: true,
      upload: {
        id: uploadId,
        fileName: originalName,
        mediaPath,
        localPath: mediaPath,
        mediaType,
        size,
        runtimeRelativePath: path.relative(context.runtimeRoot, mediaPath),
      },
    });
  } catch (error) {
    sendJson(res, 400, {
      ok: false,
      error: error && error.message ? error.message : "Upload failed.",
    });
  }
}

function shortText(value, max = 6000) {
  if (typeof value !== "string") return "";
  return value.replace(/\r\n/g, "\n").trim().slice(0, max);
}

function ensureJobDir(context, runId) {
  const jobDir = path.join(context.runtimeRoot, "jobs", runId);
  fs.mkdirSync(jobDir, { recursive: true });
  fs.writeFileSync(
    path.join(jobDir, "job.json"),
    JSON.stringify(
      {
        runId,
        createdAt: new Date().toISOString(),
        sharedHarnessDispatch: false,
      },
      null,
      2
    )
  );
  return jobDir;
}

function getMediaPathFromBody(body) {
  const uploadedMedia = body && body.uploadedMedia && typeof body.uploadedMedia === "object" ? body.uploadedMedia : null;
  const job = body && body.job && typeof body.job === "object" ? body.job : {};
  return shortText(
    uploadedMedia && uploadedMedia.localPath
      ? uploadedMedia.localPath
      : job && typeof job.videoPath === "string"
        ? job.videoPath
        : "",
    2000
  );
}

function getMediaFileName(body, mediaPath) {
  const uploadedMedia = body && body.uploadedMedia && typeof body.uploadedMedia === "object" ? body.uploadedMedia : null;
  const fromUpload = uploadedMedia && uploadedMedia.fileName ? uploadedMedia.fileName : "";
  return sanitizeFileName(fromUpload || path.basename(mediaPath || "media"));
}

function getJobOptions(body) {
  const job = body && body.job && typeof body.job === "object" ? body.job : {};
  const outputs = Array.isArray(job.outputs) && job.outputs.length ? job.outputs.map(String) : ["Markdown"];
  return {
    glossary: shortText(job.glossary, 4000),
    language: shortText(job.language, 20) || "ja",
    outputDir: shortText(job.outputDir, 2000),
    outputs,
    quality: shortText(job.quality, 80) || "technical",
  };
}

function buildTranscriptionPrompt(options) {
  const lines = [
    "日本語の動画・音声として正確に文字起こししてください。",
    "専門用語、製品名、固有名詞、AI関連語は文脈に合わせて自然な表記へ補正してください。",
  ];
  if (options.quality === "subtitle") {
    lines.push("字幕として読みやすいように、句読点と文のまとまりを整えてください。");
  } else if (options.quality === "verbatim") {
    lines.push("可能な範囲で逐語寄りにしてください。");
  }
  if (options.glossary) {
    lines.push("");
    lines.push("優先表記:");
    lines.push(options.glossary);
  }
  return lines.join("\n").slice(0, 1800);
}

function resolveOutputDir(options, jobDir) {
  if (!options.outputDir) return jobDir;
  const target = path.resolve(options.outputDir);
  fs.mkdirSync(target, { recursive: true });
  return target;
}

function outputBaseName(mediaFileName) {
  const parsed = path.parse(mediaFileName || "transcript");
  return sanitizeFileName(parsed.name || "transcript");
}

function formatTimestamp(seconds, separator) {
  const safeSeconds = Math.max(0, Number(seconds) || 0);
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const secs = Math.floor(safeSeconds % 60);
  const millis = Math.floor((safeSeconds - Math.floor(safeSeconds)) * 1000);
  const pad = (value, size = 2) => String(value).padStart(size, "0");
  return `${pad(hours)}:${pad(minutes)}:${pad(secs)}${separator}${pad(millis, 3)}`;
}

function normalizeSegments(segments, transcriptText) {
  if (Array.isArray(segments) && segments.length) {
    return segments
      .map((segment, index) => ({
        id: index + 1,
        start: Number(segment.start) || 0,
        end: Number(segment.end) || Math.max((Number(segment.start) || 0) + 2, 2),
        text: shortText(segment.text, 4000),
      }))
      .filter((segment) => segment.text);
  }
  if (!transcriptText) return [];
  return [{ id: 1, start: 0, end: 2, text: transcriptText }];
}

function buildSrt(segments) {
  return segments
    .map((segment, index) => [
      String(index + 1),
      `${formatTimestamp(segment.start, ",")} --> ${formatTimestamp(segment.end, ",")}`,
      segment.text,
    ].join("\n"))
    .join("\n\n");
}

function buildVtt(segments) {
  return `WEBVTT\n\n${segments
    .map((segment) => [
      `${formatTimestamp(segment.start, ".")} --> ${formatTimestamp(segment.end, ".")}`,
      segment.text,
    ].join("\n"))
    .join("\n\n")}\n`;
}

function buildMarkdownTranscript({ transcriptText, generatedFiles, model, mediaPath }) {
  return [
    "# KoeScribe 文字起こし",
    "",
    "## 入力",
    "",
    `- メディア: ${mediaPath}`,
    `- モデル: ${model}`,
    "",
    "## 生成ファイル",
    "",
    ...generatedFiles.map((file) => `- ${file}`),
    "",
    "## 文字起こし本文",
    "",
    transcriptText || "(文字起こし本文が空です)",
    "",
  ].join("\n");
}

function writeTranscriptFiles({ outputDir, baseName, transcriptText, segments, outputs, model, mediaPath }) {
  const generatedFiles = [];
  const txtPath = path.join(outputDir, `${baseName}.txt`);
  fs.writeFileSync(txtPath, `${transcriptText || ""}\n`, "utf8");
  generatedFiles.push(txtPath);

  const wants = new Set(outputs.map((output) => String(output).toLowerCase()));
  if (wants.has("markdown")) {
    const mdPath = path.join(outputDir, `${baseName}.md`);
    fs.writeFileSync(mdPath, buildMarkdownTranscript({ transcriptText, generatedFiles, model, mediaPath }), "utf8");
    generatedFiles.push(mdPath);
  }
  if (wants.has("srt") && segments.length) {
    const srtPath = path.join(outputDir, `${baseName}.srt`);
    fs.writeFileSync(srtPath, `${buildSrt(segments)}\n`, "utf8");
    generatedFiles.push(srtPath);
  }
  if (wants.has("vtt") && segments.length) {
    const vttPath = path.join(outputDir, `${baseName}.vtt`);
    fs.writeFileSync(vttPath, buildVtt(segments), "utf8");
    generatedFiles.push(vttPath);
  }
  return generatedFiles;
}

function parseOpenAiError(statusCode, body) {
  try {
    const parsed = JSON.parse(body);
    return parsed && parsed.error && parsed.error.message ? parsed.error.message : body;
  } catch {
    return body;
  }
}

function parseJsonBody(raw) {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function requestJson({ method = "GET", baseUrl, pathname, body, timeoutMs = 300000 }) {
  const endpoint = new URL(pathname, `${baseUrl.replace(/\/+$/, "")}/`);
  const client = endpoint.protocol === "https:" ? https : http;
  const requestBody = body == null ? null : Buffer.from(JSON.stringify(body));

  return new Promise((resolve, reject) => {
    const req = client.request(
      endpoint,
      {
        method,
        headers: {
          ...(requestBody ? {
            "Content-Type": "application/json; charset=utf-8",
            "Content-Length": requestBody.length,
          } : {}),
        },
      },
      (res) => {
        const chunks = [];
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("end", () => {
          const raw = Buffer.concat(chunks).toString("utf8");
          const parsed = parseJsonBody(raw);
          if ((res.statusCode || 500) >= 400) {
            const message = parsed && parsed.error ? parsed.error : raw;
            reject(new Error(message || `HTTP ${res.statusCode}`));
            return;
          }
          resolve(parsed || { text: raw });
        });
      }
    );
    req.setTimeout(Math.max(5000, Math.trunc(Number(timeoutMs) || 300000)), () => {
      req.destroy(new Error("Codex App Server connection timed out."));
    });
    req.on("error", reject);
    if (requestBody) req.write(requestBody);
    req.end();
  });
}

function requestNdjson({ method = "POST", baseUrl, pathname, body, headers = {}, timeoutMs = 300000 }) {
  const endpoint = new URL(pathname, `${baseUrl.replace(/\/+$/, "")}/`);
  const client = endpoint.protocol === "https:" ? https : http;
  const requestBody = body == null ? null : Buffer.from(JSON.stringify(body));

  return new Promise((resolve, reject) => {
    const req = client.request(
      endpoint,
      {
        method,
        headers: {
          ...(requestBody ? {
            "Content-Type": "application/json; charset=utf-8",
            "Content-Length": requestBody.length,
          } : {}),
          ...headers,
        },
      },
      (res) => {
        const chunks = [];
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("end", () => {
          const raw = Buffer.concat(chunks).toString("utf8");
          if ((res.statusCode || 500) >= 400) {
            const parsed = parseJsonBody(raw);
            const message = parsed && parsed.error ? parsed.error : raw;
            reject(new Error(message || `HTTP ${res.statusCode}`));
            return;
          }
          const events = raw
            .split(/\r?\n/)
            .map((line) => line.trim())
            .filter(Boolean)
            .map((line) => parseJsonBody(line))
            .filter(Boolean);
          resolve({ events, raw });
        });
      }
    );
    req.setTimeout(Math.max(5000, Math.trunc(Number(timeoutMs) || 300000)), () => {
      req.destroy(new Error("Codex App Server exec timed out."));
    });
    req.on("error", reject);
    if (requestBody) req.write(requestBody);
    req.end();
  });
}

function isWindowsWavInput(mediaPath, mediaType) {
  if (process.platform !== "win32") return false;
  const ext = path.extname(mediaPath || "").toLowerCase();
  const type = String(mediaType || "").toLowerCase();
  return ext === ".wav" || type.includes("audio/wav") || type.includes("audio/x-wav") || type.includes("wave");
}

function windowsSpeechCulture(language) {
  const normalized = String(language || "").trim().toLowerCase();
  if (normalized.startsWith("en")) return "en-US";
  return "ja-JP";
}

function runWindowsSpeechScript({ mediaPath, language }) {
  const powerShell = path.join(process.env.SystemRoot || "C:\\Windows", "System32", "WindowsPowerShell", "v1.0", "powershell.exe");
  return new Promise((resolve, reject) => {
    const child = spawn(
      powerShell,
      [
        "-NoProfile",
        "-ExecutionPolicy",
        "Bypass",
        "-File",
        windowsSpeechScriptPath,
        "-AudioPath",
        mediaPath,
        "-Culture",
        windowsSpeechCulture(language),
      ],
      {
        cwd: staticRoot,
        stdio: ["ignore", "pipe", "pipe"],
        windowsHide: true,
      }
    );
    let stdout = "";
    let stderr = "";
    const timeout = setTimeout(() => {
      child.kill();
      reject(new Error("Windows Speech transcription timed out."));
    }, WINDOWS_SPEECH_TIMEOUT_MS);
    child.stdout.on("data", (chunk) => {
      stdout = `${stdout}${chunk.toString("utf8")}`.slice(-1024 * 1024);
    });
    child.stderr.on("data", (chunk) => {
      stderr = `${stderr}${chunk.toString("utf8")}`.slice(-12000);
    });
    child.on("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.on("close", (exitCode) => {
      clearTimeout(timeout);
      if (exitCode !== 0) {
        reject(new Error(shortText(stderr || stdout || `Windows Speech exited with code ${exitCode}`, 2000)));
        return;
      }
      const parsed = parseJsonBody(stdout);
      if (!parsed) {
        reject(new Error(shortText(stdout || stderr || "Windows Speech returned invalid JSON.", 2000)));
        return;
      }
      resolve(parsed);
    });
  });
}

async function transcribeMediaWithWindowsSpeech({ mediaPath, mediaFileName, mediaType, options = {} }) {
  if (!isWindowsWavInput(mediaPath, mediaType)) {
    throw new Error("Windows Speech fallback requires a WAV audio file. Attach the media file in the browser so KoeScribe can prepare WAV audio first.");
  }
  if (!fs.existsSync(windowsSpeechScriptPath)) {
    throw new Error(`Windows Speech helper script is missing: ${windowsSpeechScriptPath}`);
  }
  const result = await runWindowsSpeechScript({ mediaPath, language: options.language });
  const text = shortText(result && result.text ? result.text : "", 500000);
  const rawSegments = Array.isArray(result && result.segments) ? result.segments : [];
  return {
    text: text || "音声認識は完了しましたが、認識できる発話テキストはありませんでした。",
    segments: rawSegments.map((segment) => ({
      start: Number(segment && segment.start) || 0,
      end: Number(segment && segment.end) || 0,
      text: shortText(segment && segment.text ? segment.text : "", 4000),
    })).filter((segment) => segment.text),
    model: result && result.recognizer ? `windows-speech:${result.recognizer}` : "windows-speech",
    notes: result && result.warning ? String(result.warning) : "",
    mediaFileName,
  };
}

function normalizeCodexAppBaseUrl(value) {
  return String(value || CODEX_APP_BASE_URL).replace(/\/+$/, "");
}

async function getCodexAppRuntimeStatus(baseUrl = CODEX_APP_BASE_URL) {
  return requestJson({
    baseUrl: normalizeCodexAppBaseUrl(baseUrl),
    pathname: "/api/runtime",
    timeoutMs: 8000,
  });
}

function buildCodexAppTranscriptionPrompt({ mediaPath, mediaFileName, options }) {
  return [
    "KoeScribe transcription request.",
    "",
    "You are running inside Codex App Server. Do not ask the user for OPENAI_API_KEY.",
    "Use the available Codex runtime and local read access to produce the best possible transcript for the media file.",
    "If this Codex runtime cannot actually transcribe audio/video bytes, return status=blocked with a concise Japanese reason instead of pretending completion.",
    "",
    `Media path: ${mediaPath}`,
    `Media file name: ${mediaFileName}`,
    `Language: ${options.language || "ja"}`,
    `Quality: ${options.quality || "technical"}`,
    `Outputs: ${(options.outputs || []).join(", ")}`,
    "",
    "Glossary:",
    options.glossary || "(none)",
    "",
    "Return structured JSON only.",
  ].join("\n");
}

const codexTranscriptionSchema = Object.freeze({
  type: "object",
  additionalProperties: false,
  required: ["status", "transcript", "segments", "notes"],
  properties: {
    status: { type: "string", enum: ["completed", "blocked"] },
    transcript: { type: "string" },
    segments: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["start", "end", "text"],
        properties: {
          start: { type: "number" },
          end: { type: "number" },
          text: { type: "string" },
        },
      },
    },
    notes: { type: "string" },
  },
});

function extractFinalTextFromExecEvents(events) {
  const source = Array.isArray(events) ? events : [];
  let deltaText = "";
  let finalText = "";
  for (const event of source) {
    if (!event || typeof event !== "object") continue;
    if (event.type === "delta" && typeof event.text === "string") {
      deltaText += event.text;
      continue;
    }
    if (event.type === "delta" && typeof event.delta === "string") {
      deltaText += event.delta;
      continue;
    }
    if (event.type === "final") {
      if (typeof event.text === "string" && event.text.trim()) finalText = event.text;
      else if (event.final && typeof event.final.text === "string" && event.final.text.trim()) finalText = event.final.text;
      else if (typeof event.output === "string" && event.output.trim()) finalText = event.output;
    }
  }
  return shortText(finalText || deltaText, 500000);
}

function hasOpenAiApiKey() {
  return Boolean(String(process.env.OPENAI_API_KEY || "").trim());
}

function canUseWindowsSpeechFallback(mediaPath, mediaType, options = {}) {
  return (ALLOW_WINDOWS_SPEECH_FALLBACK || Boolean(options.allowWindowsSpeechFallback))
    && isWindowsWavInput(mediaPath, mediaType);
}

function buildHighAccuracyEngineUnavailableError({ codexAppBaseUrl, cause }) {
  return [
    "高精度の文字起こしエンジンが接続されていません。",
    "",
    "今回のような長尺の日本語・専門用語を含む動画では、Windows Speech の低精度フォールバックを成功扱いしません。",
    "",
    "使える経路:",
    "- Harnes / Codex App Server 側で KoeScribe app bridge を登録する",
    "- または OPENAI_API_KEY を設定して OpenAI Audio Transcriptions API を使う",
    "",
    `接続先: ${codexAppBaseUrl || CODEX_APP_BASE_URL}`,
    `OpenAI model: ${OPENAI_TRANSCRIPTION_MODEL}`,
    cause ? `原因: ${cause}` : "",
  ].filter(Boolean).join("\n");
}

async function transcribeWithOpenAiIfConfigured({ mediaPath, mediaFileName, mediaType, options = {} }) {
  if (typeof options.openAiClient === "function") {
    return options.openAiClient({ mediaPath, mediaFileName, mediaType, options });
  }
  if (!hasOpenAiApiKey()) return null;
  return transcribeMediaWithOpenAI({ mediaPath, mediaFileName, mediaType, options });
}

async function transcribeMediaViaCodexExec({ runtime, codexAppBaseUrl, mediaPath, mediaFileName, options = {} }) {
  const controlApi = runtime && runtime.controlApi && typeof runtime.controlApi === "object" ? runtime.controlApi : null;
  const token = controlApi && typeof controlApi.token === "string" ? controlApi.token.trim() : "";
  const tokenHeader = controlApi && typeof controlApi.tokenHeader === "string" && controlApi.tokenHeader.trim()
    ? controlApi.tokenHeader.trim()
    : "x-codex-control-token";
  if (!token) {
    throw new Error("Codex App Server runtime does not expose a control token for /api/exec fallback.");
  }
  const response = await requestNdjson({
    method: "POST",
    baseUrl: codexAppBaseUrl,
    pathname: "/api/exec",
    timeoutMs: 300000,
    headers: {
      [tokenHeader]: token,
      Origin: codexAppBaseUrl,
      Referer: `${codexAppBaseUrl}/`,
    },
    body: {
      prompt: [
        "KoeScribe transcription fallback request.",
        "",
        "Return only the transcript text. Do not ask for OPENAI_API_KEY.",
        "If you cannot inspect or transcribe the media file bytes in this Codex runtime, say exactly: BLOCKED_AUDIO_TRANSCRIPTION_UNAVAILABLE",
        "",
        `Media path: ${mediaPath}`,
        `Media file name: ${mediaFileName}`,
        `Language: ${options.language || "ja"}`,
        `Glossary: ${options.glossary || "(none)"}`,
      ].join("\n"),
      agentName: "default",
      sandboxMode: "workspace-write",
      approvalPolicy: "never",
      cwd: staticRoot,
      forceNewSession: true,
      requestUserInputPolicy: "blocked",
      disableSlashRouter: true,
      webSearch: false,
      modelReasoningEffort: "medium",
      executionProfile: "conversation-app-server",
      executionIntent: "koe-scribe-transcription",
      executionSource: "app_koe_scribe_standalone",
    },
  });
  const text = extractFinalTextFromExecEvents(response.events);
  if (!text || text.includes("BLOCKED_AUDIO_TRANSCRIPTION_UNAVAILABLE")) {
    throw new Error("Codex /api/exec fallback could not transcribe this media file.");
  }
  return {
    text,
    segments: [],
    model: "codex-app-exec",
  };
}

async function transcribeMediaWithCodexApp({ mediaPath, mediaFileName, mediaType, options = {} }) {
  const codexAppBaseUrl = normalizeCodexAppBaseUrl(options && options.codexAppBaseUrl);
  const localSpeechClient = typeof options.localSpeechClient === "function"
    ? options.localSpeechClient
    : transcribeMediaWithWindowsSpeech;
  const canUseLocalSpeech = canUseWindowsSpeechFallback(mediaPath, mediaType, options);
  const runLocalSpeech = () => localSpeechClient({ mediaPath, mediaFileName, mediaType, options });
  const runOpenAiIfConfigured = () => transcribeWithOpenAiIfConfigured({ mediaPath, mediaFileName, mediaType, options });
  let runtime;
  try {
    runtime = await getCodexAppRuntimeStatus(codexAppBaseUrl);
  } catch (error) {
    const openAiResult = await runOpenAiIfConfigured();
    if (openAiResult) return openAiResult;
    if (canUseLocalSpeech) return runLocalSpeech();
    throw new Error(buildHighAccuracyEngineUnavailableError({
      codexAppBaseUrl,
      cause: `Codex App Server connection failed: ${error && error.message ? error.message : String(error)}`,
    }));
  }

  if (!runtime || runtime.mode !== "app-server") {
    const openAiResult = await runOpenAiIfConfigured();
    if (openAiResult) return openAiResult;
    if (canUseLocalSpeech) return runLocalSpeech();
    throw new Error(buildHighAccuracyEngineUnavailableError({
      codexAppBaseUrl,
      cause: `runtime mode is ${runtime && runtime.mode ? runtime.mode : "unknown"}`,
    }));
  }

  const registeredApps = runtime && runtime.staticApps && Array.isArray(runtime.staticApps.apps)
    ? runtime.staticApps.apps
    : null;
  if (registeredApps && !registeredApps.some((app) => app && app.id === "koe-scribe")) {
    const openAiResult = await runOpenAiIfConfigured();
    if (openAiResult) return openAiResult;
    if (canUseLocalSpeech) return runLocalSpeech();
    throw new Error(buildHighAccuracyEngineUnavailableError({
      codexAppBaseUrl,
      cause: "KoeScribe app bridge is not registered.",
    }));
  }

  let response;
  try {
    response = await requestJson({
      method: "POST",
      baseUrl: codexAppBaseUrl,
      pathname: "/api/apps/koe-scribe/structured",
      timeoutMs: 300000,
      body: {
        prompt: buildCodexAppTranscriptionPrompt({ mediaPath, mediaFileName, options }),
        outputSchema: codexTranscriptionSchema,
        timeoutMs: 300000,
      },
    });
  } catch (error) {
    const openAiResult = await runOpenAiIfConfigured();
    if (openAiResult) return openAiResult;
    if (canUseLocalSpeech) return runLocalSpeech();
    throw new Error(buildHighAccuracyEngineUnavailableError({
      codexAppBaseUrl,
      cause: `KoeScribe app bridge failed: ${error && error.message ? error.message : String(error)}`,
    }));
  }

  const data = response && response.data && typeof response.data === "object" ? response.data : response;
  const status = String(data && data.status ? data.status : "").toLowerCase();
  if (status === "blocked") {
    const openAiResult = await runOpenAiIfConfigured();
    if (openAiResult) return openAiResult;
    if (canUseLocalSpeech) return runLocalSpeech();
    throw new Error(buildHighAccuracyEngineUnavailableError({
      codexAppBaseUrl,
      cause: data && data.notes ? data.notes : "Codex runtime returned blocked.",
    }));
  }
  return {
    text: data && typeof data.transcript === "string" ? data.transcript : "",
    segments: Array.isArray(data && data.segments) ? data.segments : [],
    model: "codex-app-structured",
    notes: data && typeof data.notes === "string" ? data.notes : "",
  };
}

function postOpenAiMultipart({ apiKey, fields, filePath, fileName, contentType }) {
  const boundary = `----koe-scribe-${crypto.randomBytes(16).toString("hex")}`;
  const endpoint = new URL(`${OPENAI_API_BASE_URL}/audio/transcriptions`);

  return new Promise((resolve, reject) => {
    const req = https.request(
      endpoint,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": `multipart/form-data; boundary=${boundary}`,
        },
      },
      (res) => {
        const chunks = [];
        let totalBytes = 0;
        res.on("data", (chunk) => {
          totalBytes += chunk.length;
          if (totalBytes <= MAX_BODY_BYTES * 10) chunks.push(chunk);
        });
        res.on("end", () => {
          const responseBody = Buffer.concat(chunks).toString("utf8");
          if ((res.statusCode || 500) >= 400) {
            reject(new Error(`OpenAI文字起こしに失敗しました: ${parseOpenAiError(res.statusCode, responseBody)}`));
            return;
          }
          try {
            resolve(JSON.parse(responseBody));
          } catch {
            resolve({ text: responseBody });
          }
        });
      }
    );

    req.on("error", reject);

    fields.forEach(([name, value]) => {
      if (value == null || value === "") return;
      req.write(`--${boundary}\r\n`);
      req.write(`Content-Disposition: form-data; name="${name}"\r\n\r\n`);
      req.write(`${value}\r\n`);
    });

    req.write(`--${boundary}\r\n`);
    req.write(`Content-Disposition: form-data; name="file"; filename="${fileName.replace(/"/g, "'")}"\r\n`);
    req.write(`Content-Type: ${contentType || "application/octet-stream"}\r\n\r\n`);

    const stream = fs.createReadStream(filePath);
    stream.on("error", reject);
    stream.on("end", () => {
      req.end(`\r\n--${boundary}--\r\n`);
    });
    stream.pipe(req, { end: false });
  });
}

async function transcribeMediaWithOpenAI({ mediaPath, mediaFileName, mediaType, options }) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error([
      "OPENAI_API_KEY が未設定です。",
      "KoeScribe で文字起こしを実行するには、この .bat を起動する環境に OpenAI API キーを設定してください。",
      "例: setx OPENAI_API_KEY \"sk-...\"",
      "設定後は KoeScribe の .bat を起動し直してください。",
    ].join("\n"));
  }

  const responseFormat = OPENAI_TRANSCRIPTION_MODEL === "whisper-1" ? "verbose_json" : "json";
  const fields = [
    ["model", OPENAI_TRANSCRIPTION_MODEL],
    ["response_format", responseFormat],
    ["prompt", buildTranscriptionPrompt(options)],
  ];
  if (options.language && options.language !== "auto") {
    fields.push(["language", options.language]);
  }
  if (OPENAI_TRANSCRIPTION_MODEL === "whisper-1") {
    fields.push(["timestamp_granularities[]", "segment"]);
  }

  return postOpenAiMultipart({
    apiKey,
    fields,
    filePath: mediaPath,
    fileName: mediaFileName,
    contentType: mediaType,
  });
}

function resolveTranscriptionClient(options = {}) {
  if (options.transcriptionClient) return options.transcriptionClient;
  if (options.openAiClient) return options.openAiClient;
  if (TRANSCRIPTION_PROVIDER === "windows-speech" || TRANSCRIPTION_PROVIDER === "local-windows-speech") {
    return transcribeMediaWithWindowsSpeech;
  }
  if (TRANSCRIPTION_PROVIDER === "direct-openai" || TRANSCRIPTION_PROVIDER === "openai") {
    return transcribeMediaWithOpenAI;
  }
  return transcribeMediaWithCodexApp;
}

async function runTranscriptionJob({ body, context, jobDir }) {
  const mediaPath = getMediaPathFromBody(body);
  if (!mediaPath) {
    throw new Error("文字起こし対象の動画または音声が見つかりません。動画を選択してから実行してください。");
  }
  if (!fs.existsSync(mediaPath)) {
    throw new Error(`文字起こし対象ファイルが見つかりません: ${mediaPath}`);
  }

  const options = getJobOptions(body);
  const uploadedMedia = body && body.uploadedMedia && typeof body.uploadedMedia === "object" ? body.uploadedMedia : {};
  const mediaFileName = getMediaFileName(body, mediaPath);
  const mediaType = uploadedMedia.mediaType || "application/octet-stream";
  const outputDir = resolveOutputDir(options, jobDir);
  const baseName = outputBaseName(mediaFileName);

  const transcription = await context.transcriptionClient({
    mediaPath,
    mediaFileName,
    mediaType,
    options,
  });

  const transcriptText = shortText(transcription && transcription.text ? transcription.text : "", 500000);
  const segments = normalizeSegments(transcription && transcription.segments, transcriptText);
  const transcriptionModel = shortText(
    transcription && transcription.model ? transcription.model : OPENAI_TRANSCRIPTION_MODEL,
    300
  ) || OPENAI_TRANSCRIPTION_MODEL;
  const generatedFiles = writeTranscriptFiles({
    outputDir,
    baseName,
    transcriptText,
    segments,
    outputs: options.outputs,
    model: transcriptionModel,
    mediaPath,
  });

  const jobSummary = [
    "文字起こしが完了しました。",
    "",
    "生成ファイル:",
    ...generatedFiles.map((file) => `- ${file}`),
    "",
    "品質メモ:",
    `- 使用モデル: ${transcriptionModel}`,
    `- 入力ファイル: ${mediaPath}`,
    `- 出力先: ${outputDir}`,
    segments.length ? `- 字幕用セグメント数: ${segments.length}` : "- 字幕用セグメントは取得できませんでした。",
    "",
    "文字起こし本文:",
    transcriptText || "(空の文字起こし結果です)",
  ].join("\n");

  return {
    transcriptText: transcriptText || "(空の文字起こし結果です)",
    generatedFiles,
    outputDir,
    transcriptionModel,
    segments,
    jobSummary,
  };
}

function buildRuntimePayload(context) {
  return {
    ok: true,
    mode: "app-server",
    app: "koe-scribe",
    defaultExecAgent: "koe-scribe-standalone",
    controlApi: {
      token: context.controlToken,
      tokenHeader: context.controlTokenHeader,
    },
    isolation: {
      mode: "standalone",
      sharedHarness: false,
      sharedAppRegistry: false,
      sharedApiExec: false,
      portSelection: context.portSelection,
      host: context.host,
      port: context.actualPort || 0,
      runtimeRoot: context.runtimeRoot,
      instanceId: context.instanceId,
      uploadMaxBytes: MAX_UPLOAD_BYTES,
      transcriptionProvider: TRANSCRIPTION_PROVIDER === "direct-openai" || TRANSCRIPTION_PROVIDER === "openai" ? "direct-openai" : "codex-app",
      codexAppBaseUrl: CODEX_APP_BASE_URL,
      transcriptionModel: OPENAI_TRANSCRIPTION_MODEL,
      openAiConfigured: hasOpenAiApiKey(),
      windowsSpeechFallbackEnabled: ALLOW_WINDOWS_SPEECH_FALLBACK,
    },
  };
}

function createContext(options = {}) {
  const envPort = process.env.CODEX_KOE_SCRIBE_PORT;
  const port = normalizePort(options.portOverride != null ? options.portOverride : envPort, 0);
  const host = normalizeHost(options.hostOverride || process.env.CODEX_KOE_SCRIBE_HOST);
  const instanceId = `koe-${process.pid}-${Date.now().toString(36)}-${crypto.randomBytes(4).toString("hex")}`;
  const runtimeRoot = path.join(staticRoot, ".runtime", instanceId);

  return {
    actualPort: 0,
    controlToken: `koe-${crypto.randomBytes(18).toString("hex")}`,
    controlTokenHeader: "x-koe-scribe-control-token",
    host,
    instanceId,
    openBrowser: options.openBrowserOverride != null
      ? Boolean(options.openBrowserOverride)
      : (!Boolean(options.quiet) && normalizeBooleanFlag(process.env.CODEX_KOE_SCRIBE_OPEN_BROWSER, true)),
    transcriptionClient: resolveTranscriptionClient(options),
    port,
    portSelection: port === 0 ? "auto" : "fixed",
    quiet: Boolean(options.quiet),
    runtimeRoot,
    url: "",
  };
}

function writeInstanceFile(context) {
  fs.mkdirSync(context.runtimeRoot, { recursive: true });
  fs.writeFileSync(
    path.join(context.runtimeRoot, "instance.json"),
    JSON.stringify(
      {
        app: "koe-scribe",
        instanceId: context.instanceId,
        url: context.url,
        host: context.host,
        port: context.actualPort,
        portSelection: context.portSelection,
        sharedHarness: false,
        startedAt: new Date().toISOString(),
      },
      null,
      2
    )
  );
}

function findEdgeExecutable() {
  if (process.platform !== "win32") return "";
  const candidates = [
    process.env.EDGE_PATH,
    "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  ].filter(Boolean);
  return candidates.find((candidate) => fs.existsSync(candidate)) || "";
}

function openUrlInEdge(url) {
  if (process.platform !== "win32") return false;
  const edgePath = findEdgeExecutable();
  try {
    const child = edgePath
      ? spawn(edgePath, [url], { detached: true, stdio: "ignore", windowsHide: true })
      : spawn("cmd.exe", ["/c", "start", "", "msedge", url], { detached: true, stdio: "ignore", windowsHide: true });
    child.unref();
    return true;
  } catch {
    return false;
  }
}

function createStandaloneServer(options = {}) {
  const context = createContext(options);
  const server = http.createServer(async (req, res) => {
    const requestUrl = new URL(req.url || "/", `http://${req.headers.host || `${context.host}:${context.port || 0}`}`);

    if (req.method === "OPTIONS") {
      res.writeHead(204, {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET,HEAD,POST,OPTIONS",
        "Access-Control-Allow-Headers": `Content-Type, ${context.controlTokenHeader}, x-koe-scribe-file-name, x-koe-scribe-file-type, x-koe-scribe-file-size`,
        "Access-Control-Max-Age": "86400",
      });
      res.end();
      return;
    }

    if (requestUrl.pathname === "/healthz") {
      sendJson(res, 200, {
        ok: true,
        mode: "koe-scribe-standalone",
        isolation: buildRuntimePayload(context).isolation,
      });
      return;
    }

    if (requestUrl.pathname === "/api/runtime" && req.method === "GET") {
      sendJson(res, 200, buildRuntimePayload(context));
      return;
    }

    if (requestUrl.pathname === "/api/media/upload" && req.method === "POST") {
      const token = String(req.headers[context.controlTokenHeader] || "");
      if (token !== context.controlToken) {
        sendJson(res, 401, { ok: false, error: "Invalid KoeScribe control token." });
        return;
      }
      await handleMediaUpload(req, res, context);
      return;
    }

    if (requestUrl.pathname === "/api/exec" && req.method === "POST") {
      const token = String(req.headers[context.controlTokenHeader] || "");
      if (token !== context.controlToken) {
        sendJson(res, 401, { ok: false, error: "Invalid KoeScribe control token." });
        return;
      }

      try {
        const body = await collectRequestJson(req);
        const runId = `run-${Date.now().toString(36)}-${crypto.randomBytes(4).toString("hex")}`;
        const jobDir = ensureJobDir(context, runId);
        const result = await runTranscriptionJob({ body, context, jobDir });
        const finalText = typeof result === "string"
          ? result
          : shortText(result && result.transcriptText ? result.transcriptText : "", 500000);
        sendNdjson(res, 200, [
          { type: "status", status: "standalone_isolated" },
          {
            type: "status",
            status: "transcription_completed",
            generatedFiles: result && Array.isArray(result.generatedFiles) ? result.generatedFiles : [],
          },
          { type: "final", text: finalText },
        ]);
      } catch (error) {
        sendNdjson(res, 200, [
          { type: "error", text: error && error.message ? error.message : "Invalid request." },
        ]);
      }
      return;
    }

    if (requestUrl.pathname.startsWith("/api/")) {
      sendJson(res, 404, { ok: false, error: "Unknown KoeScribe standalone API route." });
      return;
    }

    if (req.method !== "GET" && req.method !== "HEAD") {
      sendJson(res, 405, { ok: false, error: "Method not allowed." });
      return;
    }

    serveStatic(req, res, requestUrl);
  });

  server.on("listening", () => {
    const address = server.address();
    context.actualPort = address && typeof address === "object" ? address.port : context.port;
    context.url = `http://${context.host}:${context.actualPort}/`;
    writeInstanceFile(context);
    if (!context.quiet) {
      console.log("[koe-scribe] isolated standalone server");
      console.log(`[koe-scribe] URL: ${context.url}`);
      console.log("[koe-scribe] shared harness dispatch: disabled");
      console.log("[koe-scribe] Press Ctrl+C in this window to stop the server.");
    }
    if (context.openBrowser) {
      const opened = openUrlInEdge(context.url);
      if (!context.quiet) {
        console.log(`[koe-scribe] Edge launch: ${opened ? "requested" : "skipped"}`);
      }
    }
  });

  server.on("clientError", (error, socket) => {
    if (socket.writable) {
      socket.end("HTTP/1.1 400 Bad Request\r\n\r\n");
    }
    if (error && error.code !== "ECONNRESET" && !context.quiet) {
      console.error("[koe-scribe] client error:", error.message);
    }
  });

  server.koeScribeContext = context;
  return server;
}

function startServer(options = {}) {
  const server = createStandaloneServer(options);
  const context = server.koeScribeContext;
  server.listen(context.port, context.host);
  return server;
}

function shutdown(server, signal) {
  server.close(() => {
    console.log(`[koe-scribe] shutdown via ${signal}`);
    process.exit(0);
  });
}

if (require.main === module) {
  const server = startServer();
  process.on("SIGINT", () => shutdown(server, "SIGINT"));
  process.on("SIGTERM", () => shutdown(server, "SIGTERM"));
}

module.exports = {
  buildRuntimePayload,
  createStandaloneServer,
  isPathWithin,
  normalizePort,
  runTranscriptionJob,
  resolveStaticPath,
  safeDecodeURIComponent,
  startServer,
  staticRoot,
  transcribeMediaWithCodexApp,
  transcribeMediaWithOpenAI,
};
