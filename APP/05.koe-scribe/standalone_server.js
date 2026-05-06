"use strict";

const crypto = require("crypto");
const fs = require("fs");
const http = require("http");
const path = require("path");
const { URL } = require("url");

const DEFAULT_HOST = "127.0.0.1";
const EXEC_STREAM_CONTENT_TYPE = "application/x-ndjson";
const MAX_BODY_BYTES = 1024 * 1024;
const MAX_UPLOAD_BYTES = normalizeMegabytes(process.env.CODEX_KOE_SCRIBE_MAX_UPLOAD_MB, 20 * 1024);
const staticRoot = __dirname;

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

function inferRequestedEngine(prompt) {
  const lower = prompt.toLowerCase();
  if (lower.includes("engine: codex-openai-transcription")) return "codex-openai-transcription";
  if (lower.includes("engine: local-whisper")) return "local-whisper";
  if (lower.includes("engine: openai-gpt4o-text")) return "openai-gpt4o-text";
  if (lower.includes("engine: openai-whisper-srt")) return "openai-whisper-srt";
  if (lower.includes("engine: plan-only")) return "plan-only";
  return "unknown";
}

function buildStandaloneResult({ body, context, runId, jobDir }) {
  const prompt = shortText(body.prompt, 10000);
  const engine = inferRequestedEngine(prompt);
  const uploadedMedia = body && body.uploadedMedia && typeof body.uploadedMedia === "object" ? body.uploadedMedia : null;
  const generatedFiles = [];
  const blocked = engine === "plan-only"
    ? []
    : [
        "Actual speech-to-text execution is not wired to a dedicated local/OpenAI worker yet.",
        "This standalone route intentionally does not dispatch to the shared Codex App Server, so cross-app runtime conflicts cannot occur.",
      ];

  return [
    "KoeScribe standalone isolated run",
    "",
    `run_id: ${runId}`,
    `instance_id: ${context.instanceId}`,
    `server_url: ${context.url || "(listening)"}`,
    `runtime_root: ${context.runtimeRoot}`,
    `job_dir: ${jobDir}`,
    `uploaded_media_path: ${uploadedMedia && uploadedMedia.localPath ? uploadedMedia.localPath : "(none)"}`,
    `shared_harness_dispatch: disabled`,
    `shared_harness_api_exec: disabled`,
    `port_selection: ${context.portSelection}`,
    `requested_engine: ${engine}`,
    "",
    "generated_files:",
    generatedFiles.length ? generatedFiles.map((file) => `- ${file}`).join("\n") : "- none",
    "",
    "transcript_summary:",
    "- No transcript was generated by this isolated dispatcher shell.",
    "- The request was accepted and evaluated inside APP/05.koe-scribe only.",
    "",
    "quality_notes:",
    "- Port conflicts are avoided by using an OS-assigned free port by default.",
    "- Route conflicts are avoided because /api/runtime and /api/exec are served by this app-local process.",
    "- Runtime conflicts are avoided because this route does not call the shared harness /api/exec.",
    "- Output collision is avoided by allocating a unique per-run job directory.",
    "",
    "blocked:",
    blocked.length ? blocked.map((item) => `- ${item}`).join("\n") : "- none",
  ].join("\n");
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
        const finalText = buildStandaloneResult({ body, context, runId, jobDir });
        sendNdjson(res, 200, [
          { type: "status", status: "standalone_isolated" },
          { type: "status", status: "shared_harness_dispatch_disabled" },
          { type: "final", text: finalText },
        ]);
      } catch (error) {
        sendNdjson(res, 400, [
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
  resolveStaticPath,
  safeDecodeURIComponent,
  startServer,
  staticRoot,
};
