"use strict";

const fs = require("fs");
const http = require("http");
const https = require("https");
const os = require("os");
const path = require("path");
const crypto = require("crypto");
const { spawn } = require("child_process");
const { URL } = require("url");

const host = process.env.PRESENTATION_AI_HOST || "127.0.0.1";
const port = normalizePort(process.env.PRESENTATION_AI_PORT, 57536);
const staticRoot = __dirname;
const maxJsonBodyBytes = 512 * 1024;
const codexExecModel = sanitizeInlineText(process.env.PRESENTATION_AI_CODEX_MODEL, 80) || "gpt-5.4";
const codexExecTimeoutMs = normalizeTimeout(process.env.PRESENTATION_AI_CODEX_TIMEOUT_MS, 300000);
const maxConcurrentCodexRuns = normalizeConcurrentRuns(process.env.PRESENTATION_AI_MAX_CONCURRENT_RUNS, 2);
const kokoroBaseUrl = normalizeBaseUrl(process.env.PRESENTATION_AI_KOKORO_API_BASE_URL || "http://127.0.0.1:8880");
const harnessBaseUrl = normalizeBaseUrl(process.env.PRESENTATION_AI_HARNESS_BASE_URL || "");
const preferHarnessRuntime = normalizeBoolean(process.env.PRESENTATION_AI_USE_HARNESS, Boolean(harnessBaseUrl));
const kokoroDefaultModel = sanitizeInlineText(process.env.PRESENTATION_AI_KOKORO_MODEL, 80) || "kokoro";
const kokoroDefaultVoice = sanitizeInlineText(process.env.PRESENTATION_AI_KOKORO_VOICE, 80) || "jf_alpha";
const kokoroDefaultLangCode = sanitizeInlineText(process.env.PRESENTATION_AI_KOKORO_LANG_CODE, 8) || "j";
const kokoroDefaultSpeed = normalizeFloat(process.env.PRESENTATION_AI_KOKORO_SPEED, 1);
const evaluationSchemaPath = path.join(staticRoot, "schemas", "presentation-evaluation.schema.json");
const chatSchemaPath = path.join(staticRoot, "schemas", "presentation-chat.schema.json");

const mimeTypes = Object.freeze({
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".mjs": "application/javascript; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".txt": "text/plain; charset=utf-8",
  ".wav": "audio/wav",
});

function normalizePort(value, fallback) {
  const parsed = Number.parseInt(String(value || "").trim(), 10);
  if (!Number.isFinite(parsed) || parsed <= 0 || parsed > 65535) return fallback;
  return parsed;
}

function normalizeTimeout(value, fallback) {
  const parsed = Number.parseInt(String(value || "").trim(), 10);
  if (!Number.isFinite(parsed) || parsed < 5000) return fallback;
  return Math.min(parsed, 300000);
}

function normalizeFloat(value, fallback) {
  const parsed = Number.parseFloat(String(value || "").trim());
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(0.5, Math.min(2, parsed));
}

function normalizeBoolean(value, fallback = false) {
  if (typeof value === "boolean") return value;
  if (value === undefined || value === null || String(value).trim() === "") return fallback;
  const normalized = String(value).trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
}

function normalizeConcurrentRuns(value, fallback) {
  const parsed = Number.parseInt(String(value || "").trim(), 10);
  if (!Number.isFinite(parsed) || parsed < 1) return fallback;
  return Math.min(parsed, 8);
}

function sanitizeInlineText(value, maxLength = 200) {
  const normalized = String(value || "").replace(/\s+/g, " ").trim();
  if (!normalized) return "";
  return normalized.length > maxLength ? normalized.slice(0, maxLength) : normalized;
}

function sanitizeMultilineText(value, maxLength = 24000) {
  const normalized = String(value || "")
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  if (!normalized) return "";
  return normalized.length > maxLength ? normalized.slice(0, maxLength) : normalized;
}

function normalizeBaseUrl(value) {
  const raw = sanitizeInlineText(value, 320) || "http://127.0.0.1:8880";
  try {
    const parsed = new URL(raw);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return "http://127.0.0.1:8880";
    }
    return `${parsed.protocol}//${parsed.host}`;
  } catch {
    return "http://127.0.0.1:8880";
  }
}

function sendJson(res, statusCode, payload, extraHeaders = {}) {
  const body = Buffer.from(JSON.stringify(payload), "utf8");
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": body.length,
    "Cache-Control": "no-store",
    ...extraHeaders,
  });
  res.end(body);
}

