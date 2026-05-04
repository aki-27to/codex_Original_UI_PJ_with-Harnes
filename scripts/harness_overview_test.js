#!/usr/bin/env node
"use strict";

const assert = require("assert");
const fs = require("fs");
const http = require("http");
const path = require("path");
const vm = require("vm");
const { startInProcessHarnessServer } = require("./lib/in_process_harness_server");
const { buildHarnessOverviewPayload } = require("./lib/harness_overview_surface");
const { spawnNodeScript } = require("./lib/process_invocation");
const { resolveServerImplementationPath } = require("./lib/server_source_path");

const workspaceRoot = path.resolve(__dirname, "..");
const { implementationPath: serverJsPath } = resolveServerImplementationPath(workspaceRoot);
const overviewHtmlPath = path.join(workspaceRoot, "web", "01.HarnesUI", "overview.html");
const overviewJsPath = path.join(workspaceRoot, "web", "01.HarnesUI", "overview.js");
const indexHtmlPath = path.join(workspaceRoot, "web", "01.HarnesUI", "index.html");
const requestHandlerPath = path.join(workspaceRoot, "server", "request_handler.js");
const overviewRoutesPath = path.join(workspaceRoot, "server", "routes", "overview_routes.js");

function readFile(filePath) {
  return fs.readFileSync(filePath, "utf8");
}

function assertRegex(source, regex, message) {
  assert(regex.test(source), message);
}

