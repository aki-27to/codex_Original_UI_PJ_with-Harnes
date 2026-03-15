#!/usr/bin/env node
"use strict";

const assert = require("assert");
const path = require("path");
const {
  buildPlanningArtifacts,
  loadPlanningModeContract,
  sanitizePlanningArtifactsForRuntime,
} = require("./lib/planning_mode_policy");

function run() {
  const contract = loadPlanningModeContract(path.join(__dirname, "config", "planning_mode_contract.json"));
  assert.strictEqual(contract.schema, "planning-mode-contract.v1", "planning mode contract schema mismatch");

  const fastPrompt = [
    "# Goal",
    "Update only docs/CURRENT_ARCHITECTURE.md with one wording fix.",
    "# Acceptance Criteria",
    "- Change exactly one sentence.",
    "- Do not modify any other file.",
  ].join("\n");
  const fastArtifacts = buildPlanningArtifacts({ prompt: fastPrompt, options: { agentName: "default" }, contract });
  assert.strictEqual(fastArtifacts.selection.selectedMode, "FAST", "small bounded task should select FAST");
  assert.strictEqual(fastArtifacts.selection.selectedPlanningDepth, "FAST_PLANNING", "FAST task should map to FAST_PLANNING");
  assert.strictEqual(fastArtifacts.selection.selectedAssuranceDepth, "LIGHT_ASSURANCE", "docs-only fast task should select LIGHT_ASSURANCE");
  assert.strictEqual(fastArtifacts.dispatchPlan.dispatches[0].ownerAgent, "infra_worker", "docs-only task should route to infra_worker");
  assert.ok(
    fastArtifacts.requirementContract.userValueFrame
      && Array.isArray(fastArtifacts.requirementContract.userValueFrame.qualityAxes)
      && fastArtifacts.requirementContract.userValueFrame.qualityAxes.includes("correctness"),
    "FAST deterministic task should still receive a user-value frame"
  );

  const normalPrompt = [
    "# Goal",
    "Update server.js and docs/CURRENT_ARCHITECTURE.md to expose the selected execution flow in runtime output.",
    "# Implementation Requirements",
    "- Update server.js runtime output.",
    "- Update docs/CURRENT_ARCHITECTURE.md.",
    "# Acceptance Criteria",
    "- Reviewer evidence is required.",
    "- Tester evidence is required.",
  ].join("\n");
  const normalArtifacts = buildPlanningArtifacts({ prompt: normalPrompt, options: { agentName: "default" }, contract });
  assert.strictEqual(normalArtifacts.selection.selectedMode, "NORMAL", "cross-specialist bounded task should select NORMAL");
  assert.strictEqual(normalArtifacts.selection.selectedPlanningDepth, "STANDARD_PLANNING", "NORMAL task should map to STANDARD_PLANNING");
  assert.strictEqual(normalArtifacts.selection.selectedAssuranceDepth, "SIGNOFF_ASSURANCE", "runtime/doc task with reviewer/tester should select SIGNOFF_ASSURANCE");
  assert.deepStrictEqual(
    normalArtifacts.dispatchPlan.dispatches.map((entry) => entry.ownerAgent),
    ["backend_worker", "infra_worker"],
    "NORMAL plan should split backend and infra ownership"
  );
  assert.strictEqual(normalArtifacts.dispatchPlan.reviewerRequired, 1, "NORMAL plan should require reviewer");
  assert.strictEqual(normalArtifacts.dispatchPlan.testerRequired, 1, "NORMAL plan should require tester");
  assert.strictEqual(normalArtifacts.dispatchPlan.signoffRequired, 1, "high-risk runtime task should require signoff");

  const forcedFastArtifacts = buildPlanningArtifacts({
    prompt: normalPrompt,
    options: { agentName: "default", fastModeEnabled: true },
    contract,
  });
  assert.strictEqual(forcedFastArtifacts.selection.selectedMode, "FAST", "fast mode should force FAST planning for otherwise NORMAL tasks");
  assert.strictEqual(forcedFastArtifacts.selection.selectedPlanningDepth, "FAST_PLANNING", "fast mode should force FAST_PLANNING");
  assert.strictEqual(forcedFastArtifacts.selection.selectedAssuranceDepth, "SIGNOFF_ASSURANCE", "fast mode should not weaken required assurance depth");
  assert.strictEqual(forcedFastArtifacts.selection.runtime.fastModeEnabled, 1, "runtime planning context should persist fast mode");

  const japaneseFrontendPrompt = [
    "# Goal",
    "\u30d5\u30a9\u30f3\u30c8\u3084\u30ec\u30a4\u30a2\u30a6\u30c8\u3092 https://www.suruga-k.jp/ \u3092\u53c2\u8003\u306b\u5237\u65b0\u3057\u3066\u4e0b\u3055\u3044\u3002",
    "\u30da\u30fc\u30b8\u6570\u3082\u4eca\u306f1\u30da\u30fc\u30b8\u3057\u304b\u306a\u3044\u3002\u3068\u308a\u3042\u3048\u305a3\u30da\u30fc\u30b8\u306b\u3057\u3066\u4e0b\u3055\u3044\u3002",
  ].join("\n");
  const japaneseFrontendArtifacts = buildPlanningArtifacts({ prompt: japaneseFrontendPrompt, options: { agentName: "default" }, contract });
  assert.strictEqual(japaneseFrontendArtifacts.selection.selectedMode, "NORMAL", "Japanese frontend redesign should stay in NORMAL mode");
  assert.strictEqual(japaneseFrontendArtifacts.selection.selectedPlanningDepth, "STANDARD_PLANNING", "Japanese frontend redesign should keep standard planning");
  assert.strictEqual(japaneseFrontendArtifacts.selection.selectedAssuranceDepth, "LIGHT_ASSURANCE", "bounded frontend redesign should stay light assurance");
  assert.deepStrictEqual(
    japaneseFrontendArtifacts.dispatchPlan.dispatches.map((entry) => entry.ownerAgent),
    ["frontend_worker"],
    "Japanese frontend redesign should route to frontend_worker"
  );
  assert.strictEqual(japaneseFrontendArtifacts.dispatchPlan.reviewerRequired, 0, "light-assurance frontend redesign should not force reviewer evidence");
  assert.strictEqual(japaneseFrontendArtifacts.dispatchPlan.testerRequired, 0, "light-assurance frontend redesign should not force tester evidence");

  const webCreativePrompt = [
    "# Goal",
    "\u3053\u306eUI\u3001\u30e6\u30fc\u30b6\u30fc\u306e\u597d\u307f\u306b\u3061\u3083\u3093\u3068\u5408\u3046\u3088\u3046\u306b\u6539\u5584\u3057\u3066\u3002",
  ].join("\n");
  const webCreativeArtifacts = buildPlanningArtifacts({
    prompt: webCreativePrompt,
    options: { agentName: "default", executionSource: "web_ui" },
    contract,
  });
  assert.strictEqual(webCreativeArtifacts.selection.taskFamily, "web_creative", "web quality request should select web_creative family");
  assert.strictEqual(webCreativeArtifacts.selection.familyProfileId, "web_creative", "web quality request should carry family profile id");
  assert.strictEqual(webCreativeArtifacts.selection.selectedMode, "DISCOVERY", "preference-sensitive web request should pause for clarification");
  assert.strictEqual(webCreativeArtifacts.selection.selectedPlanningDepth, "DISCOVERY_PLANNING", "clarification-first web request should stay in discovery planning");
  assert.strictEqual(webCreativeArtifacts.selection.needsInputRecommended, true, "clarification-first web request should recommend NEEDS_INPUT");
  assert.strictEqual(webCreativeArtifacts.selection.signals.clarificationAction, "ask_user_once", "web creative ambiguity should map to a single clarifying question");
  assert.ok(
    typeof webCreativeArtifacts.selection.signals.clarificationQuestion === "string"
      && webCreativeArtifacts.selection.signals.clarificationQuestion.length > 0,
    "clarification-first web request should carry a concrete question"
  );
  assert.strictEqual(webCreativeArtifacts.requirementContract.taskFamily, "web_creative", "requirement contract should persist task family");
  assert.strictEqual(webCreativeArtifacts.dispatchPlan.familyProfileId, "web_creative", "dispatch plan should persist family profile id");
  assert.strictEqual(webCreativeArtifacts.dispatchPlan.proposalOnly, 1, "clarification-first web request should stay proposal-only");
  assert.ok(
    webCreativeArtifacts.dispatchPlan.dispatches[0].taskSummary.includes("確認"),
    "clarification-first web request should surface a Japanese single-question dispatch summary"
  );
  assert.ok(
    webCreativeArtifacts.requirementContract.userValueFrame
      && typeof webCreativeArtifacts.requirementContract.userValueFrame.valueThesis === "string"
      && webCreativeArtifacts.requirementContract.userValueFrame.valueThesis.length > 0,
    "web creative requirement contract should include user-value thesis"
  );
  assert.ok(
    Array.isArray(webCreativeArtifacts.requirementContract.userValueFrame.qualityAxes)
      && webCreativeArtifacts.requirementContract.userValueFrame.qualityAxes.includes("first_impression"),
    "web creative requirement contract should include first-impression quality axis"
  );
  assert.ok(
    Array.isArray(webCreativeArtifacts.requirementContract.userValueFrame.mustAvoid)
      && webCreativeArtifacts.requirementContract.userValueFrame.mustAvoid.length >= 1,
    "web creative requirement contract should include must-avoid guardrails"
  );

  const questionPrompt = "ワークスペースっていうのはなに？？ここに何も記載しなかった場合はどうなるの？";
  const questionArtifacts = buildPlanningArtifacts({
    prompt: questionPrompt,
    options: { agentName: "default" },
    contract,
  });
  assert.strictEqual(
    questionArtifacts.requirementContract.explicitGoal,
    "ワークスペースの意味とここに何も記載しなかった場合の挙動を説明する",
    "question-only prompt should lock an interpreted explanation goal instead of copying the raw input"
  );
  assert.deepStrictEqual(
    questionArtifacts.requirementContract.openQuestions,
    [],
    "question-only prompt should not surface the user's question as an unresolved blocker"
  );

  const discoveryPrompt = [
    "# Goal",
    "Design a new enterprise execution workflow for a future product line.",
    "# Background",
    "The goal, non-goals, specialist ownership, and acceptance checks are not fixed yet.",
    "User decision is required before implementation.",
    "# Acceptance Criteria",
    "- First make the open questions explicit.",
    "- Do not implement anything.",
  ].join("\n");
  const discoveryArtifacts = buildPlanningArtifacts({ prompt: discoveryPrompt, options: { agentName: "default" }, contract });
  assert.strictEqual(discoveryArtifacts.selection.selectedMode, "DISCOVERY", "ambiguous task should select DISCOVERY");
  assert.strictEqual(discoveryArtifacts.selection.selectedPlanningDepth, "DISCOVERY_PLANNING", "DISCOVERY task should map to DISCOVERY_PLANNING");
  assert.strictEqual(discoveryArtifacts.selection.selectedAssuranceDepth, "STANDARD_ASSURANCE", "ambiguous non-runtime task should default to STANDARD_ASSURANCE");
  assert.strictEqual(discoveryArtifacts.selection.needsInputRecommended, true, "DISCOVERY should recommend NEEDS_INPUT");
  assert.strictEqual(discoveryArtifacts.dispatchPlan.proposalOnly, 1, "DISCOVERY dispatch plan should stay proposal-only");
  assert.strictEqual(discoveryArtifacts.requirementContract.schema, "requirement-contract.v3", "requirement contract should match the v3 schema");
  assert.strictEqual(discoveryArtifacts.dispatchPlan.schema, "dispatch-plan.v2", "dispatch plan should match the v2 schema");
  assert.ok(
    discoveryArtifacts.requirementContract.openQuestions.includes("What acceptance checks define success?"),
    "DISCOVERY should infer an explicit acceptance-check question"
  );
  assert.ok(
    discoveryArtifacts.requirementContract.openQuestions.includes("Which specialist boundaries are in scope?"),
    "DISCOVERY should infer an explicit specialist-boundary question"
  );
  assert.ok(
    discoveryArtifacts.requirementContract.nonGoals.includes("未解決の確認事項が片付くまでは、実装や設定変更を行わない。"),
    "DISCOVERY should infer proposal-only non-goals when none are provided"
  );
  assert.ok(
    discoveryArtifacts.requirementContract.userValueFrame
      && Array.isArray(discoveryArtifacts.requirementContract.userValueFrame.completedMeans)
      && discoveryArtifacts.requirementContract.userValueFrame.completedMeans.length >= 1,
    "DISCOVERY requirement contract should still include user-value completion framing"
  );

  const markerPrompt = [
    "[FIXTURE_SCENARIO] DISCOVERY_SAMPLE",
    "[BASELINE_PROFILE] measured",
    "#requirement-locked",
    "#scope-core",
    ...discoveryPrompt.split("\n"),
  ].join("\n");
  const markerArtifacts = buildPlanningArtifacts({ prompt: markerPrompt, options: { agentName: "default" }, contract });
  assert.ok(
    !markerArtifacts.requirementContract.explicitGoal.includes("[FIXTURE_SCENARIO]"),
    "policy analysis should ignore fixture control markers in the explicit goal"
  );
  assert.ok(
    !markerArtifacts.requirementContract.openQuestions.some((entry) => entry.includes("[FIXTURE_SCENARIO]")),
    "policy analysis should ignore fixture control markers in open questions"
  );

  const sanitized = sanitizePlanningArtifactsForRuntime(discoveryArtifacts);
  assert.strictEqual(sanitized.requirementContract.selectedPlanningDepth, "DISCOVERY_PLANNING", "sanitized artifacts should preserve planning depth");
  assert.strictEqual(sanitized.requirementContract.selectedAssuranceDepth, "STANDARD_ASSURANCE", "sanitized artifacts should preserve assurance depth");
  assert.ok(Array.isArray(sanitized.dispatchPlan.dispatches), "sanitized dispatch plan should keep dispatches");
  assert.ok(
    sanitized.requirementContract.userValueFrame
      && sanitized.requirementContract.userValueFrame.valueThesis,
    "sanitized artifacts should preserve user-value frame"
  );
}

try {
  run();
  console.log("PASS planning_mode_policy_test");
} catch (error) {
  console.error(`FAIL planning_mode_policy_test: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}