function readRequestBody(req, maxBytes = maxJsonBodyBytes) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let totalBytes = 0;
    req.on("data", (chunk) => {
      const piece = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      totalBytes += piece.length;
      if (totalBytes > maxBytes) {
        const error = new Error(`request body exceeds ${maxBytes} bytes`);
        error.statusCode = 413;
        reject(error);
        req.destroy();
        return;
      }
      chunks.push(piece);
    });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

async function readJsonBody(req) {
  const raw = await readRequestBody(req);
  if (!raw.length) return {};
  return JSON.parse(raw.toString("utf8"));
}

function contentTypeFor(filePath) {
  const extension = path.extname(filePath).toLowerCase();
  return mimeTypes[extension] || "application/octet-stream";
}

function resolveStaticPath(requestPath) {
  const decoded = decodeURIComponent(requestPath || "/");
  const normalized = decoded === "/" ? "/index.html" : decoded;
  const relativePath = normalized.replace(/^\/+/, "");
  const candidatePath = path.resolve(staticRoot, relativePath);
  if (!candidatePath.startsWith(staticRoot)) return null;
  return candidatePath;
}

function serveStatic(req, res, requestUrl) {
  const filePath = resolveStaticPath(requestUrl.pathname);
  if (!filePath) {
    sendJson(res, 400, { ok: false, error: "Invalid path." });
    return;
  }
  fs.stat(filePath, (error, stats) => {
    if (error || !stats.isFile()) {
      sendJson(res, 404, { ok: false, error: "Not found." });
      return;
    }
    const headers = {
      "Content-Type": contentTypeFor(filePath),
      "Content-Length": stats.size,
      "Cache-Control": "no-store",
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

function analyzeTranscript(text, durationSec = 0) {
  const normalized = sanitizeMultilineText(text, 24000);
  const charCount = normalized.length;
  const sentenceCount = (normalized.match(/[。！？!?]/g) || []).length;
  const fillerDefinitions = [
    { label: "えーと", regex: /えーと/g },
    { label: "えっと", regex: /えっと/g },
    { label: "あの", regex: /あの/g },
    { label: "その", regex: /そのー?/g },
    { label: "なんか", regex: /なんか/g },
    { label: "um", regex: /\bum\b/gi },
    { label: "uh", regex: /\buh\b/gi },
  ];
  const fillerHits = fillerDefinitions
    .map((item) => ({ label: item.label, count: (normalized.match(item.regex) || []).length }))
    .filter((item) => item.count > 0)
    .sort((left, right) => right.count - left.count);
  const structureMarkers = ["結論", "まず", "次に", "最後に", "一方で", "例えば", "要するに", "つまり", "なぜなら"];
  const structureHits = structureMarkers
    .map((marker) => ({ marker, count: (normalized.match(new RegExp(marker, "g")) || []).length }))
    .filter((item) => item.count > 0);
  const repeatedPhrases = findRepeatedPhrases(normalized);
  const charsPerMinute = durationSec > 0 ? Math.round(charCount / (durationSec / 60)) : null;
  return {
    charCount,
    sentenceCount,
    fillerCount: fillerHits.reduce((sum, item) => sum + item.count, 0),
    fillerHits,
    structureHits,
    repeatedPhrases,
    durationSec: Number.isFinite(Number(durationSec)) ? Math.max(0, Math.trunc(Number(durationSec))) : 0,
    charsPerMinute,
  };
}

function findRepeatedPhrases(text) {
  const rawTokens = text.match(/[一-龠ぁ-んァ-ヴーA-Za-z0-9]{2,}/g) || [];
  const stopWords = new Set(["です", "ます", "こと", "それ", "これ", "ため", "ので", "よう", "して", "ある", "いる", "なる", "the", "and", "that", "this"]);
  const counts = new Map();
  rawTokens.forEach((token) => {
    const normalized = token.toLowerCase();
    if (stopWords.has(normalized)) return;
    counts.set(normalized, (counts.get(normalized) || 0) + 1);
  });
  return Array.from(counts.entries())
    .filter((entry) => entry[1] >= 2)
    .sort((left, right) => right[1] - left[1])
    .slice(0, 8)
    .map(([phrase, count]) => ({ phrase, count }));
}

function buildEvaluationPrompt({ scenario, transcript, metrics }) {
  const scenarioSummary = {
    category: sanitizeInlineText(scenario.category, 80) || "自由テーマ",
    title: sanitizeInlineText(scenario.title, 180) || "未設定",
    audience: sanitizeInlineText(scenario.audience, 180) || "未設定",
    goal: sanitizeMultilineText(scenario.goal, 1000) || "未設定",
    durationSec: metrics.durationSec,
  };
  return [
    "あなたは日本語のプレゼン指導に特化したコーチです。",
    "役割は、単なる感想ではなく、なぜ伝わりにくかったのかの本質を見抜き、改善の優先順位と練習方法まで示すことです。",
    "重要ルール:",
    "- 文字起こしには軽微な音声認識ミスが混じる前提で判断する。",
    "- 指摘は厳密だが建設的に行う。",
    "- 何が良かったかと、何が致命的だったかを分けて書く。",
    "- 弱点は『なぜその話し方だと伝わらないのか』まで踏み込む。",
    "- 改善策はすぐ実践できる順序で出す。",
    "- 根拠は transcript または metrics から拾う。",
    "",
    `発表条件: ${JSON.stringify(scenarioSummary, null, 2)}`,
    `客観メトリクス: ${JSON.stringify(metrics, null, 2)}`,
    "以下が発表の文字起こしです。",
    "<transcript>",
    transcript,
    "</transcript>",
    "この内容を分析し、与えられた JSON Schema に厳密に従って日本語で返してください。",
    "spokenFeedback は 120〜220 文字程度で、音声読み上げに向いた自然な日本語にしてください。",
    "improvedOpening は 2〜5 文程度で、冒頭の言い換え例としてそのまま練習できる文章にしてください。",
  ].join("\n");
}

function buildChatPrompt({ scenario, transcript, evaluation, question, history }) {
  const historyLines = Array.isArray(history)
    ? history.slice(-8).map((item) => `${item.role === "assistant" ? "AI" : "User"}: ${sanitizeMultilineText(item.text, 800)}`)
    : [];
  return [
    "あなたは日本語のプレゼン指導コーチです。",
    "ユーザーはすでに発表し、あなたは講評を返しています。これからは追質問に答えます。",
    "重要ルール:",
    "- 回答は具体的に、すぐ試せる形で返す。",
    "- transcript と evaluation を踏まえて答える。",
    "- 必要なら短い言い換え例を入れる。",
    "- ただし説教調にはしない。",
    "",
    `発表条件: ${JSON.stringify({
      category: sanitizeInlineText(scenario.category, 80),
      title: sanitizeInlineText(scenario.title, 180),
      audience: sanitizeInlineText(scenario.audience, 180),
      goal: sanitizeMultilineText(scenario.goal, 800),
    }, null, 2)}`,
    `既存の講評: ${JSON.stringify(evaluation, null, 2)}`,
    "<transcript>",
    transcript,
    "</transcript>",
    historyLines.length ? `会話履歴:\n${historyLines.join("\n")}` : "会話履歴: なし",
    `今回の質問: ${question}`,
    "JSON Schema に厳密に従って日本語で返してください。",
    "reply は 4〜8 文程度、spokenReply は 80〜180 文字程度で読み上げやすくしてください。",
  ].join("\n");
}

function buildEvaluationPromptV2({ scenario, transcript, metrics }) {
  const scenarioSummary = {
    category: sanitizeInlineText(scenario.category, 80) || "自由テーマ",
    title: sanitizeInlineText(scenario.title, 180) || "未設定",
    audience: sanitizeInlineText(scenario.audience, 180) || "未設定",
    goal: sanitizeMultilineText(scenario.goal, 1000) || "未設定",
    durationSec: metrics.durationSec,
  };
  return [
    "あなたは日本語のプレゼン上達AIです。",
    "役割は、単なる感想ではなく、ユーザーが扱う作品や題材を調べたうえで、なぜ伝わりにくかったのかの本質と改善順序まで示すことです。",
    "必須ルール:",
    "- まず題材を理解してください。映画、アニメ、小説、ゲーム、実在企業、業界テーマ、製品、制度など、外部に既知の対象だと判断できるなら、利用可能な検索・参照手段で短くても実際に調べてください。",
    "- 調べた結果は、一般に確認できる事実と、ユーザー自身の解釈や語り方を分けて扱ってください。確信が持てない点は断定せず、不確実だと明記してください。",
    "- workResearch では、何を根拠に理解したか、作品や題材の核、発表内容とのズレを具体的に書いてください。外部調査できない題材なら、そのことを明記したうえで transcript 由来の理解を書くこと。",
    "- presenterAnalysis では、『この人はなぜ下手に見えるのか』を、本質的に分析してください。ただし人格攻撃や病名推定はせず、準備不足、観客想定の甘さ、論点設計、具体化不足、情報圧縮の癖、前提共有の甘さなど、発表技術と思考の癖として記述してください。",
    "- 厳しさは保ちつつ、改善可能な言い方にしてください。甘く褒めて終わらせないでください。",
    "- すべて transcript と metrics と調査内容に根拠を置いてください。",
    "",
    `発表条件: ${JSON.stringify(scenarioSummary, null, 2)}`,
    `話し方メトリクス: ${JSON.stringify(metrics, null, 2)}`,
    "以下が発表の書き起こしです。",
    "<transcript>",
    transcript,
    "</transcript>",
    "この内容を分析し、与えられた JSON Schema に厳密に従って日本語で返してください。",
    "spokenFeedback は 120〜220 文字で、調査した題材理解と本人の本質課題を一息で伝える短い講評にしてください。",
    "improvedOpening は 2〜4 文で、題材理解が深いと伝わる冒頭の言い換えにしてください。",
  ].join("\n");
}

function buildChatPromptV2({ scenario, transcript, evaluation, question, history }) {
  const historyLines = Array.isArray(history)
    ? history.slice(-8).map((item) => `${item.role === "assistant" ? "AI" : "User"}: ${sanitizeMultilineText(item.text, 800)}`)
    : [];
  return [
    "あなたは日本語のプレゼン上達AIです。",
    "ユーザーはすでに発表し、あなたは講評を返しています。これからは追質問に答えます。",
    "必須ルール:",
    "- 既存の evaluation の workResearch と presenterAnalysis を必ず踏まえて答えてください。",
    "- 作品や題材の事実確認が必要な質問では、利用可能な検索・参照手段で短く確認してから答えてください。",
    "- 回答は具体的に、厳しくても改善可能な形で答えてください。",
    "- 本人分析をするときは固定人格ではなく、現在の話し方の癖、準備の癖、観客設計の甘さとして説明してください。",
    "",
    `発表条件: ${JSON.stringify({
      category: sanitizeInlineText(scenario.category, 80),
      title: sanitizeInlineText(scenario.title, 180),
      audience: sanitizeInlineText(scenario.audience, 180),
      goal: sanitizeMultilineText(scenario.goal, 800),
    }, null, 2)}`,
    `既存の講評: ${JSON.stringify(evaluation, null, 2)}`,
    "<transcript>",
    transcript,
    "</transcript>",
    historyLines.length ? `会話履歴:\n${historyLines.join("\n")}` : "会話履歴: なし",
    `今回の質問: ${question}`,
    "JSON Schema に厳密に従って日本語で返してください。",
    "reply は 4〜8 文、spokenReply は 80〜180 文字で読み上げやすい自然な日本語にしてください。",
  ].join("\n");
}

function resolveWindowsCodexDirectInvocation() {
  const appData = process.env.APPDATA || "";
  if (!appData) return null;
  const cmdPath = path.join(appData, "npm", "codex.cmd");
  if (!fs.existsSync(cmdPath)) return null;
  try {
    const cmdSource = fs.readFileSync(cmdPath, "utf8");
    const rootMatch = cmdSource.match(/SET\s+"CODEX_ROOT=([^"\r\n]+)"/i);
    const jsMatch = cmdSource.match(/"([^"\r\n]+node_modules\\@openai\\codex\\bin\\codex\.js)"/i);
    const codexRoot = rootMatch ? rootMatch[1] : "";
    const codexJsPath = jsMatch ? jsMatch[1] : "";
    const nodeExePath = codexRoot ? path.join(codexRoot, "node.exe") : "";
    if (codexJsPath && fs.existsSync(codexJsPath)) {
      return {
        command: nodeExePath && fs.existsSync(nodeExePath) ? nodeExePath : "node",
        argsPrefix: [codexJsPath],
      };
    }
  } catch {
  }
  return null;
}

function resolveCodexInvocation() {
  if (process.platform === "win32") {
    const directInvocation = resolveWindowsCodexDirectInvocation();
    if (directInvocation) {
      return directInvocation;
    }
  }
  return {
    command: "codex",
    argsPrefix: [],
  };
}

let codexReadyCache = null;
let activeCodexRuns = 0;

function tryAcquireCodexSlot() {
  if (activeCodexRuns >= maxConcurrentCodexRuns) return null;
  activeCodexRuns += 1;
  return () => {
    activeCodexRuns = Math.max(0, activeCodexRuns - 1);
  };
}

async function assertCodexReady() {
  if (codexReadyCache) return codexReadyCache;
  codexReadyCache = new Promise((resolve, reject) => {
    const invocation = resolveCodexInvocation();
    const child = spawn(invocation.command, [...invocation.argsPrefix, "--version"], {
      cwd: staticRoot,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    let stderr = "";
    child.stderr.on("data", (chunk) => {
      stderr = `${stderr}${String(chunk)}`.slice(-2000);
    });
    child.on("error", reject);
    child.on("close", (exitCode) => {
      if (exitCode === 0) {
        resolve(true);
        return;
      }
      reject(new Error(sanitizeInlineText(stderr, 240) || "codex command is unavailable"));
    });
  }).catch((error) => {
    codexReadyCache = null;
    throw error;
  });
  return codexReadyCache;
}

async function runCodexWithSchema({ schemaPath, prompt, signal }) {
  await assertCodexReady();
  if (signal && signal.aborted) {
    const error = new Error("request aborted");
    error.statusCode = 499;
    throw error;
  }
  const outputFilePath = path.join(os.tmpdir(), `presentation-ai-${crypto.randomUUID()}.json`);
  const invocation = resolveCodexInvocation();
  const args = [
    ...invocation.argsPrefix,
    "exec",
    "-C",
    staticRoot,
    "--skip-git-repo-check",
    "--sandbox",
    "read-only",
    "--color",
    "never",
    "--ephemeral",
    "--output-schema",
    schemaPath,
    "-o",
    outputFilePath,
    "-m",
    codexExecModel,
  ];

  return new Promise((resolve, reject) => {
    const child = spawn(invocation.command, args, {
      cwd: staticRoot,
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
    });
    let stdout = "";
    let stderr = "";
    let settled = false;
    let abortHandler = null;

    const finish = (error, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutId);
      if (signal && abortHandler && typeof signal.removeEventListener === "function") {
        signal.removeEventListener("abort", abortHandler);
      }
      if (error) {
        reject(error);
        return;
      }
      resolve(value);
    };

    const timeoutId = setTimeout(() => {
      child.kill();
      finish(new Error(`codex exec timed out after ${codexExecTimeoutMs}ms`));
    }, codexExecTimeoutMs);

    child.stdout.on("data", (chunk) => {
      stdout = `${stdout}${String(chunk)}`.slice(-12000);
    });
    child.stderr.on("data", (chunk) => {
      stderr = `${stderr}${String(chunk)}`.slice(-12000);
    });

    child.on("error", (error) => {
      finish(error);
    });

    abortHandler = () => {
      child.kill();
      const error = new Error("request aborted");
      error.statusCode = 499;
      finish(error);
    };
    if (signal && typeof signal.addEventListener === "function") {
      signal.addEventListener("abort", abortHandler, { once: true });
    }

    try {
      child.stdin.write(prompt, "utf8");
      child.stdin.end();
    } catch (error) {
      finish(error);
    }

    child.on("close", async (exitCode) => {
      if (settled) return;
      try {
        const raw = await fs.promises.readFile(outputFilePath, "utf8");
        const parsed = JSON.parse(raw);
        await fs.promises.unlink(outputFilePath).catch(() => {});
        if (exitCode !== 0) {
          const error = new Error(sanitizeInlineText(stderr || stdout, 400) || `codex exec failed with exit code ${exitCode}`);
          error.statusCode = 502;
          throw error;
        }
        finish(null, parsed);
      } catch (error) {
        await fs.promises.unlink(outputFilePath).catch(() => {});
        const wrapped = new Error(
          sanitizeInlineText(`${error && error.message ? error.message : "codex exec failed"} ${stderr || stdout}`, 420) || "codex exec failed"
        );
        wrapped.statusCode = 502;
        finish(wrapped);
      }
    });
  });
}

function createRuntimeAbortSignal(signal) {
  const timeoutSignal = AbortSignal.timeout(codexExecTimeoutMs);
  if (!signal) return timeoutSignal;
  if (typeof AbortSignal.any === "function") {
    return AbortSignal.any([signal, timeoutSignal]);
  }
  return signal;
}

async function probeHarnessRuntime() {
  if (!preferHarnessRuntime || !harnessBaseUrl) {
    return {
      enabled: false,
      ready: false,
      provider: "",
      model: "",
      error: "",
    };
  }

  try {
    const response = await fetch(`${harnessBaseUrl}/api/apps/presentation-coach/runtime`, {
      method: "GET",
      signal: AbortSignal.timeout(3500),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      return {
        enabled: true,
        ready: false,
        provider: "",
        model: "",
        error: sanitizeInlineText(data?.error || `Harness runtime probe failed with status ${response.status}`, 180),
      };
    }
    return {
      enabled: true,
      ready: Boolean(data?.ai?.ready),
      provider: sanitizeInlineText(data?.ai?.provider, 80),
      model: sanitizeInlineText(data?.ai?.model, 80),
      error: data?.ai?.ready ? "" : sanitizeInlineText(data?.ai?.error || "Harness runtime is unavailable.", 180),
    };
  } catch (error) {
    return {
      enabled: true,
      ready: false,
      provider: "",
      model: "",
      error: sanitizeInlineText(error && error.message ? error.message : "Harness runtime is unavailable.", 180),
    };
  }
}

async function runHarnessWithSchema({ schemaPath, prompt, signal }) {
  if (!harnessBaseUrl) {
    throw new Error("Harness base URL is not configured.");
  }
  const outputSchema = JSON.parse(await fs.promises.readFile(schemaPath, "utf8"));
  const response = await fetch(`${harnessBaseUrl}/api/apps/presentation-coach/structured`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json; charset=utf-8",
    },
    body: JSON.stringify({
      prompt,
      model: codexExecModel,
      outputSchema,
      timeoutMs: codexExecTimeoutMs,
    }),
    signal: createRuntimeAbortSignal(signal),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(sanitizeInlineText(data?.error || `Harness runtime failed with status ${response.status}`, 240));
    error.statusCode = 502;
    throw error;
  }
  return {
    data: data?.data,
    model: sanitizeInlineText(data?.model, 80) || codexExecModel,
    provider: "harness-codex-exec",
  };
}

async function runStructuredAiTask({ schemaPath, prompt, signal }) {
  if (preferHarnessRuntime && harnessBaseUrl) {
    try {
      return await runHarnessWithSchema({ schemaPath, prompt, signal });
    } catch (_error) {
    }
  }
  return {
    data: await runCodexWithSchema({ schemaPath, prompt, signal }),
    model: codexExecModel,
    provider: "codex-exec",
  };
}

function requestKokoroSpeech({ text, model, voice, langCode, speed } = {}) {
  return new Promise((resolve, reject) => {
    let endpointUrl;
    try {
      endpointUrl = new URL("/v1/audio/speech", kokoroBaseUrl);
    } catch {
      reject(new Error("Kokoro endpoint URL is invalid."));
      return;
    }

    const payload = {
      model: sanitizeInlineText(model, 80) || kokoroDefaultModel,
      input: sanitizeMultilineText(text, 24000),
      voice: sanitizeInlineText(voice, 80) || kokoroDefaultVoice,
      response_format: "mp3",
      stream: false,
    };
    const normalizedLangCode = sanitizeInlineText(langCode, 8) || kokoroDefaultLangCode;
    if (normalizedLangCode) payload.lang_code = normalizedLangCode;
    if (Number.isFinite(Number(speed))) {
      payload.speed = Math.max(0.5, Math.min(2, Number(speed)));
    }

    const requestBody = Buffer.from(JSON.stringify(payload), "utf8");
    const transport = endpointUrl.protocol === "https:" ? https : http;
    const request = transport.request({
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
          resolve({
            audio: bodyBuffer,
            contentType: sanitizeInlineText(upstream.headers["content-type"], 120) || "audio/mpeg",
          });
          return;
        }
        const rawBody = sanitizeMultilineText(bodyBuffer.toString("utf8"), 1200);
        reject(new Error(rawBody || `Kokoro upstream failed (HTTP ${statusCode}).`));
      });
    });

    request.setTimeout(45000, () => {
      request.destroy(new Error("Kokoro upstream timed out."));
    });
    request.on("error", reject);
    request.write(requestBody);
    request.end();
  });
}

