"use strict";

const fs = require("fs");
const http = require("http");
const https = require("https");
const path = require("path");
const { URL } = require("url");

const host = process.env.CODEX_ENGLISH_CONVERSATION_HOST || "127.0.0.1";
const port = normalizePort(process.env.CODEX_ENGLISH_CONVERSATION_PORT, 57526);
const staticRoot = __dirname;
const harnessApiBaseUrl = normalizeBaseUrl(process.env.CODEX_HARNESS_API_BASE_URL || "http://127.0.0.1:57525");

const proxyableRoutes = new Set([
  "/api/conversation/runtime",
  "/api/conversation/direct",
  "/api/conversation/persona/reset",
  "/api/conversation/persona/memory",
  "/api/voice/piper/prepare",
  "/api/voice/piper",
  "/api/voice/kokoro",
]);

const mimeTypes = Object.freeze({
  ".css": "text/css; charset=utf-8",
  ".glb": "model/gltf-binary",
  ".gltf": "model/gltf+json",
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".mjs": "application/javascript; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".txt": "text/plain; charset=utf-8",
  ".vrm": "model/gltf-binary",
  ".wav": "audio/wav",
});

function upstreamTimeoutMsForPath(pathname) {
  if (pathname === "/api/conversation/direct") {
    return 65000;
  }
  if (pathname === "/api/voice/piper" || pathname === "/api/voice/kokoro") {
    return 65000;
  }
  return 15000;
}

function normalizePort(value, fallback) {
  const parsed = Number.parseInt(String(value || "").trim(), 10);
  if (!Number.isFinite(parsed) || parsed <= 0 || parsed > 65535) {
    return fallback;
  }
  return parsed;
}

function normalizeBaseUrl(value) {
  const raw = String(value || "").trim();
  const candidate = raw || "http://127.0.0.1:57525";
  return candidate.replace(/\/+$/, "");
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

function collectRequestBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

function buildRuntimeFallback() {
  return {
    ok: true,
    configured: false,
    provider: "harness-proxy",
    model: "",
    endpoint: "POST /api/conversation/direct",
    defaultMode: "normal",
    error: `Harness backend is offline at ${harnessApiBaseUrl}. Start the harness separately if you want live conversation.`,
  };
}

async function proxyRequest(req, res, requestUrl) {
  const targetUrl = new URL(`${harnessApiBaseUrl}${requestUrl.pathname}${requestUrl.search || ""}`);
  const transport = targetUrl.protocol === "https:" ? https : http;
  const requestBody = req.method === "GET" || req.method === "HEAD" ? null : await collectRequestBody(req);
  const targetOrigin = `${targetUrl.protocol}//${targetUrl.host}`;
  const upstreamTimeoutMs = upstreamTimeoutMsForPath(requestUrl.pathname);

  const headers = { ...req.headers };
  delete headers.host;
  headers.origin = targetOrigin;
  headers.referer = `${targetOrigin}/english-conversation-app/index.html`;
  if (requestBody) {
    headers["content-length"] = String(requestBody.length);
  } else {
    delete headers["content-length"];
  }

  return new Promise((resolve) => {
    const upstream = transport.request(
      targetUrl,
      {
        method: req.method,
        headers,
      },
      (upstreamRes) => {
        const responseHeaders = { ...upstreamRes.headers };
        delete responseHeaders["content-encoding"];
        responseHeaders["cache-control"] = "no-store";
        res.writeHead(upstreamRes.statusCode || 502, responseHeaders);
        upstreamRes.pipe(res);
        upstreamRes.on("end", resolve);
      }
    );

    upstream.on("error", (error) => {
      if (requestUrl.pathname === "/api/conversation/runtime") {
        sendJson(res, 200, buildRuntimeFallback());
      } else if (error && error.message === "upstream timeout") {
        sendJson(res, 504, {
          ok: false,
          error: `Harness backend timed out after ${upstreamTimeoutMs}ms at ${harnessApiBaseUrl}.`,
          code: "HARNESS_BACKEND_TIMEOUT",
        });
      } else {
        sendJson(res, 503, {
          ok: false,
          error: `Harness backend is unavailable at ${harnessApiBaseUrl}.`,
          code: "HARNESS_BACKEND_UNAVAILABLE",
        });
      }
      resolve();
    });

    upstream.setTimeout(upstreamTimeoutMs, () => {
      upstream.destroy(new Error("upstream timeout"));
    });

    if (requestBody && requestBody.length) {
      upstream.write(requestBody);
    }
    upstream.end();
  });
}

function contentTypeFor(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return mimeTypes[ext] || "application/octet-stream";
}

function resolveStaticPath(requestPath) {
  const decoded = decodeURIComponent(requestPath || "/");
  const normalized = decoded === "/" ? "/index.html" : decoded;
  const relativePath = normalized.replace(/^\/+/, "");
  const candidatePath = path.resolve(staticRoot, relativePath);
  if (!candidatePath.startsWith(staticRoot)) {
    return null;
  }
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
      "Cache-Control": requestUrl.pathname.startsWith("/assets/") || requestUrl.pathname.startsWith("/vendor/")
        ? "public, max-age=3600"
        : "no-store",
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

const server = http.createServer(async (req, res) => {
  const requestUrl = new URL(req.url || "/", `http://${req.headers.host || `${host}:${port}`}`);

  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET,HEAD,POST,OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      "Access-Control-Max-Age": "86400",
    });
    res.end();
    return;
  }

  if (requestUrl.pathname === "/healthz") {
    sendJson(res, 200, {
      ok: true,
      mode: "english-conversation-standalone",
      port,
      staticRoot,
      harnessApiBaseUrl,
    });
    return;
  }

  if (proxyableRoutes.has(requestUrl.pathname)) {
    await proxyRequest(req, res, requestUrl);
    return;
  }

  serveStatic(req, res, requestUrl);
});

server.on("clientError", (error, socket) => {
  if (socket.writable) {
    socket.end("HTTP/1.1 400 Bad Request\r\n\r\n");
  }
  if (error && error.code !== "ECONNRESET") {
    console.error("[english-app] client error:", error.message);
  }
});

server.listen(port, host, () => {
  console.log(`[english-app] listening on http://${host}:${port}`);
  console.log(`[english-app] proxying conversation/voice API to ${harnessApiBaseUrl}`);
});

function shutdown(signal) {
  server.close(() => {
    console.log(`[english-app] shutdown via ${signal}`);
    process.exit(0);
  });
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
