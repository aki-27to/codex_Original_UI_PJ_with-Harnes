#!/usr/bin/env node
"use strict";

const assert = require("assert/strict");
const http = require("http");
const path = require("path");
const { startInProcessHarnessServer } = require("./lib/in_process_harness_server");

const workspaceRoot = path.resolve(__dirname, "..");
const port = 57547;

async function stopHarnessHandle(handle) {
  if (!handle || typeof handle.stop !== "function") {
    return;
  }
  try {
    await handle.stop();
  } catch {
    // Best-effort cleanup only.
  }
}

function requestHttp({ method, requestPath, body = null, headers = {}, timeoutMs = 30000, port: requestPort = port }) {
  return new Promise((resolve, reject) => {
    const payload = body == null ? "" : JSON.stringify(body);
    const requestHeaders = {
      ...(headers && typeof headers === "object" ? headers : {}),
    };
    if (body != null) {
      requestHeaders["Content-Type"] = requestHeaders["Content-Type"] || "application/json; charset=utf-8";
      requestHeaders["Content-Length"] = Buffer.byteLength(payload);
    }
    const req = http.request(
      {
        hostname: "127.0.0.1",
        port: requestPort,
        path: requestPath,
        method,
        timeout: timeoutMs,
        headers: requestHeaders,
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
          resolve({
            statusCode: res.statusCode || 0,
            raw,
            json,
            headers: res.headers || {},
          });
        });
      }
    );
    req.on("timeout", () => {
      req.destroy(new Error(`HTTP timeout: ${method} ${requestPath}`));
    });
    req.on("error", reject);
    if (body != null) {
      req.write(payload);
    }
    req.end();
  });
}

async function waitForRuntimeReady({ timeoutMs = 30000, pollMs = 250, port: requestPort = port } = {}) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const runtime = await requestHttp({
        method: "GET",
        requestPath: "/api/runtime",
        timeoutMs: pollMs,
        port: requestPort,
      });
      if (runtime.statusCode === 200 && runtime.json && runtime.json.mode === "app-server") {
        return runtime.json;
      }
    } catch {
      // Keep polling until timeout.
    }
    await new Promise((resolve) => setTimeout(resolve, pollMs));
  }
  throw new Error(`runtime did not become ready within ${timeoutMs}ms`);
}

function parseNdjsonEvents(raw) {
  const events = [];
  const lines = String(raw || "").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      continue;
    }
    try {
      events.push(JSON.parse(trimmed));
    } catch {
      // Ignore non-JSON payloads such as inline [error] text.
    }
  }
  return events;
}

function extractExecOutput(events) {
  const source = Array.isArray(events) ? events : [];
  let finalText = "";
  let deltaText = "";
  for (const event of source) {
    if (!event || typeof event !== "object") {
      continue;
    }
    if (event.type === "delta" && typeof event.delta === "string") {
      deltaText += event.delta;
      continue;
    }
    if (event.type === "delta" && typeof event.text === "string") {
      deltaText += event.text;
      continue;
    }
    if (event.type === "final" && typeof event.text === "string" && event.text.trim()) {
      finalText = event.text;
    }
    if (event.type === "item" && event.item && typeof event.item.text === "string" && event.item.text.trim()) {
      finalText = event.item.text;
    }
  }
  return finalText || deltaText;
}

async function runExecViaHttp({ prompt, headers, forceNewSession = false, timeoutMs = 45000, port: requestPort = port }) {
  const response = await requestHttp({
    method: "POST",
    requestPath: "/api/exec",
    timeoutMs,
    port: requestPort,
    headers,
    body: {
      prompt,
      agentName: "intake",
      sandboxMode: "workspace-write",
      approvalPolicy: "never",
      cwd: workspaceRoot,
      executionProfile: "smoke-test",
      executionIntent: "transport-failure-test",
      executionSource: "transport_failure_test",
      forceNewSession,
    },
  });
  const events = parseNdjsonEvents(response.raw);
  const turnStarted = events.find((event) => event && event.type === "turn" && event.phase === "started") || null;
  const turnCompleted = events.find((event) => event && event.type === "turn" && event.phase === "completed") || null;
  const statusEvent = events.filter((event) => event && event.type === "status").slice(-1)[0] || null;
  return {
    ...response,
    events,
    turnStarted,
    turnCompleted,
    statusEvent,
    output: extractExecOutput(events),
  };
}

