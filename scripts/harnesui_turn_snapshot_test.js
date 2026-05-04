#!/usr/bin/env node
"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const appPath = path.join(__dirname, "..", "web", "01.HarnesUI", "app.js");
const source = fs.readFileSync(appPath, "utf8");

function extractFunction(name) {
  const signature = `function ${name}(`;
  const start = source.indexOf(signature);
  assert(start >= 0, `${name} helper not found`);
  let parenDepth = 0;
  let bodyStart = -1;
  for (let index = start + signature.length - 1; index < source.length; index += 1) {
    const char = source[index];
    if (char === "(") {
      parenDepth += 1;
      continue;
    }
    if (char === ")") {
      parenDepth -= 1;
      continue;
    }
    if (char === "{" && parenDepth === 0) {
      bodyStart = index;
      break;
    }
  }
  assert(bodyStart >= 0, `${name} helper body not found`);
  let depth = 0;
  for (let index = bodyStart; index < source.length; index += 1) {
    const char = source[index];
    if (char === "{") depth += 1;
    if (char === "}") {
      depth -= 1;
      if (depth === 0) return source.slice(start, index + 1);
    }
  }
  throw new Error(`failed to extract ${name}`);
}

function loadHelpers() {
  const context = {
    JSON,
    Math,
    Number,
    Object,
    String,
    lowerText(value) {
      return String(value || "").toLowerCase();
    },
    normalizeAgentNameForUi(name) {
      return typeof name === "string" ? name.trim().toLowerCase() : "";
    },
    toPerfInt(value) {
      return Number.isFinite(Number(value)) ? Math.max(0, Math.trunc(Number(value))) : 0;
    },
  };
  vm.runInNewContext(
    [
      extractFunction("runtimeTurnStatusForUi"),
      extractFunction("runtimeTurnThreadIdForUi"),
      extractFunction("runtimeTurnIdForUi"),
      extractFunction("runtimeTurnAgentForUi"),
      extractFunction("runtimeTurnIsTerminalForUi"),
      extractFunction("runtimeTurnCompletedAtForUi"),
      extractFunction("planningContextForUi"),
      extractFunction("cloneJsonForUi"),
      extractFunction("taskOutcomeStatusForUi"),
      extractFunction("taskOutcomeReasonForUi"),
      extractFunction("captureTurnSnapshotForUi"),
      "this.helpers={ runtimeTurnCompletedAtForUi, captureTurnSnapshotForUi };",
    ].join("\n\n"),
    context
  );
  return context.helpers;
}

function run() {
  const { runtimeTurnCompletedAtForUi, captureTurnSnapshotForUi } = loadHelpers();

  const inProgressTurn = {
    terminal_status: "in_progress",
    agent_name: "default@chat-1",
    thread_id: "thread-1",
    turn_id: "turn-1",
    completed_at: 1700000000300,
    updated_at: 1700000000500,
  };
  assert.strictEqual(
    runtimeTurnCompletedAtForUi(inProgressTurn),
    0,
    "in_progress UI turns must not expose completed_at or updated_at as completion time"
  );
  const inProgressSnapshot = captureTurnSnapshotForUi(inProgressTurn);
  assert.strictEqual(
    Object.prototype.hasOwnProperty.call(inProgressSnapshot, "completed_at"),
    false,
    "in_progress turn snapshots must not persist completed_at"
  );
  assert.strictEqual(inProgressSnapshot.terminal_status, "in_progress", "in_progress status should remain visible");

  const completedTurn = {
    terminal_status: "completed",
    agent_name: "default@chat-1",
    thread_id: "thread-1",
    turn_id: "turn-1",
    updated_at: 1700000000800,
  };
  assert.strictEqual(
    runtimeTurnCompletedAtForUi(completedTurn),
    1700000000800,
    "terminal UI turns may use updated_at as completion time fallback"
  );
  assert.strictEqual(
    captureTurnSnapshotForUi(completedTurn).completed_at,
    1700000000800,
    "terminal turn snapshots should preserve completion time"
  );

  console.log("PASS harnesui_turn_snapshot_test");
}

try {
  run();
} catch (error) {
  console.error(`FAIL harnesui_turn_snapshot_test: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}
