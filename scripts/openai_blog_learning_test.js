#!/usr/bin/env node
"use strict";

const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const {
  buildRuntimeLearningSelection,
  buildRuntimePromptInjection,
  normalizeOpenAIBlogLearningPolicy,
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

async function run() {
  const workspaceRoot = makeTempWorkspace();
  const policyPath = path.join(workspaceRoot, "scripts", "config", "openai_blog_learning_policy.json");
  const policy = normalizeOpenAIBlogLearningPolicy({
    schema: "openai-blog-learning-policy.v1",
    source: {
      name: "OpenAI Developers Blog",
      indexUrl: "https://developers.openai.com/blog",
      allowedHosts: ["developers.openai.com"],
    },
    cadence: {
      intervalMinutes: 360,
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
  assert.strictEqual(first.report.summary.trackedArticles, 2, "two articles should be tracked");
  assert.strictEqual(first.report.summary.newArticlesThisRun, 2, "both articles should be new on first run");
  assert(first.digest.topics.frontend && first.digest.topics.frontend.length >= 1, "frontend topic should be indexed");
  assert(first.digest.topics.codex && first.digest.topics.codex.length >= 1, "codex topic should be indexed");
  assert(fs.existsSync(path.join(workspaceRoot, "docs", "OPENAI_DEVELOPER_LEARNINGS.md")), "curated doc should be written");
  assert(fs.existsSync(path.join(workspaceRoot, "output", "openai_blog_learning_proposals", "run-long-horizon-tasks-with-codex.json")), "proposal artifact should be written");

  const second = await runOpenAIBlogLearningCycle({
    policy,
    fetchText,
    now: new Date("2026-03-23T06:00:00.000Z"),
  });
  assert.strictEqual(second.report.summary.newArticlesThisRun, 0, "second cycle should not rediscover already read articles");

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

  const injection = buildRuntimePromptInjection({
    prompt: "Build a benchmarked landing page in React and verify the final UI with screenshots.",
    agentName: "default",
    planningContext,
    policy,
  });
  assert.strictEqual(injection.status, "applied", "guarded runtime retrieval should apply a prompt block");
  assert(injection.prompt.includes("[HARNESS_EXTERNAL_LEARNING_CONTEXT_V1]"), "injected prompt should include the learning marker");
  assert(injection.prompt.includes("Designing delightful frontends with GPT-5.4"), "injected prompt should reference the matched official article");

  console.log("[openai-blog-learning-test] PASS cycle, dedupe, runtime snapshot, and runtime retrieval injection");
  console.log("PASS");
}

run().catch((error) => {
  console.error(`[openai-blog-learning-test] FAIL ${error instanceof Error ? error.message : String(error)}`);
  console.log("FAIL");
  process.exitCode = 1;
});