function runCheck(name, fn) {
  try {
    const detail = fn();
    console.log(`PASS ${name}${detail ? ` :: ${detail}` : ""}`);
    return { ok: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`FAIL ${name} :: ${message}`);
    return { ok: false, error: message };
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function flushMicrotasks() {
  return Promise.resolve().then(() => Promise.resolve());
}

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function createClassList() {
  const set = new Set();
  return {
    add(...tokens) {
      for (const token of tokens) {
        if (token) {
          set.add(String(token));
        }
      }
    },
    remove(...tokens) {
      for (const token of tokens) {
        set.delete(String(token));
      }
    },
    contains(token) {
      return set.has(String(token));
    },
    toggle(token, force) {
      const normalized = String(token);
      if (force === true) {
        set.add(normalized);
        return true;
      }
      if (force === false) {
        set.delete(normalized);
        return false;
      }
      if (set.has(normalized)) {
        set.delete(normalized);
        return false;
      }
      set.add(normalized);
      return true;
    },
    toString() {
      return Array.from(set).join(" ");
    },
  };
}

function createElementStub() {
  return {
    textContent: "",
    innerHTML: "",
    className: "",
    onclick: null,
    classList: createClassList(),
  };
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function mergeObjects(base, override) {
  if (!isPlainObject(base) || !isPlainObject(override)) {
    return override === undefined ? base : override;
  }
  const merged = { ...base };
  for (const [key, value] of Object.entries(override)) {
    if (isPlainObject(value) && isPlainObject(base[key])) {
      merged[key] = mergeObjects(base[key], value);
      continue;
    }
    merged[key] = value;
  }
  return merged;
}

function assertContains(source, expected, message) {
  assert(String(source || "").includes(expected), `${message} :: missing ${expected}`);
}

function countOccurrences(source, expected) {
  const text = String(source || "");
  const needle = String(expected || "");
  if (!needle) return 0;
  return text.split(needle).length - 1;
}

function payloadActiveAgent(payload) {
  return String(payload && payload.runtime && payload.runtime.activeAgent ? payload.runtime.activeAgent : "unreported");
}

function payloadDefaultExecAgent(payload) {
  const value = payload
    && payload.runtime
    && payload.runtime.fullUtilization
    && payload.runtime.fullUtilization.actual
    && payload.runtime.fullUtilization.actual.defaultExecAgent;
  return String(value || "unreported");
}

function extractHtmlIds(html) {
  const ids = new Set();
  const regex = /id=\"([^\"]+)\"/g;
  let match = regex.exec(html);
  while (match) {
    ids.add(match[1]);
    match = regex.exec(html);
  }
  return ids;
}

function extractOverviewElementIds(source) {
  const ids = new Set();
  const regex = /by\(\"([^\"]+)\"\)/g;
  let match = regex.exec(source);
  while (match) {
    ids.add(match[1]);
    match = regex.exec(source);
  }
  return Array.from(ids);
}

function createOverviewPayload(overrides = {}) {
  const payload = {
    mode: "harness-overview",
    generatedAt: 0,
    runtime: {
      activeAgent: "default",
      sessionRef: "session-01",
      executionProfile: "full-runtime",
      agentCount: 4,
      fullUtilization: {
        ready: true,
        actual: {
          defaultExecAgent: "default",
          requestUserInputPolicy: "blocked",
          adversarialShadowEnabled: 1,
          adversarialLoopEnabled: 1,
          adversarialLoopMaxRetries: 1,
        },
        checks: {
          defaultExecAgentIsDefault: 1,
        },
      },
      nonInteractiveUserInput: {
        policy: "blocked",
        envKey: "CODEX_REQUEST_USER_INPUT_POLICY",
      },
      parentDispatchGuard: {
        mode: "enforce",
        maxRetries: 1,
      },
      adversarialShadow: {
        enabled: true,
        loop: {
          maxRetries: 1,
        },
      },
      requirementGuard: {
        enabled: true,
        rbj: {
          enabled: true,
        },
        planningMode: {
          version: "planning-mode-contract.v1",
          assuranceVersion: "assurance-mode-contract.v1",
        },
      },
      planningContracts: {
        schema: "planning-mode-contract.v1",
        path: "scripts/config/planning_mode_contract.json",
        assuranceSchema: "assurance-mode-contract.v1",
        assurancePath: "scripts/config/assurance_depth_contract.json",
        familyProfileSchema: "task-family-profiles.v1",
        familyProfilePath: "scripts/config/task_family_profiles.json",
        families: ["deterministic_code", "web_creative", "research_analysis", "planning_design"],
      },
      phaseStatus: {
        requirementFoundationV1: "done",
        completedAt: "2026-03-22T12:00:00.000Z",
        auditReportPath: "output/phase_exit_requirement_foundation_v1.json",
        markdownReportPath: "output/phase_exit_requirement_foundation_v1.md",
        lastAuditStatus: "PASS",
        failedCheckIds: [],
      },
      externalLearning: {
        enabled: true,
        running: false,
        mode: "observe_propose_and_doc_sync",
        sourceName: "OpenAI Developers Blog",
        sourceUrl: "https://developers.openai.com/blog",
        allowedHosts: ["developers.openai.com"],
        intervalMinutes: 1440,
        lastRunAt: "2026-03-23T00:00:00.000Z",
        lastSuccessAt: "2026-03-23T00:00:00.000Z",
        nextRunAt: "2026-03-24T00:00:00.000Z",
        lastStatus: "PASS",
        lastReason: "startup",
        trackedArticles: 4,
        newArticlesThisRun: 1,
        pendingProposalCount: 2,
        blockedTargetCount: 0,
        promotedDocUpdates: 4,
        ledgerPath: "output/openai_blog_learning_ledger.json",
        digestPath: "output/openai_blog_learning_digest.json",
        reportPath: "output/openai_blog_learning_report.md",
        curatedDocPath: "docs/OPENAI_DEVELOPER_LEARNINGS.md",
        runtimeRetrieval: {
          enabled: true,
          shadowMode: false,
          applyToAgents: ["default", "frontend_worker"],
          applyToTaskFamilies: ["web_creative"],
          lastStatus: "APPLIED",
          lastReason: "guarded_runtime_injection",
          lastAppliedAt: "2026-03-23T00:10:00.000Z",
          lastAgentName: "default",
          lastTaskFamily: "web_creative",
          lastMatchedTopics: ["frontend", "evals"],
          lastArticleIds: ["designing-delightful-frontends-with-gpt-5-4"],
          lastPromptBlockChars: 612,
        },
        selfImprovement: {
          enabled: true,
          promotionMode: "machine_guarded_autonomy",
          gateStatus: "PASS",
          gateReason: "all_cases_passed",
          appliedDecision: "applied",
          appliedHintCount: 2,
          rawAutoApplyChangeCount: 3,
          autoApplyCandidateCount: 2,
          observationStatus: "starved",
          observationCount: 0,
          lastObservedAt: "",
          requiredObservationSuccesses: 2,
          requiredObservationSuccessRate: 0.67,
          awaitingObservationCount: 1,
          awaitingReinforcementCount: 0,
          policyDisabledCandidateCount: 0,
          proposalOnlyCount: 1,
          blockedCount: 0,
          failedCaseIds: [],
          appliedHintIds: ["designing-delightful-frontends-with-gpt-5-4-runtime-retrieval"],
          nextPriority: {
            title: "Designing delightful frontends with GPT-5.4 | OpenAI Developers",
            readinessStatus: "awaiting_observations",
            gatingReason: "awaiting_runtime_observations",
            nextAction: "Record 2 successful targeted observations before promotion.",
            blastRadius: "low",
            reinforcement: {
              successCount: 0,
              observedCount: 0,
              requiredSuccesses: 2,
              requiredSuccessRate: 0.67,
              remainingSuccesses: 2,
              successRate: 0,
              lastObservedAt: "",
              status: "unobserved",
            },
          },
          priorityBacklog: [
            {
              title: "Designing delightful frontends with GPT-5.4 | OpenAI Developers",
              changeType: "frontend_quality_note",
                readinessStatus: "awaiting_observations",
                gatingReason: "awaiting_runtime_observations",
                nextAction: "Record 2 successful targeted observations before promotion.",
                blastRadius: "low",
                reinforcement: {
                  successCount: 0,
                  observedCount: 0,
                  requiredSuccesses: 2,
                  requiredSuccessRate: 0.67,
                  remainingSuccesses: 2,
                  successRate: 0,
                  lastObservedAt: "",
                  status: "unobserved",
                },
              },
            ],
          proposalDir: "output/openai_blog_self_improvement_proposals",
          statePath: "output/openai_blog_self_improvement_state.json",
          gatePath: "output/openai_blog_self_improvement_gate.json",
          promotionPolicyPath: "scripts/config/self_improvement_promotion_policy.json",
        },
        recentArticles: [
          {
            articleId: "run-long-horizon-tasks-with-codex",
            title: "Run long horizon tasks with Codex",
            url: "https://developers.openai.com/blog/run-long-horizon-tasks-with-codex",
            relevance: "high",
            indexDateLabel: "Feb 23",
            topicTags: ["codex", "automation"],
          },
        ],
        pendingProposals: [
          {
            title: "Run long horizon tasks with Codex",
            target: "docs/CONTEXT_MEMORY_POLICY.md",
            status: "proposal_only",
          },
        ],
        freezeAware: {
          requirementFoundationV1: "bug_fix_only",
          blockedApplyTargets: ["AGENTS.md"],
        },
      },
      documentTooling: {
        status: "ready",
        availableCount: 2,
        missingCount: 1,
        hubScriptPath: "scripts/document_tooling.js",
        guidePath: "docs/DOCUMENT_TOOLING_GUIDE.md",
        bootstrapCommand: "node scripts/document_tooling.js bootstrap",
        localInstallMode: "workspace-local",
        toolRoot: ".tooling/document-tools",
        venvPath: ".tooling/document-tools/venv",
        binPath: ".tooling/document-tools/bin",
        jdkPath: ".tooling/document-tools/jdk",
        exampleCommands: {
          bootstrap: "node scripts/document_tooling.js bootstrap",
          status: "node scripts/document_tooling.js status",
          recommend: "node scripts/document_tooling.js recommend \"convert a DOCX and PPTX bundle into markdown\"",
          runMarkItDown: "node scripts/document_tooling.js run markitdown -- input.pdf -o output.md",
          runOpenDataLoader: "node scripts/document_tooling.js run opendataloader-pdf -- input.pdf --format markdown",
          runSkillNet: "node scripts/document_tooling.js run skillnet -- search \"design review\"",
        },
        tools: [
          {
            id: "markitdown",
            name: "Microsoft MarkItDown",
            installed: true,
            version: "markitdown 0.1.5",
          },
          {
            id: "opendataloader-pdf",
            name: "OpenDataLoader PDF",
            installed: false,
            version: "",
          },
          {
            id: "skillnet",
            name: "SkillNet",
            installed: true,
            version: "skillnet 0.0.18",
          },
        ],
        recommendedRoutes: [
          {
            label: "Mixed office documents to Markdown",
            toolId: "markitdown",
          },
          {
            label: "Structured PDF extraction and accessibility-heavy parsing",
            toolId: "opendataloader-pdf",
          },
          {
            label: "Skill lifecycle search, evaluation, and relationship analysis",
            toolId: "skillnet",
          },
        ],
      },
      authorityRegistry: {
        schema: "authority-registry.v1",
        registryPath: "scripts/config/authority_registry.json",
        driftStatus: "aligned",
        singleSupremePath: "docs/HARNESS_CONSTITUTION.md",
        precedence: [
          { order: 1, id: "supreme_frozen_constitution", path: "docs/HARNESS_CONSTITUTION.md", role: "single supreme frozen constitution" },
          { order: 2, id: "operational_constitution", path: "AGENTS.md", role: "operational constitution / runtime behavior constraints" },
        ],
      },
      deploymentPosture: {
        schema: "deployment-posture-profiles.v1",
        profilePath: "scripts/config/deployment_posture_profiles.json",
        activeProfile: "portable_local",
        activeLabel: "Portable Local",
        referenceArchitectureDefault: 1,
        profiles: [
          { id: "owner_local", label: "Owner Local" },
          { id: "portable_local", label: "Portable Local" },
          { id: "reviewed_team", label: "Reviewed Team" },
        ],
      },
      secondaryLearning: {
        anthropicEngineering: {
          enabled: true,
          running: false,
          sourceTier: "secondary",
          sourceName: "Anthropic Engineering",
          sourceUrl: "https://www.anthropic.com/engineering",
          intervalMinutes: 1440,
          nextRunAt: "2026-03-24T00:00:00.000Z",
          lastStatus: "PASS",
          portabilityMode: "portable_principles_only",
          curatedDocPath: "docs/ANTHROPIC_ENGINEERING_LEARNINGS.md",
          recentArticles: [
            {
              title: "Demystifying evals for AI agents",
              url: "https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents",
              relevance: "high",
              portability: "portable",
              indexDateLabel: "Jan 09, 2026",
            },
          ],
          pendingProposals: [
            {
              title: "Demystifying evals for AI agents",
              target: "docs/CONTEXT_MEMORY_POLICY.md",
              status: "proposal_only",
            },
          ],
          selfImprovement: {
            enabled: true,
            promotionMode: "machine_guarded_autonomy",
            gateStatus: "PASS",
            gateReason: "no_auto_apply_candidates",
            appliedDecision: "none",
            appliedHintCount: 0,
            autoApplyCandidateCount: 0,
            rawAutoApplyChangeCount: 1,
            awaitingObservationCount: 0,
            awaitingReinforcementCount: 0,
            policyDisabledCandidateCount: 1,
            proposalOnlyCount: 2,
            blockedCount: 0,
            failedCaseIds: [],
            nextPriority: {
              title: "Effective harnesses for long-running agents",
              readinessStatus: "policy_disabled",
              gatingReason: "stabilization_disabled",
              nextAction: "Enable stabilization for this lane or keep the note proposal-only.",
              blastRadius: "low",
            },
            priorityBacklog: [
              {
                title: "Effective harnesses for long-running agents",
                changeType: "frontend_quality_note",
                readinessStatus: "policy_disabled",
                gatingReason: "stabilization_disabled",
                nextAction: "Enable stabilization for this lane or keep the note proposal-only.",
                blastRadius: "low",
              },
            ],
          },
        },
      },
      latestTurn: {
        turn_id: "turn-002",
        status: "failed",
        task_outcome_status: "FAILED_VALIDATION",
        family_completion_gate: {
          applies: true,
          status: "failed_validation",
          taskFamily: "web_creative",
          completionContract: "design_acceptance",
          missingHard: [{ label: "screenshot review", reason: "intent_visual_review_missing" }],
        },
      },
      conversationApi: {
        endpoint: "POST /api/conversation/direct",
        provider: "app-server",
        model: "gpt-5",
      },
      evidenceArtifacts: {
        root: "logs/archive/raw/turns",
        maxDays: 14,
      },
      idempotency: {
        ttlMs: 86400000,
        statusApi: {
          path: "/api/exec/idempotency/:key",
        },
      },
      harnessMemory: {
        storage: "logs/archive/raw/harness_execution_memory.json",
        retentionDays: 14,
      },
      governedMemory: {
        enabled: true,
        schema: "governed-memory-graph-runtime.v1",
        status: "ready",
        workspaceId: "workspace-001",
        canonicalRoot: "logs/archive/raw/runtime_state/memory",
        eventLogPath: "logs/archive/raw/runtime_state/memory/memory_events.jsonl",
        outputRoot: "output/memory",
        itemCount: 18,
        promotedCount: 9,
        eventCount: 42,
        typeCounts: {
          constitution_ref: 4,
          requirement_ref: 1,
          preference_signal: 1,
          workspace_progress: 1,
          episodic_event: 4,
          semantic_lesson: 3,
          improvement_candidate: 2,
          failure_pattern: 2,
        },
        statusCounts: {
          promoted: 9,
          captured: 4,
          shadow: 3,
          proposal_only: 1,
          blocked: 1,
        },
        workspaceProgress: {
          currentObjective: "Refresh the memory architecture around a governed canonical graph.",
          knownBlockers: ["screenshot review"],
          recentTouchedPaths: ["server.js", "docs/CONTEXT_MEMORY_POLICY.md"],
          nextRecommendedActions: ["Recover the latest failed validation before adding new scope."],
          updatedAt: "2026-04-04T10:00:00.000Z",
        },
        latestPack: {
          compiledAt: "2026-04-04T10:00:00.000Z",
          selectedCount: 6,
          activeAgent: "default",
          taskFamily: "web_creative",
          memoryIds: ["spec:agents", "intent:active_requirement_contract", "workspace:progress"],
        },
      },
      controlApi: {
        enabled: true,
        token: "",
        tokenRedacted: 1,
      },
      iterationControl: {
        schema: "iteration-control-contract.v1",
        path: "scripts/config/iteration_control_contract.json",
        releaseState: "fail_closed",
        improvementDeltaThreshold: 0.03,
        budgets: {
          wallClockMs: 3600000,
          stepBudget: 24,
          tokenBudget: 400000,
        },
        riskThresholds: {
          maxResidualRiskItems: 6,
          maxRequiredEvidenceFailures: 0,
        },
        failClosedConditions: [
          "goal_substitution_detected",
          "procedural_closure_without_adoption",
        ],
        validationFailureConditions: [
          "task_contract_integrity_below_threshold",
        ],
        retryConditions: [
          "artifact_quality_below_threshold",
        ],
      },
      adoptionReadinessContract: {
        schema: "adoption-readiness-evaluator-contract.v1",
        path: "scripts/config/adoption_readiness_evaluator_contract.json",
        dimensionCount: 7,
        hardGates: {
          literal_requirement_alignment: {
            min: 0.84,
            failureClass: "validation_failure",
          },
          boundary_compliance: {
            min: 0.99,
            failureClass: "fail_closed",
          },
        },
      },
      execApi: {
        replayApi: {
          listPath: "/api/replay/turns",
        },
        evalApi: {
          runPath: "POST /api/eval/run",
        },
      },
    },
    health: {
      slo: {
        status: "ready",
        sampleSize: 7,
        metrics: {
          failureRate: 0,
          p95LatencyMs: 1200,
        },
      },
      latestTurn: {
        turn_id: "turn-002",
        status: "failed",
        task_outcome_status: "FAILED_VALIDATION",
        agent_name: "default",
        execution_profile: "full-runtime",
        planning_mode: "NORMAL",
        planning_depth: "STANDARD_PLANNING",
        assurance_depth: "SIGNOFF_ASSURANCE",
        family_completion_gate: {
          applies: true,
          status: "failed_validation",
          taskFamily: "web_creative",
          completionContract: "design_acceptance",
          missingHard: [{ label: "screenshot review", reason: "intent_visual_review_missing" }],
        },
      },
    },
    topology: {
      summary: {
        total: 4,
        parents: 1,
        specialists: 1,
        verification: 1,
        retired: 1,
        active: 2,
      },
      lanes: {
        parents: [
          {
            name: "default",
            description: "Live parent",
            role: "parent",
            status: "ACTIVE",
            source: "runtime",
            active: true,
            sessionRef: "session-01",
            threadId: "thread-01",
            activeTurnId: "turn-002",
            configFile: ".codex/agents/default.toml",
            governance: {
              scopePaths: ["docs/CURRENT_ARCHITECTURE.md"],
            },
            skills: ["requirement-rbj"],
          },
        ],
        specialists: [
          {
            name: "backend_worker",
            description: "Backend specialist",
            role: "child",
            status: "COMPLETED",
            source: "runtime",
            active: true,
            governance: {
              scopePaths: ["server.js"],
            },
            skills: ["api-contract-testgen"],
          },
        ],
        verification: [
          {
            name: "reviewer",
            description: "Read-only review lane",
            role: "child",
            status: "CONFIGURED",
            source: "configured",
            governance: {
              readOnly: true,
            },
          },
        ],
        retired: [
          {
            name: "worker",
            description: "Legacy compatibility lane",
            role: "child",
            status: "CONFIGURED",
            source: "configured",
            governance: {
              legacyOnly: true,
              requiresParentOverride: true,
            },
          },
        ],
      },
    },
    contracts: {
      turn: {
        schema: "harness-turn-contract.v1",
        path: "scripts/config/harness_contract_spec.json",
        terminalEvent: "turn/completed",
        taskOutcomeBridge: {
          allowedByTurnState: {
            failed: ["FAILED_VALIDATION", "BLOCKED", "NEEDS_INPUT"],
          },
        },
      },
      taskOutcome: {
        statuses: ["COMPLETED", "FAILED_VALIDATION", "NEEDS_INPUT"],
        reasonMapKeys: ["parent_dispatch_guard_block", "approval_required"],
        path: "scripts/config/task_outcome_contract.json",
      },
      designAcceptance: {
        schema: "design-acceptance-contract.v1",
        path: "scripts/config/design_acceptance_contract.json",
      },
      governance: {
        path: "scripts/config/agent_governance_contracts.json",
        parentAgents: ["default", "intake", "release_manager"],
        contracts: {
          worker: {
            legacyOnly: true,
          },
        },
        exceptions: {
          parentOverride: {
            enabled: true,
            reasonMinLength: 32,
          },
        },
      },
    },
    evidence: {
      signoff: {
        storageRoot: "logs/bundles/signoff",
        latest: {
          name: "signoff-001",
          generatedAt: 1710000000000,
          summaryPath: "logs/bundles/signoff/signoff-001/signoff_summary.json",
          assertions: {
            allPassed: true,
          },
          runtime: {
            parentDispatchGuardMode: "enforce",
          },
          coreHarnessWorkflow: {
            suiteId: "core-harness-workflow.v4",
            passedCases: 13,
            sampleSize: 13,
          },
          naturalTask: {
            targetPath: "docs/CURRENT_ARCHITECTURE.md",
            reviewerObserved: true,
            dispatchCountObserved: true,
          },
        },
        recent: [
          {
            name: "signoff-001",
            generatedAt: 1710000000000,
            summaryPath: "logs/bundles/signoff/signoff-001/signoff_summary.json",
          },
        ],
      },
      runtimeProof: {
        storageRoot: "logs/bundles/proof",
        latest: {
          name: "runtime-proof-001",
          generatedAt: 1710000001000,
          summaryPath: "logs/bundles/proof/runtime-proof-001/runtime_proof_summary.json",
          runtime: {
            parentDispatchGuardMode: "enforce",
          },
          liveExec: {
            dispatchSuccessCount: 1,
            taskOutcomeStatus: "COMPLETED",
            fileChanges: 1,
            dispatchCount: 1,
            proofFile: "live_dispatch_proof.md",
          },
          probePersistence: {
            persistedRecords: 3,
          },
        },
        recent: [
          {
            name: "runtime-proof-001",
            generatedAt: 1710000001000,
            summaryPath: "logs/bundles/proof/runtime-proof-001/runtime_proof_summary.json",
          },
        ],
      },
    },
    eval: {
      recentRuns: [
        {
          suiteId: "core-harness-workflow.v4",
          variantLabel: "default",
          passedCases: 13,
          sampleSize: 13,
          failedCases: 0,
          scoreRate: 1,
          generatedAt: 1710000002000,
          probePersistedRecords: 3,
        },
      ],
    },
    memory: {
      governedGraph: {
        enabled: true,
        schema: "governed-memory-graph-runtime.v1",
        status: "ready",
        workspaceId: "workspace-001",
        canonicalRoot: "logs/archive/raw/runtime_state/memory",
        eventLogPath: "logs/archive/raw/runtime_state/memory/memory_events.jsonl",
        outputRoot: "output/memory",
        itemCount: 18,
        promotedCount: 9,
        eventCount: 42,
        typeCounts: {
          constitution_ref: 4,
          requirement_ref: 1,
          preference_signal: 1,
          workspace_progress: 1,
          episodic_event: 4,
          semantic_lesson: 3,
          improvement_candidate: 2,
          failure_pattern: 2,
        },
        workspaceProgress: {
          currentObjective: "Refresh the memory architecture around a governed canonical graph.",
          knownBlockers: ["screenshot review"],
          recentTouchedPaths: ["server.js", "docs/CONTEXT_MEMORY_POLICY.md"],
          nextRecommendedActions: ["Recover the latest failed validation before adding new scope."],
          updatedAt: "2026-04-04T10:00:00.000Z",
        },
        latestPack: {
          compiledAt: "2026-04-04T10:00:00.000Z",
          selectedCount: 6,
          activeAgent: "default",
          taskFamily: "web_creative",
          memoryIds: ["spec:agents", "intent:active_requirement_contract", "workspace:progress"],
        },
      },
      taste: {
        activeProfileId: "default",
        profileCount: 1,
        memoryPath: "logs/intent-memory/taste_memory.json",
      },
      externalLearning: {
        enabled: true,
        lastStatus: "PASS",
        sourceName: "OpenAI Developers Blog",
        sourceUrl: "https://developers.openai.com/blog",
        intervalMinutes: 1440,
        nextRunAt: "2026-03-24T00:00:00.000Z",
        ledgerPath: "output/openai_blog_learning_ledger.json",
        digestPath: "output/openai_blog_learning_digest.json",
        curatedDocPath: "docs/OPENAI_DEVELOPER_LEARNINGS.md",
        runtimeRetrieval: {
          enabled: true,
          shadowMode: false,
          applyToAgents: ["default", "frontend_worker"],
          applyToTaskFamilies: ["web_creative"],
          lastStatus: "APPLIED",
          lastMatchedTopics: ["frontend", "evals"],
        },
        selfImprovement: {
          enabled: true,
          gateStatus: "PASS",
          appliedDecision: "applied",
          appliedHintCount: 2,
          rawAutoApplyChangeCount: 3,
          autoApplyCandidateCount: 2,
          observationStatus: "starved",
          observationCount: 0,
          lastObservedAt: "",
          requiredObservationSuccesses: 2,
          requiredObservationSuccessRate: 0.67,
          awaitingObservationCount: 1,
          awaitingReinforcementCount: 0,
          policyDisabledCandidateCount: 0,
          nextPriority: {
            title: "Designing delightful frontends with GPT-5.4 | OpenAI Developers",
            readinessStatus: "awaiting_observations",
            gatingReason: "awaiting_runtime_observations",
            nextAction: "Record 2 successful targeted observations before promotion.",
            blastRadius: "low",
            reinforcement: {
              successCount: 0,
              observedCount: 0,
              requiredSuccesses: 2,
              requiredSuccessRate: 0.67,
              remainingSuccesses: 2,
              successRate: 0,
              lastObservedAt: "",
              status: "unobserved",
            },
          },
          priorityBacklog: [
            {
              title: "Designing delightful frontends with GPT-5.4 | OpenAI Developers",
              changeType: "frontend_quality_note",
              readinessStatus: "awaiting_observations",
              gatingReason: "awaiting_runtime_observations",
              nextAction: "Record 2 successful targeted observations before promotion.",
              blastRadius: "low",
              reinforcement: {
                successCount: 0,
                observedCount: 0,
                requiredSuccesses: 2,
                requiredSuccessRate: 0.67,
                remainingSuccesses: 2,
                successRate: 0,
                lastObservedAt: "",
                status: "unobserved",
              },
            },
          ],
          failedCaseIds: [],
        },
        recentArticles: [
          {
            title: "Run long horizon tasks with Codex",
            url: "https://developers.openai.com/blog/run-long-horizon-tasks-with-codex",
            relevance: "high",
            indexDateLabel: "Feb 23",
            topicTags: ["codex", "automation"],
          },
        ],
        pendingProposals: [
          {
            title: "Run long horizon tasks with Codex",
            target: "docs/CONTEXT_MEMORY_POLICY.md",
            status: "proposal_only",
          },
        ],
        freezeAware: {
          requirementFoundationV1: "bug_fix_only",
          blockedApplyTargets: ["AGENTS.md"],
        },
      },
      manualSelfImprovement: {
        status: "ready",
        schema: "manual-self-improvement-capture.v1",
        generatedAt: "2026-04-03T00:00:00+09:00",
        artifactPath: "output/manual_self_improvement/latest.json",
        source: {
          kind: "manual_turn_capture",
          request: "Handle the request and self-improve in the same turn.",
        },
        entryCount: 2,
        proposalOnlyCount: 1,
        blockedCount: 1,
        autoApplyCandidateCount: 0,
        runtimeHintCount: 1,
        qualityNoteCount: 1,
        skillCandidateCount: 0,
        entries: [
          {
            lessonSummary: "Lock the lesson contract before deciding promotion or storage.",
            classification: "runtime hint",
            promotionDecision: "proposal-only",
            evidenceSummary: "Policy-backed promotion is separate, so the lesson stays proposal-only.",
            supportingArtifacts: ["docs/SELF_IMPROVEMENT_POLICY.md", "scripts/config/manual_self_improvement_capture_policy.json"],
            appliesTo: {
              agent: ["default", "intake"],
              taskFamily: ["manual_self_improvement"],
              triggers: ["self-improve", "promotion decision"],
            },
          },
          {
            lessonSummary: "Block design note promotion without visual evidence.",
            classification: "quality note",
            promotionDecision: "blocked",
            evidenceSummary: "Design-sensitive notes require visual review and independent review.",
            supportingArtifacts: ["docs/EVIDENCE_CONTRACT.md"],
            appliesTo: {
              agent: ["frontend_worker"],
              taskFamily: ["web_creative"],
              triggers: ["design quality"],
            },
          },
        ],
      },
      agiImprovementFlywheel: {
        status: "ready",
        schema: "harness-agi-improvement-flywheel.v1",
        strategy: "bounded_measured_compounding",
        boundedLoopsOnly: true,
        northStar: "Increase evidence-backed autonomous completion across broad task families without policy or constitution drift.",
        antiGoal: "Do not rely on unbounded self-reinforcing loops or ungated self-modification.",
        loopCount: 6,
        kpiCount: 7,
        failureModeCount: 6,
        promotionPath: ["proposal_only", "eval_gated_candidate", "limited_rollout", "observed_promotion"],
        loops: [
          {
            id: "execution",
            name: "Execution Loop",
            objective: "Finish real tasks end-to-end with artifacts and evidence.",
            stopConditionCount: 3,
            rollbackTriggerCount: 2,
          },
        ],
        kpis: ["completion_rate", "regression_rate"],
        failureModes: ["noise_learning_from_unbounded_loops"],
      },
      secondaryLearning: {
        anthropicEngineering: {
          enabled: true,
          sourceTier: "secondary",
          sourceName: "Anthropic Engineering",
          sourceUrl: "https://www.anthropic.com/engineering",
          intervalMinutes: 1440,
          nextRunAt: "2026-03-24T00:00:00.000Z",
          lastStatus: "PASS",
          portabilityMode: "portable_principles_only",
          curatedDocPath: "docs/ANTHROPIC_ENGINEERING_LEARNINGS.md",
          recentArticles: [
            {
              title: "Demystifying evals for AI agents",
              url: "https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents",
              relevance: "high",
              portability: "portable",
              indexDateLabel: "Jan 09, 2026",
            },
          ],
          pendingProposals: [
            {
              title: "Demystifying evals for AI agents",
              target: "docs/CONTEXT_MEMORY_POLICY.md",
              status: "proposal_only",
            },
          ],
          selfImprovement: {
            enabled: true,
            gateStatus: "PASS",
            appliedDecision: "none",
            appliedHintCount: 0,
            rawAutoApplyChangeCount: 1,
            autoApplyCandidateCount: 0,
            observationStatus: "disabled",
            observationCount: 0,
            lastObservedAt: "",
            requiredObservationSuccesses: 2,
            requiredObservationSuccessRate: 0.67,
            awaitingObservationCount: 0,
            awaitingReinforcementCount: 0,
            policyDisabledCandidateCount: 1,
            nextPriority: {
              title: "Effective harnesses for long-running agents",
              readinessStatus: "policy_disabled",
              gatingReason: "stabilization_disabled",
              nextAction: "Enable stabilization for this lane or keep the note proposal-only.",
              blastRadius: "low",
              reinforcement: {
                successCount: 0,
                observedCount: 0,
                requiredSuccesses: 2,
                requiredSuccessRate: 0.67,
                remainingSuccesses: 2,
                successRate: 0,
                lastObservedAt: "",
                status: "unobserved",
              },
            },
            priorityBacklog: [
              {
                title: "Effective harnesses for long-running agents",
                changeType: "frontend_quality_note",
                readinessStatus: "policy_disabled",
                gatingReason: "stabilization_disabled",
                nextAction: "Enable stabilization for this lane or keep the note proposal-only.",
                blastRadius: "low",
              },
            ],
          },
        },
      },
      execution: {
        recent: [
          {
            agentName: "default",
            taskOutcomeStatus: "COMPLETED",
            dispatchSuccessCount: 1,
            dispatchCount: 1,
            fileChanges: 1,
            completedAt: 1710000003000,
            executionSource: "live-runtime",
            parentDispatchGuard: {
              violation: 0,
            },
          },
        ],
        statusCounts: {
          completed: 1,
        },
        taskOutcomeCounts: {
          COMPLETED: 1,
        },
        sampleSize: 1,
        guardViolations: 0,
        implementationObserved: 1,
        patterns: [
          {
            code: "unsupported_model_preflight",
            count: 1,
            severity: "medium",
            hint: "preflight catches unsupported models",
            lastSeenAt: 1710000003500,
          },
        ],
      },
      replay: {
        recent: [
          {
            agentName: "default",
            taskOutcomeStatus: "COMPLETED",
            replayStats: {
              replayCount: 1,
              lastReplayDiffRate: 0,
            },
            updatedAt: 1710000004000,
            executionSource: "replay",
          },
        ],
      },
    },
    traceability: {
      owner: "intake",
      summary: {
        totalClauses: 3,
        mappedCount: 2,
        coreTotal: 2,
        coreMapped: 2,
        coreUnmapped: 0,
        parkedCount: 1,
        droppedCount: 0,
        dispatchCount: 1,
        planStepCount: 3,
      },
      plan: {
        decision: "plan",
        planningDepth: "STANDARD_PLANNING",
        assuranceDepth: "SIGNOFF_ASSURANCE",
        flowPath: "NORMAL_PATH",
      },
      clauses: [
        {
          clauseId: "req-1",
          text: "Update server.js runtime output.",
          kind: "explicit_request",
          lane: "core",
          core: true,
          state: "mapped",
          requirementRefs: ["lockedGoal", "baselineScope"],
          dispatchIds: ["dispatch-1-backend_worker"],
          planStepIds: ["execution", "quality", "report"],
          acceptanceCheckRefs: ["ac-1"],
        },
        {
          clauseId: "req-2",
          text: "Tester evidence is required.",
          kind: "verification_method",
          lane: "core",
          core: true,
          state: "mapped",
          requirementRefs: ["acceptanceChecks"],
          dispatchIds: ["dispatch-1-backend_worker"],
          planStepIds: ["quality", "report"],
          acceptanceCheckRefs: ["ac-2"],
        },
        {
          clauseId: "req-3",
          text: "Benchmark tone can wait until core runtime output is stable.",
          kind: "taste_value",
          lane: "taste",
          core: false,
          state: "parked",
          requirementRefs: ["questionPlan.taste"],
          dispatchIds: [],
          planStepIds: [],
          acceptanceCheckRefs: [],
          parkedReason: "Taste refinement stays outside the core lane until the core path is stable.",
        },
      ],
    },
    skillPortfolio: {
      status: "PASS",
      assignments: [{ role: "backend_worker", skill: "api-contract-testgen" }],
      catalog: { version: "2026.03", path: "scripts/config/skill_catalog.json" },
      policy: { version: "2026.03", path: "scripts/config/skill_portfolio_policy.json" },
      outcomeEvents: { path: "logs/skill-outcome-events.jsonl", count: 1 },
      outcomeSummary: {
        sampledSkills: 3,
        totalRuns: 14,
        totalSuccesses: 12,
        overallSuccessRate: 0.8571,
        totalGuardFailures: 0,
      },
      promotionCandidateCount: 1,
      promotionCandidates: [
        {
          skill: "api-contract-testgen",
          fromClass: "scenario",
          toClass: "role",
          evidence: {
            runs: 8,
            successes: 7,
            successRate: 0.875,
            avgPrimaryScore: 0.88,
            guardFailures: 0,
          },
        },
      ],
      promotionRules: {
        scenarioToRole: {
          minRuns: 6,
          minSuccessRate: 0.84,
          minPrimaryScore: 0.8,
          maxGuardFailures: 0,
        },
        roleToGlobal: {
          minRuns: 12,
          minSuccessRate: 0.9,
          minPrimaryScore: 0.87,
          maxGuardFailures: 0,
        },
        evidence: {
          requireReproducibilityEvidence: true,
        },
      },
      portfolioRules: {
        minClassDiversity: 3,
        maxClassShare: {
          global: 0.45,
          role: 0.55,
          scenario: 0.7,
        },
      },
      missingProposals: [],
      roleChecks: [
        {
          role: "backend_worker",
          pass: true,
          assignedCount: 1,
          minSkills: 1,
          missingClasses: [],
          missingSkills: [],
        },
      ],
    },
    pages: {
      console: "/01.HarnesUI/index.html",
      overview: "/01.HarnesUI/overview.html",
    },
    apis: {
      runtime: "/api/runtime",
      overview: "/api/harness/overview",
      topography: "/api/agent-topography",
      replayTurns: "/api/replay/turns",
      continuityTask: "/api/continuity/task",
      continuityTasks: "/api/continuity/tasks",
      evalRun: "POST /api/eval/run",
    },
    capabilitySurface: {
      browser: {
        schema: "browser-capability-overview.v1",
        status: "running",
        score: 0.703488,
        evidenceCount: 43,
        successCount: 26,
        failureCount: 17,
        stableCoverageBreadth: 0.5,
        supportedCoverageBreadth: 1,
        displayFinalScore: 0.94,
        sourceFamilies: ["web_creative", "workflow_execution", "tool_use_browser_like"],
        unstableFamilyCount: 3,
        openFailureModes: [
          "retry budget exceeded without safe abort",
          "browser failure misreported as task success",
        ],
        familyRows: [
          {
            familyId: "web_creative",
            label: "Web Creative",
            stableCovered: false,
            stabilityStatus: "unstable",
            recentSuccessRate: 0.3333,
            recentFailureBurden: 2,
            nextCoverageAction: "reduce failure burden and verifier debt in recent windows",
          },
        ],
      },
      continuity: {
        schema: "continuity-public-summary.v1",
        finalReleaseState: "integrated",
        activeTaskId: "task_486b48ffcf",
        activeTaskFamily: "deterministic_code",
        objective: "verifier failure should force replan and recovery",
        handoffCount: 362,
        blockedSubtasks: 0,
        integrationPendingCount: 0,
        openDebtCount: 0,
        debtSeverity: "none",
        resumeCount: 2,
        replanCount: 0,
        verifierCheckpointCount: 4,
        resolvedDebtCount: 24,
        recentTrend: [
          {
            generatedAt: "2026-04-11T11:32:37.108Z",
            openDebtCount: 0,
            blockedSubtasks: 0,
            integrationPendingCount: 0,
            finalReleaseState: "integrated",
          },
        ],
      },
    },
  };
  return mergeObjects(payload, overrides);
}

async function createOverviewVmHarness(bootstrapPayload, { htmlSource = "", scriptSource = "" } = {}) {
  const overviewJs = scriptSource || readFile(overviewJsPath);
  const overviewHtml = htmlSource || readFile(overviewHtmlPath);
  const htmlIds = extractHtmlIds(overviewHtml);
  const ids = extractOverviewElementIds(overviewJs);
  assert(ids.length > 0, "overview.js must declare required DOM ids");
  for (const id of ids) {
    assert(htmlIds.has(id), `overview.html must declare id="${id}"`);
  }
  const elements = {};
  for (const id of ids) {
    elements[id] = createElementStub();
  }
  elements.overviewErrorBanner.classList.add("hidden");
  const makeSuccessResponse = async () => ({
    ok: true,
    status: 200,
    json: async () => bootstrapPayload,
  });
  const requests = [makeSuccessResponse, makeSuccessResponse, makeSuccessResponse];
  const context = {
    console,
    Date,
    Intl,
    JSON,
    Math,
    Number,
    String,
    Boolean,
    Object,
    Array,
    Error,
    Promise,
    document: {
      getElementById(id) {
        return elements[id] || null;
      },
    },
    window: {
      addEventListener() {},
    },
    setInterval() {
      return 1;
    },
    clearInterval() {},
    fetch() {
      if (!requests.length) {
        return Promise.reject(new Error("unexpected fetch"));
      }
      const next = requests.shift();
      return Promise.resolve().then(() => next());
    },
  };
  vm.runInNewContext(`${overviewJs}\n;globalThis.__overviewTestHooks = { loadOverview, renderOverview, state, elements };`, context, {
    filename: overviewJsPath,
  });
  await flushMicrotasks();
  await flushMicrotasks();
  const hooks = context.__overviewTestHooks;
  assert(hooks && typeof hooks.loadOverview === "function", "overview test hooks missing");
  await hooks.loadOverview({ manual: true });
  await flushMicrotasks();
  await flushMicrotasks();
  return { elements, hooks, requests };
}

function assertRenderedOverviewMatchesPayload(payload, elements) {
  assert(payload && payload.runtime && payload.runtime.activeAgent, "payload must expose runtime.activeAgent");
  assert(
    payload
      && payload.runtime
      && payload.runtime.fullUtilization
      && payload.runtime.fullUtilization.actual
      && payload.runtime.fullUtilization.actual.defaultExecAgent,
    "payload must expose runtime.fullUtilization.actual.defaultExecAgent"
  );
  assertContains(elements.overviewHeroText.textContent, payloadActiveAgent(payload), "hero must render the active runtime agent");
  assertContains(elements.overviewHeroText.textContent, payloadDefaultExecAgent(payload), "hero must render the default exec agent");
  assertContains(elements.jobScenarioGrid.innerHTML, "Delegated implementation", "job scenarios must render delegated implementation");
  assertContains(elements.jobScenarioGrid.innerHTML, "Governed review and release decision", "job scenarios must render governed review");
  assertContains(elements.jobScenarioGrid.innerHTML, "Long-horizon continuity and handoff", "job scenarios must render continuity handoff");
  assertContains(elements.capabilitySurfaceGrid.innerHTML, "Governed memory", "capability surface must render memory lane");
  assertContains(elements.capabilitySurfaceGrid.innerHTML, "Skill portfolio", "capability surface must render skill lane");
  assertContains(elements.capabilitySurfaceGrid.innerHTML, "Multi-agent runtime", "capability surface must render subagent lane");
  assertContains(elements.capabilitySurfaceGrid.innerHTML, "Browser and tool-use recovery", "capability surface must render browser lane");
  assertContains(elements.capabilitySurfaceGrid.innerHTML, "Long-horizon continuity", "capability surface must render continuity lane");
  assertContains(elements.capabilitySurfaceGrid.innerHTML, "Governed self-improvement", "capability surface must render self-improvement lane");
  assertContains(elements.demoFlowGrid.innerHTML, "Implement and finish with proof", "demo flow must render governed delivery path");
  assertContains(elements.demoFlowGrid.innerHTML, "Decide ship / no-ship honestly", "demo flow must render release decision path");
  assertContains(elements.demoFlowGrid.innerHTML, "Resume across sessions without guesswork", "demo flow must render continuity path");
  const specialists = payload && payload.topology && payload.topology.lanes && Array.isArray(payload.topology.lanes.specialists)
    ? payload.topology.lanes.specialists
    : [];
  if (specialists.length) {
    assertContains(elements.topologySpecialistLane.innerHTML, String(specialists[0].name || "backend_worker"), "topology lane must render the first specialist lane");
  }
  const reasonMapKeys = payload && payload.contracts && payload.contracts.taskOutcome && Array.isArray(payload.contracts.taskOutcome.reasonMapKeys)
    ? payload.contracts.taskOutcome.reasonMapKeys
    : [];
  if (reasonMapKeys.length) {
    assertContains(elements.taskOutcomeCard.innerHTML, String(reasonMapKeys[0]), "task outcome card must render reasonMapKeys");
  }
  const recentExecution = payload && payload.memory && payload.memory.execution && Array.isArray(payload.memory.execution.recent)
    ? payload.memory.execution.recent
    : [];
  if (recentExecution.length) {
    const entry = recentExecution[0];
    assertContains(
      elements.executionMemoryCard.innerHTML,
      `dispatch ${Number(entry.dispatchSuccessCount || 0)}/${Number(entry.dispatchCount || 0)}`,
      "execution memory must render recent dispatch summary"
    );
  }
  const workflowSuiteId = payload
    && payload.evidence
    && payload.evidence.signoff
    && payload.evidence.signoff.latest
    && payload.evidence.signoff.latest.coreHarnessWorkflow
    && payload.evidence.signoff.latest.coreHarnessWorkflow.suiteId;
  if (workflowSuiteId) {
    assertContains(elements.signoffEvidenceCard.innerHTML, String(workflowSuiteId), "signoff evidence must render workflow contract");
  }
  const browserSurface = payload && payload.capabilitySurface && payload.capabilitySurface.browser && typeof payload.capabilitySurface.browser === "object"
    ? payload.capabilitySurface.browser
    : null;
  if (browserSurface) {
    assertContains(elements.capabilitySurfaceGrid.innerHTML, String(browserSurface.sourceFamilies[0] || "web_creative"), "capability surface must render browser source families");
    assertContains(elements.capabilitySurfaceGrid.innerHTML, String(browserSurface.openFailureModes[0] || "retry budget exceeded without safe abort"), "capability surface must render browser failure modes");
  }
  const continuitySurface = payload && payload.capabilitySurface && payload.capabilitySurface.continuity && typeof payload.capabilitySurface.continuity === "object"
    ? payload.capabilitySurface.continuity
    : null;
  if (continuitySurface) {
    assertContains(elements.capabilitySurfaceGrid.innerHTML, String(continuitySurface.objective || "continuity objective"), "capability surface must render continuity objective");
    assertContains(elements.capabilitySurfaceGrid.innerHTML, String(continuitySurface.finalReleaseState || "integrated"), "capability surface must render continuity release state");
  }
  assertContains(elements.runtimePostureCard.innerHTML, "task-family-profiles.v1", "runtime posture must render family profile contract");
  assertContains(elements.runtimePostureCard.innerHTML, "Portable Local", "runtime posture must render deployment posture");
  assertContains(elements.runtimePostureCard.innerHTML, "authority-registry.v1", "runtime posture must render authority registry");
  assertContains(elements.runtimePostureCard.innerHTML, "iteration-control-contract.v1", "runtime posture must render iteration control contract");
  assertContains(elements.runtimePostureCard.innerHTML, "adoption-readiness-evaluator-contract.v1", "runtime posture must render adoption readiness contract");
  assertContains(elements.stopBudgetCard.innerHTML, "24 steps / 400,000 tokens", "stop intelligence must render contract budgets");
  assertContains(elements.stopBudgetCard.innerHTML, "goal_substitution_detected", "stop intelligence must render fail-closed triggers");
  assertContains(elements.stopBudgetCard.innerHTML, "literal_requirement_alignment", "stop intelligence must render adoption hard gates");
  const familyCompletionGate = payload
    && payload.runtime
    && payload.runtime.latestTurn
    && payload.runtime.latestTurn.family_completion_gate
    && typeof payload.runtime.latestTurn.family_completion_gate === "object"
      ? payload.runtime.latestTurn.family_completion_gate
      : payload
        && payload.health
        && payload.health.latestTurn
        && payload.health.latestTurn.family_completion_gate
        && typeof payload.health.latestTurn.family_completion_gate === "object"
          ? payload.health.latestTurn.family_completion_gate
          : null;
  if (familyCompletionGate && familyCompletionGate.applies) {
    assertContains(elements.healthCard.innerHTML, String(familyCompletionGate.status || "pending"), "health card must render family completion gate status");
    assertContains(elements.healthCard.innerHTML, String(familyCompletionGate.completionContract || "contract"), "health card must render family completion gate contract");
    assertContains(elements.stopBudgetCard.innerHTML, String(familyCompletionGate.status || "pending"), "stop intelligence must render the latest family gate status");
  }
  const phaseStatus = payload && payload.runtime && payload.runtime.phaseStatus && typeof payload.runtime.phaseStatus === "object"
    ? payload.runtime.phaseStatus
    : null;
  if (phaseStatus) {
    assertContains(elements.healthCard.innerHTML, String(phaseStatus.requirementFoundationV1 || "not_done"), "health card must render requirement foundation phase status");
    assertContains(elements.healthCard.innerHTML, String(phaseStatus.auditReportPath || "output/phase_exit_requirement_foundation_v1.json"), "health card must render requirement foundation audit report path");
  }
  const externalLearning = payload && payload.runtime && payload.runtime.externalLearning && typeof payload.runtime.externalLearning === "object"
    ? payload.runtime.externalLearning
    : null;
  const agiImprovementFlywheel = payload && payload.runtime && payload.runtime.agiImprovementFlywheel && typeof payload.runtime.agiImprovementFlywheel === "object"
    ? payload.runtime.agiImprovementFlywheel
    : null;
  if (externalLearning) {
    const externalLearningCardHtml = elements.externalLearningCard ? elements.externalLearningCard.innerHTML : "";
    assertContains(externalLearningCardHtml, String(externalLearning.sourceName || "OpenAI Developers Blog"), "external learning card must render source name");
    assertContains(externalLearningCardHtml, String((externalLearning.recentArticles && externalLearning.recentArticles[0] && externalLearning.recentArticles[0].title) || "article"), "external learning card must render recent article title");
    if (externalLearning.runtimeRetrieval && typeof externalLearning.runtimeRetrieval === "object") {
      assertContains(externalLearningCardHtml, String(externalLearning.runtimeRetrieval.lastStatus || "IDLE"), "external learning card must render runtime retrieval status");
      assertContains(externalLearningCardHtml, String((externalLearning.runtimeRetrieval.lastMatchedTopics && externalLearning.runtimeRetrieval.lastMatchedTopics[0]) || "frontend"), "external learning card must render runtime retrieval topics");
    }
    if (externalLearning.selfImprovement && typeof externalLearning.selfImprovement === "object") {
      assertContains(externalLearningCardHtml, String(externalLearning.selfImprovement.gateStatus || "NOT_RUN"), "external learning card must render self improvement gate status");
      assertContains(externalLearningCardHtml, String(externalLearning.selfImprovement.appliedDecision || "none"), "external learning card must render self improvement applied decision");
      assertContains(externalLearningCardHtml, String(externalLearning.selfImprovement.observationStatus || "starved"), "external learning card must render self improvement observation status");
      if (externalLearning.selfImprovement.nextPriority && typeof externalLearning.selfImprovement.nextPriority === "object") {
        assertContains(externalLearningCardHtml, String(externalLearning.selfImprovement.nextPriority.title || "candidate"), "external learning card must render next-cycle priority title");
        if (externalLearning.selfImprovement.nextPriority.reinforcement && typeof externalLearning.selfImprovement.nextPriority.reinforcement === "object") {
          assertContains(externalLearningCardHtml, String(externalLearning.selfImprovement.nextPriority.reinforcement.requiredSuccesses || "2"), "external learning card must render next-cycle reinforcement threshold");
        }
      }
    }
    if (payload.runtime && payload.runtime.manualSelfImprovement) {
      assertContains(externalLearningCardHtml, "Manual Capture", "external learning card must render manual capture section");
      assertContains(externalLearningCardHtml, "manual-self-improvement-capture.v1", "external learning card must render manual capture schema");
      assertContains(externalLearningCardHtml, "proposal 1", "external learning card must render manual capture decision counts");
      assertContains(externalLearningCardHtml, "Lock the lesson contract before deciding promotion or storage.", "external learning card must render manual capture lesson summaries");
      assertContains(externalLearningCardHtml, "Policy-backed promotion is separate, so the lesson stays proposal-only.", "external learning card must render manual capture evidence summaries");
      assertContains(externalLearningCardHtml, "docs/SELF_IMPROVEMENT_POLICY.md", "external learning card must render manual capture supporting artifacts");
    }
    const metricsHtml = elements.overviewMetrics ? elements.overviewMetrics.innerHTML : "";
    assertContains(metricsHtml, String(externalLearning.lastStatus || "PASS"), "metrics must render external learning status");
  }
  if (agiImprovementFlywheel) {
    assert.strictEqual(agiImprovementFlywheel.boundedLoopsOnly, true, "agi flywheel must reject unbounded loops");
    assert(agiImprovementFlywheel.loopCount >= 1, "agi flywheel must expose loops");
    assert(agiImprovementFlywheel.kpiCount >= 1, "agi flywheel must expose KPIs");
  }
  const secondaryLearning = payload && payload.runtime && payload.runtime.secondaryLearning && typeof payload.runtime.secondaryLearning === "object"
    ? payload.runtime.secondaryLearning
    : null;
  if (secondaryLearning && secondaryLearning.anthropicEngineering) {
    const externalLearningCardHtml = elements.externalLearningCard ? elements.externalLearningCard.innerHTML : "";
    assertContains(externalLearningCardHtml, String(secondaryLearning.anthropicEngineering.sourceName || "Anthropic Engineering"), "external learning card must render secondary source name");
    assertContains(externalLearningCardHtml, String((secondaryLearning.anthropicEngineering.recentArticles && secondaryLearning.anthropicEngineering.recentArticles[0] && secondaryLearning.anthropicEngineering.recentArticles[0].title) || "article"), "external learning card must render secondary article title");
    assertContains(externalLearningCardHtml, String(secondaryLearning.anthropicEngineering.portabilityMode || "portable_principles_only"), "external learning card must render secondary portability mode");
    if (secondaryLearning.anthropicEngineering.selfImprovement && typeof secondaryLearning.anthropicEngineering.selfImprovement === "object") {
      assertContains(externalLearningCardHtml, String(secondaryLearning.anthropicEngineering.selfImprovement.gateStatus || "NOT_RUN"), "external learning card must render secondary self improvement gate status");
      assertContains(externalLearningCardHtml, String(secondaryLearning.anthropicEngineering.selfImprovement.observationStatus || "disabled"), "external learning card must render secondary observation status");
      if (secondaryLearning.anthropicEngineering.selfImprovement.nextPriority && typeof secondaryLearning.anthropicEngineering.selfImprovement.nextPriority === "object") {
        assertContains(externalLearningCardHtml, String(secondaryLearning.anthropicEngineering.selfImprovement.nextPriority.title || "candidate"), "external learning card must render secondary next-cycle priority title");
      }
    }
  }
  const skillPortfolio = payload && payload.skillPortfolio && typeof payload.skillPortfolio === "object"
    ? payload.skillPortfolio
    : null;
  if (skillPortfolio) {
    const skillPortfolioCardHtml = elements.skillPortfolioCard ? elements.skillPortfolioCard.innerHTML : "";
    assertContains(skillPortfolioCardHtml, String(skillPortfolio.outcomeSummary && skillPortfolio.outcomeSummary.sampledSkills || "3"), "skill economy must render sampled skill count");
    assertContains(skillPortfolioCardHtml, String(skillPortfolio.promotionCandidates && skillPortfolio.promotionCandidates[0] && skillPortfolio.promotionCandidates[0].skill || "api-contract-testgen"), "skill economy must render promotion candidates");
    assertContains(skillPortfolioCardHtml, "scenario 6 / role 12", "skill economy must render promotion thresholds");
    assertContains(skillPortfolioCardHtml, "diversity >= 3", "skill economy must render portfolio mix rules");
    assertContains(skillPortfolioCardHtml, "Lock the lesson contract before deciding promotion or storage.", "skill economy must render manual skill-candidate lessons");
  }
  const governedMemory = payload && payload.memory && payload.memory.governedGraph && typeof payload.memory.governedGraph === "object"
    ? payload.memory.governedGraph
    : payload && payload.runtime && payload.runtime.governedMemory && typeof payload.runtime.governedMemory === "object"
      ? payload.runtime.governedMemory
      : null;
  if (governedMemory) {
    const governedMemoryCardHtml = elements.governedMemoryCard ? elements.governedMemoryCard.innerHTML : "";
    assertContains(governedMemoryCardHtml, String(governedMemory.canonicalRoot || "logs/archive/raw/runtime_state/memory"), "governed memory card must render canonical root");
    assertContains(governedMemoryCardHtml, String(governedMemory.eventLogPath || "memory_events.jsonl"), "governed memory card must render event log path");
    assertContains(governedMemoryCardHtml, String(governedMemory.workspaceProgress && governedMemory.workspaceProgress.currentObjective || "objective"), "governed memory card must render workspace objective");
    assertContains(governedMemoryCardHtml, String(governedMemory.workspaceProgress && governedMemory.workspaceProgress.knownBlockers && governedMemory.workspaceProgress.knownBlockers[0] || "blocker"), "governed memory card must render workspace blockers");
    assertContains(governedMemoryCardHtml, String(governedMemory.latestPack && governedMemory.latestPack.memoryIds && governedMemory.latestPack.memoryIds[0] || "memory"), "governed memory card must render latest pack item ids");
  }
  const documentTooling = payload && payload.runtime && payload.runtime.documentTooling && typeof payload.runtime.documentTooling === "object"
    ? payload.runtime.documentTooling
    : payload && payload.runtime && payload.runtime.document_tooling && typeof payload.runtime.document_tooling === "object"
      ? payload.runtime.document_tooling
      : null;
  if (documentTooling) {
    const documentToolingCardHtml = elements.documentToolingCard ? elements.documentToolingCard.innerHTML : "";
    assertContains(documentToolingCardHtml, String(documentTooling.hubScriptPath || "scripts/document_tooling.js"), "document tooling card must render hub script path");
    assertContains(documentToolingCardHtml, String(documentTooling.guidePath || "docs/DOCUMENT_TOOLING_GUIDE.md"), "document tooling card must render guide path");
    assertContains(documentToolingCardHtml, String(documentTooling.toolRoot || ".tooling/document-tools"), "document tooling card must render local tool root");
    assertContains(documentToolingCardHtml, String(documentTooling.exampleCommands && documentTooling.exampleCommands.bootstrap || "node scripts/document_tooling.js bootstrap"), "document tooling card must render bootstrap command");
    assertContains(
      documentToolingCardHtml,
      String((documentTooling.tools && documentTooling.tools[0] && documentTooling.tools[0].name) || "Microsoft MarkItDown"),
      "document tooling card must render tool definitions"
    );
    assertContains(
      documentToolingCardHtml,
      String((documentTooling.recommendedRoutes && documentTooling.recommendedRoutes[0] && documentTooling.recommendedRoutes[0].label) || "Mixed office documents to Markdown"),
      "document tooling card must render recommended routes"
    );
  }
  const traceabilityClauses = payload && payload.traceability && Array.isArray(payload.traceability.clauses)
    ? payload.traceability.clauses
    : [];
  if (traceabilityClauses.length) {
    const clause = traceabilityClauses[0];
    assertContains(elements.traceabilityCard.innerHTML, String(clause.text || clause.clauseId || "req"), "traceability card must render the latest request clause");
    assertContains(elements.traceabilityCard.innerHTML, String((clause.requirementRefs && clause.requirementRefs[0]) || "lockedGoal"), "traceability card must render requirement refs");
  }
}

async function runClientRefreshRaceCheck() {
  const bootstrapPayload = createOverviewPayload({ generatedAt: 1 });
  const { elements, hooks, requests } = await createOverviewVmHarness(bootstrapPayload);

  const successPayload = createOverviewPayload({
    generatedAt: 2,
    runtime: {
      activeAgent: "default chat-natural-42",
      sessionRef: "session-natural-42",
    },
  });
  const staleSuccessPayload = createOverviewPayload({
    generatedAt: 3,
    runtime: {
      activeAgent: "default stale-parent",
      sessionRef: "session-stale-99",
    },
    topology: {
      lanes: {
        specialists: [
          {
            name: "infra_worker",
            description: "Infra specialist",
            role: "child",
            status: "ACTIVE",
            source: "runtime",
            active: true,
            governance: {
              scopePaths: ["start_codex_ui.bat"],
            },
            skills: ["windows-runtime-ops"],
          },
        ],
      },
    },
  });

  const staleFailure = deferred();
  const freshSuccess = deferred();
  requests.push(() => staleFailure.promise);
  requests.push(() => freshSuccess.promise);

  const stalePromise = hooks.loadOverview();
  const freshPromise = hooks.loadOverview();
  freshSuccess.resolve({
    ok: true,
    status: 200,
    json: async () => successPayload,
  });
  await freshPromise;
  await flushMicrotasks();
  assert.strictEqual(elements.overviewRefreshState.textContent, "最新", "fresh success should set refresh state to 最新");
  assert.strictEqual(elements.overviewErrorBanner.classList.contains("hidden"), true, "fresh success should keep error banner hidden");
  assert.strictEqual(Number(hooks.state.payload && hooks.state.payload.generatedAt), 2, "fresh success payload should be retained");
  assertRenderedOverviewMatchesPayload(successPayload, elements);
  assertContains(elements.runtimePostureCard.innerHTML, "POST /api/conversation/direct", "runtime posture must render conversation API");

  staleFailure.reject(new Error("stale failure"));
  await stalePromise;
  await flushMicrotasks();
  assert.strictEqual(elements.overviewRefreshState.textContent, "最新", "stale failure must not overwrite newer successful refresh state");
  assert.strictEqual(elements.overviewErrorBanner.classList.contains("hidden"), true, "stale failure must not surface an error banner");
  assert.strictEqual(Number(hooks.state.payload && hooks.state.payload.generatedAt), 2, "stale failure must not replace the latest payload");
  assertContains(elements.topologySpecialistLane.innerHTML, "backend_worker", "stale failure must not disturb rendered specialist lane");

  const staleSuccess = deferred();
  const latestFailure = deferred();
  requests.push(() => staleSuccess.promise);
  requests.push(() => latestFailure.promise);

  const staleSuccessPromise = hooks.loadOverview();
  const latestFailurePromise = hooks.loadOverview();
  latestFailure.reject(new Error("latest failure"));
  await latestFailurePromise;
  await flushMicrotasks();
  assert.strictEqual(elements.overviewRefreshState.textContent, "エラー", "latest failure must surface disconnected state");
  assert.strictEqual(elements.overviewErrorBanner.classList.contains("hidden"), false, "latest failure must show an error banner");
  assertContains(elements.overviewErrorBanner.textContent, "latest failure", "latest failure banner must include the failure reason");
  assert.strictEqual(Number(hooks.state.payload && hooks.state.payload.generatedAt), 2, "latest failure must preserve the previous successful payload");

  staleSuccess.resolve({
    ok: true,
    status: 200,
    json: async () => staleSuccessPayload,
  });
  await staleSuccessPromise;
  await flushMicrotasks();
  assert.strictEqual(elements.overviewRefreshState.textContent, "エラー", "stale success must not clear a newer failure state");
  assert.strictEqual(elements.overviewErrorBanner.classList.contains("hidden"), false, "stale success must not hide the latest error banner");
  assertContains(elements.overviewHeroText.textContent, payloadActiveAgent(successPayload), "stale success must not replace the rendered hero payload");
  assertContains(elements.topologySpecialistLane.innerHTML, "backend_worker", "stale success must not replace the rendered specialist lane");
  assert.strictEqual(String(elements.topologySpecialistLane.innerHTML).includes("infra_worker"), false, "stale success must not render a stale specialist lane");
  assert.strictEqual(Number(hooks.state.payload && hooks.state.payload.generatedAt), 2, "stale success must not replace the latest retained payload");
  return `requestId=${hooks.state.requestId}`;
}

async function runReviewerReadoutCompletionSeparationCheck() {
  const payload = createOverviewPayload({
    runtime: {
      workerDecisionSurface: {
        topLevelOutcome: "ADOPTABLE_COMPLETE",
        taskOutcomeStatus: "COMPLETED",
        topLevelSummary: "The task outcome is complete and adoptable.",
        operatorAction: "ADOPT",
        releaseState: "RELEASE_APPROVED",
        releaseApproved: true,
        decisionQuestion: "Can the governed worker stop here without unnecessary human interruption?",
        adoptionReadiness: 0.98,
        adoptionReadinessThreshold: 0.8,
        evidenceSummary: {
          residualRiskCount: 0,
        },
      },
      workerDecisionSupport: {
        goalStatus: "NOT_YET",
        goalStatusScope: "program_readiness",
        subjectiveGoalStatus: "NOT_YET",
        compatibilityCompletionStatus: "NOT_YET",
        compatibilityCompletionScope: "compatibility_layer",
        programReadinessBlockingWorkerStop: false,
        backgroundProgramReadiness: {
          scope: "program_readiness",
          status: "NOT_YET",
          displayLabel: "Background program readiness",
          presentationRole: "secondary_non_blocking_context",
          doesNotOverrideWorkerVerdict: true,
          whyNotYetCount: 4,
          summary: "Background program-readiness debt is still open. It stays visible as secondary context and does not overturn the task verdict.",
        },
      },
      currentTruth: {
        goalCompletion: {
          scope: "program_readiness",
          status: "NOT_YET",
          displayLabel: "Background program readiness",
          presentationRole: "secondary_non_blocking_context",
          doesNotOverrideWorkerVerdict: true,
          whyNotYetCount: 4,
        },
      },
    },
  });
  const { elements } = await createOverviewVmHarness(payload);
  const reviewerHtml = String(elements.reviewerReadout && elements.reviewerReadout.innerHTML || "");
  assertContains(reviewerHtml, "background debt open", "reviewer readout must render background debt as debt open instead of raw NOT_YET in the top tags");
  assertContains(reviewerHtml, "Background program readiness debt", "reviewer readout must render a debt-oriented background title instead of a raw NOT_YET title");
  assertContains(reviewerHtml, "Recorded Status", "reviewer readout must preserve the raw program status as a fact row");
  assertContains(reviewerHtml, "The raw program_readiness artifact value is preserved here without promoting it to the task headline.", "reviewer readout must explain why raw status is not the task headline");
  assert.strictEqual(reviewerHtml.includes("background NOT_YET"), false, "reviewer readout must not leak raw NOT_YET into the top tag");
  assert.strictEqual(reviewerHtml.includes("Background program readiness: NOT_YET"), false, "reviewer readout must not use raw NOT_YET as the background title");
  return "task verdict remains primary while background debt stays secondary";
}

function pickPort() {
  return 58700 + Math.floor(Math.random() * 500);
}

function httpRequest(port, pathname) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: "127.0.0.1",
        port,
        path: pathname,
        method: "GET",
        timeout: 3000,
      },
      (res) => {
        let raw = "";
        res.on("data", (chunk) => {
          raw += chunk.toString("utf8");
        });
        res.on("end", () => {
          resolve({ statusCode: res.statusCode || 0, raw });
        });
      }
    );
    req.on("error", reject);
    req.on("timeout", () => {
      req.destroy(new Error(`timeout ${pathname}`));
    });
    req.end();
  });
}

