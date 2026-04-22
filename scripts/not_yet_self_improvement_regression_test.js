#!/usr/bin/env node
"use strict";

const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const {
  buildCompatibilityCompletionStatus,
  buildSubjectiveGoalCompletionStatus,
  computeCarriedForwardTrailingPasses,
  exportGovernedMemoryPublicArtifacts,
  selectPreferredHistorySnapshot,
  syncGovernedMemoryGraph,
} = require("./lib/governed_memory_graph");
const {
  resolveExportSessionId,
} = require("./lib/export_session_window");
const {
  refreshGovernedLiveAgiBundle,
} = require("./lib/governed_live_agi_bundle");
const {
  createGovernedMemoryPublicFixtureRuntime,
  createGovernedMemoryPublicFixtureTraceability,
  seedGovernedMemoryPublicAgiReadinessArtifacts,
  seedGovernedMemoryPublicCompatibilityArtifacts,
  seedGovernedMemoryPublicContinuityArtifacts,
} = require("./lib/governed_memory_public_fixture");

const repoRoot = path.resolve(__dirname, "..");

function copyJson(relativePath, targetRoot) {
  const sourcePath = path.join(repoRoot, relativePath);
  const targetPath = path.join(targetRoot, relativePath);
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  fs.copyFileSync(sourcePath, targetPath);
}

function copyText(relativePath, targetRoot) {
  const sourcePath = path.join(repoRoot, relativePath);
  const targetPath = path.join(targetRoot, relativePath);
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  fs.copyFileSync(sourcePath, targetPath);
}

