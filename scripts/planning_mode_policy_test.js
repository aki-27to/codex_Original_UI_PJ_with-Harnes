#!/usr/bin/env node
"use strict";

const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const {
  buildPlanningArtifacts,
  buildDispatchPlan,
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
  assert.strictEqual(fastArtifacts.requirementContract.status, "LOCKED", "bounded FAST task should lock the requirement contract");
  assert.strictEqual(fastArtifacts.requirementContract.validation.verdict, "PASS", "bounded FAST task should pass requirement validation");
  assert.ok(
    fastArtifacts.requirementContract.intentLock
      && fastArtifacts.requirementContract.intentLock.lockStatus === "locked"
      && fastArtifacts.requirementContract.intentLock.userRequest.length > 0,
    "requirement contracts should separate a locked intent lock surface"
  );
  assert.ok(
    fastArtifacts.requirementContract.acceptanceLock
      && fastArtifacts.requirementContract.acceptanceLock.lockStatus === "locked"
      && fastArtifacts.requirementContract.acceptanceLock.passConditions.length >= 1
      && fastArtifacts.requirementContract.acceptanceLock.failureConditions.length >= 1,
    "requirement contracts should separate a locked acceptance lock surface"
  );
  assert.ok(
    fastArtifacts.requirementContract.validation.checks.some((entry) => entry.id === "intent_lock_defined" && entry.status === "PASS"),
    "validation should require a machine-readable intent lock"
  );
  assert.ok(
    fastArtifacts.requirementContract.validation.checks.some((entry) => entry.id === "acceptance_lock_defined" && entry.status === "PASS"),
    "validation should require a machine-readable acceptance lock"
  );
  assert.ok(
    typeof fastArtifacts.requirementContract.lockedGoal === "string" && fastArtifacts.requirementContract.lockedGoal.length > 0,
    "FAST task should promote the validated goal into lockedGoal"
  );
  assert.strictEqual(
    fastArtifacts.requirementContract.displayContract.goalMode,
    "locked",
    "FAST task should expose a locked display contract"
  );
  assert.strictEqual(
    fastArtifacts.requirementContract.provenance.explicitGoal.source,
    "user_explicit",
    "explicit goal provenance should capture direct user wording for structured prompts"
  );
  assert.strictEqual(fastArtifacts.requirementContract.owner, "intake", "requirement contracts should identify intake as the Step 1 owner");
  assert.ok(
    fastArtifacts.requirementContract.requestCoverage
      && Array.isArray(fastArtifacts.requirementContract.requestCoverage.rawRequestClauses)
      && fastArtifacts.requirementContract.requestCoverage.rawRequestClauses.length >= 1,
    "requirement contracts should persist a request-coverage ledger"
  );
  assert.ok(
    Array.isArray(fastArtifacts.requirementContract.requestCoverage.coreObligations)
      && fastArtifacts.requirementContract.requestCoverage.coreObligations.length >= 1,
    "request coverage should track at least one core obligation for a bounded task"
  );
  assert.ok(
    Array.isArray(fastArtifacts.requirementContract.requestCoverage.mappedRequirements)
      && fastArtifacts.requirementContract.requestCoverage.mappedRequirements.length >= 1,
    "request coverage should map user clauses into the requirement contract"
  );
  assert.strictEqual(
    fastArtifacts.requirementContract.requestCoverage.coverageSummary.coreMapped,
    fastArtifacts.requirementContract.requestCoverage.coverageSummary.coreTotal,
    "bounded FAST tasks should fully map their core request obligations"
  );
  assert.ok(
    Array.isArray(fastArtifacts.dispatchPlan.dispatches[0].requestClauseRefs)
      && fastArtifacts.dispatchPlan.dispatches[0].requestClauseRefs.length >= 1,
    "dispatch plans should carry requestClauseRefs from Step 1 coverage"
  );
  assert.ok(
    Array.isArray(fastArtifacts.dispatchPlan.dispatches[0].requirementRefs)
      && fastArtifacts.dispatchPlan.dispatches[0].requirementRefs.length >= 1,
    "dispatch plans should carry requirementRefs back to the requirement contract"
  );
  assert.ok(
    Array.isArray(fastArtifacts.dispatchPlan.dispatches[0].acceptanceCheckRefs),
    "dispatch plans should always expose acceptanceCheckRefs"
  );
  const mappedOnlyTraceDispatchPlan = buildDispatchPlan({
    prompt: fastPrompt,
    options: { agentName: "default" },
    selection: fastArtifacts.selection,
    requirementContract: {
      ...fastArtifacts.requirementContract,
      requestCoverage: {
        ...fastArtifacts.requirementContract.requestCoverage,
        rawRequestClauses: [
          { id: "req-core", text: "Refresh the architecture wording.", kind: "explicit_request", lane: "core" },
          { id: "req-acceptance", text: "Keep the acceptance evidence visible.", kind: "acceptance", lane: "core" },
        ],
        coreObligations: ["req-core"],
        mappedRequirements: [
          { clauseId: "req-core", requirementRefs: ["lockedGoal"] },
          { clauseId: "req-acceptance", requirementRefs: ["acceptanceChecks"] },
        ],
      },
      acceptanceChecks: [{ id: "ac-1", title: "Keep the docs wording precise." }],
    },
    contract,
  });
  assert.deepStrictEqual(
    mappedOnlyTraceDispatchPlan.dispatches[0].requestClauseRefs,
    ["req-core", "req-acceptance"],
    "dispatch trace refs should preserve mapped clauses that extend beyond core obligations"
  );
  assert.ok(
    mappedOnlyTraceDispatchPlan.dispatches[0].requirementRefs.includes("acceptanceChecks"),
    "dispatch trace refs should retain requirement refs for mapped-only clauses"
  );
  const lockedOnlySanitized = sanitizePlanningArtifactsForRuntime({
    ...fastArtifacts,
    requirementContract: {
      ...fastArtifacts.requirementContract,
      explicitGoal: "",
      implicitGoal: "",
      lockedGoal: "Keep the operator contract readable without echoing the raw prompt.",
      intentHypotheses: [{
        id: "hypothesis_1",
        goal: "Keep the operator contract readable without echoing the raw prompt.",
        confidence: 100,
        evidence: ["locked_goal"],
        locked: true,
      }],
      status: "",
    },
  });
  assert.strictEqual(
    lockedOnlySanitized.requirementContract.status,
    "LOCKED",
    "runtime sanitization should treat lockedGoal or intent hypotheses as core requirement data"
  );
  assert.strictEqual(
    lockedOnlySanitized.requirementContract.intentLock.lockStatus,
    "locked",
    "runtime sanitization should preserve intent lock semantics"
  );
  assert.ok(
    lockedOnlySanitized.requirementContract.acceptanceLock.passConditions.length >= 1,
    "runtime sanitization should preserve acceptance lock semantics"
  );
  const unmappedCoverageSanitized = sanitizePlanningArtifactsForRuntime({
    ...fastArtifacts,
    requirementContract: {
      ...fastArtifacts.requirementContract,
      validation: undefined,
      requestCoverage: {
        ...fastArtifacts.requirementContract.requestCoverage,
        rawRequestClauses: [
          ...fastArtifacts.requirementContract.requestCoverage.rawRequestClauses,
          { id: "req-unmapped-core", text: "Keep the current wording tone intact.", kind: "constraint", lane: "core" },
        ],
        coreObligations: [...fastArtifacts.requirementContract.requestCoverage.coreObligations, "req-unmapped-core"],
      },
    },
  });
  assert.strictEqual(
    unmappedCoverageSanitized.requirementContract.validation.verdict,
    "BLOCK",
    "core obligations should not proceed when the request ledger leaves one unmapped"
  );
  assert.ok(
    unmappedCoverageSanitized.requirementContract.validation.checks.some((entry) => entry.id === "request_coverage_core_mapped" && entry.status === "BLOCK"),
    "validation should expose a machine-readable check for unmapped core obligations"
  );
  const coverageClauseId = fastArtifacts.requirementContract.requestCoverage.rawRequestClauses[0].id;
  const malformedCoverageSanitized = sanitizePlanningArtifactsForRuntime({
    ...fastArtifacts,
    requirementContract: {
      ...fastArtifacts.requirementContract,
      validation: undefined,
      requestCoverage: {
        ...fastArtifacts.requirementContract.requestCoverage,
        parkedItems: [{ clauseId: coverageClauseId }],
        droppedItems: [{ clauseId: coverageClauseId, reason: "Removed without a machine-readable code." }],
      },
    },
  });
  assert.ok(
    malformedCoverageSanitized.requirementContract.validation.checks.some((entry) => entry.id === "request_coverage_parked_reasoned" && entry.status === "BLOCK"),
    "parked request items should fail validation when no reason is recorded"
  );
  assert.ok(
    malformedCoverageSanitized.requirementContract.validation.checks.some((entry) => entry.id === "request_coverage_dropped_reasoned" && entry.status === "BLOCK"),
    "dropped request items should fail validation when no valid reasonCode is recorded"
  );
  const tracePrompt = [
    "# Goal",
    "Refresh only docs/CURRENT_ARCHITECTURE.md wording.",
    "# Constraints",
    "- Do not change runtime behavior.",
    "- Push to GitHub only after explicit approval.",
    "# Preferences",
    "- Use https://example.com/reference as a style benchmark.",
  ].join("\n");
  const traceArtifacts = buildPlanningArtifacts({ prompt: tracePrompt, options: { agentName: "default" }, contract });
  const traceCoverage = traceArtifacts.requirementContract.requestCoverage;
  const approvalClause = traceCoverage.rawRequestClauses.find((entry) => entry.text === "Push to GitHub only after explicit approval.");
  const benchmarkClause = traceCoverage.rawRequestClauses.find((entry) => entry.text === "Use https://example.com/reference as a style benchmark.");
  const benchmarkUrlClause = traceCoverage.rawRequestClauses.find((entry) => entry.text === "https://example.com/reference");
  assert.ok(
    Array.isArray(traceArtifacts.selection.extracted.approvalBoundaryItems)
      && traceArtifacts.selection.extracted.approvalBoundaryItems.includes("Push to GitHub only after explicit approval."),
    "approval boundary extraction should preserve the raw prompt line instead of only keyword labels"
  );
  assert.ok(
    approvalClause && approvalClause.lane === "unsafe_or_approval",
    "request coverage should seed approval-sensitive clauses directly from the raw prompt"
  );
  assert.ok(
    benchmarkClause && benchmarkClause.kind === "taste_value" && benchmarkClause.lane === "taste",
    "request coverage should preserve prompt-derived benchmark clauses as taste/value items"
  );
  assert.ok(
    approvalClause && traceCoverage.mappedRequirements.some((entry) => entry.clauseId === approvalClause.id && entry.requirementRefs.includes("approvalBoundaryItems")),
    "approval-sensitive clauses should map into approvalBoundaryItems when the raw prompt provides that boundary"
  );
  assert.ok(
    benchmarkUrlClause && traceCoverage.droppedItems.some((entry) => entry.clauseId === benchmarkUrlClause.id && entry.reasonCode === "deferred_nonblocking"),
    "unmapped taste clauses should auto-populate droppedItems"
  );
  const autoDroppedCoverageSanitized = sanitizePlanningArtifactsForRuntime({
    ...traceArtifacts,
    requirementContract: {
      ...traceArtifacts.requirementContract,
      validation: undefined,
      requestCoverage: {
        ...traceCoverage,
        mappedRequirements: traceCoverage.mappedRequirements.filter((entry) => {
          if (approvalClause && entry.clauseId === approvalClause.id) return false;
          if (benchmarkClause && entry.clauseId === benchmarkClause.id) return false;
          return true;
        }),
        droppedItems: traceCoverage.droppedItems.filter((entry) => {
          if (approvalClause && entry.clauseId === approvalClause.id) return false;
          if (benchmarkClause && entry.clauseId === benchmarkClause.id) return false;
          return true;
        }),
      },
    },
  });
  assert.ok(
    approvalClause && autoDroppedCoverageSanitized.requirementContract.requestCoverage.droppedItems.some((entry) => entry.clauseId === approvalClause.id && entry.reasonCode === "unsafe_or_approval"),
    "approval-lane clauses should auto-drop with an unsafe_or_approval reason when they are not mapped"
  );
  assert.ok(
    benchmarkClause && autoDroppedCoverageSanitized.requirementContract.requestCoverage.droppedItems.some((entry) => entry.clauseId === benchmarkClause.id && entry.reasonCode === "deferred_nonblocking"),
    "taste clauses should auto-drop when their mapping disappears from the locked contract"
  );
  const lockedRevisionPrompt = [
    "# Goal",
    "Update only docs/CURRENT_ARCHITECTURE.md wording for the operator plan section.",
    "# Acceptance Criteria",
    "- Change only docs/CURRENT_ARCHITECTURE.md.",
    "- Do not modify runtime behavior.",
  ].join("\n");
  const lockedRevisionArtifacts = buildPlanningArtifacts({
    prompt: lockedRevisionPrompt,
    options: { agentName: "default" },
    contract,
  });
  const downstreamRevisionPrompt = [
    "# Goal",
    "Update server.js and docs/CURRENT_ARCHITECTURE.md so the runtime exposes a new revision gate.",
    "# Acceptance Criteria",
    "- Update server.js runtime behavior.",
    "- Update docs/CURRENT_ARCHITECTURE.md.",
  ].join("\n");
  const downstreamRevisionArtifacts = buildPlanningArtifacts({
    prompt: downstreamRevisionPrompt,
    options: {
      agentName: "default",
      previousPlanningContext: lockedRevisionArtifacts,
    },
    contract,
  });
  assert.strictEqual(
    downstreamRevisionArtifacts.requirementContract.status,
    "BLOCKED",
    "non-intake follow-up revisions should block until intake approves a revision proposal"
  );
  assert.strictEqual(
    downstreamRevisionArtifacts.requirementContract.revisionGate.status,
    "proposal_required",
    "downstream meaning changes should mark the contract with proposal_required"
  );
  assert.ok(
    downstreamRevisionArtifacts.requirementContract.validation.checks.some((entry) => entry.id === "runtime_revision_gate" && entry.status === "BLOCK"),
    "requirement validation should expose the runtime revision gate as a blocking check"
  );
  assert.ok(
    downstreamRevisionArtifacts.requirementContract.activeRevisionProposal
      && Array.isArray(downstreamRevisionArtifacts.requirementContract.activeRevisionProposal.changedFields)
      && downstreamRevisionArtifacts.requirementContract.activeRevisionProposal.changedFields.length >= 1,
    "downstream revision requests should record a structured proposal payload"
  );
  assert.ok(
    downstreamRevisionArtifacts.requirementContract.baselineScope.every((entry) => !entry.includes("server.js")),
    "downstream revision requests must not silently rewrite the authoritative locked contract"
  );
  const intakeRevisionArtifacts = buildPlanningArtifacts({
    prompt: downstreamRevisionPrompt,
    options: {
      agentName: "intake",
      previousPlanningContext: downstreamRevisionArtifacts,
    },
    contract,
  });
  assert.strictEqual(
    intakeRevisionArtifacts.requirementContract.revisionGate.status,
    "accepted_by_intake",
    "intake should be the only role that can confirm a locked requirement revision"
  );
  assert.ok(
    intakeRevisionArtifacts.requirementContract.status === "REVISED" || intakeRevisionArtifacts.requirementContract.status === "LOCKED",
    "intake-approved revisions should reissue a proceedable requirement contract"
  );
  assert.strictEqual(
    intakeRevisionArtifacts.requirementContract.revisionLedger.approvedProposalId,
    downstreamRevisionArtifacts.requirementContract.activeRevisionProposal.proposalId,
    "intake revisions should record which proposal was approved"
  );
  assert.ok(
    intakeRevisionArtifacts.requirementContract.acceptanceChecks.some((entry) => entry && typeof entry.title === "string" && entry.title.includes("server.js")),
    "intake-approved revisions should publish the revised requirement content"
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
    "NORMAL plan should keep backend and infra intelligence in the plan"
  );
  assert.strictEqual(normalArtifacts.dispatchPlan.coordinationMode, "single_writer", "NORMAL multi-role plan should use single-writer coordination");
  assert.strictEqual(normalArtifacts.dispatchPlan.singleWriter, 1, "NORMAL multi-role plan should select a single writer");
  assert.strictEqual(normalArtifacts.dispatchPlan.integrationOwner, "backend_worker", "server/doc task should select backend_worker as integration writer");
  assert.deepStrictEqual(normalArtifacts.dispatchPlan.advisoryAgents, ["infra_worker"], "infra_worker should advise instead of writing in parallel");
  assert.deepStrictEqual(
    normalArtifacts.dispatchPlan.dispatches.map((entry) => entry.participationMode),
    ["writer", "advisory"],
    "NORMAL plan should split writer and advisory participation"
  );
  assert.deepStrictEqual(
    normalArtifacts.dispatchPlan.dispatches.map((entry) => entry.mayWrite),
    [1, 0],
    "only the integration writer dispatch may write"
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

  const boundaryDocsPrompt = [
    "#requirement-locked",
    "# Goal",
    "Perform one state documentation maintenance task.",
    "# Implementation Requirements",
    "Implementation is explicitly requested now. Requirements are fixed, so proceed directly to implementation.",
    "- Use the default parent orchestration path.",
    "- Delegate the implementation edit to infra_worker, then request independent read-only reviewer and tester checks.",
    "- Change only docs/RUNTIME_BOUNDARY_MAP.md.",
    "- Use apply_patch for the file edit.",
    "- Under `## Runtime Truth`, add exactly one brief bullet.",
    "- Insert this exact bullet if it is not already present: - `turnRuntime` remains the authoritative source for pending and active-turn projection; request cache is projection-only.",
    "- Do not duplicate the sentence if it already exists.",
    "- Ignore unrelated edits by others and do not revert them.",
    "# Execution",
    "- Return with exactly: BOUNDARY_TASK_OK docs/RUNTIME_BOUNDARY_MAP.md.",
    "- No follow-up questions are required.",
    "# Acceptance Criteria",
    "- Requested state-boundary change plus reviewer and tester evidence are present.",
  ].join("\n");
  const boundaryDocsArtifacts = buildPlanningArtifacts({
    prompt: boundaryDocsPrompt,
    options: { agentName: "default" },
    contract,
  });
  assert.strictEqual(
    boundaryDocsArtifacts.selection.selectedAssuranceDepth,
    "STANDARD_ASSURANCE",
    "state-boundary documentation maintenance should stay below SIGNOFF_ASSURANCE"
  );
  assert.deepStrictEqual(
    boundaryDocsArtifacts.dispatchPlan.dispatches.map((entry) => entry.ownerAgent),
    ["infra_worker"],
    "state-boundary documentation maintenance should keep implementation ownership on infra_worker only"
  );
  assert.strictEqual(boundaryDocsArtifacts.dispatchPlan.singleWriter, 1, "single-role maintenance should still publish single-writer metadata");
  assert.strictEqual(boundaryDocsArtifacts.dispatchPlan.integrationOwner, "infra_worker", "docs maintenance writer should be infra_worker");
  assert.strictEqual(boundaryDocsArtifacts.dispatchPlan.dispatches[0].participationMode, "writer", "single-role maintenance dispatch should be the writer");
  assert.strictEqual(boundaryDocsArtifacts.dispatchPlan.reviewerRequired, 1, "state-boundary documentation maintenance should still request reviewer evidence");
  assert.strictEqual(boundaryDocsArtifacts.dispatchPlan.testerRequired, 1, "state-boundary documentation maintenance should still request tester evidence");
  assert.strictEqual(boundaryDocsArtifacts.dispatchPlan.signoffRequired, 0, "state-boundary documentation maintenance should avoid signoff-only evidence burden");

  const weakAcceptancePrompt = [
    "# Goal",
    "Refresh only the Requirement Lock card copy so the contract reads clearly.",
    "# Constraints",
    "- Do not change runtime behavior.",
  ].join("\n");
  const weakAcceptanceArtifacts = buildPlanningArtifacts({ prompt: weakAcceptancePrompt, options: { agentName: "default" }, contract });
  assert.ok(
    weakAcceptanceArtifacts.requirementContract.acceptanceChecks.length >= 2,
    "missing acceptance checks should be auto-tightened into inferred acceptance gates when the request is otherwise bounded"
  );
  assert.strictEqual(
    weakAcceptanceArtifacts.requirementContract.status,
    "LOCKED",
    "bounded requests should stay locked instead of blocking on an artificial acceptance question"
  );
  assert.deepStrictEqual(
    weakAcceptanceArtifacts.requirementContract.questionPlan.askNext,
    [],
    "auto-tightened bounded requests should not leave a synthetic acceptance question behind"
  );
  assert.ok(
    weakAcceptanceArtifacts.requirementContract.questionPlan.askNext.every((entry) => /[?？]$/.test(entry.question)),
    "question plan entries should remain real questions instead of raw validator prose"
  );

  const autonomousTighteningPrompt = [
    "# Goal",
    "Update only the Requirement Lock card copy in web/01.HarnesUI/app.js so the wording is clearer for operators.",
    "# Constraints",
    "- Keep the change local to the Requirement Lock surface.",
    "- Do not change runtime behavior.",
  ].join("\n");
  const autonomousTighteningArtifacts = buildPlanningArtifacts({
    prompt: autonomousTighteningPrompt,
    options: { agentName: "default" },
    contract,
  });
  assert.ok(
    autonomousTighteningArtifacts.requirementContract.acceptanceChecks.length >= 2,
    "bounded prompts without explicit acceptance criteria should gain inferred acceptance checks"
  );
  assert.deepStrictEqual(
    autonomousTighteningArtifacts.requirementContract.openQuestions,
    [],
    "bounded prompts with inferred acceptance checks should not keep artificial blocking open questions"
  );
  assert.strictEqual(
    autonomousTighteningArtifacts.requirementContract.status,
    "LOCKED",
    "bounded prompts should lock once autonomous tightening resolves low-risk ambiguity"
  );
  assert.notStrictEqual(
    autonomousTighteningArtifacts.selection.selectedMode,
    "DISCOVERY",
    "bounded prompts should not fall back to DISCOVERY once low-risk ambiguity is auto-tightened"
  );

  const deferredQuestionPrompt = [
    "# Goal",
    "Refresh only the Requirement Lock card copy in the UI.",
    "# Constraints",
    "- Keep the change local to the Requirement Lock surface.",
    "- Do not change runtime behavior.",
    "- What acceptance checks define success?",
  ].join("\n");
  const deferredQuestionArtifacts = buildPlanningArtifacts({
    prompt: deferredQuestionPrompt,
    options: { agentName: "default" },
    contract,
  });
  assert.deepStrictEqual(
    deferredQuestionArtifacts.requirementContract.openQuestions,
    [],
    "defaultable acceptance questions should be deferred instead of blocking the contract"
  );
  assert.ok(
    deferredQuestionArtifacts.requirementContract.questionPlan.defaultable.some((entry) => /What acceptance checks define success\?/i.test(entry.question)),
    "defaultable acceptance questions should remain visible in the deferred question lane"
  );
  assert.strictEqual(
    deferredQuestionArtifacts.requirementContract.status,
    "LOCKED",
    "defaultable acceptance questions should not keep the requirement contract blocked"
  );

  const anchoredTastePrompt = [
    "# Goal",
    "Refresh the landing page UI so it feels closer to https://www.suruga-k.jp/ while keeping the current one-page structure.",
    "- Which visual direction should be emphasized first?",
  ].join("\n");
  const anchoredTasteArtifacts = buildPlanningArtifacts({
    prompt: anchoredTastePrompt,
    options: { agentName: "default", executionSource: "web_ui" },
    contract,
  });
  assert.deepStrictEqual(
    anchoredTasteArtifacts.requirementContract.openQuestions,
    [],
    "anchored design taste questions should not block the core contract"
  );
  assert.ok(
    anchoredTasteArtifacts.requirementContract.questionPlan.taste.some((entry) => /Which visual direction should be emphasized first\?/i.test(entry.question)),
    "anchored design taste questions should stay visible in the taste lane"
  );
  assert.notStrictEqual(
    anchoredTasteArtifacts.selection.selectedMode,
    "DISCOVERY",
    "anchored design follow-ups should stay out of DISCOVERY when the direction is already constrained"
  );

  const autonomousTastePrompt = [
    "# Goal",
    "Redesign the landing page UI so it feels much better.",
  ].join("\n");
  const autonomousTasteArtifacts = buildPlanningArtifacts({
    prompt: autonomousTastePrompt,
    options: {
      agentName: "default",
      executionSource: "web_ui",
      intentProfile: {
        autonomy: {
          interventionPreference: "minimize_user_intervention",
          requirementStrategy: "propose_then_execute",
          clarificationPolicy: "ask_only_for_irreversible_or_user_reserved_decisions",
        },
      },
    },
    contract,
  });
  assert.strictEqual(
    autonomousTasteArtifacts.selection.signals.clarificationAction,
    "proceed",
    "minimal-intervention autonomy should allow bounded design direction inference before asking the user"
  );
  assert.strictEqual(
    autonomousTasteArtifacts.selection.signals.clarificationReason,
    "autonomous_direction_inference_enabled",
    "minimal-intervention autonomy should expose the autonomous direction inference reason"
  );
  assert.notStrictEqual(
    autonomousTasteArtifacts.selection.selectedMode,
    "DISCOVERY",
    "minimal-intervention autonomy should keep preference-driven design work out of DISCOVERY when bounded inference is allowed"
  );
  assert.deepStrictEqual(
    autonomousTasteArtifacts.requirementContract.questionPlan.askNext,
    [],
    "minimal-intervention autonomy should not leave a synthetic clarification question behind for bounded design work"
  );

  const fragmentaryGoalArtifacts = buildPlanningArtifacts({
    prompt: [
      "# Goal",
      "UIに最終表示するときは",
      "# Open Questions",
      "- What acceptance checks define success?",
    ].join("\n"),
    options: { agentName: "default" },
    contract,
  });
  assert.notStrictEqual(
    fragmentaryGoalArtifacts.requirementContract.lockedGoal,
    "UI縺ｫ譛邨り｡ｨ遉ｺ縺吶ｋ縺ｨ縺阪・",
    "fragmentary subordinate clauses should not be promoted literally into locked goals"
  );
  assert.ok(
    !/縺ｨ縺阪・$/.test(fragmentaryGoalArtifacts.requirementContract.lockedGoal),
    "fragmentary subordinate clauses should be replaced by a safer synthesized goal if the contract can still lock"
  );

  const approvalBoundaryPrompt = [
    "# Goal",
    "Update only the Requirement Lock summary copy in the UI.",
    "# Constraints",
    "- User approval required before removing the legacy summary card.",
  ].join("\n");
  const approvalBoundaryArtifacts = buildPlanningArtifacts({ prompt: approvalBoundaryPrompt, options: { agentName: "default" }, contract });
  assert.ok(
    approvalBoundaryArtifacts.requirementContract.questionPlan.askNext.some((entry) => /approval/i.test(entry.question)),
    "approval-boundary findings should produce a blocking approval question"
  );
  assert.ok(
    !approvalBoundaryArtifacts.requirementContract.userValueFrame.hardConstraints.some((entry) => /Explicit user approval is required before/i.test(entry)),
    "approval-boundary metadata should not be rewritten into fabricated hard-constraint approval text"
  );
  const approvalBoundarySanitized = sanitizePlanningArtifactsForRuntime({
    ...approvalBoundaryArtifacts,
    requirementContract: {
      ...approvalBoundaryArtifacts.requirementContract,
      approvalBoundaryItems: ["remove the legacy summary card"],
      displayContract: {
        ...approvalBoundaryArtifacts.requirementContract.displayContract,
        boundaries: [],
      },
    },
  });
  assert.ok(
    approvalBoundarySanitized.requirementContract.displayContract.boundaries.some((entry) => /Approval required before: remove the legacy summary card/i.test(entry)),
    "display contract boundaries should surface approval-boundary items"
  );

  const japaneseFrontendPrompt = [
    "# Goal",
    "\u30d5\u30a9\u30f3\u30c8\u3084\u30ec\u30a4\u30a2\u30a6\u30c8\u3092 https://www.suruga-k.jp/ \u3092\u53c2\u8003\u306b\u5237\u65b0\u3057\u3066\u4e0b\u3055\u3044\u3002",
    "\u30da\u30fc\u30b8\u6570\u3082\u4eca\u306f1\u30da\u30fc\u30b8\u3057\u304b\u306a\u3044\u3002\u3068\u308a\u3042\u3048\u305a3\u30da\u30fc\u30b8\u306b\u3057\u3066\u4e0b\u3055\u3044\u3002",
  ].join("\n");
  const japaneseFrontendArtifacts = buildPlanningArtifacts({ prompt: japaneseFrontendPrompt, options: { agentName: "default" }, contract });
  assert.strictEqual(japaneseFrontendArtifacts.selection.selectedMode, "NORMAL", "Japanese frontend redesign should stay in NORMAL mode");
  assert.strictEqual(japaneseFrontendArtifacts.selection.selectedPlanningDepth, "STANDARD_PLANNING", "Japanese frontend redesign should keep standard planning");
  assert.strictEqual(japaneseFrontendArtifacts.selection.selectedAssuranceDepth, "STANDARD_ASSURANCE", "benchmarked frontend redesign should not stay light assurance");
  assert.deepStrictEqual(
    japaneseFrontendArtifacts.dispatchPlan.dispatches.map((entry) => entry.ownerAgent),
    ["frontend_worker"],
    "Japanese frontend redesign should route to frontend_worker"
  );
  assert.strictEqual(japaneseFrontendArtifacts.dispatchPlan.reviewerRequired, 1, "benchmarked frontend redesign should require reviewer evidence");
  assert.strictEqual(japaneseFrontendArtifacts.dispatchPlan.testerRequired, 0, "standard benchmarked frontend redesign should not force tester evidence");
  assert.ok(
    japaneseFrontendArtifacts.requirementContract.userValueFrame.benchmarkCandidates.includes("https://www.suruga-k.jp/"),
    "benchmark URL should persist into the requirement contract"
  );

  const strictRecreationPrompt = [
    "# Goal",
    "https://www.suruga-k.jp/ を参考に TOP をほぼ同じに完全再現してください。丸パクリでも構いません。",
  ].join("\n");
  const strictRecreationArtifacts = buildPlanningArtifacts({
    prompt: strictRecreationPrompt,
    options: { agentName: "default", executionSource: "web_ui" },
    contract,
  });
  assert.strictEqual(strictRecreationArtifacts.selection.selectedAssuranceDepth, "SIGNOFF_ASSURANCE", "strict benchmark recreation should force signoff assurance");
  assert.strictEqual(strictRecreationArtifacts.dispatchPlan.reviewerRequired, 1, "strict benchmark recreation should require reviewer evidence");
  assert.strictEqual(strictRecreationArtifacts.dispatchPlan.testerRequired, 1, "strict benchmark recreation should require tester evidence");

  const stitchRecreationPrompt = [
    "以下に従ってWEB UIを刷新してください。",
    "以下を完全再現してください。",
    "",
    "## Stitch Instructions",
    "Get the images and code for the following Stitch project's screens:",
    "",
    "## Project",
    "Title: Home - SURUGA-K",
    "ID: 10142073172180669410",
    "",
    "## Screens:",
    "1. TOP - 三重非破壊検査（画像サンプル反映版）",
    "   ID: 6be8048471f94faaad7a7d18601c6d2f",
    "",
    "Use a utility like `curl -L` to download the hosted URLs.",
  ].join("\n");
  const stitchRecreationArtifacts = buildPlanningArtifacts({
    prompt: stitchRecreationPrompt,
    options: { agentName: "default", executionSource: "web_ui" },
    contract,
  });
  assert.strictEqual(
    stitchRecreationArtifacts.requirementContract.lockedGoal,
    "Stitch の「Home - SURUGA-K」内の「TOP - 三重非破壊検査（画像サンプル反映版）」画面の画像とコードを取得し、WEB UI に忠実再現する",
    "Stitch structured prompts should lock onto the actual replay objective instead of a generic UI refresh headline"
  );
  assert.ok(
    stitchRecreationArtifacts.requirementContract.baselineScope.some((entry) => /Stitch project: Home - SURUGA-K \/ ID 10142073172180669410/.test(entry)),
    "Stitch structured prompts should keep the project identity in baseline scope"
  );
  assert.ok(
    stitchRecreationArtifacts.requirementContract.baselineScope.some((entry) => /Stitch screen: TOP - 三重非破壊検査（画像サンプル反映版） \/ ID 6be8048471f94faaad7a7d18601c6d2f/.test(entry)),
    "Stitch structured prompts should keep the screen identity in baseline scope"
  );
  assert.ok(
    /画像とコードを取得/.test(stitchRecreationArtifacts.requirementContract.displayContract.nextAction),
    "Stitch structured prompts should direct the agent to fetch the screen assets first"
  );
  assert.ok(
    stitchRecreationArtifacts.requirementContract.displayContract.boundaries.includes("指定された Stitch screen を基準にする"),
    "Stitch structured prompts should surface the replay boundary"
  );
  assert.strictEqual(
    stitchRecreationArtifacts.requirementContract.displayContract.holdReason,
    "",
    "locked Stitch replay prompts should not leak generic hold-risk prose into the UI contract"
  );
  assert.strictEqual(
    stitchRecreationArtifacts.requirementContract.status,
    "LOCKED",
    "fully specified Stitch replay prompts should not remain blocked"
  );

  const followUpArtifacts = buildPlanningArtifacts({
    prompt: "全然違うので、ほぼ同じに寄せて修正してください。",
    options: {
      agentName: "default",
      executionSource: "web_ui",
      previousPlanningContext: japaneseFrontendArtifacts,
    },
    contract,
  });
  assert.strictEqual(followUpArtifacts.selection.taskFamily, "web_creative", "design follow-up should keep the web_creative family");
  assert.strictEqual(followUpArtifacts.selection.selectedAssuranceDepth, "SIGNOFF_ASSURANCE", "follow-up strict recreation request should keep signoff assurance");
  assert.ok(
    followUpArtifacts.requirementContract.userValueFrame.benchmarkCandidates.includes("https://www.suruga-k.jp/"),
    "follow-up prompt should inherit the locked benchmark URL"
  );
  assert.strictEqual(
    followUpArtifacts.requirementContract.status,
    "BLOCKED",
    "non-intake follow-up changes should stop at the revision gate instead of silently rewriting the locked contract"
  );
  assert.strictEqual(
    followUpArtifacts.requirementContract.revisionGate.status,
    "proposal_required",
    "non-intake follow-up changes should require an intake-owned revision proposal"
  );
  assert.ok(
    Array.isArray(followUpArtifacts.requirementContract.activeRevisionProposal.changedFields)
      && followUpArtifacts.requirementContract.activeRevisionProposal.changedFields.length >= 1,
    "follow-up prompt should record changed requirement fields in the revision proposal payload"
  );

  const tempWorkspace = fs.mkdtempSync(path.join(os.tmpdir(), "planning-owned-paths-"));
  fs.mkdirSync(path.join(tempWorkspace, "resources", "views"), { recursive: true });
  fs.mkdirSync(path.join(tempWorkspace, "resources", "css"), { recursive: true });
  fs.mkdirSync(path.join(tempWorkspace, "resources", "js"), { recursive: true });
  fs.mkdirSync(path.join(tempWorkspace, "routes"), { recursive: true });
  fs.writeFileSync(path.join(tempWorkspace, "routes", "web.php"), "<?php\n", "utf8");
  const laravelFrontendArtifacts = buildPlanningArtifacts({
    prompt: japaneseFrontendPrompt,
    options: { agentName: "default", executionSource: "web_ui", cwd: tempWorkspace },
    contract,
  });
  assert.ok(
    laravelFrontendArtifacts.dispatchPlan.dispatches[0].ownedPaths.includes("resources/views/"),
    "frontend owned paths should reflect Laravel resources/views"
  );
  assert.ok(
    !laravelFrontendArtifacts.dispatchPlan.dispatches[0].ownedPaths.includes("web/"),
    "frontend owned paths should not fall back to generic web/ when repo-specific paths exist"
  );

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
  assert.strictEqual(webCreativeArtifacts.requirementContract.status, "BLOCKED", "clarification-first web request should keep the requirement contract blocked");
  assert.strictEqual(webCreativeArtifacts.requirementContract.validation.verdict, "BLOCK", "clarification-first web request should surface blocking requirement validation");

  const anchoredWebCreativePrompt = [
    "# Goal",
    "Refresh the operator UI to feel closer to https://www.suruga-k.jp/ while keeping the current information model.",
    "# Implementation Requirements",
    "- Update only web/01.HarnesUI/app.js and web/01.HarnesUI/styles.css.",
    "- Keep the current routes and data bindings.",
    "# Constraints",
    "- Keep the layout responsive on desktop and mobile.",
  ].join("\n");
  const anchoredWebCreativeArtifacts = buildPlanningArtifacts({
    prompt: anchoredWebCreativePrompt,
    options: { agentName: "default", executionSource: "web_ui" },
    contract,
  });
  assert.strictEqual(anchoredWebCreativeArtifacts.selection.taskFamily, "web_creative", "anchored UI refresh should stay in web_creative");
  assert.notStrictEqual(anchoredWebCreativeArtifacts.selection.selectedMode, "DISCOVERY", "anchored UI refresh should not remain in discovery");
  assert.ok(
    anchoredWebCreativeArtifacts.requirementContract.acceptanceChecks.some((entry) => entry && entry.title.includes("No text may overflow")),
    "anchored UI refresh should auto-infer a no-overflow acceptance check"
  );
  assert.ok(
    anchoredWebCreativeArtifacts.requirementContract.acceptanceChecks.some((entry) => entry && entry.title.includes("Worst-state screenshots")),
    "anchored UI refresh should auto-infer a worst-state screenshot acceptance check"
  );
  assert.ok(
    anchoredWebCreativeArtifacts.requirementContract.acceptanceChecks.some((entry) => entry && entry.title.includes("Copy must fit")),
    "anchored UI refresh should auto-infer a copy-fit acceptance check"
  );
  assert.ok(
    anchoredWebCreativeArtifacts.dispatchPlan.expectedEvidence.includes("layout_integrity_review"),
    "anchored UI refresh should require layout-integrity evidence in the dispatch plan"
  );
  assert.ok(
    anchoredWebCreativeArtifacts.dispatchPlan.expectedEvidence.includes("worst_state_capture"),
    "anchored UI refresh should require worst-state capture evidence in the dispatch plan"
  );
  assert.ok(
    anchoredWebCreativeArtifacts.dispatchPlan.expectedEvidence.includes("copy_fit_review"),
    "anchored UI refresh should require copy-fit evidence in the dispatch plan"
  );
  const anchoredFrontendDispatch = anchoredWebCreativeArtifacts.dispatchPlan.dispatches.find((entry) => entry.ownerAgent === "frontend_worker");
  assert.ok(anchoredFrontendDispatch, "anchored UI refresh should route work to frontend_worker");
  assert.ok(
    anchoredFrontendDispatch.expectedEvidence.includes("layout_integrity_review"),
    "frontend dispatch should carry layout-integrity evidence requirements"
  );
  assert.ok(
    anchoredFrontendDispatch.expectedEvidence.includes("worst_state_capture"),
    "frontend dispatch should carry worst-state capture requirements"
  );
  assert.ok(
    anchoredFrontendDispatch.expectedEvidence.includes("copy_fit_review"),
    "frontend dispatch should carry copy-fit evidence requirements"
  );

  const planningDesignPrompt = [
    "# Goal",
    "Plan a redesign brief for the operator dashboard so labels and overlays never spill out of their regions.",
    "# Implementation Requirements",
    "- Keep the brief benchmarked against https://www.suruga-k.jp/.",
    "- Stay within the current information architecture.",
  ].join("\n");
  const planningDesignArtifacts = buildPlanningArtifacts({
    prompt: planningDesignPrompt,
    options: { agentName: "default" },
    contract,
  });
  assert.strictEqual(planningDesignArtifacts.selection.taskFamily, "planning_design", "design brief planning should stay in planning_design");
  assert.ok(
    planningDesignArtifacts.requirementContract.acceptanceChecks.some((entry) => entry && entry.title.includes("No text may overflow")),
    "planning_design should inherit the no-overflow acceptance check"
  );
  assert.ok(
    planningDesignArtifacts.requirementContract.acceptanceChecks.some((entry) => entry && entry.title.includes("Copy must fit")),
    "planning_design should inherit the copy-fit acceptance check"
  );
  assert.ok(
    planningDesignArtifacts.requirementContract.acceptanceChecks.some((entry) => entry && entry.title.includes("Worst-state screenshots")),
    "planning_design should inherit the worst-state screenshot acceptance check"
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
  assert.strictEqual(
    questionArtifacts.requirementContract.intentInterpretation.presentation,
    "progress_hypothesis",
    "question-only prompt should persist an interpreted progress-hypothesis presentation"
  );
  assert.strictEqual(
    questionArtifacts.requirementContract.intentInterpretation.direction,
    "ワークスペースの意味とここに何も記載しなかった場合の挙動を説明する",
    "question-only prompt should persist the interpreted direction in the requirement contract"
  );
  assert.deepStrictEqual(
    questionArtifacts.requirementContract.openQuestions,
    [],
    "question-only prompt should not surface the user's question as an unresolved blocker"
  );

  const literalVsInterpretationPrompt = "これなんで要件をそのまま受け取っているの？解釈ができていないように見えるだけでしょうか？";
  const literalVsInterpretationArtifacts = buildPlanningArtifacts({
    prompt: literalVsInterpretationPrompt,
    options: { agentName: "default" },
    contract,
  });
  assert.strictEqual(
    literalVsInterpretationArtifacts.requirementContract.intentInterpretation.presentation,
    "progress_hypothesis",
    "meta prompts about literal requirement intake should persist an interpreted progress-hypothesis"
  );
  assert.strictEqual(
    literalVsInterpretationArtifacts.requirementContract.intentInterpretation.direction,
    "要件ロックが原文の反復に見える理由を、見え方と実際の挙動を切り分け、どこまで解釈できていてどこが原文寄りかを整理して説明する",
    "meta prompts should persist an interpreted direction instead of a generic literal restatement"
  );
  assert.strictEqual(
    literalVsInterpretationArtifacts.requirementContract.intentInterpretation.hypothesis,
    "見え方だけの問題か、実際に意図解釈が弱いのかを切り分けて確かめたい",
    "meta prompts should persist an interpreted user-intent hypothesis"
  );

  const greetingOnlyArtifacts = buildPlanningArtifacts({
    prompt: "ありがとうございます。",
    options: { agentName: "default" },
    contract,
  });
  assert.strictEqual(
    greetingOnlyArtifacts.requirementContract.explicitGoal,
    "",
    "greeting-only input should not lock a courtesy phrase as the explicit goal"
  );

  const unstructuredJapaneseBrief = [
    "ありがとうございます。",
    "でも思っていたサイトと全然違います。",
    "参考サイト８：独自性２で再構築してください。",
    "以下の要件でＷＥＢサイトを開発してください。",
    "C:\\Users\\akima\\dev\\Test Recruitment Page 配下で作業を実施すること",
    "ページ数は3ページとすること。そのうち１ページは問合せページとすること。",
    "製作目的は新入社員採用時に会社説明会用をメインに。このサイトを見て興味を持ってもらえるTOPにすること。",
    "画像はすべて空欄に。",
    "フォントも参考サイトと合わせること。",
    "会社名：有限会社三重非破壊検査",
    "参考サイト：https://www.suruga-k.jp/",
  ].join("\n");
  const unstructuredJapaneseArtifacts = buildPlanningArtifacts({
    prompt: unstructuredJapaneseBrief,
    options: { agentName: "default", executionSource: "web_ui" },
    contract,
  });
  assert.ok(
    unstructuredJapaneseArtifacts.requirementContract.explicitGoal.includes("新入社員採用時に会社説明会用"),
    "unstructured Japanese brief should lock the actual product goal instead of the greeting or complaint preface"
  );
  assert.ok(
    unstructuredJapaneseArtifacts.requirementContract.baselineScope.includes("ページ数は3ページとすること。そのうち１ページは問合せページとすること。"),
    "unstructured Japanese brief should infer page-count requirements into the baseline scope"
  );
  assert.ok(
    unstructuredJapaneseArtifacts.requirementContract.baselineScope.includes("画像はすべて空欄に。"),
    "unstructured Japanese brief should infer concrete content constraints into the baseline scope"
  );
  assert.ok(
    unstructuredJapaneseArtifacts.requirementContract.baselineScope.some((entry) => entry.includes("有限会社三重非破壊検査")),
    "unstructured Japanese brief should keep concrete company metadata in the baseline scope"
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
  assert.strictEqual(discoveryArtifacts.requirementContract.schema, "requirement-contract.v5", "requirement contract should match the v5 schema");
  assert.strictEqual(discoveryArtifacts.dispatchPlan.schema, "dispatch-plan.v2", "dispatch plan should match the v2 schema");
  assert.ok(
    discoveryArtifacts.requirementContract.questionPlan.defaultable.some((entry) => entry.question === "What acceptance checks define success?"),
    "DISCOVERY should keep the inferred acceptance-check question visible in the deferred lane"
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
  assert.strictEqual(discoveryArtifacts.requirementContract.status, "BLOCKED", "DISCOVERY contract should remain blocked until clarification is resolved");
  assert.strictEqual(discoveryArtifacts.requirementContract.validation.verdict, "BLOCK", "DISCOVERY contract should surface blocking validation");
  assert.strictEqual(discoveryArtifacts.requirementContract.lockedGoal, "", "DISCOVERY contract should not lock the goal before the contract is ready");
  assert.ok(
    Array.isArray(discoveryArtifacts.requirementContract.intentHypotheses)
      && discoveryArtifacts.requirementContract.intentHypotheses.length >= 1,
    "DISCOVERY contract should retain goal hypotheses instead of only a locked goal"
  );
  assert.ok(
    discoveryArtifacts.requirementContract.questionPlan
      && Array.isArray(discoveryArtifacts.requirementContract.questionPlan.askNext)
      && discoveryArtifacts.requirementContract.questionPlan.askNext.length >= 1,
    "DISCOVERY contract should prioritize a small next-question plan"
  );
  assert.ok(
    discoveryArtifacts.requirementContract.challengeReport
      && Array.isArray(discoveryArtifacts.requirementContract.challengeReport.findings)
      && discoveryArtifacts.requirementContract.challengeReport.findings.length >= 1,
    "DISCOVERY contract should carry challenger-style findings"
  );
  assert.strictEqual(
    discoveryArtifacts.requirementContract.displayContract.goalMode,
    "hypothesis",
    "DISCOVERY contract should expose a hypothesis-mode display contract"
  );
  assert.ok(
    Array.isArray(discoveryArtifacts.requirementContract.provenance.nonGoals)
      && discoveryArtifacts.requirementContract.provenance.nonGoals.some((entry) => entry.source === "policy_default"),
    "inferred discovery non-goals should be tagged as policy defaults"
  );

  const governedClarifyPrompt = "Resolve an ambiguous request using the governed clarify strategy without inventing missing requirements.";
  const governedClarifyArtifacts = buildPlanningArtifacts({
    prompt: governedClarifyPrompt,
    options: { agentName: "default" },
    contract,
  });
  assert.strictEqual(
    governedClarifyArtifacts.selection.taskFamily,
    "planning_design",
    "governed clarify requests should stay in the planning_design family"
  );
  assert.strictEqual(
    governedClarifyArtifacts.selection.familyProfile.ambiguityHandling,
    "surface_decisions",
    "governed clarify requests should keep the surface_decisions ambiguity strategy"
  );
  assert.strictEqual(governedClarifyArtifacts.selection.signals.explicitUserDecisionRequired, 0, "mentioning a clarify strategy must not be misread as an explicit user-decision boundary");
  assert.strictEqual(governedClarifyArtifacts.selection.selectedMode, "DISCOVERY", "governed clarify requests should stay in discovery until the missing anchor is clarified");
  assert.strictEqual(governedClarifyArtifacts.selection.signals.clarificationAction, "ask_user_once", "governed clarify requests should stop at a single clarification question");
  assert.strictEqual(
    governedClarifyArtifacts.selection.signals.clarificationReason,
    "governed_clarify_requires_anchor",
    "governed clarify requests should expose the governed anchor-missing reason"
  );
  assert.ok(
    governedClarifyArtifacts.selection.signals.clarificationQuestion.includes("Which requirement should be locked first"),
    "governed clarify requests should ask for the first requirement anchor"
  );
  assert.deepStrictEqual(
    governedClarifyArtifacts.selection.signals.clarificationMissingAnchors,
    ["first_requirement_anchor"],
    "governed clarify requests should identify the missing first requirement anchor"
  );
  assert.deepStrictEqual(
    governedClarifyArtifacts.requirementContract.acceptanceChecks,
    [],
    "governed clarify requests should not invent acceptance checks before the clarification answer exists"
  );
  assert.strictEqual(governedClarifyArtifacts.requirementContract.questionPlan.askNext.length, 1, "governed clarify requests should keep exactly one next question");
  assert.strictEqual(
    governedClarifyArtifacts.requirementContract.questionPlan.askNext[0].question,
    governedClarifyArtifacts.selection.signals.clarificationQuestion,
    "governed clarify requests should surface the same single question in the requirement contract"
  );
  assert.strictEqual(governedClarifyArtifacts.requirementContract.status, "BLOCKED", "governed clarify requests should keep the requirement contract blocked");
  assert.strictEqual(governedClarifyArtifacts.requirementContract.validation.verdict, "BLOCK", "governed clarify requests should keep requirement validation blocked");

  const governedClarifyExactPrompt = "Resolve an ambiguous request using governed clarify strategy without inventing requirements.";
  const governedClarifyExactArtifacts = buildPlanningArtifacts({
    prompt: governedClarifyExactPrompt,
    options: { agentName: "default" },
    contract,
  });
  assert.strictEqual(
    governedClarifyExactArtifacts.selection.signals.clarificationAction,
    "ask_user_once",
    "exact governed clarify phrasing should still stop at one clarification question"
  );
  assert.strictEqual(
    governedClarifyExactArtifacts.selection.signals.clarificationReason,
    "governed_clarify_requires_anchor",
    "exact governed clarify phrasing should keep the governed anchor-missing reason"
  );
  assert.deepStrictEqual(
    governedClarifyExactArtifacts.selection.signals.clarificationMissingAnchors,
    ["first_requirement_anchor"],
    "exact governed clarify phrasing should keep the same missing-anchor contract"
  );
  assert.deepStrictEqual(
    governedClarifyExactArtifacts.requirementContract.acceptanceChecks,
    [],
    "exact governed clarify phrasing should not invent acceptance checks"
  );

  const governedDisambiguatePrompt = "Resolve an ambiguous request using the governed disambiguate strategy without inventing missing requirements.";
  const governedDisambiguateArtifacts = buildPlanningArtifacts({
    prompt: governedDisambiguatePrompt,
    options: { agentName: "default" },
    contract,
  });
  assert.strictEqual(
    governedDisambiguateArtifacts.selection.taskFamily,
    "planning_design",
    "governed disambiguate requests should stay in the planning_design family"
  );
  assert.strictEqual(
    governedDisambiguateArtifacts.selection.signals.clarificationAction,
    "ask_user_once",
    "governed disambiguate requests should stop at a single clarification question"
  );
  assert.strictEqual(
    governedDisambiguateArtifacts.selection.signals.clarificationReason,
    "governed_clarify_requires_anchor",
    "governed disambiguate requests should reuse the governed anchor-missing reason"
  );
  assert.deepStrictEqual(
    governedDisambiguateArtifacts.selection.signals.clarificationMissingAnchors,
    ["first_requirement_anchor"],
    "governed disambiguate requests should identify the first requirement anchor as missing"
  );
  assert.deepStrictEqual(
    governedDisambiguateArtifacts.requirementContract.acceptanceChecks,
    [],
    "governed disambiguate requests should not invent acceptance checks before the anchor exists"
  );
  assert.strictEqual(
    governedDisambiguateArtifacts.requirementContract.status,
    "BLOCKED",
    "governed disambiguate requests should keep the requirement contract blocked"
  );
  assert.strictEqual(
    governedDisambiguateArtifacts.requirementContract.validation.verdict,
    "BLOCK",
    "governed disambiguate requests should keep requirement validation blocked"
  );

  const governedDeferPrompt = "Resolve an ambiguous request using the governed defer strategy without inventing missing requirements.";
  const governedDeferArtifacts = buildPlanningArtifacts({
    prompt: governedDeferPrompt,
    options: { agentName: "default" },
    contract,
  });
  assert.strictEqual(
    governedDeferArtifacts.selection.taskFamily,
    "planning_design",
    "governed defer requests should stay in the planning_design family"
  );
  assert.strictEqual(
    governedDeferArtifacts.selection.familyProfile.ambiguityHandling,
    "surface_decisions",
    "governed defer requests should keep the surface_decisions ambiguity strategy"
  );
  assert.strictEqual(governedDeferArtifacts.selection.signals.explicitUserDecisionRequired, 0, "mentioning a defer strategy must not be misread as an explicit user-decision boundary");
  assert.strictEqual(governedDeferArtifacts.selection.selectedMode, "DISCOVERY", "governed defer requests should stay in discovery until the missing anchor is clarified");
  assert.strictEqual(governedDeferArtifacts.selection.signals.clarificationAction, "ask_user_once", "governed defer requests should stop at a single clarification question");
  assert.ok(
    governedDeferArtifacts.selection.signals.clarificationQuestion.includes("Which requirement should be locked first"),
    "governed defer requests should ask for the first requirement anchor"
  );
  assert.deepStrictEqual(
    governedDeferArtifacts.requirementContract.acceptanceChecks,
    [],
    "governed defer requests should not invent acceptance checks before the clarification answer exists"
  );
  assert.strictEqual(governedDeferArtifacts.requirementContract.questionPlan.askNext.length, 1, "governed defer requests should keep exactly one next question");
  assert.strictEqual(
    governedDeferArtifacts.requirementContract.questionPlan.askNext[0].question,
    governedDeferArtifacts.selection.signals.clarificationQuestion,
    "governed defer requests should surface the same single question in the requirement contract"
  );
  assert.strictEqual(governedDeferArtifacts.requirementContract.status, "BLOCKED", "governed defer requests should keep the requirement contract blocked");
  assert.strictEqual(governedDeferArtifacts.requirementContract.validation.verdict, "BLOCK", "governed defer requests should keep requirement validation blocked");

  const governedDeferExactPrompt = "Resolve an ambiguous request using governed defer strategy without inventing requirements.";
  const governedDeferExactArtifacts = buildPlanningArtifacts({
    prompt: governedDeferExactPrompt,
    options: { agentName: "default" },
    contract,
  });
  assert.strictEqual(
    governedDeferExactArtifacts.selection.signals.clarificationAction,
    "ask_user_once",
    "exact governed defer phrasing should still stop at one clarification question"
  );
  assert.strictEqual(
    governedDeferExactArtifacts.selection.signals.clarificationReason,
    "governed_clarify_requires_anchor",
    "exact governed defer phrasing should keep the governed anchor-missing reason"
  );
  assert.deepStrictEqual(
    governedDeferExactArtifacts.selection.signals.clarificationMissingAnchors,
    ["first_requirement_anchor"],
    "exact governed defer phrasing should keep the same missing-anchor contract"
  );
  assert.deepStrictEqual(
    governedDeferExactArtifacts.requirementContract.acceptanceChecks,
    [],
    "exact governed defer phrasing should not invent acceptance checks"
  );

  const boundedAssumptionPrompt = "Resolve an ambiguous request using governed bounded_assumption strategy without inventing requirements.";
  const boundedAssumptionArtifacts = buildPlanningArtifacts({
    prompt: boundedAssumptionPrompt,
    options: { agentName: "default" },
    contract,
  });
  assert.strictEqual(
    boundedAssumptionArtifacts.selection.taskFamily,
    "planning_design",
    "bounded_assumption requests should stay in the planning_design family"
  );
  assert.strictEqual(
    boundedAssumptionArtifacts.selection.familyProfile.ambiguityHandling,
    "bounded_assumption",
    "bounded_assumption requests should honor the explicitly requested ambiguity strategy"
  );
  assert.strictEqual(
    boundedAssumptionArtifacts.selection.signals.explicitUserDecisionRequired,
    0,
    "bounded_assumption directives must not be misread as an explicit user-decision boundary"
  );
  assert.strictEqual(
    boundedAssumptionArtifacts.selection.selectedMode,
    "NORMAL",
    "bounded_assumption directives without blocking gaps should remain execution-ready"
  );
  assert.strictEqual(
    boundedAssumptionArtifacts.selection.signals.clarificationAction,
    "proceed",
    "bounded_assumption directives should not stop with a synthetic needs-input clarification"
  );
  assert.deepStrictEqual(
    boundedAssumptionArtifacts.requirementContract.questionPlan.askNext,
    [],
    "bounded_assumption directives should not echo the directive itself as a follow-up question"
  );
  assert.strictEqual(
    boundedAssumptionArtifacts.requirementContract.status,
    "LOCKED",
    "bounded_assumption directives should lock once the policy can interpret them without inventing requirements"
  );
  assert.strictEqual(
    boundedAssumptionArtifacts.requirementContract.validation.verdict,
    "PASS",
    "bounded_assumption directives should pass requirement validation after the false ambiguity signals are removed"
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
  assert.strictEqual(
    sanitized.requirementContract.intentInterpretation.presentation,
    "goal",
    "sanitized artifacts should preserve requirement intent interpretation"
  );
  assert.strictEqual(sanitized.requirementContract.status, "BLOCKED", "sanitized artifacts should preserve requirement status");
  assert.strictEqual(sanitized.requirementContract.validation.verdict, "BLOCK", "sanitized artifacts should preserve requirement validation verdict");
  assert.ok(Array.isArray(sanitized.requirementContract.intentHypotheses), "sanitized artifacts should preserve intent hypotheses");
  assert.ok(sanitized.requirementContract.displayContract && typeof sanitized.requirementContract.displayContract === "object", "sanitized artifacts should preserve the display contract");
  assert.ok(
    sanitized.requirementContract.requestCoverage
      && typeof sanitized.requirementContract.requestCoverage.coverageSummary === "object",
    "sanitized artifacts should preserve request coverage"
  );
}

try {
  run();
  console.log("PASS planning_mode_policy_test");
} catch (error) {
  console.error(`FAIL planning_mode_policy_test: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}
