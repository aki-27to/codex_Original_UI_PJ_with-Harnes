const fs = require("fs");
const path = require("path");
const http = require("http");

const repoRoot = path.resolve(__dirname, "..");
const { startInProcessHarnessServer } = require(path.join(repoRoot, "scripts", "lib", "in_process_harness_server.js"));

const harnessMemoryPath = path.join(repoRoot, "logs", "archive", "raw", "harness_execution_memory.json");
const evalHistoryPath = path.join(repoRoot, "logs", "archive", "raw", "eval_runs.jsonl");
const turnArtifactsDir = path.join(repoRoot, "logs", "archive", "raw", "turns");
const operationLogPath = path.join(repoRoot, "logs", "archive", "raw", "operation_logs", "codex_ops.jsonl");
const latestRunSummaryPath = path.join(repoRoot, "logs", "current", "latest_run_summary.json");

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function requestJson({ port, requestPath, method = "GET", headers = {}, body = null, timeoutMs = 15000 }) {
  return new Promise((resolve, reject) => {
    const payload = body == null ? "" : JSON.stringify(body);
    const request = http.request(
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
      (response) => {
        let raw = "";
        response.on("data", (chunk) => {
          raw += chunk.toString("utf8");
        });
        response.on("end", () => {
          let json = null;
          try {
            json = raw ? JSON.parse(raw) : null;
          } catch {
            json = null;
          }
          resolve({ statusCode: Number(response.statusCode || 0), raw, json });
        });
      }
    );
    request.on("error", reject);
    request.setTimeout(timeoutMs, () => request.destroy(new Error(`timeout ${method} ${requestPath}`)));
    if (payload) request.write(payload);
    request.end();
  });
}

async function waitForRuntime(port, maxMs = 90000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < maxMs) {
    try {
      const response = await requestJson({ port, requestPath: "/api/runtime", timeoutMs: 4000 });
      if (response.statusCode === 200 && response.json && response.json.mode === "app-server") {
        return response.json;
      }
    } catch {
      // retry
    }
    await sleep(500);
  }
  throw new Error("runtime not ready");
}

function runExecViaHttp({ port, headers, body, timeoutMs = 240000 }) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body || {});
    const request = http.request(
      {
        hostname: "127.0.0.1",
        port,
        path: "/api/exec",
        method: "POST",
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          "Content-Length": Buffer.byteLength(payload),
          ...(headers || {}),
        },
        timeout: timeoutMs,
      },
      (response) => {
        let buffer = "";
        const events = [];
        response.on("data", (chunk) => {
          buffer += chunk.toString("utf8");
          const lines = buffer.split(/\r?\n/);
          buffer = lines.pop() || "";
          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed) continue;
            try {
              events.push(JSON.parse(trimmed));
            } catch {
              // ignore malformed stream rows
            }
          }
        });
        response.on("end", () => {
          resolve({ statusCode: Number(response.statusCode || 0), events, leftover: buffer });
        });
      }
    );
    request.on("error", reject);
    request.on("timeout", () => request.destroy(new Error("POST /api/exec timed out")));
    request.write(payload);
    request.end();
  });
}

async function waitForExecutionRecord(turnId, maxMs = 45000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < maxMs) {
    if (fs.existsSync(harnessMemoryPath)) {
      const parsed = JSON.parse(fs.readFileSync(harnessMemoryPath, "utf8"));
      const executionMemory = Array.isArray(parsed.executionMemory) ? parsed.executionMemory : [];
      const match = executionMemory.find((entry) => entry && entry.turnId === turnId);
      if (match) return match;
    }
    await sleep(500);
  }
  throw new Error(`execution record not found for ${turnId}`);
}

async function main() {
  const server = await startInProcessHarnessServer({
    CODEX_APP_SERVER_TRANSPORT: "mock-fixture",
    CODEX_HARNESS_MEMORY_PATH: harnessMemoryPath,
    CODEX_EVAL_HISTORY_PATH: evalHistoryPath,
    CODEX_TURN_ARTIFACTS_DIR: turnArtifactsDir,
    CODEX_OPERATION_LOG_PATH: operationLogPath,
  });
  try {
    const runtime = await waitForRuntime(server.port);
    const token = String(runtime && runtime.controlApi && runtime.controlApi.token || "");
    const tokenHeader = String(runtime && runtime.controlApi && runtime.controlApi.tokenHeader || "x-codex-control-token");
    if (!token) throw new Error("control token missing");

    const targetRel = "public/codex_live_dispatch_proof.html";
    const childMarker = `live web proof success ${Date.now()}`;
    const prompt = [
      "[FIXTURE_SCENARIO] LIVE_DISPATCH_PROOF",
      "# Goal",
      `Update only ${targetRel} with one governed proof marker and collect release evidence.`,
      "# Acceptance Criteria",
      "- Delegate the implementation-bearing edit to infra_worker.",
      "- Request independent read-only reviewer and tester checks before finalizing.",
      `Infra worker task: use apply_patch to append exactly one new line '${childMarker}' to ${targetRel}.`,
      `- Reviewer check: confirm only ${targetRel}, docs/CURRENT_ARCHITECTURE.md, and docs/ARCHITECTURE_CHANGELOG.md changed and the parent did not perform material implementation.`,
      `- Tester check: verify the new marker '${childMarker}' is present in ${targetRel}.`,
      "- Parent must not perform material implementation or edit any file directly.",
      "Do not use shell commands to edit files. Use apply_patch for the child edit only. Reviewer and tester must stay read-only. Do not modify any other file. Do not ask follow-up questions.",
      `After the child succeeds, reply with exactly: DISPATCH_OK ${targetRel}`,
    ].join("\n");

    const result = await runExecViaHttp({
      port: server.port,
      headers: {
        [tokenHeader]: token,
        Origin: `http://127.0.0.1:${server.port}`,
        Referer: `http://127.0.0.1:${server.port}/`,
      },
      body: {
        prompt,
        agentName: "default",
        sandboxMode: "workspace-write",
        approvalPolicy: "never",
        cwd: repoRoot,
        executionProfile: "full-runtime",
        executionIntent: "live_dispatch_proof",
        executionSource: "web_ui",
        forceNewSession: true,
        idempotencyKey: `live-web-success-${Date.now()}`,
      },
      timeoutMs: 420000,
    });

    const turnStarted = result.events.find((event) => event && event.type === "turn" && event.phase === "started") || null;
    const turnCompleted = result.events.find((event) => event && event.type === "turn" && event.phase === "completed") || null;
    const turn = turnCompleted || turnStarted;
    const record = turn && turn.turnId ? await waitForExecutionRecord(turn.turnId) : null;
    const latestRunSummary = fs.existsSync(latestRunSummaryPath)
      ? JSON.parse(fs.readFileSync(latestRunSummaryPath, "utf8"))
      : null;
    const liveFilePath = path.join(repoRoot, targetRel);
    const liveFileText = fs.existsSync(liveFilePath) ? fs.readFileSync(liveFilePath, "utf8") : "";

    console.log(JSON.stringify({
      turnStarted,
      turnCompleted,
      streamEvents: result.events,
      executionRecord: record,
      latestRunSummary,
      liveFileExists: fs.existsSync(liveFilePath),
      liveFileText,
    }, null, 2));
  } finally {
    await server.stop();
  }
}

main().catch((error) => {
  console.error(error && error.stack || String(error));
  process.exit(1);
});
