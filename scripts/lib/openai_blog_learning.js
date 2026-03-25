"use strict";

const fs = require("fs");
const http = require("http");
const https = require("https");
const path = require("path");
const crypto = require("crypto");

const workspaceRootDefault = path.resolve(__dirname, "..", "..");
const defaultOpenAIBlogLearningPolicyPath = path.join(
  workspaceRootDefault,
  "scripts",
  "config",
  "openai_blog_learning_policy.json"
);

function safeString(value, maxLength = 0) {
  const text = typeof value === "string" ? value.trim() : value == null ? "" : String(value).trim();
  if (!text) {
    return "";
  }
  if (Number.isFinite(Number(maxLength)) && Number(maxLength) > 0) {
    return text.slice(0, Math.max(1, Math.trunc(Number(maxLength))));
  }
  return text;
}

function ensureDir(targetPath) {
  fs.mkdirSync(targetPath, { recursive: true });
}

function readJsonIfExists(filePath) {
  try {
    if (!fs.existsSync(filePath)) {
      return null;
    }
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return null;
  }
}

function writeJson(filePath, value) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function writeText(filePath, value) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, value, "utf8");
}

function repoRelative(workspaceRoot, targetPath) {
  return path.relative(workspaceRoot, targetPath).replace(/\\/g, "/");
}

function sha256Hex(value) {
  return crypto.createHash("sha256").update(String(value || ""), "utf8").digest("hex");
}

function decodeHtmlEntities(value) {
  const text = String(value == null ? "" : value);
  return text
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, "\"")
    .replace(/&#34;/g, "\"")
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => {
      try {
        return String.fromCodePoint(parseInt(hex, 16));
      } catch {
        return "";
      }
    })
    .replace(/&#([0-9]+);/g, (_, numberValue) => {
      try {
        return String.fromCodePoint(parseInt(numberValue, 10));
      } catch {
        return "";
      }
    });
}

function stripHtml(value) {
  return decodeHtmlEntities(
    String(value == null ? "" : value)
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/p>/gi, "\n")
      .replace(/<\/li>/gi, "\n")
      .replace(/<\/h[1-6]>/gi, "\n")
      .replace(/<[^>]+>/g, " ")
  ).replace(/\s+/g, " ").trim();
}

function normalizeUrl(rawUrl) {
  const normalized = safeString(rawUrl, 600);
  if (!normalized) {
    return "";
  }
  try {
    const url = new URL(normalized);
    url.hash = "";
    if (url.pathname !== "/") {
      url.pathname = url.pathname.replace(/\/+$/, "");
    }
    return url.toString();
  } catch {
    return "";
  }
}

function joinUrl(baseUrl, relativePath) {
  try {
    return normalizeUrl(new URL(relativePath, baseUrl).toString());
  } catch {
    return "";
  }
}

function extractMetaContent(html, attributeName, attributeValue) {
  const expression = new RegExp(
    `<meta[^>]+${attributeName}=["']${attributeValue.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}["'][^>]+content=["']([^"']+)["'][^>]*>`,
    "i"
  );
  const match = expression.exec(String(html || ""));
  return match ? decodeHtmlEntities(match[1]).trim() : "";
}

function extractTitle(html) {
  const match = /<title>([\s\S]*?)<\/title>/i.exec(String(html || ""));
  return match ? stripHtml(match[1]) : "";
}

function collectTagTexts(html, tagName, limit = 8) {
  const results = [];
  const expression = new RegExp(`<${tagName}[^>]*>([\\s\\S]*?)<\\/${tagName}>`, "gi");
  let match = expression.exec(String(html || ""));
  while (match && results.length < limit) {
    const text = stripHtml(match[1]);
    if (text) {
      results.push(text);
    }
    match = expression.exec(String(html || ""));
  }
  return results;
}

function collapseSentence(value) {
  return safeString(String(value == null ? "" : value).replace(/\s+/g, " "), 320);
}

function sentenceCandidatesFromParagraphs(paragraphs) {
  const candidates = [];
  for (const paragraph of paragraphs) {
    const sentences = String(paragraph || "").split(/(?<=[.!?])\s+/);
    for (const sentence of sentences) {
      const text = collapseSentence(sentence);
      if (!text) {
        continue;
      }
      if (/(should|must|start with|define|provide|reuse|verify|checkpoint|runbook|acceptance|eval|test|guide|prompt|design|skill|workflow|agent)/i.test(text)) {
        candidates.push(text);
      }
    }
  }
  return candidates;
}

function dedupeTexts(values, limit = 6) {
  const seen = new Set();
  const results = [];
  for (const value of values) {
    const text = collapseSentence(value);
    const key = text.toLowerCase();
    if (!text || seen.has(key)) {
      continue;
    }
    seen.add(key);
    results.push(text);
    if (results.length >= limit) {
      break;
    }
  }
  return results;
}