function probeKokoroRuntime() {
  return new Promise((resolve) => {
    let endpointUrl;
    try {
      endpointUrl = new URL("/v1/models", kokoroBaseUrl);
    } catch {
      resolve({ reachable: false, error: "Kokoro URL is invalid." });
      return;
    }

    const transport = endpointUrl.protocol === "https:" ? https : http;
    const request = transport.request({
      protocol: endpointUrl.protocol,
      hostname: endpointUrl.hostname,
      port: endpointUrl.port ? Number(endpointUrl.port) : undefined,
      path: `${endpointUrl.pathname}${endpointUrl.search}`,
      method: "GET",
    }, (upstream) => {
      const chunks = [];
      upstream.on("data", (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
      upstream.on("end", () => {
        const statusCode = Number.isFinite(Number(upstream.statusCode)) ? Math.trunc(Number(upstream.statusCode)) : 0;
        if (statusCode >= 200 && statusCode < 300) {
          resolve({ reachable: true, error: "" });
          return;
        }
        resolve({ reachable: false, error: `HTTP ${statusCode}` });
      });
    });
    request.setTimeout(2500, () => {
      request.destroy(new Error("Kokoro runtime probe timed out."));
    });
    request.on("error", (error) => {
      resolve({
        reachable: false,
        error: sanitizeInlineText(error && error.message ? error.message : "Kokoro probe failed", 180),
      });
    });
    request.end();
  });
}

async function handleRuntime(res) {
  const harness = await probeHarnessRuntime();
  if (harness.ready) {
    const kokoro = await probeKokoroRuntime();
    sendJson(res, 200, {
      ok: true,
      ai: {
        ready: true,
        provider: harness.provider || "harness-codex-exec",
        model: harness.model || codexExecModel,
        timeoutMs: codexExecTimeoutMs,
      },
      kokoro: {
        reachable: kokoro.reachable,
        baseUrl: kokoroBaseUrl,
        model: kokoroDefaultModel,
        voice: kokoroDefaultVoice,
        langCode: kokoroDefaultLangCode,
        speed: kokoroDefaultSpeed,
        error: kokoro.error || "",
      },
    });
    return;
  }

  try {
    await assertCodexReady();
    const kokoro = await probeKokoroRuntime();
    sendJson(res, 200, {
      ok: true,
      ai: {
        ready: true,
        provider: "codex-exec",
        model: codexExecModel,
        timeoutMs: codexExecTimeoutMs,
        fallbackFromHarness: harness.enabled ? 1 : 0,
      },
      kokoro: {
        reachable: kokoro.reachable,
        baseUrl: kokoroBaseUrl,
        model: kokoroDefaultModel,
        voice: kokoroDefaultVoice,
        langCode: kokoroDefaultLangCode,
        speed: kokoroDefaultSpeed,
        error: kokoro.error || "",
      },
    });
  } catch (error) {
    const kokoro = await probeKokoroRuntime();
    sendJson(res, 200, {
      ok: true,
      ai: {
        ready: false,
        provider: "codex-exec",
        model: codexExecModel,
        error: sanitizeInlineText(
          harness.enabled && harness.error
            ? `harness: ${harness.error} / codex: ${error && error.message ? error.message : "unavailable"}`
            : error && error.message ? error.message : "codex unavailable",
          180
        ),
      },
      kokoro: {
        reachable: kokoro.reachable,
        baseUrl: kokoroBaseUrl,
        model: kokoroDefaultModel,
        voice: kokoroDefaultVoice,
        langCode: kokoroDefaultLangCode,
        speed: kokoroDefaultSpeed,
        error: kokoro.error || "",
      },
    });
  }
}

async function handleEvaluate(req, res) {
  const body = await readJsonBody(req);
  const transcript = sanitizeMultilineText(body.transcript, 24000);
  if (!transcript) {
    sendJson(res, 400, { ok: false, error: "transcript is required" });
    return;
  }

  const releaseSlot = tryAcquireCodexSlot();
  if (!releaseSlot) {
    sendJson(res, 429, { ok: false, error: "AI analysis is busy. Please retry in a few seconds." });
    return;
  }
  const abortController = new AbortController();
  const abortRequest = () => abortController.abort();
  req.on("aborted", abortRequest);
  req.on("close", abortRequest);

  const scenario = {
    category: sanitizeInlineText(body.category, 80),
    title: sanitizeInlineText(body.title, 180),
    audience: sanitizeInlineText(body.audience, 180),
    goal: sanitizeMultilineText(body.goal, 1000),
  };
  const metrics = analyzeTranscript(transcript, body.durationSec);
  const startedAt = Date.now();
  try {
    const runtimeResult = await runStructuredAiTask({
      schemaPath: evaluationSchemaPath,
      prompt: buildEvaluationPromptV2({ scenario, transcript, metrics }),
      signal: abortController.signal,
    });

    sendJson(res, 200, {
      ok: true,
      evaluation: runtimeResult.data,
      metrics,
      latencyMs: Math.max(0, Date.now() - startedAt),
      model: runtimeResult.model,
      provider: runtimeResult.provider,
    });
  } finally {
    req.off("aborted", abortRequest);
    req.off("close", abortRequest);
    releaseSlot();
  }
}

async function handleChat(req, res) {
  const body = await readJsonBody(req);
  const transcript = sanitizeMultilineText(body.transcript, 24000);
  const question = sanitizeMultilineText(body.question, 2000);
  if (!transcript) {
    sendJson(res, 400, { ok: false, error: "transcript is required" });
    return;
  }
  if (!question) {
    sendJson(res, 400, { ok: false, error: "question is required" });
    return;
  }

  const releaseSlot = tryAcquireCodexSlot();
  if (!releaseSlot) {
    sendJson(res, 429, { ok: false, error: "AI coach is busy. Please retry in a few seconds." });
    return;
  }
  const abortController = new AbortController();
  const abortRequest = () => abortController.abort();
  req.on("aborted", abortRequest);
  req.on("close", abortRequest);

  try {
    const runtimeResult = await runStructuredAiTask({
      schemaPath: chatSchemaPath,
      prompt: buildChatPromptV2({
        scenario: {
          category: sanitizeInlineText(body.category, 80),
          title: sanitizeInlineText(body.title, 180),
          audience: sanitizeInlineText(body.audience, 180),
          goal: sanitizeMultilineText(body.goal, 1000),
        },
        transcript,
        evaluation: body.evaluation && typeof body.evaluation === "object" ? body.evaluation : {},
        question,
        history: Array.isArray(body.history) ? body.history : [],
      }),
      signal: abortController.signal,
    });

    sendJson(res, 200, {
      ok: true,
      reply: runtimeResult.data,
      model: runtimeResult.model,
      provider: runtimeResult.provider,
    });
  } finally {
    req.off("aborted", abortRequest);
    req.off("close", abortRequest);
    releaseSlot();
  }
}

async function handleKokoro(req, res) {
  const body = await readJsonBody(req);
  const text = sanitizeMultilineText(body.text || body.message, 24000);
  if (!text) {
    sendJson(res, 400, { ok: false, error: "text is required" });
    return;
  }

  const result = await requestKokoroSpeech({
    text,
    model: body.model,
    voice: body.voice,
    langCode: body.langCode || body.lang_code,
    speed: body.speed,
  });
  res.writeHead(200, {
    "Content-Type": result.contentType || "audio/mpeg",
    "Content-Length": result.audio.length,
    "Cache-Control": "no-store",
  });
  res.end(result.audio);
}

const server = http.createServer(async (req, res) => {
  const requestUrl = new URL(req.url || "/", `http://${req.headers.host || `${host}:${port}`}`);
  try {
    if (req.method === "OPTIONS") {
      res.writeHead(204, {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET,HEAD,POST,OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
        "Access-Control-Max-Age": "86400",
      });
      res.end();
      return;
    }

    if (req.method === "GET" && requestUrl.pathname === "/healthz") {
      sendJson(res, 200, {
        ok: true,
        mode: "presentation-coach-standalone",
        port,
        staticRoot,
        model: codexExecModel,
        kokoroBaseUrl,
      });
      return;
    }

    if (req.method === "GET" && requestUrl.pathname === "/api/runtime") {
      await handleRuntime(res);
      return;
    }

    if (req.method === "POST" && requestUrl.pathname === "/api/presentation/evaluate") {
      await handleEvaluate(req, res);
      return;
    }

    if (req.method === "POST" && requestUrl.pathname === "/api/presentation/chat") {
      await handleChat(req, res);
      return;
    }

    if (req.method === "POST" && requestUrl.pathname === "/api/voice/kokoro") {
      await handleKokoro(req, res);
      return;
    }

    serveStatic(req, res, requestUrl);
  } catch (error) {
    const statusCode = Number.isFinite(Number(error && error.statusCode))
      ? Math.max(400, Math.min(599, Math.trunc(Number(error.statusCode))))
      : error instanceof SyntaxError
        ? 400
        : 500;
    sendJson(res, statusCode, {
      ok: false,
      error: sanitizeInlineText(error && error.message ? error.message : String(error), 420) || "Server error.",
    });
  }
});

server.on("clientError", (error, socket) => {
  if (socket.writable) socket.end("HTTP/1.1 400 Bad Request\r\n\r\n");
  if (error && error.code !== "ECONNRESET") {
    console.error("[presentation-ai] client error:", error.message);
  }
});

server.listen(port, host, () => {
  console.log(`[presentation-ai] listening on http://${host}:${port}`);
  console.log(`[presentation-ai] model=${codexExecModel} kokoro=${kokoroBaseUrl}`);
});

function shutdown(signal) {
  server.close(() => {
    console.log(`[presentation-ai] shutdown via ${signal}`);
    process.exit(0);
  });
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
