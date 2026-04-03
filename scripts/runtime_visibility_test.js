#!/usr/bin/env node
"use strict";

const assert = require("assert");
const path = require("path");

const workspaceRoot = path.resolve(__dirname, "..");
const server = require(path.join(workspaceRoot, "server.js"));

function main() {
  const runtimeVisibility = server.__runtimeVisibility || {};
  assert.strictEqual(typeof runtimeVisibility.buildTurnVisibilitySnapshot, "function", "buildTurnVisibilitySnapshot must be exposed for internal runtime diagnostics");

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
}

main();
