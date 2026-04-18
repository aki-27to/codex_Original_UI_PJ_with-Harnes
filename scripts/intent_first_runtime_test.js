#!/usr/bin/env node
"use strict";

const assert = require("assert");
const http = require("http");
const path = require("path");
const { startInProcessHarnessServer } = require("./lib/in_process_harness_server");

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

async function run() {
  const port = 57567;
  const env = {
    ...process.env,
    CODEX_UI_PORT: String(port),
    CODEX_AUTO_OPEN_BROWSER: "0",
    CODEX_DEFAULT_EXEC_AGENT: "default",
  };
  const harness = await startInProcessHarnessServer(env);

  try {
    const runtime = await waitRuntime(port);
    assert(runtime.intentFirst && runtime.intentFirst.contract, "runtime should expose intentFirst.contract");
    assert(runtime.intentFirst.tasteMemory && runtime.intentFirst.tasteMemory.activeProfile, "runtime should expose active taste profile");
    assert(Array.isArray(runtime.intentFirst.requiredGates) && runtime.intentFirst.requiredGates.length >= 4, "runtime should expose required gates");
    assert(runtime.intentFirst.verificationLock && runtime.intentFirst.verificationLock.enabled === true, "runtime should expose verification lock");
    assert.strictEqual(runtime.intentFirst.verificationLock.mode, "fail_closed", "verification lock should be fail-closed");
    assert.strictEqual(runtime.intentFirst.verificationLock.scope, "all_design_sensitive_requests", "verification lock should expose global design-sensitive scope");
    assert(Array.isArray(runtime.intentFirst.contract && runtime.intentFirst.contract.keywords), "runtime should expose intent-first keywords");
    assert(runtime.intentFirst.correctionLearning && runtime.intentFirst.correctionLearning.contract, "runtime should expose correction learning contract");
    assert.strictEqual(runtime.intentFirst.correctionLearning.summary.correctionEventRequired, true, "runtime correction learning must require correction events");
    assert(Array.isArray(runtime.intentFirst.correctionLearning.contract.policyPatchTargets) && runtime.intentFirst.correctionLearning.contract.policyPatchTargets.length >= 3, "runtime should expose correction policy patch targets");

    const authHeaders = {
      [runtime.controlApi.tokenHeader]: runtime.controlApi.token,
      Origin: `http://127.0.0.1:${port}`,
      Referer: `http://127.0.0.1:${port}/`,
    };

    const updateRes = await requestJson({
      port,
      path: "/api/intent/profile",
      method: "POST",
      headers: authHeaders,
      body: {
        action: "update_intent_profile",
        profile: {
          label: "akima-updated",
          northStar: ["Intent-first runtime test"],
          benchmarkSites: ["https://example.com/reference"],
          benchmarkNotes: ["Must beat the reference in quality"],
          prefers: ["credible information density"],
          rejects: ["generic AI layout"],
          requiredProof: ["desktop screenshot review"],
        },
      },
    });
    assert(updateRes.statusCode === 200 && updateRes.json && updateRes.json.ok === true, `intent profile update should succeed (${updateRes.raw})`);

    const runtimeAfterUpdate = await requestJson({ port, path: "/api/runtime" });
    assert(runtimeAfterUpdate.statusCode === 200 && runtimeAfterUpdate.json && runtimeAfterUpdate.json.intentFirst, "runtime should remain available after intent update");
    assert.strictEqual(runtimeAfterUpdate.json.intentFirst.tasteMemory.activeProfile.label, "akima-updated", "intent profile label should update");
    assert.strictEqual(runtimeAfterUpdate.json.intentFirst.tasteMemory.activeProfile.northStar[0], "Intent-first runtime test", "intent profile north star should update");
    assert.strictEqual(runtimeAfterUpdate.json.intentFirst.tasteMemory.activeProfile.benchmarkSites[0], "https://example.com/reference", "intent profile benchmark should update");

    const blockedExec = await requestJson({
      port,
      path: "/api/workspace/unlock",
      method: "POST",
      headers: authHeaders,
      body: {
        action: "unlock_workspace_directory",
      },
    });
    assert(blockedExec.statusCode === 200 && blockedExec.json && blockedExec.json.ok === true, `workspace unlock before blocked exec should succeed (${blockedExec.raw})`);

    const blockedExecAfterUnlock = await requestJson({
      port,
      path: "/api/exec",
      method: "POST",
      headers: authHeaders,
      body: {
        prompt: "Create a recruitment site design that beats the benchmark.",
        agentName: "default",
        sandboxMode: "workspace-write",
        approvalPolicy: "never",
        cwd: workspaceRoot,
        executionProfile: "smoke-test",
        executionIntent: "smoke-http-exec",
        executionSource: "web_ui",
      },
      timeoutMs: 20000,
    });
    assert(blockedExecAfterUnlock.statusCode === 409 && blockedExecAfterUnlock.json, `design-sensitive exec without workspace lock should be blocked (${blockedExecAfterUnlock.raw})`);
    assert.strictEqual(blockedExecAfterUnlock.json.code, "workspace_lock_required", "design-sensitive exec should use workspace_lock_required code");

    const resetRes = await requestJson({
      port,
      path: "/api/intent/profile/reset",
      method: "POST",
      headers: authHeaders,
      body: {
        action: "reset_intent_profile",
      },
    });
    assert(resetRes.statusCode === 200 && resetRes.json && resetRes.json.ok === true, `intent profile reset should succeed (${resetRes.raw})`);

    const runtimeAfterReset = await requestJson({ port, path: "/api/runtime" });
    assert(runtimeAfterReset.statusCode === 200 && runtimeAfterReset.json && runtimeAfterReset.json.intentFirst, "runtime should remain available after reset");
    assert.strictEqual(runtimeAfterReset.json.intentFirst.tasteMemory.activeProfile.label, "Akima Intent Profile", "intent profile reset should restore seed label");

    console.log("PASS intent_first_runtime_test");
  } finally {
    await harness.stop();
  }
}

run().catch((error) => {
  console.error("FAIL intent_first_runtime_test");
  console.error(error && error.stack ? error.stack : String(error));
  process.exitCode = 1;
});
