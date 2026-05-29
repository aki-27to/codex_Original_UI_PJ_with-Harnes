"use strict";

const assert = require("assert");
const fs = require("fs");
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

function getRuntimeJson({ port, authHeaders, timeoutMs = 30000 }) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: "127.0.0.1",
        port,
        path: "/api/runtime",
        method: "GET",
        timeout: timeoutMs,
        headers: {
          ...(authHeaders || {}),
        },
      },
      (res) => {
        let raw = "";
        res.on("data", (chunk) => {
          raw += chunk.toString("utf8");
        });
        res.on("end", () => {
          try {
            resolve({ statusCode: Number(res.statusCode || 0), body: raw ? JSON.parse(raw) : {} });
          } catch (error) {
            reject(error);
          }
        });
      }
    );
    req.on("timeout", () => req.destroy(new Error("GET /api/runtime timed out")));
    req.on("error", reject);
    req.end();
  });
}

function readGoalPreflightRuntimeArtifact() {
  return JSON.parse(fs.readFileSync(path.join(workspaceRoot, "runtime", "goal_preflight.json"), "utf8"));
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
    await expectSlashOutput(harness, `/goal ${objective}`, ["Codex goal: active", `Objective: ${objective}`, "Goal preflight: FAILED_VALIDATION", "Ready for long run: no"]);
    let preflight = readGoalPreflightRuntimeArtifact();
    assert.strictEqual(preflight.status, "FAILED_VALIDATION", "one-line /goal must fail goal preflight");
    assert.strictEqual(preflight.readyForLongRun, false, "one-line /goal must not be ready for long-run execution");

    const structuredObjective = "Structured slash goal runtime objective";
    const structuredGoal = JSON.stringify({
      objective: structuredObjective,
      endState: "The runtime exposes a ready goal preflight artifact and /api/runtime current truth.",
      statedChecks: [
        "command: npm run test:harnesui-goal-runtime",
        "api: GET /api/runtime currentTruth.goalPreflight.status",
      ],
      constraints: ["No new route outside /api/exec slash handling."],
      nonGoals: ["Do not mark whole-program readiness complete."],
      evaluator: "package-visible slash runtime test",
      evidencePlan: ["runtime/goal_preflight.json", "GET /api/runtime"],
      stopControls: ["fail when the preflight status is not READY_FOR_LONG_RUN"],
    });
    await expectSlashOutput(harness, `/goal ${structuredGoal}`, ["Codex goal: active", `Objective: ${structuredObjective}`, "Goal preflight: READY_FOR_LONG_RUN", "Ready for long run: yes"]);
    preflight = readGoalPreflightRuntimeArtifact();
    assert.strictEqual(preflight.status, "READY_FOR_LONG_RUN", "structured /goal must pass goal preflight");
    assert.strictEqual(preflight.readyForLongRun, true, "structured /goal must be ready for long-run execution");
    const runtime = await getRuntimeJson({ port: harness.port, authHeaders: harness.authHeaders });
    assert.strictEqual(runtime.statusCode, 200, "GET /api/runtime must return HTTP 200");
    assert.strictEqual(
      runtime.body.currentTruth && runtime.body.currentTruth.goalPreflight && runtime.body.currentTruth.goalPreflight.status,
      "READY_FOR_LONG_RUN",
      "GET /api/runtime must expose goal preflight current truth"
    );

    await expectSlashOutput(harness, "/goal", ["Codex goal: active", `Objective: ${structuredObjective}`, "Goal preflight: READY_FOR_LONG_RUN"]);
    await expectSlashOutput(harness, "/goal status", ["Codex goal: active", `Objective: ${structuredObjective}`, "Goal preflight: READY_FOR_LONG_RUN"]);
    await expectSlashOutput(harness, "/goal pause", ["Codex goal: paused", `Objective: ${structuredObjective}`, "Goal preflight: READY_FOR_LONG_RUN"]);
    await expectSlashOutput(harness, "/goal resume", ["Codex goal: active", `Objective: ${structuredObjective}`, "Goal preflight: READY_FOR_LONG_RUN"]);
    await expectSlashOutput(harness, "/goal complete", ["Codex goal: complete", `Objective: ${structuredObjective}`, "Goal preflight: READY_FOR_LONG_RUN"]);
    await expectSlashOutput(harness, "/goal clear", ["Codex goal cleared.", "Thread:", "Goal preflight: CLEARED"]);
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
