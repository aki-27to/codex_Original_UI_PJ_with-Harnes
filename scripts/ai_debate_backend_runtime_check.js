const http = require("http");
const { spawn } = require("child_process");
const path = require("path");
const crypto = require("crypto");

const repoRoot = path.resolve(__dirname, "..");
const port = Number(process.env.AI_DEBATE_BACKEND_CHECK_PORT || 57536);
const origin = `http://127.0.0.1:${port}`;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function request({ method = "GET", pathName = "/", headers = {}, body = null, expectNdjson = false }) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: "127.0.0.1",
        port,
        path: pathName,
        method,
        headers,
      },
      (res) => {
        if (expectNdjson) {
          resolve({ req, res });
          return;
        }
        let raw = "";
        res.setEncoding("utf8");
        res.on("data", (chunk) => {
          raw += chunk;
        });
        res.on("end", () => {
          resolve({ statusCode: res.statusCode || 0, headers: res.headers, raw });
        });
      }
    );
    req.on("error", reject);
    if (body) {
      req.write(body);
    }
    req.end();
  });
}

async function requestJson(args) {
  const response = await request(args);
  let json = null;
  try {
    json = response.raw ? JSON.parse(response.raw) : null;
  } catch {
    json = null;
  }
  return { ...response, json };
}

async function waitForRuntime(timeoutMs = 60000) {
  const startedAt = Date.now();
  for (;;) {
    try {
      const response = await requestJson({ method: "GET", pathName: "/api/runtime" });
      if (response.statusCode === 200 && response.json && response.json.controlApi && response.json.controlApi.token) {
        return response.json;
      }
    } catch {}
    if (Date.now() - startedAt > timeoutMs) {
      throw new Error("timed out waiting for /api/runtime");
    }
    await sleep(500);
  }
}

function authHeaders(runtime) {
  return {
    Origin: origin,
    Referer: `${origin}/`,
    [runtime.controlApi.tokenHeader]: runtime.controlApi.token,
  };
}

async function execNdjson(runtime, payload, { abortOnFirstDelta = false } = {}) {
  const body = JSON.stringify(payload);
  const { req, res } = await request({
    method: "POST",
    pathName: "/api/exec",
    expectNdjson: true,
    headers: {
      ...authHeaders(runtime),
      "Content-Type": "application/json",
      "Content-Length": Buffer.byteLength(body),
    },
    body,
  });

  return new Promise((resolve, reject) => {
    const events = [];
    let buffer = "";
    let aborted = false;
    let settled = false;

    const finish = (extra = {}) => {
      if (settled) return;
      settled = true;
      resolve({ statusCode: res.statusCode || 0, events, aborted, ...extra });
    };

    res.setEncoding("utf8");
    res.on("data", (chunk) => {
      buffer += chunk;
      let newlineIndex = buffer.indexOf("\n");
      while (newlineIndex >= 0) {
        const line = buffer.slice(0, newlineIndex).trim();
        buffer = buffer.slice(newlineIndex + 1);
        if (line) {
          try {
            const event = JSON.parse(line);
            events.push(event);
            if (abortOnFirstDelta && !aborted && event && event.type === "delta") {
              aborted = true;
              req.destroy();
              res.destroy();
              finish({ abortedAtEvent: event });
              return;
            }
          } catch (error) {
            reject(error);
            return;
          }
        }
        newlineIndex = buffer.indexOf("\n");
      }
    });
    res.on("end", () => finish());
    res.on("close", () => {
      if (aborted) {
        finish();
        return;
      }
      finish({ closed: true });
    });
    res.on("error", (error) => {
      if (aborted || (error && error.code === "ECONNRESET")) {
        finish({ abortError: error && error.message ? error.message : String(error) });
        return;
      }
      reject(error);
    });
    req.on("error", (error) => {
      if (aborted || (error && error.code === "ECONNRESET")) {
        finish({ abortError: error && error.message ? error.message : String(error) });
        return;
      }
      reject(error);
    });
  });
}

function findAgent(snapshot, name) {
  return Array.isArray(snapshot && snapshot.agents)
    ? snapshot.agents.find((entry) => entry && entry.name === name) || null
    : null;
}

