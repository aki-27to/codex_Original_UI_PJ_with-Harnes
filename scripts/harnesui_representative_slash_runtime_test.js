"use strict";

const assert = require("assert");
const http = require("http");
const path = require("path");
const { requestJson, startHarnessForPhase1 } = require("./lib/harness_api_client");

const workspaceRoot = path.resolve(__dirname, "..");

let slashRequestCounter = 0;

function nextSlashIdempotencyKey() {
  slashRequestCounter += 1;
  return `slash-runtime-${Date.now()}-${slashRequestCounter}`;
}

function postExecText({ port, authHeaders, prompt, idempotencyKey = "", timeoutMs = 60000 }) {
  return new Promise((resolve, reject) => {
    const requestBody = {
      prompt,
      agent: "default",
      cwd: workspaceRoot,
      executionProfile: "slash-runtime-test",
      executionIntent: "harnesui-representative-slash-command",
      executionSource: "harnesui",
      requestUserInputPolicy: "blocked",
      sandboxMode: "workspace-write",
      approvalPolicy: "on-request",
      webSearchMode: "disabled",
    };
    if (idempotencyKey) {
      requestBody.idempotencyKey = idempotencyKey;
    }
    const body = JSON.stringify(requestBody);
    const req = http.request(
      {
        hostname: "127.0.0.1",
        port,
        path: "/api/exec",
        method: "POST",
        timeout: timeoutMs,
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          "Content-Length": Buffer.byteLength(body),
          ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
          ...(authHeaders || {}),
        },
      },
      (res) => {
        let raw = "";
        const events = [];
        res.on("data", (chunk) => {
          raw += chunk.toString("utf8");
        });
        res.on("end", () => {
          for (const line of raw.split(/\r?\n/)) {
            const trimmed = line.trim();
            if (!trimmed) continue;
            try {
              events.push(JSON.parse(trimmed));
            } catch {
              // Local slash commands intentionally return plain text, not turn stream JSON.
            }
          }
          resolve({ statusCode: Number(res.statusCode || 0), raw, events });
        });
      }
    );
    req.on("timeout", () => req.destroy(new Error(`POST /api/exec timed out for ${prompt}`)));
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

async function expectSlashOutput(harness, prompt, checks) {
  const idempotencyKey = nextSlashIdempotencyKey();
  const result = await postExecText({ port: harness.port, authHeaders: harness.authHeaders, prompt, idempotencyKey });
  assert.strictEqual(result.statusCode, 200, `${prompt} must return HTTP 200`);
  assert.strictEqual(result.events.length, 0, `${prompt} must be handled as a local slash command, not an ordinary turn stream`);
  for (const check of checks) {
    if (check instanceof RegExp) {
      assert(check.test(result.raw), `${prompt} output must match ${check}\nActual output:\n${result.raw}`);
      continue;
    }
    assert(
      result.raw.includes(check),
      `${prompt} output must include ${JSON.stringify(check)}\nActual output:\n${result.raw}`
    );
  }
  assert(
    !/mock turn|turn\/start|assistant final/i.test(result.raw),
    `${prompt} must not fall through to ordinary model turn output`
  );

  const idempotencyRes = await requestJson({
    port: harness.port,
    path: `/api/exec/idempotency/${encodeURIComponent(idempotencyKey)}?wait_ms=1000`,
    headers: harness.authHeaders,
  });
  assert.strictEqual(idempotencyRes.statusCode, 200, `${prompt} idempotency lookup must return HTTP 200`);
  assert(idempotencyRes.json && idempotencyRes.json.idempotency, `${prompt} idempotency lookup must return a snapshot`);
  assert.strictEqual(
    idempotencyRes.json.idempotency.lifecycleState,
    "completed",
    `${prompt} local slash command must resolve idempotency as completed`
  );
  assert.strictEqual(
    idempotencyRes.json.idempotency.outcome && idempotencyRes.json.idempotency.outcome.taskOutcomeStatus,
    "COMPLETED",
    `${prompt} local slash command must expose a completed task outcome`
  );

  const runtimeRes = await requestJson({
    port: harness.port,
    path: "/api/runtime",
    headers: harness.authHeaders,
  });
  assert.strictEqual(runtimeRes.statusCode, 200, `${prompt} runtime lookup must return HTTP 200`);
  const activeExecRequests = Number(runtimeRes.json && runtimeRes.json.activeExecRequests);
  assert.strictEqual(activeExecRequests, 0, `${prompt} must not leave activeExecRequests running`);
  return result.raw;
}

async function main() {
  const port = Number(process.env.CODEX_HARNESUI_SLASH_TEST_PORT || 57634);
  const harness = await startHarnessForPhase1({
    workspaceRoot,
    port,
    envOverrides: {
      CODEX_APP_SERVER_TRANSPORT: "mock-fixture",
      CODEX_DEFAULT_EXEC_AGENT: "default",
      CODEX_REQUEST_USER_INPUT_POLICY: "blocked",
    },
  });
  try {
    await expectSlashOutput(harness, "/help", ["Supported slash commands:", "/status", "Show Codex status-style runtime details in the HarnesUI view.", "/diff", "/resume --last"]);
    const statusOutput = await expectSlashOutput(harness, "/status", [
      ">_ OpenAI Codex (",
      "Visit https://chatgpt.com/codex/settings/usage",
      /Model:\s+gpt-5\.5 \(reasoning xhigh, summaries auto\)/,
      /Directory:\s+.+codex_Original_UI_PJ_with-Harnes/,
      /Permissions:\s+Workspace \(auto-review\)/,
      /Agents\.md:\s+AGENTS\.md/,
      "Account:",
      /Collaboration mode:\s+Default/,
      /Session:\s+none/,
      /Context window:\s+.+/,
      /5h limit:\s+open usage link above for live value/,
      /Weekly limit:\s+open usage link above for live value/,
      "GPT-5.3-Codex-Spark limit:",
      "limits may be stale - run /status again shortly.",
    ]);
    assert(!statusOutput.startsWith("Codex status:"), "/status must not regress to the simplified HarnesUI status body");
    assert(!/HarnesUI local runtime snapshot|Status source:|Native \/status:|Web search:|Fast mode:|Goal:/.test(statusOutput), "/status must not keep the old local-snapshot-only surface");
    await expectSlashOutput(harness, "/diff", [/D I F F|No changes detected\./]);
    await expectSlashOutput(harness, "/fast status", ["Fast mode:", "Usage: /fast"]);
    await expectSlashOutput(harness, "/agent list", ["agents:", "default"]);
    await expectSlashOutput(harness, "/resume --last", [/No saved session found\.|Resume target set:/]);
    await expectSlashOutput(harness, "/fork slash-ui-test", ["Fork created: slash-ui-test", "Source:"]);
  } finally {
    await harness.handle.stop();
  }
  process.stdout.write("PASS harnesui_representative_slash_runtime_test\n");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
