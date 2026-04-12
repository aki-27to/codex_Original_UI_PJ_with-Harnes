"use strict";

const assert = require("assert");
const crypto = require("crypto");
const fs = require("fs");
const os = require("os");
const path = require("path");
const {
  buildGoalCompletionStatus,
  buildSubjectiveGoalCompletionStatus,
  buildDistinctImprovementSummary,
  buildGovernedMemoryPublicArtifacts,
  evaluateMemoryPublicSuite,
  exportGovernedMemoryPublicArtifacts,
  syncGovernedMemoryGraph,
} = require("./lib/governed_memory_graph");
const {
  createGovernedMemoryPublicFixtureRuntime,
  createGovernedMemoryPublicFixtureSecondPassRuntime,
  createGovernedMemoryPublicFixtureTraceability,
  seedGovernedMemoryPublicAgiReadinessArtifacts,
  seedGovernedMemoryPublicCompatibilityArtifacts,
  seedGovernedMemoryPublicContinuityArtifacts,
} = require("./lib/governed_memory_public_fixture");
const {
  resolveExportSessionId,
} = require("./lib/export_session_window");

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

function stableHash(value) {
  return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function stableRef(value, prefix = "ref") {
  return `${prefix}_${stableHash(value).slice(0, 10)}`;
}

function collectLeafValues(value, keyPath = "", bucket = []) {
  if (Array.isArray(value)) {
    value.forEach((entry, index) => collectLeafValues(entry, `${keyPath}[${index}]`, bucket));
    return bucket;
  }
  if (value && typeof value === "object") {
    Object.entries(value).forEach(([key, entry]) => {
      const nextPath = keyPath ? `${keyPath}.${key}` : key;
      collectLeafValues(entry, nextPath, bucket);
    });
    return bucket;
  }
  bucket.push({ keyPath, value });
  return bucket;
}

function isUuidLike(value) {
  return typeof value === "string" && /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/i.test(value);
}

function mergeFixture(baseValue, overrideValue) {
  if (overrideValue === undefined) return baseValue;
  if (Array.isArray(overrideValue)) return overrideValue;
  if (baseValue && typeof baseValue === "object" && overrideValue && typeof overrideValue === "object") {
    const merged = { ...baseValue };
    Object.entries(overrideValue).forEach(([key, value]) => {
      merged[key] = mergeFixture(baseValue[key], value);
    });
    return merged;
  }
  return overrideValue;
}

function summarizeAutonomousLearningEntries(entries = []) {
  const list = Array.isArray(entries) ? entries : [];
  const openEntries = list.filter((entry) => !["passed", "failed", "revoked"].includes(String(entry && entry.status || "").trim().toLowerCase()));
  const countBlocked = (items) => items.filter((entry) => ["blocked", "proposal_only", "proposal only"].includes(String(entry && entry.status || "").trim().toLowerCase())).length;
  return {
    queued: openEntries.filter((entry) => String(entry && entry.status || "").trim().toLowerCase() === "queued").length,
    running: openEntries.filter((entry) => String(entry && entry.status || "").trim().toLowerCase() === "running").length,
    blocked: countBlocked(openEntries),
    insufficientEvidenceCount: openEntries.filter((entry) => String(entry && entry.remediationEffect || "").trim() === "insufficient_evidence").length,
    verifiedPositiveCount: list.filter((entry) => String(entry && entry.remediationEffect || "").trim() === "verified_positive").length,
  };
}

function expectedAutonomousLearningCountSemantics() {
  return {
    currentWindow: "current_export_session",
    historicalWindow: "prior_export_sessions_cumulative",
    countedEntryScope: "non_memory_eval_learning_agenda_entries",
    currentOpenAgendaCounts: [
      "currentQueuedCount",
      "currentRunningCount",
      "currentBlockedCount",
      "currentInsufficientEvidenceCount",
    ],
    currentVerifiedPositiveCount: "verified_positive_non_memory_eval_entries_in_current_export_session",
    historicalVerifiedPositiveCount: "cumulative_verified_positive_non_memory_eval_entries_from_prior_export_sessions",
    gateDecisionCounts: {
      scope: "completion_gate_consumed_subset",
      countedEntryScope: "non_memory_eval_learning_agenda_entries_in_current_export_session",
      sourceRule: "exclude_meta_completion_entries_via_isMetaCompletionAgendaEntry",
      openAgendaFields: [
        "queued",
        "running",
        "blocked",
        "insufficientEvidenceCount",
      ],
    },
    summaryRelationships: {
      queued: "equals_currentQueuedCount",
      running: "equals_currentRunningCount",
      blocked: "equals_currentBlockedCount",
      insufficientEvidenceCount: "equals_currentInsufficientEvidenceCount",
      verifiedPositive: "equals_currentVerifiedPositiveCount",
    },
    decisionRelationships: {
      goalRunningAgendaCount: "equals_gateDecisionCounts.running",
      subjectiveRunningAgendaCount: "equals_gateDecisionCounts.running",
      subjectiveBlockedAgendaCount: "equals_gateDecisionCounts.blocked",
      subjectiveInsufficientEvidenceCount: "equals_max(gateDecisionCounts.insufficientEvidenceCount,selfDirectedProbeStatus.summary.insufficientEvidenceCount)",
    },
  };
}

function createStrictSubjectiveArgs(workspaceRoot, overrides = {}) {
  const base = {
    workspaceRoot,
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
        primaryLaneSelectedInLatestPackCount: 1,
        primaryLaneEffectiveContributionCount: 1,
        primaryLaneCausalUsageCount: 3,
        harmfulCausalRatio: 0,
        missingContextScore: 1,
        browserToolFlakinessScore: 1,
        ambiguousInstructionStatus: "observed",
        ambiguousInstructionEvidenceCount: 24,
        ambiguousInstructionScore: 1,
        adversarialConflictingScore: 1,
        degradedToolOutputsScore: 1,
      },
    },
    readinessArtifacts: {
      robustnessBreakdown: {
        categories: [
          { categoryId: "ambiguous_instruction", status: "observed", evidenceCount: 24, score: 1 },
          { categoryId: "missing_context", status: "observed", evidenceCount: 5, score: 1 },
          { categoryId: "browser_tool_flakiness", status: "observed", evidenceCount: 8, score: 1 },
          { categoryId: "adversarial_conflicting_instruction", status: "observed", evidenceCount: 4, score: 1 },
          { categoryId: "degraded_tool_outputs", status: "observed", evidenceCount: 5, score: 1 },
        ],
      },
    },
    continuityArtifacts: { artifact: { blockedSubtasks: 0, integrationPendingCount: 0 } },
    continuityDebt: { summary: { openDebtCount: 0 } },
    autonomousLearningStatus: {
      summary: {
        verifiedPositive: 5,
        running: 0,
      },
      entries: [
        { source: "self_directed_probe", remediationEffect: "verified_positive", status: "passed", proposedEvalProbe: "probe:one", targetFamily: "planning", agendaId: "agenda-one", lastUpdatedAt: "2026-04-04T13:10:00.000Z" },
        { source: "subjective_goal", remediationEffect: "verified_positive", status: "passed", proposedEvalProbe: "probe:two", targetFamily: "default", agendaId: "agenda-two", lastUpdatedAt: "2026-04-04T13:20:00.000Z" },
      ],
    },
    learningAdoptionStatus: {
      primaryLaneKey: "openai_primary",
      selectedInLatestPackCount: 1,
      consideredForPackCount: 3,
      effectiveContributionCount: 1,
      likelyContributoryCount: 3,
      rolledBackAfterHarmCount: 0,
      adoptionWindow: { mode: "latest_pack_plus_recent_causal_trace", latestPackOnly: true, recentAdoptionsLimit: 12 },
      requiredThresholds: {
        selectedInLatestPackCount: 1,
        effectiveContributionCount: 1,
        likelyContributoryCount: 3,
        causalUsageCount: 3,
        maxRolledBackAfterHarmCount: 0,
      },
      summary: {
        selectedInLatestPackCount: 1,
        consideredForPackCount: 3,
        likelyContributoryCount: 3,
        harmfulCount: 0,
        rolledBackAfterHarmCount: 0,
      },
      laneSummaries: {
        openai_primary: {
          selectedInLatestPackCount: 1,
          consideredForPackCount: 3,
          effectiveContributionCount: 1,
          causalUsageCount: 3,
          likelyContributoryCount: 3,
          harmfulCount: 0,
          rolledBackAfterHarmCount: 0,
        },
      },
    },
    selfDirectedProbeStatus: {
      probeCount: 2,
      positiveProbeCount: 2,
      negativeProbeCount: 0,
      novelProbeCount: 2,
      novelPositiveCount: 2,
      recentProbeFamilies: ["planning", "default"],
      recentPositiveEvidenceRefs: ["agenda_agenda-one", "agenda_agenda-two"],
      requiredThresholds: {
        positiveProbeCount: 2,
        novelPositiveCount: 1,
        maxInsufficientEvidenceCount: 0,
      },
      summary: {
        selfDirectedCount: 2,
        probeCount: 2,
        positiveProbeCount: 2,
        negativeProbeCount: 0,
        verifiedPositiveSelfDirectedCount: 2,
        blockedCount: 0,
        insufficientEvidenceCount: 0,
        novelProbeCount: 2,
        novelPositiveCount: 2,
        novelProbePositiveCount: 2,
      },
    },
    novelTaskAcquisition: {
      novelFamilyCount: 2,
      novelTaskCount: 2,
      positiveNovelTaskCount: 2,
      recentNovelTasks: [
        { targetCategory: "ambiguous_instruction", targetFamily: "planning", positiveEvidence: true },
        { targetCategory: "self_directed_probe", targetFamily: "default", positiveEvidence: true },
      ],
      positiveEvidenceRefs: ["agenda_agenda-one", "agenda_agenda-two"],
      requiredThresholds: {
        positiveNovelTaskCount: 1,
      },
      summary: { positiveCount: 2 },
      items: [{ targetCategory: "ambiguous_instruction", positiveEvidence: true }],
    },
    causalEffectivenessSummary: {
      summary: {
        harmfulCausalRatio: 0,
        likelyContributoryCount: 3,
      },
    },
    distinctImprovementSummary: {
      distinctImprovementCount: 3,
      effectiveDistinctImprovementCount: 3,
      distinctRegressionCount: 0,
      effectiveDistinctRegressionCount: 0,
      nonWorsening: true,
      effectiveNonWorsening: true,
    },
    previousSubjectiveHistory: {
      entries: Array.from({ length: 6 }, (_, index) => ({
        exportSessionId: `strict-pass-${index}`,
        baseStatus: "criteria_met",
        subjectiveGoalStatus: "SUBJECTIVE_AGI_NEAR_COMPLETE",
        distinctImprovementCount: 3,
        distinctRegressionCount: 0,
        verifiedPositiveSelfDirectedRemediations: 2,
        novelProbePositiveCount: 2,
      })),
    },
    exportSessionId: "strict-subjective-pass",
  };
  return mergeFixture(base, overrides);
}

