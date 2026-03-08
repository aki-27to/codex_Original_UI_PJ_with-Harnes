#!/usr/bin/env node
"use strict";

const { spawn } = require("child_process");
const http = require("http");
const fs = require("fs");
const path = require("path");

const workspaceRoot = path.resolve(__dirname, "..");
const prompt =
  "WEB開発して！企業向けの！今回は要件定義フェーズだけで止めてください。出力順は 1) Blue 初回案 2) Red監査 3) Red反映後の改善案。実装作業はしないこと。";

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function requestJson({ method, port, pathName, headers = {}, body = null, timeoutMs = 120000 }) {
  return new Promise((resolve, reject) => {
    const payload = body == null ? "" : JSON.stringify(body);
    const req = http.request(
      {
        hostname: "127.0.0.1",
        port,
        path: pathName,
        method,
        timeout: timeoutMs,
        headers: {
          ...headers,
          ...(body == null
            ? {}
            : {
              "Content-Type": "application/json; charset=utf-8",
              "Content-Length": Buffer.byteLength(payload),
            }),
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
          resolve({ statusCode: res.statusCode || 0, raw, json });
        });
      }
    );
    req.on("error", reject);
    req.on("timeout", () => req.destroy(new Error(`timeout ${method} ${pathName}`)));
    if (body != null) req.write(payload);
    req.end();
  });
}

function requestExecStream({ port, tokenHeader, token, body, timeoutMs = 300000 }) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);
    const req = http.request(
      {
        hostname: "127.0.0.1",
        port,
        path: "/api/exec",
        method: "POST",
        timeout: timeoutMs,
        headers: {
          Origin: `http://127.0.0.1:${port}`,
          [tokenHeader]: token,
          "Content-Type": "application/json; charset=utf-8",
          "Content-Length": Buffer.byteLength(payload),
        },
      },
      (res) => {
        if ((res.statusCode || 0) !== 200) {
          let rawErr = "";
          res.on("data", (chunk) => {
            rawErr += chunk.toString("utf8");
          });
          res.on("end", () => reject(new Error(`HTTP ${res.statusCode} ${rawErr}`)));
          return;
        }
        let buffer = "";
        const events = [];
        let deltaText = "";
        let finalText = "";
        res.on("data", (chunk) => {
          buffer += chunk.toString("utf8");
          const lines = buffer.split(/\r?\n/);
          buffer = lines.pop() || "";
          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed) continue;
            try {
              const event = JSON.parse(trimmed);
              events.push(event);
              if (event && event.type === "delta" && typeof event.delta === "string") {
                deltaText += event.delta;
              }
              if (event && event.type === "final") {
                if (typeof event.text === "string") finalText = event.text;
                if (!finalText && event.final && typeof event.final.text === "string") {
                  finalText = event.final.text;
                }
                if (!finalText && typeof event.output === "string") {
                  finalText = event.output;
                }
              }
            } catch {
              // ignore malformed stream lines
            }
          }
        });
        res.on("end", () => {
          if (!finalText) finalText = deltaText;
          resolve({
            events,
            output: finalText.trim() || deltaText.trim() || "",
          });
        });
      }
    );
    req.on("error", reject);
    req.on("timeout", () => req.destroy(new Error("timeout POST /api/exec")));
    req.write(payload);
    req.end();
  });
}

async function waitRuntime(port, timeoutMs = 180000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const runtime = await requestJson({
        method: "GET",
        port,
        pathName: "/api/runtime",
        timeoutMs: 10000,
      });
      if (runtime.statusCode === 200 && runtime.json && runtime.json.controlApi && runtime.json.controlApi.token) {
        return runtime.json;
      }
    } catch {
      // ignore until timeout
    }
    await sleep(800);
  }
  throw new Error(`runtime not ready on port ${port}`);
}

async function runCase({ label, rbjEnabled, port }) {
  const env = {
    ...process.env,
    CODEX_AUTO_OPEN_BROWSER: "0",
    CODEX_UI_PORT: String(port),
    CODEX_DEFAULT_EXEC_AGENT: "intake",
    CODEX_REQUEST_USER_INPUT_POLICY: "auto-default",
    CODEX_ADVERSARIAL_SHADOW_ENABLED: "0",
    CODEX_ADVERSARIAL_LOOP_ENABLED: "0",
    CODEX_EXECUTION_PROFILE: "full-runtime",
    CODEX_REQUIREMENT_GUARD_ENABLED: "1",
    CODEX_REQUIREMENT_LOCK_ENABLED: "1",
    CODEX_SCOPE_EXPANSION_ENABLED: "1",
    CODEX_REQUIREMENT_RBJ_ENABLED: rbjEnabled ? "1" : "0",
    CODEX_REQUIREMENT_RBJ_MAX_QUESTIONS: "3",
    CODEX_REQUIREMENT_RBJ_MAX_REVISIONS: "2",
  };

  const child = spawn(process.execPath, ["server.js"], {
    cwd: workspaceRoot,
    env,
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
  });

  child.stdout.on("data", () => {});
  child.stderr.on("data", () => {});

  try {
    const runtime = await waitRuntime(port, 180000);
    const tokenHeader =
      runtime && runtime.controlApi && typeof runtime.controlApi.tokenHeader === "string"
        ? runtime.controlApi.tokenHeader
        : "x-codex-control-token";
    const token = runtime && runtime.controlApi ? runtime.controlApi.token : "";
    if (!token) {
      throw new Error("runtime control token missing");
    }

    const requirementGuard = runtime && runtime.requirementGuard ? runtime.requirementGuard : null;
    const rbjSnapshot = requirementGuard && requirementGuard.rbj ? requirementGuard.rbj : null;

    const execBody = {
      prompt,
      agentName: "intake",
      sandboxMode: "workspace-write",
      approvalPolicy: "never",
      cwd: workspaceRoot,
      executionProfile: "full-runtime",
      executionIntent: `rbj-demo-${label}`,
      executionSource: "rbj_requirement_demo",
    };

    const streamed = await requestExecStream({
      port,
      tokenHeader,
      token,
      body: execBody,
      timeoutMs: 300000,
    });

    return {
      label,
      rbjEnabled,
      rbjRuntimeEnabled: Boolean(rbjSnapshot && rbjSnapshot.enabled),
      rbjRuntime: rbjSnapshot,
      eventCount: streamed.events.length,
      eventTypes: streamed.events.map((event) => (event && event.type ? event.type : "")).filter(Boolean),
      output: streamed.output,
    };
  } finally {
    if (child && !child.killed) {
      child.kill();
    }
  }
}

async function main() {
  const before = await runCase({ label: "before", rbjEnabled: false, port: 57541 });
  const after = await runCase({ label: "after", rbjEnabled: true, port: 57542 });

  const result = {
    generatedAt: new Date().toISOString(),
    prompt,
    before,
    after,
  };

  const outPath = path.join(workspaceRoot, "logs", "rbj_requirement_demo.json");
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(result, null, 2));
  console.log(outPath);
}

main().catch((error) => {
  console.error(error && error.message ? error.message : String(error));
  process.exit(1);
});

