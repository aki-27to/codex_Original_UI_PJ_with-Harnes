"use strict";

const assert = require("assert");
const { __codexModes } = require("../server");

function testNormalizeWebSearchMode() {
  assert(__codexModes, "server should export codex mode internals");
  assert.strictEqual(__codexModes.normalizeWebSearchMode("cached"), "cached", "cached mode should remain cached");
  assert.strictEqual(__codexModes.normalizeWebSearchMode("live"), "live", "live mode should remain live");
  assert.strictEqual(__codexModes.normalizeWebSearchMode("disabled"), "disabled", "disabled mode should remain disabled");
  assert.strictEqual(__codexModes.normalizeWebSearchMode(true), "live", "legacy boolean true should map to live");
  assert.strictEqual(__codexModes.normalizeWebSearchMode(false), "disabled", "legacy boolean false should map to disabled");
  assert.strictEqual(__codexModes.isWebSearchEnabledForMode("cached"), true, "cached mode should count as enabled");
  assert.strictEqual(__codexModes.isWebSearchEnabledForMode("live"), true, "live mode should count as enabled");
  assert.strictEqual(__codexModes.isWebSearchEnabledForMode("disabled"), false, "disabled mode should count as disabled");
}

function testBuildThreadStartConfigCarriesExactWebSearchMode() {
  const state = __codexModes.createBaseAgentState();
  const cachedConfig = __codexModes.buildThreadStartConfig(state, "cached", "blocked", "gpt-5.4", "medium", false, true);
  const liveConfig = __codexModes.buildThreadStartConfig(state, "live", "blocked", "gpt-5.4", "medium", false, true);
  const disabledConfig = __codexModes.buildThreadStartConfig(state, "disabled", "blocked", "gpt-5.4", "medium", false, true);
  assert.strictEqual(cachedConfig.web_search, "cached", "thread/start should preserve cached web search mode");
  assert.strictEqual(liveConfig.web_search, "live", "thread/start should preserve live web search mode");
  assert.strictEqual(disabledConfig.web_search, "disabled", "thread/start should preserve disabled web search mode");
}

function run() {
  testNormalizeWebSearchMode();
  console.log("[web-search-mode-policy-test] PASS normalize web search mode");
  testBuildThreadStartConfigCarriesExactWebSearchMode();
  console.log("[web-search-mode-policy-test] PASS buildThreadStartConfig carries exact web search mode");
  console.log("PASS");
}

run();