function writeJson(targetPath, value) {
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  fs.writeFileSync(targetPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function main() {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "not-yet-self-improvement-"));
  [
    path.join("scripts", "config", "agi_readiness_live_policy.json"),
    path.join("scripts", "config", "anthropic_engineering_learning_policy.json"),
    path.join("scripts", "config", "governed_observation_policy.json"),
    path.join("scripts", "config", "memory_spec_graph_catalog.json"),
    path.join("scripts", "config", "memory_retrieval_policy.json"),
    path.join("scripts", "config", "memory_type_catalog.json"),
    path.join("scripts", "config", "memory_eval_suite.json"),
    path.join("scripts", "config", "memory_public_export_policy.json"),
    path.join("scripts", "config", "openai_blog_learning_policy.json"),
    path.join("scripts", "config", "self_improvement_promotion_policy.json"),
    path.join("scripts", "config", "governed_remediation_policy.json"),
    path.join("scripts", "config", "robustness_remediation_policy.json"),
    path.join("scripts", "config", "continuity_closeout_policy.json"),
    path.join("scripts", "config", "improvement_lineage_policy.json"),
    path.join("scripts", "config", "public_hygiene_policy.json"),
  ].forEach((relativePath) => copyJson(relativePath, tempRoot));
  [
    "README.md",
    "HARNESS_MAP.md",
    path.join("docs", "CURRENT_ARCHITECTURE.md"),
    path.join("docs", "AGI_OPERATIONAL_COMPLETION.md"),
    path.join("docs", "GOVERNED_AUTONOMOUS_LEARNING_LOOP.md"),
  ].forEach((relativePath) => copyText(relativePath, tempRoot));

  seedGovernedMemoryPublicCompatibilityArtifacts(tempRoot);
  seedGovernedMemoryPublicContinuityArtifacts(tempRoot);
  seedGovernedMemoryPublicAgiReadinessArtifacts(tempRoot);
  writeJson(
    path.join(
      tempRoot,
      "logs",
      "archive",
      "raw",
      "runtime_state",
      "memory",
      "projections",
      "readiness",
      "subjective_goal_completion_history.json"
    ),
    {
      schema: "agi-subjective-goal-completion-history.v1",
      generatedAt: "2026-04-04T09:59:00.000Z",
      workspaceId: "fixture-workspace",
      source: "projection_runtime",
      consecutivePassingExports: 1,
      entries: [
        {
          exportSessionId: "export_history_floor_001",
          generatedAt: "2026-04-04T09:59:00.000Z",
          baseStatus: "criteria_met",
          subjectiveGoalStatus: "SUBJECTIVE_AGI_NEAR_COMPLETE",
          ambiguousInstructionEvidenceCount: 24,
          rawFinalScore: 0.989,
          R_robust: 0.991,
          H_horizon: 0.992,
          catastrophicRiskCvar: 0.005,
          distinctImprovementCount: 4,
          distinctRegressionCount: 0,
          verifiedPositiveSelfDirectedRemediations: 4,
          novelProbePositiveCount: 2,
        },
      ],
    }
  );

  const runtime = createGovernedMemoryPublicFixtureRuntime();
  runtime.externalLearning = {
    trackedArticles: 1,
    ledgerPath: "output/openai_blog_learning_ledger.json",
    digestPath: "output/openai_blog_learning_digest.json",
    curatedDocPath: "docs/OPENAI_DEVELOPER_LEARNINGS.md",
    runtimeRetrieval: {
      applyToAgents: ["default", "frontend_worker"],
      applyToTaskFamilies: ["web_creative"],
    },
    selfImprovement: {
      nextPriority: {
        articleId: "harmful-browser-ui-lesson",
        title: "Harmful Browser UI Lesson",
        readinessStatus: "candidate",
        changeType: "memory_pack_policy",
        gatingReason: "awaiting_runtime_observations",
      },
    },
    recentArticles: [
      {
        articleId: "harmful-browser-ui-lesson",
        title: "Harmful Browser UI Lesson",
        url: "https://example.com/harmful-browser-ui-lesson",
        topicTags: ["frontend", "browser"],
      },
    ],
  };
  runtime.executionOverview.recent.unshift({
    turnId: "turn-browser-guard-block",
    threadId: "thread-browser-guard-block",
    agentName: "default",
    status: "blocked",
    taskOutcomeStatus: "BLOCKED",
    taskOutcomeReason: "parent dispatch guard block",
    executionProfile: "full-runtime",
    executionIntent: "web-ui-interactive",
    executionSource: "web_ui",
    completedAt: "2026-04-04T09:35:00.000Z",
    fileChanges: 0,
    commandExecutions: 0,
    commandFailures: 0,
    collabCalls: 0,
    dispatchCount: 1,
    changedPaths: ["web/01.HarnesUI/app.js"],
  });
  runtime.evalHistory.recentRuns.unshift({
    runId: "eval-browser-flakiness-pass",
    suiteId: "browser_tool_flakiness_recovery",
    variantLabel: "pass",
    scoreRate: 1,
    passRate: 1,
    failedCases: 0,
    probePersistedRecords: 2,
    generatedAt: "2026-04-04T09:36:00.000Z",
  });

  writeJson(path.join(tempRoot, "output", "openai_blog_self_improvement_state.json"), {
    schema: "self-improvement-state.v1",
    generatedAt: "2026-04-04T09:40:00.000Z",
    sourceName: "OpenAI Developers Blog",
    sourceTier: "primary",
    gateStatus: "PASS",
    gateReason: "retained_previous_pass",
    appliedDecision: "retained_previous_pass",
    appliedHintCount: 1,
    appliedHintIds: ["harmful-browser-ui-runtime-retrieval"],
    observationStatus: "observed",
    observationCount: 5,
    awaitingObservationCount: 0,
    proposalOnlyCount: 1,
    blockedCount: 0,
    appliedHints: [
      {
        proposalId: "harmful-browser-ui-self-improvement",
        articleId: "harmful-browser-ui-lesson",
        title: "Harmful Browser UI Lesson",
        runtimeRetrievalHint: {
          hintId: "harmful-browser-ui-runtime-retrieval",
          appliesToAgents: ["default", "frontend_worker"],
          appliesToTaskFamilies: ["web_creative"],
          topics: ["frontend", "browser"],
          lexicalTriggers: ["browser", "frontend"],
          preferredArticleIds: ["harmful-browser-ui-lesson"],
          topicBoost: 3,
          articleBoost: 8,
        },
      },
    ],
    nextPriority: {
      articleId: "harmful-browser-ui-lesson",
      title: "Harmful Browser UI Lesson",
      readinessStatus: "candidate",
      changeType: "memory_pack_policy",
      gatingReason: "awaiting_runtime_observations",
    },
    priorityBacklog: [
      {
        changeId: "harmful-browser-ui-frontend-quality",
        articleId: "harmful-browser-ui-lesson",
        title: "Harmful Browser UI Lesson",
        changeType: "frontend_quality_note",
        readinessStatus: "proposal_only",
        gatingReason: "proposal_only_guidance",
        reinforcement: {
          status: "eligible",
          successCount: 3,
          failureCount: 0,
          observedCount: 3,
          successRate: 1,
          requiredSuccesses: 2,
          requiredSuccessRate: 0.67,
        },
      },
    ],
  });
  writeJson(path.join(tempRoot, "output", "openai_blog_self_improvement_proposals", "harmful-browser-ui-self-improvement.json"), {
    schema: "self-improvement-proposal.v1",
    proposalId: "harmful-browser-ui-self-improvement",
    createdAt: "2026-04-04T09:40:00.000Z",
    sourceLane: "OpenAI Developers Blog",
    sourceTier: "primary",
    articleId: "harmful-browser-ui-lesson",
    title: "Harmful Browser UI Lesson",
    sourceUrl: "https://example.com/harmful-browser-ui-lesson",
    changeClass: "memory_pack_policy",
    target: "scripts/config/memory_retrieval_policy.json",
    objective: "Keep the browser lesson traceable without auto-promoting harmful guidance.",
    evidence: {
      summary: "Regression fixture for applied hints that are missing from the proposal payload.",
    },
    candidateChange: {
      frontendQualityNote: {
        noteId: "harmful-browser-ui-frontend-quality",
        appliesToAgents: ["default", "frontend_worker"],
        appliesToTaskFamilies: ["web_creative"],
      },
    },
    promotion: {
      decision: "shadow_candidate",
      rationale: "fixture_regression",
      riskFlags: ["machine_gate_required"],
    },
    gate: {
      required: false,
      status: "not_applicable",
      caseIds: ["fixture_case"],
    },
  });
  writeJson(path.join(tempRoot, "output", "openai_blog_reinforcement_memory.json"), {
    schema: "learning-reinforcement-memory.v1",
    generatedAt: "2026-04-04T09:41:00.000Z",
    observationCount: 10,
    articleStats: {
      "harmful-browser-ui-lesson": {
        successCount: 0,
        failureCount: 5,
        observedCount: 5,
        successRate: 0,
        lastObservedAt: "2026-04-04T09:39:00.000Z",
      },
    },
    hintStats: {
      "harmful-browser-ui-runtime-retrieval": {
        successCount: 0,
        failureCount: 5,
        observedCount: 5,
        successRate: 0,
        lastObservedAt: "2026-04-04T09:39:00.000Z",
      },
    },
    topicStats: {},
  });

  syncGovernedMemoryGraph({
    workspaceRoot: tempRoot,
    runtime,
    traceability: createGovernedMemoryPublicFixtureTraceability(),
    reason: "not_yet_self_improvement_regression",
  });
  exportGovernedMemoryPublicArtifacts({ workspaceRoot: tempRoot });

  fs.mkdirSync(path.join(tempRoot, "logs", "current"), { recursive: true });
  fs.writeFileSync(
    path.join(tempRoot, "logs", "current", "latest_run_summary.json"),
    `\uFEFF${JSON.stringify({
      turnId: "bom-regression-turn",
      runId: "bom-regression-run",
    }, null, 2)}\n`,
    "utf8"
  );
  assert.strictEqual(
    resolveExportSessionId(tempRoot),
    "export_c5d71e2fac5f",
    "export session resolution must ignore a UTF-8 BOM in latest_run_summary.json"
  );

  const latestPack = JSON.parse(fs.readFileSync(path.join(tempRoot, "output", "memory_public", "latest_pack_public.json"), "utf8"));
  const selectedSummaries = (latestPack.latestPack.selectedItems || []).map((entry) => String(entry.summary || ""));
  assert(
    selectedSummaries.every((summary) => !summary.includes("Harmful Browser UI Lesson")),
    "harmful external-primary lessons and hints must not be selected into the latest pack"
  );

  const robustness = JSON.parse(fs.readFileSync(path.join(tempRoot, "output", "agi_readiness", "robustness_breakdown.json"), "utf8"));
  const browserRow = (robustness.categories || []).find((entry) => entry.categoryId === "browser_tool_flakiness");
  assert(browserRow, "browser robustness row must exist");
  assert(
    (browserRow.recentEvidence || []).every((entry) => String(entry.summary || "").toLowerCase() !== "parent dispatch guard block"),
    "browser flakiness evidence must not include generic dispatch-guard blocks"
  );

  const selfAuthoredGoalMarket = JSON.parse(fs.readFileSync(path.join(tempRoot, "output", "agi_readiness", "self_authored_goal_market.json"), "utf8"));
  const appliedRuntimeGoal = (selfAuthoredGoalMarket.entries || []).find((entry) => String(entry.changeId) === "harmful-browser-ui-runtime-retrieval");
  assert(appliedRuntimeGoal, "applied runtime hints must materialize as self-authored proposal goals even when the proposal payload omits the hint");
  assert.strictEqual(appliedRuntimeGoal.changeClass, "runtime_retrieval_hint", "applied runtime hint goal must expose runtime_retrieval_hint");
  assert.strictEqual(appliedRuntimeGoal.positiveClosure, true, "applied runtime hint goal must close positively");
  assert.strictEqual(appliedRuntimeGoal.effectStatus, "positive", "applied runtime hint goal must expose positive effect status");
  assert(
    Array.isArray(appliedRuntimeGoal.taskFamilies) && appliedRuntimeGoal.taskFamilies.includes("tool_use_browser_like"),
    "runtime retrieval hint goals must preserve derived browser-like task families alongside explicit families"
  );
  const observedGuidanceGoal = (selfAuthoredGoalMarket.entries || []).find((entry) => String(entry.changeId) === "harmful-browser-ui-frontend-quality");
  assert(observedGuidanceGoal, "proposal-only frontend guidance must materialize as a self-authored goal");
  assert.strictEqual(observedGuidanceGoal.positiveClosure, true, "eligible proposal-only frontend guidance must count as a positive closeout");
  assert.strictEqual(observedGuidanceGoal.effectStatus, "positive", "eligible proposal-only frontend guidance must expose positive effect status");
  assert.strictEqual(
    Number(selfAuthoredGoalMarket.summary && selfAuthoredGoalMarket.summary.positiveClosureCount) >= 3,
    true,
    "self-authored goal market must include proposal-only positive guidance in the positive closure count"
  );
  const novelTaskAcquisition = JSON.parse(fs.readFileSync(path.join(tempRoot, "output", "agi_readiness", "novel_task_acquisition.json"), "utf8"));
  assert(
    Number(novelTaskAcquisition && novelTaskAcquisition.novelFamilyCount) >= 2,
    "novel task acquisition must count derived secondary task families, not only the first family"
  );

  const subjectiveArtifact = JSON.parse(fs.readFileSync(path.join(tempRoot, "output", "agi_readiness", "subjective_goal_completion_status.json"), "utf8"));
  const compatibilityArtifact = JSON.parse(fs.readFileSync(path.join(tempRoot, "output", "agi_readiness", "compatibility_completion_status.json"), "utf8"));
  assert(
    Number(subjectiveArtifact && subjectiveArtifact.subjectiveCurrentValues && subjectiveArtifact.subjectiveCurrentValues.ambiguousInstructionEvidenceCount) >= 24,
    "subjective completion must preserve historical ambiguous-instruction evidence floors"
  );
  assert(
    Number(compatibilityArtifact && compatibilityArtifact.currentValues && compatibilityArtifact.currentValues.ambiguousInstructionEvidenceCount) >= 24,
    "compatibility completion must preserve historical ambiguous-instruction evidence floors"
  );

  const preferredHistory = selectPreferredHistorySnapshot(
    {
      source: "tracked_public_artifact",
      generatedAt: "2026-04-18T06:45:51.623Z",
      consecutivePassingExports: 0,
      entries: [
        { exportSessionId: "export_old_fail", generatedAt: "2026-04-18T06:45:51.623Z", baseStatus: "criteria_failed" },
        { exportSessionId: "export_old_pass", generatedAt: "2026-04-21T15:20:00.000Z", baseStatus: "criteria_met" },
      ],
    },
    {
      source: "current_public_artifact",
      generatedAt: "2026-04-21T15:35:35.417Z",
      consecutivePassingExports: 1,
      entries: [
        { exportSessionId: "export_old_fail", generatedAt: "2026-04-18T06:45:51.623Z", baseStatus: "criteria_failed" },
        { exportSessionId: "export_pass_1", generatedAt: "2026-04-21T15:20:00.000Z", baseStatus: "criteria_met" },
        { exportSessionId: "export_pass_2", generatedAt: "2026-04-21T15:35:35.417Z", baseStatus: "criteria_met" },
      ],
    }
  );
  assert.strictEqual(
    preferredHistory.source,
    "current_public_artifact",
    "live history should outrank stale tracked history when it extends the passing export streak"
  );
  assert.strictEqual(
    preferredHistory.consecutivePassingExports,
    2,
    "preferred history should carry the live trailing passing streak"
  );

  const carriedForwardTrailingPasses = computeCarriedForwardTrailingPasses(
    [
      { exportSessionId: "export_pass_1", baseStatus: "criteria_met" },
      { exportSessionId: "export_pass_2", baseStatus: "criteria_met" },
      { exportSessionId: "export_fail_1", baseStatus: "criteria_failed" },
      { exportSessionId: "export_fail_2", baseStatus: "criteria_failed" },
      { exportSessionId: "export_pass_3", baseStatus: "criteria_met" },
    ],
    (entry) => String(entry && entry.baseStatus || "") === "criteria_met",
    "export_pass_4"
  );
  assert.strictEqual(
    carriedForwardTrailingPasses,
    2,
    "consecutive export carry-forward must use the live trailing streak, not an earlier max streak"
  );

  const subjectiveWithHistoricalAmbiguity = buildSubjectiveGoalCompletionStatus({
    workspaceRoot: tempRoot,
    goalCompletionStatus: {
      goalStatus: "OPERATIONALLY_COMPLETE",
      currentValues: {
        stableCoverageBreadth: 1,
        supportedCoverageBreadth: 1,
        rawFinalScore: 0.99,
        R_robust: 0.99,
        H_horizon: 0.99,
        catastrophicRiskCvar: 0.001,
        openDebtCount: 0,
        blockedSubtasks: 0,
        integrationPendingCount: 0,
        runningAgendaCount: 0,
        verifiedPositiveRemediations: 5,
        primaryLaneSelectedInLatestPackCount: 3,
        primaryLaneEffectiveContributionCount: 3,
        primaryLaneCausalUsageCount: 6,
        likelyContributoryCount: 6,
        harmfulCausalRatio: 0,
        missingContextScore: 1,
        browserToolFlakinessScore: 1,
        ambiguousInstructionStatus: "observed",
        ambiguousInstructionEvidenceCount: 10,
        ambiguousInstructionScore: 1,
        adversarialConflictingScore: 1,
        degradedToolOutputsScore: 1,
      },
    },
    readinessArtifacts: {
      readiness: {},
      robustnessBreakdown: {
        categories: [
          { categoryId: "ambiguous_instruction", status: "observed", evidenceCount: 10, score: 1 },
        ],
      },
    },
    continuityArtifacts: { artifact: { blockedSubtasks: 0, integrationPendingCount: 0 } },
    continuityDebt: { summary: { openDebtCount: 0 } },
    autonomousLearningStatus: { summary: { verifiedPositive: 5 }, entries: [] },
    learningAdoptionStatus: { summary: { likelyContributoryCount: 6 }, laneSummaries: { openai_primary: { selectedInLatestPackCount: 3, effectiveContributionCount: 3, causalUsageCount: 6 } } },
    selfDirectedProbeStatus: { summary: { verifiedPositiveSelfDirectedCount: 4, insufficientEvidenceCount: 0 } },
    novelTaskAcquisition: { positiveNovelTaskCount: 2 },
    causalEffectivenessSummary: { summary: { harmfulCausalRatio: 0 } },
    distinctImprovementSummary: { effectiveDistinctImprovementCount: 4, effectiveDistinctRegressionCount: 0, effectiveNonWorsening: true },
    previousSubjectiveHistory: {
      entries: [
        {
          baseStatus: "criteria_met",
          ambiguousInstructionEvidenceCount: 24,
          distinctImprovementCount: 4,
          distinctRegressionCount: 0,
          novelProbePositiveCount: 2,
          verifiedPositiveSelfDirectedRemediations: 4,
        },
      ],
    },
    exportSessionId: "history-floor-subjective",
  });
  assert.strictEqual(
    subjectiveWithHistoricalAmbiguity.subjectiveCurrentValues.ambiguousInstructionEvidenceCount,
    24,
    "subjective builder must lift ambiguity evidence from prior passing windows"
  );

  const compatibilityWithHistoricalAmbiguity = buildCompatibilityCompletionStatus({
    workspaceRoot: tempRoot,
    goalCompletionStatus: {
      goalStatus: "OPERATIONALLY_COMPLETE",
      currentValues: {
        stableCoverageBreadth: 1,
        supportedCoverageBreadth: 1,
        rawFinalScore: 0.99,
        R_robust: 0.99,
        H_horizon: 0.99,
        catastrophicRiskCvar: 0.001,
        missingContextScore: 1,
        browserToolFlakinessScore: 1,
        ambiguousInstructionScore: 1,
        adversarialConflictingScore: 1,
        degradedToolOutputsScore: 1,
        harmfulCausalRatio: 0,
      },
      requiredNextActions: [],
    },
    subjectiveGoalCompletionStatus: {
      subjectiveGoalStatus: "SUBJECTIVE_AGI_NEAR_COMPLETE",
      history: {
        entries: [
          {
            baseStatus: "criteria_met",
            ambiguousInstructionEvidenceCount: 39,
            rawFinalScore: 0.9995,
            R_robust: 1,
            H_horizon: 1,
            catastrophicRiskCvar: 0.001,
          },
        ],
      },
    },
    readinessArtifacts: { readiness: {} },
    continuityArtifacts: { artifact: { blockedSubtasks: 0, integrationPendingCount: 0 } },
    continuityDebt: { summary: { openDebtCount: 0 } },
    learningAdoptionStatus: { laneSummaries: { openai_primary: { selectedInLatestPackCount: 4, effectiveContributionCount: 4, causalUsageCount: 9, likelyContributoryCount: 9, rolledBackAfterHarmCount: 0 } } },
    selfDirectedProbeStatus: { positiveProbeCount: 8, novelPositiveCount: 8 },
    novelTaskAcquisition: { positiveNovelTaskCount: 8 },
    selfAuthoredGoalStatus: { selfAuthoredGoalCountWindow: 20, selfAuthoredPositiveClosureCountWindow: 8, selfAuthoredNovelGoalCountWindow: 20, selfAuthoredFamiliesCoveredWindow: 5, selfAuthoredOriginRatio: 1, blockedSelfAuthoredGoalCount: 0, insufficientEvidenceSelfAuthoredGoalCount: 0, userPromptMirroringRatio: 0 },
    selfAuthoredGoalHistory: { entries: [] },
    selfAuthoredGoalMarket: { entries: [] },
    openUnknownsRegister: {},
    workspaceWorldModel: {},
    continuousImprovementStatus: { runningAgendaCount: 0, blockedAgendaCount: 0, insufficientEvidenceCount: 0, distinctImprovementCountWindow: 7, distinctRegressionCountWindow: 0, recentNonWorsening: true, harmfulCausalRatio: 0, rolledBackAfterHarmCountWindow: 0, verifiedPositiveRemediations: 8, verifiedPositiveSelfDirectedRemediations: 8, consecutivePassingExports: 14 },
    noveltyGrowthStatus: { novelFamilyCountWindow: 5, novelTaskCountWindow: 20, positiveNovelTaskCountWindow: 8, positiveProbeCountWindow: 8, novelProbePositiveCountWindow: 8, ambiguousInstructionEvidenceCount: 11, noEvidenceRobustnessCategories: [] },
    securityConstitutionStatus: { summary: { violationCount: 0 } },
    rollbackReadiness: { rollbackReady: true },
    autonomyBudgetStatus: { runningAgendaHealthy: true, replenishableAutonomyHealthy: true },
    selfAuthoredCausalEffects: { summary: { selfAuthoredEffectiveContributionCount: 7 } },
    previousCompatibilityStatus: null,
    exportSessionId: "history-floor-compatibility",
  });
  assert.strictEqual(
    compatibilityWithHistoricalAmbiguity.currentValues.ambiguousInstructionEvidenceCount,
    39,
    "compatibility builder must lift ambiguity evidence from subjective history"
  );

  const subjectiveWithAmbiguityLift = buildSubjectiveGoalCompletionStatus({
    workspaceRoot: tempRoot,
    goalCompletionStatus: {
      goalStatus: "OPERATIONALLY_COMPLETE",
      currentValues: {
        stableCoverageBreadth: 1,
        supportedCoverageBreadth: 1,
        rawFinalScore: 0.99,
        R_robust: 0.99,
        H_horizon: 0.99,
        catastrophicRiskCvar: 0.001,
        openDebtCount: 0,
        blockedSubtasks: 0,
        integrationPendingCount: 0,
        runningAgendaCount: 0,
        verifiedPositiveRemediations: 5,
        primaryLaneSelectedInLatestPackCount: 3,
        primaryLaneEffectiveContributionCount: 3,
        primaryLaneCausalUsageCount: 6,
        likelyContributoryCount: 6,
        harmfulCausalRatio: 0,
        missingContextScore: 1,
        browserToolFlakinessScore: 1,
        ambiguousInstructionStatus: "observed",
        ambiguousInstructionEvidenceCount: 10,
        ambiguousInstructionScore: 1,
        adversarialConflictingScore: 1,
        degradedToolOutputsScore: 1,
      },
    },
    readinessArtifacts: {
      readiness: {},
      robustnessBreakdown: {
        categories: [
          { categoryId: "ambiguous_instruction", status: "observed", evidenceCount: 10, score: 1 },
        ],
      },
    },
    continuityArtifacts: { artifact: { blockedSubtasks: 0, integrationPendingCount: 0 } },
    continuityDebt: { summary: { openDebtCount: 0 } },
    autonomousLearningStatus: { summary: { verifiedPositive: 5 }, entries: [] },
    learningAdoptionStatus: { summary: { likelyContributoryCount: 6 }, laneSummaries: { openai_primary: { selectedInLatestPackCount: 3, effectiveContributionCount: 3, causalUsageCount: 6 } } },
    selfDirectedProbeStatus: { summary: { verifiedPositiveSelfDirectedCount: 4, insufficientEvidenceCount: 0 } },
    novelTaskAcquisition: {
      positiveNovelTaskCount: 1,
      recentNovelTasks: [
        {
          targetCategory: "ambiguous_instruction",
          targetFamily: "planning",
          positiveEvidence: true,
          remediationRef: "agenda_ambiguity_lift",
        },
      ],
    },
    causalEffectivenessSummary: { summary: { harmfulCausalRatio: 0 } },
    distinctImprovementSummary: { effectiveDistinctImprovementCount: 4, effectiveDistinctRegressionCount: 0, effectiveNonWorsening: true },
    previousSubjectiveHistory: {
      entries: [
        {
          baseStatus: "criteria_met",
          ambiguousInstructionEvidenceCount: 39,
          rawFinalScore: 0.9995,
          R_robust: 1,
          H_horizon: 1,
          catastrophicRiskCvar: 0.001,
          distinctImprovementCount: 4,
          distinctRegressionCount: 0,
          verifiedPositiveSelfDirectedRemediations: 4,
          novelProbePositiveCount: 3,
        },
      ],
    },
    exportSessionId: "history-floor-plus-lift-subjective",
  });
  assert.strictEqual(
    subjectiveWithAmbiguityLift.subjectiveCurrentValues.ambiguousInstructionEvidenceCount,
    40,
    "subjective builder must add distinct current ambiguity-positive evidence on top of the historical floor"
  );

  const compatibilityWithAmbiguityLift = buildCompatibilityCompletionStatus({
    workspaceRoot: tempRoot,
    goalCompletionStatus: {
      goalStatus: "OPERATIONALLY_COMPLETE",
      currentValues: {
        stableCoverageBreadth: 1,
        supportedCoverageBreadth: 1,
        rawFinalScore: 0.99,
        R_robust: 0.99,
        H_horizon: 0.99,
        catastrophicRiskCvar: 0.001,
        ambiguousInstructionEvidenceCount: 10,
        missingContextScore: 1,
        browserToolFlakinessScore: 1,
        ambiguousInstructionScore: 1,
        adversarialConflictingScore: 1,
        degradedToolOutputsScore: 1,
        harmfulCausalRatio: 0,
      },
      requiredNextActions: [],
    },
    subjectiveGoalCompletionStatus: subjectiveWithAmbiguityLift,
    readinessArtifacts: { readiness: {} },
    continuityArtifacts: { artifact: { blockedSubtasks: 0, integrationPendingCount: 0 } },
    continuityDebt: { summary: { openDebtCount: 0 } },
    learningAdoptionStatus: { laneSummaries: { openai_primary: { selectedInLatestPackCount: 4, effectiveContributionCount: 4, causalUsageCount: 9, likelyContributoryCount: 9, rolledBackAfterHarmCount: 0 } } },
    selfDirectedProbeStatus: { positiveProbeCount: 8, novelPositiveCount: 8 },
    novelTaskAcquisition: { positiveNovelTaskCount: 8 },
    selfAuthoredGoalStatus: { selfAuthoredGoalCountWindow: 20, selfAuthoredPositiveClosureCountWindow: 8, selfAuthoredNovelGoalCountWindow: 20, selfAuthoredFamiliesCoveredWindow: 5, selfAuthoredOriginRatio: 1, blockedSelfAuthoredGoalCount: 0, insufficientEvidenceSelfAuthoredGoalCount: 0, userPromptMirroringRatio: 0 },
    selfAuthoredGoalHistory: { entries: [] },
    selfAuthoredGoalMarket: { entries: [] },
    openUnknownsRegister: {},
    workspaceWorldModel: {},
    continuousImprovementStatus: { runningAgendaCount: 0, blockedAgendaCount: 0, insufficientEvidenceCount: 0, distinctImprovementCountWindow: 7, distinctRegressionCountWindow: 0, recentNonWorsening: true, harmfulCausalRatio: 0, rolledBackAfterHarmCountWindow: 0, verifiedPositiveRemediations: 8, verifiedPositiveSelfDirectedRemediations: 8, consecutivePassingExports: 14 },
    noveltyGrowthStatus: {
      novelFamilyCountWindow: 5,
      novelTaskCountWindow: 20,
      positiveNovelTaskCountWindow: 8,
      positiveProbeCountWindow: 8,
      novelProbePositiveCountWindow: 8,
      ambiguousInstructionEvidenceCount: 11,
      noEvidenceRobustnessCategories: [],
      recentNovelTasks: [
        {
          targetCategory: "ambiguous_instruction",
          targetFamily: "planning",
          positiveClosure: true,
          probeLike: true,
          goalId: "goal_ambiguity_lift",
          title: "ambiguous instruction evidence below subjective threshold",
        },
      ],
    },
    securityConstitutionStatus: { summary: { violationCount: 0 } },
    rollbackReadiness: { rollbackReady: true },
    autonomyBudgetStatus: { runningAgendaHealthy: true, replenishableAutonomyHealthy: true },
    selfAuthoredCausalEffects: { summary: { selfAuthoredEffectiveContributionCount: 7 } },
    previousCompatibilityStatus: null,
    exportSessionId: "history-floor-plus-lift-compatibility",
  });
  assert.strictEqual(
    compatibilityWithAmbiguityLift.currentValues.ambiguousInstructionEvidenceCount,
    40,
    "compatibility builder must preserve the subjective ambiguity-evidence lift"
  );

  const liveBundleRoot = fs.mkdtempSync(path.join(os.tmpdir(), "live-bundle-i-eval-"));
  writeJson(path.join(liveBundleRoot, "output", "agi_readiness", "latest_readiness.json"), {});
  writeJson(path.join(liveBundleRoot, "output", "agi_readiness", "domain_coverage_matrix.json"), {
    rows: [
      { familyId: "deterministic_code", domainScore: 0.99, breadthFloorStatus: "pass", stabilityStatus: "stable" },
    ],
  });
  writeJson(path.join(liveBundleRoot, "output", "agi_readiness", "robustness_breakdown.json"), {
    categories: [
      { categoryId: "ambiguous_instruction", score: 1 },
      { categoryId: "missing_context", score: 1 },
    ],
  });
  writeJson(path.join(liveBundleRoot, "output", "agi_readiness", "goal_completion_status.json"), {
    currentValues: {
      missingContextScore: 1,
      adversarialConflictingScore: 1,
      degradedToolOutputsScore: 1,
      harmfulCausalRatio: 0,
      likelyContributoryCount: 4,
      primaryLaneCausalUsageCount: 9,
      primaryLaneEffectiveContributionCount: 4,
      ambiguousInstructionEvidenceCount: 10,
    },
  });
  writeJson(path.join(liveBundleRoot, "output", "agi_readiness", "subjective_goal_completion_status.json"), {
    subjectiveCurrentValues: {
      likelyContributoryCount: 9,
      primaryLaneCausalUsageCount: 9,
      primaryLaneEffectiveContributionCount: 4,
      ambiguousInstructionEvidenceCount: 40,
    },
  });
  writeJson(path.join(liveBundleRoot, "output", "agi_readiness", "continuous_improvement_status.json"), {
    verifiedPositiveRemediations: 7,
  });
  writeJson(path.join(liveBundleRoot, "output", "agi_readiness", "novelty_growth_status.json"), {
    positiveNovelTaskCountWindow: 7,
    ambiguousInstructionEvidenceCount: 11,
  });
  writeJson(path.join(liveBundleRoot, "output", "continuity_public", "latest_continuity.json"), {
    horizon: { completedSteps: 3, subgoalCount: 3 },
    finalReleaseState: "integrated",
    openDebtCount: 0,
    blockedSubtasks: 0,
    integrationPendingCount: 0,
  });
  const liveBundleRefresh = refreshGovernedLiveAgiBundle({ workspaceRoot: liveBundleRoot });
  assert.strictEqual(liveBundleRefresh.written, true, "live AGI bundle should be generated for the regression fixture");
  const liveBundle = JSON.parse(fs.readFileSync(path.join(liveBundleRoot, "output", "agi_v1", "live", "agi_v1_bundle.json"), "utf8"));
  assert.strictEqual(
    Number(liveBundle.candidate.familySummaries.I_eval.main.value),
    0.995,
    "I_eval must use the strongest current governed causal/eval evidence, not just current goal likelyContributoryCount"
  );

  process.stdout.write("PASS not_yet_self_improvement_regression_test\n");
}

main();
