#!/usr/bin/env node
"use strict";

const assert = require("assert");
const path = require("path");
const {
  buildPlanningArtifacts,
  loadPlanningModeContract,
} = require("./lib/planning_mode_policy");
const {
  buildOperatorPlanEvent,
} = require("./lib/operator_plan_surface");

function run() {
  const contract = loadPlanningModeContract(path.join(__dirname, "config", "planning_mode_contract.json"));

  const directQuestionPrompt = "What time is it in Tokyo?";
  const directQuestionArtifacts = buildPlanningArtifacts({
    prompt: directQuestionPrompt,
    options: { agentName: "default" },
    contract,
  });
  const directQuestionEvent = buildOperatorPlanEvent({
    planningContext: directQuestionArtifacts,
    agentName: "default",
  });
  assert(directQuestionEvent, "direct-response planning event should exist");
  assert.strictEqual(directQuestionEvent.decision, "plan", "simple prompt should still surface a visible plan under the current policy");
  assert.strictEqual(directQuestionEvent.steps[0].phase, "execution", "simple prompt should start in execution phase");
  assert(Array.isArray(directQuestionEvent.steps[0].requestClauseRefs) && directQuestionEvent.steps[0].requestClauseRefs.length >= 1, "simple plan should still surface trace refs");
  assert(
    !directQuestionEvent.explanation.includes("PLAN SKIP:"),
    "PLAN SKIP explanation should avoid a duplicated prefix"
  );
  assert(
    !directQuestionEvent.steps[0].step.startsWith("PLAN SKIP"),
    "PLAN SKIP step copy should avoid repeating the prefix inside the step text"
  );

  const docsPrompt = [
    "# Goal",
    "Update only docs/CURRENT_ARCHITECTURE.md with one wording fix.",
    "# Acceptance Criteria",
    "- Change exactly one sentence.",
    "- Do not modify any other file.",
  ].join("\n");
  const docsArtifacts = buildPlanningArtifacts({
    prompt: docsPrompt,
    options: { agentName: "default" },
    contract,
  });
  const docsEvent = buildOperatorPlanEvent({
    planningContext: docsArtifacts,
    agentName: "default",
  });
  assert(docsEvent, "docs plan event should exist");
  assert.strictEqual(docsEvent.decision, "plan", "bounded docs change should keep a visible plan");
  assert.strictEqual(docsEvent.steps[0].phase, "execution", "bounded docs change should start in execution phase");
  assert.strictEqual(docsEvent.steps[0].status, "in_progress", "execution step should start in progress");
  assert(
    docsEvent.steps[0].step.includes("Update only docs/CURRENT_ARCHITECTURE.md with one wording fix"),
    "docs execution step should surface the concrete user goal"
  );
  assert(Array.isArray(docsEvent.steps[0].requestClauseRefs) && docsEvent.steps[0].requestClauseRefs.length >= 1, "execution step should carry requestClauseRefs");
  assert(Array.isArray(docsEvent.steps[0].requirementRefs) && docsEvent.steps[0].requirementRefs.length >= 1, "execution step should carry requirementRefs");
  assert.strictEqual(docsEvent.steps[docsEvent.steps.length - 1].phase, "report", "plan should end with report phase");
  assert(
    docsEvent.explanation.includes("FAST_PLANNING"),
    "docs plan explanation should expose planning depth"
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
  const normalArtifacts = buildPlanningArtifacts({
    prompt: normalPrompt,
    options: { agentName: "default" },
    contract,
  });
  const normalEvent = buildOperatorPlanEvent({
    planningContext: normalArtifacts,
    agentName: "default",
  });
  assert(normalEvent, "normal plan event should exist");
  assert.strictEqual(normalEvent.decision, "plan", "normal change should not be skipped");
  const qualityStep = normalEvent.steps.find((step) => step && step.phase === "quality");
  const reportStep = normalEvent.steps.find((step) => step && step.phase === "report");
  assert(qualityStep, "normal signoff plan should include a quality step");
  assert(reportStep, "normal signoff plan should include a report step");
  assert.strictEqual(normalEvent.coordinationMode, "single_writer", "operator plan should expose single-writer coordination");
  assert.strictEqual(normalEvent.integrationOwner, "backend_worker", "operator plan should expose the integration writer");
  assert.deepStrictEqual(normalEvent.advisoryAgents, ["infra_worker"], "operator plan should expose advisory agents");
  assert.strictEqual(normalEvent.freshReviewerRequired, 1, "operator plan should expose fresh reviewer requirement");
  assert(Array.isArray(qualityStep.acceptanceCheckRefs) && qualityStep.acceptanceCheckRefs.length >= 1, "quality step should carry acceptanceCheckRefs");
  assert(Array.isArray(reportStep.requestClauseRefs) && reportStep.requestClauseRefs.length >= 1, "report step should retain request trace refs");

  const mappedFallbackEvent = buildOperatorPlanEvent({
    planningContext: {
      selection: {
        selectedMode: "NORMAL",
        selectedPlanningDepth: "STANDARD_PLANNING",
        selectedAssuranceDepth: "STANDARD_ASSURANCE",
        flowPath: "NORMAL_PATH",
      },
      dispatchPlan: {
        proposalOnly: 0,
        dispatches: [
          {
            dispatchId: "dispatch-backend",
            ownerAgent: "backend_worker",
            taskSummary: "Update runtime evidence output.",
            requestClauseRefs: [],
            requirementRefs: [],
            acceptanceCheckRefs: ["ac-1"],
          },
        ],
      },
      requirementContract: {
        lockedGoal: "Keep reviewer-facing signoff evidence aligned with the locked contract.",
        acceptanceChecks: [{ id: "ac-1", title: "Reviewer and tester evidence remain visible." }],
        requestCoverage: {
          coreObligations: ["req-1"],
          mappedRequirements: [
            { clauseId: "req-1", requirementRefs: ["lockedGoal"] },
            { clauseId: "req-2", requirementRefs: ["acceptanceChecks"] },
          ],
        },
      },
    },
    agentName: "default",
  });
  assert(mappedFallbackEvent, "mapped fallback event should exist");
  assert.deepStrictEqual(
    mappedFallbackEvent.steps[0].requestClauseRefs,
    ["req-1", "req-2"],
    "operator plan fallback should retain mapped request clauses beyond the core obligations"
  );

  const longTraceEvent = buildOperatorPlanEvent({
    planningContext: {
      selection: {
        selectedMode: "NORMAL",
        selectedPlanningDepth: "STANDARD_PLANNING",
        selectedAssuranceDepth: "SIGNOFF_ASSURANCE",
        flowPath: "NORMAL_PATH",
      },
      dispatchPlan: {
        proposalOnly: 0,
        reviewerRequired: 1,
        testerRequired: 1,
        signoffRequired: 1,
        dispatches: [
          {
            dispatchId: "dispatch-backend-long",
            ownerAgent: "backend_worker",
            taskSummary: "Keep the full request trace visible through report.",
            requestClauseRefs: Array.from({ length: 17 }, (_, index) => `req-${index + 1}`),
            requirementRefs: ["lockedGoal", "acceptanceChecks"],
            acceptanceCheckRefs: ["ac-1"],
          },
        ],
      },
      requirementContract: {
        lockedGoal: "Keep long trace coverage intact.",
        acceptanceChecks: [{ id: "ac-1", title: "All trace refs remain visible." }],
        requestCoverage: {
          coreObligations: Array.from({ length: 17 }, (_, index) => `req-${index + 1}`),
          mappedRequirements: Array.from({ length: 17 }, (_, index) => ({
            clauseId: `req-${index + 1}`,
            requirementRefs: ["lockedGoal"],
          })),
        },
      },
    },
    agentName: "default",
  });
  assert(longTraceEvent, "long trace event should exist");
  assert.strictEqual(
    longTraceEvent.steps[0].requestClauseRefs.length,
    17,
    "operator plan steps should keep the full request clause ledger instead of truncating at 16"
  );
  assert(
    longTraceEvent.steps[0].requestClauseRefs.includes("req-17"),
    "operator plan steps should keep the seventeenth request clause ref"
  );

  const clarificationPrompt = [
    "# Goal",
    "UI とユーザーの好みにちゃんと沿うように改善して。",
  ].join("\n");
  const clarificationArtifacts = buildPlanningArtifacts({
    prompt: clarificationPrompt,
    options: { agentName: "default", executionSource: "web_ui" },
    contract,
  });
  const clarificationEvent = buildOperatorPlanEvent({
    planningContext: clarificationArtifacts,
    agentName: "default",
  });
  assert(clarificationEvent, "clarification-first plan event should exist");
  assert.strictEqual(clarificationEvent.decision, "plan", "clarification-first turn should remain a visible plan");
  assert.strictEqual(clarificationEvent.steps[0].kind, "clarification", "clarification-first plan should surface a clarification step");
  assert.strictEqual(clarificationEvent.steps[0].phase, "planning", "clarification-first step should stay in planning phase");
  assert.strictEqual(clarificationEvent.steps[1].kind, "needs_input", "clarification-first plan should surface the wait state");
  assert(
    clarificationEvent.steps[0].step.includes("確認質問を 1 つ"),
    "clarification-first step should explain the single-question action in Japanese"
  );
  assert(Array.isArray(clarificationEvent.steps[0].requestClauseRefs), "clarification step should keep request trace refs");

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
  const discoveryArtifacts = buildPlanningArtifacts({
    prompt: discoveryPrompt,
    options: { agentName: "default" },
    contract,
  });
  const discoveryEvent = buildOperatorPlanEvent({
    planningContext: discoveryArtifacts,
    agentName: "default",
  });
  assert(discoveryEvent, "discovery plan event should exist");
  assert.strictEqual(discoveryEvent.decision, "plan", "meaningful discovery work should remain a visible plan");
  assert.strictEqual(discoveryEvent.steps[0].phase, "planning", "discovery step should stay in planning phase");
  assert.strictEqual(discoveryEvent.steps[1].kind, "needs_input", "discovery plan should surface the stop condition");
  assert(Array.isArray(discoveryEvent.steps[0].requestClauseRefs), "discovery step should keep trace refs");

  const concreteNeedsInputEvent = buildOperatorPlanEvent({
    planningContext: {
      selection: {
        selectedMode: "DISCOVERY",
        selectedPlanningDepth: "DISCOVERY_PLANNING",
        selectedAssuranceDepth: "SIGNOFF_ASSURANCE",
        flowPath: "DISCOVERY_PATH",
      },
      dispatchPlan: {
        proposalOnly: 1,
        dispatches: [
          {
            dispatchId: "dispatch-default-discovery",
            ownerAgent: "default",
            taskSummary: "実装に入る前に、未解決の要件、非対象範囲、前提、承認境界を整理する。",
            requestClauseRefs: ["req-1"],
            requirementRefs: ["lockedGoal"],
            acceptanceCheckRefs: ["ac-1"],
          },
        ],
      },
      requirementContract: {
        explicitGoal: "Web UI の設定導線を v0.116 向けに更新する。",
        openQuestions: ["Guardian Approvals を別導線として見せるかを確認する。"],
        acceptanceChecks: [{ id: "ac-1", title: "設定モーダル表示が新 UI と一致すること。" }],
        requestCoverage: {
          rawRequestClauses: [
            { id: "req-1", text: "Web UI の設定導線を v0.116 向けに更新する。", kind: "explicit_request", lane: "core" },
          ],
          coreObligations: ["req-1"],
          mappedRequirements: [
            { clauseId: "req-1", requirementRefs: ["lockedGoal"] },
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
    agentName: "default",
  });
  assert(concreteNeedsInputEvent, "manual discovery policy-plan event should exist");
  assert.strictEqual(concreteNeedsInputEvent.decision, "plan", "manual discovery policy-plan should remain visible");
  assert(
    concreteNeedsInputEvent.steps[0].step.includes("Web UI の設定導線を v0.116 向けに更新する"),
    "discovery step should reuse the explicit goal when taskSummary is generic"
  );
  assert(
    concreteNeedsInputEvent.steps[1].step.includes("Guardian Approvals を別導線として見せるかを確認する"),
    "needs_input step should surface the specific unresolved question"
  );
  assert.deepStrictEqual(concreteNeedsInputEvent.steps[0].requestClauseRefs, ["req-1"], "manual discovery step should preserve requestClauseRefs");
  assert.deepStrictEqual(concreteNeedsInputEvent.steps[0].acceptanceCheckRefs, ["ac-1"], "manual discovery step should preserve acceptanceCheckRefs");
}

try {
  run();
  console.log("PASS operator_plan_surface_test");
} catch (error) {
  console.error(`FAIL operator_plan_surface_test: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}