function parseIndexCards(indexHtml, sourceUrl) {
  const cards = [];
  const expression = /<a class="resource-item[\s\S]*?href="([^"]+)"[\s\S]*?<\/a>/gi;
  let match = expression.exec(String(indexHtml || ""));
  while (match) {
    const href = safeString(match[1], 400);
    const cardHtml = match[0];
    if (/^\/blog\/[^"/?#]+$/i.test(href)) {
      const url = joinUrl(sourceUrl, href);
      const titleFromAltMatch = /<img[^>]+alt="([^"]+)"/i.exec(cardHtml);
      const titleFromTextMatch = /line-clamp-2">([\s\S]*?)<\/div>/i.exec(cardHtml);
      const descriptionMatch = /<p[^>]*>([\s\S]*?)<\/p>/i.exec(cardHtml);
      const dateMatch = /text-secondary[^>]*>([A-Z][a-z]{2}\s+\d{1,2})<\/div>/i.exec(cardHtml);
      const topicMatches = Array.from(cardHtml.matchAll(/text-sm text-secondary[^>]*>([\s\S]*?)<\/div>/gi));
      const topicLabel = topicMatches.length ? stripHtml(topicMatches[topicMatches.length - 1][1]) : "";
      const title = stripHtml((titleFromAltMatch && titleFromAltMatch[1]) || (titleFromTextMatch && titleFromTextMatch[1]) || "");
      if (url && title) {
        cards.push({
          articleId: safeString(url.split("/").pop(), 120),
          url,
          title,
          description: stripHtml(descriptionMatch && descriptionMatch[1] ? descriptionMatch[1] : ""),
          indexDateLabel: safeString(dateMatch && dateMatch[1] ? dateMatch[1] : "", 40),
          topicLabel: safeString(topicLabel, 80),
        });
      }
    }
    match = expression.exec(String(indexHtml || ""));
  }
  const deduped = [];
  const seen = new Set();
  for (const card of cards) {
    if (!card.url || seen.has(card.url)) {
      continue;
    }
    seen.add(card.url);
    deduped.push(card);
  }
  return deduped;
}

function classifyTopics({ title = "", description = "", topicLabel = "", headings = [], listItems = [], paragraphs = [] } = {}) {
  const tags = new Set();
  const seed = [title, description, topicLabel, headings.join(" "), listItems.join(" "), paragraphs.slice(0, 6).join(" ")].join(" ").toLowerCase();
  if (safeString(topicLabel)) {
    tags.add(safeString(topicLabel).toLowerCase());
  }
  if (/(frontend|design|ui|ux|figma|css|typography|hero|brand)/i.test(seed)) tags.add("frontend");
  if (/(codex|long horizon|oss maintenance|workflow)/i.test(seed)) tags.add("codex");
  if (/\bskills?\b/i.test(seed)) tags.add("skills");
  if (/(eval|evaluate|grading|test|regression|verification|verify)/i.test(seed)) tags.add("evals");
  if (/(agents?|orchestration|subagent|worker)/i.test(seed)) tags.add("agents");
  if (/(context|compaction|prompt|memory|retrieval)/i.test(seed)) tags.add("context");
  if (/(automation|github action|background|runbook|checkpoint)/i.test(seed)) tags.add("automation");
  if (/(safety|guardrail|approval|risk)/i.test(seed)) tags.add("safety");
  return Array.from(tags).filter(Boolean).sort();
}

function deriveRelevance(topicTags) {
  const tags = Array.isArray(topicTags) ? topicTags : [];
  if (tags.some((entry) => ["frontend", "codex", "skills", "evals", "agents", "context", "automation"].includes(entry))) {
    return "high";
  }
  if (tags.some((entry) => ["api", "general", "safety"].includes(entry))) {
    return "medium";
  }
  return "low";
}

function inferSuggestedActions(topicTags) {
  const tags = Array.isArray(topicTags) ? topicTags : [];
  const actions = [
    {
      id: "learning-doc-sync",
      target: "docs/OPENAI_DEVELOPER_LEARNINGS.md",
      rationale: "Sync official learnings into a retrieval-first, non-constitutional document.",
    },
  ];
  if (tags.some((entry) => ["context", "automation", "codex", "skills"].includes(entry))) {
    actions.push({
      id: "context-memory-note",
      target: "docs/CONTEXT_MEMORY_POLICY.md",
      rationale: "Potential retrieval and compaction guidance; requires governed review before changing runtime behavior.",
    });
  }
  if (tags.includes("frontend")) {
    actions.push({
      id: "frontend-quality-note",
      target: "skills/web-designer-master/references/quality-gate.md",
      rationale: "Potential frontend quality guidance; keep proposal-only until independently validated.",
    });
  }
  if (tags.includes("evals")) {
    actions.push({
      id: "eval-coverage-proposal",
      target: "scripts/config/eval_suite_default.json",
      rationale: "Potential eval coverage change; requires explicit validation and proposal review.",
    });
  }
  if (tags.some((entry) => ["agents", "codex"].includes(entry))) {
    actions.push({
      id: "operator-rules-note",
      target: "docs/AGENT_OPERATING_RULES.md",
      rationale: "Potential agent workflow guidance; keep proposal-only to avoid silent runtime drift.",
    });
  }
  if (tags.includes("skills")) {
    actions.push({
      id: "skill-matrix-note",
      target: "docs/AGENT_SKILL_MATRIX.md",
      rationale: "Potential specialist coverage update; keep proposal-only until the need is validated.",
    });
  }
  return actions;
}

function governSuggestedActions(actions, policy) {
  const governance = policy && policy.governance ? policy.governance : {};
  const autoDocPath = safeString(governance.autoPromoteDocPath, 260);
  const blockedApplyTargets = new Set(Array.isArray(governance.blockedApplyTargets) ? governance.blockedApplyTargets : []);
  const proposalOnlyTargets = new Set(Array.isArray(governance.proposalOnlyTargets) ? governance.proposalOnlyTargets : []);
  const frozenTargets = new Set(Array.isArray(governance.frozenFoundationTargets) ? governance.frozenFoundationTargets : []);
  return actions.map((action) => {
    const target = safeString(action && action.target, 260);
    const governed = {
      id: safeString(action && action.id, 120),
      target,
      rationale: safeString(action && action.rationale, 320),
      status: "proposal_only",
      riskFlags: [],
    };
    if (!target) {
      governed.status = "ignored";
      governed.riskFlags.push("missing_target");
      return governed;
    }
    if (blockedApplyTargets.has(target)) {
      governed.status = "blocked";
      governed.riskFlags.push("constitutional_boundary");
      return governed;
    }
    if (target === autoDocPath && governance.autoPromoteDocs) {
      governed.status = "auto_doc_sync";
      governed.riskFlags.push("doc_only");
      return governed;
    }
    if (frozenTargets.has(target)) {
      governed.status = "proposal_only";
      governed.riskFlags.push("phase_freeze_bug_fix_only");
      return governed;
    }
    if (proposalOnlyTargets.has(target)) {
      governed.status = "proposal_only";
      governed.riskFlags.push("governed_promotion_required");
      return governed;
    }
    governed.riskFlags.push("manual_review");
    return governed;
  });
}

function buildArticleProposal(article, policy, nowIso) {
  const governedActions = governSuggestedActions(inferSuggestedActions(article.topicTags), policy);
  return {
    schema: "openai-blog-learning-proposal.v1",
    proposalId: `openai-blog-${article.articleId}`,
    createdAt: nowIso,
    articleId: article.articleId,
    title: article.title,
    sourceUrl: article.url,
    relevance: article.relevance,
    summary: article.summary,
    guidance: article.guidance,
    topicTags: article.topicTags,
    actions: governedActions,
  };
}

function extractArticleInsights(articleHtml, maxGuidanceItems) {
  const mainMatch = /<article id="mainContent"[^>]*>([\s\S]*?)<\/article>/i.exec(String(articleHtml || ""));
  const mainHtml = mainMatch ? mainMatch[1] : "";
  const headings = dedupeTexts([
    ...collectTagTexts(mainHtml, "h2", 8),
    ...collectTagTexts(mainHtml, "h3", 8),
  ], 8);
  const paragraphs = dedupeTexts(collectTagTexts(mainHtml, "p", 16), 16);
  const listItems = dedupeTexts(collectTagTexts(mainHtml, "li", 18), 18);
  const guidance = dedupeTexts(
    [
      ...listItems,
      ...sentenceCandidatesFromParagraphs(paragraphs),
      ...headings.map((entry) => `Section focus: ${entry}`),
      ...paragraphs.slice(0, 4),
    ],
    Math.max(1, Math.trunc(Number(maxGuidanceItems) || 6))
  );
  return {
    title: extractMetaContent(articleHtml, "property", "og:title") || extractMetaContent(articleHtml, "name", "title") || extractTitle(articleHtml),
    description: extractMetaContent(articleHtml, "name", "description") || extractMetaContent(articleHtml, "property", "og:description"),
    canonicalUrl: normalizeUrl(
      (/rel="canonical" href="([^"]+)"/i.exec(String(articleHtml || "")) || [])[1] || ""
    ),
    headings,
    paragraphs,
    listItems,
    guidance,
  };
}

