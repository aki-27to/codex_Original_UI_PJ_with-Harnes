#!/usr/bin/env node
"use strict";

const assert = require("assert");
const fs = require("fs");
const http = require("http");
const path = require("path");
const { spawnSync } = require("child_process");
const { loadEvalLanePolicy, loadEvalSuiteForLane } = require("./lib/eval_lane_policy");
const { requestJson, startHarnessForPhase1 } = require("./lib/harness_api_client");
const { runPublicRegression } = require("./run_public_regression");

const workspaceRoot = path.resolve(__dirname, "..");
const publicRegressionOverlayBaseline = {
  schema: "harness-eval-suite.v1",
  suiteId: "public-regression-overlay.v1",
  kind: "conformance",
  description: "Phase 1 hardening overlay cases for public regression.",
  cases: [
    {
      id: "phase1_overlay_task_outcome_green",
      title: "Phase 1 overlay baseline stays green",
      driver: "task_outcome_probe",
      input: {
        turnStatus: "completed",
      },
      expect: {
        mode: "json_fields",
        fields: {
          status: "COMPLETED",
          reason: "completed_default",
        },
      },
      weight: 1,
      tags: ["phase1", "overlay"],
    },
  ],
};

function resetPublicRegressionOverlay() {
  const overlayPath = path.join(workspaceRoot, "scripts", "config", "public_regression_overlay.json");
  fs.writeFileSync(overlayPath, `${JSON.stringify(publicRegressionOverlayBaseline, null, 2)}\n`, "utf8");
  return overlayPath;
}

function runNodeScript(scriptPath, args = [], env = {}) {
  return spawnSync(process.execPath, [scriptPath, ...args], {
    cwd: workspaceRoot,
    env: {
      ...process.env,
      ...env,
    },
    encoding: "utf8",
  });
}

function requestExecStream({ port, headers = {}, body, timeoutMs = 120000 }) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body || {});
    const req = http.request(
      {
        hostname: "127.0.0.1",
        port,
        path: "/api/exec",
        method: "POST",
        timeout: timeoutMs,
        headers: {
          ...(headers && typeof headers === "object" ? headers : {}),
          "Content-Type": "application/json; charset=utf-8",
          "Content-Length": Buffer.byteLength(payload),
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
              // ignore malformed lines
            }
          }
          resolve({
            statusCode: Number(res.statusCode || 0),
            raw,
            events,
            finalEvent: events.filter((entry) => entry && entry.type === "final").slice(-1)[0] || null,
            statusEvent: events.filter((entry) => entry && entry.type === "status").slice(-1)[0] || null,
            turnCompleted: events.find((entry) => entry && entry.type === "turn" && entry.phase === "completed") || null,
          });
        });
      }
    );
    req.on("timeout", () => req.destroy(new Error("POST /api/exec timed out")));
    req.on("error", reject);
    req.write(payload);
    req.end();
  });
}

async function runExecSmoke() {
  const harness = await startHarnessForPhase1({
    workspaceRoot,
    proofRoot: path.join(workspaceRoot, "logs", "archive", "raw", "phase1_runs", `e2e-exec-${Date.now()}`),
    port: 57575,
  });
  try {
    const res = await requestExecStream({
      port: harness.port,
      headers: harness.authHeaders,
      body: {
        prompt: "Reply with exactly: ACK",
        agentName: "default",
        executionProfile: "phase1-e2e",
        requestUserInputPolicy: "blocked",
      },
      timeoutMs: 120000,
    });
    assert.strictEqual(res.statusCode, 200, `exec should return 200 (${res.raw})`);
    assert(res.statusEvent && res.statusEvent.status === "completed", `exec should complete (${res.raw})`);
    assert(res.turnCompleted && res.turnCompleted.taskOutcomeStatus === "COMPLETED", `exec should produce completed task outcome (${res.raw})`);
    assert.strictEqual(String(res.finalEvent && res.finalEvent.text || "").trim(), "ACK", "exec should satisfy exact ACK contract");
  } finally {
    await harness.handle.stop();
  }
}

async function main() {
  const overlayPath = resetPublicRegressionOverlay();
  const overlayBaseline = fs.readFileSync(overlayPath, "utf8");

  await runExecSmoke();
  const publicPass = await runPublicRegression({
    actor: "ci",
    label: "phase1-e2e-public-pass",
    port: 57576,
  });
  assert.strictEqual(publicPass.ok, true, "public regression should pass on baseline");

  const applyResult = runNodeScript(path.join(workspaceRoot, "scripts", "self_improvement_apply.js"), ["--lane=openai_blog", "--simulate-break=public_overlay"]);
  assert.notStrictEqual(applyResult.status, 0, "simulated broken apply should fail and rollback");
  assert(/ROLLED_BACK/i.test(`${applyResult.stdout}\n${applyResult.stderr}`), "apply output should mention rollback");

  const overlayAfterRollback = fs.readFileSync(overlayPath, "utf8");
  assert.strictEqual(overlayAfterRollback, overlayBaseline, "public regression overlay should be restored after rollback");

  const publicRecovered = await runPublicRegression({
    actor: "ci",
    label: "phase1-e2e-public-recovered",
    port: 57577,
  });
  assert.strictEqual(publicRecovered.ok, true, "public regression should pass again after rollback");

  let denied = false;
  try {
    const policy = loadEvalLanePolicy(undefined, { workspaceRoot });
    loadEvalSuiteForLane({ policy, laneId: "hidden_holdout", actor: "optimizer", env: process.env });
  } catch (error) {
    denied = /eval_lane_access_denied/.test(error instanceof Error ? error.message : String(error));
  }
  assert.strictEqual(denied, true, "optimizer should be denied holdout access");

  console.log("PASS phase1_hardening_e2e_test");
}

main().catch((error) => {
  console.error("FAIL phase1_hardening_e2e_test");
  console.error(error && error.stack ? error.stack : String(error));
  process.exitCode = 1;
});
