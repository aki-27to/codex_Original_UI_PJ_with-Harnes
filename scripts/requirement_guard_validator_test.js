#!/usr/bin/env node
"use strict";

const assert = require("assert");
const matcher = require("./extensions/requirement_guard_hook.js");

function run() {
  const defaultConfig = matcher.getMatchConfig({});
  assert.strictEqual(defaultConfig.value, 3, "default match value should be 3");
  assert.strictEqual(defaultConfig.source, "default", "default config source should be default");

  const defaultMatched = matcher.evaluateMatch("3", { env: {} });
  assert.strictEqual(defaultMatched.is_match, true, "input 3 should match default value");
  assert.strictEqual(defaultMatched.reason, "matched");
  assert.strictEqual(defaultMatched.expected_value, 3);

  const leadingZeroMatched = matcher.evaluateMatch("03", { env: {} });
  assert.strictEqual(leadingZeroMatched.is_match, true, "input 03 should normalize to 3");

  const invalidInput = matcher.evaluateMatch("abc", { env: {} });
  assert.strictEqual(invalidInput.is_match, false, "invalid input should not match");
  assert.strictEqual(invalidInput.reason, "invalid_input");

  const overriddenConfig = matcher.getMatchConfig({ REQUIREMENT_GUARD_MATCH_VALUE: "5" });
  assert.strictEqual(overriddenConfig.value, 5, "env override should change expected value");
  assert.strictEqual(overriddenConfig.source, "env");

  const overriddenMatched = matcher.evaluateMatch("5", { env: { REQUIREMENT_GUARD_MATCH_VALUE: "5" } });
  assert.strictEqual(overriddenMatched.is_match, true, "input should match overridden value");
  assert.strictEqual(overriddenMatched.expected_value, 5);

  const overriddenNotMatched = matcher.evaluateMatch("3", { env: { REQUIREMENT_GUARD_MATCH_VALUE: "5" } });
  assert.strictEqual(overriddenNotMatched.is_match, false, "input 3 should not match overridden value 5");
  assert.strictEqual(overriddenNotMatched.reason, "not_matched");

  const invalidOverride = matcher.getMatchConfig({ REQUIREMENT_GUARD_MATCH_VALUE: "NaN" });
  assert.strictEqual(invalidOverride.value, 3, "invalid override should fallback to default 3");
  assert.ok(invalidOverride.config_error, "invalid override should return config error");

  const defaultRequirementLockConfig = matcher.getRequirementLockConfig({});
  assert.strictEqual(defaultRequirementLockConfig.enabled, true, "requirement lock should be enabled by default");
  assert.strictEqual(
    defaultRequirementLockConfig.require_confirm,
    false,
    "requirement lock should not require confirmation by default"
  );
  assert.strictEqual(defaultRequirementLockConfig.marker, "[REQUIREMENT_LOCK_V1]");

  const disabledRequirementLockConfig = matcher.getRequirementLockConfig({ CODEX_REQUIREMENT_LOCK_ENABLED: "0" });
  assert.strictEqual(disabledRequirementLockConfig.enabled, false, "requirement lock should be disabled by env");

  const defaultExpansionConfig = matcher.getScopeExpansionConfig({});
  assert.strictEqual(defaultExpansionConfig.enabled, true, "scope expansion should be enabled by default");
  assert.strictEqual(
    defaultExpansionConfig.require_approval,
    false,
    "scope expansion should not require approval by default"
  );
  assert.strictEqual(defaultExpansionConfig.marker, "[SCOPE_EXPANSION_V1]");

  const disabledExpansionConfig = matcher.getScopeExpansionConfig({
    CODEX_SCOPE_EXPANSION_ENABLED: "0",
  });
  assert.strictEqual(
    disabledExpansionConfig.enabled,
    false,
    "scope expansion should be disabled by env"
  );

  const plainTransform = matcher.transformExecRequest({
    prompt: "Implement a login endpoint and add tests.",
    sandboxMode: "workspace-write",
    options: { approvalPolicy: "on-request" },
    env: {},
  });
  assert.ok(
    plainTransform.prompt.includes("[REQUIREMENT_LOCK_V1] mode: requirement_definition_gate"),
    "plain prompt should be rewritten into requirement_definition_gate mode when RBJ is active"
  );
  assert.ok(
    plainTransform.prompt.includes("[SCOPE_EXPANSION_V1] expansion_status: parked_until_rbj_pass"),
    "plain prompt should park expansion until RBJ pass"
  );
  assert.ok(
    plainTransform.prompt.includes("requested_expansion_mode: auto_enabled"),
    "plain prompt should preserve requested expansion intent"
  );
  assert.ok(
    plainTransform.prompt.includes("[REQUIREMENT_RBJ_V1] mode: requirement_definition_loop"),
    "plain prompt should include requirement RBJ mode"
  );
  assert.ok(
    plainTransform.prompt.includes("$red-requirement-auditor"),
    "plain prompt should explicitly reference red requirement auditor skill"
  );
  assert.ok(plainTransform.prompt.includes("STATUS: NEED_USER_INPUT"), "plain prompt should include ASK stop status");
  assert.ok(
    plainTransform.prompt.includes("Assumptions (non-binding)"),
    "plain prompt should require assumptions as non-binding"
  );
  assert.ok(plainTransform.prompt.includes("write TBD"), "plain prompt should require TBD for unknown concrete values");
  assert.ok(
    plainTransform.prompt.includes("Implement a login endpoint and add tests."),
    "rewritten prompt should include original request"
  );

  const confirmedTransform = matcher.transformExecRequest({
    prompt: "#requirement-locked Implement a login endpoint and add tests.",
    sandboxMode: "workspace-write",
    options: { approvalPolicy: "on-request" },
    env: {},
  });
  assert.ok(
    confirmedTransform.prompt.includes("[REQUIREMENT_LOCK_V1] mode: requirement_definition_gate"),
    "confirmed prompt should stay in requirement definition gate mode while RBJ is active"
  );
  assert.ok(
    confirmedTransform.prompt.includes("[SCOPE_EXPANSION_V1] expansion_status: parked_until_rbj_pass"),
    "confirmed prompt should keep expansion parked until RBJ pass"
  );
  assert.ok(
    confirmedTransform.prompt.includes("[REQUIREMENT_RBJ_V1] mode: requirement_definition_loop"),
    "confirmed prompt should keep requirement RBJ instructions"
  );
  assert.ok(
    confirmedTransform.prompt.includes("STATUS: REQUIREMENTS_READY"),
    "confirmed prompt should include requirements-ready stop status"
  );
  assert.ok(
    confirmedTransform.prompt.includes("User request (verbatim):\nImplement a login endpoint and add tests."),
    "rewritten prompt should preserve request text without control token prefix"
  );
  assert.ok(
    !confirmedTransform.prompt.includes("#requirement-locked"),
    "control token prefix should be stripped from rewritten prompt"
  );

  const expandedTransform = matcher.transformExecRequest({
    prompt: "#requirement-locked #scope-plus Implement a login endpoint and add tests.",
    sandboxMode: "workspace-write",
    options: { approvalPolicy: "on-request" },
    env: {},
  });
  assert.ok(
    expandedTransform.prompt.includes("[SCOPE_EXPANSION_V1] expansion_status: parked_until_rbj_pass"),
    "scope-plus token should keep expansion parked while RBJ gate is active"
  );
  assert.ok(
    expandedTransform.prompt.includes("requested_expansion_mode: auto_enabled"),
    "scope-plus token should keep auto-enabled intent for post-pass execution"
  );

  const coreOnlyTransform = matcher.transformExecRequest({
    prompt: "#requirement-locked #scope-core Implement a login endpoint and add tests.",
    sandboxMode: "workspace-write",
    options: { approvalPolicy: "on-request" },
    env: {},
  });
  assert.ok(
    coreOnlyTransform.prompt.includes("[SCOPE_EXPANSION_V1] expansion_status: parked_until_rbj_pass"),
    "explicit core-only token should still park expansion until RBJ pass"
  );
  assert.ok(
    coreOnlyTransform.prompt.includes("requested_expansion_mode: core_only"),
    "explicit core-only token should be preserved as requested intent"
  );

  const nonParentTransform = matcher.transformExecRequest({
    prompt: "#requirement-locked Implement backend storage migration with tests.",
    sandboxMode: "workspace-write",
    options: { approvalPolicy: "on-request", agentName: "backend_worker" },
    env: {},
  });
  assert.ok(
    !nonParentTransform.prompt.includes("[REQUIREMENT_RBJ_V1] mode: requirement_definition_loop"),
    "non-parent role should not force requirement RBJ loop"
  );

  const autoExpansionTransform = matcher.transformExecRequest({
    prompt: "#requirement-locked Implement a login endpoint and add tests.",
    sandboxMode: "workspace-write",
    options: { approvalPolicy: "on-request" },
    env: { CODEX_SCOPE_EXPANSION_REQUIRE_APPROVAL: "0" },
  });
  assert.ok(
    autoExpansionTransform.prompt.includes("requested_expansion_mode: auto_enabled"),
    "expansion intent should remain auto-enabled when approval requirement is off"
  );

  const bypassTransform = matcher.transformExecRequest({
    prompt: "#guard-bypass #scope-plus #rbj-bypass raw execution",
    sandboxMode: "workspace-write",
    options: { approvalPolicy: "on-request" },
    env: {},
  });
  assert.strictEqual(
    bypassTransform.prompt,
    "raw execution",
    "bypass token should skip requirement lock wrapping"
  );

  const rbjDisabledTransform = matcher.transformExecRequest({
    prompt: "#requirement-locked Implement login endpoint.",
    sandboxMode: "workspace-write",
    options: { approvalPolicy: "on-request", agentName: "intake" },
    env: { CODEX_REQUIREMENT_RBJ_ENABLED: "0" },
  });
  assert.ok(
    !rbjDisabledTransform.prompt.includes("[REQUIREMENT_RBJ_V1]"),
    "rbj marker should not appear when CODEX_REQUIREMENT_RBJ_ENABLED=0"
  );
  assert.ok(
    rbjDisabledTransform.prompt.includes("[REQUIREMENT_LOCK_V1] mode: over_delivery_execution"),
    "rbj-disabled prompt should fallback to over-delivery execution mode"
  );

  const slashTransform = matcher.transformExecRequest({
    prompt: "/agent list",
    sandboxMode: "workspace-write",
    options: { approvalPolicy: "on-request" },
    env: {},
  });
  assert.strictEqual(slashTransform.prompt, "/agent list", "slash command must remain unchanged");

  const disabledTransform = matcher.transformExecRequest({
    prompt: "Implement login endpoint.",
    sandboxMode: "workspace-write",
    options: { approvalPolicy: "on-request" },
    env: { CODEX_REQUIREMENT_LOCK_ENABLED: "0" },
  });
  assert.strictEqual(
    disabledTransform.prompt,
    "Implement login endpoint.",
    "prompt must remain unchanged when requirement lock is disabled"
  );

  assert.strictEqual(matcher.requirement.originalRequirement, "?????3?????");
}

try {
  run();
  console.log("PASS requirement_guard_validator_test");
} catch (error) {
  console.error(`FAIL requirement_guard_validator_test: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}

