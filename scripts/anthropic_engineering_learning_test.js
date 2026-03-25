#!/usr/bin/env node
"use strict";

const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const {
  buildAnthropicEngineeringRuntimeSnapshot,
  normalizeAnthropicEngineeringLearningPolicy,
  runAnthropicEngineeringLearningCycle,
} = require("./lib/anthropic_engineering_learning");

function makeTempWorkspace() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "anthropic-engineering-learning-"));
  fs.mkdirSync(path.join(root, "docs"), { recursive: true });
  fs.mkdirSync(path.join(root, "output"), { recursive: true });
  fs.mkdirSync(path.join(root, "scripts", "config"), { recursive: true });
  return root;
}

function sampleIndexHtml() {
  return `
    <article class="ArticleList-module__article">
      <a class="ArticleList-module__cardLink" href="/engineering/effective-context-engineering-for-ai-agents">
        <div class="ArticleList-module__content">
          <h3 class="headline-4">Effective context engineering for AI agents</h3>
          <p>Strategies for curating and managing context that powers capable agents.</p>
          <div class="ArticleList-module__date">Sep 29, 2025</div>
        </div>
      </a>
    </article>
    <article class="ArticleList-module__article">
      <a class="ArticleList-module__cardLink" href="/engineering/demystifying-evals-for-ai-agents">
        <div class="ArticleList-module__content">
          <h3 class="headline-4">Demystifying evals for AI agents</h3>
          <p>Practical guidance for designing and maintaining evals for agents.</p>
          <div class="ArticleList-module__date">Jan 09, 2026</div>
        </div>
      </a>
    </article>
    <article class="ArticleList-module__article">
      <a class="ArticleList-module__cardLink" href="/engineering/eval-awareness-browsecomp">
        <div class="ArticleList-module__content">
          <h3 class="headline-4">Eval awareness in Claude Opus 4.6’s BrowseComp performance</h3>
          <p>A Claude-specific performance note that should not be promoted into portable principles.</p>
          <div class="ArticleList-module__date">Mar 06, 2026</div>
        </div>
      </a>
    </article>
  `;
}

function sampleContextArticleHtml() {
  return `
    <html>
      <head>
        <title>Effective context engineering for AI agents | Anthropic</title>
        <link rel="canonical" href="https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents" />
      </head>
      <body>
        <main id="main-content">
          <article>
            <div class="Body">
              <h1>Effective context engineering for AI agents</h1>
              <p>Context engineering is about curating the right working state for an agent over time.</p>
              <p>Manage the full context state instead of only polishing the system prompt.</p>
              <h2>Portable practices</h2>
              <li>Treat context like application state that must be curated each turn.</li>
              <li>Store large artifacts outside the prompt and retrieve only what is needed.</li>
            </div>
          </article>
        </main>
      </body>
    </html>
  `;
}

function sampleEvalArticleHtml() {
  return `
    <html>
      <head>
        <title>Demystifying evals for AI agents | Anthropic</title>
        <link rel="canonical" href="https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents" />
      </head>
      <body>
        <main id="main-content">
          <article>
            <div class="Body">
              <h1>Demystifying evals for AI agents</h1>
              <p>Read transcripts and verify graders so failures stay fair and actionable.</p>
              <p>Monitor eval saturation and keep the suite useful for regressions and improvements.</p>
              <h2>Portable practices</h2>
              <li>Check transcripts instead of trusting only aggregate scores.</li>
              <li>Design graders that are resistant to bypasses and hacks.</li>
            </div>
          </article>
        </main>
      </body>
    </html>
  `;
}

function sampleVendorSpecificArticleHtml() {
  return `
    <html>
      <head>
        <title>Eval awareness in Claude Opus 4.6’s BrowseComp performance | Anthropic</title>
        <link rel="canonical" href="https://www.anthropic.com/engineering/eval-awareness-browsecomp" />
      </head>
      <body>
        <main id="main-content">
          <article>
            <div class="Body">
              <h1>Eval awareness in Claude Opus 4.6’s BrowseComp performance</h1>
              <p>Claude Opus 4.6 improved BrowseComp with model-specific eval awareness.</p>
              <p>This article is Claude-specific and should be excluded from portable principle sync.</p>
              <li>Claude Opus 4.6 benchmark behavior.</li>
            </div>
          </article>
        </main>
      </body>
    </html>
  `;
}