function loadOpenAIBlogLearningPolicy(policyPath = defaultOpenAIBlogLearningPolicyPath) {
  const parsed = readJsonIfExists(policyPath);
  return normalizeOpenAIBlogLearningPolicy(parsed, { policyPath });
}

function normalizeOpenAIBlogLearningPolicy(policy, { policyPath = defaultOpenAIBlogLearningPolicyPath } = {}) {
  const source = policy && typeof policy === "object" ? policy : {};
  const workspaceRoot = path.resolve(path.dirname(policyPath), "..", "..");
  const normalized = {
    schema: safeString(source.schema, 120) || "openai-blog-learning-policy.v1",
    policyPath,
    workspaceRoot,
    source: {
      name: safeString(source && source.source && source.source.name, 120) || "OpenAI Developers Blog",
      indexUrl: normalizeUrl(source && source.source && source.source.indexUrl) || "https://developers.openai.com/blog",
      allowedHosts: Array.isArray(source && source.source && source.source.allowedHosts)
        ? source.source.allowedHosts.map((entry) => safeString(entry, 120)).filter(Boolean)
        : ["developers.openai.com"],
    },
    cadence: {
      intervalMinutes: Math.max(15, Math.min(1440, Math.trunc(Number(source && source.cadence && source.cadence.intervalMinutes) || 1440))),
      startupDelayMs: Math.max(0, Math.min(600000, Math.trunc(Number(source && source.cadence && source.cadence.startupDelayMs) || 5000))),
      requestTimeoutMs: Math.max(2000, Math.min(120000, Math.trunc(Number(source && source.cadence && source.cadence.requestTimeoutMs) || 15000))),
      maxArticlesPerRun: Math.max(1, Math.min(20, Math.trunc(Number(source && source.cadence && source.cadence.maxArticlesPerRun) || 6))),
      maxGuidanceItemsPerArticle: Math.max(2, Math.min(12, Math.trunc(Number(source && source.cadence && source.cadence.maxGuidanceItemsPerArticle) || 6))),
    },
    governance: {
      mode: safeString(source && source.governance && source.governance.mode, 80) || "observe_propose_and_doc_sync",
      autoPromoteDocs: Boolean(source && source.governance && source.governance.autoPromoteDocs),
      autoPromoteDocPath: safeString(source && source.governance && source.governance.autoPromoteDocPath, 260) || "docs/OPENAI_DEVELOPER_LEARNINGS.md",
      blockedApplyTargets: Array.isArray(source && source.governance && source.governance.blockedApplyTargets)
        ? source.governance.blockedApplyTargets.map((entry) => safeString(entry, 260)).filter(Boolean)
        : ["AGENTS.md"],
      proposalOnlyTargets: Array.isArray(source && source.governance && source.governance.proposalOnlyTargets)
        ? source.governance.proposalOnlyTargets.map((entry) => safeString(entry, 260)).filter(Boolean)
        : [],
      frozenFoundationTargets: Array.isArray(source && source.governance && source.governance.frozenFoundationTargets)
        ? source.governance.frozenFoundationTargets.map((entry) => safeString(entry, 260)).filter(Boolean)
        : [],
    },
    retrieval: {
      maxTopicEntries: Math.max(1, Math.min(20, Math.trunc(Number(source && source.retrieval && source.retrieval.maxTopicEntries) || 6))),
      allowedTopics: Array.isArray(source && source.retrieval && source.retrieval.allowedTopics)
        ? source.retrieval.allowedTopics.map((entry) => safeString(entry, 80).toLowerCase()).filter(Boolean)
        : [],
    },
    runtimeRetrieval: {
      enabled: Boolean(source && source.runtimeRetrieval && source.runtimeRetrieval.enabled),
      shadowMode: Boolean(source && source.runtimeRetrieval && source.runtimeRetrieval.shadowMode),
      applyToAgents: Array.isArray(source && source.runtimeRetrieval && source.runtimeRetrieval.applyToAgents)
        ? source.runtimeRetrieval.applyToAgents.map((entry) => safeString(entry, 80)).filter(Boolean)
        : ["default", "frontend_worker"],
      applyToTaskFamilies: Array.isArray(source && source.runtimeRetrieval && source.runtimeRetrieval.applyToTaskFamilies)
        ? source.runtimeRetrieval.applyToTaskFamilies.map((entry) => safeString(entry, 80).toLowerCase()).filter(Boolean)
        : ["web_creative"],
      topicPriority: Array.isArray(source && source.runtimeRetrieval && source.runtimeRetrieval.topicPriority)
        ? source.runtimeRetrieval.topicPriority.map((entry) => safeString(entry, 80).toLowerCase()).filter(Boolean)
        : ["frontend", "evals", "context", "codex", "skills", "automation", "agents", "safety"],
      maxArticles: Math.max(1, Math.min(6, Math.trunc(Number(source && source.runtimeRetrieval && source.runtimeRetrieval.maxArticles) || 2))),
      maxGuidanceItemsPerArticle: Math.max(1, Math.min(4, Math.trunc(Number(source && source.runtimeRetrieval && source.runtimeRetrieval.maxGuidanceItemsPerArticle) || 3))),
      maxPromptBlockChars: Math.max(300, Math.min(4000, Math.trunc(Number(source && source.runtimeRetrieval && source.runtimeRetrieval.maxPromptBlockChars) || 1800))),
    },
  };
  normalized.paths = {
    ledgerPath: path.join(workspaceRoot, "output", "openai_blog_learning_ledger.json"),
    digestPath: path.join(workspaceRoot, "output", "openai_blog_learning_digest.json"),
    reportPath: path.join(workspaceRoot, "output", "openai_blog_learning_report.md"),
    proposalDir: path.join(workspaceRoot, "output", "openai_blog_learning_proposals"),
    curatedDocPath: path.join(workspaceRoot, normalized.governance.autoPromoteDocPath),
  };
  return normalized;
}