function main() {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "governed-memory-public-"));
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
  const exportSessionId = resolveExportSessionId(tempRoot);
  writeJson(path.join(tempRoot, "output", "governance_public", "worker_decision_surface.json"), {
    schema: "worker-decision-surface.v1",
    scope: "worker_decision",
    exportSessionId,
    topLevelOutcome: "AUTONOMOUS_RETRY",
    topLevelSummary: "The worker should continue autonomously until adoption-ready completion is supported by evidence.",
    operatorAction: "CONTINUE_AUTONOMOUSLY",
    minimalHitl: { mode: "continue_autonomously", humanInterruptionRequired: 0, explicitUserJudgmentRequired: 0 },
    adoptionReadiness: 0.62,
    latentIntentAlignment: 0.91,
    evidenceSummary: { evidenceRefCount: 3, supportingArtifactCount: 4, blockerCount: 1, residualRiskCount: 1, assumptionCount: 0, taskOutcomeCount: 1 },
  });
  writeJson(path.join(tempRoot, "output", "governance_public", "adoption_readiness_eval.json"), {
    schema: "adoption-readiness-eval.v1",
    scope: "adoption_readiness",
    exportSessionId,
  });
  writeJson(path.join(tempRoot, "output", "governance_public", "iteration_decision.json"), {
    schema: "iteration-decision.v1",
    scope: "iteration_control",
    exportSessionId,
    action: "RETRY",
  });
  writeJson(path.join(tempRoot, "output", "externalization_nohitl", "no_hitl_analysis.json"), {
    schema: "no-hitl-analysis-report.v1",
    exportSessionId,
  });

  const runtime = createGovernedMemoryPublicFixtureRuntime();
  const secondPassRuntime = createGovernedMemoryPublicFixtureSecondPassRuntime();
  const traceability = createGovernedMemoryPublicFixtureTraceability();

  syncGovernedMemoryGraph({
    workspaceRoot: tempRoot,
    runtime,
    traceability,
    reason: "test_sync_public_seed",
  });
  syncGovernedMemoryGraph({
    workspaceRoot: tempRoot,
    runtime: secondPassRuntime,
    traceability,
    reason: "test_sync_public_reuse",
  });
  let exported = exportGovernedMemoryPublicArtifacts({ workspaceRoot: tempRoot });

  const outputRoot = path.join(tempRoot, "output", "memory_public");
  const readinessRoot = path.join(tempRoot, "output", "agi_readiness");
  const continuityRoot = path.join(tempRoot, "output", "continuity_public");

  const requiredPaths = [
    path.join(outputRoot, "latest_overview.json"),
    path.join(outputRoot, "workspace_progress_public.json"),
    path.join(outputRoot, "latest_pack_public.json"),
    path.join(outputRoot, "promotion_revocation_health_public.json"),
    path.join(outputRoot, "memory_eval_public_status.json"),
    path.join(outputRoot, "openai_primary_lane_projection.json"),
    path.join(outputRoot, "anthropic_secondary_lane_projection.json"),
    path.join(outputRoot, "lesson_effectiveness_public.json"),
    path.join(outputRoot, "pack_causal_trace_public.json"),
    path.join(outputRoot, "causal_effectiveness_summary.json"),
    path.join(readinessRoot, "latest_readiness.json"),
    path.join(readinessRoot, "latest_readiness.md"),
    path.join(readinessRoot, "domain_coverage_matrix.json"),
    path.join(readinessRoot, "stable_coverage_matrix.json"),
    path.join(readinessRoot, "stable_coverage_trend.json"),
    path.join(readinessRoot, "robustness_breakdown.json"),
    path.join(readinessRoot, "promotion_trend.json"),
    path.join(readinessRoot, "blocked_reasons.json"),
    path.join(readinessRoot, "next_bottlenecks.json"),
    path.join(readinessRoot, "autonomous_learning_status.json"),
    path.join(readinessRoot, "autonomous_learning_status.md"),
    path.join(readinessRoot, "causal_learning_trace.json"),
    path.join(readinessRoot, "causal_regression_alerts.json"),
    path.join(readinessRoot, "distinct_improvement_lineage.json"),
    path.join(readinessRoot, "distinct_improvement_lineage.md"),
    path.join(readinessRoot, "distinct_improvement_summary.json"),
    path.join(readinessRoot, "robustness_remediation_status.json"),
    path.join(readinessRoot, "robustness_remediation_trend.json"),
    path.join(readinessRoot, "robustness_remediation_backlog.json"),
    path.join(readinessRoot, "robustness_remediation_effects.json"),
    path.join(readinessRoot, "goal_completion_status.json"),
    path.join(readinessRoot, "goal_completion_status.md"),
    path.join(readinessRoot, "compatibility_completion_status.json"),
    path.join(readinessRoot, "compatibility_completion_status.md"),
    path.join(continuityRoot, "latest_continuity.json"),
    path.join(continuityRoot, "continuity_debt.json"),
    path.join(continuityRoot, "continuity_debt_trend.json"),
    path.join(continuityRoot, "continuity_closeout_effects.json"),
  ];
  requiredPaths.forEach((targetPath) => {
    assert(fs.existsSync(targetPath), `required public artifact missing: ${targetPath}`);
  });

  const overviewText = fs.readFileSync(path.join(outputRoot, "latest_overview.json"), "utf8");
  const latestOverview = JSON.parse(overviewText);
  assert(!overviewText.includes(tempRoot), "public overview must not leak the absolute workspace path");
  assert.strictEqual(latestOverview.headlineScope, "worker_decision", "latest overview must expose worker_decision as the headline scope");
  assert.strictEqual(latestOverview.workerDecisionHeadline, "AUTONOMOUS_RETRY", "latest overview must mirror the worker decision headline");
  assert.strictEqual(latestOverview.goalStatusScope, "program_readiness", "latest overview must scope goal completion as program readiness");
  assert.strictEqual(latestOverview.subjectiveGoalStatusScope, "subjective_companion", "latest overview must scope subjective completion as companion");
  assert.strictEqual(latestOverview.compatibilityCompletionScope, "compatibility_layer", "latest overview must scope compatibility completion as compatibility only");
  assert.strictEqual(latestOverview.workerDecisionSurfacePath, "output/governance_public/worker_decision_surface.json", "latest overview must point at the worker decision surface headline");
  assert.strictEqual(latestOverview.workerDecisionSurface.exportSessionId, exportSessionId, "latest overview worker decision surface must carry the shared exportSessionId");
  assert.strictEqual(latestOverview.workerCompletionStatusPath, "output/governance_public/worker_completion_status.json", "latest overview must point at the worker completion companion");
  assert.strictEqual(latestOverview.workerCompletionStatus.exportSessionId, exportSessionId, "latest overview worker completion companion must carry the shared exportSessionId");
  assert.strictEqual(latestOverview.goalCompletion.scope, "program_readiness", "latest overview goalCompletion summary must expose program_readiness scope");
  assert.strictEqual(latestOverview.subjectiveCompletion.scope, "subjective_companion", "latest overview subjectiveCompletion summary must expose subjective_companion scope");
  assert.strictEqual(latestOverview.compatibilityCompletion.scope, "compatibility_layer", "latest overview compatibilityCompletion summary must expose compatibility_layer scope");
  assert.strictEqual(latestOverview.workerCompletion.scope, "worker_completion", "latest overview workerCompletion summary must expose worker_completion scope");

  const workerDecisionSurface = JSON.parse(fs.readFileSync(path.join(tempRoot, "output", "governance_public", "worker_decision_surface.json"), "utf8"));
  assert.strictEqual(workerDecisionSurface.scope, "worker_decision", "worker decision surface must expose worker_decision scope");
  assert.strictEqual(workerDecisionSurface.exportSessionId, exportSessionId, "worker decision surface must carry the shared exportSessionId");
  assert.strictEqual(typeof workerDecisionSurface.topLevelSummary, "string", "worker decision surface must expose topLevelSummary");
  assert.strictEqual(typeof workerDecisionSurface.operatorAction, "string", "worker decision surface must expose operatorAction");

  const workerCompletionStatus = JSON.parse(fs.readFileSync(path.join(tempRoot, "output", "governance_public", "worker_completion_status.json"), "utf8"));
  assert.strictEqual(workerCompletionStatus.scope, "worker_completion", "worker completion companion must expose worker_completion scope");
  assert.strictEqual(workerCompletionStatus.exportSessionId, exportSessionId, "worker completion companion must carry the shared exportSessionId");
  assert.strictEqual(workerCompletionStatus.schema, "worker-completion-status.v1", "worker completion companion must expose expected schema");
  assert.strictEqual(workerCompletionStatus.headlineArtifactPath, "output/governance_public/worker_decision_surface.json", "worker completion companion must point at the worker headline");
  assert.strictEqual(workerCompletionStatus.headlineWorkerOutcome, workerDecisionSurface.topLevelOutcome, "worker completion companion must mirror the worker headline outcome");
  assert.strictEqual(workerCompletionStatus.workerGoalStatus, "NOT_YET", "seeded fixture must keep a non-complete worker headline non-complete in the companion");
  assert.strictEqual(workerCompletionStatus.programReadinessStatus, "NOT_YET", "worker completion companion must preserve background program readiness");
  assert.strictEqual(workerCompletionStatus.programReadinessBlockingWorkerStop, false, "background program readiness must not override the worker stop decision");
  assert.strictEqual(workerCompletionStatus.backgroundArtifactSessionConsistency, "aligned", "worker completion companion must trust only aligned background readiness artifacts");
  assert.strictEqual(workerCompletionStatus.backgroundArtifactInputsTrusted, true, "worker completion companion must mark aligned background readiness artifacts as trusted");
  assert.strictEqual(workerCompletionStatus.gateRunningAgendaCount, 1, "worker completion companion must expose the gate running count");
  assert.strictEqual(workerCompletionStatus.gateBlockedAgendaCount, 0, "worker completion companion must expose the gate blocked count");
  assert.strictEqual(workerCompletionStatus.gateInsufficientEvidenceCount, 0, "worker completion companion must expose the gate insufficient-evidence count");
  assert.strictEqual(workerCompletionStatus.supportingCurrentRunningCount, 3, "worker completion companion must expose the broader supporting running count");
  assert.strictEqual(workerCompletionStatus.supportingCurrentBlockedCount, 0, "worker completion companion must expose the broader supporting blocked count");
  assert.strictEqual(workerCompletionStatus.supportingCurrentInsufficientEvidenceCount, 2, "worker completion companion must expose the broader supporting insufficient-evidence count");
  assert.strictEqual(workerCompletionStatus.excludedMetaCompletionRunningCount, 2, "worker completion companion must expose the excluded meta-completion running count");
  assert.strictEqual(workerCompletionStatus.activeLearningDebtOpen, true, "worker completion companion must expose background learning debt");
  assert.strictEqual(workerCompletionStatus.activeLearningDebtDecisionBasis.mode, "supporting_non_memory_eval_open_counts_with_gate_subset_explicit", "worker completion companion must expose explicit active-learning debt basis");
  assert(Array.isArray(workerCompletionStatus.failedCriteria) && workerCompletionStatus.failedCriteria.length > 0, "worker completion companion must preserve failing worker criteria when the headline is not complete");
  assert(Array.isArray(workerCompletionStatus.whyNotYet) && workerCompletionStatus.whyNotYet.length > 0, "worker completion companion must preserve why-not-yet entries when the headline is not complete");
  assert(Array.isArray(workerCompletionStatus.backgroundProgramReadinessWhyNotYet) && workerCompletionStatus.backgroundProgramReadinessWhyNotYet.length > 0, "worker completion companion must preserve background why-not-yet reasons");

  const adoptionReadinessEval = JSON.parse(fs.readFileSync(path.join(tempRoot, "output", "governance_public", "adoption_readiness_eval.json"), "utf8"));
  assert.strictEqual(adoptionReadinessEval.scope, "adoption_readiness", "adoption readiness eval must expose adoption_readiness scope");
  assert.strictEqual(adoptionReadinessEval.exportSessionId, exportSessionId, "adoption readiness eval must carry the shared exportSessionId");

  const iterationDecision = JSON.parse(fs.readFileSync(path.join(tempRoot, "output", "governance_public", "iteration_decision.json"), "utf8"));
  assert.strictEqual(iterationDecision.scope, "iteration_control", "iteration decision must expose iteration_control scope");
  assert.strictEqual(iterationDecision.exportSessionId, exportSessionId, "iteration decision must carry the shared exportSessionId");

  const noHitlAnalysis = JSON.parse(fs.readFileSync(path.join(tempRoot, "output", "externalization_nohitl", "no_hitl_analysis.json"), "utf8"));
  assert.strictEqual(noHitlAnalysis.exportSessionId, exportSessionId, "no-HITL analysis must carry the shared exportSessionId");

  const workspaceProgress = JSON.parse(fs.readFileSync(path.join(outputRoot, "workspace_progress_public.json"), "utf8"));
  assert(!JSON.stringify(workspaceProgress).includes(tempRoot), "workspace progress public artifact must not leak the absolute workspace path");
  assert.strictEqual(workspaceProgress.workspaceRoot, undefined, "workspace progress public artifact must not expose workspaceRoot");
  assert(!JSON.stringify(workspaceProgress).includes("[object Object]"), "workspace progress public artifact must not contain object stringification artifacts");
  assert.strictEqual(typeof workspaceProgress.updatedAt, "string", "workspace progress public artifact must expose updatedAt");
  assert(workspaceProgress.updatedAt.length > 0, "workspace progress public artifact updatedAt must not be empty");
  assert.notStrictEqual(workspaceProgress.updatedAt, workspaceProgress.generatedAt, "workspace progress updatedAt must be distinct from generatedAt");
  assert(Array.isArray(workspaceProgress.nextRecommendedActions) && workspaceProgress.nextRecommendedActions.length > 0, "workspace progress must expose next recommended actions");
  const validationEntries = [
    ...(Array.isArray(workspaceProgress.lastSuccessfulValidation) ? workspaceProgress.lastSuccessfulValidation : []),
    ...(Array.isArray(workspaceProgress.lastFailedValidation) ? workspaceProgress.lastFailedValidation : []),
  ];
  assert(validationEntries.every((entry) => typeof entry.reference === "string" && entry.reference.length > 0), "workspace progress validation refs must not be blank");
  assert(validationEntries.every((entry) => typeof entry.taskOutcomeStatus === "string" && entry.taskOutcomeStatus.length > 0), "workspace progress taskOutcomeStatus must not be blank");

  const latestPack = JSON.parse(fs.readFileSync(path.join(outputRoot, "latest_pack_public.json"), "utf8"));
  assert(Array.isArray(latestPack.latestPack.selectedItems), "latest pack public artifact must expose selectedItems");
  assert(latestPack.latestPack.selectedItems.every((entry) => typeof entry.publicRef === "string" && entry.publicRef.startsWith("mem_")), "latest pack public artifact must expose redacted publicRefs");
  assert(latestPack.latestPack.selectedItems.every((entry) => !String(entry.publicRef).includes("episode:")), "latest pack public artifact must not leak raw memory ids");
  assert(latestPack.latestPack.selectedItems.every((entry) => !/\[object Object\]/.test(String(entry.summary))), "latest pack public summaries must not contain object stringification artifacts");
  assert(latestPack.latestPack.selectedItems.every((entry) => !/mock-/.test(String(entry.summary))), "latest pack public summaries must not expose raw mock turn prefixes");
  assert(latestPack.latestPack.selectedItems.every((entry) => !isUuidLike(String(entry.summary))), "latest pack public summaries must not expose raw opaque UUIDs");
  assert(latestPack.latestPack.reusedSelectedCount >= 1, "latest pack public artifact must show canonical reuse");
  assert.strictEqual(latestPack.latestPack.explicitTaskFamilyMismatchCount, 0, "latest pack public artifact must not expose hard task-family mismatches");

  const promotionHealth = JSON.parse(fs.readFileSync(path.join(outputRoot, "promotion_revocation_health_public.json"), "utf8"));
  assert((promotionHealth.recentPromotions || []).every((entry) => typeof entry.memoryType === "string" && entry.memoryType.length > 0 && entry.memoryType !== "unknown"), "recent promotions must expose non-empty resolved memoryType");
  assert((promotionHealth.recentRevocations || []).every((entry) => typeof entry.memoryType === "string" && entry.memoryType.length > 0 && entry.memoryType !== "unknown"), "recent revocations must expose non-empty resolved memoryType");
  assert((promotionHealth.recentPromotions || []).every((entry) => typeof entry.recordedAt === "string" && entry.recordedAt.endsWith("Z")), "promotion timestamps must be ISO-8601");
  assert((promotionHealth.recentRevocations || []).every((entry) => typeof entry.recordedAt === "string" && entry.recordedAt.endsWith("Z")), "revocation timestamps must be ISO-8601");

  const lessonEffectiveness = JSON.parse(fs.readFileSync(path.join(outputRoot, "lesson_effectiveness_public.json"), "utf8"));
  assert(Array.isArray(lessonEffectiveness.entries) && lessonEffectiveness.entries.length > 0, "lesson effectiveness public surface must be non-empty");
  assert(lessonEffectiveness.entries.every((entry) => typeof entry.memoryId === "string" && entry.memoryId.length > 0), "lesson effectiveness entries must expose canonical memory ids");
  assert(lessonEffectiveness.entries.every((entry) => typeof entry.promotionState === "string" && entry.promotionState.length > 0), "lesson effectiveness entries must expose promotionState");
  assert(lessonEffectiveness.entries.every((entry) => Number.isFinite(Number(entry.positiveCount))), "lesson effectiveness entries must expose positiveCount");
  assert(lessonEffectiveness.entries.every((entry) => Number.isFinite(Number(entry.harmfulCount))), "lesson effectiveness entries must expose harmfulCount");

  const packCausalTrace = JSON.parse(fs.readFileSync(path.join(outputRoot, "pack_causal_trace_public.json"), "utf8"));
  assert(Array.isArray(packCausalTrace.traces) && packCausalTrace.traces.length > 0, "pack causal trace public surface must be non-empty");
  assert(packCausalTrace.traces.some((entry) => ["selected_only", "surfaced", "behaviorally_referenced", "likely_contributory", "harmful_to_outcome"].includes(entry.usageStage)), "pack causal trace must expose usage stages");
  const causalEffectivenessSummary = JSON.parse(fs.readFileSync(path.join(outputRoot, "causal_effectiveness_summary.json"), "utf8"));
  assert.strictEqual(causalEffectivenessSummary.schema, "governed-causal-effectiveness-summary-public.v1", "causal effectiveness summary must expose expected schema");
  assert(causalEffectivenessSummary.summary && Number.isFinite(Number(causalEffectivenessSummary.summary.harmfulCausalRatio)), "causal effectiveness summary must expose harmful causal ratio");

  const evalStatus = JSON.parse(fs.readFileSync(path.join(outputRoot, "memory_eval_public_status.json"), "utf8"));
  assert.strictEqual(evalStatus.status, "PASS", "memory eval public status must pass for the seeded canonical store");
  [
    "workspace_progress_updated_at_present",
    "promotion_health_memory_type_populated",
    "bounded_memory_pack_reuses_canonical_memory",
    "task_family_isolation_respected",
    "observation_projection_present",
    "continuity_projection_present",
    "agi_readiness_surface_present",
    "readiness_breadth_semantics_consistent",
    "promotion_surface_not_self_comparison_misreported",
    "coverage_failures_reflected_in_bottlenecks",
    "lane_projection_real_observations_reflected",
    "breadth_family_evidence_present",
    "weakest_gate_semantics_explained",
    "primary_lane_observation_closure",
    "continuity_public_real_case_present",
    "robustness_breakdown_exported",
    "autonomous_learning_agenda_present",
    "autonomous_learning_running_or_passed",
    "causal_learning_trace_present",
    "primary_lane_causal_usage_present",
    "secondary_lane_advisory_trace_present",
    "distinct_lineage_present",
    "distinct_lineage_has_non_promoted_case",
    "continuity_debt_surface_present",
    "goal_completion_artifact_present",
    "worker_decision_surface_present",
    "worker_decision_surface_scope_is_primary",
    "worker_decision_surface_export_session_consistent",
    "worker_completion_status_present",
    "worker_completion_status_consistent",
    "worker_completion_alignment_not_stale_in_downstream_surfaces",
    "stable_coverage_surface_present",
    "causal_regression_alerts_present",
    "goal_completion_supporting_artifacts_present",
    "goal_completion_status_consistent",
    "goal_completion_scope_is_program_readiness",
    "goal_completion_not_yet_when_criteria_fail",
    "goal_artifact_subjective_fields_present",
    "subjective_goal_artifact_present",
    "subjective_goal_supporting_artifacts_present",
    "history_aware_subjective_counts_consistent",
    "subjective_goal_not_yet_when_subjective_criteria_fail",
    "subjective_completion_scope_is_companion",
    "primary_lane_latest_pack_adoption_reflected",
    "primary_lane_effective_contribution_reflected",
    "learning_adoption_status_present",
    "self_directed_probe_surface_present",
    "self_directed_probe_status_present",
    "novel_task_acquisition_surface_present",
    "novel_task_acquisition_present",
    "subjective_window_threshold_enforced",
    "subjective_complete_case_requires_all_strict_thresholds",
    "compatibility_completion_artifact_present",
    "compatibility_completion_scope_is_compatibility_only",
    "legacy_sovereign_alias_not_used_as_active_logic",
    "autonomous_learning_current_historical_counts_distinct",
    "autonomous_learning_current_counts_consistent",
    "autonomous_learning_verified_positive_semantics_consistent",
    "autonomous_learning_summary_matches_count_contract",
    "latest_overview_headline_uses_worker_decision_surface",
    "docs_aligned_with_governed_worker_semantics",
    "self_authored_positive_closure_threshold_enforced",
    "novel_task_window_threshold_enforced",
    "self_directed_probe_window_threshold_enforced",
    "self_authored_origin_ratio_enforced",
    "no_stale_required_next_actions_when_complete",
    "security_constitution_zero_violations_enforced",
    "rollback_readiness_required_for_compatibility_complete",
    "compatibility_complete_requires_all_supporting_artifacts",
    "public_hygiene_no_unknown_memory_type",
    "public_hygiene_validation_refs_present",
    "public_hygiene_no_blank_task_outcome_status",
    "public_hygiene_no_raw_uuid_titles",
    "public_hygiene_iso8601_timestamps",
  ].forEach((id) => {
    assert(evalStatus.checks.some((entry) => entry.id === id && entry.status === "PASS"), `memory eval public status must pass check: ${id}`);
  });

  const openaiLane = JSON.parse(fs.readFileSync(path.join(outputRoot, "openai_primary_lane_projection.json"), "utf8"));
  assert(openaiLane.canonicalCounts.lessonCount >= 1, "openai lane projection must derive lesson counts from canonical graph");
  assert.strictEqual(openaiLane.compatibilityState.gateStatus, "PASS", "openai lane projection must preserve compatibility gate status");
  assert.strictEqual(openaiLane.canonicalCounts.derivedFromCanonicalStore, true, "openai lane projection must declare canonical derivation");
  assert(openaiLane.canonicalCounts.observationCount > 0, "openai lane projection must expose real observation counts");
  assert(openaiLane.canonicalCounts.causalUsageCount > 0, "openai lane projection must expose causal usage");
  assert(Array.isArray(openaiLane.recentCausalEffects) && openaiLane.recentCausalEffects.length > 0, "openai lane projection must expose recent causal effects");

  const anthropicLane = JSON.parse(fs.readFileSync(path.join(outputRoot, "anthropic_secondary_lane_projection.json"), "utf8"));
  assert(anthropicLane.canonicalCounts.lessonCount >= 1, "anthropic lane projection must derive lesson counts from canonical graph");
  assert.strictEqual(anthropicLane.compatibilityState.observationStatus, "disabled", "anthropic lane projection must preserve compatibility observation status");
  assert.strictEqual(anthropicLane.canonicalCounts.derivedFromCanonicalStore, true, "anthropic lane projection must declare canonical derivation");
  if ((anthropicLane.canonicalCounts.consideredForPackCount || 0) > 0) {
    assert(Array.isArray(anthropicLane.recentAdvisoryEffects) && anthropicLane.recentAdvisoryEffects.length > 0, "anthropic lane must expose advisory effects when considered for pack");
  } else {
    assert.strictEqual(anthropicLane.canonicalCounts.consideredForPackCount, 0, "anthropic lane considered count must drop to zero when no advisory trace exists");
  }

  const readiness = JSON.parse(fs.readFileSync(path.join(readinessRoot, "latest_readiness.json"), "utf8"));
  assert.strictEqual(readiness.profile, "agi_v1", "agi readiness latest json must expose agi_v1 profile");
  assert.strictEqual(readiness.breadthSemantics.mode, "repo_coverage_breadth", "agi readiness latest json must expose repo-wide breadth semantics");
  assert.strictEqual(typeof readiness.evaluatedBreadth, "number", "agi readiness latest json must expose evaluated breadth");
  assert.strictEqual(typeof readiness.supportedCoverageBreadth, "number", "agi readiness latest json must expose repo-wide supported coverage breadth");
  assert.strictEqual(typeof readiness.stableCoverageBreadth, "number", "agi readiness latest json must expose stable coverage breadth");
  assert(readiness.stableCoverageBreadth <= readiness.supportedCoverageBreadth, "stable coverage breadth must not exceed supported coverage breadth");
  assert(Array.isArray(readiness.failedFamilies), "agi readiness latest json must expose failed coverage families");
  if (readiness.failedFamilies.length) {
    assert(readiness.supportedCoverageBreadth < 1, "coverage failures must prevent repo-wide supported coverage breadth from appearing as 1.0");
  }
  assert.strictEqual(readiness.promotionComparisonMode, "self_snapshot", "same incumbent/challenger readiness must be marked as self_snapshot");
  assert.strictEqual(readiness.distinctComparison, false, "same incumbent/challenger readiness must not be marked as distinctComparison");
  assert.strictEqual(readiness.promotionInterpretation, "not_a_distinct_incumbent_comparison", "self snapshot readiness must explicitly state non-distinct comparison semantics");
  assert.strictEqual(readiness.incumbentVsChallenger.promote, null, "self snapshot readiness must not surface a distinct-comparison promote boolean");
  assert(Array.isArray(readiness.consistencyChecks) && readiness.consistencyChecks.every((entry) => entry.status === "PASS"), "readiness latest json must expose passing consistency checks");
  assert.strictEqual(typeof readiness.internalGovernedScore, "number", "readiness latest json must expose the internal governed score");
  assert.strictEqual(typeof readiness.externallyAuditableScore, "number", "readiness latest json must expose the externally auditable score");
  assert(readiness.displayFinalScore <= readiness.rawFinalScore, "display final score must not exceed the raw final score");
  assert.strictEqual(readiness.internalGovernedScore, readiness.rawFinalScore, "internal governed score must preserve the raw capability score");
  assert.strictEqual(readiness.displayFinalScore, readiness.externallyAuditableScore, "display final score must follow the externally auditable score");
  assert(readiness.scoreViews && readiness.scoreViews.displayScoreSource === "externallyAuditableScore", "readiness latest json must document the display score source");
  if (readiness.scoreViews && (readiness.scoreViews.evidenceDebtPresent || readiness.scoreViews.operationallyComplete === false)) {
    assert(readiness.displayFinalScore < readiness.rawFinalScore, "display final score must be penalized when evidence debt or incomplete operational closure remains");
  }
  assert.strictEqual(readiness.robustnessBreakdownPath, "output/agi_readiness/robustness_breakdown.json", "latest readiness must point at the tracked robustness breakdown artifact");
  assert.strictEqual(typeof readiness.autonomousLearningStatusPath, "string", "readiness must expose autonomous learning path");
  assert.strictEqual(typeof readiness.causalLearningTracePath, "string", "readiness must expose causal learning trace path");
  assert.strictEqual(typeof readiness.distinctImprovementLineagePath, "string", "readiness must expose distinct lineage path");
  assert.strictEqual(typeof readiness.continuityDebtPath, "string", "readiness must expose continuity debt path");
  assert.strictEqual(typeof readiness.robustnessRemediationStatusPath, "string", "readiness must expose robustness remediation status path");
  assert.strictEqual(typeof readiness.goalCompletionStatusPath, "string", "readiness must expose goal completion status path");

  const coverage = JSON.parse(fs.readFileSync(path.join(readinessRoot, "domain_coverage_matrix.json"), "utf8"));
  assert(Array.isArray(coverage.rows) && coverage.rows.some((row) => row.familyId === "deterministic_code"), "domain coverage matrix must expose deterministic_code coverage");
  const targetFamilies = ["web_creative", "workflow_execution", "evaluation_review", "tool_use_browser_like"];
  const evidencedFamilies = coverage.rows.filter((row) => targetFamilies.includes(row.familyId) && (row.lastSuccessfulTask || row.lastFailedTask));
  assert(evidencedFamilies.length >= 3, "domain coverage matrix must expose public-safe evidence for at least three target breadth families");
  assert(coverage.rows.every((row) => ["no_evidence", "passing_evidence", "unstable", "stable"].includes(String(row.stabilityStatus || ""))), "coverage rows must expose stability status");
  assert(coverage.rows.every((row) => typeof row.stableCovered === "boolean"), "coverage rows must expose stableCovered");
  assert(coverage.rows.every((row) => Number.isFinite(Number(row.stabilityWindowSize))), "coverage rows must expose stabilityWindowSize");
  assert(coverage.rows.every((row) => Array.isArray(row.recentWindowScores)), "coverage rows must expose recentWindowScores");
  assert(coverage.rows.every((row) => Array.isArray(row.recentWindowOutcomes)), "coverage rows must expose recentWindowOutcomes");
  assert(coverage.rows.every((row) => typeof row.coverageRegressed === "boolean"), "coverage rows must expose coverageRegressed");
  assert(coverage.rows.every((row) => typeof row.nextCoverageAction === "string"), "coverage rows must expose nextCoverageAction");
  const stableCoverageMatrix = JSON.parse(fs.readFileSync(path.join(readinessRoot, "stable_coverage_matrix.json"), "utf8"));
  assert.strictEqual(stableCoverageMatrix.schema, "agi-readiness-stable-coverage-matrix.v1", "stable coverage matrix must expose expected schema");
  assert(Array.isArray(stableCoverageMatrix.rows) && stableCoverageMatrix.rows.length === coverage.rows.length, "stable coverage matrix must mirror coverage rows");
  const stableCoverageTrend = JSON.parse(fs.readFileSync(path.join(readinessRoot, "stable_coverage_trend.json"), "utf8"));
  assert.strictEqual(stableCoverageTrend.schema, "agi-readiness-stable-coverage-trend.v1", "stable coverage trend must expose expected schema");
  assert(Array.isArray(stableCoverageTrend.entries) && stableCoverageTrend.entries.length > 0, "stable coverage trend must expose entries");

  const blockedReasons = JSON.parse(fs.readFileSync(path.join(readinessRoot, "blocked_reasons.json"), "utf8"));
  assert(Array.isArray(blockedReasons.reasons), "blocked reasons must remain structured");
  if (readiness.failedFamilies.length) {
    assert(blockedReasons.reasons.some((reason) => reason.includes("breadth coverage incomplete across supported families")), "blocked reasons must reflect coverage failures when families still fail");
  }
  assert(!blockedReasons.reasons.includes("challenger_strictly_beats_incumbent_under_fail_closed_rule"), "self snapshot blocked reasons must not surface distinct-comparison promotion language");

  const promotionTrend = JSON.parse(fs.readFileSync(path.join(readinessRoot, "promotion_trend.json"), "utf8"));
  assert(Array.isArray(promotionTrend.entries) && promotionTrend.entries.length >= 1, "promotion trend must expose at least one entry");
  assert(promotionTrend.entries.every((entry) => typeof entry.comparisonMode === "string" && typeof entry.distinctComparison === "boolean"), "promotion trend must expose comparison semantics for every entry");
  assert(promotionTrend.entries.some((entry) => entry.comparisonMode === "self_snapshot"), "promotion trend must preserve self_snapshot comparison semantics");
  assert(promotionTrend.entries.every((entry) => entry.comparisonMode !== "self_snapshot" || entry.promote == null || entry.legacySemantics === true), "self snapshot trend entries must not advertise distinct promotion");

  const distinctLineage = JSON.parse(fs.readFileSync(path.join(readinessRoot, "distinct_improvement_lineage.json"), "utf8"));
  assert(Array.isArray(distinctLineage.entries) && distinctLineage.entries.length >= 3, "distinct improvement lineage must expose at least three entries");
  assert(distinctLineage.entries.some((entry) => entry.comparisonMode === "distinct_comparison" && entry.promote === true), "distinct lineage must include a promoted comparison");
  assert(distinctLineage.entries.some((entry) => entry.comparisonMode === "distinct_comparison" && entry.promote !== true), "distinct lineage must include a non-promoted distinct comparison");
  assert(distinctLineage.entries.every((entry) => entry.comparisonMode !== "self_snapshot" || entry.promote == null), "self snapshot lineage entries must not appear as wins");
  assert(distinctLineage.entries.every((entry) => Number.isFinite(Number(entry.continuityDebtDelta))), "distinct lineage entries must expose continuityDebtDelta");
  assert(distinctLineage.entries.every((entry) => typeof entry.robustnessDeltaByCategory === "object"), "distinct lineage entries must expose robustnessDeltaByCategory");
  assert(distinctLineage.entries.every((entry) => Number.isFinite(Number(entry.causalSupportCount))), "distinct lineage entries must expose causalSupportCount");
  assert(distinctLineage.entries.every((entry) => Number.isFinite(Number(entry.causalHarmCount))), "distinct lineage entries must expose causalHarmCount");

  const bottlenecks = JSON.parse(fs.readFileSync(path.join(readinessRoot, "next_bottlenecks.json"), "utf8"));
  assert(Array.isArray(bottlenecks.items) && bottlenecks.items.length >= 1, "next bottlenecks must expose at least one bottleneck");
  if (readiness.failedFamilies.length) {
    assert(bottlenecks.items.some((entry) => String(entry.summary).includes("breadth coverage incomplete across supported families")), "next bottlenecks must reflect coverage failures");
  }
  assert(!bottlenecks.items.some((entry) => entry.source === "memory_eval"), "passing memory eval must not remain in next bottlenecks");
  assert(!bottlenecks.items.some((entry) => String(entry.summary) === "worker completion companion diverges from the worker headline or its background readiness basis"), "next bottlenecks must not retain a stale worker-companion divergence blocker");

  const autonomousLearning = JSON.parse(fs.readFileSync(path.join(readinessRoot, "autonomous_learning_status.json"), "utf8"));
  [
    "currentQueuedCount",
    "currentRunningCount",
    "currentBlockedCount",
    "currentInsufficientEvidenceCount",
    "historicalQueuedCount",
    "historicalRunningCount",
    "historicalBlockedCount",
    "historicalInsufficientEvidenceCount",
    "currentVerifiedPositiveCount",
    "historicalVerifiedPositiveCount",
  ].forEach((field) => assert(Number.isFinite(Number(autonomousLearning[field])), `autonomous learning must expose ${field}`));
  assert.strictEqual(autonomousLearning.exportSessionId, exportSessionId, "autonomous learning artifact must carry the shared exportSessionId");
  assert(autonomousLearning.historicalVerifiedPositiveCount >= 0, "historical verified positive count must be non-negative");
  assert(Array.isArray(autonomousLearning.entries) && autonomousLearning.entries.length > 0, "autonomous learning status must expose entries");
  assert(autonomousLearning.entries.some((entry) => ["running", "passed"].includes(String(entry.status))), "autonomous learning status must expose running or passed items");
  const passedVerifiedPositiveEntries = autonomousLearning.entries.filter((entry) => String(entry.status) === "passed" && String(entry.remediationEffect) === "verified_positive");
  assert(passedVerifiedPositiveEntries.length >= 1, "fixture export must expose a passed verified-positive remediation");
  assert.deepStrictEqual(autonomousLearning.countSemantics, expectedAutonomousLearningCountSemantics(), "autonomous learning artifact must expose the explicit count semantics contract");
  const autonomousLearningEntryCounts = summarizeAutonomousLearningEntries(autonomousLearning.entries);
  assert.strictEqual(autonomousLearning.currentQueuedCount, autonomousLearningEntryCounts.queued, "current queued count must equal current-session queued entries");
  assert.strictEqual(autonomousLearning.currentRunningCount, autonomousLearningEntryCounts.running, "current running count must equal current-session running entries");
  assert.strictEqual(autonomousLearning.currentBlockedCount, autonomousLearningEntryCounts.blocked, "current blocked count must equal current-session blocked entries");
  assert.strictEqual(autonomousLearning.currentInsufficientEvidenceCount, autonomousLearningEntryCounts.insufficientEvidenceCount, "current insufficient-evidence count must equal current-session insufficient-evidence entries");
  assert.strictEqual(autonomousLearning.currentVerifiedPositiveCount, autonomousLearningEntryCounts.verifiedPositiveCount, "current verified-positive count must equal current-session verified-positive entries");
  assert.strictEqual(autonomousLearning.summary.queued, autonomousLearning.currentQueuedCount, "summary queued must mirror currentQueuedCount");
  assert.strictEqual(autonomousLearning.summary.running, autonomousLearning.currentRunningCount, "summary running must mirror currentRunningCount");
  assert.strictEqual(autonomousLearning.summary.blocked, autonomousLearning.currentBlockedCount, "summary blocked must mirror currentBlockedCount");
  assert.strictEqual(autonomousLearning.summary.insufficientEvidenceCount, autonomousLearning.currentInsufficientEvidenceCount, "summary insufficientEvidenceCount must mirror currentInsufficientEvidenceCount");
  assert.strictEqual(autonomousLearning.summary.verifiedPositive, autonomousLearning.currentVerifiedPositiveCount, "summary verifiedPositive must mirror currentVerifiedPositiveCount");
  assert(autonomousLearning.gateDecisionCounts && typeof autonomousLearning.gateDecisionCounts === "object", "autonomous learning must expose gateDecisionCounts");
  assert.strictEqual(autonomousLearning.gateDecisionCounts.scope, "completion_gate_consumed_subset", "autonomous learning gateDecisionCounts must expose completion-gate scope");
  assert.strictEqual(autonomousLearning.gateDecisionCounts.sourceRule, "exclude_meta_completion_entries_via_isMetaCompletionAgendaEntry", "autonomous learning gateDecisionCounts must expose the exclusion rule");
  assert(Number.isFinite(Number(autonomousLearning.gateDecisionCounts.running)), "autonomous learning gateDecisionCounts must expose running");
  assert(Number.isFinite(Number(autonomousLearning.gateDecisionCounts.blocked)), "autonomous learning gateDecisionCounts must expose blocked");
  assert(Number.isFinite(Number(autonomousLearning.gateDecisionCounts.insufficientEvidenceCount)), "autonomous learning gateDecisionCounts must expose insufficientEvidenceCount");
  assert.strictEqual(workerCompletionStatus.gateInsufficientEvidenceCount, autonomousLearning.gateDecisionCounts.insufficientEvidenceCount, "worker completion companion gate insufficient-evidence count must stay aligned with autonomous learning gate counts");
  assert(autonomousLearning.gateDecisionCounts.supportingCurrentCounts && typeof autonomousLearning.gateDecisionCounts.supportingCurrentCounts === "object", "autonomous learning gateDecisionCounts must expose supportingCurrentCounts");
  assert.strictEqual(autonomousLearning.gateDecisionCounts.supportingCurrentCounts.running, autonomousLearning.currentRunningCount, "autonomous learning gate supporting running count must mirror currentRunningCount");
  assert.strictEqual(autonomousLearning.gateDecisionCounts.supportingCurrentCounts.blocked, autonomousLearning.currentBlockedCount, "autonomous learning gate supporting blocked count must mirror currentBlockedCount");
  assert.strictEqual(autonomousLearning.gateDecisionCounts.supportingCurrentCounts.insufficientEvidenceCount, autonomousLearning.currentInsufficientEvidenceCount, "autonomous learning gate supporting insufficient-evidence count must mirror currentInsufficientEvidenceCount");
  assert.strictEqual(
    autonomousLearning.gateDecisionCounts.excludedMetaCompletionCounts.running,
    autonomousLearning.currentRunningCount - autonomousLearning.gateDecisionCounts.running,
    "autonomous learning excluded running count must explain the gap between supporting and gate counts"
  );
  assert.strictEqual(
    autonomousLearning.gateDecisionCounts.excludedMetaCompletionCounts.blocked,
    autonomousLearning.currentBlockedCount - autonomousLearning.gateDecisionCounts.blocked,
    "autonomous learning excluded blocked count must explain the gap between supporting and gate counts"
  );
  assert.strictEqual(
    autonomousLearning.gateDecisionCounts.excludedMetaCompletionCounts.insufficientEvidenceCount,
    autonomousLearning.currentInsufficientEvidenceCount - autonomousLearning.gateDecisionCounts.insufficientEvidenceCount,
    "autonomous learning excluded insufficient-evidence count must explain the gap between supporting and gate counts"
  );
  assert(Number.isFinite(Number(autonomousLearning.summary.verifiedPositive)), "autonomous learning summary must expose verifiedPositive");
  assert(Number.isFinite(Number(autonomousLearning.summary.verifiedNeutral)), "autonomous learning summary must expose verifiedNeutral");
  assert(Number.isFinite(Number(autonomousLearning.summary.verifiedNegative)), "autonomous learning summary must expose verifiedNegative");
  assert(Number.isFinite(Number(autonomousLearning.summary.verifiedHarmful)), "autonomous learning summary must expose verifiedHarmful");
  assert(Number.isFinite(Number(autonomousLearning.summary.insufficientEvidence)), "autonomous learning summary must expose insufficientEvidence");
  assert(!autonomousLearning.entries.some((entry) => entry.source === "memory_eval"), "passing memory eval must not contribute blocked autonomous-learning agenda items");
  assert(Number.isFinite(Number(readiness.scoreViews.debtSignals.blockedAgendaCount)), "readiness debt signals must expose blockedAgendaCount");
  assert(Number.isFinite(Number(readiness.scoreViews.debtSignals.insufficientEvidenceCount)), "readiness debt signals must expose insufficientEvidenceCount");

  const sameSessionHistoricalVerifiedPositive = autonomousLearning.historicalVerifiedPositiveCount;
  exported = exportGovernedMemoryPublicArtifacts({ workspaceRoot: tempRoot });
  const autonomousLearningSecondPass = JSON.parse(fs.readFileSync(path.join(readinessRoot, "autonomous_learning_status.json"), "utf8"));
  assert.strictEqual(autonomousLearningSecondPass.exportSessionId, autonomousLearning.exportSessionId, "same export session rerender must keep the autonomous learning exportSessionId");
  assert.strictEqual(autonomousLearningSecondPass.summary.verifiedPositive, autonomousLearningSecondPass.currentVerifiedPositiveCount, "same export session rerender must keep summary verifiedPositive aligned with currentVerifiedPositiveCount");
  assert.strictEqual(autonomousLearningSecondPass.historicalVerifiedPositiveCount, sameSessionHistoricalVerifiedPositive, "same export session rerender must not roll current verified-positive counts into history");

  writeJson(path.join(readinessRoot, "autonomous_learning_status.json"), {
    schema: "governed-autonomous-learning-status-public.v1",
    generatedAt: "2026-04-01T00:00:00.000Z",
    exportSessionId: "export_previous_window",
    scope: "autonomous_learning_supporting",
    workspaceId: autonomousLearning.workspaceId,
    countSemantics: expectedAutonomousLearningCountSemantics(),
    currentQueuedCount: 1,
    currentRunningCount: 0,
    currentBlockedCount: 0,
    currentInsufficientEvidenceCount: 0,
    currentVerifiedPositiveCount: 4,
    historicalQueuedCount: 2,
    historicalRunningCount: 1,
    historicalBlockedCount: 0,
    historicalInsufficientEvidenceCount: 0,
    historicalVerifiedPositiveCount: 3,
    summary: {
      queued: 1,
      running: 0,
      blocked: 0,
      passed: 4,
      failed: 0,
      revoked: 0,
      verifiedPositive: 4,
      verifiedNeutral: 0,
      verifiedNegative: 0,
      verifiedHarmful: 0,
      insufficientEvidence: 0,
      blockedCount: 0,
      insufficientEvidenceCount: 0,
      selfDirectedCount: 4,
      verifiedPositiveSelfDirectedCount: 4,
      novelProbeCount: 4,
      novelProbePositiveCount: 4,
    },
    entries: [
      { agendaId: "agenda-prev-1", status: "passed", remediationEffect: "verified_positive", source: "autonomous_learning", proposedEvalProbe: "probe:prev-1", lastUpdatedAt: "2026-04-01T00:00:00.000Z" },
      { agendaId: "agenda-prev-2", status: "passed", remediationEffect: "verified_positive", source: "autonomous_learning", proposedEvalProbe: "probe:prev-2", lastUpdatedAt: "2026-04-01T00:10:00.000Z" },
      { agendaId: "agenda-prev-3", status: "passed", remediationEffect: "verified_positive", source: "autonomous_learning", proposedEvalProbe: "probe:prev-3", lastUpdatedAt: "2026-04-01T00:20:00.000Z" },
      { agendaId: "agenda-prev-4", status: "passed", remediationEffect: "verified_positive", source: "autonomous_learning", proposedEvalProbe: "probe:prev-4", lastUpdatedAt: "2026-04-01T00:30:00.000Z" },
    ],
  });
  exported = exportGovernedMemoryPublicArtifacts({ workspaceRoot: tempRoot });
  const autonomousLearningWithHistoricalCarry = JSON.parse(fs.readFileSync(path.join(readinessRoot, "autonomous_learning_status.json"), "utf8"));
  assert.strictEqual(autonomousLearningWithHistoricalCarry.historicalVerifiedPositiveCount, 7, "new export session must carry prior current verified-positive counts into history");
  assert.strictEqual(autonomousLearningWithHistoricalCarry.summary.verifiedPositive, autonomousLearningWithHistoricalCarry.currentVerifiedPositiveCount, "historical carry must preserve summary/current verified-positive equality");

  const docsText = [
    fs.readFileSync(path.join(tempRoot, "docs", "CURRENT_ARCHITECTURE.md"), "utf8"),
    fs.readFileSync(path.join(tempRoot, "docs", "GOVERNED_AUTONOMOUS_LEARNING_LOOP.md"), "utf8"),
    fs.readFileSync(path.join(tempRoot, "docs", "AGI_OPERATIONAL_COMPLETION.md"), "utf8"),
  ].join("\n");
  assert(/summary\.verifiedPositive/i.test(docsText), "docs must mention summary.verifiedPositive semantics");
  assert(/currentVerifiedPositiveCount/i.test(docsText), "docs must mention currentVerifiedPositiveCount");
  assert(/historicalVerifiedPositiveCount/i.test(docsText), "docs must mention historicalVerifiedPositiveCount");

  const causalLearning = JSON.parse(fs.readFileSync(path.join(readinessRoot, "causal_learning_trace.json"), "utf8"));
  assert(Array.isArray(causalLearning.traces) && causalLearning.traces.length > 0, "causal learning trace must expose traces");
  assert(causalLearning.traces.some((entry) => ["direct", "plausible", "weak"].includes(String(entry.causalConfidence))), "causal learning trace must expose causal confidence");
  const causalRegressionAlerts = JSON.parse(fs.readFileSync(path.join(readinessRoot, "causal_regression_alerts.json"), "utf8"));
  assert.strictEqual(causalRegressionAlerts.schema, "agi-readiness-causal-regression-alerts.v1", "causal regression alerts must expose expected schema");
  assert(Array.isArray(causalRegressionAlerts.alerts), "causal regression alerts must expose alerts");

  const robustness = JSON.parse(fs.readFileSync(path.join(readinessRoot, "robustness_breakdown.json"), "utf8"));
  assert.strictEqual(robustness.schema, "agi-readiness-robustness-breakdown.v1", "robustness breakdown must expose the expected schema");
  assert(Array.isArray(robustness.categories) && robustness.categories.some((entry) => entry.status === "observed"), "robustness breakdown must expose observed live evidence");
  assert(robustness.categories.every((entry) => typeof entry.updatedAt === "undefined" || String(entry.updatedAt).endsWith("Z")), "robustness breakdown timestamps must be ISO-8601 when present");

  const remediationStatus = JSON.parse(fs.readFileSync(path.join(readinessRoot, "robustness_remediation_status.json"), "utf8"));
  assert(Array.isArray(remediationStatus.categories) && remediationStatus.categories.length > 0, "robustness remediation status must expose categories");
  const ambiguous = remediationStatus.categories.find((entry) => entry.categoryId === "ambiguous_instruction");
  assert(ambiguous && ambiguous.evidenceCount > 0, "ambiguous instruction remediation must not remain no-evidence");

  const remediationTrend = JSON.parse(fs.readFileSync(path.join(readinessRoot, "robustness_remediation_trend.json"), "utf8"));
  assert(Array.isArray(remediationTrend.entries) && remediationTrend.entries.length > 0, "robustness remediation trend must expose entries");
  const remediationBacklog = JSON.parse(fs.readFileSync(path.join(readinessRoot, "robustness_remediation_backlog.json"), "utf8"));
  assert.strictEqual(remediationBacklog.schema, "agi-readiness-robustness-remediation-backlog.v1", "robustness remediation backlog must expose expected schema");
  assert(Array.isArray(remediationBacklog.items), "robustness remediation backlog must expose items");
  const remediationEffects = JSON.parse(fs.readFileSync(path.join(readinessRoot, "robustness_remediation_effects.json"), "utf8"));
  assert.strictEqual(remediationEffects.schema, "agi-readiness-robustness-remediation-effects.v1", "robustness remediation effects must expose expected schema");
  assert(Array.isArray(remediationEffects.categories), "robustness remediation effects must expose categories");

  const continuity = JSON.parse(fs.readFileSync(path.join(continuityRoot, "latest_continuity.json"), "utf8"));
  assert(Number.isFinite(Number(continuity.handoffCount)) && continuity.handoffCount >= 1, "continuity public summary must expose handoff count");
  assert(continuity.roleMemoryPackSections && typeof continuity.roleMemoryPackSections === "object", "continuity public summary must expose role memory pack sections");
  assert(Object.prototype.hasOwnProperty.call(continuity.roleMemoryPackSections, "reviewer"), "continuity public summary must expose reviewer memory pack sections");
  assert(Object.prototype.hasOwnProperty.call(continuity.roleMemoryPackSections, "tester"), "continuity public summary must expose tester memory pack sections");
  assert(continuity.horizon && typeof continuity.horizon === "object" && Object.keys(continuity.horizon).length > 0, "continuity public summary must expose horizon evidence");

  const continuityDebt = JSON.parse(fs.readFileSync(path.join(continuityRoot, "continuity_debt.json"), "utf8"));
  assert(Array.isArray(continuityDebt.items), "continuity debt must expose items");
  assert(continuityDebt.items.every((entry) => ["missing_evidence", "verifier_failed", "dependency_unresolved", "operator_abandoned", "policy_blocked"].includes(String(entry.blockerType))), "continuity debt items must expose normalized blocker types");
  assert(continuityDebt.summary && Number.isFinite(Number(continuityDebt.summary.openDebtCount)), "continuity debt must expose summary");
  assert(continuityDebt.items.every((entry) => typeof entry.debtId === "string" && entry.debtId.length > 0), "continuity debt items must expose debtId");
  assert(continuityDebt.items.every((entry) => typeof entry.requiredCloseoutAction === "string"), "continuity debt items must expose requiredCloseoutAction");
  assert(continuityDebt.items.every((entry) => typeof entry.autoCloseEligible === "boolean"), "continuity debt items must expose autoCloseEligible");
  assert(continuityDebt.items.every((entry) => typeof entry.publicSummary === "string" && entry.publicSummary.length > 0), "continuity debt items must expose publicSummary");
  const continuityDebtTrend = JSON.parse(fs.readFileSync(path.join(continuityRoot, "continuity_debt_trend.json"), "utf8"));
  assert.strictEqual(continuityDebtTrend.schema, "continuity-debt-trend.v1", "continuity debt trend must expose expected schema");
  assert(Array.isArray(continuityDebtTrend.entries) && continuityDebtTrend.entries.length > 0, "continuity debt trend must expose entries");
  const continuityCloseoutEffects = JSON.parse(fs.readFileSync(path.join(continuityRoot, "continuity_closeout_effects.json"), "utf8"));
  assert.strictEqual(continuityCloseoutEffects.schema, "continuity-closeout-effects.v1", "continuity closeout effects must expose expected schema");
  assert(Array.isArray(continuityCloseoutEffects.items), "continuity closeout effects must expose items");

  const goalCompletion = JSON.parse(fs.readFileSync(path.join(readinessRoot, "goal_completion_status.json"), "utf8"));
  assert.strictEqual(goalCompletion.scope, "program_readiness", "goal completion artifact must expose program_readiness scope");
  assert.strictEqual(goalCompletion.exportSessionId, exportSessionId, "goal completion artifact must carry the shared exportSessionId");
  assert.strictEqual(goalCompletion.schema, "agi-operational-completion-status.v1", "goal completion artifact must expose expected schema");
  assert.strictEqual(goalCompletion.goalStatus, "NOT_YET", "seeded live-goal fixture must remain NOT_YET");
  assert(Array.isArray(goalCompletion.whyNotYet) && goalCompletion.whyNotYet.length > 0, "goal completion artifact must explain why it is not yet complete");
  assert(Array.isArray(goalCompletion.requiredNextActions) && goalCompletion.requiredNextActions.length > 0, "goal completion artifact must expose required next actions");
  assert(!goalCompletion.requiredNextActions.includes("worker completion companion diverges from the worker headline or its background readiness basis"), "goal completion required next actions must not retain a stale worker-companion divergence blocker");
  assert(!goalCompletion.requiredNextActions.some((action) => /history-aware counts consistently/i.test(String(action))), "goal completion required next actions must not retain stale history-aware-count noise");
  assert(!goalCompletion.requiredNextActions.some((action) => /completion export durability/i.test(String(action))), "goal completion required next actions must not retain subjective export-durability noise");
  assert(!goalCompletion.requiredNextActions.some((action) => /below subjective threshold/i.test(String(action))), "goal completion required next actions must not surface subjective-threshold phrasing");
  assert(!goalCompletion.requiredNextActions.some((action) => /weakest family is g[_ ]?breadth/i.test(String(action))), "goal completion required next actions must normalize weakest-family summaries into operational actions");
  assert.strictEqual(typeof goalCompletion.completionVersion, "string", "goal completion artifact must expose completionVersion");
  assert.strictEqual(typeof goalCompletion.decisionBasis, "string", "goal completion artifact must expose decisionBasis");
  assert(Array.isArray(goalCompletion.failedCriteria) && goalCompletion.failedCriteria.length > 0, "goal completion artifact must expose failedCriteria");
  assert(Array.isArray(goalCompletion.passedCriteria), "goal completion artifact must expose passedCriteria");
  assert(Array.isArray(goalCompletion.supportingArtifacts) && goalCompletion.supportingArtifacts.length > 0, "goal completion artifact must expose supporting artifacts");
  assert(goalCompletion.lineageSummary && typeof goalCompletion.lineageSummary === "object", "goal completion artifact must expose lineageSummary");
  assert(goalCompletion.autonomousLearningSummary && typeof goalCompletion.autonomousLearningSummary === "object", "goal completion artifact must expose autonomousLearningSummary");
  assert(goalCompletion.runningAgendaDecisionBasis && typeof goalCompletion.runningAgendaDecisionBasis === "object", "goal completion artifact must expose runningAgendaDecisionBasis");
  assert.strictEqual(goalCompletion.currentValues.runningAgendaCount, autonomousLearning.gateDecisionCounts.running, "goal completion runningAgendaCount must use gateDecisionCounts.running");
  assert.strictEqual(goalCompletion.runningAgendaDecisionBasis.gateRunningAgendaCount, autonomousLearning.gateDecisionCounts.running, "goal completion running basis must expose gate running count");
  assert.strictEqual(goalCompletion.runningAgendaDecisionBasis.supportingCurrentRunningCount, autonomousLearning.currentRunningCount, "goal completion running basis must expose supporting current running count");
  assert.strictEqual(goalCompletion.runningAgendaDecisionBasis.gateBlockedAgendaCount, autonomousLearning.gateDecisionCounts.blocked, "goal completion running basis must expose gate blocked count");
  assert.strictEqual(goalCompletion.runningAgendaDecisionBasis.supportingCurrentBlockedCount, autonomousLearning.currentBlockedCount, "goal completion running basis must expose supporting current blocked count");
  assert.strictEqual(goalCompletion.runningAgendaDecisionBasis.gateInsufficientEvidenceCount, autonomousLearning.gateDecisionCounts.insufficientEvidenceCount, "goal completion running basis must expose gate insufficient-evidence count");
  assert.strictEqual(goalCompletion.runningAgendaDecisionBasis.supportingCurrentInsufficientEvidenceCount, autonomousLearning.currentInsufficientEvidenceCount, "goal completion running basis must expose supporting current insufficient-evidence count");
  assert.strictEqual(goalCompletion.runningAgendaDecisionBasis.excludedMetaCompletionBlockedCount, autonomousLearning.gateDecisionCounts.excludedMetaCompletionCounts.blocked, "goal completion running basis must expose excluded blocked delta");
  assert.strictEqual(goalCompletion.runningAgendaDecisionBasis.excludedMetaCompletionInsufficientEvidenceCount, autonomousLearning.gateDecisionCounts.excludedMetaCompletionCounts.insufficientEvidenceCount, "goal completion running basis must expose excluded insufficient-evidence delta");
  assert(goalCompletion.continuityDebtSummary && typeof goalCompletion.continuityDebtSummary === "object", "goal completion artifact must expose continuityDebtSummary");
  assert(goalCompletion.robustnessSummary && typeof goalCompletion.robustnessSummary === "object", "goal completion artifact must expose robustnessSummary");
  assert(goalCompletion.causalSafetySummary && typeof goalCompletion.causalSafetySummary === "object", "goal completion artifact must expose causalSafetySummary");
  assert(goalCompletion.history && Number.isFinite(Number(goalCompletion.history.consecutivePassingExports)), "goal completion artifact must expose goal history summary");
  assert.strictEqual(typeof goalCompletion.subjectiveGoalStatusPath, "string", "goal completion artifact must expose subjective companion path");
  assert.strictEqual(typeof goalCompletion.subjectiveGoalStatus, "string", "goal completion artifact must expose subjective goal status");
  assert.strictEqual(typeof goalCompletion.subjectiveCriteriaMet, "boolean", "goal completion artifact must expose subjective criteria state");
  assert(Array.isArray(goalCompletion.subjectiveFailedCriteria), "goal completion artifact must expose subjective failed criteria");
  assert(Array.isArray(goalCompletion.subjectiveWhyNotYet), "goal completion artifact must expose subjective why-not-yet reasons");
  assert(Number.isFinite(Number(goalCompletion.subjectiveCriteriaWindowPassCount)), "goal completion artifact must expose subjective criteria window count");
  assert(Number.isFinite(Number(goalCompletion.subjectiveCriteriaWindowSize)), "goal completion artifact must expose subjective criteria window size");
  assert.strictEqual(typeof goalCompletion.compatibilityCompletionStatusPath, "string", "goal completion artifact must expose compatibility companion path");
  assert.strictEqual(typeof goalCompletion.compatibilityCompletionStatus, "string", "goal completion artifact must expose compatibility completion status");
  assert.strictEqual(typeof goalCompletion.compatibilityCriteriaMet, "boolean", "goal completion artifact must expose compatibility criteria state");
  assert(Array.isArray(goalCompletion.compatibilityFailedCriteria), "goal completion artifact must expose compatibility failed criteria");
  assert(Array.isArray(goalCompletion.compatibilityWhyNotYet), "goal completion artifact must expose compatibility why-not-yet reasons");
  assert(Number.isFinite(Number(goalCompletion.compatibilityCriteriaWindowPassCount)), "goal completion artifact must expose compatibility criteria window count");
  assert(Number.isFinite(Number(goalCompletion.compatibilityCriteriaWindowSize)), "goal completion artifact must expose compatibility criteria window size");
  assert.strictEqual("sovereignGoalStatus" in goalCompletion, false, "goal completion artifact must not expose legacy sovereign status fields");
  assert.strictEqual("sovereignGoalWhyNotYetCount" in goalCompletion, false, "goal completion artifact must not expose legacy sovereign why-not-yet count");
  const openUnknownsRegister = JSON.parse(fs.readFileSync(path.join(readinessRoot, "open_unknowns_register.json"), "utf8"));
  assert(Array.isArray(openUnknownsRegister.items), "open unknowns register must expose items");
  assert(!openUnknownsRegister.items.some((entry) => String(entry && entry.summary) === "worker completion companion diverges from the worker headline or its background readiness basis"), "open unknowns register must not retain a stale worker-companion divergence blocker");

  const subjectiveGoal = JSON.parse(fs.readFileSync(path.join(readinessRoot, "subjective_goal_completion_status.json"), "utf8"));
  assert.strictEqual(subjectiveGoal.scope, "subjective_companion", "subjective goal artifact must expose subjective_companion scope");
  assert.strictEqual(subjectiveGoal.subjectiveDecisionBasis, "worker_centric_subjective_companion_gate", "subjective goal artifact must use worker-centric companion semantics");
  assert.strictEqual(subjectiveGoal.exportSessionId, exportSessionId, "subjective goal artifact must carry the shared exportSessionId");
  assert.strictEqual(subjectiveGoal.schema, "agi-subjective-goal-completion-status.v1", "subjective goal completion artifact must expose expected schema");
  assert.strictEqual(subjectiveGoal.operationalGoalStatus, goalCompletion.goalStatus, "subjective goal artifact must reference operational goal status");
  assert.strictEqual(subjectiveGoal.subjectiveGoalStatus, "NOT_YET", "seeded live subjective-goal fixture must remain NOT_YET");
  assert(Array.isArray(subjectiveGoal.subjectiveWhyNotYet) && subjectiveGoal.subjectiveWhyNotYet.length > 0, "subjective goal artifact must explain why it is not yet complete");
  assert(Array.isArray(subjectiveGoal.subjectiveFailedCriteria) && subjectiveGoal.subjectiveFailedCriteria.length > 0, "subjective goal artifact must expose failed criteria");
  assert(Array.isArray(subjectiveGoal.subjectivePassedCriteria), "subjective goal artifact must expose passed criteria");
  assert(subjectiveGoal.lineageSummary && typeof subjectiveGoal.lineageSummary === "object", "subjective goal artifact must expose lineage summary");
  assert(subjectiveGoal.learningAdoptionSummary && typeof subjectiveGoal.learningAdoptionSummary === "object", "subjective goal artifact must expose learning adoption summary");
  assert(subjectiveGoal.autonomousLearningSummary && typeof subjectiveGoal.autonomousLearningSummary === "object", "subjective goal artifact must expose autonomous learning summary");
  assert(subjectiveGoal.robustnessSummary && typeof subjectiveGoal.robustnessSummary === "object", "subjective goal artifact must expose robustness summary");
  assert(subjectiveGoal.continuitySummary && typeof subjectiveGoal.continuitySummary === "object", "subjective goal artifact must expose continuity summary");
  assert(subjectiveGoal.runningAgendaDecisionBasis && typeof subjectiveGoal.runningAgendaDecisionBasis === "object", "subjective goal artifact must expose runningAgendaDecisionBasis");
  assert.strictEqual(subjectiveGoal.subjectiveCurrentValues.runningAgendaCount, autonomousLearning.gateDecisionCounts.running, "subjective runningAgendaCount must use gateDecisionCounts.running");
  assert.strictEqual(subjectiveGoal.subjectiveCurrentValues.blockedAgendaCount, autonomousLearning.gateDecisionCounts.blocked, "subjective blockedAgendaCount must use gateDecisionCounts.blocked");
  assert(subjectiveGoal.subjectiveCurrentValues.insufficientEvidenceCount >= autonomousLearning.gateDecisionCounts.insufficientEvidenceCount, "subjective insufficient-evidence count must not undershoot the gate count");
  assert.strictEqual(subjectiveGoal.runningAgendaDecisionBasis.supportingCurrentRunningCount, autonomousLearning.currentRunningCount, "subjective running basis must expose supporting current running count");
  assert.strictEqual(subjectiveGoal.runningAgendaDecisionBasis.supportingCurrentBlockedCount, autonomousLearning.currentBlockedCount, "subjective running basis must expose supporting current blocked count");
  assert.strictEqual(subjectiveGoal.runningAgendaDecisionBasis.supportingCurrentInsufficientEvidenceCount, autonomousLearning.currentInsufficientEvidenceCount, "subjective running basis must expose supporting current insufficient-evidence count");
  assert.strictEqual(subjectiveGoal.runningAgendaDecisionBasis.gateInsufficientEvidenceCount, autonomousLearning.gateDecisionCounts.insufficientEvidenceCount, "subjective running basis must expose gate insufficient-evidence count");
  assert(subjectiveGoal.history && Number.isFinite(Number(subjectiveGoal.history.consecutivePassingExports)), "subjective goal artifact must expose history summary");

  const compatibilityGoal = JSON.parse(fs.readFileSync(path.join(readinessRoot, "compatibility_completion_status.json"), "utf8"));
  assert.strictEqual(compatibilityGoal.scope, "compatibility_layer", "compatibility goal artifact must expose compatibility_layer scope");
  assert.strictEqual(compatibilityGoal.exportSessionId, exportSessionId, "compatibility goal artifact must carry the shared exportSessionId");
  assert.strictEqual(compatibilityGoal.schema, "agi-compatibility-completion-status.v1", "compatibility completion artifact must expose expected schema");
  assert.strictEqual(typeof compatibilityGoal.status, "string", "compatibility completion artifact must expose status");
  assert(Array.isArray(compatibilityGoal.failedCriteria), "compatibility completion artifact must expose failed criteria");
  assert(Array.isArray(compatibilityGoal.whyNotYet), "compatibility completion artifact must expose why-not-yet reasons");
  assert(Array.isArray(compatibilityGoal.supportingArtifacts), "compatibility completion artifact must expose supporting artifacts");
  assert(compatibilityGoal.history && Number.isFinite(Number(compatibilityGoal.history.consecutivePassingExports)), "compatibility completion artifact must expose history summary");
  assert.strictEqual("legacyAlias" in compatibilityGoal, false, "compatibility completion artifact must not expose legacy sovereign alias metadata");

  const learningAdoptionStatus = JSON.parse(fs.readFileSync(path.join(readinessRoot, "learning_adoption_status.json"), "utf8"));
  assert.strictEqual(learningAdoptionStatus.schema, "agi-readiness-learning-adoption-status.v1", "learning adoption artifact must expose expected schema");
  assert.strictEqual(learningAdoptionStatus.primaryLaneKey, "openai_primary", "learning adoption artifact must name the primary lane");
  assert(Number.isFinite(Number(learningAdoptionStatus.selectedInLatestPackCount)), "learning adoption artifact must expose primary selected count");
  assert(Number.isFinite(Number(learningAdoptionStatus.consideredForPackCount)), "learning adoption artifact must expose primary considered count");
  assert(Number.isFinite(Number(learningAdoptionStatus.effectiveContributionCount)), "learning adoption artifact must expose primary effective contribution count");
  assert(Number.isFinite(Number(learningAdoptionStatus.likelyContributoryCount)), "learning adoption artifact must expose primary likely contributory count");
  assert(Number.isFinite(Number(learningAdoptionStatus.rolledBackAfterHarmCount)), "learning adoption artifact must expose primary rollback count");
  assert(learningAdoptionStatus.adoptionWindow && typeof learningAdoptionStatus.adoptionWindow === "object", "learning adoption artifact must expose adoptionWindow");
  assert(learningAdoptionStatus.requiredThresholds && typeof learningAdoptionStatus.requiredThresholds === "object", "learning adoption artifact must expose requiredThresholds");
  assert(learningAdoptionStatus.summary && typeof learningAdoptionStatus.summary === "object", "learning adoption artifact must expose summary");
  assert(learningAdoptionStatus.laneSummaries && typeof learningAdoptionStatus.laneSummaries === "object", "learning adoption artifact must expose lane summaries");
  assert.strictEqual(learningAdoptionStatus.exportSessionId, exportSessionId, "learning adoption artifact must carry the shared exportSessionId");

  const selfDirectedProbeStatus = JSON.parse(fs.readFileSync(path.join(readinessRoot, "self_directed_probe_status.json"), "utf8"));
  assert.strictEqual(selfDirectedProbeStatus.schema, "agi-readiness-self-directed-probe-status.v1", "self-directed probe artifact must expose expected schema");
  assert(Number.isFinite(Number(selfDirectedProbeStatus.probeCount)), "self-directed probe artifact must expose probeCount");
  assert(Number.isFinite(Number(selfDirectedProbeStatus.positiveProbeCount)), "self-directed probe artifact must expose positiveProbeCount");
  assert(Number.isFinite(Number(selfDirectedProbeStatus.negativeProbeCount)), "self-directed probe artifact must expose negativeProbeCount");
  assert(Number.isFinite(Number(selfDirectedProbeStatus.novelProbeCount)), "self-directed probe artifact must expose novelProbeCount");
  assert(Number.isFinite(Number(selfDirectedProbeStatus.novelPositiveCount)), "self-directed probe artifact must expose novelPositiveCount");
  assert(Array.isArray(selfDirectedProbeStatus.recentProbeFamilies), "self-directed probe artifact must expose recentProbeFamilies");
  assert(Array.isArray(selfDirectedProbeStatus.recentPositiveEvidenceRefs), "self-directed probe artifact must expose recentPositiveEvidenceRefs");
  assert(selfDirectedProbeStatus.currentSnapshot && typeof selfDirectedProbeStatus.currentSnapshot === "object", "self-directed probe artifact must expose currentSnapshot");
  assert(selfDirectedProbeStatus.effectiveHistoryAware && typeof selfDirectedProbeStatus.effectiveHistoryAware === "object", "self-directed probe artifact must expose effectiveHistoryAware");
  assert(selfDirectedProbeStatus.requiredThresholds && typeof selfDirectedProbeStatus.requiredThresholds === "object", "self-directed probe artifact must expose requiredThresholds");
  assert(selfDirectedProbeStatus.meetsThresholds && typeof selfDirectedProbeStatus.meetsThresholds === "object", "self-directed probe artifact must expose meetsThresholds");
  assert(selfDirectedProbeStatus.thresholdDecisionBasis && typeof selfDirectedProbeStatus.thresholdDecisionBasis === "object", "self-directed probe artifact must expose thresholdDecisionBasis");
  assert.strictEqual(selfDirectedProbeStatus.positiveProbeCount, selfDirectedProbeStatus.effectiveHistoryAware.positiveProbeCount, "self-directed probe top-level positive count must mirror effectiveHistoryAware");
  assert.strictEqual(selfDirectedProbeStatus.novelPositiveCount, selfDirectedProbeStatus.effectiveHistoryAware.novelPositiveCount, "self-directed probe top-level novel-positive count must mirror effectiveHistoryAware");
  assert(selfDirectedProbeStatus.currentSnapshot.positiveProbeCount <= selfDirectedProbeStatus.effectiveHistoryAware.positiveProbeCount, "effective probe count must be at least the current snapshot");
  assert(selfDirectedProbeStatus.currentSnapshot.novelPositiveCount <= selfDirectedProbeStatus.effectiveHistoryAware.novelPositiveCount, "effective novel-positive count must be at least the current snapshot");
  assert.strictEqual(selfDirectedProbeStatus.thresholdDecisionBasis.mode, "history_aware_effective_counts", "self-directed probe threshold basis must declare the history-aware mode");
  assert.strictEqual(selfDirectedProbeStatus.thresholdDecisionBasis.failClosed, true, "self-directed probe threshold basis must be fail-closed");
  assert.strictEqual(selfDirectedProbeStatus.thresholdDecisionBasis.historySourcePath, "output/agi_readiness/subjective_goal_completion_status.json", "self-directed probe threshold basis must expose the history source");
  assert.strictEqual(
    selfDirectedProbeStatus.effectiveHistoryAware.historyLift.positiveProbeCount,
    selfDirectedProbeStatus.effectiveHistoryAware.positiveProbeCount - selfDirectedProbeStatus.currentSnapshot.positiveProbeCount,
    "self-directed probe history lift must explain the positive-count uplift"
  );
  assert.strictEqual(
    selfDirectedProbeStatus.effectiveHistoryAware.historyLift.novelPositiveCount,
    selfDirectedProbeStatus.effectiveHistoryAware.novelPositiveCount - selfDirectedProbeStatus.currentSnapshot.novelPositiveCount,
    "self-directed probe history lift must explain the novel-positive uplift"
  );
  assert.strictEqual(
    selfDirectedProbeStatus.meetsThresholds.positiveProbeCount,
    selfDirectedProbeStatus.effectiveHistoryAware.positiveProbeCount >= selfDirectedProbeStatus.requiredThresholds.positiveProbeCount,
    "self-directed probe threshold evaluation must use the effective positive count"
  );
  assert.strictEqual(
    selfDirectedProbeStatus.meetsThresholds.novelPositiveCount,
    selfDirectedProbeStatus.effectiveHistoryAware.novelPositiveCount >= selfDirectedProbeStatus.requiredThresholds.novelPositiveCount,
    "self-directed probe threshold evaluation must use the effective novel-positive count"
  );
  assert.strictEqual(
    selfDirectedProbeStatus.meetsThresholds.insufficientEvidenceCount,
    selfDirectedProbeStatus.effectiveHistoryAware.insufficientEvidenceCount <= selfDirectedProbeStatus.requiredThresholds.maxInsufficientEvidenceCount,
    "self-directed probe threshold evaluation must use the effective insufficient-evidence count"
  );
  assert(selfDirectedProbeStatus.summary && typeof selfDirectedProbeStatus.summary === "object", "self-directed probe artifact must expose summary");
  assert.strictEqual(selfDirectedProbeStatus.exportSessionId, exportSessionId, "self-directed probe artifact must carry the shared exportSessionId");

  const novelTaskAcquisition = JSON.parse(fs.readFileSync(path.join(readinessRoot, "novel_task_acquisition.json"), "utf8"));
  assert.strictEqual(novelTaskAcquisition.schema, "agi-readiness-novel-task-acquisition.v1", "novel task acquisition artifact must expose expected schema");
  assert(Number.isFinite(Number(novelTaskAcquisition.novelFamilyCount)), "novel task acquisition artifact must expose novelFamilyCount");
  assert(Number.isFinite(Number(novelTaskAcquisition.novelTaskCount)), "novel task acquisition artifact must expose novelTaskCount");
  assert(Number.isFinite(Number(novelTaskAcquisition.positiveNovelTaskCount)), "novel task acquisition artifact must expose positiveNovelTaskCount");
  assert(Array.isArray(novelTaskAcquisition.recentNovelTasks), "novel task acquisition artifact must expose recentNovelTasks");
  assert(Array.isArray(novelTaskAcquisition.positiveEvidenceRefs), "novel task acquisition artifact must expose positiveEvidenceRefs");
  assert(novelTaskAcquisition.currentSnapshot && typeof novelTaskAcquisition.currentSnapshot === "object", "novel task acquisition artifact must expose currentSnapshot");
  assert(novelTaskAcquisition.effectiveHistoryAware && typeof novelTaskAcquisition.effectiveHistoryAware === "object", "novel task acquisition artifact must expose effectiveHistoryAware");
  assert(novelTaskAcquisition.requiredThresholds && typeof novelTaskAcquisition.requiredThresholds === "object", "novel task acquisition artifact must expose requiredThresholds");
  assert(novelTaskAcquisition.meetsThresholds && typeof novelTaskAcquisition.meetsThresholds === "object", "novel task acquisition artifact must expose meetsThresholds");
  assert(novelTaskAcquisition.thresholdDecisionBasis && typeof novelTaskAcquisition.thresholdDecisionBasis === "object", "novel task acquisition artifact must expose thresholdDecisionBasis");
  assert.strictEqual(novelTaskAcquisition.currentSnapshot.positiveNovelTaskCount, novelTaskAcquisition.effectiveHistoryAware.positiveNovelTaskCount, "novel task acquisition effective count must stay explicit when no history uplift is applied");
  assert.strictEqual(novelTaskAcquisition.positiveNovelTaskCount, novelTaskAcquisition.effectiveHistoryAware.positiveNovelTaskCount, "novel task acquisition top-level positive count must mirror effectiveHistoryAware");
  assert.strictEqual(novelTaskAcquisition.thresholdDecisionBasis.mode, "current_snapshot_no_history_uplift", "novel task acquisition threshold basis must declare the no-history-uplift mode");
  assert.strictEqual(novelTaskAcquisition.thresholdDecisionBasis.failClosed, true, "novel task acquisition threshold basis must be fail-closed");
  assert.strictEqual(novelTaskAcquisition.thresholdDecisionBasis.historySource, "none", "novel task acquisition threshold basis must declare that no history uplift is used");
  assert.strictEqual(novelTaskAcquisition.effectiveHistoryAware.historyAware, false, "novel task acquisition effective counts must explicitly reject history uplift");
  assert.strictEqual(novelTaskAcquisition.effectiveHistoryAware.historyLift.positiveNovelTaskCount, 0, "novel task acquisition history lift must stay zero when no history uplift is used");
  assert.strictEqual(
    novelTaskAcquisition.meetsThresholds.positiveNovelTaskCount,
    novelTaskAcquisition.effectiveHistoryAware.positiveNovelTaskCount >= novelTaskAcquisition.requiredThresholds.positiveNovelTaskCount,
    "novel task acquisition threshold evaluation must use the effective count"
  );
  assert(Array.isArray(novelTaskAcquisition.items), "novel task acquisition artifact must expose items");
  assert.strictEqual(novelTaskAcquisition.exportSessionId, exportSessionId, "novel task acquisition artifact must carry the shared exportSessionId");

  const sovereignGoal = JSON.parse(fs.readFileSync(path.join(readinessRoot, "sovereign_goal_completion_status.json"), "utf8"));
  assert.strictEqual(sovereignGoal.scope, "legacy_compatibility_alias", "legacy sovereign artifact must be scoped as a compatibility alias");
  assert.strictEqual(sovereignGoal.deprecatedCompatibilityOnly, true, "legacy sovereign artifact must declare compatibility-only deprecation");
  assert.strictEqual(sovereignGoal.exportSessionId, exportSessionId, "legacy sovereign artifact must carry the shared exportSessionId");

  const exportManifest = JSON.parse(fs.readFileSync(path.join(outputRoot, "export_manifest.json"), "utf8"));
  assert(exportManifest && exportManifest.outputs, "export manifest must be returned");
  assert.strictEqual(exportManifest.canonicalReuseVerified, true, "export manifest must record canonical reuse verification");
  assert.strictEqual(exportManifest.exportSessionId, exportSessionId, "export manifest must carry the shared exportSessionId");
  assert.strictEqual(exportManifest.outputs.workerDecisionSurfaceJson, "output/governance_public/worker_decision_surface.json", "export manifest must point at the worker decision headline");
  assert.strictEqual(exportManifest.outputs.workerCompletionStatusJson, "output/governance_public/worker_completion_status.json", "export manifest must point at the worker completion companion");
  assert.strictEqual(exportManifest.outputs.robustnessBreakdownJson, "output/agi_readiness/robustness_breakdown.json", "export manifest must point at the tracked robustness breakdown artifact");
  assert.strictEqual(fs.existsSync(path.join(tempRoot, readiness.robustnessBreakdownPath)), true, "latest readiness robustness path must resolve to a real file");
  assert.strictEqual(fs.existsSync(path.join(tempRoot, exportManifest.outputs.robustnessBreakdownJson)), true, "export manifest robustness path must resolve to a real file");
  assert.strictEqual(fs.existsSync(path.join(tempRoot, exportManifest.outputs.autonomousLearningStatusJson)), true, "export manifest autonomous learning path must resolve to a real file");
  assert.strictEqual(fs.existsSync(path.join(tempRoot, exportManifest.outputs.causalLearningTraceJson)), true, "export manifest causal learning path must resolve to a real file");
  assert.strictEqual(fs.existsSync(path.join(tempRoot, exportManifest.outputs.causalRegressionAlertsJson)), true, "export manifest causal regression alerts path must resolve to a real file");
  assert.strictEqual(fs.existsSync(path.join(tempRoot, exportManifest.outputs.distinctImprovementLineageJson)), true, "export manifest distinct lineage path must resolve to a real file");
  assert.strictEqual(fs.existsSync(path.join(tempRoot, exportManifest.outputs.distinctImprovementSummaryJson)), true, "export manifest distinct improvement summary path must resolve to a real file");
  assert.strictEqual(fs.existsSync(path.join(tempRoot, exportManifest.outputs.continuityDebtJson)), true, "export manifest continuity debt path must resolve to a real file");
  assert.strictEqual(fs.existsSync(path.join(tempRoot, exportManifest.outputs.continuityDebtTrendJson)), true, "export manifest continuity debt trend path must resolve to a real file");
  assert.strictEqual(fs.existsSync(path.join(tempRoot, exportManifest.outputs.continuityCloseoutEffectsJson)), true, "export manifest continuity closeout effects path must resolve to a real file");
  assert.strictEqual(fs.existsSync(path.join(tempRoot, exportManifest.outputs.stableCoverageMatrixJson)), true, "export manifest stable coverage matrix path must resolve to a real file");
  assert.strictEqual(fs.existsSync(path.join(tempRoot, exportManifest.outputs.stableCoverageTrendJson)), true, "export manifest stable coverage trend path must resolve to a real file");
  assert.strictEqual(fs.existsSync(path.join(tempRoot, exportManifest.outputs.robustnessRemediationBacklogJson)), true, "export manifest remediation backlog path must resolve to a real file");
  assert.strictEqual(fs.existsSync(path.join(tempRoot, exportManifest.outputs.robustnessRemediationEffectsJson)), true, "export manifest remediation effects path must resolve to a real file");
  assert.strictEqual(fs.existsSync(path.join(tempRoot, exportManifest.outputs.causalEffectivenessSummaryJson)), true, "export manifest causal effectiveness summary path must resolve to a real file");
  assert.strictEqual(fs.existsSync(path.join(tempRoot, exportManifest.outputs.goalCompletionStatusJson)), true, "export manifest goal completion path must resolve to a real file");
  assert.strictEqual(fs.existsSync(path.join(tempRoot, exportManifest.outputs.workerCompletionStatusJson)), true, "export manifest worker completion path must resolve to a real file");
  assert.strictEqual(fs.existsSync(path.join(tempRoot, exportManifest.outputs.subjectiveGoalCompletionStatusJson)), true, "export manifest subjective goal completion path must resolve to a real file");
  assert.strictEqual(fs.existsSync(path.join(tempRoot, exportManifest.outputs.compatibilityCompletionStatusJson)), true, "export manifest compatibility completion path must resolve to a real file");
  assert.strictEqual(fs.existsSync(path.join(tempRoot, exportManifest.outputs.compatibilityCompletionStatusMd)), true, "export manifest compatibility completion markdown path must resolve to a real file");
  assert.strictEqual(fs.existsSync(path.join(tempRoot, exportManifest.outputs.learningAdoptionStatusJson)), true, "export manifest learning adoption status path must resolve to a real file");
  assert.strictEqual(fs.existsSync(path.join(tempRoot, exportManifest.outputs.selfDirectedProbeStatusJson)), true, "export manifest self-directed probe status path must resolve to a real file");
  assert.strictEqual(fs.existsSync(path.join(tempRoot, exportManifest.outputs.novelTaskAcquisitionJson)), true, "export manifest novel task acquisition path must resolve to a real file");
  assert.strictEqual("sovereignGoalCompletionStatusJson" in exportManifest.outputs, false, "export manifest must not expose legacy sovereign completion output keys");

  const incompleteBundleRoot = path.join(tempRoot, "output", "agi_v1", "eval-incomplete-readiness");
  fs.mkdirSync(incompleteBundleRoot, { recursive: true });
  fs.writeFileSync(path.join(incompleteBundleRoot, "agi_v1_bundle.json"), `${JSON.stringify({
    generatedAt: "2026-04-06T00:00:00.000Z",
    runId: "eval-incomplete-readiness",
    profile: "agi_v1",
    suiteId: "live.degraded_tool_outputs.coverage.incomplete",
    manifest: {
      dataset: [],
      promptTemplate: [],
      splitIds: {
        trainSuiteIds: ["train.incomplete"],
        devSuiteIds: ["dev.incomplete"],
        selectionSuiteIds: ["selection.incomplete"],
      },
    },
    candidate: {
      candidateId: "candidate-incomplete-readiness",
      generatedAt: "2026-04-06T00:00:00.000Z",
      profile: "agi_v1",
      rawFinalScore: 0.981,
      displayFinalScore: 0.981,
      riskSummary: { cvar: 0.01, supportStatus: "supported" },
      gateStatus: { allCriticalMetricsSupported: true },
      familySummaries: {
        G_breadth: { main: { value: 1, threshold: 0.7, supportStatus: "supported" } },
        R_robust: { main: { value: 0.99, threshold: 0.93, supportStatus: "supported" } },
        H_horizon: { main: { value: 0.99, threshold: 0.97, supportStatus: "supported" } },
      },
    },
    promotionDecision: {
      challengerIdentifier: "candidate-incomplete-readiness",
      promote: false,
      reasons: ["manifest_incomplete"],
    },
  }, null, 2)}\n`, "utf8");
  exportGovernedMemoryPublicArtifacts({ workspaceRoot: tempRoot });
  const readinessAfterIncompleteBundle = JSON.parse(fs.readFileSync(path.join(readinessRoot, "latest_readiness.json"), "utf8"));
  assert.notStrictEqual(readinessAfterIncompleteBundle.latestRunId, "eval-incomplete-readiness", "latest readiness must ignore incomplete agi_v1 bundles");
  assert(readinessAfterIncompleteBundle.rawFinalScore === readiness.rawFinalScore, "incomplete agi_v1 bundles must not zero out readiness score");

  const publicLeafValues = [
    workspaceProgress,
    latestPack,
    promotionHealth,
    lessonEffectiveness,
    packCausalTrace,
    readiness,
    coverage,
    blockedReasons,
    promotionTrend,
    bottlenecks,
    autonomousLearning,
    causalLearning,
    distinctLineage,
    remediationStatus,
    remediationTrend,
    continuity,
    continuityDebt,
    goalCompletion,
    workerCompletionStatus,
  ].flatMap((entry) => collectLeafValues(entry));
  assert(publicLeafValues.every((entry) => typeof entry.value !== "string" || !isUuidLike(entry.value)), "public artifacts must not expose raw UUID-like titles");
  assert(publicLeafValues.every((entry) => !(typeof entry.value === "string" && /^\d{13}$/.test(entry.value))), "public artifacts must not expose epoch-millisecond timestamps");

  fs.unlinkSync(path.join(readinessRoot, "robustness_breakdown.json"));
  const strictArtifacts = buildGovernedMemoryPublicArtifacts({ workspaceRoot: tempRoot, requireWrittenPublicArtifacts: true });
  const strictRobustnessCheck = strictArtifacts.evalStatus.checks.find((entry) => entry.id === "robustness_breakdown_exported");
  assert(strictRobustnessCheck && strictRobustnessCheck.status === "FAIL", "strict public eval must fail when the tracked robustness breakdown artifact is missing");
  fs.unlinkSync(path.join(readinessRoot, "subjective_goal_completion_status.json"));
  const strictArtifactsMissingSubjective = buildGovernedMemoryPublicArtifacts({ workspaceRoot: tempRoot, requireWrittenPublicArtifacts: true });
  const strictSubjectiveCheck = strictArtifactsMissingSubjective.evalStatus.checks.find((entry) => entry.id === "subjective_goal_artifact_present");
  assert(strictSubjectiveCheck && strictSubjectiveCheck.status === "FAIL", "strict public eval must fail when the tracked subjective goal artifact is missing");
  writeJson(path.join(tempRoot, "output", "governance_public", "worker_decision_surface.json"), {
    schema: "worker-decision-surface.v1",
    scope: "worker_decision",
    exportSessionId: "export_mismatch",
    topLevelOutcome: "AUTONOMOUS_RETRY",
    topLevelSummary: "Mismatch test",
    operatorAction: "CONTINUE_AUTONOMOUSLY",
    minimalHitl: { mode: "continue_autonomously", humanInterruptionRequired: 0, explicitUserJudgmentRequired: 0 },
    adoptionReadiness: 0.5,
    latentIntentAlignment: 0.9,
    evidenceSummary: { evidenceRefCount: 1, supportingArtifactCount: 1, blockerCount: 0, residualRiskCount: 0, assumptionCount: 0, taskOutcomeCount: 1 },
  });
  const strictArtifactsMismatchedSession = buildGovernedMemoryPublicArtifacts({ workspaceRoot: tempRoot, requireWrittenPublicArtifacts: true });
  const strictSessionCheck = strictArtifactsMismatchedSession.evalStatus.checks.find((entry) => entry.id === "worker_decision_surface_export_session_consistent");
  assert(strictSessionCheck && strictSessionCheck.status === "FAIL", "strict public eval must fail when worker decision surface exportSessionId mismatches the semantic window");
  const strictWorkerCompletionCheck = strictArtifactsMismatchedSession.evalStatus.checks.find((entry) => entry.id === "worker_completion_status_consistent");
  assert(strictWorkerCompletionCheck && strictWorkerCompletionCheck.status === "FAIL", "strict public eval must fail when worker completion semantics diverge from the shared export session");
  writeJson(path.join(tempRoot, "output", "governance_public", "worker_decision_surface.json"), {
    schema: "worker-decision-surface.v1",
    scope: "worker_decision",
    exportSessionId,
    topLevelOutcome: "AUTONOMOUS_RETRY",
    topLevelSummary: "The worker should continue autonomously until adoption-ready completion is supported by evidence.",
    operatorAction: "CONTINUE_AUTONOMOUSLY",
    minimalHitl: { mode: "continue_autonomously", humanInterruptionRequired: 0, explicitUserJudgmentRequired: 0 },
    adoptionReadiness: 0.62,
    latentIntentAlignment: 0.91,
    evidenceSummary: { evidenceRefCount: 3, supportingArtifactCount: 4, blockerCount: 1, residualRiskCount: 1, assumptionCount: 0, taskOutcomeCount: 1 },
  });

  const mismatchAutonomousLearning = JSON.parse(JSON.stringify(exported.autonomousLearningStatus));
  mismatchAutonomousLearning.summary.verifiedPositive = mismatchAutonomousLearning.currentVerifiedPositiveCount + 1;
  const mismatchEvalStatus = evaluateMemoryPublicSuite({
    workspaceRoot: tempRoot,
    paths: exported.paths,
    summary: exported.summary,
    pack: exported.pack,
    items: exported.items,
    openAIBlogLane: exported.openAIBlogLane,
    anthropicLane: exported.anthropicLane,
    observationProjection: exported.observationProjection,
    continuityArtifacts: exported.continuityArtifacts,
    readinessArtifacts: exported.readinessArtifacts,
    autonomousAgenda: mismatchAutonomousLearning,
    causalTrace: exported.causalLearningTracePublic,
    continuityDebt: exported.continuityDebtPublic,
    goalCompletionStatus: exported.goalCompletionStatus,
    workerCompletionStatus: exported.workerCompletionStatus,
    subjectiveGoalCompletionStatus: exported.subjectiveGoalCompletionStatus,
    compatibilityCompletionStatus: exported.compatibilityCompletionStatus,
    sovereignGoalCompletionStatus: exported.sovereignGoalCompletionStatus,
    causalRegressionAlerts: exported.causalRegressionAlerts,
    learningAdoptionStatus: exported.learningAdoptionStatus,
    selfDirectedProbeStatus: exported.selfDirectedProbeStatus,
    novelTaskAcquisition: exported.novelTaskAcquisition,
    selfAuthoredGoalStatus: exported.selfAuthoredGoalStatus,
    selfAuthoredGoalHistory: exported.selfAuthoredGoalHistory,
    selfAuthoredGoalMarket: exported.selfAuthoredGoalMarket,
    openUnknownsRegister: exported.openUnknownsRegister,
    workspaceWorldModel: exported.workspaceWorldModel,
    continuousImprovementStatus: exported.continuousImprovementStatus,
    noveltyGrowthStatus: exported.noveltyGrowthStatus,
    securityConstitutionStatus: exported.securityConstitutionStatus,
    rollbackReadiness: exported.rollbackReadiness,
    autonomyBudgetStatus: exported.autonomyBudgetStatus,
    selfAuthoredCausalEffects: exported.selfAuthoredCausalEffects,
    selfAuthoredRemediationTrend: exported.selfAuthoredRemediationTrend,
    workspaceProgressPublic: exported.workspaceProgressPublic,
    promotionHealthPublic: exported.promotionHealthPublic,
    latestPackPublic: exported.latestPackPublic,
  });
  const mismatchSummaryCheck = mismatchEvalStatus.checks.find((entry) => entry.id === "autonomous_learning_summary_matches_count_contract");
  assert(mismatchSummaryCheck && mismatchSummaryCheck.status === "FAIL", "synthetic autonomous-learning summary/count mismatch must fail the summary contract check");
  const mismatchVerifiedPositiveCheck = mismatchEvalStatus.checks.find((entry) => entry.id === "autonomous_learning_verified_positive_semantics_consistent");
  assert(mismatchVerifiedPositiveCheck && mismatchVerifiedPositiveCheck.status === "FAIL", "synthetic verified-positive mismatch must fail the verified-positive semantics check");

  const syntheticGoal = buildGoalCompletionStatus({
    workspaceRoot: tempRoot,
    readinessArtifacts: {
      readiness: {
        stableCoverageBreadth: 1,
        supportedCoverageBreadth: 1,
        failedFamilies: [],
        rawFinalScore: 0.97,
        catastrophicRisk: { cvar: 0.01 },
        metrics: {
          R_robust: { value: 0.97 },
          H_horizon: { value: 0.99 },
        },
      },
      robustnessBreakdown: {
        categories: [
          { categoryId: "ambiguous_instruction", status: "observed", evidenceCount: 24, score: 0.94 },
          { categoryId: "missing_context", status: "observed", evidenceCount: 24, score: 0.97 },
          { categoryId: "browser_tool_flakiness", status: "observed", evidenceCount: 22, score: 0.93 },
          { categoryId: "adversarial_conflicting_instruction", status: "observed", evidenceCount: 18, score: 0.92 },
          { categoryId: "degraded_tool_outputs", status: "observed", evidenceCount: 20, score: 0.93 },
        ],
      },
      distinctLineage: {
        entries: [
          { comparisonMode: "distinct_comparison", rawFinalScoreOld: 0.88, rawFinalScoreNew: 0.9, continuityDebtDelta: -1, robustnessDeltaByCategory: { overall: 0.02 }, causalSupportCount: 2, causalHarmCount: 0, promote: true, generatedAt: "2026-04-04T10:00:00.000Z" },
          { comparisonMode: "distinct_comparison", rawFinalScoreOld: 0.9, rawFinalScoreNew: 0.92, continuityDebtDelta: -1, robustnessDeltaByCategory: { overall: 0.01 }, causalSupportCount: 1, causalHarmCount: 0, promote: true, generatedAt: "2026-04-04T11:00:00.000Z" },
          { comparisonMode: "distinct_comparison", rawFinalScoreOld: 0.92, rawFinalScoreNew: 0.95, continuityDebtDelta: 0, robustnessDeltaByCategory: { overall: 0.01 }, causalSupportCount: 1, causalHarmCount: 0, promote: true, adopted: true, generatedAt: "2026-04-04T12:00:00.000Z" },
        ],
      },
    },
    continuityArtifacts: {
      artifact: {
        blockedSubtasks: 0,
        integrationPendingCount: 0,
      },
    },
    continuityDebt: {
      summary: {
        openDebtCount: 0,
      },
    },
    autonomousAgenda: {
      entries: [
        { remediationEffect: "verified_positive", status: "passed", lastUpdatedAt: "2026-04-04T12:30:00.000Z" },
        { remediationEffect: "verified_positive", status: "passed", lastUpdatedAt: "2026-04-04T12:40:00.000Z" },
        { remediationEffect: "verified_positive", status: "passed", lastUpdatedAt: "2026-04-04T12:50:00.000Z" },
      ],
    },
    causalTrace: {
      traces: [
        { usageStage: "likely_contributory" },
        { usageStage: "likely_contributory" },
        { usageStage: "likely_contributory" },
        { usageStage: "likely_contributory" },
      ],
    },
    openAIBlogLane: { canonicalCounts: { observationCount: 4, causalUsageCount: 3 } },
    anthropicLane: { advisory: { advisoryReferenceCount: 2 } },
    workspaceProgressPublic: { nextRecommendedActions: ["Keep verifying improvements."] },
    bottlenecks: { items: [] },
    previousGoalHistory: {
      entries: [
        { baseStatus: "criteria_met", generatedAt: "2026-04-04T10:00:00.000Z" },
        { baseStatus: "criteria_met", generatedAt: "2026-04-04T11:00:00.000Z" },
      ],
    },
    stableCoverageArtifacts: {
      matrix: { stableCoverageBreadth: 1, rows: [] },
      trend: { entries: [{ generatedAt: "2026-04-04T10:00:00.000Z" }, { generatedAt: "2026-04-04T11:00:00.000Z" }] },
    },
    causalEffectivenessSummary: { summary: { harmfulCausalRatio: 0, likelyContributoryCount: 2 } },
    causalRegressionAlerts: { alerts: [] },
  });
  assert.strictEqual(syntheticGoal.goalStatus, "OPERATIONALLY_COMPLETE", "synthetic fully-satisfied criteria must yield OPERATIONALLY_COMPLETE");
  assert(Array.isArray(syntheticGoal.whyNotYet) && syntheticGoal.whyNotYet.length === 0, "synthetic operational completion case must have no unmet criteria");

  const syntheticSubjective = buildSubjectiveGoalCompletionStatus(createStrictSubjectiveArgs(tempRoot, {
    goalCompletionStatus: syntheticGoal,
    readinessArtifacts: {
      readiness: syntheticGoal.liveMetricsSnapshot || {
        stableCoverageBreadth: 1,
        supportedCoverageBreadth: 1,
        rawFinalScore: 0.97,
        catastrophicRisk: { cvar: 0.01 },
        metrics: {
          R_robust: { value: 0.97 },
          H_horizon: { value: 0.99 },
        },
      },
      robustnessBreakdown: {
        categories: [
          { categoryId: "missing_context", status: "observed", evidenceCount: 24, score: 0.97 },
          { categoryId: "browser_tool_flakiness", status: "observed", evidenceCount: 22, score: 0.93 },
          { categoryId: "ambiguous_instruction", status: "observed", evidenceCount: 24, score: 0.94 },
          { categoryId: "adversarial_conflicting_instruction", status: "observed", evidenceCount: 18, score: 0.92 },
          { categoryId: "degraded_tool_outputs", status: "observed", evidenceCount: 20, score: 0.93 },
        ],
      },
    },
  }));
  assert.strictEqual(syntheticSubjective.subjectiveGoalStatus, "SUBJECTIVE_AGI_NEAR_COMPLETE", "synthetic fully-satisfied subjective criteria must yield SUBJECTIVE_AGI_NEAR_COMPLETE");
  assert(Array.isArray(syntheticSubjective.subjectiveWhyNotYet) && syntheticSubjective.subjectiveWhyNotYet.length === 0, "synthetic subjective completion case must have no unmet criteria");

  const subjectiveFailsWithoutPrimarySelection = buildSubjectiveGoalCompletionStatus(createStrictSubjectiveArgs(tempRoot, {
    learningAdoptionStatus: {
      selectedInLatestPackCount: 0,
      laneSummaries: {
        openai_primary: {
          selectedInLatestPackCount: 0,
        },
      },
    },
  }));
  assert.strictEqual(subjectiveFailsWithoutPrimarySelection.subjectiveGoalStatus, "NOT_YET", "subjective completion must remain NOT_YET when primary lane latest-pack selection is zero");

  const subjectiveFailsWithoutPrimaryContribution = buildSubjectiveGoalCompletionStatus(createStrictSubjectiveArgs(tempRoot, {
    learningAdoptionStatus: {
      effectiveContributionCount: 0,
      laneSummaries: {
        openai_primary: {
          effectiveContributionCount: 0,
        },
      },
    },
  }));
  assert.strictEqual(subjectiveFailsWithoutPrimaryContribution.subjectiveGoalStatus, "NOT_YET", "subjective completion must remain NOT_YET when primary lane effective contribution is zero");

  const subjectiveFailsWithoutNovelEvidence = buildSubjectiveGoalCompletionStatus(createStrictSubjectiveArgs(tempRoot, {
    previousSubjectiveHistory: {
      entries: Array.from({ length: 6 }, (_, index) => ({
        exportSessionId: `strict-zero-novel-${index}`,
        baseStatus: "criteria_met",
        subjectiveGoalStatus: "SUBJECTIVE_AGI_NEAR_COMPLETE",
        distinctImprovementCount: 3,
        distinctRegressionCount: 0,
        verifiedPositiveSelfDirectedRemediations: 2,
        novelProbePositiveCount: 0,
      })),
    },
    selfDirectedProbeStatus: {
      novelPositiveCount: 0,
      summary: {
        novelPositiveCount: 0,
        novelProbePositiveCount: 0,
      },
    },
    novelTaskAcquisition: {
      positiveNovelTaskCount: 0,
      summary: {
        positiveCount: 0,
      },
      recentNovelTasks: [],
      positiveEvidenceRefs: [],
      items: [],
    },
  }));
  assert.strictEqual(subjectiveFailsWithoutNovelEvidence.subjectiveGoalStatus, "NOT_YET", "subjective completion must remain NOT_YET when novel probe evidence is zero");

  const subjectiveFailsWithInsufficientEvidence = buildSubjectiveGoalCompletionStatus(createStrictSubjectiveArgs(tempRoot, {
    selfDirectedProbeStatus: {
      requiredThresholds: { maxInsufficientEvidenceCount: 0 },
      summary: {
        insufficientEvidenceCount: 1,
      },
    },
  }));
  assert.strictEqual(subjectiveFailsWithInsufficientEvidence.subjectiveGoalStatus, "NOT_YET", "subjective completion must remain NOT_YET when insufficient-evidence remediations are present");

  const subjectiveFailsWithHarmfulCausalRatio = buildSubjectiveGoalCompletionStatus(createStrictSubjectiveArgs(tempRoot, {
    causalEffectivenessSummary: {
      summary: {
        harmfulCausalRatio: 0.2,
        likelyContributoryCount: 3,
      },
    },
  }));
  assert.strictEqual(subjectiveFailsWithHarmfulCausalRatio.subjectiveGoalStatus, "NOT_YET", "subjective completion must remain NOT_YET when harmful causal ratio is above zero");

  const subjectiveUsesMaxVerifiedPositive = buildSubjectiveGoalCompletionStatus({
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
        primaryLaneSelectedInLatestPackCount: 1,
        primaryLaneEffectiveContributionCount: 1,
        primaryLaneCausalUsageCount: 3,
        harmfulCausalRatio: 0,
      },
    },
    readinessArtifacts: {
      robustnessBreakdown: {
        categories: [
          { categoryId: "ambiguous_instruction", status: "observed", evidenceCount: 24, score: 1 },
          { categoryId: "missing_context", status: "observed", evidenceCount: 5, score: 1 },
          { categoryId: "browser_tool_flakiness", status: "observed", evidenceCount: 8, score: 1 },
          { categoryId: "adversarial_conflicting_instruction", status: "observed", evidenceCount: 4, score: 1 },
          { categoryId: "degraded_tool_outputs", status: "observed", evidenceCount: 5, score: 1 },
        ],
      },
    },
    continuityArtifacts: { artifact: { blockedSubtasks: 0, integrationPendingCount: 0 } },
    continuityDebt: { summary: { openDebtCount: 0 } },
    autonomousLearningStatus: {
      summary: {
        verifiedPositive: 2,
        running: 0,
      },
      entries: [
        { source: "autonomous_learning", remediationEffect: "verified_positive", status: "passed", proposedEvalProbe: "probe:one" },
        { source: "subjective_goal", remediationEffect: "verified_positive", status: "passed", proposedEvalProbe: "probe:two" },
      ],
    },
    learningAdoptionStatus: {
      summary: {
        likelyContributoryCount: 3,
        harmfulCount: 0,
        rolledBackHarmCount: 0,
      },
      laneSummaries: {
        openai_primary: {
          selectedInLatestPackCount: 1,
          effectiveContributionCount: 1,
          causalUsageCount: 3,
          likelyContributoryCount: 3,
          harmfulCount: 0,
          rolledBackHarmCount: 0,
        },
      },
    },
    selfDirectedProbeStatus: {
      summary: {
        selfDirectedCount: 2,
        verifiedPositiveSelfDirectedCount: 2,
        blockedCount: 0,
        insufficientEvidenceCount: 0,
        novelProbeCount: 2,
        novelProbePositiveCount: 2,
      },
    },
    novelTaskAcquisition: {
      summary: { positiveCount: 2 },
      items: [{ targetCategory: "ambiguous_instruction", positiveEvidence: true }],
    },
    causalEffectivenessSummary: {
      summary: {
        harmfulCausalRatio: 0,
        likelyContributoryCount: 3,
      },
    },
    distinctImprovementSummary: {
      distinctImprovementCount: 3,
      distinctRegressionCount: 0,
      nonWorsening: true,
    },
    previousSubjectiveHistory: {
      entries: Array.from({ length: 6 }, (_, index) => ({
        exportSessionId: `synthetic-max-pass-${index}`,
        baseStatus: "criteria_met",
        subjectiveGoalStatus: "SUBJECTIVE_AGI_NEAR_COMPLETE",
      })),
    },
    exportSessionId: "synthetic-subjective-max-verified-positive",
  });
  assert.strictEqual(subjectiveUsesMaxVerifiedPositive.subjectiveCurrentValues.verifiedPositiveRemediations, 5, "subjective goal completion must count the max live verified-positive remediation total");

  const distinctSummaryUsesHistoricalWindow = buildDistinctImprovementSummary({
    workspaceRoot: tempRoot,
    distinctLineage: {
      entries: [
        { comparisonMode: "distinct_comparison", adopted: true, promote: true, rawFinalScoreOld: 0.9, rawFinalScoreNew: 0.92, continuityDebtDelta: 0, robustnessDeltaByCategory: { overall: 0.01 }, causalSupportCount: 1, causalHarmCount: 0, generatedAt: "2026-04-04T10:00:00.000Z", improvementEvidenceClass: "distinct_observed_improvement" },
        { comparisonMode: "distinct_comparison", adopted: true, promote: true, rawFinalScoreOld: 0.92, rawFinalScoreNew: 0.94, continuityDebtDelta: 0, robustnessDeltaByCategory: { overall: 0.01 }, causalSupportCount: 1, causalHarmCount: 0, generatedAt: "2026-04-04T11:00:00.000Z", improvementEvidenceClass: "distinct_observed_improvement" },
      ],
    },
    previousSubjectiveHistory: {
      entries: [
        { baseStatus: "criteria_met", generatedAt: "2026-04-04T09:00:00.000Z", distinctImprovementCount: 4, distinctRegressionCount: 0 },
      ],
    },
  });
  assert.strictEqual(distinctSummaryUsesHistoricalWindow.effectiveDistinctImprovementCount, 4, "distinct improvement summary must preserve history-aware effective improvement count");
  assert.strictEqual(distinctSummaryUsesHistoricalWindow.effectiveNonWorsening, true, "distinct improvement summary must preserve history-aware non-worsening window");

  const rolledBackRegressionGoal = buildGoalCompletionStatus({
    workspaceRoot: tempRoot,
    readinessArtifacts: {
      readiness: {
        stableCoverageBreadth: 1,
        supportedCoverageBreadth: 1,
        failedFamilies: [],
        rawFinalScore: 0.97,
        catastrophicRisk: { cvar: 0.01 },
        metrics: {
          R_robust: { value: 0.97 },
          H_horizon: { value: 0.99 },
        },
      },
      robustnessBreakdown: {
        categories: [
          { categoryId: "ambiguous_instruction", status: "observed", evidenceCount: 24, score: 0.94 },
          { categoryId: "missing_context", status: "observed", evidenceCount: 24, score: 0.97 },
          { categoryId: "browser_tool_flakiness", status: "observed", evidenceCount: 22, score: 0.93 },
          { categoryId: "adversarial_conflicting_instruction", status: "observed", evidenceCount: 18, score: 0.92 },
          { categoryId: "degraded_tool_outputs", status: "observed", evidenceCount: 20, score: 0.93 },
        ],
      },
      distinctLineage: {
        entries: [
          { comparisonMode: "distinct_comparison", adopted: true, promote: true, rawFinalScoreOld: 0.88, rawFinalScoreNew: 0.9, continuityDebtDelta: -1, robustnessDeltaByCategory: { overall: 0.02 }, causalSupportCount: 2, causalHarmCount: 0, generatedAt: "2026-04-04T10:00:00.000Z", improvementEvidenceClass: "distinct_observed_improvement" },
          { comparisonMode: "distinct_comparison", adopted: true, promote: true, rawFinalScoreOld: 0.9, rawFinalScoreNew: 0.92, continuityDebtDelta: -1, robustnessDeltaByCategory: { overall: 0.01 }, causalSupportCount: 1, causalHarmCount: 0, generatedAt: "2026-04-04T11:00:00.000Z", improvementEvidenceClass: "distinct_observed_improvement" },
          { comparisonMode: "distinct_comparison", adopted: false, rejected: true, rolledBack: true, promote: false, rawFinalScoreOld: 0.92, rawFinalScoreNew: 0.89, continuityDebtDelta: 1, robustnessDeltaByCategory: { overall: -0.03 }, causalSupportCount: 0, causalHarmCount: 2, generatedAt: "2026-04-04T12:00:00.000Z", improvementEvidenceClass: "distinct_observed_regression" },
          { comparisonMode: "distinct_comparison", adopted: true, promote: true, rawFinalScoreOld: 0.92, rawFinalScoreNew: 0.95, continuityDebtDelta: 0, robustnessDeltaByCategory: { overall: 0.01 }, causalSupportCount: 1, causalHarmCount: 0, generatedAt: "2026-04-04T13:00:00.000Z", improvementEvidenceClass: "distinct_observed_improvement" },
        ],
      },
    },
    continuityArtifacts: {
      artifact: {
        blockedSubtasks: 0,
        integrationPendingCount: 0,
      },
    },
    continuityDebt: {
      summary: {
        openDebtCount: 0,
      },
    },
    autonomousAgenda: {
      entries: [
        { remediationEffect: "verified_positive", status: "passed", lastUpdatedAt: "2026-04-04T12:30:00.000Z" },
      ],
    },
    causalTrace: {
      traces: [
        { usageStage: "likely_contributory" },
        { usageStage: "likely_contributory" },
      ],
    },
    openAIBlogLane: { canonicalCounts: { observationCount: 4, causalUsageCount: 3, selectedInLatestPackCount: 1, likelyContributoryCount: 1 } },
    anthropicLane: { advisory: { advisoryReferenceCount: 2 } },
    workspaceProgressPublic: { nextRecommendedActions: ["Keep verifying improvements."] },
    bottlenecks: { items: [] },
    previousGoalHistory: {
      entries: [
        { baseStatus: "criteria_met", generatedAt: "2026-04-04T10:00:00.000Z" },
        { baseStatus: "criteria_met", generatedAt: "2026-04-04T11:00:00.000Z" },
      ],
    },
    stableCoverageArtifacts: {
      matrix: { stableCoverageBreadth: 1, rows: [] },
      trend: { entries: [{ generatedAt: "2026-04-04T10:00:00.000Z" }, { generatedAt: "2026-04-04T11:00:00.000Z" }] },
    },
    causalEffectivenessSummary: { summary: { harmfulCausalRatio: 0, likelyContributoryCount: 2 } },
    causalRegressionAlerts: { alerts: [] },
  });
  assert.strictEqual(rolledBackRegressionGoal.currentValues.distinctLineageNonWorsening, true, "rolled-back rejected regressions must not count as active live lineage regression");

  console.log("governed_memory_public_export_test: ok");
}

main();
