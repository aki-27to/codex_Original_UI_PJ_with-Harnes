"use strict";

const assert = require("assert");
const http = require("http");
const path = require("path");
const { startHarnessForPhase1 } = require("./lib/harness_api_client");

const workspaceRoot = path.resolve(__dirname, "..");

function postExecText({ port, authHeaders, prompt, timeoutMs = 60000 }) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      prompt,
      agent: "default",
      cwd: workspaceRoot,
      executionProfile: "slash-goal-runtime-test",
      executionIntent: "harnesui-goal-slash-command",
      executionSource: "harnesui",
      requestUserInputPolicy: "blocked",
      sandboxMode: "workspace-write",
      approvalPolicy: "on-request",
      webSearchMode: "disabled",
    });
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
  const result = await postExecText({ port: harness.port, authHeaders: harness.authHeaders, prompt });
  assert.strictEqual(result.statusCode, 200, `${prompt} must return HTTP 200`);
  assert.strictEqual(result.events.length, 0, `${prompt} must be handled as a local slash command, not an ordinary turn stream`);
  for (const check of checks) {
    assert(
      result.raw.includes(check),
      `${prompt} output must include ${JSON.stringify(check)}\nActual output:\n${result.raw}`
    );
  }
  assert(
    !/mock turn|turn\/start|assistant final/i.test(result.raw),
    `${prompt} must not fall through to ordinary model turn output`
  );
  return result.raw;
}

async function main() {
  const port = Number(process.env.CODEX_HARNESUI_GOAL_TEST_PORT || 57630);
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
    const objective = "UI slash goal runtime objective";
    await expectSlashOutput(harness, `/goal ${objective}`, ["Codex goal: active", `Objective: ${objective}`]);
    await expectSlashOutput(harness, "/goal", ["Codex goal: active", `Objective: ${objective}`]);
    await expectSlashOutput(harness, "/goal status", ["Codex goal: active", `Objective: ${objective}`]);
    await expectSlashOutput(harness, "/goal pause", ["Codex goal: paused", `Objective: ${objective}`]);
    await expectSlashOutput(harness, "/goal resume", ["Codex goal: active", `Objective: ${objective}`]);
    await expectSlashOutput(harness, "/goal complete", ["Codex goal: complete", `Objective: ${objective}`]);
    await expectSlashOutput(harness, "/goal clear", ["Codex goal cleared.", "Thread:"]);
    await expectSlashOutput(harness, "/goal", ["Codex goal: none"]);
  } finally {
    await harness.handle.stop();
  }
  process.stdout.write("PASS harnesui_goal_slash_runtime_test\n");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
