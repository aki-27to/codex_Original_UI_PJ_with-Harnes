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
    plainTransform.prompt.includes("[REQUIREMENT_LOCK_V1] mode: structured_execution"),
    "plain prompt should move into structured execution once Step 1 can autonomously tighten the requirement"
  );
  assert.ok(
    plainTransform.prompt.includes("[SCOPE_EXPANSION_V1] expansion_status: auto_enabled"),
    "plain prompt should keep adjacent expansion available once the requirement is already tight enough to execute"
  );
  assert.ok(
    plainTransform.prompt.includes("[PLANNING_MODE_V1] selected: NORMAL"),
    "plain prompt should report NORMAL planning mode once low-risk ambiguity is auto-tightened"
  );
  assert.ok(
    plainTransform.prompt.includes("[ASSURANCE_DEPTH_V1] selected: STANDARD_ASSURANCE"),
    "plain prompt should report STANDARD assurance depth for ambiguous bounded work"
  );
  assert.ok(
    !plainTransform.prompt.includes("[REQUIREMENT_RBJ_V1] mode: requirement_definition_loop"),
    "plain prompt should skip the RBJ requirement loop once the requirement is already execution-ready"
  );
  assert.ok(
    plainTransform.prompt.includes("Before execution, briefly lock the user-value frame, explicit goal, non-goals, assumptions, and acceptance checks."),
    "plain prompt should carry the structured execution lock-in step"
  );
  assert.ok(plainTransform.prompt.includes("STATUS: NEED_USER_INPUT"), "plain prompt should still preserve the stop status if new blocking ambiguity appears later");
  assert.ok(
    plainTransform.prompt.includes("Keep over-delivery adjacent, bounded, and separately reported."),
    "plain prompt should still instruct the model to keep extra value bounded"
  );
  assert.ok(
    plainTransform.prompt.includes("User-value frame (primary optimization target):"),
    "plain prompt should include a user-value frame"
  );
  assert.ok(
    plainTransform.prompt.includes("Implement a login endpoint and add tests."),
    "rewritten prompt should include original request"
  );
  assert.strictEqual(
    plainTransform.options.planningContext.selection.selectedMode,
    "NORMAL",
    "planning context should select NORMAL when the harness can autonomously tighten the new-feature requirement"
  );

  const confirmedTransform = matcher.transformExecRequest({
    prompt: "#requirement-locked Implement a login endpoint and add tests.",
    sandboxMode: "workspace-write",
    options: { approvalPolicy: "on-request" },
    env: {},
  });
  assert.ok(
    confirmedTransform.prompt.includes("[REQUIREMENT_LOCK_V1] mode: structured_execution"),
    "confirmed prompt should stay in structured execution mode once the requirement is already tight enough"
  );
  assert.ok(
    confirmedTransform.prompt.includes("[SCOPE_EXPANSION_V1] expansion_status: auto_enabled"),
    "confirmed prompt should keep expansion available once the requirement lock is already strong enough"
  );
  assert.ok(
    confirmedTransform.prompt.includes("[PLANNING_MODE_V1] selected: NORMAL"),
    "confirmed prompt should preserve NORMAL planning mode for execution-ready work"
  );
  assert.ok(
    confirmedTransform.prompt.includes("[ASSURANCE_DEPTH_V1] selected: STANDARD_ASSURANCE"),
    "confirmed prompt should preserve assurance depth"
  );
  assert.ok(
    confirmedTransform.prompt.includes("Execution protocol (mandatory):"),
    "confirmed prompt should switch into the structured execution protocol"
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
    expandedTransform.prompt.includes("[SCOPE_EXPANSION_V1] expansion_status: auto_enabled"),
    "scope-plus token should remain auto-enabled when the requirement is already execution-ready"
  );

  const coreOnlyTransform = matcher.transformExecRequest({
    prompt: "#requirement-locked #scope-core Implement a login endpoint and add tests.",
    sandboxMode: "workspace-write",
    options: { approvalPolicy: "on-request" },
    env: {},
  });
  assert.ok(
    coreOnlyTransform.prompt.includes("[SCOPE_EXPANSION_V1] expansion_status: core_only"),
    "explicit core-only token should be preserved directly once the requirement is already execution-ready"
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
  assert.ok(
    nonParentTransform.prompt.includes("[PLANNING_MODE_V1] selected: DISCOVERY"),
    "non-parent transform should still carry planning mode information"
  );
  assert.ok(
    nonParentTransform.prompt.includes("[ASSURANCE_DEPTH_V1] selected: SIGNOFF_ASSURANCE"),
    "runtime-sensitive non-parent transform should still carry assurance depth information"
  );

  const autoExpansionTransform = matcher.transformExecRequest({
    prompt: "#requirement-locked Implement a login endpoint and add tests.",
    sandboxMode: "workspace-write",
    options: { approvalPolicy: "on-request" },
    env: { CODEX_SCOPE_EXPANSION_REQUIRE_APPROVAL: "0" },
  });
  assert.ok(
    autoExpansionTransform.prompt.includes("[SCOPE_EXPANSION_V1] expansion_status: auto_enabled"),
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
    rbjDisabledTransform.prompt.includes("[REQUIREMENT_LOCK_V1] mode: fast_execution"),
    "rbj-disabled prompt should still preserve planning-aware execution mode when the request is tight enough for FAST"
  );

  const fastTransform = matcher.transformExecRequest({
    prompt: "#requirement-locked Reply with exactly: ACK",
    sandboxMode: "workspace-write",
    options: { approvalPolicy: "on-request", agentName: "default" },
    env: {},
  });
  assert.ok(
    fastTransform.prompt.includes("[PLANNING_MODE_V1] selected: FAST"),
    "exact-reply task should select FAST planning mode"
  );
  assert.ok(
    fastTransform.prompt.includes("[ASSURANCE_DEPTH_V1] selected: LIGHT_ASSURANCE"),
    "exact-reply task should select LIGHT assurance depth"
  );
  assert.ok(
    fastTransform.prompt.includes("[REQUIREMENT_LOCK_V1] mode: fast_execution"),
    "FAST planning mode should keep a concise execution prompt"
  );

  const webCreativeTransform = matcher.transformExecRequest({
    prompt: "#requirement-locked このUI、ユーザーの好みにちゃんと合うように改善して。",
    sandboxMode: "workspace-write",
    options: { approvalPolicy: "on-request", executionSource: "web_ui" },
    env: { CODEX_REQUIREMENT_RBJ_ENABLED: "0" },
  });
  assert.ok(
    webCreativeTransform.prompt.includes("[REQUIREMENT_LOCK_V1] mode: single_clarification_gate"),
    "preference-sensitive web creative transform should request one clarification question"
  );
  assert.ok(
    webCreativeTransform.prompt.includes("Ask exactly one short clarifying question in the user's language."),
    "single clarification gate should constrain the model to one question"
  );
  assert.ok(
    webCreativeTransform.prompt.includes("STATUS: NEED_USER_INPUT"),
    "single clarification gate should terminate with NEED_USER_INPUT"
  );
  assert.ok(
    webCreativeTransform.prompt.includes("Suggested question:"),
    "single clarification gate should carry the suggested clarifying question"
  );
  assert.strictEqual(
    webCreativeTransform.options.planningContext.selection.taskFamily,
    "web_creative",
    "planning context should persist web_creative task family"
  );
  assert.strictEqual(
    webCreativeTransform.options.planningContext.selection.signals.clarificationAction,
    "ask_user_once",
    "planning context should persist the single-question clarification action"
  );

  const anchoredWebCreativeTransform = matcher.transformExecRequest({
    prompt: "#requirement-locked フォントやレイアウトを https://www.suruga-k.jp/ を参考に刷新して下さい。",
    sandboxMode: "workspace-write",
    options: { approvalPolicy: "on-request", executionSource: "web_ui" },
    env: { CODEX_REQUIREMENT_RBJ_ENABLED: "0" },
  });
  assert.ok(
    anchoredWebCreativeTransform.prompt.includes("[REQUIREMENT_LOCK_V1] mode: structured_execution"),
    "reference-anchored web creative transform should still proceed to structured execution"
  );
  assert.ok(
    anchoredWebCreativeTransform.prompt.includes("Family profile: web_creative."),
    "reference-anchored web creative transform should retain family profile guidance"
  );
  assert.ok(
    anchoredWebCreativeTransform.prompt.includes("Treat missing taste detail as room to generate strong directions"),
    "reference-anchored web creative transform should still receive execution guidance"
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
