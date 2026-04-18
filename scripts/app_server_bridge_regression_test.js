#!/usr/bin/env node
"use strict";

const assert = require("assert");
const path = require("path");

const serverModule = require("../server");

function main() {
  assert(serverModule.__codexModes, "server should expose codex mode internals");
  assert(serverModule.__riskAudit, "server should expose risk-audit internals");

  const {
    createBaseAgentState,
    derivePreviousPlanningContextForRequest,
    normalizeDirectoryPathIdentity,
    normalizeCodexMemoryMode,
    buildMemoryBridgeConfigEntries,
    buildThreadStartConfig,
  } = serverModule.__codexModes;
  const {
    createTurnStreamStats,
    collectTurnStreamItemStats,
    normalizeObservedTurnSignals,
  } = serverModule.__riskAudit;

  const cwd = process.cwd();
  const cwdUpper = process.platform === "win32" ? cwd.toUpperCase() : cwd;
  const cwdExtended = process.platform === "win32" ? `\\\\?\\${cwdUpper}\\` : `${cwd}/`;
  assert.strictEqual(
    normalizeDirectoryPathIdentity(cwd),
    normalizeDirectoryPathIdentity(cwdExtended),
    "cwd identity should absorb extended-length prefixes, case drift, and trailing separators"
  );

  const state = createBaseAgentState();
  state.lastPlanningContext = { selection: { selectedMode: "NORMAL" } };
  state.lastCwd = cwd;
  state.lastCwdKey = normalizeDirectoryPathIdentity(cwd);
  assert(
    derivePreviousPlanningContextForRequest(state, cwdExtended),
    "planning carryover should survive canonical cwd variants"
  );
  const otherDir = path.dirname(cwd);
  assert.strictEqual(
    derivePreviousPlanningContextForRequest(state, otherDir),
    null,
    "planning carryover should be cut when cwd identity changes"
  );

  assert.strictEqual(normalizeCodexMemoryMode("read-only"), "read_only", "memory mode aliases should normalize");
  const capabilitySnapshot = {
    features: {
      memoryMode: { status: "supported" },
      memoryReset: { status: "unsupported" },
    },
  };
  const bridge = buildMemoryBridgeConfigEntries("read_only", capabilitySnapshot);
  assert.strictEqual(bridge.appliedMode, "read_only", "supported memory mode should bridge through");
  assert.strictEqual(bridge.config["features.memories"], true, "memory bridge should enable memories");
  assert.strictEqual(bridge.config["memories.use_memories"], true, "read_only should still inject memories");
  assert.strictEqual(
    bridge.config["memories.generate_memories"],
    false,
    "read_only should suppress memory generation"
  );

  const bridgeState = createBaseAgentState();
  bridgeState.memoryMode = "disabled";
  bridgeState.capabilitySnapshot = capabilitySnapshot;
  const threadConfig = buildThreadStartConfig(bridgeState, "disabled", "blocked", "gpt-5.4", "medium", false, true);
  assert.strictEqual(threadConfig["features.memories"], false, "thread config should carry disabled memory bridge");
  assert.strictEqual(threadConfig["memories.use_memories"], false, "disabled memory bridge should suppress memory use");
  assert.strictEqual(
    threadConfig["memories.generate_memories"],
    false,
    "disabled memory bridge should suppress memory generation"
  );

  const stats = createTurnStreamStats();
  collectTurnStreamItemStats(stats, {
    type: "mcpToolCall",
    server: "openaiDeveloperDocs",
    tool: "search_openai_docs",
    status: "completed",
    durationMs: 45,
    sandboxState: "workspace-write",
    parallelSafe: true,
  });
  collectTurnStreamItemStats(stats, {
    type: "mcpToolCall",
    server: "codex_apps__github",
    tool: "list_pull_request_review_threads",
    status: "completed",
    durationMs: 15,
    metadata: { sandboxState: "read-only" },
    parallelSafe: false,
  });
  const observed = normalizeObservedTurnSignals(stats);
  assert.strictEqual(observed.mcpCalls, 2, "mcp call count should accumulate");
  assert.strictEqual(observed.mcpWallTimeMs, 60, "mcp wall time should sum durationMs");
  assert.strictEqual(observed.mcpPerServerCounts.openaiDeveloperDocs, 1, "per-server counts should track server names");
  assert.strictEqual(observed.mcpPerServerCounts.codex_apps__github, 1, "per-server counts should track multiple servers");
  assert(observed.mcpNamespaces.includes("openaideveloperdocs"), "namespace extraction should retain server namespace");
  assert(observed.mcpNamespaces.includes("codex_apps"), "compound server names should collapse to a stable namespace");
  assert(observed.mcpSandboxStates.includes("workspace_write"), "sandbox states should normalize separators");
  assert(observed.mcpSandboxStates.includes("read_only"), "sandbox states should include metadata-derived values");
  assert.strictEqual(observed.mcpParallelSafeCallCount, 1, "parallel-safe MCP calls should be counted");

  console.log("PASS app_server_bridge_regression_test");
}

main();
