#!/usr/bin/env node
"use strict";

const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const {
  extractArticleInsights,
  buildRuntimeLearningSelection,
  buildRuntimePromptInjection,
  normalizeOpenAIBlogLearningPolicy,
  recordOpenAIBlogLearningObservation,
  runOpenAIBlogLearningCycle,
  buildRuntimeSnapshotFromArtifacts,
} = require("./lib/openai_blog_learning");

function makeTempWorkspace() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "openai-blog-learning-"));
  fs.mkdirSync(path.join(root, "docs"), { recursive: true });
  fs.mkdirSync(path.join(root, "output"), { recursive: true });
  fs.mkdirSync(path.join(root, "scripts", "config"), { recursive: true });
  return root;
}

function sampleIndexHtml() {
  return `
    <a class="resource-item" href="/blog/designing-delightful-frontends-with-gpt-5-4">
      <img alt="Designing delightful frontends with GPT-5.4">
      <div class="text-secondary">Mar 21</div>
      <div class="line-clamp-2">Designing delightful frontends with GPT-5.4</div>
      <p>Practical techniques for steering GPT-5.4 toward polished, production-ready frontend designs.</p>
      <div class="text-sm text-secondary">Codex</div>
    </a>
    <a class="resource-item" href="/blog/run-long-horizon-tasks-with-codex">
      <img alt="Run long horizon tasks with Codex">
      <div class="text-secondary">Feb 23</div>
      <div class="line-clamp-2">Run long horizon tasks with Codex</div>
      <p>Long-horizon Codex workflows with specs, checkpoints, and verification.</p>
      <div class="text-sm text-secondary">Codex</div>
    </a>
  `;
}

function sampleFrontendArticleHtml() {
  return `
    <html>
      <head>
        <title>Designing delightful frontends with GPT-5.4 | OpenAI Developers</title>
        <meta name="description" content="Practical techniques for steering GPT-5.4 toward polished, production-ready frontend designs.">
        <link rel="canonical" href="https://developers.openai.com/blog/designing-delightful-frontends-with-gpt-5-4/">
      </head>
      <body>
        <article id="mainContent">
          <p>Define your design system and constraints upfront so the model has a coherent target.</p>
          <p>Provide visual references or a mood board to create visual guardrails.</p>
          <h2>Frontend tasks</h2>
          <li>Use expressive typography and avoid default stacks.</li>
          <li>Use motion to create presence and hierarchy.</li>
        </article>
      </body>
    </html>
  `;
}

function sampleLongHorizonArticleHtml() {
  return `
    <html>
      <head>
        <title>Run long horizon tasks with Codex | OpenAI Developers</title>
        <meta name="description" content="Use specs, checkpoints, and verification for long-running Codex tasks.">
        <link rel="canonical" href="https://developers.openai.com/blog/run-long-horizon-tasks-with-codex/">
      </head>
      <body>
        <article id="mainContent">
          <p>Start with a spec file and clear acceptance criteria before the long task begins.</p>
          <p>Use checkpoints, runbooks, and continuous verification to control drift.</p>
          <h2>Execution control</h2>
          <li>Keep an audit log of what the agent changed.</li>
          <li>Use verification after each checkpoint.</li>
        </article>
      </body>
    </html>
  `;
}

function sampleFigmaArticleHtmlWithVideoNoise() {
  return `
    <html>
      <head>
        <title>Building frontend UIs with Codex and Figma | OpenAI Developers</title>
        <meta name="description" content="Use Codex and Figma to bring real, running interfaces into Figma and back into code.">
      </head>
      <body>
        <article id="mainContent">
          <p>One of the core use cases of the Figma MCP server is retrieving context from Figma files and using that context in code generation.</p>
          <p>These selection URLs link directly to a frame or node on the canvas, which gives the agent concrete source data for code generation.</p>
          <p>Help me implement this Figma design in code, use my existing design system components as much as possible. Your browser does not support the video tag. Prompts like this will instruct the agent to call the get_design_context tool from the Figma MCP server.</p>
          <li>Reuse the existing design system components as much as possible.</li>
        </article>
      </body>
    </html>
  `;
}

