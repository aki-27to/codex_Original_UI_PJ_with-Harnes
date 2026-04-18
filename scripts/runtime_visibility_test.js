#!/usr/bin/env node
"use strict";

const assert = require("assert");
const { spawnSync } = require("child_process");
const path = require("path");

const workspaceRoot = path.resolve(__dirname, "..");
const server = require(path.join(workspaceRoot, "server.js"));

function main() {
  const runtimeVisibility = server.__runtimeVisibility || {};
  assert.strictEqual(typeof runtimeVisibility.buildTurnVisibilitySnapshot, "function", "buildTurnVisibilitySnapshot must be exposed for internal runtime diagnostics");
  assert.strictEqual(typeof runtimeVisibility.buildFullUtilizationDefaultsSnapshot, "function", "buildFullUtilizationDefaultsSnapshot must be exposed for runtime posture diagnostics");

  const normalTurn = runtimeVisibility.buildTurnVisibilitySnapshot({
    requestProfile: "standard",
    executionIntent: "interactive",
    requestUserInputPolicy: "auto-default",
    agentName: "default",
  });
  assert.strictEqual(normalTurn.turn.ready, 1, "standard autonomy-first turns should be ready");
  assert.strictEqual(normalTurn.turn.checks.requestUserInputMatchesLane, 1, "standard turns should match the autonomy-first lane");

  const signoffTurn = runtimeVisibility.buildTurnVisibilitySnapshot({
    requestProfile: "proof-runtime",
    executionIntent: "signoff_sample",
    requestUserInputPolicy: "blocked",
    agentName: "default",
  });
  assert.strictEqual(signoffTurn.turn.ready, 1, "strict signoff turns should remain ready when blocked is intentional");
  assert.strictEqual(signoffTurn.turn.checks.strictUserInputLane, 1, "proof/signoff turns should be recognized as strict lanes");
  assert.strictEqual(signoffTurn.turn.checks.requestUserInputMatchesLane, 1, "strict turns should match the blocked lane");

  const fullUtilization = runtimeVisibility.buildFullUtilizationDefaultsSnapshot();
  assert.strictEqual(fullUtilization.expected.requestUserInputPolicy, fullUtilization.actual.requestUserInputPolicy, "runtime full-utilization posture should mirror the active runtime lane");
  assert(["blocked", "auto-default"].includes(fullUtilization.actual.requestUserInputPolicy), "runtime full-utilization posture should stay on a governed input lane");
  assert.strictEqual(fullUtilization.ready, 1, "runtime full-utilization posture should remain ready on governed runtime lanes");

  const blockedProbe = spawnSync(
    process.execPath,
    [
      "-e",
      [
        `const server = require(${JSON.stringify(path.join(workspaceRoot, "server.js"))});`,
        "process.stdout.write(JSON.stringify(server.__runtimeVisibility.buildFullUtilizationDefaultsSnapshot()));",
      ].join(" "),
    ],
    {
      cwd: workspaceRoot,
      encoding: "utf8",
      env: {
        ...process.env,
        CODEX_REQUEST_USER_INPUT_POLICY: "blocked",
      },
    }
  );
  assert.strictEqual(blockedProbe.status, 0, blockedProbe.stderr || "blocked full-utilization probe failed");
  const blockedFullUtilization = JSON.parse(blockedProbe.stdout || "{}");
  assert.strictEqual(blockedFullUtilization.expected.requestUserInputPolicy, "blocked", "blocked runtime probe should mark blocked as the expected signoff lane");
  assert.strictEqual(blockedFullUtilization.actual.requestUserInputPolicy, "blocked", "blocked runtime probe should report the active blocked policy");
  assert.strictEqual(blockedFullUtilization.checks.requestUserInputBlocked, 1, "blocked runtime probe should expose blocked-input confirmation");
  assert.strictEqual(blockedFullUtilization.ready, 1, "blocked runtime probe should remain ready under the governed signoff lane");
}

main();