function installFakeBrokenPipeTransport(ClientClass) {
  assert(ClientClass && ClientClass.prototype, "CodexAppServerClient export is required for transport patching");
  const originalStart = ClientClass.prototype.start;
  let threadSeq = 1;
  let turnSeq = 1;
  const state = {
    startCount: 0,
    writeCount: 0,
    injectedFailures: 0,
    writes: [],
    responses: [],
  };

  ClientClass.prototype.start = async function patchedStart() {
    this.stopping = false;
    this.childTerminated = false;
    this.terminatedTransportError = null;
    state.startCount += 1;
    const client = this;
    this.child = {
      killed: false,
      stdin: {
        destroyed: false,
        write(chunk) {
          const line = Buffer.isBuffer(chunk) ? chunk.toString("utf8") : String(chunk || "");
          const message = JSON.parse(line.trim());
          state.writeCount += 1;
          state.writes.push(message && message.method ? message.method : "unknown");
          if (message && message.method === "turn/start" && state.injectedFailures === 0) {
            state.injectedFailures += 1;
            const error = new Error("EPIPE: broken pipe while writing to app-server stdin");
            error.code = "EPIPE";
            client.handleProcessTermination(error);
            throw error;
          }
          queueMicrotask(() => {
            handleFakeOutboundMessage(client, message);
          });
          return true;
        },
      },
      kill() {
        this.killed = true;
        if (this.stdin) {
          this.stdin.destroyed = true;
        }
      },
    };
    client.stdoutBuffer = "";
    client.stderrBuffer = "";
  };

  function respond(client, message) {
    if (message && message.result && message.id) {
      state.responses.push(`result:${String(message.id)}`);
    } else if (message && message.method) {
      state.responses.push(`notify:${message.method}`);
    } else if (message && message.error) {
      state.responses.push("error");
    }
    client.handleMessageLine(JSON.stringify(message));
  }

  function handleFakeOutboundMessage(client, message) {
    if (!message || typeof message !== "object" || typeof message.method !== "string") {
      return;
    }
    if (!Object.prototype.hasOwnProperty.call(message, "id")) {
      return;
    }

    if (message.method === "initialize") {
      respond(client, {
        id: message.id,
        result: {
          serverInfo: { name: "fake-app-server", version: "test.v1" },
          capabilities: { experimentalApi: true },
        },
      });
      return;
    }

    if (message.method === "thread/start") {
      respond(client, {
        id: message.id,
        result: { thread: { id: `fake-thread-${threadSeq++}` } },
      });
      return;
    }

    if (message.method === "thread/resume") {
      const requested = message.params && typeof message.params.threadId === "string" ? message.params.threadId : "";
      respond(client, {
        id: message.id,
        result: { thread: { id: requested || `fake-thread-${threadSeq++}` } },
      });
      return;
    }

    if (message.method === "turn/start") {
      const turnId = `fake-turn-${turnSeq++}`;
      const threadId =
        message.params && typeof message.params.threadId === "string" ? message.params.threadId : `fake-thread-${threadSeq++}`;
      const prompt = normalizeTurnPrompt(message.params && message.params.input);
      respond(client, {
        id: message.id,
        result: { turn: { id: turnId, status: "in_progress" } },
      });
      setTimeout(() => {
        const itemId = `${turnId}-message`;
        respond(client, {
          method: "item/started",
          params: {
            threadId,
            turnId,
            item: {
              id: itemId,
              type: "agentMessage",
              role: "assistant",
              text: prompt,
              status: "in_progress",
            },
          },
        });
        respond(client, {
          method: "item/completed",
          params: {
            threadId,
            turnId,
            item: {
              id: itemId,
              type: "agentMessage",
              role: "assistant",
              text: `transport recovered: ${prompt}`,
              status: "completed",
            },
          },
        });
        respond(client, {
          method: "turn/completed",
          params: {
            threadId,
            turnId,
            turn: {
              id: turnId,
              status: "completed",
            },
          },
        });
      });
      return;
    }

    if (message.method === "turn/interrupt") {
      respond(client, {
        id: message.id,
        result: { ok: true },
      });
      return;
    }

    respond(client, {
      id: message.id,
      error: { code: -32601, message: `unsupported method in fake transport: ${message.method}` },
    });
  }

  function normalizeTurnPrompt(input) {
    if (typeof input === "string") {
      return input.trim();
    }
    if (Array.isArray(input)) {
      const textItem = input.find((entry) => entry && typeof entry.text === "string");
      return textItem && typeof textItem.text === "string" ? textItem.text.trim() : "ok";
    }
    return "ok";
  }

  return {
    state,
    restore() {
      ClientClass.prototype.start = originalStart;
    },
  };
}

