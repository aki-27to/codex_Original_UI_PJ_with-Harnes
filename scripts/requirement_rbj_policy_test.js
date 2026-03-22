#!/usr/bin/env node
"use strict";

const assert = require("assert");
const {
  buildRequirementRbjInstructionBlock,
  getRequirementRbjConfig,
  resolveRequirementRbjState,
  stripRequirementRbjControlTokens,
  requirementRbjPolicyVersion,
} = require("./lib/requirement_rbj_policy");

function run() {
  const defaults = getRequirementRbjConfig({});
  assert.strictEqual(defaults.enabled, true, "rbj should be enabled by default");
  assert.strictEqual(defaults.max_questions, 3, "default max questions mismatch");
  assert.strictEqual(defaults.max_revisions, 2, "default max revisions mismatch");
  assert.strictEqual(defaults.version, requirementRbjPolicyVersion, "version mismatch");

  const disabledConfig = getRequirementRbjConfig({ CODEX_REQUIREMENT_RBJ_ENABLED: "0" });
  assert.strictEqual(disabledConfig.enabled, false, "env override should disable rbj");

  const activeState = resolveRequirementRbjState({
    prompt: "Implement auth with tests.",
    options: { agentName: "intake" },
    config: defaults,
  });
  assert.strictEqual(activeState.active, true, "rbj should be active for parent role");
  assert.strictEqual(activeState.reason, "active", "active reason mismatch");

  const scopedDefaultState = resolveRequirementRbjState({
    prompt: "Implement auth with tests.",
    options: { agentName: "default@chat-1" },
    config: defaults,
  });
  assert.strictEqual(scopedDefaultState.active, true, "rbj should stay active for scoped default parent role");
  assert.strictEqual(scopedDefaultState.reason, "active", "scoped default reason mismatch");

  const nonParentState = resolveRequirementRbjState({
    prompt: "Implement auth with tests.",
    options: { agentName: "backend_worker" },
    config: defaults,
  });
  assert.strictEqual(nonParentState.active, false, "rbj should be inactive for non-parent role");
  assert.strictEqual(nonParentState.reason, "agent_not_parent", "non-parent reason mismatch");

  const bypassState = resolveRequirementRbjState({
    prompt: "#rbj-bypass Implement auth with tests.",
    options: { agentName: "intake" },
    config: defaults,
  });
  assert.strictEqual(bypassState.active, false, "rbj should be inactive when bypass token exists");
  assert.strictEqual(bypassState.reason, "bypass", "bypass reason mismatch");

  const instruction = buildRequirementRbjInstructionBlock({ config: defaults, state: activeState });
  assert.ok(
    instruction.includes("[REQUIREMENT_RBJ_V1] mode: requirement_definition_loop"),
    "instruction missing rbj marker"
  );
  assert.ok(
    instruction.includes("$red-requirement-auditor"),
    "instruction missing red skill token"
  );
  assert.ok(
    instruction.includes("set value to TBD"),
    "instruction should require TBD fallback for unknown concrete values"
  );
  assert.ok(
    instruction.includes("STATUS: NEED_USER_INPUT"),
    "instruction should require NEED_USER_INPUT on ASK"
  );
  assert.ok(
    instruction.includes("assumptions_non_binding"),
    "instruction should require non-binding assumptions bucket"
  );
  assert.ok(
    instruction.includes("user_value_core"),
    "instruction should require a user_value_core bucket"
  );
  assert.ok(
    instruction.includes("user_should_feel_get"),
    "instruction should require user value experience targets"
  );

  const stripped = stripRequirementRbjControlTokens(
    "#rbj-confirm #rbj-bypass Design a secure API",
    defaults
  );
  assert.strictEqual(stripped, "Design a secure API", "rbj control tokens should be stripped");
}

try {
  run();
  console.log("PASS requirement_rbj_policy_test");
} catch (error) {
  console.error(
    `FAIL requirement_rbj_policy_test: ${error instanceof Error ? error.message : String(error)}`
  );
  process.exit(1);
}
