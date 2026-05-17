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
  assert.strictEqual(state.fastModeEnabled, true, "base agent state should default fast mode on");
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
  assert.strictEqual(defaultConfig["features.fast_mode"], true, "default thread config should enable fast_mode");
  assert.strictEqual(defaultConfig["features.guardian_approval"], true, "default thread config should enable guardian_approval");
  assert.strictEqual(defaultConfig.service_tier, "fast", "default thread config should request fast service tier");

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

function testRepoCodexConfigEnablesFastByDefault() {
  const repoConfigPath = path.resolve(__dirname, "..", ".codex", "config.toml");
  const repoConfig = fs.readFileSync(repoConfigPath, "utf8");
  assert.doesNotMatch(repoConfig, /^\s*service_tier\s*=/m, "repo Codex config should leave service_tier unspecified");
  assert.match(repoConfig, /^\s*fast_mode\s*=\s*true\s*$/m, "repo Codex config should default fast_mode to true");
  assert.match(
    repoConfig,
    /^\s*guardian_approval\s*=\s*true\s*$/m,
    "repo Codex config should keep guardian_approval enabled"
  );
}

async function testRuntimeSnapshotReflectsDefaultFastAndGuardianFeatures() {
  const requestedPort = 59000 + Math.floor(Math.random() * 500);
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
    assert.strictEqual(runtime.fastModeEnabled, true, "runtime should expose fast mode enabled by default");
    assert.strictEqual(runtime.automaticApprovalReviewEnabled, true, "runtime should expose automatic approval review enabled by default");
    assert.strictEqual(runtime.serviceTier, "fast", "runtime should expose the effective fast service tier when fast mode is on");
    assert.strictEqual(
      runtime.activePostureProfile,
      runtime.deploymentPosture && runtime.deploymentPosture.activePostureProfile,
      "runtime should expose activePostureProfile as a top-level live truth field"
    );
    assert.strictEqual(
      runtime.active_posture_profile,
      runtime.activePostureProfile,
      "runtime should expose a snake_case active posture alias"
    );
    assert.strictEqual(
      runtime.designCompletionEvidence && runtime.designCompletionEvidence.requiredTogetherBeforeCompletion,
      true,
      "runtime should expose screenshot+reviewer evidence as one design completion gate"
    );
    assert.strictEqual(
      runtime.currentTruth
        && runtime.currentTruth.designCompletionEvidence
        && runtime.currentTruth.designCompletionEvidence.completionStateIfMissing,
      "FAILED_VALIDATION",
      "current truth should fail closed when design screenshot/reviewer evidence is missing"
    );
    assert.strictEqual(
      runtime.externalLearning && runtime.externalLearning.backgroundRefreshEnabled,
      false,
      "learning tracked-output refresh should not run as a background writer by default"
    );
    assert.strictEqual(
      runtime.externalLearning && runtime.externalLearning.refreshCommand,
      "npm run refresh:learning-output",
      "runtime should expose the fixed learning-output refresh command"
    );
    assert(
      runtime.liveVerificationTimestamp && runtime.repoTruth && runtime.repoTruth.liveVerificationTimestamp,
      "runtime should expose a live verification timestamp for current truth"
    );
    assert.strictEqual(
      runtime.repoTruth.readOnly,
      1,
      "repo truth snapshot should be read-only"
    );
    assert.strictEqual(
      runtime.repoTruth.dirtyWorkingTree && runtime.repoTruth.dirtyWorkingTree.scope,
      "dirty_working_tree",
      "runtime should expose dirty working tree as a separate truth surface"
    );
    assert(
      runtime.repoTruth.head && Object.prototype.hasOwnProperty.call(runtime.repoTruth.head, "commit"),
      "runtime should expose HEAD commit truth"
    );
    assert(
      runtime.repoTruth.origin && Object.prototype.hasOwnProperty.call(runtime.repoTruth.origin, "commit"),
      "runtime should expose origin commit truth"
    );
    assert.strictEqual(
      runtime.repoTruth.generatedOutput && runtime.repoTruth.generatedOutput.scope,
      "generated_output",
      "runtime should expose generated output as a separate truth surface"
    );
    assert.strictEqual(
      runtime.statusScopeMap
        && runtime.statusScopeMap.statuses
        && runtime.statusScopeMap.statuses.COMPLETED
        && runtime.statusScopeMap.statuses.COMPLETED[0]
        && runtime.statusScopeMap.statuses.COMPLETED[0].scope,
      "task_outcome",
      "COMPLETED must be scoped to task_outcome"
    );
    assert.strictEqual(
      runtime.statusScopeMap
        && runtime.statusScopeMap.statuses
        && runtime.statusScopeMap.statuses.RELEASE_APPROVED
        && runtime.statusScopeMap.statuses.RELEASE_APPROVED[0]
        && runtime.statusScopeMap.statuses.RELEASE_APPROVED[0].scope,
      "release_decision",
      "RELEASE_APPROVED must be scoped to release_decision"
    );
    assert.strictEqual(
      runtime.statusScopeMap
        && runtime.statusScopeMap.statuses
        && runtime.statusScopeMap.statuses.NOT_YET
        && runtime.statusScopeMap.statuses.NOT_YET[0]
        && runtime.statusScopeMap.statuses.NOT_YET[0].scope,
      "program_readiness",
      "NOT_YET must expose program_readiness as a scoped background status"
    );
    assert.strictEqual(
      runtime.currentTruth
        && runtime.currentTruth.operationalPosture
        && runtime.currentTruth.operationalPosture.scope,
      "reviewer_facing_current_truth",
      "current truth should expose reviewer-facing operational posture"
    );
    assert.strictEqual(
      runtime.currentTruth.operationalPosture.activePostureProfile,
      runtime.activePostureProfile,
      "operational posture current truth should match the active posture profile"
    );
    assert.strictEqual(
      runtime.currentTruth.operationalPosture.gitAutomation.autocommitEnabled,
      runtime.gitAutomation && runtime.gitAutomation.autocommitEnabled,
      "operational posture current truth should expose autocommit"
    );
    assert.strictEqual(
      runtime.currentTruth.operationalPosture.gitAutomation.autopushEnabled,
      runtime.gitAutomation && runtime.gitAutomation.autopushEnabled,
      "operational posture current truth should expose autopush"
    );
    assert(
      runtime.currentTruth.operationalPosture.authorityState
        && Object.prototype.hasOwnProperty.call(runtime.currentTruth.operationalPosture.authorityState, "strongAuthorityActive"),
      "operational posture current truth should expose strong-authority state"
    );
    const activeAgent = Array.isArray(runtime.agents)
      ? runtime.agents.find((entry) => entry && entry.name === runtime.activeAgent)
      : null;
    assert(activeAgent, "runtime agent list should include the active agent");
    assert.strictEqual(activeAgent.experimental, true, "active agent snapshot should report experimental enabled");
    assert(Array.isArray(activeAgent.experimentalFeatures), "active agent snapshot should expose experimentalFeatures");
    assert(activeAgent.experimentalFeatures.includes("fast_mode"), "active agent snapshot should include fast_mode");
    assert(activeAgent.experimentalFeatures.includes("guardian_approval"), "active agent snapshot should include guardian_approval");
    assert.strictEqual(activeAgent.fastModeEnabled, true, "active agent snapshot should report fast mode enabled");
    assert.strictEqual(activeAgent.automaticApprovalReviewEnabled, true, "active agent snapshot should report approval review enabled");
    assert.strictEqual(activeAgent.serviceTier, "fast", "active agent snapshot should expose the effective fast service tier");
  } finally {
    await handle.stop();
  }
}

async function run() {
  const tests = [
    ["repo Codex config enables fast by default", testRepoCodexConfigEnablesFastByDefault],
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