async function waitForServerReady(port, timeoutMs = 20000) {
  const startedAt = Date.now();
  let lastError = null;
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await httpRequest(port, "/api/runtime");
      if (response.statusCode === 200) {
        return;
      }
      lastError = new Error(`runtime status=${response.statusCode}`);
    } catch (error) {
      lastError = error;
    }
    await sleep(250);
  }
  throw new Error(lastError ? lastError.message : "server not ready");
}

async function stopServer(child) {
  if (!child) {
    return;
  }
  if (typeof child.stop === "function") {
    await child.stop();
    return;
  }
  try {
    if (!child.killed) {
      child.kill("SIGTERM");
    }
    await Promise.race([
      new Promise((resolve) => child.once("exit", resolve)),
      sleep(2500),
    ]);
  } catch {
    // ignore
  }
}

async function runIntegrationCheck() {
  const port = pickPort();
  const child = await startInProcessHarnessServer({
    CODEX_UI_PORT: String(port),
    CODEX_AUTO_OPEN_BROWSER: "0",
    CODEX_PAUSE_ON_EXIT: "0",
    CODEX_APP_SERVER_TRANSPORT: "mock-fixture",
    CODEX_OPENAI_BLOG_LEARNING_ENABLED: "0",
  });

  try {
    await waitForServerReady(port);
    const runtimeRes = await httpRequest(port, "/api/runtime");
    assert.strictEqual(runtimeRes.statusCode, 200, "GET /api/runtime must return 200");
    const runtimeJson = JSON.parse(runtimeRes.raw);
    assert(runtimeJson && typeof runtimeJson === "object", "runtime payload must be an object");
    assert(runtimeJson.appServerTransport && typeof runtimeJson.appServerTransport === "object", "runtime must expose appServerTransport");
    assert(runtimeJson.appServerTransport.capabilitySnapshot && typeof runtimeJson.appServerTransport.capabilitySnapshot === "object", "runtime must expose app-server capability snapshot");
    assert.strictEqual(String(runtimeJson.appServerTransport.capabilitySnapshot.schema || ""), "app-server-capability-snapshot.v1", "runtime app-server capability schema mismatch");
    assert.strictEqual(String(runtimeJson.appServerTransport.capabilitySnapshot.handshakeStatus || ""), "not_initialized", "mock-fixture runtime should keep handshakeStatus not_initialized before live negotiation");
    assert.strictEqual(String(runtimeJson.appServerTransport.capabilitySnapshot.features && runtimeJson.appServerTransport.capabilitySnapshot.features.memoryMode && runtimeJson.appServerTransport.capabilitySnapshot.features.memoryMode.status || ""), "unknown", "runtime memoryMode capability should default to unknown");
    assert.strictEqual(String(runtimeJson.appServerTransport.capabilitySnapshot.features && runtimeJson.appServerTransport.capabilitySnapshot.features.parallelMcp && runtimeJson.appServerTransport.capabilitySnapshot.features.parallelMcp.status || ""), "unknown", "runtime parallelMcp capability should default to unknown");
    assert.strictEqual(
      String(runtimeJson.appServerTransport.capabilitySnapshot.statusSemantics && runtimeJson.appServerTransport.capabilitySnapshot.statusSemantics.supported || ""),
      "explicitly advertised or observed during initialize negotiation",
      "runtime capability semantics for supported mismatch"
    );
    const overviewRes = await httpRequest(port, "/api/harness/overview");
    assert.strictEqual(overviewRes.statusCode, 200, "GET /api/harness/overview must return 200");
    const overviewJson = JSON.parse(overviewRes.raw);
    assert(overviewJson && typeof overviewJson === "object", "overview payload must be an object");
    assert.strictEqual(overviewJson.mode, "harness-overview", "overview mode mismatch");
    assert(overviewJson.runtime && typeof overviewJson.runtime === "object", "overview runtime missing");
    assert(overviewJson.runtime.activeAgent, "overview runtime must expose activeAgent");
    assert(overviewJson.runtime.phaseStatus && typeof overviewJson.runtime.phaseStatus === "object", "overview runtime must expose phaseStatus");
    assert(typeof overviewJson.runtime.phaseStatus.requirementFoundationV1 === "string", "overview runtime phaseStatus must expose requirementFoundationV1");
    assert(overviewJson.runtime.externalLearning && typeof overviewJson.runtime.externalLearning === "object", "overview runtime must expose externalLearning");
    assert(overviewJson.runtime.documentTooling && typeof overviewJson.runtime.documentTooling === "object", "overview runtime must expose documentTooling");
    assert(typeof overviewJson.runtime.documentTooling.status === "string", "overview runtime documentTooling must expose status");
    assert(typeof overviewJson.runtime.documentTooling.toolRoot === "string", "overview runtime documentTooling must expose local tool root");
    assert(overviewJson.runtime.authorityRegistry && typeof overviewJson.runtime.authorityRegistry === "object", "overview runtime must expose authorityRegistry");
    assert.strictEqual(String(overviewJson.runtime.authorityRegistry.schema || ""), "authority-registry.v1", "overview runtime authorityRegistry schema mismatch");
    assert(overviewJson.runtime.deploymentPosture && typeof overviewJson.runtime.deploymentPosture === "object", "overview runtime must expose deploymentPosture");
    assert(typeof overviewJson.runtime.deploymentPosture.activeProfile === "string", "overview runtime deploymentPosture must expose activeProfile");
    assert(overviewJson.runtime.iterationControl && typeof overviewJson.runtime.iterationControl === "object", "overview runtime must expose iterationControl");
    assert.strictEqual(String(overviewJson.runtime.iterationControl.schema || ""), "iteration-control-contract.v1", "overview runtime iterationControl schema mismatch");
    assert(overviewJson.runtime.adoptionReadinessContract && typeof overviewJson.runtime.adoptionReadinessContract === "object", "overview runtime must expose adoptionReadinessContract");
    assert.strictEqual(String(overviewJson.runtime.adoptionReadinessContract.schema || ""), "adoption-readiness-evaluator-contract.v1", "overview runtime adoptionReadinessContract schema mismatch");
    assert(overviewJson.runtime.harnessPlanes && typeof overviewJson.runtime.harnessPlanes === "object", "overview runtime must expose harnessPlanes");
    assert.strictEqual(String(overviewJson.runtime.harnessPlanes.schema || ""), "single-harness-multi-plane-contract.v1", "overview runtime harnessPlanes schema mismatch");
    assert.strictEqual(String(overviewJson.runtime.harnessPlanes.primaryRoutes && overviewJson.runtime.harnessPlanes.primaryRoutes.execution || ""), "POST /api/exec", "overview runtime harnessPlanes execution route mismatch");
    assert.strictEqual(String(overviewJson.runtime.harnessPlanes.primaryRoutes && overviewJson.runtime.harnessPlanes.primaryRoutes.evaluation || ""), "POST /api/eval/run", "overview runtime harnessPlanes evaluation route mismatch");
    assert(overviewJson.runtime.appServerTransport && typeof overviewJson.runtime.appServerTransport === "object", "overview runtime must expose appServerTransport");
    assert(overviewJson.runtime.appServerTransport.capabilitySnapshot && typeof overviewJson.runtime.appServerTransport.capabilitySnapshot === "object", "overview runtime must expose app-server capability snapshot");
    assert.strictEqual(String(overviewJson.runtime.appServerTransport.capabilitySnapshot.schema || ""), "app-server-capability-snapshot.v1", "overview runtime app-server capability schema mismatch");
    assert.strictEqual(String(overviewJson.runtime.appServerTransport.capabilitySnapshot.handshakeStatus || ""), "not_initialized", "overview runtime app-server handshakeStatus mismatch");
    assert.strictEqual(String(overviewJson.runtime.appServerTransport.capabilitySnapshot.features && overviewJson.runtime.appServerTransport.capabilitySnapshot.features.memoryReset && overviewJson.runtime.appServerTransport.capabilitySnapshot.features.memoryReset.status || ""), "unknown", "overview runtime memoryReset capability should default to unknown");
    assert.deepStrictEqual(
      overviewJson.runtime.appServerTransport.capabilitySnapshot.statusSemantics,
      runtimeJson.appServerTransport.capabilitySnapshot.statusSemantics,
      "overview runtime capability semantics should match /api/runtime"
    );
    assert(overviewJson.runtime.governedMemory && typeof overviewJson.runtime.governedMemory === "object", "overview runtime must expose governedMemory");
    assert(overviewJson.runtime.manualSelfImprovement && typeof overviewJson.runtime.manualSelfImprovement === "object", "overview runtime must expose manualSelfImprovement");
    assert(typeof overviewJson.runtime.manualSelfImprovement.status === "string", "overview runtime manualSelfImprovement must expose status");
    assert(overviewJson.runtime.agiImprovementFlywheel && typeof overviewJson.runtime.agiImprovementFlywheel === "object", "overview runtime must expose agiImprovementFlywheel");
    assert.strictEqual(Boolean(overviewJson.runtime.agiImprovementFlywheel.boundedLoopsOnly), true, "overview runtime agiImprovementFlywheel must reject unbounded loops");
    assert(overviewJson.memory.externalLearning && typeof overviewJson.memory.externalLearning === "object", "overview memory must expose externalLearning");
    assert(overviewJson.memory.governedGraph && typeof overviewJson.memory.governedGraph === "object", "overview memory must expose governedGraph");
    assert(overviewJson.memory.manualSelfImprovement && typeof overviewJson.memory.manualSelfImprovement === "object", "overview memory must expose manualSelfImprovement");
    assert(overviewJson.memory.agiImprovementFlywheel && typeof overviewJson.memory.agiImprovementFlywheel === "object", "overview memory must expose agiImprovementFlywheel");
    assert(overviewJson.topology && typeof overviewJson.topology === "object", "overview topology missing");
    assert(overviewJson.contracts && typeof overviewJson.contracts === "object", "overview contracts missing");
    assert(overviewJson.evidence && typeof overviewJson.evidence === "object", "overview evidence missing");
    assert(overviewJson.memory && typeof overviewJson.memory === "object", "overview memory missing");
    assert(overviewJson.skillPortfolio && typeof overviewJson.skillPortfolio === "object", "overview skillPortfolio missing");
    assert(overviewJson.capabilitySurface && typeof overviewJson.capabilitySurface === "object", "overview capabilitySurface missing");
    assert(overviewJson.capabilitySurface.browser && typeof overviewJson.capabilitySurface.browser === "object", "overview browser capability missing");
    assert(overviewJson.capabilitySurface.continuity && typeof overviewJson.capabilitySurface.continuity === "object", "overview continuity capability missing");
    assert.strictEqual(overviewJson.pages && overviewJson.pages.overview, "/01.HarnesUI/overview.html", "overview page path mismatch");
    assert(Array.isArray(overviewJson.eval && overviewJson.eval.recentRuns), "overview recent eval runs must be an array");
    assert.strictEqual(String(overviewJson.apis && overviewJson.apis.continuityTasks || ""), "/api/continuity/tasks", "overview continuity tasks path mismatch");
    assert.strictEqual(String(overviewJson.apis && overviewJson.apis.continuityTask || ""), "/api/continuity/task", "overview continuity task path mismatch");
    assert(overviewJson.runtime.controlApi && typeof overviewJson.runtime.controlApi === "object", "overview controlApi missing");
    assert.strictEqual(String(overviewJson.runtime.controlApi.token || ""), "", "overview must redact controlApi.token");
    assert.strictEqual(Number(overviewJson.runtime.controlApi.tokenRedacted || 0), 1, "overview must mark controlApi.token as redacted");
    assert(
      overviewJson.runtime
        && overviewJson.runtime.fullUtilization
        && overviewJson.runtime.fullUtilization.actual
        && overviewJson.runtime.fullUtilization.actual.defaultExecAgent,
      "overview runtime must expose fullUtilization.actual.defaultExecAgent"
    );
    assert(Array.isArray(overviewJson.contracts.taskOutcome && overviewJson.contracts.taskOutcome.reasonMapKeys), "overview taskOutcome reasonMapKeys must be an array");
    assert(overviewJson.contracts.designAcceptance && typeof overviewJson.contracts.designAcceptance === "object", "overview designAcceptance contract missing");
    assert(overviewJson.memory.taste && typeof overviewJson.memory.taste === "object", "overview taste memory missing");
    assert(overviewJson.traceability && typeof overviewJson.traceability === "object", "overview traceability missing");
    assert(Array.isArray(overviewJson.traceability.clauses), "overview traceability clauses must be an array");
    const signoffLatest = overviewJson.evidence && overviewJson.evidence.signoff && overviewJson.evidence.signoff.latest;
    const signoffRecent = overviewJson.evidence && overviewJson.evidence.signoff && Array.isArray(overviewJson.evidence.signoff.recent)
      ? overviewJson.evidence.signoff.recent
      : [];
    if (signoffLatest && signoffRecent.length > 1) {
      const latestTs = Number(signoffLatest.generatedAt || 0);
      const nextTs = Number(signoffRecent[1].generatedAt || 0);
      assert(latestTs >= nextTs, "signoff latest bundle is not ordered by generatedAt");
    }
    const runtimeProofLatest = overviewJson.evidence && overviewJson.evidence.runtimeProof && overviewJson.evidence.runtimeProof.latest;
    const runtimeProofRecent = overviewJson.evidence && overviewJson.evidence.runtimeProof && Array.isArray(overviewJson.evidence.runtimeProof.recent)
      ? overviewJson.evidence.runtimeProof.recent
      : [];
    if (runtimeProofLatest && runtimeProofRecent.length > 1) {
      const latestTs = Number(runtimeProofLatest.generatedAt || 0);
      const nextTs = Number(runtimeProofRecent[1].generatedAt || 0);
      assert(latestTs >= nextTs, "runtime proof latest bundle is not ordered by generatedAt");
    }

    const htmlRes = await httpRequest(port, "/01.HarnesUI/overview.html");
    assert.strictEqual(htmlRes.statusCode, 200, "GET /01.HarnesUI/overview.html must return 200");
    assert(htmlRes.raw.includes("Harness Overview"), "served overview html should include title text");
    assert(htmlRes.raw.includes("./overview.js"), "served overview html must reference ./overview.js");
    const overviewJsRes = await httpRequest(port, "/01.HarnesUI/overview.js");
    assert.strictEqual(overviewJsRes.statusCode, 200, "GET /01.HarnesUI/overview.js must return 200");
    const vmHarness = await createOverviewVmHarness(overviewJson, {
      htmlSource: htmlRes.raw,
      scriptSource: overviewJsRes.raw,
    });
    assertRenderedOverviewMatchesPayload(overviewJson, vmHarness.elements);
    const scopedPayload = mergeObjects(overviewJson, {
      runtime: {
        activeAgent: "worker-scoped-proof",
      },
    });
    const scopedHarness = await createOverviewVmHarness(scopedPayload, {
      htmlSource: htmlRes.raw,
      scriptSource: overviewJsRes.raw,
    });
    assertRenderedOverviewMatchesPayload(scopedPayload, scopedHarness.elements);
    assertContains(scopedHarness.elements.overviewHeroText.textContent, "worker-scoped-proof", "served renderer must keep active runtime agent distinct in scoped proof");
    assertContains(
      scopedHarness.elements.overviewHeroText.textContent,
      payloadDefaultExecAgent(scopedPayload),
      "served renderer must keep default exec agent distinct in scoped proof"
    );
    const missingActivePayload = mergeObjects(overviewJson, {
      runtime: {
        activeAgent: "",
      },
    });
    const missingActiveHarness = await createOverviewVmHarness(missingActivePayload, {
      htmlSource: htmlRes.raw,
      scriptSource: overviewJsRes.raw,
    });
    assert.strictEqual(
      countOccurrences(missingActiveHarness.elements.overviewHeroText.textContent, payloadDefaultExecAgent(overviewJson)),
      1,
      "missing active agent must not fall back to default"
    );
    const missingDefaultExecPayload = mergeObjects(overviewJson, {
      runtime: {
        activeAgent: "worker-proof-missing-default",
        fullUtilization: {
          actual: {
            defaultExecAgent: "",
          },
        },
      },
    });
    const missingDefaultExecHarness = await createOverviewVmHarness(missingDefaultExecPayload, {
      htmlSource: htmlRes.raw,
      scriptSource: overviewJsRes.raw,
    });
    assert.strictEqual(
      countOccurrences(missingDefaultExecHarness.elements.overviewHeroText.textContent, "worker-proof-missing-default"),
      1,
      "missing default exec agent must not fall back to activeAgent"
    );
    assert.strictEqual(
      countOccurrences(missingDefaultExecHarness.elements.overviewHeroText.textContent, "worker-proof-missing-default") > 1,
      false,
      "missing default exec agent must never alias the active runtime agent"
    );
    return `port=${port}`;
  } finally {
    await stopServer(child);
  }
}

