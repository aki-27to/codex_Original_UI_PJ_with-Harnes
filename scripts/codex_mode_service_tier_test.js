#!/usr/bin/env node
"use strict";

const assert = require("assert");
const { __codexModes } = require("../server");

function testNormalizeCodexServiceTier() {
  assert(__codexModes, "server should export codex mode internals");
  assert.strictEqual(__codexModes.normalizeCodexServiceTier("fast"), "fast", "fast should remain fast");
  assert.strictEqual(__codexModes.normalizeCodexServiceTier(" FLEX "), "flex", "flex should normalize case and whitespace");
  assert.strictEqual(__codexModes.normalizeCodexServiceTier("turbo"), "fast", "unknown service tier should fall back to repo default");
  assert.strictEqual(__codexModes.normalizeCodexServiceTier("", "flex"), "flex", "empty service tier should fall back");
}

function testBuildForkedAgentStateCarriesServiceTierAndModes() {
  const state = __codexModes.createBaseAgentState();
  state.sessionRef = "session-123";
  state.threadId = "thread-123";
  state.experimentalFeatures = new Set(["fast_mode", "guardian_approval"]);
  state.serviceTier = " FLEX ";
  state.fastModeEnabled = true;
  state.automaticApprovalReviewEnabled = true;
  state.lastSandboxMode = "danger-full-access";
  state.lastWebSearch = true;
  state.lastCwd = "C:/repo";
  state.lastRequestUserInputPolicy = "blocked";
  state.lastModel = "gpt-5";
  state.lastModelReasoningEffort = "medium";

  const forked = __codexModes.buildForkedAgentState(state, "default");
  assert.strictEqual(forked.forkedFrom, "default", "fork should remember source agent");
  assert.strictEqual(forked.sessionRef, "session-123", "fork should carry session ref");
  assert.strictEqual(forked.threadId, "thread-123", "fork should carry thread id");
  assert.strictEqual(forked.serviceTier, "flex", "fork should normalize and carry service tier");
  assert.strictEqual(forked.fastModeEnabled, true, "fork should carry fast mode state");
  assert.strictEqual(forked.automaticApprovalReviewEnabled, true, "fork should carry guardian approval state");
  assert.deepStrictEqual(Array.from(forked.experimentalFeatures), ["fast_mode", "guardian_approval"], "fork should carry experimental features");
}

async function run() {
  const tests = [
    ["normalize codex service tier", testNormalizeCodexServiceTier],
    ["build forked agent state carries service tier and mode toggles", testBuildForkedAgentStateCarriesServiceTierAndModes],
  ];
  let passed = 0;
  for (const [name, fn] of tests) {
    await fn();
    passed += 1;
    console.log(`[codex-mode-service-tier-test] PASS ${name}`);
  }
  console.log(`[codex-mode-service-tier-test] total=${tests.length} pass=${passed} fail=0`);
  console.log("PASS");
}

run().catch((error) => {
  console.log(`[codex-mode-service-tier-test] FAIL ${error instanceof Error ? error.message : String(error)}`);
  console.log("FAIL");
  process.exitCode = 1;
});