async function runScenario() {
  let harnessHandle = null;
  let patch = null;
  try {
    harnessHandle = await startInProcessHarnessServer({
      CODEX_AUTO_OPEN_BROWSER: "0",
      CODEX_UI_PORT: String(port),
      CODEX_EXECUTION_PROFILE: "smoke-test",
      CODEX_DEFAULT_EXEC_AGENT: "intake",
      CODEX_REQUEST_USER_INPUT_POLICY: "blocked",
      CODEX_ADVERSARIAL_SHADOW_ENABLED: "0",
      CODEX_ADVERSARIAL_LOOP_ENABLED: "0",
      CODEX_APP_SERVER_TRANSPORT: "stdio",
    });

    const serverModule = harnessHandle && harnessHandle.serverModule ? harnessHandle.serverModule : null;
    assert(serverModule, "server module missing from in-process harness handle");
    assert(serverModule.__riskAudit && serverModule.__riskAudit.CodexAppServerClient, "server module did not expose CodexAppServerClient");
    patch = installFakeBrokenPipeTransport(serverModule.__riskAudit.CodexAppServerClient);

    const runtime = await waitForRuntimeReady({ port });
    const controlApi = runtime && runtime.controlApi && typeof runtime.controlApi === "object" ? runtime.controlApi : null;
    const token = controlApi && typeof controlApi.token === "string" ? controlApi.token.trim() : "";
    const tokenHeader =
      controlApi && typeof controlApi.tokenHeader === "string" && controlApi.tokenHeader.trim()
        ? controlApi.tokenHeader.trim()
        : "x-codex-control-token";
    assert(token, "runtime did not expose control API token");

    const authenticatedHeaders = {
      Origin: `http://127.0.0.1:${port}`,
      [tokenHeader]: token,
    };

    const failedExec = await runExecViaHttp({
      prompt: "first request should fail with broken pipe",
      forceNewSession: true,
      headers: authenticatedHeaders,
      port,
    });
    assert.equal(failedExec.statusCode, 200, `expected first /api/exec to keep stream contract, got HTTP ${failedExec.statusCode}`);
    assert.match(
      failedExec.raw,
      /\[error\].*(EPIPE|broken pipe|app-server is not running)/i,
      `expected request-local error payload, got: ${failedExec.raw || "(empty)"}`
    );
    assert.equal(failedExec.turnCompleted, null, "broken pipe request should not emit a completed turn event");
    assert.equal(patch.state.injectedFailures, 1, "expected exactly one injected broken-pipe failure");

    const runtimeAfterFailure = await requestHttp({
      method: "GET",
      requestPath: "/api/runtime",
      timeoutMs: 10000,
      port,
    });
    assert.equal(runtimeAfterFailure.statusCode, 200, `expected /api/runtime after broken pipe to return 200, got ${runtimeAfterFailure.statusCode}`);
    assert(runtimeAfterFailure.json && runtimeAfterFailure.json.mode === "app-server", "runtime payload lost app-server mode after failure");
    const serverState = typeof serverModule.getHarnessServerState === "function" ? serverModule.getHarnessServerState() : null;
    assert(serverState && serverState.listening === true, "harness server stopped listening after broken pipe");
    await new Promise((resolve) => setTimeout(resolve, 50));

    const recoveredExec = await runExecViaHttp({
      prompt: "second request should complete after transport restart",
      forceNewSession: true,
      headers: authenticatedHeaders,
      port,
    });
    assert.equal(recoveredExec.statusCode, 200, `expected recovery /api/exec to return 200, got HTTP ${recoveredExec.statusCode}`);
    assert(recoveredExec.turnCompleted && recoveredExec.turnCompleted.status === "completed", "expected recovered request to reach turn/completed");
    assert.match(
      recoveredExec.output,
      /transport recovered: second request should complete after transport restart/i,
      `expected recovered output marker, got: ${recoveredExec.output || "(empty)"}`
    );
    assert(patch.state.startCount >= 2, `expected app-server client restart after broken pipe, got startCount=${patch.state.startCount}`);

    return {
      failedExec,
      runtimeAfterFailure,
      recoveredExec,
      serverState,
      patchState: { ...patch.state },
    };
  } finally {
    if (patch && typeof patch.restore === "function") {
      patch.restore();
    }
    await stopHarnessHandle(harnessHandle);
  }
}

async function main() {
  try {
    console.log("[transport-failure] 1/3 inject broken pipe on turn/start");
    const result = await runScenario();
    console.log("[transport-failure] 2/3 confirm harness server is still alive");
    console.log("[transport-failure] 3/3 next request succeeds without harness restart");
    console.log(
      `[transport-failure] injectedFailures=${result.patchState.injectedFailures} startCount=${result.patchState.startCount} writeCount=${result.patchState.writeCount}`
    );
    console.log("PASS");
    return 0;
  } catch (error) {
    const message = error instanceof Error ? error.stack || error.message : String(error);
    console.error(`[transport-failure] ${message}`);
    console.log("FAIL");
    return 1;
  }
}

module.exports = {
  main,
  runScenario,
};

if (require.main === module) {
  main()
    .then((code) => {
      process.exitCode = code;
    })
    .catch((error) => {
      console.error(`[transport-failure] fatal: ${error instanceof Error ? error.stack || error.message : String(error)}`);
      console.log("FAIL");
      process.exitCode = 1;
    });
}
