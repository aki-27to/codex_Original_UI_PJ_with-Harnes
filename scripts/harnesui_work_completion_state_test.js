#!/usr/bin/env node
"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

function extractBlock(source, pattern, label) {
  const match = source.match(pattern);
  assert(match && match[0], `${label} not found in app.js`);
  return match[0];
}

function extractFunction(source, name) {
  return extractBlock(source, new RegExp(`function ${name}\\([^]*?\\n\\}`, "m"), name);
}

function extractFunctionBefore(source, name, nextName) {
  const startToken = `function ${name}(`;
  const endToken = `\nfunction ${nextName}(`;
  const startIndex = source.indexOf(startToken);
  assert(startIndex >= 0, `${name} not found in app.js`);
  const endIndex = source.indexOf(endToken, startIndex);
  assert(endIndex >= 0, `${nextName} not found after ${name} in app.js`);
  return source.slice(startIndex, endIndex).trimEnd();
}

function loadHelpers() {
  const source = fs.readFileSync(path.join(__dirname, "..", "web", "01.HarnesUI", "app.js"), "utf8");
  const context = {
    Object,
    Array,
    Number,
    String,
    Boolean,
    Math,
  };
  vm.runInNewContext(
    [
      extractBlock(source, /const USER_WORK_COMPLETION_DEFINITION_FOR_UI=Object\.freeze\(\{[^]*?\n\}\);/, "USER_WORK_COMPLETION_DEFINITION_FOR_UI"),
      extractFunction(source, "lowerText"),
      extractFunction(source, "runtimeTurnStatusForUi"),
      extractFunction(source, "taskOutcomeStatusForUi"),
      extractFunction(source, "taskOutcomeReasonForUi"),
      extractFunction(source, "taskOutcomeBlocksWorkCompletionForUi"),
      extractFunction(source, "userFacingTerminalStatusForUi"),
      extractFunctionBefore(source, "workCompletionStateForUi", "userFacingWorkflowTerminalOverrideForUi"),
      "this.__helper__ = { USER_WORK_COMPLETION_DEFINITION_FOR_UI, userFacingTerminalStatusForUi, workCompletionStateForUi, taskOutcomeBlocksWorkCompletionForUi };",
    ].join("\n"),
    context
  );
  return context.__helper__;
}

function run() {
  const {
    USER_WORK_COMPLETION_DEFINITION_FOR_UI,
    userFacingTerminalStatusForUi,
    workCompletionStateForUi,
    taskOutcomeBlocksWorkCompletionForUi,
  } = loadHelpers();

  assert.strictEqual(USER_WORK_COMPLETION_DEFINITION_FOR_UI.completedLabel, "作業完了");
  assert.strictEqual(USER_WORK_COMPLETION_DEFINITION_FOR_UI.notCompletedLabel, "作業未完了");
  assert.match(
    USER_WORK_COMPLETION_DEFINITION_FOR_UI.notCompletedDefinition,
    /作業完了の条件を1つでも満たしていない状態/,
    "not-completed must be defined as anything that is not work-complete"
  );

  const completed = workCompletionStateForUi({
    status: "completed",
    terminalStatus: "completed",
    turn: { status: "completed", task_outcome_status: "COMPLETED" },
  });
  assert.strictEqual(completed.completed, true, "COMPLETED terminal outcome should be work-complete");
  assert.strictEqual(completed.label, "作業完了");
  assert.strictEqual(completed.state, "completed");

  const failedValidationTerminal = userFacingTerminalStatusForUi({
    status: "completed",
    turn: { status: "completed", task_outcome_status: "FAILED_VALIDATION" },
  });
  assert.strictEqual(
    failedValidationTerminal,
    "failed",
    "FAILED_VALIDATION must override a procedural completed terminal status"
  );
  const failedValidation = workCompletionStateForUi({
    status: "completed",
    terminalStatus: failedValidationTerminal,
    turn: {
      status: "completed",
      task_outcome_status: "FAILED_VALIDATION",
      task_outcome_reason: "parent_dispatch_guard_block",
    },
  });
  assert.strictEqual(failedValidation.completed, false);
  assert.strictEqual(failedValidation.label, "作業未完了");
  assert.strictEqual(failedValidation.reason, "検証未通過");
  assert.match(failedValidation.detail, /完了ゲートを通っていません/);

  const cases = [
    workCompletionStateForUi({ status: "running", currentPending: 1 }),
    workCompletionStateForUi({ status: "needs_input", terminalStatus: "needs_input" }),
    workCompletionStateForUi({ status: "interrupted", terminalStatus: "interrupted" }),
    workCompletionStateForUi({ status: "failed", terminalStatus: "failed" }),
    workCompletionStateForUi({ status: "idle", requirementGateBlocked: true }),
  ];
  for (const state of cases) {
    assert.strictEqual(state.completed, false, `${state.reason} should not be complete`);
    assert.strictEqual(state.label, "作業未完了", `${state.reason} should use the not-completed label`);
  }

  assert.strictEqual(taskOutcomeBlocksWorkCompletionForUi("PARTIAL"), true, "PARTIAL must not be complete");
  assert.strictEqual(taskOutcomeBlocksWorkCompletionForUi("COMPLETED"), false, "COMPLETED should not block completion");

  process.stdout.write("PASS harnesui_work_completion_state_test\n");
}

try {
  run();
} catch (error) {
  console.error(`FAIL harnesui_work_completion_state_test: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}