async function main() {
  const serverJs = readFile(serverJsPath);
  const overviewHtml = readFile(overviewHtmlPath);
  const overviewJs = readFile(overviewJsPath);
  const indexHtml = readFile(indexHtmlPath);
  const checks = [];

  checks.push(
    runCheck("main UI exposes Overview navigation", () => {
      assertRegex(indexHtml, /href=\"\.\/overview\.html\"/, "index.html does not link to overview.html");
    })
  );
  checks.push(
    runCheck("overview html declares primary panels", () => {
      assertRegex(overviewHtml, /id=\"overviewMetrics\"/, "overviewMetrics container missing");
      assertRegex(overviewHtml, /id=\"jobScenarioGrid\"/, "jobScenarioGrid container missing");
      assertRegex(overviewHtml, /id=\"capabilitySurfaceGrid\"/, "capabilitySurfaceGrid container missing");
      assertRegex(overviewHtml, /id=\"demoFlowGrid\"/, "demoFlowGrid container missing");
      assertRegex(overviewHtml, /id=\"topologyParentLane\"/, "topologyParentLane container missing");
      assertRegex(overviewHtml, /id=\"traceabilityCard\"/, "traceabilityCard container missing");
      assertRegex(overviewHtml, /id=\"governedMemoryCard\"/, "governedMemoryCard container missing");
      assertRegex(overviewHtml, /id=\"documentToolingCard\"/, "documentToolingCard container missing");
      assertRegex(overviewHtml, /id=\"overviewRawSnapshot\"/, "overviewRawSnapshot container missing");
      assertRegex(overviewHtml, /class=\"overview-section-shell\"/, "overview sections must expose collapsible shells");
      assertRegex(overviewHtml, /class=\"overview-section-summary\"/, "overview sections must expose collapsible summaries");
      assertRegex(overviewHtml, /src=\"\.\/overview\.js\"/, "overview.html must reference ./overview.js");
    })
  );
  checks.push(
    runCheck("overview html covers every overview.js mount id", () => {
      const htmlIds = extractHtmlIds(overviewHtml);
      const requiredIds = extractOverviewElementIds(overviewJs);
      assert(requiredIds.length > 0, "overview.js must declare required DOM ids");
      for (const id of requiredIds) {
        assert(htmlIds.has(id), `overview.html missing required id=${id}`);
      }
      return `ids=${requiredIds.length}`;
    })
  );
  checks.push(
    runCheck("overview js fetches /api/harness/overview and auto-refreshes", () => {
      assertRegex(overviewJs, /fetch\(\"\/api\/harness\/overview\"/, "overview.js does not fetch /api/harness/overview");
      assertRegex(overviewJs, /const OVERVIEW_REFRESH_MS = 20000;/, "overview refresh interval missing");
      assertRegex(overviewJs, /setInterval\(\(\) => \{\s*loadOverview\(\)\.catch\(\(\) => \{\}\);/s, "overview auto-refresh ticker missing");
      assertRegex(overviewJs, /reasonMapKeys/, "overview.js does not read taskOutcome.reasonMapKeys");
      assertRegex(overviewJs, /renderTraceability/, "overview.js does not render traceability");
    })
  );
  checks.push(
    runCheck("server exposes overview route and builder", () => {
      const requestHandlerSource = readFile(requestHandlerPath);
      const overviewRoutesSource = readFile(overviewRoutesPath);
      assertRegex(serverJs, /function buildHarnessOverviewSnapshot\(\)/, "buildHarnessOverviewSnapshot() missing");
      assertRegex(requestHandlerSource, /createOverviewRoutes/, "request handler must register overview routes");
      assertRegex(overviewRoutesSource, /pathname === \"\/api\/harness\/overview\"/, "GET /api/harness/overview route missing");
    })
  );
  checks.push(
    runCheck("overview surface module builds governed graph payload without write-syncing", () => {
      const snapshot = buildHarnessOverviewPayload({
        apiVersion: "test",
        buildBrowserCapabilityOverview: () => ({ browser: true }),
        buildBundleOverview: () => ({ latest: null, recent: [] }),
        buildContinuityOverviewSnapshot: () => ({ continuity: true }),
        buildEvalHistoryOverview: () => ([{ runId: "eval-1" }]),
        buildExecutionMemoryOverview: () => ({ items: [] }),
        buildHarnessTraceabilitySnapshot: () => ({ clauses: [] }),
        buildRuntimeApiSnapshot: () => ({
          activeAgent: "default",
          latestTurn: {
            planning: {},
            agent_name: "default",
          },
          governancePolicy: { schema: "governance.v1" },
          contractSpec: { schema: "turn.v1" },
          taskOutcomeContract: { schema: "task-outcome.v1" },
          planningContracts: { schema: "planning.v1" },
          intentFirst: {
            contract: { schema: "design.v1" },
            tasteMemory: {},
          },
          harnessMemory: {},
          externalLearning: {},
          manualSelfImprovement: {},
          agiImprovementFlywheel: {},
          secondaryLearning: {},
          fullUtilization: {},
          slo: {},
          evalHarness: {
            suite: {},
          },
          governedMemory: { status: "ready", itemCount: 3 },
        }),
        buildRuntimeProofBundleSnapshot: () => ({}),
        buildSignoffBundleSnapshot: () => ({}),
        buildSkillPortfolioOverview: () => ({ assignments: [] }),
        buildTopographyOverview: () => ({ parent: [], specialists: [] }),
        getAgentTopographySnapshot: () => ({}),
        harnessMemoryLoaded: true,
        listReplayMemorySnapshots: () => ([]),
        loadHarnessExecutionMemoryStore: () => {
          throw new Error("loadHarnessExecutionMemoryStore should not run for the module smoke check");
        },
        loggingSurfacePaths: {
          currentRoot: "logs/current",
          currentOperatorSummaryPath: "logs/current/operator_summary.json",
          currentIndexPath: "logs/current/index.json",
          currentDesignConformancePath: "logs/current/design_conformance_summary.json",
          currentLatestRunSummaryPath: "logs/current/latest_run_summary.json",
          currentReviewLoadBreakdownPath: "logs/current/review_load_breakdown.json",
          currentLatestSignoffSummaryPath: "logs/current/latest_signoff_summary.json",
        },
        repoRelativePath: (_root, targetPath) => String(targetPath || ""),
        runtimeProofsRoot: "logs/bundles/runtime_proof",
        safeString: (value, max = 12000) => (typeof value === "string" ? value.trim().slice(0, max) : ""),
        sanitizeRuntimeSnapshotForOverview: (value) => value,
        signoffBundlesRoot: "logs/bundles/signoff",
        syncGovernedMemoryGraph: () => {
          throw new Error("GET overview payload must not refresh governed memory artifacts");
        },
        workspaceRoot: workspaceRoot,
      });

      assert.strictEqual(snapshot.memory.governedGraph.status, "ready", "module must preserve runtime governed graph summary");
      assert.strictEqual(snapshot.memory.governedGraph.source, "runtime_snapshot_no_write", "module must mark overview memory as a no-write runtime snapshot");
      assert(Array.isArray(snapshot.eval.recentRuns), "module must keep recent eval runs structured");
    })
  );

  try {
    const detail = await runClientRefreshRaceCheck();
    console.log(`PASS overview stale refresh guard :: ${detail}`);
    checks.push({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`FAIL overview stale refresh guard :: ${message}`);
    checks.push({ ok: false, error: message });
  }

  try {
    const detail = await runReviewerReadoutCompletionSeparationCheck();
    console.log(`PASS overview reviewer readout completion separation :: ${detail}`);
    checks.push({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`FAIL overview reviewer readout completion separation :: ${message}`);
    checks.push({ ok: false, error: message });
  }

  try {
    const detail = await runIntegrationCheck();
    console.log(`PASS overview integration :: ${detail}`);
    checks.push({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`FAIL overview integration :: ${message}`);
    checks.push({ ok: false, error: message });
  }

  const failed = checks.filter((entry) => !entry.ok);
  if (failed.length) {
    process.exitCode = 1;
    return;
  }
  console.log("PASS");
}

main().catch((error) => {
  console.error(`FAIL fatal :: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