function sampleArticleHtmlWithClippedSentence() {
  return `
    <html>
      <head>
        <title>Using skills to accelerate OSS maintenance | OpenAI Developers</title>
      </head>
      <body>
        <article id="mainContent">
          <p>Repo-local skills and repository policy let teams turn recurring engineering work into repeatable workflows.</p>
          <p>The Codex customization docs describe why this works well: skills are a good fit for repeatable workflows because they ca</p>
          <li>Repo-local skills in .agents/skills/</li>
        </article>
      </body>
    </html>
  `;
}

async function run() {
  const workspaceRoot = makeTempWorkspace();
  const policyPath = path.join(workspaceRoot, "scripts", "config", "openai_blog_learning_policy.json");
  const policy = normalizeOpenAIBlogLearningPolicy({
    schema: "openai-blog-learning-policy.v1",
    source: {
      name: "OpenAI Developers Blog",
      indexUrl: "https://developers.openai.com/blog",
      allowedHosts: ["developers.openai.com"],
      pinnedArticleUrls: ["https://developers.openai.com/blog/run-long-horizon-tasks-with-codex"],
    },
    cadence: {
      intervalMinutes: 1440,
      startupDelayMs: 1000,
      requestTimeoutMs: 5000,
      maxArticlesPerRun: 1,
      maxGuidanceItemsPerArticle: 4,
    },
    governance: {
      mode: "observe_propose_and_doc_sync",
      autoPromoteDocs: true,
      autoPromoteDocPath: "docs/OPENAI_DEVELOPER_LEARNINGS.md",
      blockedApplyTargets: ["AGENTS.md"],
      proposalOnlyTargets: ["docs/CONTEXT_MEMORY_POLICY.md", "scripts/config/eval_suite_default.json", "skills/web-designer-master/references/quality-gate.md", "docs/AGENT_OPERATING_RULES.md", "docs/AGENT_SKILL_MATRIX.md"],
      frozenFoundationTargets: ["scripts/lib/planning_mode_policy.js"],
    },
    retrieval: {
      maxTopicEntries: 4,
      allowedTopics: ["codex", "frontend", "context", "automation", "skills", "agents", "evals"],
    },
    runtimeRetrieval: {
      enabled: true,
      shadowMode: false,
      applyToAgents: ["default", "frontend_worker"],
      applyToTaskFamilies: ["web_creative"],
      topicPriority: ["frontend", "evals", "context", "codex", "skills", "automation"],
      maxArticles: 2,
      maxGuidanceItemsPerArticle: 2,
      maxPromptBlockChars: 1200,
    },
    stabilization: {
      enabled: true,
      applyToAgents: ["default", "frontend_worker"],
      applyToTaskFamilies: ["web_creative"],
      minSuccessfulTurnsForPromotion: 2,
      minSuccessRate: 0.67,
      maxPromotedNotes: 4,
      maxGuidanceItemsPerNote: 3,
      maxPromptNotes: 2,
    },
    selfImprovement: {
      enabled: true,
      promotionPolicyPath: path.resolve(__dirname, "config", "self_improvement_promotion_policy.json"),
    },
    artifacts: {
      proposalIdPrefix: "openai-blog",
    },
    paths: {
      selfImprovementProposalDir: "output/openai_blog_self_improvement_proposals",
      selfImprovementStatePath: "output/openai_blog_self_improvement_state.json",
      selfImprovementGatePath: "output/openai_blog_self_improvement_gate.json",
      stabilizationMemoryPath: "output/openai_blog_reinforcement_memory.json",
      stabilizationPlaybookPath: "docs/FRONTEND_QUALITY_PLAYBOOK.md",
    },
  }, { policyPath });

  const fetchText = async (url) => {
    if (url === "https://developers.openai.com/blog") {
      return sampleIndexHtml();
    }
    if (url.includes("designing-delightful-frontends")) {
      return sampleFrontendArticleHtml();
    }
    if (url.includes("run-long-horizon-tasks-with-codex")) {
      return sampleLongHorizonArticleHtml();
    }
    throw new Error(`unexpected url ${url}`);
  };

  const first = await runOpenAIBlogLearningCycle({
    policy,
    fetchText,
    now: new Date("2026-03-23T00:00:00.000Z"),
  });
  assert.strictEqual(first.report.status, "PASS", "first cycle should pass");
  assert.strictEqual(first.report.summary.trackedArticles, 2, "latest article plus pinned article should be tracked");
  assert.strictEqual(first.report.summary.newArticlesThisRun, 2, "both articles should be new on first run");
  assert(first.digest.topics.frontend && first.digest.topics.frontend.length >= 1, "frontend topic should be indexed");
  assert(first.digest.topics.codex && first.digest.topics.codex.length >= 1, "codex topic should be indexed");
  assert(fs.existsSync(path.join(workspaceRoot, "docs", "OPENAI_DEVELOPER_LEARNINGS.md")), "curated doc should be written");
  assert(fs.existsSync(path.join(workspaceRoot, "output", "openai_blog_learning_proposals", "run-long-horizon-tasks-with-codex.json")), "proposal artifact should be written");
  assert(fs.existsSync(path.join(workspaceRoot, "output", "openai_blog_self_improvement_proposals", "designing-delightful-frontends-with-gpt-5-4.json")), "self improvement proposal artifact should be written");
  assert(fs.existsSync(path.join(workspaceRoot, "output", "openai_blog_self_improvement_state.json")), "self improvement state artifact should be written");
  assert(fs.existsSync(path.join(workspaceRoot, "output", "openai_blog_self_improvement_gate.json")), "self improvement gate artifact should be written");
  assert(fs.existsSync(path.join(workspaceRoot, "docs", "FRONTEND_QUALITY_PLAYBOOK.md")), "frontend quality playbook should be written");
  const longHorizonArticle = first.ledger.articles.find((entry) => entry.articleId === "run-long-horizon-tasks-with-codex");
  assert(longHorizonArticle, "run-long-horizon article should be present in the ledger");
  assert.strictEqual(longHorizonArticle.indexDateLabel, "pinned", "pinned article should be retained outside the latest-card budget");
  assert.notStrictEqual(longHorizonArticle.summary, "OpenAI Developer Blog", "summary should not keep the boilerplate page description");
  assert(/specs, checkpoints, and verification|spec file and clear acceptance criteria/i.test(longHorizonArticle.summary), "summary should retain article-specific long-horizon guidance");
  assert(first.selfImprovement && first.selfImprovement.state, "self improvement state should be returned");
  assert.strictEqual(first.selfImprovement.gate.status, "PASS", "self improvement gate should pass fixture coverage");
  assert(first.selfImprovement.state.appliedHintCount >= 1, "primary lane should auto-apply at least one bounded runtime hint");
  assert.strictEqual(Number(first.selfImprovement.state.appliedFrontendQualityNoteCount) || 0, 0, "frontend quality notes should not auto-apply before reinforcement");
  assert.strictEqual(String(first.selfImprovement.state.observationStatus || ""), "starved", "initial frontend-note lane should expose observation starvation");
  assert.strictEqual(Number(first.selfImprovement.state.observationCount) || 0, 0, "initial state should start with zero recorded observations");
  assert.strictEqual(Number(first.selfImprovement.state.readyHintCandidateCount) || 0, 1, "fixture should expose one ready runtime hint candidate while the second remains shadow-only");
  assert.strictEqual(Number(first.selfImprovement.state.awaitingObservationCount) || 0, 1, "frontend notes should wait for observations before promotion");
  assert.strictEqual(Number(first.selfImprovement.state.rawAutoApplyChangeCount) || 0, 2, "raw auto-apply change count should cover the ready runtime hint and the waiting frontend note");
  assert(first.selfImprovement.state.nextPriority && typeof first.selfImprovement.state.nextPriority === "object", "self improvement state should expose the next priority candidate");
  assert(first.selfImprovement.state.nextPriority.reinforcement && typeof first.selfImprovement.state.nextPriority.reinforcement === "object", "next priority should expose reinforcement progress");
  assert.strictEqual(Number(first.selfImprovement.state.nextPriority.reinforcement.requiredSuccesses) || 0, 2, "next priority should expose the required observation wins");
  assert.strictEqual(Number(first.selfImprovement.state.nextPriority.reinforcement.remainingSuccesses) || 0, 2, "next priority should expose the remaining required wins");
  assert.strictEqual(Number(first.selfImprovement.state.priorityBacklog[0].reinforcement.observedCount) || 0, 0, "priority backlog should preserve reinforcement progress details");
  assert((Number(first.selfImprovement.gate.results[0].limits.maxPromptBlockChars) || 0) > 0, "gate results should surface prompt block budgets");
  const stableSelfImprovementState = fs.readFileSync(path.join(workspaceRoot, "output", "openai_blog_self_improvement_state.json"), "utf8");
  const stableSelfImprovementGate = fs.readFileSync(path.join(workspaceRoot, "output", "openai_blog_self_improvement_gate.json"), "utf8");
  const stableFrontendProposal = fs.readFileSync(path.join(workspaceRoot, "output", "openai_blog_self_improvement_proposals", "designing-delightful-frontends-with-gpt-5-4.json"), "utf8");
  const stablePlaybook = fs.readFileSync(path.join(workspaceRoot, "docs", "FRONTEND_QUALITY_PLAYBOOK.md"), "utf8");
  const stableReinforcementMemory = fs.readFileSync(path.join(workspaceRoot, "output", "openai_blog_reinforcement_memory.json"), "utf8");
  const figmaInsights = extractArticleInsights(sampleFigmaArticleHtmlWithVideoNoise(), 4);
  assert(figmaInsights.guidance.every((entry) => !/video tag/i.test(entry)), "guidance extraction should drop embedded video-tag boilerplate");
  assert(figmaInsights.guidance.some((entry) => /selection urls|design system components/i.test(entry)), "guidance extraction should keep the cleaner Figma-specific instructions");
  const clippedInsights = extractArticleInsights(sampleArticleHtmlWithClippedSentence(), 4);
  assert(clippedInsights.guidance.every((entry) => !/because they ca$/i.test(entry)), "guidance extraction should drop long open-ended fragments that end mid-sentence");

  const second = await runOpenAIBlogLearningCycle({
    policy,
    fetchText,
    now: new Date("2026-03-23T06:00:00.000Z"),
  });
  assert.strictEqual(second.report.summary.newArticlesThisRun, 0, "second cycle should not rediscover already read articles");
  assert.strictEqual(fs.readFileSync(path.join(workspaceRoot, "output", "openai_blog_self_improvement_state.json"), "utf8"), stableSelfImprovementState, "self-improvement state should not drift on timestamp-only reruns");
  assert.strictEqual(fs.readFileSync(path.join(workspaceRoot, "output", "openai_blog_self_improvement_gate.json"), "utf8"), stableSelfImprovementGate, "self-improvement gate should not drift on timestamp-only reruns");
  assert.strictEqual(fs.readFileSync(path.join(workspaceRoot, "output", "openai_blog_self_improvement_proposals", "designing-delightful-frontends-with-gpt-5-4.json"), "utf8"), stableFrontendProposal, "self-improvement proposals should not churn timestamps without semantic changes");
  assert.strictEqual(fs.readFileSync(path.join(workspaceRoot, "docs", "FRONTEND_QUALITY_PLAYBOOK.md"), "utf8"), stablePlaybook, "frontend quality playbook should stay stable when only generatedAt would change");
  assert.strictEqual(fs.readFileSync(path.join(workspaceRoot, "output", "openai_blog_reinforcement_memory.json"), "utf8"), stableReinforcementMemory, "reinforcement memory should stay stable without new observations");

  const runtime = buildRuntimeSnapshotFromArtifacts(policy, {
    enabled: true,
    running: false,
    lastStatus: "PASS",
    lastReason: "test",
    nextRunAt: "2026-03-23T12:00:00.000Z",
  });
  assert.strictEqual(runtime.enabled, true, "runtime snapshot should preserve enabled flag");
  assert.strictEqual(runtime.trackedArticles, 2, "runtime snapshot should surface tracked article count");
  assert(runtime.curatedDocPath.endsWith("docs/OPENAI_DEVELOPER_LEARNINGS.md"), "runtime snapshot should surface curated doc path");
  assert(runtime.pendingProposalCount >= 1, "runtime snapshot should surface pending proposal count");
  assert(runtime.runtimeRetrieval && runtime.runtimeRetrieval.enabled === true, "runtime snapshot should surface runtime retrieval posture");
  assert(runtime.selfImprovement && runtime.selfImprovement.gateStatus === "PASS", "runtime snapshot should surface self improvement gate status");
  assert(Number(runtime.selfImprovement.appliedHintCount) >= 1, "runtime snapshot should surface applied hint count");
  assert.strictEqual(Number(runtime.selfImprovement.appliedFrontendQualityNoteCount) || 0, 0, "runtime snapshot should not claim reinforced notes before observations");
  assert.strictEqual(String(runtime.selfImprovement.observationStatus || ""), "starved", "runtime snapshot should expose observation starvation before reinforcement");
  assert.strictEqual(Number(runtime.selfImprovement.awaitingObservationCount) || 0, 1, "runtime snapshot should surface waiting frontend note observations");
  assert(runtime.selfImprovement.nextPriority && typeof runtime.selfImprovement.nextPriority === "object", "runtime snapshot should expose the next priority item");
  assert.strictEqual(Number(runtime.selfImprovement.nextPriority.reinforcement.requiredSuccesses) || 0, 2, "runtime snapshot should preserve next-priority observation thresholds");
  assert.strictEqual(Number(runtime.selfImprovement.nextPriority.reinforcement.remainingSuccesses) || 0, 2, "runtime snapshot should preserve next-priority remaining wins");

  const planningContext = {
    selection: {
      taskFamily: "web_creative",
      signals: {
        specialistOwners: ["frontend_worker"],
      },
      selectedPlanningDepth: "STANDARD_PLANNING",
      selectedAssuranceDepth: "STANDARD_ASSURANCE",
    },
    dispatchPlan: {
      reviewerRequired: true,
      testerRequired: true,
      dispatches: [
        { ownerAgent: "frontend_worker" },
      ],
    },
    requirementContract: {
      taskFamily: "web_creative",
    },
  };
  const selection = buildRuntimeLearningSelection({
    prompt: "Build a benchmarked landing page in React and verify the final UI with screenshots.",
    agentName: "default",
    planningContext,
    policy,
  });
  assert.strictEqual(selection.status, "ready", "frontend web task should resolve runtime learning articles");
  assert(selection.matchedTopics.includes("frontend"), "frontend runtime retrieval should match frontend topic");
  assert(selection.articles.length >= 1, "runtime retrieval should select at least one article");
  assert(selection.matchedHintIds.length >= 1, "runtime retrieval should record self improvement hint usage");

  const injection = buildRuntimePromptInjection({
    prompt: "Build a benchmarked landing page in React and verify the final UI with screenshots.",
    agentName: "default",
    planningContext,
    policy,
  });
  assert.strictEqual(injection.status, "applied", "guarded runtime retrieval should apply a prompt block");
  assert(injection.prompt.includes("[HARNESS_EXTERNAL_LEARNING_CONTEXT_V1]"), "injected prompt should include the learning marker");
  assert(injection.prompt.includes("Designing delightful frontends with GPT-5.4"), "injected prompt should reference the matched official article");
  assert(Array.isArray(injection.matchedHintIds) && injection.matchedHintIds.length >= 1, "prompt injection should surface matched self improvement hints");
  assert(Array.isArray(injection.matchedFrontendQualityNoteIds) && injection.matchedFrontendQualityNoteIds.length === 0, "frontend quality notes should not appear before reinforcement");

  const firstObservation = recordOpenAIBlogLearningObservation({
    policy,
    turnId: "turn-001",
    threadId: "thread-001",
    agentName: "default",
    finalStatus: "completed",
    taskOutcomeStatus: "COMPLETED",
    planningContext,
    familyCompletionGate: { applies: true, status: "passed" },
    externalLearning: injection,
    now: new Date("2026-03-23T07:00:00.000Z"),
  });
  assert(firstObservation && firstObservation.selfImprovement && firstObservation.selfImprovement.state && firstObservation.selfImprovement.state.nextPriority, "first observation should refresh self-improvement state");
  assert.strictEqual(String(firstObservation.selfImprovement.state.observationStatus || ""), "collecting", "first observation should move the lane into collecting status");
  assert.strictEqual(Number(firstObservation.selfImprovement.state.observationCount) || 0, 1, "first observation should increment the observation counter");
  assert.strictEqual(Number(firstObservation.selfImprovement.state.awaitingObservationCount) || 0, 0, "first observation should clear the waiting-observation count");
  assert.strictEqual(Number(firstObservation.selfImprovement.state.awaitingReinforcementCount) || 0, 1, "first observation should move the note into reinforcement wait");
  assert.strictEqual(Number(firstObservation.selfImprovement.state.nextPriority.reinforcement.remainingSuccesses) || 0, 1, "first observation should reduce the remaining required wins");
  const reinforcementResult = recordOpenAIBlogLearningObservation({
    policy,
    turnId: "turn-002",
    threadId: "thread-001",
    agentName: "default",
    finalStatus: "completed",
    taskOutcomeStatus: "COMPLETED",
    planningContext,
    familyCompletionGate: { applies: true, status: "passed" },
    externalLearning: injection,
    now: new Date("2026-03-23T08:00:00.000Z"),
  });
  assert(reinforcementResult && reinforcementResult.skipped === false, "second reinforcement observation should be recorded");
  assert(fs.existsSync(path.join(workspaceRoot, "output", "openai_blog_reinforcement_memory.json")), "reinforcement memory should be written");
  const reinforcedState = JSON.parse(fs.readFileSync(path.join(workspaceRoot, "output", "openai_blog_self_improvement_state.json"), "utf8"));
  assert(Number(reinforcedState.appliedFrontendQualityNoteCount) >= 1, "reinforced frontend quality note should auto-apply after repeated successful turns");
  assert.strictEqual(Number(reinforcedState.awaitingObservationCount) || 0, 0, "reinforced state should clear waiting observation count after promotion");
  const reinforcedPlaybook = fs.readFileSync(path.join(workspaceRoot, "docs", "FRONTEND_QUALITY_PLAYBOOK.md"), "utf8");
  assert(/designing-delightful-frontends-with-gpt-5-4-frontend-quality/i.test(reinforcedPlaybook), "playbook should contain the promoted frontend quality note id");
  const reinforcedInjection = buildRuntimePromptInjection({
    prompt: "Build a benchmarked landing page in React and verify the final UI with screenshots.",
    agentName: "default",
    planningContext,
    policy,
  });
  assert(Array.isArray(reinforcedInjection.matchedFrontendQualityNoteIds) && reinforcedInjection.matchedFrontendQualityNoteIds.length >= 1, "reinforced runtime injection should surface frontend quality note ids");
  assert(/Harness-stabilized frontend quality notes:/i.test(reinforcedInjection.prompt), "reinforced runtime injection should include the stabilized playbook block");

  const noteOnlyRoot = makeTempWorkspace();
  const noteOnlyPolicyPath = path.join(noteOnlyRoot, "scripts", "config", "openai_blog_learning_policy.json");
  const noteOnlyPromotionPolicyPath = path.join(noteOnlyRoot, "scripts", "config", "self_improvement_promotion_policy.json");
  fs.writeFileSync(noteOnlyPromotionPolicyPath, `${JSON.stringify({
    schema: "self-improvement-promotion-policy.v1",
    mode: "machine_guarded_autonomy",
    autoApply: {
      changeClasses: ["runtime_retrieval_hint", "frontend_quality_note"],
      requireGatePass: true,
      maxAutoApplyPerLane: 8,
    },
    proposalOnly: {
      targets: ["docs/CONTEXT_MEMORY_POLICY.md", "scripts/config/eval_suite_default.json"],
      changeClasses: ["memory_policy_note", "eval_extension", "operator_policy_note", "runtime_policy_tuning"],
    },
    blocked: {
      targets: ["AGENTS.md", "scripts/lib/planning_mode_policy.js"],
    },
    evalGate: {
      schema: "self-improvement-eval-gate.v1",
      cases: [
        {
          caseId: "frontend_note_only",
          agentName: "default",
          taskFamily: "web_creative",
          prompt: "Refine the design system, typography, and motion so the page feels coherent.",
          requiredTopics: ["frontend"],
          maxTopics: 4,
          maxPromptBlockChars: 800,
        },
      ],
    },
  }, null, 2)}\n`, "utf8");
  const noteOnlyPolicy = normalizeOpenAIBlogLearningPolicy({
    schema: "openai-blog-learning-policy.v1",
    source: {
      name: "OpenAI Developers Blog",
      indexUrl: "https://developers.openai.com/blog",
      allowedHosts: ["developers.openai.com"],
    },
    cadence: {
      intervalMinutes: 1440,
      startupDelayMs: 1000,
      requestTimeoutMs: 5000,
      maxArticlesPerRun: 4,
      maxGuidanceItemsPerArticle: 4,
    },
    governance: {
      mode: "observe_propose_and_doc_sync",
      autoPromoteDocs: true,
      autoPromoteDocPath: "docs/OPENAI_DEVELOPER_LEARNINGS.md",
      blockedApplyTargets: ["AGENTS.md"],
      proposalOnlyTargets: ["docs/CONTEXT_MEMORY_POLICY.md", "scripts/config/eval_suite_default.json", "skills/web-designer-master/references/quality-gate.md", "docs/AGENT_OPERATING_RULES.md", "docs/AGENT_SKILL_MATRIX.md"],
      frozenFoundationTargets: ["scripts/lib/planning_mode_policy.js"],
    },
    retrieval: {
      maxTopicEntries: 4,
      allowedTopics: ["frontend", "context", "automation", "skills", "agents", "evals"],
    },
    runtimeRetrieval: {
      enabled: false,
      shadowMode: false,
      applyToAgents: ["default", "frontend_worker"],
      applyToTaskFamilies: ["web_creative"],
      topicPriority: ["frontend", "context"],
      maxArticles: 0,
      maxGuidanceItemsPerArticle: 0,
      maxPromptBlockChars: 800,
    },
    stabilization: {
      enabled: true,
      applyToAgents: ["default", "frontend_worker"],
      applyToTaskFamilies: ["web_creative"],
      minSuccessfulTurnsForPromotion: 2,
      minSuccessRate: 0.67,
      maxPromotedNotes: 4,
      maxGuidanceItemsPerNote: 3,
      maxPromptNotes: 2,
    },
    selfImprovement: {
      enabled: true,
      promotionPolicyPath: noteOnlyPromotionPolicyPath,
    },
    artifacts: {
      proposalIdPrefix: "openai-blog",
    },
    paths: {
      selfImprovementProposalDir: "output/openai_blog_self_improvement_proposals",
      selfImprovementStatePath: "output/openai_blog_self_improvement_state.json",
      selfImprovementGatePath: "output/openai_blog_self_improvement_gate.json",
      stabilizationMemoryPath: "output/openai_blog_reinforcement_memory.json",
      stabilizationPlaybookPath: "docs/FRONTEND_QUALITY_PLAYBOOK.md",
    },
  }, { policyPath: noteOnlyPolicyPath });
  const noteOnlyFetchText = async (url) => {
    if (url === "https://developers.openai.com/blog") {
      return `
        <a class="resource-item" href="/blog/designing-delightful-frontends-with-gpt-5-4">
          <img alt="Designing delightful frontends with GPT-5.4">
          <div class="text-secondary">Mar 21</div>
          <div class="line-clamp-2">Designing delightful frontends with GPT-5.4</div>
          <p>Practical techniques for steering GPT-5.4 toward polished, production-ready frontend designs.</p>
          <div class="text-sm text-secondary">Codex</div>
        </a>
      `;
    }
    if (url.includes("designing-delightful-frontends")) {
      return sampleFrontendArticleHtml();
    }
    throw new Error(`unexpected url ${url}`);
  };
  const noteOnlyFirst = await runOpenAIBlogLearningCycle({
    policy: noteOnlyPolicy,
    fetchText: noteOnlyFetchText,
    now: new Date("2026-03-24T00:00:00.000Z"),
  });
  assert.strictEqual(Number(noteOnlyFirst.selfImprovement.state.appliedHintCount) || 0, 0, "note-only lane should not apply runtime hints");
  assert.strictEqual(Number(noteOnlyFirst.selfImprovement.state.awaitingObservationCount) || 0, 1, "note-only lane should wait for observations before promotion");
  const noteOnlyPlanningContext = {
    selection: {
      taskFamily: "web_creative",
      signals: {
        specialistOwners: ["frontend_worker"],
      },
      selectedPlanningDepth: "STANDARD_PLANNING",
      selectedAssuranceDepth: "STANDARD_ASSURANCE",
    },
    dispatchPlan: {
      reviewerRequired: true,
      testerRequired: true,
      dispatches: [
        { ownerAgent: "frontend_worker" },
      ],
    },
    requirementContract: {
      taskFamily: "web_creative",
    },
  };
  recordOpenAIBlogLearningObservation({
    policy: noteOnlyPolicy,
    turnId: "note-turn-001",
    threadId: "thread-note-001",
    agentName: "default",
    finalStatus: "completed",
    taskOutcomeStatus: "COMPLETED",
    planningContext: noteOnlyPlanningContext,
    familyCompletionGate: { applies: true, status: "passed" },
    externalLearning: {
      articles: [{ articleId: "designing-delightful-frontends-with-gpt-5-4" }],
      matchedTopics: ["frontend"],
    },
    now: new Date("2026-03-24T01:00:00.000Z"),
  });
  recordOpenAIBlogLearningObservation({
    policy: noteOnlyPolicy,
    turnId: "note-turn-002",
    threadId: "thread-note-001",
    agentName: "default",
    finalStatus: "completed",
    taskOutcomeStatus: "COMPLETED",
    planningContext: noteOnlyPlanningContext,
    familyCompletionGate: { applies: true, status: "passed" },
    externalLearning: {
      articles: [{ articleId: "designing-delightful-frontends-with-gpt-5-4" }],
      matchedTopics: ["frontend"],
    },
    now: new Date("2026-03-24T02:00:00.000Z"),
  });
  const noteOnlyState = JSON.parse(fs.readFileSync(path.join(noteOnlyRoot, "output", "openai_blog_self_improvement_state.json"), "utf8"));
  assert.strictEqual(Number(noteOnlyState.appliedHintCount) || 0, 0, "note-only lane should still have zero runtime hints after promotion");
  assert(Number(noteOnlyState.appliedFrontendQualityNoteCount) >= 1, "note-only lane should auto-apply frontend notes after reinforcement");
  assert.strictEqual(String(noteOnlyState.appliedDecision || ""), "applied", "note-only lane should mark the note promotion as applied");
  const noteOnlyInjection = buildRuntimePromptInjection({
    prompt: "Refine the design system typography and motion so the page feels coherent.",
    agentName: "default",
    planningContext: noteOnlyPlanningContext,
    policy: noteOnlyPolicy,
  });
  assert.strictEqual(noteOnlyInjection.status, "applied", "note-only prompt injection should still apply after note promotion");
  assert(Array.isArray(noteOnlyInjection.matchedFrontendQualityNoteIds) && noteOnlyInjection.matchedFrontendQualityNoteIds.length >= 1, "note-only prompt injection should expose promoted frontend note ids");

  console.log("[openai-blog-learning-test] PASS cycle, reinforcement, self-improvement gate, runtime snapshot, and runtime retrieval injection");
  console.log("PASS");
}

run().catch((error) => {
  console.error(`[openai-blog-learning-test] FAIL ${error instanceof Error ? error.message : String(error)}`);
  console.log("FAIL");
  process.exitCode = 1;
});