function httpFetchText(rawUrl, { timeoutMs = 15000, allowedHosts = [] } = {}) {
  const normalizedUrl = normalizeUrl(rawUrl);
  if (!normalizedUrl) {
    return Promise.reject(new Error("invalid url"));
  }
  const url = new URL(normalizedUrl);
  if (Array.isArray(allowedHosts) && allowedHosts.length && !allowedHosts.includes(url.hostname)) {
    return Promise.reject(new Error(`host not allowed: ${url.hostname}`));
  }
  const transport = url.protocol === "http:" ? http : https;
  return new Promise((resolve, reject) => {
    const request = transport.request(
      normalizedUrl,
      {
        method: "GET",
        headers: {
          "User-Agent": "codex-harness-openai-blog-learning/1.0",
          "Accept": "text/html,application/xhtml+xml",
        },
      },
      (response) => {
        const statusCode = Number(response.statusCode || 0);
        if (statusCode >= 300 && statusCode < 400 && response.headers && response.headers.location) {
          const redirectedUrl = joinUrl(normalizedUrl, response.headers.location);
          response.resume();
          httpFetchText(redirectedUrl, { timeoutMs, allowedHosts }).then(resolve).catch(reject);
          return;
        }
        if (statusCode !== 200) {
          response.resume();
          reject(new Error(`unexpected status ${statusCode} for ${normalizedUrl}`));
          return;
        }
        response.setEncoding("utf8");
        let body = "";
        response.on("data", (chunk) => {
          body += chunk;
        });
        response.on("end", () => {
          resolve(body);
        });
      }
    );
    request.setTimeout(timeoutMs, () => {
      request.destroy(new Error(`timeout after ${timeoutMs}ms for ${normalizedUrl}`));
    });
    request.on("error", reject);
    request.end();
  });
}

function buildCuratedDoc(digest, policy) {
  const topics = digest && digest.topics && typeof digest.topics === "object" ? digest.topics : {};
  const lines = [
    "# OPENAI_DEVELOPER_LEARNINGS",
    "",
    `Updated: ${safeString(digest && digest.generatedAt, 40) || "-"}`,
    "",
    "This file is auto-synced from the official OpenAI Developers blog learning lane.",
    "It is not constitutional guidance and does not silently override `AGENTS.md` or frozen Step 1/2 behavior.",
    "",
    "## How to use",
    "",
    "- Treat these notes as retrieval-first working memory, not as automatic runtime policy.",
    `- Source is locked to ${safeString(policy && policy.source && policy.source.indexUrl, 240)} and official hosts only.`,
    "- High-risk targets stay proposal-only until separately reviewed and validated.",
    "- Requirement-Driven Foundation V1 remains frozen; external learnings cannot silently expand Step 1/2.",
    "- Runtime retrieval may inject a small advisory block only for targeted runtime paths such as `default` / `frontend_worker` web tasks.",
    "",
  ];
  const orderedTopics = Object.keys(topics).sort();
  if (!orderedTopics.length) {
    lines.push("## Current State", "", "No promoted learnings are available yet.");
    return `${lines.join("\n")}\n`;
  }
  for (const topic of orderedTopics) {
    lines.push(`## Topic: ${topic}`, "");
    for (const entry of topics[topic]) {
      lines.push(`### ${safeString(entry.title, 200)}`);
      lines.push("");
      lines.push(`- Source: ${safeString(entry.url, 300)}`);
      lines.push(`- Relevance: ${safeString(entry.relevance, 40)}`);
      if (safeString(entry.indexDateLabel)) {
        lines.push(`- Blog card date: ${safeString(entry.indexDateLabel, 40)}`);
      }
      if (safeString(entry.summary)) {
        lines.push(`- Summary: ${safeString(entry.summary, 320)}`);
      }
      if (Array.isArray(entry.guidance) && entry.guidance.length) {
        lines.push("- Guidance:");
        for (const item of entry.guidance.slice(0, 4)) {
          lines.push(`  - ${safeString(item, 320)}`);
        }
      }
      lines.push("");
    }
  }
  return `${lines.join("\n")}\n`;
}

function buildMarkdownReport(report) {
  const lines = [
    "# OPENAI_BLOG_LEARNING_REPORT",
    "",
    `- status: ${safeString(report && report.status, 20) || "UNKNOWN"}`,
    `- generatedAt: ${safeString(report && report.generatedAt, 40) || "-"}`,
    `- trackedArticles: ${Number(report && report.summary && report.summary.trackedArticles) || 0}`,
    `- newArticlesThisRun: ${Number(report && report.summary && report.summary.newArticlesThisRun) || 0}`,
    `- pendingProposals: ${Number(report && report.summary && report.summary.pendingProposals) || 0}`,
    `- promotedDocUpdates: ${Number(report && report.summary && report.summary.promotedDocUpdates) || 0}`,
    `- ledgerPath: ${safeString(report && report.paths && report.paths.ledgerPath, 240) || "-"}`,
    `- digestPath: ${safeString(report && report.paths && report.paths.digestPath, 240) || "-"}`,
    `- reportPath: ${safeString(report && report.paths && report.paths.reportPath, 240) || "-"}`,
    `- curatedDocPath: ${safeString(report && report.paths && report.paths.curatedDocPath, 240) || "-"}`,
    "",
    "## Recent Articles",
    "",
  ];
  const recent = Array.isArray(report && report.recentArticles) ? report.recentArticles : [];
  if (!recent.length) {
    lines.push("No tracked articles.");
  } else {
    for (const article of recent) {
      lines.push(`- ${safeString(article.title, 200)} | ${safeString(article.relevance, 20)} | ${safeString(article.url, 260)}`);
    }
  }
  lines.push("", "## Pending Proposals", "");
  const pending = Array.isArray(report && report.pendingProposals) ? report.pendingProposals : [];
  if (!pending.length) {
    lines.push("No pending proposals.");
  } else {
    for (const proposal of pending) {
      lines.push(`- ${safeString(proposal.title, 200)} -> ${safeString(proposal.target, 240)} (${safeString(proposal.status, 40)})`);
    }
  }
  return `${lines.join("\n")}\n`;
}

