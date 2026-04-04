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
    observationStatus: "starved",
    observationCount: 0,
    proposalOnlyCount: 0,
    blockedCount: 0,
    awaitingObservationCount: 1,
    policyDisabledCandidateCount: 0,
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

module.exports = {
  createGovernedMemoryPublicFixtureRuntime,
  createGovernedMemoryPublicFixtureTraceability,
  seedGovernedMemoryPublicCompatibilityArtifacts,
};
