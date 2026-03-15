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

function loadSnapshotHelper() {
  const source = fs.readFileSync(path.join(__dirname, "..", "web", "01.HarnesUI", "app.js"), "utf8");
  const context = {
    Object,
    toArr(value) {
      return Array.isArray(value) ? value : (value == null ? [] : [value]);
    },
    t1(value, max = 999) {
      return String(value == null ? "" : value).slice(0, max);
    },
    planningContextForUi(turn) {
      return turn && turn.planning && typeof turn.planning === "object" ? turn.planning : {};
    },
    requirementContractForUi(turn) {
      const planning = context.planningContextForUi(turn);
      return planning.requirementContract && typeof planning.requirementContract === "object" ? planning.requirementContract : {};
    },
  };
  vm.runInNewContext(
    [
      extractBlock(source, /const QUALITY_AXIS_LABELS_FOR_UI=Object\.freeze\(\{[^]*?\n\}\);/, "QUALITY_AXIS_LABELS_FOR_UI"),
      extractBlock(source, /const REQUIREMENT_TEXT_LABELS_FOR_UI=Object\.freeze\(\{[^]*?\n\}\);/, "REQUIREMENT_TEXT_LABELS_FOR_UI"),
      extractFunction(source, "qualityAxisLabelForUi"),
      extractFunction(source, "requirementTextLabelForUi"),
      extractFunction(source, "normalizeRequirementCompareKeyForUi"),
      extractFunction(source, "stripQuestionLeadForUi"),
      extractFunction(source, "compactTextListForUi"),
      extractFunction(source, "acceptanceCheckLabelsForUi"),
      extractFunction(source, "buildRequirementLockSnapshotForUi"),
      "this.__helper__ = buildRequirementLockSnapshotForUi;",
    ].join("\n"),
    context
  );
  return context.__helper__;
}

function run() {
  const buildRequirementLockSnapshotForUi = loadSnapshotHelper();
  const snapshot = buildRequirementLockSnapshotForUi({
    planning: {
      requirementContract: {
        explicitGoal: "ワークスペースの意味とここに何も記載しなかった場合の挙動を説明する",
        openQuestions: ["ワークスペースの意味とここに何も記載しなかった場合の挙動を説明する"],
        acceptanceChecks: [],
        baselineScope: [],
        overDeliveryScope: [],
        nonGoals: [],
        assumptions: [],
        userValueFrame: {
          valueThesis: "依頼された変更を正しく、局所的に、あとからの手戻り圧を増やさない形で届ける。",
          mustAvoid: [],
          qualityAxes: ["bounded_scope"],
          completedMeans: [],
        },
      },
    },
  });

  assert.strictEqual(snapshot.goalGroupTitle, "回答テーマ", "explanation goals should surface as answer themes");
  assert.strictEqual(snapshot.explicitGoalLabel, "テーマ", "question-style explanation goals should avoid the rigid 明示ゴール label");
  assert.deepStrictEqual(snapshot.openQuestions, [], "goal-equivalent open questions should be filtered out from the unresolved bucket");
  assert.deepStrictEqual(snapshot.qualityAxes, ["スコープの適切さ"], "quality axis ids should be localized for the UI");
  console.log("[harnesui-requirement-summary-test] PASS");
  console.log("PASS");
}

try {
  run();
} catch (error) {
  console.log(`[harnesui-requirement-summary-test] FAIL ${error instanceof Error ? error.message : String(error)}`);
  console.log("FAIL");
  process.exitCode = 1;
}