function selectTopicEntries(articles, policy) {
  const topics = {};
  const allowedTopics = new Set(Array.isArray(policy && policy.retrieval && policy.retrieval.allowedTopics) ? policy.retrieval.allowedTopics : []);
  const maxTopicEntries = Math.max(1, Math.trunc(Number(policy && policy.retrieval && policy.retrieval.maxTopicEntries) || 6));
  for (const article of articles) {
    for (const topic of Array.isArray(article.topicTags) ? article.topicTags : []) {
      if (allowedTopics.size && !allowedTopics.has(topic)) {
        continue;
      }
      if (!topics[topic]) {
        topics[topic] = [];
      }
      if (topics[topic].length >= maxTopicEntries) {
        continue;
      }
      topics[topic].push({
        articleId: article.articleId,
        title: article.title,
        url: article.url,
        relevance: article.relevance,
        indexDateLabel: article.indexDateLabel,
        summary: article.summary,
        guidance: article.guidance.slice(0, 4),
      });
    }
  }
  return topics;
}

function uniqueStringList(values, limit = 8) {
  const seen = new Set();
  const results = [];
  for (const value of Array.isArray(values) ? values : []) {
    const text = safeString(value, 80);
    const key = text.toLowerCase();
    if (!text || seen.has(key)) {
      continue;
    }
    seen.add(key);
    results.push(text);
    if (results.length >= limit) {
      break;
    }
  }
  return results;
}

function inferRuntimeRetrievalTopics({ prompt = "", agentName = "", planningContext = null, policy } = {}) {
  const promptText = safeString(prompt, 12000);
  const lower = promptText.toLowerCase();
  const context = planningContext && typeof planningContext === "object" ? planningContext : {};
  const selection = context.selection && typeof context.selection === "object" ? context.selection : {};
  const requirement = context.requirementContract && typeof context.requirementContract === "object" ? context.requirementContract : {};
  const dispatchPlan = context.dispatchPlan && typeof context.dispatchPlan === "object" ? context.dispatchPlan : {};
  const dispatches = Array.isArray(dispatchPlan.dispatches) ? dispatchPlan.dispatches : [];
  const specialistOwners = uniqueStringList(
    [
      ...((Array.isArray(selection.signals && selection.signals.specialistOwners) ? selection.signals.specialistOwners : [])),
      ...dispatches.map((entry) => safeString(entry && entry.ownerAgent, 80)),
      safeString(agentName, 80),
    ],
    12
  ).map((entry) => entry.toLowerCase());
  const taskFamily = safeString(selection.taskFamily || requirement.taskFamily, 80).toLowerCase();
  const tags = [];
  const addTag = (tag) => {
    const normalized = safeString(tag, 80).toLowerCase();
    if (!normalized || tags.includes(normalized)) {
      return;
    }
    const allowedTopics = new Set(Array.isArray(policy && policy.retrieval && policy.retrieval.allowedTopics) ? policy.retrieval.allowedTopics : []);
    if (allowedTopics.size && !allowedTopics.has(normalized)) {
      return;
    }
    tags.push(normalized);
  };

  const isFrontendTask =
    taskFamily === "web_creative" ||
    specialistOwners.includes("frontend_worker") ||
    /(?:frontend|landing page|hero section|website|web app|ui\b|ux\b|html|css|react|component|layout|design system|figma|browser|tailwind)/i.test(lower);

  if (isFrontendTask) {
    addTag("frontend");
  }
  if (
    isFrontendTask ||
    /(?:benchmark|verify|verification|acceptance|tester|review|screenshot|visual diff|regression|eval|test plan|compare)/i.test(lower) ||
    dispatchPlan.reviewerRequired ||
    dispatchPlan.testerRequired
  ) {
    addTag("evals");
  }
  if (
    isFrontendTask ||
    /(?:plan|repair|checkpoint|runbook|multi-step|long horizon|iterate|course correction|workflow)/i.test(lower) ||
    /ASSURANCE|PLANNING/i.test(`${safeString(selection.selectedPlanningDepth, 80)} ${safeString(selection.selectedAssuranceDepth, 80)}`)
  ) {
    addTag("codex");
  }
  if (
    /(?:context|memory|retrieval|history|compaction|prompt budget)/i.test(lower) ||
    (isFrontendTask && promptText.length >= 600)
  ) {
    addTag("context");
  }
  if (/(?:skill|figma|stitch|tooling|workflow asset)/i.test(lower)) {
    addTag("skills");
  }
  if (/(?:automation|background loop|github action|scheduled|cron)/i.test(lower)) {
    addTag("automation");
  }
  if (/(?:guardrail|approval|risk|safety)/i.test(lower)) {
    addTag("safety");
  }
  return {
    taskFamily: taskFamily || "deterministic_code",
    specialistOwners,
    topics: tags,
  };
}

