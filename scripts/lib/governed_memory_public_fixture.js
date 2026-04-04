"use strict";

const fs = require("fs");
const path = require("path");

function writeJson(targetPath, value) {
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  fs.writeFileSync(targetPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function createGovernedMemoryPublicFixtureRuntime() {
  return {
    activeAgent: "default",
    latestTurn: {
      turn_id: "turn-governed-public-001",
      thread_id: "thread-governed-public-001",
      agent_name: "default",
      status: "completed",
      task_outcome_status: "COMPLETED",
      task_outcome_reason: "all checks passed",
      family_completion_gate: {
        applies: false,
        status: "not_applicable",
        taskFamily: "deterministic_code",
      },
    },
    intentFirst: {
      mode: "intent-first",
      contractPath: "scripts/config/design_acceptance_contract.json",
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
          mustHaves: ["Visual review"],
          avoid: ["uniform card dashboards"],
          benchmarkUrls: ["https://www.suruga-k.jp/"],
          updatedAt: "2026-04-04T09:00:00.000Z",
        },
      },
    },
    executionOverview: {
      recent: [
        {
          turnId: "turn-governed-public-001",
          threadId: "thread-governed-public-001",
          agentName: "default",
          status: "completed",
          taskOutcomeStatus: "COMPLETED",
          taskOutcomeReason: "all checks passed",
          executionProfile: "full-runtime",
          completedAt: "2026-04-04T09:30:00.000Z",
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
          runId: "eval-public-001",
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
      trackedArticles: 2,
      ledgerPath: "output/openai_blog_learning_ledger.json",
      digestPath: "output/openai_blog_learning_digest.json",
      curatedDocPath: "docs/OPENAI_DEVELOPER_LEARNINGS.md",
      runtimeRetrieval: {
        applyToAgents: ["default", "frontend_worker"],
        applyToTaskFamilies: ["web_creative"],
      },
      selfImprovement: {
        nextPriority: {
          title: "Run long horizon tasks with Codex",
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
          lessonSummary: "Keep self-improvement proposal-only until evidence is stable.",
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

function createGovernedMemoryPublicFixtureSecondPassRuntime() {
  const runtime = createGovernedMemoryPublicFixtureRuntime();
  runtime.latestTurn = {
    ...runtime.latestTurn,
    turn_id: "turn-governed-public-002",
    status: "completed",
    task_outcome_status: "COMPLETED",
    task_outcome_reason: "reused governed memory pack and passed validation",
  };
  runtime.executionOverview = {
    ...runtime.executionOverview,
    recent: [
      {
        turnId: "turn-governed-public-002",
        threadId: "thread-governed-public-001",
        agentName: "default",
        status: "completed",
        taskOutcomeStatus: "COMPLETED",
        taskOutcomeReason: "reused governed memory pack and passed validation",
        executionProfile: "full-runtime",
        completedAt: "2026-04-04T10:05:00.000Z",
        fileChanges: 3,
        commandExecutions: 1,
        collabCalls: 0,
      },
      ...(Array.isArray(runtime.executionOverview && runtime.executionOverview.recent)
        ? runtime.executionOverview.recent
        : []),
    ],
  };
  runtime.evalHistory = {
    ...runtime.evalHistory,
    recentRuns: [
      {
        runId: "eval-public-002",
        suiteId: "governed-memory-public.v1",
        variantLabel: "reuse-proof",
        scoreRate: 1,
        passRate: 1,
        failedCases: 0,
        probePersistedRecords: 3,
        generatedAt: "2026-04-04T10:08:00.000Z",
      },
      ...(Array.isArray(runtime.evalHistory && runtime.evalHistory.recentRuns)
        ? runtime.evalHistory.recentRuns
        : []),
    ],
  };
  return runtime;
}

function createGovernedMemoryPublicFixtureTraceability() {
  return {
    changedPaths: ["server.js", "docs/CONTEXT_MEMORY_POLICY.md"],
    operatorSummaryPath: "logs/current/operator_summary.json",
    manifestPath: "logs/current/index.json",
    summary: "Governed memory public export fixture.",
  };
}

function seedGovernedMemoryPublicCompatibilityArtifacts(root) {
  writeJson(path.join(root, "output", "openai_blog_learning_ledger.json"), {
    summary: { trackedArticles: 2 },
    articles: [{ articleId: "run-long-horizon-tasks-with-codex", title: "Run long horizon tasks with Codex" }],
  });
  writeJson(path.join(root, "output", "openai_blog_learning_digest.json"), {
    summary: { trackedArticles: 2 },
    pendingProposals: [],
  });
  writeJson(path.join(root, "output", "openai_blog_self_improvement_state.json"), {
    gateStatus: "PASS",
    gateReason: "all_cases_passed",
    appliedDecision: "applied",
    appliedHintCount: 1,
    appliedHintIds: ["live-governed-memory-runtime-retrieval"],
    observationStatus: "starved",
    observationCount: 0,
    proposalOnlyCount: 0,
    blockedCount: 0,
    awaitingObservationCount: 1,
    policyDisabledCandidateCount: 0,
    appliedHints: [
      {
        proposalId: "openai-blog-live-governed-memory-self-improvement",
        articleId: "run-long-horizon-tasks-with-codex",
        title: "Run long horizon tasks with Codex",
        runtimeRetrievalHint: {
          hintId: "live-governed-memory-runtime-retrieval",
          appliesToAgents: ["default", "intake"],
          appliesToTaskFamilies: ["deterministic_code"],
          topics: ["codex", "automation", "context"],
          lexicalTriggers: ["continuity", "validation", "evidence"],
          preferredArticleIds: ["run-long-horizon-tasks-with-codex"],
          topicBoost: 3,
          articleBoost: 8
        }
      }
    ],
    nextPriority: {
      title: "Run long horizon tasks with Codex",
      changeType: "frontend_quality_note",
      readinessStatus: "awaiting_observations",
      gatingReason: "awaiting_runtime_observations",
      nextAction: "Record 2 successful targeted observations before promotion.",
    },
  });
  writeJson(path.join(root, "output", "openai_blog_self_improvement_gate.json"), { status: "PASS" });
  writeJson(path.join(root, "output", "openai_blog_reinforcement_memory.json"), { observationCount: 0 });
  writeJson(path.join(root, "output", "anthropic_engineering_learning_ledger.json"), {
    summary: { trackedArticles: 1 },
    articles: [{ articleId: "demystifying-evals-for-ai-agents", title: "Demystifying evals for AI agents" }],
  });
  writeJson(path.join(root, "output", "anthropic_engineering_learning_digest.json"), {
    summary: { trackedArticles: 1 },
    pendingProposals: [],
  });
  writeJson(path.join(root, "output", "anthropic_engineering_self_improvement_state.json"), {
    gateStatus: "PASS",
    gateReason: "no_auto_apply_candidates",
    appliedDecision: "none",
    observationStatus: "disabled",
    observationCount: 0,
    proposalOnlyCount: 2,
    blockedCount: 0,
    awaitingObservationCount: 0,
    policyDisabledCandidateCount: 1,
    nextPriority: {
      title: "Demystifying evals for AI agents",
      changeType: "frontend_quality_note",
      readinessStatus: "proposal_only",
      gatingReason: "promotion_policy_proposal_only",
      nextAction: "Keep this note proposal-only.",
    },
  });
  writeJson(path.join(root, "output", "anthropic_engineering_self_improvement_gate.json"), { status: "PASS" });
}

function seedContinuityTask(root, task) {
  const taskRoot = path.join(root, "logs", "archive", "raw", "runtime_state", "continuity", "tasks", task.taskId);
  writeJson(path.join(taskRoot, "task_state.json"), {
    taskId: task.taskId,
    title: task.title,
    objective: task.objective || task.title,
    familyId: task.familyId,
    role: task.role,
    parentTaskId: task.parentTaskId || "",
    rootTaskId: task.rootTaskId || task.taskId,
    updatedAt: task.updatedAt,
    recentTouchedPaths: task.recentTouchedPaths || [],
    nextRecommendedActions: task.nextRecommendedActions || [],
    blockers: task.blockers || [],
    knownRisks: task.knownRisks || [],
    lastVerifierVerdict: task.lastVerifierVerdict || "",
  });
  writeJson(path.join(taskRoot, "plan_state.json"), {
    taskFamily: task.familyId,
    updatedAt: task.updatedAt,
    stepCount: task.stepCount || 0,
    steps: Array.from({ length: task.stepCount || 0 }, (_, index) => ({ stepId: `step-${index + 1}` })),
    replanCount: task.replanCount || 0,
  });
  writeJson(path.join(taskRoot, "verifier_state.json"), {
    updatedAt: task.updatedAt,
    lastVerifierVerdict: task.lastVerifierVerdict || "",
    reason: task.verifierReason || "",
    checkpoints: Array.from({ length: task.verifierCheckpointCount || 0 }, (_, index) => ({ checkpointId: `checkpoint-${index + 1}` })),
    blockers: task.blockers || [],
  });
  writeJson(path.join(taskRoot, "closeout_summary.json"), {
    updatedAt: task.updatedAt,
    outcome: task.closeoutOutcome || task.lifecycleState,
    finalReleaseState: task.finalReleaseState || "",
    knownBlockers: task.blockers || [],
    knownRisks: task.knownRisks || [],
    recentTouchedPaths: task.recentTouchedPaths || [],
    nextRecommendedActions: task.nextRecommendedActions || [],
    taskFamily: task.familyId,
  });
  writeJson(path.join(taskRoot, "integration_summary.json"), {
    updatedAt: task.updatedAt,
    status: task.integrationStatus || "",
    finalReleaseState: task.finalReleaseState || "",
    changedPaths: task.recentTouchedPaths || [],
    nextRecommendedActions: task.nextRecommendedActions || [],
    knownRisks: task.knownRisks || [],
  });
  writeJson(path.join(taskRoot, "agent_graph.json"), task.agentTree || {});
  writeJson(path.join(taskRoot, "lifecycle_events.jsonl"), []);
  fs.mkdirSync(path.join(taskRoot, "archive"), { recursive: true });
  fs.writeFileSync(path.join(taskRoot, "lifecycle_events.jsonl"), [
    JSON.stringify({
      eventType: "task_created",
      recordedAt: task.updatedAt,
      lifecycleState: task.lifecycleState,
    }),
  ].join("\n") + "\n", "utf8");
}

function seedGovernedMemoryPublicContinuityArtifacts(root) {
  const continuityRoot = path.join(root, "logs", "archive", "raw", "runtime_state", "continuity");
  const updatedAt = "2026-04-04T10:12:00.000Z";
  writeJson(path.join(continuityRoot, "task_registry.json"), {
    schema: "long-horizon-task-registry.v1",
    updatedAt,
    tasks: [
      {
        taskId: "continuity-root-001",
        title: "Close the governed memory rollout",
        lifecycleState: "completed",
        status: "COMPLETED",
        updatedAt,
        role: "intake",
        familyId: "deterministic_code",
        rootTaskId: "continuity-root-001",
        parentTaskId: "",
        childCount: 2,
        integrationStatus: "released",
        lastVerifierVerdict: "PASS",
      },
      {
        taskId: "continuity-child-001",
        title: "Audit planning handoff",
        lifecycleState: "blocked",
        status: "PARTIAL",
        updatedAt: "2026-04-04T10:10:00.000Z",
        role: "reviewer",
        familyId: "planning",
        rootTaskId: "continuity-root-001",
        parentTaskId: "continuity-root-001",
        childCount: 0,
        integrationStatus: "pending",
        lastVerifierVerdict: "PASS",
      },
      {
        taskId: "continuity-child-002",
        title: "Verify release evidence",
        lifecycleState: "verifier_failed",
        status: "FAILED_VALIDATION",
        updatedAt: "2026-04-04T10:11:00.000Z",
        role: "tester",
        familyId: "evaluation_review",
        rootTaskId: "continuity-root-001",
        parentTaskId: "continuity-root-001",
        childCount: 0,
        integrationStatus: "pending",
        lastVerifierVerdict: "FAIL",
      },
    ],
  });
  seedContinuityTask(root, {
    taskId: "continuity-root-001",
    title: "Close the governed memory rollout",
    objective: "Ship governed memory and close validation gaps.",
    familyId: "deterministic_code",
    role: "intake",
    lifecycleState: "completed",
    updatedAt,
    stepCount: 5,
    replanCount: 1,
    verifierCheckpointCount: 2,
    integrationStatus: "released",
    lastVerifierVerdict: "PASS",
    recentTouchedPaths: ["server.js", "scripts/lib/governed_memory_graph.js"],
    nextRecommendedActions: ["export the live public memory proof", "track observation density"],
    knownRisks: ["observation backlog still needs to grow"],
    closeoutOutcome: "completed",
    finalReleaseState: "released",
    agentTree: {
      role: "intake",
      children: [
        { role: "reviewer", taskId: "continuity-child-001" },
        { role: "tester", taskId: "continuity-child-002" },
      ],
    },
  });
  seedContinuityTask(root, {
    taskId: "continuity-child-001",
    title: "Audit planning handoff",
    objective: "Audit planning handoff",
    familyId: "planning",
    role: "reviewer",
    parentTaskId: "continuity-root-001",
    rootTaskId: "continuity-root-001",
    lifecycleState: "blocked",
    updatedAt: "2026-04-04T10:10:00.000Z",
    stepCount: 2,
    verifierCheckpointCount: 1,
    integrationStatus: "pending",
    lastVerifierVerdict: "PASS",
    blockers: ["integration pending on reviewer notes"],
    recentTouchedPaths: ["docs/CONTEXT_MEMORY_POLICY.md"],
    nextRecommendedActions: ["merge reviewer notes into release packet"],
    knownRisks: ["handoff drift can reappear after refactor"],
    closeoutOutcome: "blocked",
    finalReleaseState: "pending",
  });
  seedContinuityTask(root, {
    taskId: "continuity-child-002",
    title: "Verify release evidence",
    objective: "Verify release evidence",
    familyId: "evaluation_review",
    role: "tester",
    parentTaskId: "continuity-root-001",
    rootTaskId: "continuity-root-001",
    lifecycleState: "verifier_failed",
    updatedAt: "2026-04-04T10:11:00.000Z",
    stepCount: 3,
    verifierCheckpointCount: 2,
    integrationStatus: "pending",
    lastVerifierVerdict: "FAIL",
    verifierReason: "missing release evidence packet",
    blockers: ["release packet missing memory eval screenshot"],
    recentTouchedPaths: ["output/memory_public/latest_overview.json"],
    nextRecommendedActions: ["capture release evidence packet", "rerun verifier"],
    knownRisks: ["release proof can drift without rerun"],
    closeoutOutcome: "verifier_failed",
    finalReleaseState: "pending",
  });
}

function createAgiBundle({
  runId,
  generatedAt,
  rawFinalScore,
  displayFinalScore,
  cvar,
  promote,
  blockedReasons,
  breadthBase,
  candidateId = "candidate-main",
  incumbentIdentifier = "incumbent-live",
  challengerIdentifier = runId,
  reasons = null,
}) {
  const coverageRows = [
    ["deterministic_code", breadthBase + 0.10],
    ["web_creative", breadthBase + 0.06],
    ["planning", breadthBase + 0.04],
    ["workflow_execution", breadthBase + 0.02],
    ["evaluation_review", breadthBase + 0.01],
    ["tool_use_browser_like", breadthBase - 0.03],
  ];
  const family = (value, threshold = 0.7, supportStatus = "supported", details = {}) => ({
    main: {
      value,
      threshold,
      supportStatus,
      passFail: value >= threshold,
      details,
    },
  });
  return {
    schema: "agi-v1-bundle.v1",
    generatedAt,
    runId,
    profile: "agi_v1",
    laneId: "public",
    suiteId: "agi_v1_live",
    candidate: {
      generatedAt,
      runId,
      candidateId,
      rawFinalScore,
      displayFinalScore,
      blockingReasons: blockedReasons || [],
      familySummaries: {
        G_breadth: family(0.78, 0.7, "supported", {
          matrix: coverageRows.map(([domainFamily, domainScore]) => ({ domainFamily, domainScore })),
        }),
        G_depth: family(0.74),
        A_adapt: family(0.69),
        R_robust: family(0.71),
        H_horizon: family(0.66, 0.65, "supported", { unit: "continuity_steps" }),
        P_context: family(0.79),
        I_eval: family(0.98, 0.95),
        S_trust: family(0.94, 0.9),
        C_corr: family(0.92, 0.9),
        E_epi: family(0.9, 0.85),
      },
      riskSummary: {
        cvar,
        supportStatus: "supported",
      },
    },
    promotionDecision: {
      incumbentIdentifier,
      challengerIdentifier,
      promote,
      blockingConditions: blockedReasons || [],
      reasons: Array.isArray(reasons) ? reasons : promote ? ["all_gates_pass"] : ["promotion_margin_not_met"],
    },
  };
}

function seedGovernedMemoryPublicAgiReadinessArtifacts(root) {
  writeJson(
    path.join(root, "output", "agi_v1", "seed-run-001", "agi_v1_bundle.json"),
    createAgiBundle({
      runId: "agi-live-001",
      generatedAt: "2026-04-04T09:20:00.000Z",
      rawFinalScore: 0.58,
      displayFinalScore: 0.58,
      cvar: 0.14,
      promote: false,
      blockedReasons: ["promotion_margin_not_met"],
      breadthBase: 0.62,
    })
  );
  writeJson(
    path.join(root, "output", "agi_v1", "seed-run-002", "agi_v1_bundle.json"),
    createAgiBundle({
      runId: "agi-live-002",
      generatedAt: "2026-04-04T10:20:00.000Z",
      rawFinalScore: 0.64,
      displayFinalScore: 0.64,
      cvar: 0.09,
      promote: true,
      blockedReasons: [],
      breadthBase: 0.68,
      candidateId: "candidate-main",
      incumbentIdentifier: "candidate-main",
      challengerIdentifier: "candidate-main",
      reasons: ["challenger_strictly_beats_incumbent_under_fail_closed_rule"],
    })
  );
}

module.exports = {
  createGovernedMemoryPublicFixtureRuntime,
  createGovernedMemoryPublicFixtureSecondPassRuntime,
  createGovernedMemoryPublicFixtureTraceability,
  seedGovernedMemoryPublicCompatibilityArtifacts,
  seedGovernedMemoryPublicContinuityArtifacts,
  seedGovernedMemoryPublicAgiReadinessArtifacts,
};
