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

function loadLifecycleHelper() {
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
      extractFunction(source, "lifecycleStepToneForUi"),
      extractFunctionBefore(source, "deriveUserVisibleLifecycleForUi", "createPerformanceState"),
      "this.__helper__ = { deriveUserVisibleLifecycleForUi, deriveUserFacingWorkflowForUi, USER_VISIBLE_LIFECYCLE_STEPS_FOR_UI, USER_VISIBLE_WORKFLOW_STEPS_FOR_UI };",
    ].join("\n"),
    context
  );
  return context.__helper__;
}

function stateById(result) {
  return Object.fromEntries((result.steps || []).map((step) => [step.id, step.state]));
}

function labelMap(result) {
  return Object.fromEntries((result.steps || []).map((step) => [step.id, step.label]));
}

function run() {
  const {
    deriveUserVisibleLifecycleForUi,
    deriveUserFacingWorkflowForUi,
    USER_VISIBLE_LIFECYCLE_STEPS_FOR_UI,
    USER_VISIBLE_WORKFLOW_STEPS_FOR_UI,
  } = loadLifecycleHelper();

  assert.strictEqual(USER_VISIBLE_LIFECYCLE_STEPS_FOR_UI.length, 15, "operator lifecycle should expose 15 steps");
  const labels = labelMap({ steps: USER_VISIBLE_LIFECYCLE_STEPS_FOR_UI });
  assert.strictEqual(labels.learning, "Learning Triage", "learning step should surface triage");
  assert.strictEqual(labels.patchTarget, "Patch Target Decision", "patch target decision should be visible");
  assert.strictEqual(labels.lifecycle, "Improvement Lifecycle Decision", "lifecycle decision should be visible");
  assert.strictEqual(USER_VISIBLE_WORKFLOW_STEPS_FOR_UI.length, 5, "top-level workflow should compress to 5 user-facing steps");
  const workflowLabels = labelMap({ steps: USER_VISIBLE_WORKFLOW_STEPS_FOR_UI });
  assert.strictEqual(workflowLabels.understand, "依頼理解", "workflow should start from request understanding");
  assert.strictEqual(workflowLabels.lock, "要件確定", "workflow should surface a user-facing requirement lock");
  assert.strictEqual(workflowLabels.complete, "完了", "workflow should end on completion");

  const waiting = deriveUserVisibleLifecycleForUi({
    requirementSnapshot: { hasRequirement: false },
    flowItems: [],
    status: "idle",
  });
  assert.strictEqual(waiting.currentLabel, "1. 依頼理解", "empty chats should stay anchored on request understanding");
  assert.strictEqual(waiting.currentState, "todo", "empty chats should not pretend work already started");

  const blocked = deriveUserVisibleLifecycleForUi({
    requirementSnapshot: {
      hasRequirement: true,
      headline: "Pause overlay readability",
      displayAskNext: ["What is the maximum copy length?"],
      displayBoundaries: ["Do not widen the panel."],
      acceptanceChecks: [],
    },
    requirementGateBlocked: true,
    flowItems: [],
    status: "running",
  });
  const blockedStates = stateById(blocked);
  assert.strictEqual(blockedStates.request, "done", "once a requirement snapshot exists, request understanding should be done");
  assert.strictEqual(blockedStates.intent, "blocked", "blocked requirement locks should surface as intent lock blockers");
  assert.strictEqual(blockedStates.acceptance, "blocked", "acceptance lock should also block until the requirement gate clears");
  assert.strictEqual(blocked.currentLabel, "2. Intent Lock", "blocked turns should point the operator at intent lock");
  const blockedWorkflow = deriveUserFacingWorkflowForUi({
    requirementSnapshot: {
      hasRequirement: true,
      headline: "Pause overlay readability",
      displayAskNext: ["What is the maximum copy length?"],
      displayBoundaries: ["Do not widen the panel."],
      acceptanceChecks: [],
    },
    requirementGateBlocked: true,
    flowItems: [],
    status: "running",
    internalLifecycle: blocked,
  });
  const blockedWorkflowStates = stateById(blockedWorkflow);
  assert.strictEqual(blockedWorkflowStates.understand, "done", "user-facing workflow should mark understanding done once the requirement snapshot exists");
  assert.strictEqual(blockedWorkflowStates.lock, "blocked", "user-facing workflow should stop on requirement lock");
  assert.strictEqual(blockedWorkflow.currentLabel, "2. 要件確定", "blocked turns should point the user-facing flow at requirement lock");
  assert.match(blockedWorkflow.currentDetail, /実行に進めます/, "blocked requirement lock copy should explain that execution is waiting on the answer");

  const authority = deriveUserVisibleLifecycleForUi({
    requirementSnapshot: {
      hasRequirement: true,
      headline: "Footer overflow hardening",
      displayBoundaries: ["Stay inside the locked footer strip."],
      contractStatusReason: "Scope is locked to the footer strip.",
      acceptanceChecks: [{ title: "No text may overflow the footer strip." }],
    },
    requirementGateBlocked: false,
    flowItems: [],
    status: "running",
  });
  const authorityStates = stateById(authority);
  assert.strictEqual(authorityStates.authority, "active", "authority check should own the pre-plan window");
  assert.strictEqual(authority.currentLabel, "4. 権限照合", "the current label should move to authority before planning");
  const authorityWorkflow = deriveUserFacingWorkflowForUi({
    requirementSnapshot: {
      hasRequirement: true,
      headline: "Footer overflow hardening",
      displayBoundaries: ["Stay inside the locked footer strip."],
      contractStatusReason: "Scope is locked to the footer strip.",
      acceptanceChecks: [{ title: "No text may overflow the footer strip." }],
    },
    requirementGateBlocked: false,
    flowItems: [],
    status: "running",
    internalLifecycle: authority,
  });
  assert.strictEqual(stateById(authorityWorkflow).lock, "active", "authority checks should remain inside the compressed requirement step");
  assert.strictEqual(authorityWorkflow.currentLabel, "2. 要件確定", "pre-plan authority checks should stay inside the user-facing requirement step");

  const planningInLockLifecycle = deriveUserVisibleLifecycleForUi({
    requirementSnapshot: {
      hasRequirement: true,
      headline: "Status rail tone cleanup",
      acceptanceChecks: [{ title: "The active step should match what users think is happening." }],
      displayBoundaries: ["Do not widen the rail."],
    },
    requirementGateBlocked: false,
    flowItems: [{ id: "planning", state: "active", detail: "sequencing the work" }],
    status: "running",
  });
  const planningInLockWorkflow = deriveUserFacingWorkflowForUi({
    requirementSnapshot: {
      hasRequirement: true,
      headline: "Status rail tone cleanup",
      acceptanceChecks: [{ title: "The active step should match what users think is happening." }],
      displayBoundaries: ["Do not widen the rail."],
    },
    requirementGateBlocked: false,
    flowItems: [{ id: "planning", state: "active", detail: "sequencing the work" }],
    status: "running",
    internalLifecycle: planningInLockLifecycle,
  });
  assert.strictEqual(stateById(planningInLockWorkflow).lock, "active", "visible planning should stay inside the user-facing requirement step");
  assert.strictEqual(stateById(planningInLockWorkflow).execute, "todo", "execution should stay quiet until actual implementation starts");
  assert.match(planningInLockWorkflow.currentLabel, /^2\./, "planning work should keep the current label inside step 2");
  assert.match(planningInLockWorkflow.currentDetail, /段取り|順/, "step 2 copy should explain that execution sequencing is being fixed");

  const outOfOrder = deriveUserVisibleLifecycleForUi({
    requirementSnapshot: {
      hasRequirement: true,
      headline: "Panel density cleanup",
      acceptanceChecks: [],
      displayBoundaries: ["Keep the current panel widths."],
    },
    requirementGateBlocked: false,
    flowItems: [{ id: "execution", state: "active", detail: "implementing" }],
    status: "running",
    currentPending: 1,
  });
  const outOfOrderStates = stateById(outOfOrder);
  assert.strictEqual(outOfOrderStates.planning, "failed", "execution before plan/update should surface as a planning failure");
  assert.strictEqual(outOfOrder.currentLabel, "5. Autonomous Plan", "the current label should stop on planning when ordering is broken");
  const outOfOrderWorkflow = deriveUserFacingWorkflowForUi({
    requirementSnapshot: {
      hasRequirement: true,
      headline: "Panel density cleanup",
      acceptanceChecks: [],
      displayBoundaries: ["Keep the current panel widths."],
    },
    requirementGateBlocked: false,
    flowItems: [{ id: "execution", state: "active", detail: "implementing" }],
    status: "running",
    currentPending: 1,
    internalLifecycle: outOfOrder,
  });
  assert.strictEqual(stateById(outOfOrderWorkflow).execute, "failed", "user-facing execution should fail when work starts before planning");
  assert.strictEqual(outOfOrderWorkflow.currentLabel, "3. 実行", "the compressed workflow should stop on execution when the plan/order is broken");

  const verificationLifecycle = deriveUserVisibleLifecycleForUi({
    requirementSnapshot: {
      hasRequirement: true,
      headline: "Current work copy polish",
      acceptanceChecks: [{ title: "The status copy should feel natural to users." }],
      displayBoundaries: ["Do not leak internal operator wording."],
    },
    requirementGateBlocked: false,
    flowItems: [
      { id: "planning", state: "done" },
      { id: "execution", state: "done" },
      { id: "quality", state: "active" },
    ],
    status: "running",
    evidence: { reviews: 1 },
  });
  const verificationWorkflow = deriveUserFacingWorkflowForUi({
    requirementSnapshot: {
      hasRequirement: true,
      headline: "Current work copy polish",
      acceptanceChecks: [{ title: "The status copy should feel natural to users." }],
      displayBoundaries: ["Do not leak internal operator wording."],
    },
    requirementGateBlocked: false,
    flowItems: [
      { id: "planning", state: "done" },
      { id: "execution", state: "done" },
      { id: "quality", state: "active" },
    ],
    status: "running",
    evidence: { reviews: 1 },
    internalLifecycle: verificationLifecycle,
  });
  assert.strictEqual(stateById(verificationWorkflow).verify, "active", "active quality work should map into the user-facing verification step");
  assert.match(verificationWorkflow.currentDetail, /確認中/, "verification copy should use user-facing confirmation language");
  assert.match(verificationWorkflow.currentDetail, /見直し|最終回答/, "verification copy should describe the final answer review in plain language");

  const completedWithoutCorrection = deriveUserVisibleLifecycleForUi({
    requirementSnapshot: {
      hasRequirement: true,
      headline: "Close the loop without correction drift",
      acceptanceChecks: [{ title: "Closeout evidence exists." }],
      displayBoundaries: ["Do not widen scope after signoff."],
    },
    requirementGateBlocked: false,
    flowItems: [
      { id: "planning", state: "done" },
      { id: "execution", state: "done" },
      { id: "quality", state: "done" },
      { id: "report", state: "done" },
    ],
    status: "completed",
    evidence: { tests: 1, reviews: 1 },
    turn: { release_decision_path: "logs/release_decision.json" },
  });
  const cleanPassStates = stateById(completedWithoutCorrection);
  assert.strictEqual(cleanPassStates.learning, "done", "clean pass should bypass triage cleanly");
  assert.strictEqual(cleanPassStates.patchTarget, "done", "clean pass should bypass patch target cleanly");
  assert.strictEqual(cleanPassStates.lifecycle, "done", "clean pass should bypass lifecycle cleanly");
  assert.strictEqual(cleanPassStates.decision, "done", "completed turns should still mark decision done");
  assert.strictEqual(completedWithoutCorrection.currentLabel, "15. 出荷判断", "without correction artifacts, the lifecycle should stop at ship");
  const completedWorkflow = deriveUserFacingWorkflowForUi({
    requirementSnapshot: {
      hasRequirement: true,
      headline: "Close the loop without correction drift",
      acceptanceChecks: [{ title: "Closeout evidence exists." }],
      displayBoundaries: ["Do not widen scope after signoff."],
    },
    requirementGateBlocked: false,
    flowItems: [
      { id: "planning", state: "done" },
      { id: "execution", state: "done" },
      { id: "quality", state: "done" },
      { id: "report", state: "done" },
    ],
    status: "completed",
    evidence: { tests: 1, reviews: 1 },
    internalLifecycle: completedWithoutCorrection,
  });
  const completedWorkflowStates = stateById(completedWorkflow);
  assert.strictEqual(completedWorkflowStates.verify, "done", "completed clean passes should still show verification done");
  assert.strictEqual(completedWorkflowStates.complete, "done", "completed clean passes should land on the final completion step");
  assert.strictEqual(completedWorkflow.currentLabel, "5. 完了", "completed turns should finish on the compact completion step");

  const completedWithRecords = deriveUserVisibleLifecycleForUi({
    requirementSnapshot: {
      hasRequirement: true,
      headline: "Replay-backed closeout",
      acceptanceChecks: [{ title: "Closeout artifacts are recorded." }],
      displayBoundaries: ["No silent scope growth."],
    },
    requirementGateBlocked: false,
    flowItems: [
      { id: "planning", state: "done" },
      { id: "execution", state: "done" },
      { id: "quality", state: "done" },
      { id: "report", state: "done" },
    ],
    status: "completed",
    evidence: { tests: 1, reviews: 1, logs: 1 },
    turn: {
      release_decision_path: "logs/release_decision.json",
      task_outcomes_path: "logs/task_outcomes.json",
      stage_timeline_path: "logs/stage_timeline.json",
      flow_trace_summary_path: "logs/flow_trace_summary.json",
      learning_decision_path: "logs/learning_decision.json",
      improvement_lifecycle_path: "logs/improvement_lifecycle.json",
    },
  });
  const completedWithRecordStates = stateById(completedWithRecords);
  assert.strictEqual(completedWithRecordStates.learning, "done", "recorded closeout should advance learning triage");
  assert.strictEqual(completedWithRecordStates.patchTarget, "done", "recorded closeout should advance patch target decision");
  assert.strictEqual(completedWithRecordStates.lifecycle, "done", "recorded closeout should advance lifecycle decision");
  assert.strictEqual(completedWithRecordStates.patch, "done", "recorded closeout should advance policy patch");
  assert.strictEqual(completedWithRecordStates.replay, "done", "recorded closeout should advance replay verification");
  assert.strictEqual(completedWithRecordStates.decision, "done", "recorded closeout should keep ship done");

  console.log("PASS harnesui_lifecycle_mapping_test");
}

try {
  run();
} catch (error) {
  console.error(`FAIL harnesui_lifecycle_mapping_test: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}
