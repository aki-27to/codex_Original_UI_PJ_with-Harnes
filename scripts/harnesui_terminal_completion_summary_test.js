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
    toArr(value) {
      return Array.isArray(value) ? value : [];
    },
  };
  vm.runInNewContext(
    [
      extractBlock(source, /const USER_VISIBLE_WORKFLOW_STEPS_FOR_UI=Object\.freeze\(\[[^]*?\n\]\);/, "USER_VISIBLE_WORKFLOW_STEPS_FOR_UI"),
      extractBlock(source, /const USER_VISIBLE_LIFECYCLE_STEPS_FOR_UI=Object\.freeze\(\[[^]*?\n\]\);/, "USER_VISIBLE_LIFECYCLE_STEPS_FOR_UI"),
      extractFunction(source, "lowerText"),
      extractFunction(source, "runtimeTurnStatusForUi"),
      extractFunction(source, "lifecycleStepToneForUi"),
      extractFunctionBefore(source, "deriveUserVisibleLifecycleForUi", "createPerformanceState"),
      extractFunction(source, "userFacingTerminalStatusForUi"),
      extractFunction(source, "userFacingWorkflowTerminalOverrideForUi"),
      extractFunction(source, "harnessStopReasonSummaryForUi"),
      "this.__helper__ = { deriveUserVisibleLifecycleForUi, deriveUserFacingWorkflowForUi, userFacingTerminalStatusForUi, userFacingWorkflowTerminalOverrideForUi, harnessStopReasonSummaryForUi };",
    ].join("\n"),
    context
  );
  return context.__helper__;
}

function run() {
  const {
    deriveUserVisibleLifecycleForUi,
    deriveUserFacingWorkflowForUi,
    userFacingTerminalStatusForUi,
    userFacingWorkflowTerminalOverrideForUi,
    harnessStopReasonSummaryForUi,
  } = loadHelpers();

  const requirementSnapshot = {
    hasRequirement: true,
    headline: "Keep the right panel readable after completion",
    contractStatus: "BLOCKED",
    validationVerdict: "BLOCK",
    displayAskNext: ["What acceptance checks define success?"],
    openQuestions: ["What acceptance checks define success?"],
    acceptanceChecks: [],
    displayBoundaries: ["Do not widen the panel."],
  };

  const terminalStatus = userFacingTerminalStatusForUi({
    status: "completed",
    turn: { terminal_status: "completed" },
    lastResultType: "completed",
    currentPending: 0,
  });
  assert.strictEqual(
    terminalStatus,
    "completed",
    "completed turns should expose a completed terminal status for the user-facing summary"
  );

  const userFacingRequirementGateBlocked = true && !terminalStatus;
  assert.strictEqual(
    userFacingRequirementGateBlocked,
    false,
    "a completed reply should suppress stale requirement blockers in the compact summary"
  );

  const stopReason = harnessStopReasonSummaryForUi({
    status: terminalStatus,
    currentPending: 0,
    requirementGateBlocked: userFacingRequirementGateBlocked,
    requirementSnapshot,
    lastResultType: "completed",
  });
  assert.strictEqual(stopReason.label, "完了", "completed replies should show a completed stop-reason badge");
  assert.match(stopReason.detail, /返却済み/, "completed stop-reason detail should explain that the answer was already returned");

  const lifecycle = deriveUserVisibleLifecycleForUi({
    requirementSnapshot,
    requirementGateBlocked: userFacingRequirementGateBlocked,
    flowItems: [],
    status: terminalStatus,
    currentPending: 0,
    displayedPlan: null,
    evidence: {},
    stopReason,
    turn: { terminal_status: "completed" },
  });

  const rawWorkflow = deriveUserFacingWorkflowForUi({
    requirementSnapshot,
    requirementGateBlocked: userFacingRequirementGateBlocked,
    flowItems: [],
    status: terminalStatus,
    currentPending: 0,
    displayedPlan: null,
    evidence: {},
    stopReason,
    internalLifecycle: lifecycle,
  });
  const workflow = userFacingWorkflowTerminalOverrideForUi(rawWorkflow, {
    terminalStatus,
    stopReason,
  });

  assert.strictEqual(
    workflow.currentLabel,
    "5. 完了",
    "completed replies should finish on the compact completion step even if the stored requirement snapshot remained blocked"
  );
  assert.match(
    workflow.currentDetail,
    /完了|返却/,
    "the compact workflow detail should describe the reply as completed"
  );

  console.log("PASS harnesui_terminal_completion_summary_test");
}

try {
  run();
} catch (error) {
  console.error(`FAIL harnesui_terminal_completion_summary_test: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}
