#!/usr/bin/env node
"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const serverPath = path.join(__dirname, "..", "server_impl.js");
const source = fs.readFileSync(serverPath, "utf8");

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
  const sessionPerformanceByRef = new Map();
  const context = {
    Math,
    Number,
    String,
    sessionPerformanceByRef,
    latestTurnSnapshot: null,
    safeString(value, max = 12000) {
      if (typeof value !== "string") return "";
      const trimmed = value.trim();
      if (!trimmed) return "";
      return trimmed.slice(0, max);
    },
    toNonNegativeInt(value) {
      return Number.isFinite(Number(value)) ? Math.max(0, Math.trunc(Number(value))) : 0;
    },
  };
  vm.runInNewContext(
    [
      extractFunction("normalizeExecutionState"),
      extractFunction("normalizeTokenUsageTotals"),
      extractFunction("addTokenUsageTotals"),
      extractFunction("cloneSeries"),
      extractFunction("getSessionPerformanceSnapshot"),
      extractFunction("runtimeTurnSnapshotIsInProgress"),
      extractFunction("resolveRuntimeActiveTurnIdForSnapshot"),
      "this.helpers = { resolveRuntimeActiveTurnIdForSnapshot };",
    ].join("\n\n"),
    context
  );
  return { context, ...context.helpers };
}

function run() {
  const { context, resolveRuntimeActiveTurnIdForSnapshot } = loadHelpers();

  const liveState = {
    sessionRef: "thread-live",
    threadId: "thread-live",
    activeTurnId: "turn-live",
  };
  context.sessionPerformanceByRef.set("thread-live", {
    sessionRef: "thread-live",
    agentName: "default@chat-1",
    turnsCompleted: 0,
    cumulativeUsage: {},
    cumulativeProcessingMs: 0,
    history: { tokens: [], processingMs: [], at: [] },
    inFlight: {
      turnId: "turn-live",
      startedAt: 100,
      tokenUsage: {},
      updatedAt: 120,
    },
    updatedAt: 130,
  });
  assert.strictEqual(
    resolveRuntimeActiveTurnIdForSnapshot(liveState),
    "turn-live",
    "live session performance must preserve activeTurnId"
  );

  const staleState = {
    sessionRef: "thread-stale",
    threadId: "thread-stale",
    activeTurnId: "turn-stale",
  };
  context.latestTurnSnapshot = {
    thread_id: "thread-stale",
    turn_id: "turn-stale",
    status: "completed",
  };
  assert.strictEqual(
    resolveRuntimeActiveTurnIdForSnapshot(staleState),
    null,
    "terminal snapshots without corroborating live state must drop stale activeTurnId"
  );
  assert.strictEqual(staleState.activeTurnId, null, "stale activeTurnId should be cleared from agent state");

  const startupRaceState = {
    sessionRef: "thread-race",
    threadId: "thread-race",
    activeTurnId: "turn-race",
  };
  context.latestTurnSnapshot = {
    thread_id: "thread-race",
    turn_id: "turn-race",
    status: "in_progress",
  };
  assert.strictEqual(
    resolveRuntimeActiveTurnIdForSnapshot(startupRaceState),
    "turn-race",
    "matching in-progress latest snapshots should preserve activeTurnId during startup races"
  );

  console.log("[runtime-active-turn-cleanup-test] PASS");
  console.log("PASS");
}

try {
  run();
} catch (error) {
  console.log(`[runtime-active-turn-cleanup-test] FAIL ${error instanceof Error ? error.message : String(error)}`);
  console.log("FAIL");
  process.exitCode = 1;
}