function buildRuntimeLearningSelection({ prompt = "", agentName = "", planningContext = null, policy } = {}) {
  const normalizedPolicy = normalizeOpenAIBlogLearningPolicy(policy, { policyPath: policy && policy.policyPath ? policy.policyPath : defaultOpenAIBlogLearningPolicyPath });
  const runtimeRetrieval = normalizedPolicy.runtimeRetrieval || {};
  const digest = readJsonIfExists(normalizedPolicy.paths.digestPath);
  if (!runtimeRetrieval.enabled) {
    return {
      status: "disabled",
      reason: "runtime_retrieval_disabled",
      taskFamily: "",
      matchedTopics: [],
      articles: [],
    };
  }
  if (!digest || !digest.topics || typeof digest.topics !== "object") {
    return {
      status: "skipped",
      reason: "digest_missing",
      taskFamily: "",
      matchedTopics: [],
      articles: [],
    };
  }
  const inferred = inferRuntimeRetrievalTopics({ prompt, agentName, planningContext, policy: normalizedPolicy });
  const targetAgents = new Set(Array.isArray(runtimeRetrieval.applyToAgents) ? runtimeRetrieval.applyToAgents.map((entry) => safeString(entry, 80)) : []);
  const targetFamilies = new Set(Array.isArray(runtimeRetrieval.applyToTaskFamilies) ? runtimeRetrieval.applyToTaskFamilies.map((entry) => safeString(entry, 80).toLowerCase()) : []);
  const normalizedAgent = safeString(agentName, 80);
  if (targetAgents.size && normalizedAgent && !targetAgents.has(normalizedAgent)) {
    return {
      status: "skipped",
      reason: "agent_not_targeted",
      taskFamily: inferred.taskFamily,
      matchedTopics: inferred.topics,
      articles: [],
    };
  }
  if (targetFamilies.size && inferred.taskFamily && !targetFamilies.has(inferred.taskFamily)) {
    return {
      status: "skipped",
      reason: "task_family_not_targeted",
      taskFamily: inferred.taskFamily,
      matchedTopics: inferred.topics,
      articles: [],
    };
  }
  if (!inferred.topics.length) {
    return {
      status: "skipped",
      reason: "no_topic_match",
      taskFamily: inferred.taskFamily,
      matchedTopics: [],
      articles: [],
    };
  }

  const digestTopics = digest.topics;
  const priority = Array.isArray(runtimeRetrieval.topicPriority) ? runtimeRetrieval.topicPriority : [];
  const priorityWeight = new Map(priority.map((entry, index) => [entry, Math.max(1, priority.length - index)]));
  const articleById = new Map();
  inferred.topics.forEach((topic) => {
    const entries = Array.isArray(digestTopics[topic]) ? digestTopics[topic] : [];
    const topicWeight = priorityWeight.get(topic) || 1;
    entries.forEach((entry, index) => {
      const articleId = safeString(entry && entry.articleId, 120);
      if (!articleId) {
        return;
      }
      const current = articleById.get(articleId) || {
        articleId,
        title: safeString(entry && entry.title, 200),
        url: safeString(entry && entry.url, 320),
        relevance: safeString(entry && entry.relevance, 20) || "medium",
        indexDateLabel: safeString(entry && entry.indexDateLabel, 40),
        summary: safeString(entry && entry.summary, 320),
        guidance: Array.isArray(entry && entry.guidance) ? entry.guidance.map((item) => safeString(item, 240)).filter(Boolean) : [],
        matchedTopics: [],
        score: 0,
      };
      if (!current.matchedTopics.includes(topic)) {
        current.matchedTopics.push(topic);
      }
      current.score += topicWeight * 10 - index;
      articleById.set(articleId, current);
    });
  });
  const articles = Array.from(articleById.values())
    .sort((left, right) => right.score - left.score || left.title.localeCompare(right.title))
    .slice(0, runtimeRetrieval.maxArticles)
    .map((entry) => ({
      articleId: entry.articleId,
      title: entry.title,
      url: entry.url,
      relevance: entry.relevance,
      indexDateLabel: entry.indexDateLabel,
      summary: entry.summary,
      matchedTopics: entry.matchedTopics.slice(0, 4),
      guidance: entry.guidance.slice(0, runtimeRetrieval.maxGuidanceItemsPerArticle),
    }));
  return {
    status: articles.length ? "ready" : "skipped",
    reason: articles.length ? "matched_official_articles" : "no_article_match",
    taskFamily: inferred.taskFamily,
    matchedTopics: inferred.topics,
    articles,
  };
}

function buildRuntimePromptInjection({ prompt = "", agentName = "", planningContext = null, policy } = {}) {
  const normalizedPrompt = safeString(prompt, 20000);
  const normalizedPolicy = normalizeOpenAIBlogLearningPolicy(policy, { policyPath: policy && policy.policyPath ? policy.policyPath : defaultOpenAIBlogLearningPolicyPath });
  const runtimeRetrieval = normalizedPolicy.runtimeRetrieval || {};
  const selection = buildRuntimeLearningSelection({
    prompt: normalizedPrompt,
    agentName,
    planningContext,
    policy: normalizedPolicy,
  });
  const base = {
    schema: "openai-blog-runtime-retrieval.v1",
    status: selection.status,
    reason: selection.reason,
    applied: false,
    shadowMode: Boolean(runtimeRetrieval.shadowMode),
    prompt: normalizedPrompt,
    promptBlock: "",
    promptBlockChars: 0,
    taskFamily: selection.taskFamily || "",
    matchedTopics: selection.matchedTopics || [],
    articles: selection.articles || [],
  };
  if (selection.status !== "ready") {
    return base;
  }
  const lines = [
    "",
    "[HARNESS_EXTERNAL_LEARNING_CONTEXT_V1]",
    "Advisory only. Use these official learnings only when they directly improve the current implementation.",
    "Do not override the locked requirement contract, approval boundaries, or frozen Step 1/2 behavior.",
    `Matched topics: ${(selection.matchedTopics || []).join(", ")}`,
    "Official learnings:",
  ];
  selection.articles.forEach((article, index) => {
    lines.push(`${index + 1}. ${safeString(article.title, 180)}`);
    if (safeString(article.summary, 220)) {
      lines.push(`   Summary: ${safeString(article.summary, 220)}`);
    }
    article.guidance.forEach((item) => {
      lines.push(`   - ${safeString(item, 220)}`);
    });
  });
  lines.push("[/HARNESS_EXTERNAL_LEARNING_CONTEXT_V1]");
  let promptBlock = lines.join("\n");
  if (promptBlock.length > runtimeRetrieval.maxPromptBlockChars) {
    promptBlock = safeString(promptBlock, runtimeRetrieval.maxPromptBlockChars - 24);
    promptBlock = `${promptBlock}\n[/HARNESS_EXTERNAL_LEARNING_CONTEXT_V1]`;
  }
  const applied = !runtimeRetrieval.shadowMode;
  return {
    ...base,
    status: applied ? "applied" : "shadow",
    reason: applied ? "guarded_runtime_injection" : "shadow_runtime_injection",
    applied,
    promptBlock,
    promptBlockChars: promptBlock.length,
    prompt: applied ? `${normalizedPrompt}${promptBlock}` : normalizedPrompt,
  };
}

