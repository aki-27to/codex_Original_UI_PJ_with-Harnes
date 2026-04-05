"use strict";

const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const {
  buildGoalCompletionStatus,
  buildGovernedMemoryPublicArtifacts,
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

const repoRoot = path.resolve(__dirname, "..");

function copyJson(relativePath, targetRoot) {
  const sourcePath = path.join(repoRoot, relativePath);
  const targetPath = path.join(targetRoot, relativePath);
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  fs.copyFileSync(sourcePath, targetPath);
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
  seedGovernedMemoryPublicCompatibilityArtifacts(tempRoot);
  seedGovernedMemoryPublicContinuityArtifacts(tempRoot);
  seedGovernedMemoryPublicAgiReadinessArtifacts(tempRoot);

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
  const exported = exportGovernedMemoryPublicArtifacts({ workspaceRoot: tempRoot });

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
    path.join(continuityRoot, "latest_continuity.json"),
    path.join(continuityRoot, "continuity_debt.json"),
    path.join(continuityRoot, "continuity_debt_trend.json"),
    path.join(continuityRoot, "continuity_closeout_effects.json"),
  ];
  requiredPaths.forEach((targetPath) => {
    assert(fs.existsSync(targetPath), `required public artifact missing: ${targetPath}`);
  });

  const overviewText = fs.readFileSync(path.join(outputRoot, "latest_overview.json"), "utf8");
  assert(!overviewText.includes(tempRoot), "public overview must not leak the absolute workspace path");

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
    "stable_coverage_surface_present",
    "causal_regression_alerts_present",
    "goal_completion_supporting_artifacts_present",
    "goal_completion_status_consistent",
    "goal_completion_not_yet_when_criteria_fail",
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

  const autonomousLearning = JSON.parse(fs.readFileSync(path.join(readinessRoot, "autonomous_learning_status.json"), "utf8"));
  assert(Array.isArray(autonomousLearning.entries) && autonomousLearning.entries.length > 0, "autonomous learning status must expose entries");
  assert(autonomousLearning.entries.some((entry) => ["running", "passed"].includes(String(entry.status))), "autonomous learning status must expose running or passed items");
  assert(Number.isFinite(Number(autonomousLearning.summary.verifiedPositive)), "autonomous learning summary must expose verifiedPositive");
  assert(Number.isFinite(Number(autonomousLearning.summary.verifiedNeutral)), "autonomous learning summary must expose verifiedNeutral");
  assert(Number.isFinite(Number(autonomousLearning.summary.verifiedNegative)), "autonomous learning summary must expose verifiedNegative");
  assert(Number.isFinite(Number(autonomousLearning.summary.verifiedHarmful)), "autonomous learning summary must expose verifiedHarmful");
  assert(Number.isFinite(Number(autonomousLearning.summary.insufficientEvidence)), "autonomous learning summary must expose insufficientEvidence");

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
  assert.strictEqual(goalCompletion.schema, "agi-operational-completion-status.v1", "goal completion artifact must expose expected schema");
  assert.strictEqual(goalCompletion.goalStatus, "NOT_YET", "seeded live-goal fixture must remain NOT_YET");
  assert(Array.isArray(goalCompletion.whyNotYet) && goalCompletion.whyNotYet.length > 0, "goal completion artifact must explain why it is not yet complete");
  assert(Array.isArray(goalCompletion.requiredNextActions) && goalCompletion.requiredNextActions.length > 0, "goal completion artifact must expose required next actions");
  assert.strictEqual(typeof goalCompletion.completionVersion, "string", "goal completion artifact must expose completionVersion");
  assert.strictEqual(typeof goalCompletion.decisionBasis, "string", "goal completion artifact must expose decisionBasis");
  assert(Array.isArray(goalCompletion.failedCriteria) && goalCompletion.failedCriteria.length > 0, "goal completion artifact must expose failedCriteria");
  assert(Array.isArray(goalCompletion.passedCriteria), "goal completion artifact must expose passedCriteria");
  assert(Array.isArray(goalCompletion.supportingArtifacts) && goalCompletion.supportingArtifacts.length > 0, "goal completion artifact must expose supporting artifacts");
  assert(goalCompletion.lineageSummary && typeof goalCompletion.lineageSummary === "object", "goal completion artifact must expose lineageSummary");
  assert(goalCompletion.autonomousLearningSummary && typeof goalCompletion.autonomousLearningSummary === "object", "goal completion artifact must expose autonomousLearningSummary");
  assert(goalCompletion.continuityDebtSummary && typeof goalCompletion.continuityDebtSummary === "object", "goal completion artifact must expose continuityDebtSummary");
  assert(goalCompletion.robustnessSummary && typeof goalCompletion.robustnessSummary === "object", "goal completion artifact must expose robustnessSummary");
  assert(goalCompletion.causalSafetySummary && typeof goalCompletion.causalSafetySummary === "object", "goal completion artifact must expose causalSafetySummary");
  assert(goalCompletion.history && Number.isFinite(Number(goalCompletion.history.consecutivePassingExports)), "goal completion artifact must expose goal history summary");

  const exportManifest = JSON.parse(fs.readFileSync(path.join(outputRoot, "export_manifest.json"), "utf8"));
  assert(exportManifest && exportManifest.outputs, "export manifest must be returned");
  assert.strictEqual(exportManifest.canonicalReuseVerified, true, "export manifest must record canonical reuse verification");
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
  ].flatMap((entry) => collectLeafValues(entry));
  assert(publicLeafValues.every((entry) => typeof entry.value !== "string" || !isUuidLike(entry.value)), "public artifacts must not expose raw UUID-like titles");
  assert(publicLeafValues.every((entry) => !(typeof entry.value === "string" && /^\d{13}$/.test(entry.value))), "public artifacts must not expose epoch-millisecond timestamps");

  fs.unlinkSync(path.join(readinessRoot, "robustness_breakdown.json"));
  const strictArtifacts = buildGovernedMemoryPublicArtifacts({ workspaceRoot: tempRoot, requireWrittenPublicArtifacts: true });
  const strictRobustnessCheck = strictArtifacts.evalStatus.checks.find((entry) => entry.id === "robustness_breakdown_exported");
  assert(strictRobustnessCheck && strictRobustnessCheck.status === "FAIL", "strict public eval must fail when the tracked robustness breakdown artifact is missing");

  const syntheticGoal = buildGoalCompletionStatus({
    workspaceRoot: tempRoot,
    readinessArtifacts: {
      readiness: {
        stableCoverageBreadth: 1,
        supportedCoverageBreadth: 1,
        failedFamilies: [],
        rawFinalScore: 0.95,
        catastrophicRisk: { cvar: 0.02 },
        metrics: {
          R_robust: { value: 0.95 },
          H_horizon: { value: 0.98 },
        },
      },
      robustnessBreakdown: {
        categories: [
          { categoryId: "ambiguous_instruction", status: "observed", evidenceCount: 12, score: 0.82 },
          { categoryId: "missing_context", status: "observed", evidenceCount: 18, score: 0.9 },
          { categoryId: "browser_tool_flakiness", status: "observed", evidenceCount: 20, score: 0.84 },
          { categoryId: "adversarial_conflicting_instruction", status: "observed", evidenceCount: 12, score: 0.8 },
          { categoryId: "degraded_tool_outputs", status: "observed", evidenceCount: 12, score: 0.9 },
        ],
      },
      distinctLineage: {
        entries: [
          { comparisonMode: "distinct_comparison", rawFinalScoreOld: 0.88, rawFinalScoreNew: 0.9, continuityDebtDelta: -1, robustnessDeltaByCategory: { overall: 0.02 }, causalSupportCount: 2, causalHarmCount: 0, promote: true, generatedAt: "2026-04-04T10:00:00.000Z" },
          { comparisonMode: "distinct_comparison", rawFinalScoreOld: 0.9, rawFinalScoreNew: 0.92, continuityDebtDelta: -1, robustnessDeltaByCategory: { overall: 0.01 }, causalSupportCount: 1, causalHarmCount: 0, promote: true, generatedAt: "2026-04-04T11:00:00.000Z" },
          { comparisonMode: "distinct_comparison", rawFinalScoreOld: 0.92, rawFinalScoreNew: 0.95, continuityDebtDelta: 0, robustnessDeltaByCategory: { overall: 0.01 }, causalSupportCount: 1, causalHarmCount: 0, promote: false, generatedAt: "2026-04-04T12:00:00.000Z" },
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

  console.log("governed_memory_public_export_test: ok");
}

main();
