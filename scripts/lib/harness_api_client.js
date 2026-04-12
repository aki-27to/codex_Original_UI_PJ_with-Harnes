"use strict";

const http = require("http");
const fs = require("fs");
const path = require("path");
const { startInProcessHarnessServer } = require("./in_process_harness_server");

function requestJson({ port, path: requestPath, method = "GET", headers = {}, body = null, timeoutMs = 15000 }) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : "";
    const req = http.request(
      {
        hostname: "127.0.0.1",
        port,
        path: requestPath,
        method,
        headers: {
          ...(payload
            ? {
              "Content-Type": "application/json",
              "Content-Length": Buffer.byteLength(payload),
            }
            : {}),
          ...headers,
        },
      },
      (res) => {
        let raw = "";
        res.on("data", (chunk) => {
          raw += chunk.toString("utf8");
        });
        res.on("end", () => {
          let json = null;
          try {
            json = raw ? JSON.parse(raw) : null;
          } catch {
            json = null;
          }
          resolve({ statusCode: Number(res.statusCode || 0), json, raw });
        });
      }
    );
    req.on("error", reject);
    req.setTimeout(timeoutMs, () => req.destroy(new Error("request timeout")));
    if (payload) {
      req.write(payload);
    }
    req.end();
  });
}

async function waitRuntime(port, maxMs = 45000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < maxMs) {
    try {
      const res = await requestJson({ port, path: "/api/runtime", timeoutMs: 4000 });
      if (res.statusCode === 200 && res.json && res.json.mode === "app-server") {
        return res.json;
      }
    } catch {
      // retry
    }
    await new Promise((resolve) => setTimeout(resolve, 400));
  }
  throw new Error("runtime not ready");
}

async function startHarnessForPhase1({
  workspaceRoot,
  proofRoot,
  port = 57570,
  envOverrides = {},
} = {}) {
  const root = path.resolve(workspaceRoot || path.join(__dirname, "..", ".."));
  const outputRoot = path.resolve(proofRoot || path.join(root, "logs", "archive", "raw", "phase1_runs", String(Date.now())));
  fs.mkdirSync(outputRoot, { recursive: true });
  const handle = await startInProcessHarnessServer({
    CODEX_UI_PORT: String(port),
    CODEX_AUTO_OPEN_BROWSER: "0",
    CODEX_DEFAULT_EXEC_AGENT: "default",
    CODEX_LOGGING_MODE: "DEBUG",
    CODEX_REQUEST_USER_INPUT_POLICY: "",
    CODEX_APP_SERVER_TRANSPORT: "mock-fixture",
    CODEX_PARENT_DISPATCH_GUARD_MODE: "off",
    CODEX_ADVERSARIAL_SHADOW_ENABLED: "0",
    CODEX_ADVERSARIAL_LOOP_ENABLED: "0",
    ...(process.env.CODEX_HOLDOUT_EVAL_UNLOCK ? { CODEX_HOLDOUT_EVAL_UNLOCK: process.env.CODEX_HOLDOUT_EVAL_UNLOCK } : {}),
    ...(process.env.CODEX_BLACKBOX_EVAL_UNLOCK ? { CODEX_BLACKBOX_EVAL_UNLOCK: process.env.CODEX_BLACKBOX_EVAL_UNLOCK } : {}),
    CODEX_HARNESS_MEMORY_PATH: path.join(outputRoot, "harness_execution_memory.json"),
    CODEX_EVAL_HISTORY_PATH: path.join(outputRoot, "eval_runs.jsonl"),
    CODEX_TURN_ARTIFACTS_DIR: path.join(outputRoot, "turns"),
    ...envOverrides,
  });
  const runtime = await waitRuntime(port);
  const authHeaders = {
    [runtime.controlApi.tokenHeader]: runtime.controlApi.token,
    Origin: `http://127.0.0.1:${port}`,
    Referer: `http://127.0.0.1:${port}/`,
  };
  return {
    handle,
    runtime,
    port,
    proofRoot: outputRoot,
    authHeaders,
  };
}

module.exports = {
  requestJson,
  startHarnessForPhase1,
  waitRuntime,
};