function buildRuntimeSnapshotFromArtifacts(policy, runtimeState = {}) {
  const ledger = readJsonIfExists(policy.paths.ledgerPath) || {};
  const digest = readJsonIfExists(policy.paths.digestPath) || {};
  const summary = ledger && ledger.summary && typeof ledger.summary === "object" ? ledger.summary : {};
  const articles = Array.isArray(ledger && ledger.articles) ? ledger.articles : [];
  const recentArticles = articles.slice(0, 4).map((article) => ({
    articleId: safeString(article.articleId, 120),
    title: safeString(article.title, 200),
    url: safeString(article.url, 320),
    relevance: safeString(article.relevance, 20),
    indexDateLabel: safeString(article.indexDateLabel, 40),
    topicTags: Array.isArray(article.topicTags) ? article.topicTags.slice(0, 6) : [],
  }));
  const pendingProposals = Array.isArray(digest && digest.pendingProposals)
    ? digest.pendingProposals.slice(0, 5).map((entry) => ({
      title: safeString(entry && entry.title, 200),
      target: safeString(entry && entry.target, 260),
      status: safeString(entry && entry.status, 40),
    }))
    : [];
  return {
    schema: "openai-blog-learning-runtime.v1",
    enabled: Boolean(runtimeState.enabled),
    running: Boolean(runtimeState.running),
    mode: safeString(policy && policy.governance && policy.governance.mode, 80) || "observe_propose_and_doc_sync",
    sourceName: safeString(policy && policy.source && policy.source.name, 120) || "OpenAI Developers Blog",
    sourceUrl: safeString(policy && policy.source && policy.source.indexUrl, 260),
    allowedHosts: Array.isArray(policy && policy.source && policy.source.allowedHosts) ? policy.source.allowedHosts.slice(0, 8) : [],
    intervalMinutes: Number(policy && policy.cadence && policy.cadence.intervalMinutes) || 1440,
    lastRunAt: safeString(runtimeState.lastRunAt || ledger.lastRunAt, 40),
    lastSuccessAt: safeString(runtimeState.lastSuccessAt || ledger.lastSuccessAt, 40),
    nextRunAt: safeString(runtimeState.nextRunAt, 40),
    lastStatus: safeString(runtimeState.lastStatus || ledger.lastStatus, 24) || "UNKNOWN",
    lastReason: safeString(runtimeState.lastReason || ledger.lastReason, 240),
    trackedArticles: Number(summary.trackedArticles) || 0,
    newArticlesThisRun: Number(summary.newArticlesThisRun) || 0,
    pendingProposalCount: Number(summary.pendingProposals) || 0,
    blockedTargetCount: Number(summary.blockedTargets) || 0,
    promotedDocUpdates: Number(summary.promotedDocUpdates) || 0,
    ledgerPath: repoRelative(policy.workspaceRoot, policy.paths.ledgerPath),
    digestPath: repoRelative(policy.workspaceRoot, policy.paths.digestPath),
    reportPath: repoRelative(policy.workspaceRoot, policy.paths.reportPath),
    curatedDocPath: repoRelative(policy.workspaceRoot, policy.paths.curatedDocPath),
    latestArticle: recentArticles[0] || null,
    recentArticles,
    pendingProposals,
    runtimeRetrieval: {
      enabled: Boolean(policy && policy.runtimeRetrieval && policy.runtimeRetrieval.enabled),
      shadowMode: Boolean(policy && policy.runtimeRetrieval && policy.runtimeRetrieval.shadowMode),
      applyToAgents: Array.isArray(policy && policy.runtimeRetrieval && policy.runtimeRetrieval.applyToAgents)
        ? policy.runtimeRetrieval.applyToAgents.slice(0, 8)
        : [],
      applyToTaskFamilies: Array.isArray(policy && policy.runtimeRetrieval && policy.runtimeRetrieval.applyToTaskFamilies)
        ? policy.runtimeRetrieval.applyToTaskFamilies.slice(0, 8)
        : [],
      maxArticles: Number(policy && policy.runtimeRetrieval && policy.runtimeRetrieval.maxArticles) || 0,
      maxGuidanceItemsPerArticle: Number(policy && policy.runtimeRetrieval && policy.runtimeRetrieval.maxGuidanceItemsPerArticle) || 0,
      lastStatus: safeString(runtimeState.lastRetrievalStatus, 24) || (policy && policy.runtimeRetrieval && policy.runtimeRetrieval.enabled ? "IDLE" : "DISABLED"),
      lastReason: safeString(runtimeState.lastRetrievalReason, 200),
      lastAppliedAt: safeString(runtimeState.lastRetrievalAt, 40),
      lastAgentName: safeString(runtimeState.lastRetrievalAgent, 80),
      lastTaskFamily: safeString(runtimeState.lastRetrievalTaskFamily, 80),
      lastMatchedTopics: Array.isArray(runtimeState.lastRetrievalTopics) ? runtimeState.lastRetrievalTopics.slice(0, 6) : [],
      lastArticleIds: Array.isArray(runtimeState.lastRetrievalArticleIds) ? runtimeState.lastRetrievalArticleIds.slice(0, 6) : [],
      lastPromptBlockChars: Number(runtimeState.lastRetrievalPromptBlockChars) || 0,
    },
    freezeAware: {
      requirementFoundationV1: "bug_fix_only",
      blockedApplyTargets: Array.isArray(policy && policy.governance && policy.governance.blockedApplyTargets)
        ? policy.governance.blockedApplyTargets.slice(0, 8)
        : [],
    },
  };
}

