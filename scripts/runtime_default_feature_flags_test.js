#!/usr/bin/env node
"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { __codexModes } = require("../server");
const { startInProcessHarnessServer } = require("./lib/in_process_harness_server");

async function requestRuntime(port) {
  const response = await fetch(`http://127.0.0.1:${port}/api/runtime`, { cache: "no-store" });
  const json = await response.json();
  if (!response.ok) {
    throw new Error(json && json.error ? json.error : `runtime request failed: ${response.status}`);
  }
  return json;
}

function testCodexModeInternalsRespectDefaultsAndToggles() {
  assert(__codexModes, "server should export codex mode internals for regression tests");
  const state = __codexModes.createBaseAgentState();
  assert.strictEqual(state.experimentalEnabled, true, "base agent state should enable experimental features by default");
  assert.strictEqual(state.fastModeEnabled, false, "base agent state should default fast mode off");
  assert.strictEqual(state.automaticApprovalReviewEnabled, true, "base agent state should default approval review on");
  assert.strictEqual(state.serviceTier, "fast", "base agent state should default to fast service tier");

  const defaultConfig = __codexModes.buildThreadStartConfig(
    state,
    false,
    "blocked",
    "gpt-5",
    "medium",
    state.fastModeEnabled,
    state.automaticApprovalReviewEnabled
  );
  assert.ok(!("features.fast_mode" in defaultConfig), "default thread config should keep fast_mode disabled");
  assert.strictEqual(defaultConfig["features.guardian_approval"], true, "default thread config should enable guardian_approval");
  assert.ok(!("service_tier" in defaultConfig), "default thread config should omit service_tier when fast mode is off");

  const noFastConfig = __codexModes.buildThreadStartConfig(state, false, "blocked", "gpt-5", "medium", false, true);
  assert.ok(!("features.fast_mode" in noFastConfig), "fast_mode should be removed when fast mode is disabled");
  assert.strictEqual(noFastConfig["features.guardian_approval"], true, "guardian_approval should remain enabled when only fast mode is disabled");
  assert.ok(!("service_tier" in noFastConfig), "service_tier should be omitted when fast mode is disabled");

  const noGuardianConfig = __codexModes.buildThreadStartConfig(state, false, "blocked", "gpt-5", "medium", true, false);
  assert.strictEqual(noGuardianConfig["features.fast_mode"], true, "fast_mode should remain enabled when only approval review is disabled");
  assert.ok(!("features.guardian_approval" in noGuardianConfig), "guardian_approval should be removed when approval review is disabled");
  assert.strictEqual(noGuardianConfig.service_tier, "fast", "fast service tier should remain when fast mode stays enabled");

  const experimentalOffState = __codexModes.createBaseAgentState();
  experimentalOffState.experimentalEnabled = false;
  const experimentalOffConfig = __codexModes.buildThreadStartConfig(experimentalOffState, false, "blocked", "gpt-5", "medium", true, true);
  assert.ok(!("features.fast_mode" in experimentalOffConfig), "experimental off should suppress fast_mode injection");
  assert.ok(!("features.guardian_approval" in experimentalOffConfig), "experimental off should suppress guardian_approval injection");
  assert.ok(!("service_tier" in experimentalOffConfig), "experimental off should suppress service_tier injection");
}

function testRepoCodexConfigDisablesFastByDefault() {
  const repoConfigPath = path.resolve(__dirname, "..", ".codex", "config.toml");
  const repoConfig = fs.readFileSync(repoConfigPath, "utf8");
  assert.doesNotMatch(repoConfig, /^\s*service_tier\s*=/m, "repo Codex config should leave service_tier unspecified");
  assert.match(repoConfig, /^\s*fast_mode\s*=\s*false\s*$/m, "repo Codex config should default fast_mode to false");
  assert.match(
    repoConfig,
    /^\s*guardian_approval\s*=\s*true\s*$/m,
    "repo Codex config should keep guardian_approval enabled"
  );
}

async function testRuntimeSnapshotReflectsDefaultFastAndGuardianFeatures() {
  const requestedPort = 58600 + Math.floor(Math.random() * 200);
  const handle = await startInProcessHarnessServer({
    CODEX_AUTO_OPEN_BROWSER: "0",
    CODEX_UI_PORT: String(requestedPort),
    CODEX_EXECUTION_PROFILE: "smoke-test",
    CODEX_DEFAULT_EXEC_AGENT: "default",
    CODEX_REQUEST_USER_INPUT_POLICY: "blocked",
    CODEX_ADVERSARIAL_SHADOW_ENABLED: "0",
    CODEX_ADVERSARIAL_LOOP_ENABLED: "0",
    CODEX_OPENAI_BLOG_LEARNING_ENABLED: "0",
  });
  try {
    const runtime = await requestRuntime(handle.port);
    assert.strictEqual(runtime.activeAgent, "default", "runtime should expose the default agent as active");
    assert.strictEqual(runtime.experimental, true, "runtime should report experimental features enabled by default");
    assert(Array.isArray(runtime.experimentalFeatures), "runtime should expose experimentalFeatures");
    assert(runtime.experimentalFeatures.includes("fast_mode"), "runtime experimental features should include fast_mode");
    assert(runtime.experimentalFeatures.includes("guardian_approval"), "runtime experimental features should include guardian_approval");
    assert.strictEqual(runtime.fastModeEnabled, false, "runtime should expose fast mode disabled by default");
    assert.strictEqual(runtime.automaticApprovalReviewEnabled, true, "runtime should expose automatic approval review enabled by default");
    assert.strictEqual(runtime.serviceTier, "auto", "runtime should expose the effective auto service tier when fast mode is off");
    const activeAgent = Array.isArray(runtime.agents)
      ? runtime.agents.find((entry) => entry && entry.name === runtime.activeAgent)
      : null;
    assert(activeAgent, "runtime agent list should include the active agent");
    assert.strictEqual(activeAgent.experimental, true, "active agent snapshot should report experimental enabled");
    assert(Array.isArray(activeAgent.experimentalFeatures), "active agent snapshot should expose experimentalFeatures");
    assert(activeAgent.experimentalFeatures.includes("fast_mode"), "active agent snapshot should include fast_mode");
    assert(activeAgent.experimentalFeatures.includes("guardian_approval"), "active agent snapshot should include guardian_approval");
    assert.strictEqual(activeAgent.fastModeEnabled, false, "active agent snapshot should report fast mode disabled");
    assert.strictEqual(activeAgent.automaticApprovalReviewEnabled, true, "active agent snapshot should report approval review enabled");
    assert.strictEqual(activeAgent.serviceTier, "auto", "active agent snapshot should expose the effective auto service tier");
  } finally {
    await handle.stop();
  }
}

async function run() {
  const tests = [
    ["repo Codex config disables fast by default", testRepoCodexConfigDisablesFastByDefault],
    ["codex mode internals respect defaults and toggles", testCodexModeInternalsRespectDefaultsAndToggles],
    ["runtime snapshot reflects default fast/guardian feature flags", testRuntimeSnapshotReflectsDefaultFastAndGuardianFeatures],
  ];
  let passed = 0;
  for (const [name, fn] of tests) {
    await fn();
    passed += 1;
    console.log(`[runtime-default-feature-flags-test] PASS ${name}`);
  }
  console.log(`[runtime-default-feature-flags-test] total=${tests.length} pass=${passed} fail=0`);
  console.log("PASS");
}

run().catch((error) => {
  console.log(`[runtime-default-feature-flags-test] FAIL ${error instanceof Error ? error.message : String(error)}`);
  console.log("FAIL");
  process.exitCode = 1;
});