async function pollIdempotency(runtime, key, timeoutMs = 90000) {
  const startedAt = Date.now();
  for (;;) {
    const response = await requestJson({
      method: "GET",
      pathName: `/api/exec/idempotency/${encodeURIComponent(key)}?wait_ms=5000`,
      headers: authHeaders(runtime),
    });
    if (response.statusCode === 200 && response.json && response.json.idempotency) {
      const idempotency = response.json.idempotency;
      const outcomeStatus = idempotency.outcome && idempotency.outcome.status;
      const lifecycleState = idempotency.lifecycleState || idempotency.state;
      if (["completed", "failed", "interrupted"].includes(outcomeStatus) || ["resolved", "released"].includes(lifecycleState)) {
        return response.json;
      }
    }
    if (Date.now() - startedAt > timeoutMs) {
      throw new Error("timed out waiting for idempotency resolution");
    }
    await sleep(1000);
  }
}

async function main() {
  const child = spawn(process.execPath, ["server.js"], {
    cwd: repoRoot,
    env: {
      ...process.env,
      CODEX_UI_PORT: String(port),
    },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });

  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (chunk) => {
    stdout += chunk.toString("utf8");
  });
  child.stderr.on("data", (chunk) => {
    stderr += chunk.toString("utf8");
  });

  try {
    const runtime = await waitForRuntime();

    const backendRun = await execNdjson(runtime, {
      prompt: "Return exactly one line: backend-ok",
      agentName: "backend_worker",
      sandboxMode: "read-only",
      approvalPolicy: "never",
      forceNewSession: true,
      executionProfile: "smoke-test",
      executionIntent: "smoke-http-exec",
      executionSource: "api_exec",
      requestUserInputPolicy: "blocked",
      modelReasoningEffort: "low",
    });

    const frontendRun = await execNdjson(runtime, {
      prompt: "Return exactly one line: frontend-ok",
      agentName: "frontend_worker",
      sandboxMode: "read-only",
      approvalPolicy: "never",
      forceNewSession: true,
      executionProfile: "smoke-test",
      executionIntent: "smoke-http-exec",
      executionSource: "api_exec",
      requestUserInputPolicy: "blocked",
      modelReasoningEffort: "low",
    });

    const runtimeAfterAgents = await waitForRuntime();
    const backendAgent = findAgent(runtimeAfterAgents, "backend_worker");
    const frontendAgent = findAgent(runtimeAfterAgents, "frontend_worker");

    const detachKey = `ai-debate-detach-${crypto.randomUUID()}`;
    const detachedRun = await execNdjson(runtime, {
      prompt: "Write 24 short numbered Japanese lines about commuter rail. Do not edit files.",
      agentName: "backend_worker",
      sandboxMode: "read-only",
      approvalPolicy: "never",
      forceNewSession: true,
      executionProfile: "smoke-test",
      executionIntent: "smoke-http-exec",
      executionSource: "app_ai_debate_chat",
      requestUserInputPolicy: "blocked",
      modelReasoningEffort: "low",
      idempotencyKey: detachKey,
    }, { abortOnFirstDelta: true });

    const detachOutcome = await pollIdempotency(runtime, detachKey);

    const result = {
      ac1: {
        backendAccepted: backendRun.statusCode === 200,
        frontendAccepted: frontendRun.statusCode === 200,
        backendStarted: backendRun.events.find((entry) => entry && entry.type === "turn" && entry.phase === "started") || null,
        frontendStarted: frontendRun.events.find((entry) => entry && entry.type === "turn" && entry.phase === "started") || null,
        backendStatus: backendRun.events.filter((entry) => entry && entry.type === "status").slice(-1)[0] || null,
        frontendStatus: frontendRun.events.filter((entry) => entry && entry.type === "status").slice(-1)[0] || null,
        runtimeBackendAgent: backendAgent,
        runtimeFrontendAgent: frontendAgent,
        independentThreadIds: Boolean(
          backendAgent && frontendAgent && backendAgent.threadId && frontendAgent.threadId && backendAgent.threadId !== frontendAgent.threadId
        ),
      },
      ac2: {
        detachedRequestAbortedByClient: detachedRun.aborted,
        idempotency: detachOutcome.idempotency,
        turn: detachOutcome.turn || null,
        completedAfterClientAbort: Boolean(
          detachOutcome && detachOutcome.idempotency && detachOutcome.idempotency.outcome && detachOutcome.idempotency.outcome.status === "completed"
        ),
      },
    };

    console.log(JSON.stringify(result, null, 2));
  } finally {
    child.kill("SIGTERM");
    await sleep(1500);
    if (!child.killed) {
      child.kill("SIGKILL");
    }
    if (process.env.AI_DEBATE_BACKEND_CHECK_DEBUG === "1") {
      process.stderr.write(stdout);
      process.stderr.write(stderr);
    }
  }
}

main().catch((error) => {
  console.error(error && error.stack ? error.stack : String(error));
  process.exit(1);
});
