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

function loadHarnessFlowHelpers() {
  const source = fs.readFileSync(path.join(__dirname, "..", "web", "01.HarnesUI", "app.js"), "utf8");
  const context = {
    Object,
    Array,
    Math,
    Date,
    String,
    console,
    t1(value, max = 999) {
      return String(value == null ? "" : value).slice(0, max);
    },
    toArr(value) {
      return Array.isArray(value) ? value : [];
    },
    activeHarnessCheckMode() {
      return "adaptive";
    },
    buildRequirementLockSnapshotForUi(turn) {
      return turn && typeof turn === "object" && turn.__requirementSnapshot
        ? turn.__requirementSnapshot
        : { hasRequirement: false };
    },
  };
  vm.runInNewContext(
    [
      extractBlock(source, /const HARNESS_CHECK_MODES=\{[^]*?\};/, "HARNESS_CHECK_MODES"),
      extractFunction(source, "normalizeHarnessCheckMode"),
      extractFunction(source, "createHarnessSignals"),
      extractFunction(source, "createHarnessPlanMeta"),
      extractFunction(source, "createHarnessState"),
      extractFunction(source, "storedTurnSnapshotForUi"),
      extractFunction(source, "ensureHarnessSignals"),
      extractFunction(source, "ensureHarnessPlanMeta"),
      extractFunction(source, "foldHarnessSignalsFromLabel"),
      extractFunction(source, "deriveHarnessOperationProfile"),
      extractFunction(source, "shouldInferAdaptiveMicroPlan"),
      extractFunction(source, "getHarnessSignals"),
      extractFunction(source, "hpush"),
      extractFunction(source, "hset"),
      extractFunction(source, "lowerText"),
      extractFunction(source, "deriveHarnessEvidence"),
      extractFunction(source, "requirementNeedsFurtherLockForUi"),
      extractFunction(source, "requirementGateBlockerTextForUi"),
      extractFunction(source, "requirementGatePlanPanelStateForUi"),
      extractFunction(source, "applyRequirementPhaseStateForUi"),
      extractFunction(source, "syncHarnessFlow"),
      "this.__helper__ = { createHarnessState, ensureHarnessPlanMeta, hpush, hset, syncHarnessFlow, requirementGatePlanPanelStateForUi };",
    ].join("\n"),
    context
  );
  return context.__helper__;
}

function run() {
  const { createHarnessState, ensureHarnessPlanMeta, hpush, hset, syncHarnessFlow, requirementGatePlanPanelStateForUi } = loadHarnessFlowHelpers();

  const blockedChat = { h: createHarnessState() };
  blockedChat.h.turnSnapshot = {
    __requirementSnapshot: {
      hasRequirement: true,
      contractStatus: "BLOCKED",
      validationVerdict: "BLOCK",
      displayAskNext: ["何を満たせば成功と言えるか？"],
      openQuestions: ["何を満たせば成功と言えるか？"],
      contractStatusLabel: "保留",
    },
  };
  hset(blockedChat, "running");
  const planMeta = ensureHarnessPlanMeta(blockedChat.h);
  planMeta.decision = "skip";
  planMeta.skipReason = "direct_response_only";
  hpush(blockedChat, "dispatch", "blocked-case", "running");
  hpush(blockedChat, "turn/start", "blocked-case", "running");
  hpush(blockedChat, "plan/update", "PLAN SKIP / FAST_PLANNING", "info");
  hpush(blockedChat, "reasoning", "blocked-case", "info");
  syncHarnessFlow(blockedChat, "adaptive");

  const blockedFlow = Object.fromEntries(blockedChat.h.flow.map((phase) => [phase.id, phase]));
  assert.strictEqual(blockedFlow.requirements.state, "blocked", "blocked requirement contracts should keep Step 1 blocked");
  assert.strictEqual(blockedFlow.planning.state, "todo", "blocked requirement contracts should not advance planning");
  assert.strictEqual(blockedFlow.execution.state, "todo", "blocked requirement contracts should not advance execution");
  assert.strictEqual(blockedFlow.quality.state, "todo", "blocked requirement contracts should not advance quality");
  assert.strictEqual(blockedFlow.report.state, "todo", "blocked requirement contracts should not advance reporting");
  assert.strictEqual(blockedFlow.planning.detail, "要件整理の確定待ち", "planning detail should explain the upstream gate");

  const completedBlockedChat = { h: createHarnessState() };
  completedBlockedChat.h.turnSnapshot = blockedChat.h.turnSnapshot;
  hset(completedBlockedChat, "running");
  hpush(completedBlockedChat, "dispatch", "blocked-complete", "running");
  hpush(completedBlockedChat, "turn/start", "blocked-complete", "running");
  hpush(completedBlockedChat, "plan/update", "PLAN SKIP / FAST_PLANNING", "info");
  hset(completedBlockedChat, "completed");
  hpush(completedBlockedChat, "turn/completed", "completed", "info");
  syncHarnessFlow(completedBlockedChat, "relaxed");

  const completedBlockedFlow = Object.fromEntries(completedBlockedChat.h.flow.map((phase) => [phase.id, phase]));
  assert.strictEqual(completedBlockedFlow.requirements.state, "blocked", "completed turns should still keep blocked requirements visible as blocked");
  assert.strictEqual(completedBlockedFlow.planning.state, "todo", "completed turns should not mark planning done when requirements stayed blocked");
  assert.strictEqual(completedBlockedFlow.execution.state, "todo", "completed turns should not mark execution done when requirements stayed blocked");

  const blockedPlanPanel = requirementGatePlanPanelStateForUi(blockedChat.h.turnSnapshot.__requirementSnapshot);
  assert.strictEqual(blockedPlanPanel.metaText, "要件整理保留", "plan panel meta should foreground the requirement hold state");
  assert.ok(/計画には進まない/.test(blockedPlanPanel.currentDetailText), "plan panel detail should explain that planning is paused by the requirement gate");
  assert.ok(/要確認/.test(blockedPlanPanel.currentStepText), "plan panel should foreground the blocking clarification question");

  console.log("PASS harness_requirement_gate_flow_test");
}

try {
  run();
} catch (error) {
  console.error(`FAIL harness_requirement_gate_flow_test :: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}