async function run() {
  const workspaceRoot = makeTempWorkspace();
  const policyPath = path.join(workspaceRoot, "scripts", "config", "anthropic_engineering_learning_policy.json");
  fs.mkdirSync(path.join(workspaceRoot, "output", "anthropic_engineering_learning_proposals"), { recursive: true });
  fs.writeFileSync(path.join(workspaceRoot, "output", "anthropic_engineering_learning_proposals", "advanced-tool-use.json"), "{\n  \"stale\": true\n}\n", "utf8");
  const policy = normalizeAnthropicEngineeringLearningPolicy({
    schema: "anthropic-engineering-learning-policy.v1",
    source: {
      name: "Anthropic Engineering",
      indexUrl: "https://www.anthropic.com/engineering",
      tier: "secondary",
      userAgent: "codex-harness-anthropic-engineering-learning/1.0",
      allowedHosts: ["www.anthropic.com"],
    },
    cadence: {
      intervalMinutes: 1440,
      startupDelayMs: 1000,
      requestTimeoutMs: 5000,
      maxArticlesPerRun: 6,
      maxGuidanceItemsPerArticle: 4,
    },
    governance: {
      mode: "observe_propose_and_secondary_doc_sync",
      autoPromoteDocs: true,
      autoPromoteDocPath: "docs/ANTHROPIC_ENGINEERING_LEARNINGS.md",
      blockedApplyTargets: ["AGENTS.md"],
      proposalOnlyTargets: ["docs/CONTEXT_MEMORY_POLICY.md", "scripts/config/eval_suite_default.json"],
      frozenFoundationTargets: ["scripts/lib/planning_mode_policy.js"],
    },
    retrieval: {
      maxTopicEntries: 4,
      allowedTopics: ["agents", "context", "evals", "automation", "safety", "codex"],
    },
    filters: {
      requirePortablePrinciples: true,
      portableGuidanceOnly: true,
      excludeTitlePatterns: ["BrowseComp", "Claude Opus"],
      vendorTerms: ["claude", "anthropic", "opus", "browsecomp"],
    },
    runtimeRetrieval: {
      enabled: false,
      shadowMode: false,
      applyToAgents: [],
      applyToTaskFamilies: [],
      topicPriority: ["context", "evals", "agents"],
      maxArticles: 1,
      maxGuidanceItemsPerArticle: 1,
      maxPromptBlockChars: 600,
    },
    presentation: {
      curatedDocTitle: "ANTHROPIC_ENGINEERING_LEARNINGS",
      reportTitle: "ANTHROPIC_ENGINEERING_LEARNING_REPORT",
      introLines: [
        "This file is auto-synced from the Anthropic Engineering secondary learning lane.",
        "Only portable agent-engineering principles are retained here.",
      ],
    },
    artifacts: {
      proposalIdPrefix: "anthropic-engineering",
      articleSchema: "anthropic-engineering-learning-article.v1",
      digestSchema: "anthropic-engineering-learning-digest.v1",
      ledgerSchema: "anthropic-engineering-learning-ledger.v1",
      proposalSchema: "anthropic-engineering-learning-proposal.v1",
      runtimeSchema: "anthropic-engineering-learning-runtime.v1",
    },
    paths: {
      ledgerPath: "output/anthropic_engineering_learning_ledger.json",
      digestPath: "output/anthropic_engineering_learning_digest.json",
      reportPath: "output/anthropic_engineering_learning_report.md",
      proposalDir: "output/anthropic_engineering_learning_proposals",
      curatedDocPath: "docs/ANTHROPIC_ENGINEERING_LEARNINGS.md",
    },
  }, { policyPath });

  const fetchText = async (url) => {
    if (url === "https://www.anthropic.com/engineering") {
      return sampleIndexHtml();
    }
    if (url.includes("effective-context-engineering-for-ai-agents")) {
      return sampleContextArticleHtml();
    }
    if (url.includes("demystifying-evals-for-ai-agents")) {
      return sampleEvalArticleHtml();
    }
    if (url.includes("eval-awareness-browsecomp")) {
      return sampleVendorSpecificArticleHtml();
    }
    throw new Error(`unexpected url ${url}`);
  };

  const first = await runAnthropicEngineeringLearningCycle({
    policy,
    fetchText,
    now: new Date("2026-03-25T00:00:00.000Z"),
  });
  assert.strictEqual(first.report.status, "PASS", "first cycle should pass");
  assert.strictEqual(first.report.summary.trackedArticles, 2, "portable filter should retain only two articles");
  assert.strictEqual(first.report.summary.newArticlesThisRun, 2, "both retained articles should be new");
  assert(first.digest.topics.context && first.digest.topics.context.length >= 1, "context topic should be indexed");
  assert(first.digest.topics.evals && first.digest.topics.evals.length >= 1, "eval topic should be indexed");
  assert(fs.existsSync(path.join(workspaceRoot, "docs", "ANTHROPIC_ENGINEERING_LEARNINGS.md")), "curated doc should be written");
  assert(fs.existsSync(path.join(workspaceRoot, "output", "anthropic_engineering_learning_proposals", "demystifying-evals-for-ai-agents.json")), "proposal artifact should be written");
  assert(!fs.existsSync(path.join(workspaceRoot, "output", "anthropic_engineering_learning_proposals", "eval-awareness-browsecomp.json")), "vendor specific article should be excluded");

  const runtime = buildAnthropicEngineeringRuntimeSnapshot(policy, {
    enabled: true,
    running: false,
    lastStatus: "PASS",
    lastReason: "test",
    nextRunAt: "2026-03-26T00:00:00.000Z",
  });
  assert.strictEqual(runtime.enabled, true, "runtime snapshot should preserve enabled flag");
  assert.strictEqual(runtime.sourceTier, "secondary", "runtime snapshot should mark the lane as secondary");
  assert.strictEqual(runtime.portabilityMode, "portable_principles_only", "runtime snapshot should expose portability mode");
  assert(runtime.curatedDocPath.endsWith("docs/ANTHROPIC_ENGINEERING_LEARNINGS.md"), "runtime snapshot should surface anthropic curated doc path");
  assert(runtime.runtimeRetrieval && runtime.runtimeRetrieval.enabled === false, "secondary lane runtime retrieval should stay disabled");

  console.log("[anthropic-engineering-learning-test] PASS cycle, portability filter, and runtime snapshot");
  console.log("PASS");
}

run().catch((error) => {
  console.error(`[anthropic-engineering-learning-test] FAIL ${error instanceof Error ? error.message : String(error)}`);
  console.log("FAIL");
  process.exitCode = 1;
});
