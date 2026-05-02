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
      executionProfile: "slash-runtime-test",
      executionIntent: "harnesui-representative-slash-command",
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
    await expectSlashOutput(harness, "/help", ["Supported slash commands:", "/status", "/diff", "/resume --last"]);
    const statusOutput = await expectSlashOutput(harness, "/status", [
      ">_ OpenAI Codex (",
      "Visit https://chatgpt.com/codex/settings/usage",
      /Model:\s+gpt-5\.5 \(reasoning xhigh\)/,
      /Directory:\s+.+codex_Original_UI_PJ_with-Harnes/,
      /Permissions:\s+workspace-write \(approval on-request\)/,
      /AGENTS\.md:\s+AGENTS\.md/,
      "Account:",
      /Collaboration mode:\s+Default/,
      /Session:\s+none/,
      /Agent:\s+default/,
      /gpt-5\.3-Codex-Spark limit:\s+unavailable in HarnesUI local status/,
      "native quota bars are not exposed by the local app-server.",
    ]);
    assert(!statusOutput.startsWith("Codex status:"), "/status must not regress to the simplified HarnesUI status body");
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
