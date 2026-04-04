"use strict";

const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const {
  buildGovernedMemoryRuntimeSnapshot,
  getMemoryPaths,
  syncGovernedMemoryGraph,
} = require("./lib/governed_memory_graph");
const {
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

function createRuntimeFixture() {
  return {
    activeAgent: "default",
    latestTurn: {
      turn_id: "turn-governed-001",
      thread_id: "thread-governed-001",
      agent_name: "default",
      status: "failed",
      task_outcome_status: "FAILED_VALIDATION",
      task_outcome_reason: "visual review missing",
      family_completion_gate: {
        applies: true,
        status: "failed_validation",
        taskFamily: "web_creative",
        completionContract: "design_acceptance",
        missingHard: [{ label: "screenshot review", reason: "intent_visual_review_missing" }],
      },
      planning: {
        taskFamily: "web_creative",
      },
    },
    intentFirst: {
      mode: "intent-first",
      contractPath: "scripts/config/design_acceptance_contract.json",
      tasteMemorySeedPath: "scripts/config/default_user_taste_memory.json",
      tasteMemoryPath: "logs/archive/raw/runtime_state/intent_profile_memory.json",
      contract: {
        benchmarkComparisonRequired: true,
        visualReviewRequired: true,
        independentReviewRequired: true,
        docSyncRequired: true,
        technicalVerificationRequired: true,
        prohibitedPatterns: ["generic glassmorphism"],
        requiredArtifacts: ["desktop screenshot review", "documentation sync"],
      },
      tasteMemory: {
        activeProfileId: "default",
        activeProfile: {
          id: "default",
          northStar: "Ship deliberate, benchmark-beating UI work.",
          qualityBar: "Passing checks is not enough.",
          mustHaves: ["Explicit acceptance checks", "Visual review"],
          avoid: ["uniform card dashboards"],
          benchmarkUrls: ["https://www.suruga-k.jp/"],
          notes: ["Treat weak visual quality as incomplete."],
          updatedAt: "2026-04-04T09:00:00.000Z",
        },
      },
    },
    executionOverview: {
      sampleSize: 2,
      statusCounts: { failed: 1, completed: 1 },
      taskOutcomeCounts: { FAILED_VALIDATION: 1, COMPLETED: 1 },
      guardViolations: 0,
      implementationObserved: 2,
      recent: [
        {
          turnId: "turn-governed-001",
          threadId: "thread-governed-001",
          agentName: "default",
          status: "failed",
          taskOutcomeStatus: "FAILED_VALIDATION",
          taskOutcomeReason: "visual review missing",
          executionProfile: "full-runtime",
          completedAt: "2026-04-04T09:30:00.000Z",
          fileChanges: 4,
          commandExecutions: 3,
          collabCalls: 0,
        },
        {
          turnId: "turn-governed-000",
          threadId: "thread-governed-001",
          agentName: "default",
          status: "completed",
          taskOutcomeStatus: "COMPLETED",
          taskOutcomeReason: "all checks passed",
          executionProfile: "full-runtime",
          completedAt: "2026-04-04T08:30:00.000Z",
          fileChanges: 2,
          commandExecutions: 1,
          collabCalls: 0,
        },
      ],
      patterns: [
        {
          signature: "missing_visual_review",
          code: "intent_visual_review_missing",
          severity: "high",
          status: "failed",
          count: 2,
          lastSeenAt: "2026-04-04T09:30:00.000Z",
          hint: "Block completion when screenshot review is missing.",
        },
      ],
    },
    evalHistory: {
      recentRuns: [
        {
          runId: "eval-001",
          suiteId: "core-harness-workflow.v4",
          variantLabel: "default",
          scoreRate: 1,
          passRate: 1,
          failedCases: 0,
          probePersistedRecords: 2,
          generatedAt: "2026-04-04T09:45:00.000Z",
        },
      ],
    },
    externalLearning: {
      trackedArticles: 4,
      ledgerPath: "output/openai_blog_learning_ledger.json",
      digestPath: "output/openai_blog_learning_digest.json",
      curatedDocPath: "docs/OPENAI_DEVELOPER_LEARNINGS.md",
      runtimeRetrieval: {
        applyToAgents: ["default", "frontend_worker"],
        applyToTaskFamilies: ["web_creative"],
      },
      selfImprovement: {
        nextPriority: {
          title: "Designing delightful frontends with GPT-5.4 | OpenAI Developers",
          readinessStatus: "awaiting_observations",
          changeType: "frontend_quality_note",
          gatingReason: "awaiting_runtime_observations",
          nextAction: "Record 2 successful targeted observations before promotion.",
        },
      },
      recentArticles: [
        {
          title: "Run long horizon tasks with Codex",
          url: "https://developers.openai.com/blog/run-long-horizon-tasks-with-codex",
          topicTags: ["codex", "automation"],
        },
      ],
    },
    secondaryLearning: {
      anthropicEngineering: {
        portabilityMode: "portable_principles_only",
        curatedDocPath: "docs/ANTHROPIC_ENGINEERING_LEARNINGS.md",
        recentArticles: [
          {
            title: "Demystifying evals for AI agents",
            url: "https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents",
            portability: "portable",
          },
        ],
      },
    },
    manualSelfImprovement: {
      status: "ready",
      generatedAt: "2026-04-04T09:55:00.000Z",
      entries: [
        {
          lessonSummary: "Lock the lesson contract before deciding promotion or storage.",
          classification: "runtime hint",
          promotionDecision: "proposal-only",
          appliesTo: {
            agent: ["default"],
            taskFamily: ["manual_self_improvement"],
            triggers: ["self-improve"],
          },
          supportingArtifacts: ["docs/SELF_IMPROVEMENT_POLICY.md"],
        },
      ],
    },
    phaseStatus: {
      requirementFoundationV1: "done",
      status: "done",
      freezePolicy: "bug_fix_only",
      completedAt: "2026-03-22T12:00:00.000Z",
      auditReportPath: "output/phase_exit_requirement_foundation_v1.json",
    },
  };
}

function main() {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "governed-memory-"));
  copyJson(path.join("scripts", "config", "agi_readiness_live_policy.json"), tempRoot);
  copyJson(path.join("scripts", "config", "anthropic_engineering_learning_policy.json"), tempRoot);
  copyJson(path.join("scripts", "config", "governed_observation_policy.json"), tempRoot);
  copyJson(path.join("scripts", "config", "memory_spec_graph_catalog.json"), tempRoot);
  copyJson(path.join("scripts", "config", "memory_retrieval_policy.json"), tempRoot);
  copyJson(path.join("scripts", "config", "memory_eval_suite.json"), tempRoot);
  copyJson(path.join("scripts", "config", "openai_blog_learning_policy.json"), tempRoot);
  copyJson(path.join("scripts", "config", "self_improvement_promotion_policy.json"), tempRoot);
  copyJson(path.join("scripts", "config", "memory_type_catalog.json"), tempRoot);
  seedGovernedMemoryPublicCompatibilityArtifacts(tempRoot);
  seedGovernedMemoryPublicContinuityArtifacts(tempRoot);
  seedGovernedMemoryPublicAgiReadinessArtifacts(tempRoot);

  const retrievalPolicyPath = path.join(tempRoot, "scripts", "config", "memory_retrieval_policy.json");
  const retrievalPolicy = JSON.parse(fs.readFileSync(retrievalPolicyPath, "utf8"));
  retrievalPolicy.defaultPackBudget = 6;
  retrievalPolicy.sectionBudgets = {
    spec: 2,
    intent: 1,
    workspace_progress: 1,
    experience: 1,
    semantic: 1,
    preference: 1,
    improvement: 1,
  };
  retrievalPolicy.scoreThresholds = {
    minimumSelectionScore: 0.18,
    highConfidenceScore: 0.68,
  };
  fs.writeFileSync(retrievalPolicyPath, `${JSON.stringify(retrievalPolicy, null, 2)}\n`, "utf8");

  const runtime = createRuntimeFixture();
  runtime.latestTurn.task_outcome_status = "COMPLETED";
  runtime.latestTurn.task_outcome_reason = "deterministic code validation passed";
  runtime.latestTurn.family_completion_gate = {
    applies: true,
    status: "passed",
    taskFamily: "deterministic_code",
    completionContract: "default",
    missingHard: [],
  };
  runtime.latestTurn.planning = { taskFamily: "deterministic_code" };
  const traceability = {
    changedPaths: ["server.js", "docs/CONTEXT_MEMORY_POLICY.md"],
    operatorSummaryPath: "logs/current/operator_summary.json",
    manifestPath: "logs/current/index.json",
    summary: "Memory architecture refresh is in progress.",
  };

  const syncResult = syncGovernedMemoryGraph({
    workspaceRoot: tempRoot,
    runtime,
    traceability,
    reason: "test_sync",
  });
  const observationStatePath = path.join(getMemoryPaths(tempRoot).projections.observationStateRoot, "latest.json");
  const observationAfterFirstSync = JSON.parse(fs.readFileSync(observationStatePath, "utf8"));
  const primaryObservationsAfterFirstSync = Number(observationAfterFirstSync.byLane.external_primary.observationCount || 0);
  assert(primaryObservationsAfterFirstSync > 0, "first sync must record primary learning observations");

  syncGovernedMemoryGraph({
    workspaceRoot: tempRoot,
    runtime,
    traceability,
    reason: "test_sync_duplicate",
  });
  const observationAfterDuplicateSync = JSON.parse(fs.readFileSync(observationStatePath, "utf8"));
  assert.strictEqual(
    Number(observationAfterDuplicateSync.byLane.external_primary.observationCount || 0),
    primaryObservationsAfterFirstSync,
    "same turn must not double count primary observations"
  );

  const deterministicRuntime = JSON.parse(JSON.stringify(runtime));
  deterministicRuntime.latestTurn.turn_id = "turn-governed-003";
  deterministicRuntime.latestTurn.task_outcome_reason = "web creative turn should not reuse deterministic-only lessons";
  deterministicRuntime.latestTurn.family_completion_gate = {
    applies: true,
    status: "failed_validation",
    taskFamily: "web_creative",
    completionContract: "design_acceptance",
    missingHard: [{ label: "visual review", reason: "intent_visual_review_missing" }],
  };
  deterministicRuntime.latestTurn.planning = { taskFamily: "web_creative" };
  syncGovernedMemoryGraph({
    workspaceRoot: tempRoot,
    runtime: deterministicRuntime,
    traceability,
    reason: "test_sync_family_mismatch",
  });
  const observationAfterMismatchSync = JSON.parse(fs.readFileSync(observationStatePath, "utf8"));
  assert.strictEqual(
    Number(observationAfterMismatchSync.byLane.external_primary.observationCount || 0),
    primaryObservationsAfterFirstSync,
    "unrelated task families must not mix into primary observations"
  );

  const missingEvidenceRuntime = JSON.parse(JSON.stringify(runtime));
  missingEvidenceRuntime.latestTurn.turn_id = "turn-governed-004";
  syncResult.summary.latestPack = syncResult.pack;
  syncGovernedMemoryGraph({
    workspaceRoot: tempRoot,
    runtime: missingEvidenceRuntime,
    traceability: {
      changedPaths: traceability.changedPaths,
      summary: "Missing evidence refs should fail closed.",
    },
    reason: "test_sync_missing_evidence",
  });
  const observationAfterMissingEvidenceSync = JSON.parse(fs.readFileSync(observationStatePath, "utf8"));
  assert(Number(observationAfterMissingEvidenceSync.rejectedReasons.missing_evidence_refs || 0) >= 1, "missing evidence refs must be rejected");

  const snapshot = buildGovernedMemoryRuntimeSnapshot({
    workspaceRoot: tempRoot,
    runtime,
    traceability,
  });
  const paths = getMemoryPaths(tempRoot);

  assert(syncResult.summary && syncResult.summary.status === "ready", "sync must return a ready summary");
  assert(snapshot && snapshot.status === "ready", "runtime snapshot must be ready");
  assert(fs.existsSync(paths.eventsPath), "memory event log must exist");
  assert(fs.existsSync(paths.retrieval.lastPackByWorkspace), "last pack by workspace must exist");
  assert(fs.existsSync(paths.output.latestOverviewJson), "latest overview json must exist");
  assert(fs.existsSync(paths.output.latestOverviewMd), "latest overview markdown must exist");
  assert(fs.existsSync(path.join(paths.projections.workspaceProgressRoot, `${snapshot.workspaceId}.json`)), "workspace progress projection must exist");
  assert(fs.existsSync(path.join(paths.projections.continuityStateRoot, "latest.json")), "continuity projection must exist");
  assert(fs.existsSync(path.join(paths.projections.observationStateRoot, "latest.json")), "observation projection must exist");
  assert(fs.existsSync(path.join(paths.projections.readinessRoot, "latest.json")), "readiness projection must exist");
  assert(snapshot.latestPack && snapshot.latestPack.selectedCount >= 1, "runtime snapshot must expose a selected pack");
  assert(String(snapshot.canonicalRoot || "").includes("runtime_state/memory"), "snapshot must expose canonical root");
  assert(String(snapshot.outputRoot || "").includes("output/memory"), "snapshot must expose output root");
  assert(syncResult.pack && safeObject(syncResult.pack.sections), "compiled pack must expose sectioned selections");
  assert(syncResult.pack && safeObject(syncResult.pack.context), "compiled pack must expose retrieval context");
  assert(Array.isArray(syncResult.pack && syncResult.pack.selectedMemoryIds), "compiled pack must expose selectedMemoryIds");
  assert(safeObject(syncResult.pack && syncResult.pack.selectionReasons), "compiled pack must expose selectionReasons");
  assert(typeof syncResult.pack.packId === "string" && syncResult.pack.packId.length >= 8, "compiled pack must expose packId");
  assert(typeof syncResult.pack.generatedAt === "string" && syncResult.pack.generatedAt, "compiled pack must expose generatedAt");
  assert(syncResult.pack.selectedCount <= 6, "compiled pack must respect the default pack budget");
  assert((syncResult.pack.sectionCounts.spec || 0) <= 2, "compiled pack must respect the spec section budget");
  assert((syncResult.pack.sectionCounts.intent || 0) <= 1, "compiled pack must respect the intent section budget");
  assert((syncResult.pack.sectionCounts.workspace_progress || 0) <= 1, "compiled pack must respect the workspace section budget");
  assert((syncResult.pack.sectionCounts.experience || 0) <= 1, "compiled pack must respect the experience section budget");
  assert((syncResult.pack.sectionCounts.semantic || 0) <= 1, "compiled pack must respect the semantic section budget");
  assert((syncResult.pack.sectionCounts.preference || 0) <= 1, "compiled pack must respect the preference section budget");
  for (const memoryId of syncResult.pack.selectedMemoryIds) {
    const reason = syncResult.pack.selectionReasons[memoryId];
    assert(reason && typeof reason === "object", `selection reason must exist for ${memoryId}`);
    assert(Number(reason.score) >= 0.18, `selection reason must satisfy minimum selection score for ${memoryId}`);
  }
  assert(Array.isArray(snapshot.staleMemoryWarnings), "runtime snapshot must expose staleMemoryWarnings");
  assert(Array.isArray(snapshot.recentPromotions), "runtime snapshot must expose recentPromotions");
  assert(Array.isArray(snapshot.recentRevocations), "runtime snapshot must expose recentRevocations");
  assert(Array.isArray(snapshot.workspaceProgress && snapshot.workspaceProgress.recentTouchedPaths), "runtime snapshot must expose continuity-enriched recentTouchedPaths");
  assert(snapshot.workspaceProgress.recentTouchedPaths.includes("server.js"), "workspace progress must be enriched from continuity state");
  assert(Array.isArray(snapshot.workspaceProgress.nextRecommendedActions) && snapshot.workspaceProgress.nextRecommendedActions.length >= 1, "workspace progress must include next recommended actions");

  const eventRecords = fs.readFileSync(paths.eventsPath, "utf8")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line));
  assert(eventRecords.some((entry) => entry.eventType === "memory_item_upsert"), "event log must contain memory_item_upsert");
  assert(eventRecords.some((entry) => entry.eventType === "memory_pack_compiled"), "event log must contain memory_pack_compiled");
  assert(eventRecords.some((entry) => entry.eventType === "memory_observation_recorded"), "event log must contain memory_observation_recorded");
  assert(eventRecords.some((entry) => entry.eventType === "memory_observation_rejected" && entry.reason === "duplicate_observation"), "event log must contain duplicate observation rejections");
  assert(eventRecords.some((entry) => entry.eventType === "memory_observation_rejected" && entry.reason === "missing_evidence_refs"), "event log must contain missing evidence rejections");
  assert(eventRecords.some((entry) => entry.eventType === "continuity_lifecycle_transition"), "event log must contain continuity lifecycle transitions");
  for (const entry of eventRecords) {
    assert(typeof entry.eventId === "string" && entry.eventId, "event log entries must include eventId");
    assert(typeof entry.memoryId === "string" && entry.memoryId, "event log entries must include memoryId");
    assert(typeof entry.memoryType === "string" && entry.memoryType, "event log entries must include memoryType");
    assert(typeof entry.status === "string" && entry.status, "event log entries must include status");
    assert(typeof entry.sourceTier === "string" && entry.sourceTier, "event log entries must include sourceTier");
    assert(Number.isFinite(Number(entry.authorityTier)), "event log entries must include authorityTier");
  }

  console.log("governed_memory_graph_test: ok");
}

function safeObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

main();