async function runOpenAIBlogLearningCycle({
  policy = loadOpenAIBlogLearningPolicy(),
  fetchText = httpFetchText,
  now = new Date(),
} = {}) {
  const normalizedPolicy = normalizeOpenAIBlogLearningPolicy(policy, { policyPath: policy.policyPath || defaultOpenAIBlogLearningPolicyPath });
  const nowIso = new Date(now).toISOString();
  const previousLedger = readJsonIfExists(normalizedPolicy.paths.ledgerPath) || {};
  const previousArticles = Array.isArray(previousLedger.articles) ? previousLedger.articles : [];
  const previousByUrl = new Map(previousArticles.map((entry) => [safeString(entry.url, 320), entry]));
  const indexHtml = await fetchText(normalizedPolicy.source.indexUrl, {
    timeoutMs: normalizedPolicy.cadence.requestTimeoutMs,
    allowedHosts: normalizedPolicy.source.allowedHosts,
  });
  const cards = parseIndexCards(indexHtml, normalizedPolicy.source.indexUrl).slice(0, normalizedPolicy.cadence.maxArticlesPerRun);
  const nextArticles = [];
  const proposalSummaries = [];
  let newArticlesThisRun = 0;
  let promotedDocUpdates = 0;
  let blockedTargets = 0;
  for (const card of cards) {
    const articleHtml = await fetchText(card.url, {
      timeoutMs: normalizedPolicy.cadence.requestTimeoutMs,
      allowedHosts: normalizedPolicy.source.allowedHosts,
    });
    const insights = extractArticleInsights(articleHtml, normalizedPolicy.cadence.maxGuidanceItemsPerArticle);
    const topicTags = classifyTopics({
      title: insights.title || card.title,
      description: insights.description || card.description,
      topicLabel: card.topicLabel,
      headings: insights.headings,
      listItems: insights.listItems,
      paragraphs: insights.paragraphs,
    });
    const relevance = deriveRelevance(topicTags);
    const summary = safeString(insights.description, 320) || safeString(insights.paragraphs[0], 320) || safeString(card.description, 320);
    const article = {
      schema: "openai-blog-learning-article.v1",
      articleId: card.articleId,
      url: normalizeUrl(card.url),
      canonicalUrl: normalizeUrl(insights.canonicalUrl) || normalizeUrl(card.url),
      title: safeString(insights.title || card.title, 200),
      description: safeString(insights.description || card.description, 320),
      indexDateLabel: safeString(card.indexDateLabel, 40),
      topicLabel: safeString(card.topicLabel, 80),
      discoveredAt: nowIso,
      firstReadAt: nowIso,
      lastReadAt: nowIso,
      contentHash: sha256Hex(articleHtml),
      summary,
      guidance: Array.isArray(insights.guidance) ? insights.guidance.slice(0, normalizedPolicy.cadence.maxGuidanceItemsPerArticle) : [],
      headings: Array.isArray(insights.headings) ? insights.headings.slice(0, 8) : [],
      topicTags,
      relevance,
      promotedToDocs: [],
      proposalIds: [],
    };
    const previous = previousByUrl.get(article.url);
    if (previous) {
      article.discoveredAt = safeString(previous.discoveredAt, 40) || nowIso;
      article.firstReadAt = safeString(previous.firstReadAt, 40) || article.discoveredAt;
      article.lastReadAt = nowIso;
      if (safeString(previous.contentHash, 80) === article.contentHash) {
        article.lastReadAt = safeString(previous.lastReadAt, 40) || nowIso;
      }
    } else {
      newArticlesThisRun += 1;
    }
    const proposal = buildArticleProposal(article, normalizedPolicy, nowIso);
    const docActions = proposal.actions.filter((entry) => entry.status === "auto_doc_sync");
    const blockedActionCount = proposal.actions.filter((entry) => entry.status === "blocked").length;
    blockedTargets += blockedActionCount;
    if (docActions.length) {
      article.promotedToDocs = [repoRelative(normalizedPolicy.workspaceRoot, normalizedPolicy.paths.curatedDocPath)];
      promotedDocUpdates += 1;
    }
    article.proposalIds = [proposal.proposalId];
    proposalSummaries.push({
      proposalId: proposal.proposalId,
      articleId: article.articleId,
      title: article.title,
      target: proposal.actions.find((entry) => entry.status !== "auto_doc_sync")?.target || proposal.actions[0]?.target || "",
      status: proposal.actions.find((entry) => entry.status !== "auto_doc_sync")?.status || proposal.actions[0]?.status || "proposal_only",
    });
    writeJson(path.join(normalizedPolicy.paths.proposalDir, `${article.articleId}.json`), proposal);
    nextArticles.push(article);
  }
  const digest = {
    schema: "openai-blog-learning-digest.v1",
    generatedAt: nowIso,
    source: {
      name: normalizedPolicy.source.name,
      indexUrl: normalizedPolicy.source.indexUrl,
    },
    summary: {
      trackedArticles: nextArticles.length,
      newArticlesThisRun,
      pendingProposals: proposalSummaries.filter((entry) => entry.status === "proposal_only").length,
      blockedTargets,
      promotedDocUpdates,
    },
    topics: selectTopicEntries(nextArticles.filter((entry) => entry.relevance !== "low"), normalizedPolicy),
    latestArticles: nextArticles.map((article) => ({
      articleId: article.articleId,
      title: article.title,
      url: article.url,
      relevance: article.relevance,
      topicTags: article.topicTags,
      summary: article.summary,
      indexDateLabel: article.indexDateLabel,
    })),
    pendingProposals: proposalSummaries.filter((entry) => entry.status === "proposal_only"),
  };
  const ledger = {
    schema: "openai-blog-learning-ledger.v1",
    generatedAt: nowIso,
    lastRunAt: nowIso,
    lastSuccessAt: nowIso,
    lastStatus: "PASS",
    lastReason: "",
    summary: digest.summary,
    articles: nextArticles,
  };
  writeJson(normalizedPolicy.paths.ledgerPath, ledger);
  writeJson(normalizedPolicy.paths.digestPath, digest);
  writeText(normalizedPolicy.paths.curatedDocPath, buildCuratedDoc(digest, normalizedPolicy));
  const report = {
    status: "PASS",
    generatedAt: nowIso,
    summary: digest.summary,
    recentArticles: digest.latestArticles.slice(0, 6),
    pendingProposals: digest.pendingProposals.slice(0, 8),
    paths: {
      ledgerPath: repoRelative(normalizedPolicy.workspaceRoot, normalizedPolicy.paths.ledgerPath),
      digestPath: repoRelative(normalizedPolicy.workspaceRoot, normalizedPolicy.paths.digestPath),
      reportPath: repoRelative(normalizedPolicy.workspaceRoot, normalizedPolicy.paths.reportPath),
      curatedDocPath: repoRelative(normalizedPolicy.workspaceRoot, normalizedPolicy.paths.curatedDocPath),
    },
  };
  writeText(normalizedPolicy.paths.reportPath, buildMarkdownReport(report));
  return {
    policy: normalizedPolicy,
    ledger,
    digest,
    report,
  };
}

module.exports = {
  buildRuntimeLearningSelection,
  buildRuntimePromptInjection,
  defaultOpenAIBlogLearningPolicyPath,
  loadOpenAIBlogLearningPolicy,
  normalizeOpenAIBlogLearningPolicy,
  parseIndexCards,
  extractArticleInsights,
  buildRuntimeSnapshotFromArtifacts,
  runOpenAIBlogLearningCycle,
  httpFetchText,
};
