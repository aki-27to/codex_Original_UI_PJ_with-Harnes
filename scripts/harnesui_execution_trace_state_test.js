#!/usr/bin/env node
"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const appPath = path.join(__dirname, "..", "web", "01.HarnesUI", "app.js");
const source = fs.readFileSync(appPath, "utf8");

function extractFunction(name) {
  const asyncSignature = `async function ${name}(`;
  const syncSignature = `function ${name}(`;
  const asyncStart = source.indexOf(asyncSignature);
  const syncStart = source.indexOf(syncSignature);
  const start = asyncStart >= 0 ? asyncStart : syncStart;
  assert(start >= 0, `${name} helper not found`);
  const signature = asyncStart >= 0 ? asyncSignature : syncSignature;
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
    Array,
    Map,
    Math,
    Number,
    Object,
    RegExp,
    Set,
    String,
    lowerText(value) {
      return String(value || "").toLowerCase();
    },
    normalizeAgentNameForUi(name) {
      return typeof name === "string" ? name.trim().toLowerCase() : "";
    },
    toArr(value) {
      return Array.isArray(value) ? value : [];
    },
    tt(ms) {
      return `T${Number.isFinite(Number(ms)) ? Math.trunc(Number(ms)) : 0}`;
    },
    t1(value) {
      return String(value || "").replace(/\s+/g, " ").trim();
    },
  };
  vm.runInNewContext(
    [
      extractFunction("monitorTone"),
      extractFunction("isRunningMonitorAgentForUi"),
      extractFunction("isFailedMonitorAgentForUi"),
      extractFunction("isCompletedMonitorAgentForUi"),
      extractFunction("traceTone"),
      extractFunction("monitorRowEventAtForUi"),
      extractFunction("executionTraceBucketForUi"),
      extractFunction("executionTraceStatusTextForUi"),
      extractFunction("executionTraceActivityForUi"),
      extractFunction("synthesizeTraceRowsForUi"),
      "this.helpers = { monitorTone, traceTone, executionTraceBucketForUi, executionTraceStatusTextForUi, synthesizeTraceRowsForUi };",
    ].join("\n\n"),
    context
  );
  return context.helpers;
}

function run() {
  const { monitorTone, traceTone, executionTraceBucketForUi, executionTraceStatusTextForUi, synthesizeTraceRowsForUi } = loadHelpers();

  assert.strictEqual(monitorTone("completed"), "completed", "completed status must keep the completed tone");
  assert.strictEqual(monitorTone("needs_input"), "completed", "needs_input should surface as a completed-style resend-ready tone");
  assert.strictEqual(monitorTone("spawned"), "running", "spawned child agents should stay in the running tone");
  assert.strictEqual(traceTone("needs_input"), "completed", "needs_input trace rows should stay in the resend-ready lane");

  assert.strictEqual(
    executionTraceBucketForUi({
      row: { status: "completed", tone: "completed", activeTurnId: "" },
      pendingCount: 0,
      lastTrace: null,
    }),
    "completed",
    "completed topography rows must land in the completed execution-trace lane"
  );
  assert.strictEqual(
    executionTraceBucketForUi({
      row: { status: "failed", tone: "failed", activeTurnId: "" },
      pendingCount: 0,
      lastTrace: null,
    }),
    "failed",
    "failed topography rows must land in the failed execution-trace lane"
  );
  assert.strictEqual(
    executionTraceBucketForUi({
      row: { status: "needs_input", tone: "completed", activeTurnId: "" },
      pendingCount: 0,
      lastTrace: null,
    }),
    "completed",
    "needs_input topography rows should land in the resend-ready completed lane"
  );
  assert.strictEqual(
    executionTraceStatusTextForUi({
      bucket: "completed",
      row: { status: "needs_input" },
      pendingCount: 0,
      lastTrace: null,
    }),
    "再送可能",
    "needs_input rows should render resend-ready status text"
  );

  const synthesized = synthesizeTraceRowsForUi(
    [],
    [
      {
        name: "reviewer",
        status: "completed",
        tone: "completed",
        updatedAt: 123456,
        description: "No findings.",
      },
      {
        name: "tester",
        status: "failed",
        tone: "failed",
        updatedAt: 123400,
        description: "FAIL: verification error",
      },
    ],
    new Map(),
    "chat-1"
  );
  assert.strictEqual(synthesized.length, 2, "topography-only child outcomes should synthesize trace rows");
  assert.strictEqual(synthesized[0].agent, "reviewer", "newest synthesized trace row should stay sorted first");
  assert.strictEqual(synthesized[0].type, "completed", "completed child outcome should synthesize a completed trace row");
  assert.strictEqual(synthesized[1].type, "failed", "failed child outcome should synthesize a failed trace row");

  const resendReady = synthesizeTraceRowsForUi(
    [],
    [
      {
        name: "operator",
        status: "needs_input",
        tone: "completed",
        updatedAt: 123500,
        description: "Waiting for a quick confirmation.",
      },
    ],
    new Map(),
    "chat-1"
  );
  assert.strictEqual(resendReady.length, 1, "needs_input topography rows should still synthesize a trace row");
  assert.strictEqual(resendReady[0].type, "needs_input", "needs_input topography rows should preserve the needs_input event type");

  console.log("[harnesui-execution-trace-state-test] PASS");
  console.log("PASS");
}

try {
  run();
} catch (error) {
  console.log(`[harnesui-execution-trace-state-test] FAIL ${error instanceof Error ? error.message : String(error)}`);
  console.log("FAIL");
  process.exitCode = 1;
}
