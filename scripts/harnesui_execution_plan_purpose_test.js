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

function loadHelpers() {
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
      extractBlock(source, /const REQUIREMENT_FIELD_LABELS_FOR_UI=Object\.freeze\(\{[^]*?\n\}\);/, "REQUIREMENT_FIELD_LABELS_FOR_UI"),
      extractFunction(source, "qualityAxisLabelForUi"),
      extractFunction(source, "requirementTextLabelForUi"),
      extractFunction(source, "normalizeRequirementCompareKeyForUi"),
      extractFunction(source, "requirementKeysOverlapForUi"),
      extractFunction(source, "distinctRequirementCandidateForUi"),
      extractFunction(source, "collectDistinctRequirementCandidatesForUi"),
      extractFunction(source, "stripQuestionLeadForUi"),
      extractFunction(source, "requirementLooksFragmentaryForUi"),
      extractFunction(source, "preferredRequirementNarrativeForUi"),
      extractFunction(source, "joinIntentPhrasesForUi"),
      extractFunction(source, "inferQuestionIntentDirectionForUi"),
      extractFunction(source, "inferQuestionIntentHypothesisForUi"),
      extractFunction(source, "compactTextListForUi"),
      extractFunction(source, "summarizeInlineListForUi"),
      extractFunction(source, "requirementStatusLabelForUi"),
      extractFunction(source, "requirementValidationLabelForUi"),
      extractFunction(source, "requirementFieldLabelForUi"),
      extractFunction(source, "collectRequirementProvenanceCountsForUi"),
      extractFunction(source, "summarizeRequirementProvenanceForUi"),
      extractFunction(source, "buildRequirementLockSnapshotForUi"),
      extractFunction(source, "normalizePlanTraceRefsForUi"),
      extractFunction(source, "planPurposeSummaryForUi"),
      "this.__helpers__ = { buildRequirementLockSnapshotForUi, planPurposeSummaryForUi };",
    ].join("\n"),
    context
  );
  return context.__helpers__;
}

function run() {
  const { buildRequirementLockSnapshotForUi, planPurposeSummaryForUi } = loadHelpers();

  const snapshot = buildRequirementLockSnapshotForUi({
    planning: {
      requirementContract: {
        explicitGoal: "Render execution plan purpose in the main UI",
        acceptanceChecks: [
          { id: "ac-1", title: "Verify browser rendering and documentation sync" },
        ],
        requestCoverage: {
          rawRequestClauses: [
            { id: "req-1", text: "Render execution plan panel in the main UI", kind: "explicit_request", lane: "core" },
          ],
          coreObligations: ["req-1"],
          mappedRequirements: [
            { clauseId: "req-1", requirementRefs: ["explicitGoal"] },
          ],
          parkedItems: [],
          droppedItems: [],
          coverageSummary: {
            totalClauses: 1,
            mappedCount: 1,
            coreTotal: 1,
            coreMapped: 1,
            coreUnmapped: 0,
            parkedCount: 0,
            droppedCount: 0,
          },
        },
      },
    },
  });

  assert.strictEqual(
    planPurposeSummaryForUi({ requestClauseRefs: ["req-1"] }, snapshot),
    "支える依頼: Render execution plan panel in the main UI",
    "plan purpose should prefer the original request clause text"
  );
  assert.strictEqual(
    planPurposeSummaryForUi({ acceptanceCheckRefs: ["ac-1"] }, snapshot),
    "支える受け入れ: Verify browser rendering and documentation sync",
    "plan purpose should fall back to acceptance checks when no request clause ref exists"
  );
  assert.strictEqual(
    planPurposeSummaryForUi({ requirementRefs: ["explicitGoal"] }, snapshot),
    "支える要件: 明示ゴール",
    "plan purpose should fall back to requirement field labels when only requirement refs exist"
  );
}

try {
  run();
  console.log("PASS harnesui_execution_plan_purpose_test");
} catch (error) {
  console.error(`FAIL harnesui_execution_plan_purpose_test: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}
