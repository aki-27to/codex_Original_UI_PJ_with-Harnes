#!/usr/bin/env node
"use strict";

const assert = require("assert");
const fs = require("fs");
const http = require("http");
const os = require("os");
const path = require("path");
const { spawn } = require("child_process");

const workspaceRoot = path.resolve(__dirname, "..");

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
    if (payload) req.write(payload);
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

function spawnNodeScript(scriptPath, { cwd, env, stdio = ["ignore", "pipe", "pipe"] } = {}) {
  const options = {
    cwd,
    env,
    stdio,
    windowsHide: true,
  };
  if (process.platform !== "win32") {
    return spawn(process.execPath, [scriptPath], options);
  }
  try {
    return spawn(process.execPath, [scriptPath], options);
  } catch (error) {
    if (!/EPERM/i.test(String(error && error.message ? error.message : error))) {
      throw error;
    }
  }
  return spawn(`"${process.execPath}" ${scriptPath}`, [], { ...options, shell: true });
}

async function run() {
  const port = 57561;
  const proofRoot = path.join(workspaceRoot, "logs", "test-proofs", `workspace-lock-api-smoke-${Date.now()}`);
  const lockedRoot = path.join(os.tmpdir(), `codex-workspace-lock-${process.pid}-${Date.now()}`);
  const nestedRoot = path.join(lockedRoot, "nested");
  fs.mkdirSync(proofRoot, { recursive: true });
  fs.mkdirSync(nestedRoot, { recursive: true });

  const env = {
    ...process.env,
    CODEX_UI_PORT: String(port),
    CODEX_AUTO_OPEN_BROWSER: "0",
    CODEX_DEFAULT_EXEC_AGENT: "default",
  };
  const child = spawnNodeScript("server.js", {
    cwd: workspaceRoot,
    env,
    stdio: ["ignore", "pipe", "pipe"],
  });

  const logs = [];
  child.stdout.on("data", (chunk) => logs.push(chunk.toString("utf8")));
  child.stderr.on("data", (chunk) => logs.push(chunk.toString("utf8")));

  try {
    const runtime = await waitRuntime(port);
    assert(runtime.workspaceGuard && runtime.workspaceGuard.locked === false, "runtime should report unlocked workspaceGuard by default");
    assert(runtime.controlApi && runtime.controlApi.tokenHeader && runtime.controlApi.token, "runtime should expose control API auth");

    const authHeaders = {
      [runtime.controlApi.tokenHeader]: runtime.controlApi.token,
      Origin: `http://127.0.0.1:${port}`,
      Referer: `http://127.0.0.1:${port}/`,
    };

    const lockRes = await requestJson({
      port,
      path: "/api/workspace/lock",
      method: "POST",
      headers: authHeaders,
      body: {
        action: "lock_workspace_directory",
        path: lockedRoot,
      },
    });
    assert(lockRes.statusCode === 200 && lockRes.json && lockRes.json.ok === true, `workspace lock should succeed (${lockRes.raw})`);
    assert(
      lockRes.json.workspaceGuard && lockRes.json.workspaceGuard.lockedRoot === lockedRoot,
      `workspace lock should echo lockedRoot (${lockRes.raw})`
    );

    const runtimeLocked = await requestJson({ port, path: "/api/runtime" });
    assert(runtimeLocked.statusCode === 200 && runtimeLocked.json && runtimeLocked.json.workspaceGuard, "runtime should expose workspaceGuard after lock");
    assert(runtimeLocked.json.workspaceGuard.locked === true, "workspaceGuard should report locked after lock call");
    assert(runtimeLocked.json.workspaceGuard.lockedRoot === lockedRoot, "runtime workspaceGuard should report lockedRoot");

    const batchInside = await requestJson({
      port,
      path: "/api/batch/run",
      method: "POST",
      body: {
        prompt: "workspace lock smoke inside",
        mode: "mock",
        cwd: nestedRoot,
      },
      timeoutMs: 20000,
    });
    assert(batchInside.statusCode === 200 && batchInside.json && batchInside.json.ok === true, `batch inside locked tree should pass (${batchInside.raw})`);

    const batchOutside = await requestJson({
      port,
      path: "/api/batch/run",
      method: "POST",
      body: {
        prompt: "workspace lock smoke outside",
        mode: "mock",
        cwd: workspaceRoot,
      },
      timeoutMs: 20000,
    });
    assert(batchOutside.statusCode === 403, `batch outside locked tree should fail with 403 (${batchOutside.raw})`);
    assert(
      batchOutside.json && /outside locked workspace/i.test(String(batchOutside.json.error || "")),
      `outside-lock error should mention locked workspace (${batchOutside.raw})`
    );

    const unlockRes = await requestJson({
      port,
      path: "/api/workspace/unlock",
      method: "POST",
      headers: authHeaders,
      body: {
        action: "unlock_workspace_directory",
      },
    });
    assert(unlockRes.statusCode === 200 && unlockRes.json && unlockRes.json.ok === true, `workspace unlock should succeed (${unlockRes.raw})`);
    assert(unlockRes.json.workspaceGuard && unlockRes.json.workspaceGuard.locked === false, "workspace unlock should clear lock state");

    const batchAfterUnlock = await requestJson({
      port,
      path: "/api/batch/run",
      method: "POST",
      body: {
        prompt: "workspace lock smoke after unlock",
        mode: "mock",
        cwd: workspaceRoot,
      },
      timeoutMs: 20000,
    });
    assert(batchAfterUnlock.statusCode === 200 && batchAfterUnlock.json && batchAfterUnlock.json.ok === true, `batch after unlock should pass (${batchAfterUnlock.raw})`);

    console.log("PASS workspace_lock_api_smoke_test");
  } finally {
    child.kill();
    try {
      fs.rmSync(lockedRoot, { recursive: true, force: true });
    } catch {
      // ignore cleanup failures
    }
  }
}

run().catch((error) => {
  console.error("FAIL workspace_lock_api_smoke_test");
  console.error(error && error.stack ? error.stack : String(error));
  process.exitCode = 1;
});
