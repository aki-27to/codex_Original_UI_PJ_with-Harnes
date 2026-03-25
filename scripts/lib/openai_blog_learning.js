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
const defaultSelfImprovementPromotionPolicyPath = path.join(
  workspaceRootDefault,
  "scripts",
  "config",
  "self_improvement_promotion_policy.json"
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

function resolveWorkspacePath(workspaceRoot, rawPath, fallbackRelativePath) {
  const raw = safeString(rawPath, 400) || safeString(fallbackRelativePath, 400);
  if (!raw) {
    return "";
  }
  return path.isAbsolute(raw) ? path.normalize(raw) : path.join(workspaceRoot, raw);
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
    `<meta[^>]+${attributeName}=(["'])${attributeValue.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\1[^>]+content=(["'])([\\s\\S]*?)\\2[^>]*>`,
    "i"
  );
  const match = expression.exec(String(html || ""));
  return match ? decodeHtmlEntities(match[3]).trim() : "";
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

function countSubstringMatches(haystack, needle) {
  const source = safeString(haystack, 40000).toLowerCase();
  const target = safeString(needle, 120).toLowerCase();
  if (!source || !target) {
    return 0;
  }
  let count = 0;
  let searchIndex = 0;
  while (searchIndex < source.length) {
    const matchIndex = source.indexOf(target, searchIndex);
    if (matchIndex < 0) {
      break;
    }
    count += 1;
    searchIndex = matchIndex + target.length;
  }
  return count;
}

function textMatchesPatterns(value, patterns) {
  const source = safeString(value, 20000);
  if (!source) {
    return false;
  }
  for (const pattern of Array.isArray(patterns) ? patterns : []) {
    const text = safeString(pattern, 200);
    if (!text) {
      continue;
    }
    try {
      if (new RegExp(text, "i").test(source)) {
        return true;
      }
    } catch {
      if (source.toLowerCase().includes(text.toLowerCase())) {
        return true;
      }
    }
  }
  return false;
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

function sanitizeHtmlForExtraction(html) {
  return String(html || "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ");
}

function findFirstMatchText(html, patterns) {
  for (const pattern of Array.isArray(patterns) ? patterns : []) {
    const match = pattern.exec(String(html || ""));
    const text = match ? stripHtml(match[1]) : "";
    if (text) {
      return text;
    }
  }
  return "";
}

function extractPreferredMainHtml(articleHtml) {
  const cleanedHtml = sanitizeHtmlForExtraction(articleHtml);
  const patterns = [
    /<div[^>]+class="[^"]*Body-module[^"]*__body[^"]*"[^>]*>([\s\S]*?)<\/div>/i,
    /<article id="mainContent"[^>]*>([\s\S]*?)<\/article>/i,
    /<article[^>]*>([\s\S]*?)<\/article>/i,
    /<main[^>]*>([\s\S]*?)<\/main>/i,
  ];
  for (const pattern of patterns) {
    const match = pattern.exec(cleanedHtml);
    if (match && safeString(match[1], 20)) {
      return match[1];
    }
  }
  return cleanedHtml;
}

function isLikelyBoilerplateSummary(value, { sourceName = "", title = "" } = {}) {
  const text = safeString(value, 400).toLowerCase();
  if (!text) {
    return true;
  }
  const normalizedSource = safeString(sourceName, 200).toLowerCase();
  const normalizedTitle = safeString(title, 200).toLowerCase();
  if (text === normalizedSource || text === normalizedTitle) {
    return true;
  }
  if (/^openai developers? blog$/i.test(text)) {
    return true;
  }
  if (/^anthropic is an ai safety and research company/i.test(text)) {
    return true;
  }
  if (/reliable, interpretable, and steerable ai systems/i.test(text)) {
    return true;
  }
  if (/^(research|company|resources|news|learn)$/i.test(text)) {
    return true;
  }
  return false;
}

function selectSubstantiveParagraphs(paragraphs, limit = 8) {
  return dedupeTexts(
    (Array.isArray(paragraphs) ? paragraphs : []).filter((entry) => {
      const text = safeString(entry, 400);
      if (!text) {
        return false;
      }
      if (text.length < 40) {
        return false;
      }
      if (/^written by\b/i.test(text)) {
        return false;
      }
      if (/^published\b/i.test(text)) {
        return false;
      }
      if (/^skip to\b/i.test(text)) {
        return false;
      }
      return true;
    }),
    limit
  );
}

function extractFocusTokens(title) {
  const stopwords = new Set([
    "the", "and", "for", "with", "from", "into", "that", "this", "your", "using", "use", "how", "our",
    "their", "over", "under", "about", "more", "less", "than", "then", "when", "only", "also", "here",
    "blog", "developers", "developer", "engineering", "openai", "anthropic", "tasks", "task"
  ]);
  return Array.from(new Set(
    safeString(title, 400)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .split(/\s+/)
      .filter((entry) => entry.length >= 4 && !stopwords.has(entry))
  ));
}

function scoreGuidanceCandidate(text, { title = "", source = "", index = 0 } = {}) {
  const candidate = safeString(text, 400);
  if (!candidate) {
    return -999;
  }
  let score = 0;
  const focusTokens = extractFocusTokens(title);
  const lower = candidate.toLowerCase();
  const sourceWeights = {
    list: 12,
    sentence: 10,
    paragraph: 8,
    heading: 6,
  };
  score += sourceWeights[source] || 0;
  focusTokens.forEach((token) => {
    score += countSubstringMatches(lower, token) * 5;
  });
  if (/(harness|long[- ]running|checkpoint|runbook|artifact|handoff|context|planner|generator|evaluator|verification|verify|retrieval|memory|eval|transcript|spec|acceptance|workflow|agent|application development|coding)/i.test(candidate)) {
    score += 4;
  }
  if (/^(use|start with|treat|store|keep|define|provide|read|monitor|check)\b/i.test(candidate)) {
    score += 4;
  }
  if (/^(design quality|originality|craft|functionality):/i.test(candidate)) {
    score += /\b(frontend|ui|ux)\b/i.test(title) ? -1 : -10;
  }
  if (isLikelyBoilerplateSummary(candidate, { title })) {
    score -= 20;
  }
  score -= Math.min(8, index);
  return score;
}

function rankGuidanceCandidates(candidates, { title = "", maxItems = 6 } = {}) {
  const ranked = (Array.isArray(candidates) ? candidates : [])
    .map((candidate, index) => ({
      text: collapseSentence(candidate && candidate.text),
      source: safeString(candidate && candidate.source, 40),
      index: Number(candidate && candidate.index) || index,
    }))
    .filter((candidate) => candidate.text)
    .map((candidate) => ({
      ...candidate,
      score: scoreGuidanceCandidate(candidate.text, {
        title,
        source: candidate.source,
        index: candidate.index,
      }),
    }))
    .sort((left, right) => right.score - left.score || left.index - right.index);
  return dedupeTexts(ranked.map((entry) => entry.text), Math.max(1, Math.trunc(Number(maxItems) || 6)));
}

function selectArticleSummary({
  title = "",
  sourceName = "",
  metaDescription = "",
  heroSummary = "",
  cardDescription = "",
  paragraphs = [],
} = {}) {
  const substantiveParagraphs = selectSubstantiveParagraphs(paragraphs, 8);
  const candidates = [
    heroSummary,
    metaDescription,
    cardDescription,
    ...substantiveParagraphs,
  ];
  for (const candidate of candidates) {
    const text = safeString(candidate, 320);
    if (!text || isLikelyBoilerplateSummary(text, { sourceName, title })) {
      continue;
    }
    return text;
  }
  return safeString(cardDescription || metaDescription || substantiveParagraphs[0] || "", 320);
}

function parseIndexCards(indexHtml, sourceUrl) {
  const cards = [];
  const html = String(indexHtml || "");
  const openAiExpression = /<a class="resource-item[\s\S]*?href="([^"]+)"[\s\S]*?<\/a>/gi;
  let match = openAiExpression.exec(html);
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
    match = openAiExpression.exec(html);
  }
  const anthropicExpression = /<a[^>]+class="[^"]*cardLink[^"]*"[^>]+href="([^"]+)"[\s\S]*?<\/a>/gi;
  match = anthropicExpression.exec(html);
  while (match) {
    const href = safeString(match[1], 400);
    const cardHtml = match[0];
    if (/^\/engineering\/[^"/?#]+$/i.test(href) && !/\/engineering\/?$/i.test(href)) {
      const url = joinUrl(sourceUrl, href);
      const titleFromHeadingMatch = /<(?:h2|h3)[^>]*>([\s\S]*?)<\/(?:h2|h3)>/i.exec(cardHtml);
      const titleFromAltMatch = /<img[^>]+alt="([^"]+)"/i.exec(cardHtml);
      const descriptionMatch = /<p[^>]*>([\s\S]*?)<\/p>/i.exec(cardHtml);
      const dateMatch = /__date[^>]*>([\s\S]*?)<\/div>/i.exec(cardHtml);
      const title = stripHtml((titleFromHeadingMatch && titleFromHeadingMatch[1]) || (titleFromAltMatch && titleFromAltMatch[1]) || "");
      if (url && title) {
        cards.push({
          articleId: safeString(url.split("/").pop(), 120),
          url,
          title,
          description: stripHtml(descriptionMatch && descriptionMatch[1] ? descriptionMatch[1] : ""),
          indexDateLabel: safeString(stripHtml(dateMatch && dateMatch[1] ? dateMatch[1] : ""), 40),
          topicLabel: "",
        });
      }
    }
    match = anthropicExpression.exec(html);
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
      rationale: "Sync learnings into a retrieval-first, non-constitutional document.",
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

function derivePortability({ title = "", description = "", headings = [], listItems = [], paragraphs = [] } = {}, policy) {
  const filters = policy && policy.filters && typeof policy.filters === "object" ? policy.filters : {};
  const vendorTerms = Array.isArray(filters.vendorTerms) ? filters.vendorTerms : [];
  if (!vendorTerms.length) {
    return "portable";
  }
  const combined = [title, description, headings.join(" "), listItems.slice(0, 10).join(" "), paragraphs.slice(0, 8).join(" ")].join(" ");
  const vendorHits = vendorTerms.reduce((sum, term) => sum + countSubstringMatches(combined, term), 0);
  const portableSignals = /(harness|eval|context|tool|agent|workflow|security|autonomy|runbook|checkpoint|transcript|grading|retrieval|memory|approval|verification|infrastructure|application development|coding eval)/i.test(combined);
  const vendorSpecificSignals = /(browsecomp|sonnet|opus|haiku|claude\s+\d|claude code|model performance|parallel claudes|claude developer platform)/i.test(combined);
  if (vendorSpecificSignals || vendorHits >= 6) {
    return portableSignals ? "mixed" : "vendor_specific";
  }
  if (vendorHits >= 2) {
    return portableSignals ? "mixed" : "vendor_specific";
  }
  return "portable";
}

function filterGuidanceForPortability(guidance, policy) {
  const filters = policy && policy.filters && typeof policy.filters === "object" ? policy.filters : {};
  const vendorTerms = Array.isArray(filters.vendorTerms) ? filters.vendorTerms : [];
  if (!filters.portableGuidanceOnly || !vendorTerms.length) {
    return Array.isArray(guidance) ? guidance : [];
  }
  return (Array.isArray(guidance) ? guidance : []).filter((item) => !vendorTerms.some((term) => countSubstringMatches(item, term) > 0));
}

function shouldSkipLearningArticle(article, policy) {
  const filters = policy && policy.filters && typeof policy.filters === "object" ? policy.filters : {};
  if (textMatchesPatterns(article && article.url, filters.excludeUrlPatterns)) {
    return true;
  }
  if (textMatchesPatterns(article && article.title, filters.excludeTitlePatterns)) {
    return true;
  }
  if (filters.requirePortablePrinciples && safeString(article && article.portability, 40) === "vendor_specific") {
    return true;
  }
  return false;
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
  const suggestedActions = inferSuggestedActions(article.topicTags).map((action) => (
    action && action.id === "learning-doc-sync"
      ? { ...action, target: safeString(policy && policy.governance && policy.governance.autoPromoteDocPath, 260) || action.target }
      : action
  ));
  const governedActions = governSuggestedActions(suggestedActions, policy);
  return {
    schema: safeString(policy && policy.artifacts && policy.artifacts.proposalSchema, 120) || "openai-blog-learning-proposal.v1",
    proposalId: `${safeString(policy && policy.artifacts && policy.artifacts.proposalIdPrefix, 120) || "openai-blog"}-${article.articleId}`,
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

function normalizeSelfImprovementPromotionPolicy(policy, workspaceRoot = workspaceRootDefault) {
  const source = policy && typeof policy === "object" ? policy : {};
  return {
    schema: safeString(source.schema, 120) || "self-improvement-promotion-policy.v1",
    mode: safeString(source.mode, 80) || "machine_guarded_autonomy",
    autoApply: {
      changeClasses: Array.isArray(source && source.autoApply && source.autoApply.changeClasses)
        ? source.autoApply.changeClasses.map((entry) => safeString(entry, 120)).filter(Boolean)
        : ["runtime_retrieval_hint"],
      requireGatePass: source && source.autoApply && Object.prototype.hasOwnProperty.call(source.autoApply, "requireGatePass")
        ? Boolean(source.autoApply.requireGatePass)
        : true,
      maxAutoApplyPerLane: Math.max(1, Math.min(40, Math.trunc(Number(source && source.autoApply && source.autoApply.maxAutoApplyPerLane) || 12))),
    },
    proposalOnly: {
      targets: Array.isArray(source && source.proposalOnly && source.proposalOnly.targets)
        ? source.proposalOnly.targets.map((entry) => safeString(entry, 260)).filter(Boolean)
        : [],
      changeClasses: Array.isArray(source && source.proposalOnly && source.proposalOnly.changeClasses)
        ? source.proposalOnly.changeClasses.map((entry) => safeString(entry, 120)).filter(Boolean)
        : [],
    },
    blocked: {
      targets: Array.isArray(source && source.blocked && source.blocked.targets)
        ? source.blocked.targets.map((entry) => safeString(entry, 260)).filter(Boolean)
        : [],
    },
    evalGate: {
      schema: safeString(source && source.evalGate && source.evalGate.schema, 120) || "self-improvement-eval-gate.v1",
      cases: Array.isArray(source && source.evalGate && source.evalGate.cases)
        ? source.evalGate.cases.map((entry, index) => ({
          caseId: safeString(entry && entry.caseId, 120) || `case_${index + 1}`,
          agentName: safeString(entry && entry.agentName, 80),
          taskFamily: safeString(entry && entry.taskFamily, 80).toLowerCase() || "deterministic_code",
          prompt: safeString(entry && entry.prompt, 600),
          requiredTopics: Array.isArray(entry && entry.requiredTopics)
            ? entry.requiredTopics.map((item) => safeString(item, 80).toLowerCase()).filter(Boolean)
            : [],
          forbiddenTopics: Array.isArray(entry && entry.forbiddenTopics)
            ? entry.forbiddenTopics.map((item) => safeString(item, 80).toLowerCase()).filter(Boolean)
            : [],
          maxTopics: Math.max(1, Math.min(12, Math.trunc(Number(entry && entry.maxTopics) || 6))),
          workspaceRoot: repoRelative(workspaceRoot, workspaceRoot),
        }))
        : [],
    },
  };
}

function loadSelfImprovementPromotionPolicy(policy) {
  const normalizedPolicy = normalizeOpenAIBlogLearningPolicy(policy, {
    policyPath: policy && policy.policyPath ? policy.policyPath : defaultOpenAIBlogLearningPolicyPath,
  });
  const filePath = normalizedPolicy.selfImprovement && normalizedPolicy.selfImprovement.promotionPolicyPath
    ? normalizedPolicy.selfImprovement.promotionPolicyPath
    : defaultSelfImprovementPromotionPolicyPath;
  const parsed = readJsonIfExists(filePath);
  return {
    path: filePath,
    policy: normalizeSelfImprovementPromotionPolicy(parsed, normalizedPolicy.workspaceRoot),
  };
}

function buildLearningActionClass(article, policy) {
  const tags = Array.isArray(article && article.topicTags) ? article.topicTags : [];
  const isPrimary = safeString(policy && policy.source && policy.source.tier, 40) !== "secondary";
  const runtimeRetrievalEnabled = Boolean(policy && policy.runtimeRetrieval && policy.runtimeRetrieval.enabled);
  const runtimeTopics = new Set(Array.isArray(policy && policy.runtimeRetrieval && policy.runtimeRetrieval.topicPriority)
    ? policy.runtimeRetrieval.topicPriority
    : []);
  const supportsRuntimeHint = isPrimary && runtimeRetrievalEnabled && tags.some((tag) => runtimeTopics.has(tag));
  if (supportsRuntimeHint && safeString(article && article.relevance, 20) === "high") {
    return "runtime_retrieval_hint";
  }
  if (tags.includes("evals")) {
    return "eval_extension";
  }
  if (tags.includes("frontend")) {
    return "frontend_quality_note";
  }
  if (tags.some((tag) => ["context", "automation", "skills"].includes(tag))) {
    return "memory_policy_note";
  }
  return "operator_policy_note";
}

function buildLearningActionTarget(changeClass) {
  switch (safeString(changeClass, 120)) {
    case "runtime_retrieval_hint":
      return "runtime/external-learning/runtime-retrieval";
    case "eval_extension":
      return "scripts/config/eval_suite_default.json";
    case "frontend_quality_note":
      return "docs/FRONTEND_QUALITY_PLAYBOOK.md";
    case "operator_policy_note":
      return "docs/AGENT_OPERATING_RULES.md";
    case "runtime_policy_tuning":
      return "scripts/config/openai_blog_learning_policy.json";
    case "memory_policy_note":
    default:
      return "docs/CONTEXT_MEMORY_POLICY.md";
  }
}

function buildLearningObjective(article, changeClass) {
  const title = safeString(article && article.title, 200) || "learning";
  switch (safeString(changeClass, 120)) {
    case "runtime_retrieval_hint":
      return `Improve runtime retrieval targeting using article-specific guidance from ${title}.`;
    case "eval_extension":
      return `Propose eval-strengthening guidance based on ${title}.`;
    case "frontend_quality_note":
      return `Propose frontend quality guidance based on ${title}.`;
    case "operator_policy_note":
      return `Propose operator policy guidance based on ${title}.`;
    default:
      return `Propose context/memory guidance based on ${title}.`;
  }
}

function deriveLexicalTriggers(article, topics, limit = 4) {
  const topicCatalog = {
    frontend: ["landing page", "design system", "mood board", "typography", "motion", "visual reference"],
    evals: ["acceptance criteria", "benchmark", "screenshot", "verification", "grader", "transcript"],
    codex: ["spec file", "checkpoint", "runbook", "audit log", "long horizon", "workflow"],
    context: ["prompt budget", "working state", "retrieve only", "context", "memory", "handoff"],
    automation: ["background loop", "scheduled", "cron", "automation", "workflow"],
    agents: ["planner", "generator", "evaluator", "subagent", "worker", "handoff"],
    skills: ["skill", "tooling", "figma", "stitch"],
    safety: ["approval boundary", "guardrail", "risk", "safety"],
  };
  const body = [
    safeString(article && article.title, 240),
    safeString(article && article.summary, 320),
    ...(Array.isArray(article && article.guidance) ? article.guidance.slice(0, 6) : []),
  ].join(" ").toLowerCase();
  const matches = [];
  for (const topic of Array.isArray(topics) ? topics : []) {
    const candidates = Array.isArray(topicCatalog[topic]) ? topicCatalog[topic] : [];
    for (const candidate of candidates) {
      if (!candidate) {
        continue;
      }
      if (body.includes(candidate.toLowerCase())) {
        matches.push(candidate);
      }
    }
  }
  const fallback = [];
  for (const topic of Array.isArray(topics) ? topics : []) {
    const candidates = Array.isArray(topicCatalog[topic]) ? topicCatalog[topic] : [];
    fallback.push(...candidates);
  }
  return dedupeTexts([...matches, ...fallback], Math.max(1, Math.trunc(Number(limit) || 4)));
}

function buildRuntimeRetrievalHint(article, policy) {
  const topics = uniqueStringList(
    (Array.isArray(article && article.topicTags) ? article.topicTags : []).filter((topic) => {
      const allowedTopics = new Set(Array.isArray(policy && policy.retrieval && policy.retrieval.allowedTopics)
        ? policy.retrieval.allowedTopics
        : []);
      return !allowedTopics.size || allowedTopics.has(topic);
    }),
    4
  ).map((entry) => entry.toLowerCase());
  return {
    hintId: `${safeString(article && article.articleId, 120)}-runtime-retrieval`,
    appliesToAgents: Array.isArray(policy && policy.runtimeRetrieval && policy.runtimeRetrieval.applyToAgents)
      ? policy.runtimeRetrieval.applyToAgents.slice(0, 8)
      : [],
    appliesToTaskFamilies: Array.isArray(policy && policy.runtimeRetrieval && policy.runtimeRetrieval.applyToTaskFamilies)
      ? policy.runtimeRetrieval.applyToTaskFamilies.slice(0, 8)
      : [],
    topics,
    lexicalTriggers: deriveLexicalTriggers(article, topics, policy && policy.selfImprovement && policy.selfImprovement.maxLexicalTriggersPerProposal),
    preferredArticleIds: [safeString(article && article.articleId, 120)].filter(Boolean),
    topicBoost: 3,
    articleBoost: 8,
  };
}

function deriveFrontendQualityAxes(article) {
  const body = [
    safeString(article && article.title, 240),
    safeString(article && article.summary, 320),
    ...(Array.isArray(article && article.guidance) ? article.guidance.slice(0, 6) : []),
  ].join(" ").toLowerCase();
  const axes = [];
  const addAxis = (value) => {
    const normalized = safeString(value, 80).toLowerCase();
    if (!normalized || axes.includes(normalized)) {
      return;
    }
    axes.push(normalized);
  };
  if (/(typography|font|headline|editorial)/i.test(body)) addAxis("typography");
  if (/(motion|animation|presence)/i.test(body)) addAxis("motion");
  if (/(hierarchy|spacing|layout|grid)/i.test(body)) addAxis("hierarchy");
  if (/(reference|mood board|visual guardrail|benchmark)/i.test(body)) addAxis("reference_discipline");
  if (/(responsive|mobile|desktop)/i.test(body)) addAxis("responsive_quality");
  return axes.length ? axes : ["frontend_quality"];
}

function buildFrontendQualityNote(article, policy) {
  const topics = uniqueStringList(
    (Array.isArray(article && article.topicTags) ? article.topicTags : []).filter((topic) => {
      const allowedTopics = new Set(Array.isArray(policy && policy.retrieval && policy.retrieval.allowedTopics)
        ? policy.retrieval.allowedTopics
        : []);
      return !allowedTopics.size || allowedTopics.has(topic);
    }),
    4
  ).map((entry) => entry.toLowerCase());
  const stabilization = policy && policy.stabilization && typeof policy.stabilization === "object"
    ? policy.stabilization
    : {};
  return {
    noteId: `${safeString(article && article.articleId, 120)}-frontend-quality`,
    appliesToAgents: Array.isArray(stabilization.applyToAgents) ? stabilization.applyToAgents.slice(0, 8) : [],
    appliesToTaskFamilies: Array.isArray(stabilization.applyToTaskFamilies) ? stabilization.applyToTaskFamilies.slice(0, 8) : [],
    topics,
    lexicalTriggers: deriveLexicalTriggers(article, topics, Math.max(2, Number(policy && policy.selfImprovement && policy.selfImprovement.maxLexicalTriggersPerProposal) || 4)),
    preferredArticleIds: [safeString(article && article.articleId, 120)].filter(Boolean),
    qualityAxes: deriveFrontendQualityAxes(article),
    guidance: Array.isArray(article && article.guidance)
      ? article.guidance.slice(0, Math.max(1, Number(stabilization.maxGuidanceItemsPerNote) || 3)).map((entry) => safeString(entry, 220)).filter(Boolean)
      : [],
  };
}

function classifySelfImprovementPromotion({ changeClass = "", target = "", lanePolicy, promotionPolicy }) {
  const normalizedTarget = safeString(target, 260);
  const normalizedClass = safeString(changeClass, 120);
  const governance = lanePolicy && lanePolicy.governance ? lanePolicy.governance : {};
  const blockedTargets = new Set([
    ...(Array.isArray(governance.blockedApplyTargets) ? governance.blockedApplyTargets : []),
    ...(Array.isArray(governance.frozenFoundationTargets) ? governance.frozenFoundationTargets : []),
    ...(promotionPolicy && promotionPolicy.blocked && Array.isArray(promotionPolicy.blocked.targets) ? promotionPolicy.blocked.targets : []),
  ].map((entry) => safeString(entry, 260)).filter(Boolean));
  const proposalOnlyTargets = new Set([
    ...(Array.isArray(governance.proposalOnlyTargets) ? governance.proposalOnlyTargets : []),
    ...(promotionPolicy && promotionPolicy.proposalOnly && Array.isArray(promotionPolicy.proposalOnly.targets) ? promotionPolicy.proposalOnly.targets : []),
  ].map((entry) => safeString(entry, 260)).filter(Boolean));
  const autoApplyClasses = new Set(
    promotionPolicy && promotionPolicy.autoApply && Array.isArray(promotionPolicy.autoApply.changeClasses)
      ? promotionPolicy.autoApply.changeClasses.map((entry) => safeString(entry, 120)).filter(Boolean)
      : []
  );
  const proposalOnlyClasses = new Set(
    promotionPolicy && promotionPolicy.proposalOnly && Array.isArray(promotionPolicy.proposalOnly.changeClasses)
      ? promotionPolicy.proposalOnly.changeClasses.map((entry) => safeString(entry, 120)).filter(Boolean)
      : []
  );
  if (!normalizedTarget) {
    return {
      decision: "blocked",
      rationale: "missing_target",
      riskFlags: ["missing_target"],
    };
  }
  if (blockedTargets.has(normalizedTarget)) {
    return {
      decision: "blocked",
      rationale: "boundary_blocked",
      riskFlags: ["constitutional_or_frozen_boundary"],
    };
  }
  if (proposalOnlyTargets.has(normalizedTarget) || proposalOnlyClasses.has(normalizedClass)) {
    return {
      decision: "proposal_only",
      rationale: "governed_review_required",
      riskFlags: ["governed_review_required"],
    };
  }
  if (autoApplyClasses.has(normalizedClass)) {
    return {
      decision: "auto_apply_candidate",
      rationale: "bounded_low_risk_runtime_hint",
      riskFlags: ["machine_gate_required"],
    };
  }
  return {
    decision: "proposal_only",
    rationale: "manual_target_default",
    riskFlags: ["manual_review"],
  };
}

function buildSelfImprovementProposal(article, lanePolicy, promotionPolicy, nowIso) {
  const changeClass = buildLearningActionClass(article, lanePolicy);
  const target = buildLearningActionTarget(changeClass);
  const promotion = classifySelfImprovementPromotion({
    changeClass,
    target,
    lanePolicy,
    promotionPolicy,
  });
  const runtimeRetrievalHint = changeClass === "runtime_retrieval_hint"
    ? buildRuntimeRetrievalHint(article, lanePolicy)
    : null;
  const frontendQualityNote = Array.isArray(article && article.topicTags) && article.topicTags.includes("frontend")
    ? buildFrontendQualityNote(article, lanePolicy)
    : null;
  const caseIds = Array.isArray(promotionPolicy && promotionPolicy.evalGate && promotionPolicy.evalGate.cases)
    ? promotionPolicy.evalGate.cases.map((entry) => safeString(entry && entry.caseId, 120)).filter(Boolean)
    : [];
  return {
    schema: safeString(lanePolicy && lanePolicy.selfImprovement && lanePolicy.selfImprovement.proposalSchema, 120) || "self-improvement-proposal.v1",
    proposalId: `${safeString(lanePolicy && lanePolicy.artifacts && lanePolicy.artifacts.proposalIdPrefix, 120) || "learning"}-${safeString(article && article.articleId, 120)}-self-improvement`,
    createdAt: nowIso,
    sourceLane: safeString(lanePolicy && lanePolicy.source && lanePolicy.source.name, 120) || "external_learning",
    sourceTier: safeString(lanePolicy && lanePolicy.source && lanePolicy.source.tier, 40) || "primary",
    articleId: safeString(article && article.articleId, 120),
    title: safeString(article && article.title, 200),
    sourceUrl: safeString(article && article.url, 320),
    relevance: safeString(article && article.relevance, 20) || "medium",
    portability: safeString(article && article.portability, 40) || "portable",
    changeClass,
    target,
    objective: buildLearningObjective(article, changeClass),
    evidence: {
      summary: safeString(article && article.summary, 320),
      guidance: Array.isArray(article && article.guidance) ? article.guidance.slice(0, 6).map((entry) => safeString(entry, 240)).filter(Boolean) : [],
      topicTags: Array.isArray(article && article.topicTags) ? article.topicTags.slice(0, 8) : [],
      articleProposalId: Array.isArray(article && article.proposalIds) ? safeString(article.proposalIds[0], 160) : "",
    },
    candidateChange: (() => {
      if (runtimeRetrievalHint || frontendQualityNote) {
        return {
          ...(runtimeRetrievalHint ? { runtimeRetrievalHint } : {}),
          ...(frontendQualityNote ? { frontendQualityNote } : {}),
        };
      }
      return {
        note: safeString(article && article.summary, 320),
      };
    })(),
    promotion,
    gate: {
      required: promotion.decision === "auto_apply_candidate" && Boolean(promotionPolicy && promotionPolicy.autoApply && promotionPolicy.autoApply.requireGatePass),
      status: promotion.decision === "auto_apply_candidate" ? "pending" : "not_applicable",
      caseIds,
    },
  };
}

function extractArticleInsights(articleHtml, maxGuidanceItems) {
  const html = String(articleHtml || "");
  const mainHtml = extractPreferredMainHtml(html);
  const headings = dedupeTexts([
    ...collectTagTexts(mainHtml, "h1", 4),
    ...collectTagTexts(mainHtml, "h2", 8),
    ...collectTagTexts(mainHtml, "h3", 8),
  ], 8);
  const paragraphs = dedupeTexts(collectTagTexts(mainHtml, "p", 16), 16);
  const listItems = dedupeTexts(collectTagTexts(mainHtml, "li", 18), 18);
  const title = extractMetaContent(articleHtml, "property", "og:title")
    || extractMetaContent(articleHtml, "name", "title")
    || extractTitle(articleHtml)
    || headings[0]
    || "";
  const guidanceCandidates = [
    ...listItems.map((entry, index) => ({ text: entry, source: "list", index })),
    ...sentenceCandidatesFromParagraphs(paragraphs).map((entry, index) => ({ text: entry, source: "sentence", index })),
    ...headings.map((entry, index) => ({ text: `Section focus: ${entry}`, source: "heading", index })),
    ...selectSubstantiveParagraphs(paragraphs, 6).map((entry, index) => ({ text: entry, source: "paragraph", index })),
  ];
  const guidance = rankGuidanceCandidates(guidanceCandidates, {
    title,
    maxItems: Math.max(1, Math.trunc(Number(maxGuidanceItems) || 6)),
  });
  return {
    title,
    description: extractMetaContent(articleHtml, "name", "description") || extractMetaContent(articleHtml, "property", "og:description"),
    heroSummary: findFirstMatchText(html, [
      /<p[^>]+class="[^"]*summary[^"]*"[^>]*>([\s\S]*?)<\/p>/i,
      /<p[^>]+class="[^"]*hero[^"]*"[^>]*>([\s\S]*?)<\/p>/i,
    ]),
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
  const artifactPrefix = safeString(source && source.artifacts && source.artifacts.proposalIdPrefix, 120)
    || safeString(source && source.source && source.source.name, 120).toLowerCase().replace(/[^a-z0-9]+/g, "_")
    || "openai_blog";
  const normalizedArtifactPrefix = artifactPrefix.replace(/-+/g, "_").replace(/^_+|_+$/g, "") || "openai_blog";
  const normalized = {
    schema: safeString(source.schema, 120) || "openai-blog-learning-policy.v1",
    policyPath,
    workspaceRoot,
    source: {
      name: safeString(source && source.source && source.source.name, 120) || "OpenAI Developers Blog",
      indexUrl: normalizeUrl(source && source.source && source.source.indexUrl) || "https://developers.openai.com/blog",
      tier: safeString(source && source.source && source.source.tier, 40) || "primary",
      userAgent: safeString(source && source.source && source.source.userAgent, 200) || "codex-harness-external-learning/1.0",
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
    filters: {
      requirePortablePrinciples: Boolean(source && source.filters && source.filters.requirePortablePrinciples),
      portableGuidanceOnly: Boolean(source && source.filters && source.filters.portableGuidanceOnly),
      excludeUrlPatterns: Array.isArray(source && source.filters && source.filters.excludeUrlPatterns)
        ? source.filters.excludeUrlPatterns.map((entry) => safeString(entry, 200)).filter(Boolean)
        : [],
      excludeTitlePatterns: Array.isArray(source && source.filters && source.filters.excludeTitlePatterns)
        ? source.filters.excludeTitlePatterns.map((entry) => safeString(entry, 200)).filter(Boolean)
        : [],
      vendorTerms: Array.isArray(source && source.filters && source.filters.vendorTerms)
        ? source.filters.vendorTerms.map((entry) => safeString(entry, 120).toLowerCase()).filter(Boolean)
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
    stabilization: {
      enabled: source && source.stabilization && Object.prototype.hasOwnProperty.call(source.stabilization, "enabled")
        ? Boolean(source.stabilization.enabled)
        : true,
      playbookTitle: safeString(source && source.stabilization && source.stabilization.playbookTitle, 120) || "FRONTEND_QUALITY_PLAYBOOK",
      applyToAgents: Array.isArray(source && source.stabilization && source.stabilization.applyToAgents)
        ? source.stabilization.applyToAgents.map((entry) => safeString(entry, 80)).filter(Boolean)
        : ["default", "frontend_worker"],
      applyToTaskFamilies: Array.isArray(source && source.stabilization && source.stabilization.applyToTaskFamilies)
        ? source.stabilization.applyToTaskFamilies.map((entry) => safeString(entry, 80).toLowerCase()).filter(Boolean)
        : ["web_creative"],
      minSuccessfulTurnsForPromotion: Math.max(1, Math.min(8, Math.trunc(Number(source && source.stabilization && source.stabilization.minSuccessfulTurnsForPromotion) || 2))),
      minSuccessRate: Math.max(0.5, Math.min(1, Number(source && source.stabilization && source.stabilization.minSuccessRate) || 0.67)),
      maxPromotedNotes: Math.max(1, Math.min(8, Math.trunc(Number(source && source.stabilization && source.stabilization.maxPromotedNotes) || 4))),
      maxGuidanceItemsPerNote: Math.max(1, Math.min(6, Math.trunc(Number(source && source.stabilization && source.stabilization.maxGuidanceItemsPerNote) || 3))),
      maxPromptNotes: Math.max(1, Math.min(6, Math.trunc(Number(source && source.stabilization && source.stabilization.maxPromptNotes) || 2))),
    },
    selfImprovement: {
      enabled: source && source.selfImprovement && Object.prototype.hasOwnProperty.call(source.selfImprovement, "enabled")
        ? Boolean(source.selfImprovement.enabled)
        : true,
      proposalSchema: safeString(source && source.selfImprovement && source.selfImprovement.proposalSchema, 120) || "self-improvement-proposal.v1",
      stateSchema: safeString(source && source.selfImprovement && source.selfImprovement.stateSchema, 120) || "self-improvement-state.v1",
      gateSchema: safeString(source && source.selfImprovement && source.selfImprovement.gateSchema, 120) || "self-improvement-eval-gate.v1",
      maxLexicalTriggersPerProposal: Math.max(1, Math.min(8, Math.trunc(Number(source && source.selfImprovement && source.selfImprovement.maxLexicalTriggersPerProposal) || 4))),
      maxAppliedHints: Math.max(1, Math.min(20, Math.trunc(Number(source && source.selfImprovement && source.selfImprovement.maxAppliedHints) || 12))),
      promotionPolicyPath: resolveWorkspacePath(
        workspaceRoot,
        source && source.selfImprovement && source.selfImprovement.promotionPolicyPath,
        repoRelative(workspaceRoot, defaultSelfImprovementPromotionPolicyPath)
      ),
    },
    presentation: {
      curatedDocTitle: safeString(source && source.presentation && source.presentation.curatedDocTitle, 120) || "OPENAI_DEVELOPER_LEARNINGS",
      reportTitle: safeString(source && source.presentation && source.presentation.reportTitle, 120) || "OPENAI_BLOG_LEARNING_REPORT",
      introLines: Array.isArray(source && source.presentation && source.presentation.introLines)
        ? source.presentation.introLines.map((entry) => safeString(entry, 320)).filter(Boolean)
        : [],
    },
    artifacts: {
      proposalIdPrefix: safeString(source && source.artifacts && source.artifacts.proposalIdPrefix, 120) || "openai-blog",
      articleSchema: safeString(source && source.artifacts && source.artifacts.articleSchema, 120) || "openai-blog-learning-article.v1",
      digestSchema: safeString(source && source.artifacts && source.artifacts.digestSchema, 120) || "openai-blog-learning-digest.v1",
      ledgerSchema: safeString(source && source.artifacts && source.artifacts.ledgerSchema, 120) || "openai-blog-learning-ledger.v1",
      proposalSchema: safeString(source && source.artifacts && source.artifacts.proposalSchema, 120) || "openai-blog-learning-proposal.v1",
      runtimeSchema: safeString(source && source.artifacts && source.artifacts.runtimeSchema, 120) || "openai-blog-learning-runtime.v1",
    },
  };
  normalized.paths = {
    ledgerPath: resolveWorkspacePath(workspaceRoot, source && source.paths && source.paths.ledgerPath, "output/openai_blog_learning_ledger.json"),
    digestPath: resolveWorkspacePath(workspaceRoot, source && source.paths && source.paths.digestPath, "output/openai_blog_learning_digest.json"),
    reportPath: resolveWorkspacePath(workspaceRoot, source && source.paths && source.paths.reportPath, "output/openai_blog_learning_report.md"),
    proposalDir: resolveWorkspacePath(workspaceRoot, source && source.paths && source.paths.proposalDir, "output/openai_blog_learning_proposals"),
    curatedDocPath: resolveWorkspacePath(workspaceRoot, source && source.paths && source.paths.curatedDocPath, normalized.governance.autoPromoteDocPath),
    selfImprovementProposalDir: resolveWorkspacePath(workspaceRoot, source && source.paths && source.paths.selfImprovementProposalDir, `output/${normalizedArtifactPrefix}_self_improvement_proposals`),
    selfImprovementStatePath: resolveWorkspacePath(workspaceRoot, source && source.paths && source.paths.selfImprovementStatePath, `output/${normalizedArtifactPrefix}_self_improvement_state.json`),
    selfImprovementGatePath: resolveWorkspacePath(workspaceRoot, source && source.paths && source.paths.selfImprovementGatePath, `output/${normalizedArtifactPrefix}_self_improvement_gate.json`),
    stabilizationMemoryPath: resolveWorkspacePath(workspaceRoot, source && source.paths && source.paths.stabilizationMemoryPath, `output/${normalizedArtifactPrefix}_reinforcement_memory.json`),
    stabilizationPlaybookPath: resolveWorkspacePath(workspaceRoot, source && source.paths && source.paths.stabilizationPlaybookPath, "docs/FRONTEND_QUALITY_PLAYBOOK.md"),
  };
  return normalized;
}

function httpFetchText(rawUrl, { timeoutMs = 15000, allowedHosts = [], userAgent = "codex-harness-external-learning/1.0" } = {}) {
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
          "User-Agent": safeString(userAgent, 200) || "codex-harness-external-learning/1.0",
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
  const introLines = Array.isArray(policy && policy.presentation && policy.presentation.introLines) && policy.presentation.introLines.length
    ? policy.presentation.introLines
    : [
      `This file is auto-synced from ${safeString(policy && policy.source && policy.source.name, 120) || "the external learning lane"}.`,
      "It is not constitutional guidance and does not silently override `AGENTS.md` or frozen Step 1/2 behavior.",
    ];
  const lines = [
    `# ${safeString(policy && policy.presentation && policy.presentation.curatedDocTitle, 120) || "OPENAI_DEVELOPER_LEARNINGS"}`,
    "",
    `Updated: ${safeString(digest && digest.generatedAt, 40) || "-"}`,
    "",
    ...introLines,
    "",
    "## How to use",
    "",
    "- Treat these notes as retrieval-first working memory, not as automatic runtime policy.",
    `- Source is locked to ${safeString(policy && policy.source && policy.source.indexUrl, 240)} and the configured allowlist only.`,
    "- High-risk targets stay proposal-only until separately reviewed and validated.",
    "- Requirement-Driven Foundation V1 remains frozen; external learnings cannot silently expand Step 1/2.",
    policy && policy.runtimeRetrieval && policy.runtimeRetrieval.enabled
      ? "- Runtime retrieval may inject a small advisory block only for targeted runtime paths."
      : "- Runtime retrieval is disabled for this lane unless separately enabled and validated.",
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
      if (safeString(entry.portability, 40)) {
        lines.push(`- Portability: ${safeString(entry.portability, 40)}`);
      }
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
    `# ${safeString(report && report.title, 120) || "OPENAI_BLOG_LEARNING_REPORT"}`,
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
    `- selfImprovementStatePath: ${safeString(report && report.paths && report.paths.selfImprovementStatePath, 240) || "-"}`,
    `- selfImprovementGatePath: ${safeString(report && report.paths && report.paths.selfImprovementGatePath, 240) || "-"}`,
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
  const selfImprovement = report && report.selfImprovement && typeof report.selfImprovement === "object" ? report.selfImprovement : null;
  lines.push("", "## Self Improvement", "");
  if (!selfImprovement) {
    lines.push("No self-improvement state was generated.");
  } else {
    lines.push(`- gateStatus: ${safeString(selfImprovement.gateStatus, 20) || "UNKNOWN"}`);
    lines.push(`- appliedDecision: ${safeString(selfImprovement.appliedDecision, 40) || "none"}`);
    lines.push(`- appliedHintCount: ${Number(selfImprovement.appliedHintCount) || 0}`);
    lines.push(`- appliedFrontendQualityNoteCount: ${Number(selfImprovement.appliedFrontendQualityNoteCount) || 0}`);
    lines.push(`- proposalOnlyCount: ${Number(selfImprovement.proposalOnlyCount) || 0}`);
    lines.push(`- blockedCount: ${Number(selfImprovement.blockedCount) || 0}`);
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
        portability: safeString(article.portability, 40) || "portable",
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

function compileSelfImprovementRuntimeHints(selfImprovementState) {
  const state = selfImprovementState && typeof selfImprovementState === "object" ? selfImprovementState : {};
  const appliedHints = Array.isArray(state.appliedHints)
    ? state.appliedHints
    : (Array.isArray(state.candidateHints)
      ? state.candidateHints
      : (state.runtimeHints && Array.isArray(state.runtimeHints.appliedHints) ? state.runtimeHints.appliedHints : []));
  const normalizedHints = [];
  for (const entry of appliedHints) {
    const hint = entry && typeof entry === "object" && entry.runtimeRetrievalHint && typeof entry.runtimeRetrievalHint === "object"
      ? entry.runtimeRetrievalHint
      : entry;
    const hintId = safeString(hint && hint.hintId, 160);
    const topics = Array.isArray(hint && hint.topics)
      ? hint.topics.map((item) => safeString(item, 80).toLowerCase()).filter(Boolean)
      : [];
    if (!hintId || !topics.length) {
      continue;
    }
    normalizedHints.push({
      hintId,
      appliesToAgents: Array.isArray(hint && hint.appliesToAgents) ? hint.appliesToAgents.map((item) => safeString(item, 80)).filter(Boolean) : [],
      appliesToTaskFamilies: Array.isArray(hint && hint.appliesToTaskFamilies) ? hint.appliesToTaskFamilies.map((item) => safeString(item, 80).toLowerCase()).filter(Boolean) : [],
      topics,
      lexicalTriggers: Array.isArray(hint && hint.lexicalTriggers) ? hint.lexicalTriggers.map((item) => safeString(item, 120).toLowerCase()).filter(Boolean) : [],
      preferredArticleIds: Array.isArray(hint && hint.preferredArticleIds) ? hint.preferredArticleIds.map((item) => safeString(item, 120)).filter(Boolean) : [],
      topicBoost: Math.max(1, Math.min(12, Math.trunc(Number(hint && hint.topicBoost) || 3))),
      articleBoost: Math.max(1, Math.min(20, Math.trunc(Number(hint && hint.articleBoost) || 8))),
    });
  }
  return normalizedHints;
}

function compileSelfImprovementFrontendQualityNotes(selfImprovementState) {
  const state = selfImprovementState && typeof selfImprovementState === "object" ? selfImprovementState : {};
  const appliedNotes = Array.isArray(state.appliedFrontendQualityNotes)
    ? state.appliedFrontendQualityNotes
    : [];
  const normalizedNotes = [];
  for (const entry of appliedNotes) {
    const note = entry && typeof entry === "object" && entry.frontendQualityNote && typeof entry.frontendQualityNote === "object"
      ? entry.frontendQualityNote
      : entry;
    const noteId = safeString(note && note.noteId, 160);
    const topics = Array.isArray(note && note.topics)
      ? note.topics.map((item) => safeString(item, 80).toLowerCase()).filter(Boolean)
      : [];
    const guidance = Array.isArray(note && note.guidance)
      ? note.guidance.map((item) => safeString(item, 220)).filter(Boolean).slice(0, 4)
      : [];
    if (!noteId || !topics.length || !guidance.length) {
      continue;
    }
    normalizedNotes.push({
      noteId,
      appliesToAgents: Array.isArray(note && note.appliesToAgents) ? note.appliesToAgents.map((item) => safeString(item, 80)).filter(Boolean) : [],
      appliesToTaskFamilies: Array.isArray(note && note.appliesToTaskFamilies) ? note.appliesToTaskFamilies.map((item) => safeString(item, 80).toLowerCase()).filter(Boolean) : [],
      topics,
      lexicalTriggers: Array.isArray(note && note.lexicalTriggers) ? note.lexicalTriggers.map((item) => safeString(item, 120).toLowerCase()).filter(Boolean) : [],
      preferredArticleIds: Array.isArray(note && note.preferredArticleIds) ? note.preferredArticleIds.map((item) => safeString(item, 120)).filter(Boolean) : [],
      qualityAxes: Array.isArray(note && note.qualityAxes) ? note.qualityAxes.map((item) => safeString(item, 80).toLowerCase()).filter(Boolean).slice(0, 6) : [],
      guidance,
      reinforcement: entry && typeof entry === "object" && entry.reinforcement && typeof entry.reinforcement === "object"
        ? {
          successCount: Math.max(0, Math.trunc(Number(entry.reinforcement.successCount) || 0)),
          failureCount: Math.max(0, Math.trunc(Number(entry.reinforcement.failureCount) || 0)),
          successRate: Number.isFinite(Number(entry.reinforcement.successRate)) ? Number(Number(entry.reinforcement.successRate).toFixed(4)) : 0,
        }
        : null,
    });
  }
  return normalizedNotes;
}

function loadStabilizationMemory(policy) {
  const normalizedPolicy = normalizeOpenAIBlogLearningPolicy(policy, {
    policyPath: policy && policy.policyPath ? policy.policyPath : defaultOpenAIBlogLearningPolicyPath,
  });
  return readJsonIfExists(normalizedPolicy.paths.stabilizationMemoryPath) || {
    schema: "learning-reinforcement-memory.v1",
    generatedAt: "",
    lastObservedAt: "",
    observationCount: 0,
    recentObservations: [],
    articleStats: {},
    hintStats: {},
    topicStats: {},
  };
}

function buildFrontendQualityPlaybook({ policy, selfImprovementState, reinforcementMemory } = {}) {
  const normalizedPolicy = normalizeOpenAIBlogLearningPolicy(policy, {
    policyPath: policy && policy.policyPath ? policy.policyPath : defaultOpenAIBlogLearningPolicyPath,
  });
  const notes = compileSelfImprovementFrontendQualityNotes(selfImprovementState).slice(
    0,
    Math.max(1, Number(normalizedPolicy && normalizedPolicy.stabilization && normalizedPolicy.stabilization.maxPromotedNotes) || 4)
  );
  const lines = [
    `# ${safeString(normalizedPolicy && normalizedPolicy.stabilization && normalizedPolicy.stabilization.playbookTitle, 120) || "FRONTEND_QUALITY_PLAYBOOK"}`,
    "",
    "Generated, machine-gated, and non-constitutional.",
    "Only reinforced web-creative frontend quality notes are promoted here.",
    "",
    `- source: ${safeString(normalizedPolicy && normalizedPolicy.source && normalizedPolicy.source.name, 120) || "OpenAI Developers Blog"}`,
    `- generatedAt: ${safeString(selfImprovementState && selfImprovementState.generatedAt, 40) || safeString(reinforcementMemory && reinforcementMemory.generatedAt, 40) || "-"}`,
    `- promotedNotes: ${notes.length}`,
    `- memoryPath: ${repoRelative(normalizedPolicy.workspaceRoot, normalizedPolicy.paths.stabilizationMemoryPath)}`,
    "",
  ];
  if (!notes.length) {
    lines.push("No reinforced frontend quality notes have crossed the promotion threshold yet.");
    return `${lines.join("\n")}\n`;
  }
  notes.forEach((note, index) => {
    lines.push(`## ${index + 1}. ${safeString(note.noteId, 160)}`);
    if (Array.isArray(note.qualityAxes) && note.qualityAxes.length) {
      lines.push(`- qualityAxes: ${note.qualityAxes.join(", ")}`);
    }
    if (note.reinforcement) {
      lines.push(`- reinforcement: success=${note.reinforcement.successCount} failure=${note.reinforcement.failureCount} successRate=${note.reinforcement.successRate}`);
    }
    note.guidance.forEach((entry) => {
      lines.push(`- ${safeString(entry, 220)}`);
    });
    lines.push("");
  });
  return `${lines.join("\n")}\n`;
}

function updateReinforcementStatMap(target, key, outcome, turnId, nowIso) {
  const normalizedKey = safeString(key, 160);
  if (!normalizedKey) {
    return;
  }
  const current = target[normalizedKey] && typeof target[normalizedKey] === "object" ? target[normalizedKey] : {};
  const successCount = Math.max(0, Math.trunc(Number(current.successCount) || 0)) + (outcome === "success" ? 1 : 0);
  const failureCount = Math.max(0, Math.trunc(Number(current.failureCount) || 0)) + (outcome === "failure" ? 1 : 0);
  target[normalizedKey] = {
    successCount,
    failureCount,
    lastOutcome: outcome,
    lastObservedAt: nowIso,
    sampleTurnIds: uniqueStringList([
      turnId,
      ...(Array.isArray(current.sampleTurnIds) ? current.sampleTurnIds : []),
    ], 6),
  };
}

function recordOpenAIBlogLearningObservation({
  policy = loadOpenAIBlogLearningPolicy(),
  turnId = "",
  threadId = "",
  agentName = "",
  finalStatus = "",
  taskOutcomeStatus = "",
  planningContext = null,
  familyCompletionGate = null,
  externalLearning = null,
  now = new Date(),
} = {}) {
  const normalizedPolicy = normalizeOpenAIBlogLearningPolicy(policy, {
    policyPath: policy && policy.policyPath ? policy.policyPath : defaultOpenAIBlogLearningPolicyPath,
  });
  const stabilization = normalizedPolicy && normalizedPolicy.stabilization && typeof normalizedPolicy.stabilization === "object"
    ? normalizedPolicy.stabilization
    : {};
  if (!stabilization.enabled) {
    return null;
  }
  const observationTurnId = safeString(turnId, 160);
  if (!observationTurnId) {
    return null;
  }
  const learning = externalLearning && typeof externalLearning === "object" ? externalLearning : {};
  const taskFamily = safeString(
    planningContext && planningContext.selection && planningContext.selection.taskFamily
      ? planningContext.selection.taskFamily
      : planningContext && planningContext.requirementContract && planningContext.requirementContract.taskFamily
        ? planningContext.requirementContract.taskFamily
        : "",
    80
  ).toLowerCase();
  const targetFamilies = new Set(Array.isArray(stabilization.applyToTaskFamilies) ? stabilization.applyToTaskFamilies : []);
  const targetAgents = new Set(Array.isArray(stabilization.applyToAgents) ? stabilization.applyToAgents : []);
  if ((targetFamilies.size && !targetFamilies.has(taskFamily)) || (targetAgents.size && !targetAgents.has(safeString(agentName, 80)))) {
    return null;
  }
  const matchedHintIds = Array.isArray(learning.matchedHintIds) ? learning.matchedHintIds.map((entry) => safeString(entry, 160)).filter(Boolean) : [];
  const articleIds = Array.isArray(learning.articles)
    ? learning.articles.map((entry) => safeString(entry && entry.articleId, 120)).filter(Boolean)
    : (Array.isArray(learning.articleIds) ? learning.articleIds.map((entry) => safeString(entry, 120)).filter(Boolean) : []);
  const matchedTopics = Array.isArray(learning.matchedTopics) ? learning.matchedTopics.map((entry) => safeString(entry, 80).toLowerCase()).filter(Boolean) : [];
  if ((!matchedHintIds.length && !articleIds.length) || !taskFamily) {
    return null;
  }
  const finalOutcome = safeString(taskOutcomeStatus, 80).toUpperCase();
  const normalizedFinalStatus = safeString(finalStatus, 40).toLowerCase();
  const completionGateFailed = familyCompletionGate && typeof familyCompletionGate === "object"
    && safeString(familyCompletionGate.status, 80).toLowerCase() === "failed_validation";
  const outcome = normalizedFinalStatus === "completed"
    && finalOutcome === "COMPLETED"
    && !completionGateFailed
    ? "success"
    : "failure";
  const nowIso = new Date(now).toISOString();
  const memory = loadStabilizationMemory(normalizedPolicy);
  const seenTurnIds = new Set(Array.isArray(memory.seenTurnIds) ? memory.seenTurnIds.map((entry) => safeString(entry, 160)).filter(Boolean) : []);
  if (seenTurnIds.has(observationTurnId)) {
    return {
      memory,
      skipped: true,
      reason: "duplicate_turn",
    };
  }
  memory.schema = safeString(memory.schema, 120) || "learning-reinforcement-memory.v1";
  memory.generatedAt = nowIso;
  memory.lastObservedAt = nowIso;
  memory.observationCount = Math.max(0, Math.trunc(Number(memory.observationCount) || 0)) + 1;
  memory.recentObservations = [
    {
      turnId: observationTurnId,
      threadId: safeString(threadId, 160),
      agentName: safeString(agentName, 80),
      taskFamily,
      outcome,
      articleIds: articleIds.slice(0, 6),
      hintIds: matchedHintIds.slice(0, 8),
      matchedTopics: matchedTopics.slice(0, 6),
      observedAt: nowIso,
    },
    ...(Array.isArray(memory.recentObservations) ? memory.recentObservations : []),
  ].slice(0, 16);
  memory.seenTurnIds = uniqueStringList([observationTurnId, ...(Array.isArray(memory.seenTurnIds) ? memory.seenTurnIds : [])], 64);
  memory.articleStats = memory.articleStats && typeof memory.articleStats === "object" ? memory.articleStats : {};
  memory.hintStats = memory.hintStats && typeof memory.hintStats === "object" ? memory.hintStats : {};
  memory.topicStats = memory.topicStats && typeof memory.topicStats === "object" ? memory.topicStats : {};
  articleIds.forEach((articleId) => updateReinforcementStatMap(memory.articleStats, articleId, outcome, observationTurnId, nowIso));
  matchedHintIds.forEach((hintId) => updateReinforcementStatMap(memory.hintStats, hintId, outcome, observationTurnId, nowIso));
  matchedTopics.forEach((topic) => updateReinforcementStatMap(memory.topicStats, topic, outcome, observationTurnId, nowIso));
  writeJson(normalizedPolicy.paths.stabilizationMemoryPath, memory);
  const ledger = readJsonIfExists(normalizedPolicy.paths.ledgerPath);
  const digest = readJsonIfExists(normalizedPolicy.paths.digestPath);
  const selfImprovement = ledger && digest
    ? refreshSelfImprovementArtifacts({
      policy: normalizedPolicy,
      ledger,
      digest,
      now: nowIso,
    })
    : null;
  return {
    memory,
    selfImprovement,
    skipped: false,
    reason: outcome,
  };
}

function hintAppliesToRuntimeTarget(hint, { agentName = "", taskFamily = "" } = {}) {
  const normalizedAgent = safeString(agentName, 80);
  const normalizedTaskFamily = safeString(taskFamily, 80).toLowerCase();
  const targetAgents = new Set(Array.isArray(hint && hint.appliesToAgents) ? hint.appliesToAgents : []);
  const targetFamilies = new Set(Array.isArray(hint && hint.appliesToTaskFamilies) ? hint.appliesToTaskFamilies : []);
  if (targetAgents.size && normalizedAgent && !targetAgents.has(normalizedAgent)) {
    return false;
  }
  if (targetFamilies.size && normalizedTaskFamily && !targetFamilies.has(normalizedTaskFamily)) {
    return false;
  }
  return true;
}

function loadSelfImprovementState(policy) {
  const normalizedPolicy = normalizeOpenAIBlogLearningPolicy(policy, {
    policyPath: policy && policy.policyPath ? policy.policyPath : defaultOpenAIBlogLearningPolicyPath,
  });
  if (!normalizedPolicy.selfImprovement || !normalizedPolicy.selfImprovement.enabled) {
    return null;
  }
  return readJsonIfExists(normalizedPolicy.paths.selfImprovementStatePath);
}

function inferRuntimeRetrievalTopics({ prompt = "", agentName = "", planningContext = null, policy, selfImprovementState = null } = {}) {
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
  const matchedHintIds = [];
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
  const appliedHints = compileSelfImprovementRuntimeHints(selfImprovementState);
  for (const hint of appliedHints) {
    if (!hintAppliesToRuntimeTarget(hint, { agentName, taskFamily })) {
      continue;
    }
    const lexicalHit = Array.isArray(hint.lexicalTriggers)
      ? hint.lexicalTriggers.some((trigger) => trigger && lower.includes(trigger))
      : false;
    if (!lexicalHit) {
      continue;
    }
    hint.topics.forEach((topic) => addTag(topic));
    if (!matchedHintIds.includes(hint.hintId)) {
      matchedHintIds.push(hint.hintId);
    }
  }
  return {
    taskFamily: taskFamily || "deterministic_code",
    specialistOwners,
    topics: tags,
    matchedHintIds,
  };
}

function buildRuntimeLearningSelection({ prompt = "", agentName = "", planningContext = null, policy, digestOverride = null, selfImprovementState = undefined } = {}) {
  const normalizedPolicy = normalizeOpenAIBlogLearningPolicy(policy, { policyPath: policy && policy.policyPath ? policy.policyPath : defaultOpenAIBlogLearningPolicyPath });
  const runtimeRetrieval = normalizedPolicy.runtimeRetrieval || {};
  const digest = digestOverride && typeof digestOverride === "object" ? digestOverride : readJsonIfExists(normalizedPolicy.paths.digestPath);
  const resolvedSelfImprovementState = selfImprovementState === undefined
    ? loadSelfImprovementState(normalizedPolicy)
    : selfImprovementState;
  if (!runtimeRetrieval.enabled) {
    return {
      status: "disabled",
      reason: "runtime_retrieval_disabled",
      taskFamily: "",
      matchedTopics: [],
      articles: [],
      matchedHintIds: [],
    };
  }
  if (!digest || !digest.topics || typeof digest.topics !== "object") {
    return {
      status: "skipped",
      reason: "digest_missing",
      taskFamily: "",
      matchedTopics: [],
      articles: [],
      matchedHintIds: [],
    };
  }
  const inferred = inferRuntimeRetrievalTopics({
    prompt,
    agentName,
    planningContext,
    policy: normalizedPolicy,
    selfImprovementState: resolvedSelfImprovementState,
  });
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
      matchedHintIds: inferred.matchedHintIds || [],
    };
  }
  if (targetFamilies.size && inferred.taskFamily && !targetFamilies.has(inferred.taskFamily)) {
    return {
      status: "skipped",
      reason: "task_family_not_targeted",
      taskFamily: inferred.taskFamily,
      matchedTopics: inferred.topics,
      articles: [],
      matchedHintIds: inferred.matchedHintIds || [],
    };
  }
  if (!inferred.topics.length) {
    return {
      status: "skipped",
      reason: "no_topic_match",
      taskFamily: inferred.taskFamily,
      matchedTopics: [],
      articles: [],
      matchedHintIds: inferred.matchedHintIds || [],
    };
  }

  const digestTopics = digest.topics;
  const priority = Array.isArray(runtimeRetrieval.topicPriority) ? runtimeRetrieval.topicPriority : [];
  const priorityWeight = new Map(priority.map((entry, index) => [entry, Math.max(1, priority.length - index)]));
  const activeHints = compileSelfImprovementRuntimeHints(resolvedSelfImprovementState)
    .filter((hint) => hintAppliesToRuntimeTarget(hint, { agentName, taskFamily: inferred.taskFamily }));
  const topicBoosts = new Map();
  const articleBoosts = new Map();
  activeHints.forEach((hint) => {
    hint.topics.forEach((topic) => {
      topicBoosts.set(topic, (topicBoosts.get(topic) || 0) + Number(hint.topicBoost || 0));
    });
    hint.preferredArticleIds.forEach((articleId) => {
      articleBoosts.set(articleId, (articleBoosts.get(articleId) || 0) + Number(hint.articleBoost || 0));
    });
  });
  const articleById = new Map();
  inferred.topics.forEach((topic) => {
    const entries = Array.isArray(digestTopics[topic]) ? digestTopics[topic] : [];
    const topicWeight = (priorityWeight.get(topic) || 1) + (topicBoosts.get(topic) || 0);
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
      current.score += articleBoosts.get(articleId) || 0;
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
  const matchedHintIds = uniqueStringList([
    ...(Array.isArray(inferred.matchedHintIds) ? inferred.matchedHintIds : []),
    ...activeHints
      .filter((hint) => hint.topics.some((topic) => inferred.topics.includes(topic)) || hint.preferredArticleIds.some((articleId) => articles.some((entry) => entry.articleId === articleId)))
      .map((hint) => hint.hintId),
  ], 8);
  return {
    status: articles.length ? "ready" : "skipped",
    reason: articles.length ? "matched_official_articles" : "no_article_match",
    taskFamily: inferred.taskFamily,
    matchedTopics: inferred.topics,
    matchedHintIds,
    articles,
  };
}

function selectFrontendQualityNotesForRuntime({ prompt = "", selection, agentName = "", policy, selfImprovementState = null } = {}) {
  const normalizedPolicy = normalizeOpenAIBlogLearningPolicy(policy, { policyPath: policy && policy.policyPath ? policy.policyPath : defaultOpenAIBlogLearningPolicyPath });
  const stabilization = normalizedPolicy && normalizedPolicy.stabilization && typeof normalizedPolicy.stabilization === "object"
    ? normalizedPolicy.stabilization
    : {};
  if (!stabilization.enabled) {
    return [];
  }
  const matchedTopics = Array.isArray(selection && selection.matchedTopics) ? selection.matchedTopics : [];
  const matchedArticles = Array.isArray(selection && selection.articles) ? selection.articles : [];
  const lowerPrompt = safeString(prompt, 12000).toLowerCase();
  const qualityNotes = compileSelfImprovementFrontendQualityNotes(selfImprovementState);
  const applicable = qualityNotes.filter((note) => {
    if (!hintAppliesToRuntimeTarget(note, { agentName, taskFamily: selection && selection.taskFamily ? selection.taskFamily : "" })) {
      return false;
    }
    const lexicalHit = Array.isArray(note.lexicalTriggers)
      ? note.lexicalTriggers.some((trigger) => trigger && lowerPrompt.includes(trigger))
      : false;
    const topicHit = note.topics.some((topic) => matchedTopics.includes(topic));
    const articleHit = Array.isArray(note.preferredArticleIds)
      ? note.preferredArticleIds.some((articleId) => matchedArticles.some((entry) => safeString(entry && entry.articleId, 120) === articleId))
      : false;
    return lexicalHit || topicHit || articleHit;
  });
  return applicable.slice(0, Math.max(1, Number(stabilization.maxPromptNotes) || 2));
}

function buildRuntimePromptInjection({ prompt = "", agentName = "", planningContext = null, policy, selfImprovementState = undefined } = {}) {
  const normalizedPrompt = safeString(prompt, 20000);
  const normalizedPolicy = normalizeOpenAIBlogLearningPolicy(policy, { policyPath: policy && policy.policyPath ? policy.policyPath : defaultOpenAIBlogLearningPolicyPath });
  const runtimeRetrieval = normalizedPolicy.runtimeRetrieval || {};
  const resolvedSelfImprovementState = selfImprovementState === undefined
    ? loadSelfImprovementState(normalizedPolicy)
    : selfImprovementState;
  const selection = buildRuntimeLearningSelection({
    prompt: normalizedPrompt,
    agentName,
    planningContext,
    policy: normalizedPolicy,
    selfImprovementState: resolvedSelfImprovementState,
  });
  const promotedFrontendQualityNotes = selectFrontendQualityNotesForRuntime({
    prompt: normalizedPrompt,
    selection,
    agentName,
    policy: normalizedPolicy,
    selfImprovementState: resolvedSelfImprovementState,
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
    matchedHintIds: selection.matchedHintIds || [],
    matchedFrontendQualityNoteIds: promotedFrontendQualityNotes.map((entry) => safeString(entry && entry.noteId, 160)).filter(Boolean),
    articles: selection.articles || [],
    qualityNotes: promotedFrontendQualityNotes,
  };
  if (selection.status !== "ready" && !promotedFrontendQualityNotes.length) {
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
  if (promotedFrontendQualityNotes.length) {
    lines.push("Harness-stabilized frontend quality notes:");
    promotedFrontendQualityNotes.forEach((note, index) => {
      lines.push(`Q${index + 1}. ${safeString(note.noteId, 160)}`);
      note.guidance.forEach((item) => {
        lines.push(`   - ${safeString(item, 220)}`);
      });
    });
  }
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

function buildGatePlanningContext(testCase) {
  const agentName = safeString(testCase && testCase.agentName, 80);
  const taskFamily = safeString(testCase && testCase.taskFamily, 80).toLowerCase() || "deterministic_code";
  return {
    selection: {
      taskFamily,
      signals: {
        specialistOwners: agentName ? [agentName] : [],
      },
      selectedPlanningDepth: "STANDARD_PLANNING",
      selectedAssuranceDepth: "STANDARD_ASSURANCE",
    },
    dispatchPlan: {
      reviewerRequired: Array.isArray(testCase && testCase.requiredTopics) && testCase.requiredTopics.includes("evals"),
      testerRequired: Array.isArray(testCase && testCase.requiredTopics) && testCase.requiredTopics.includes("evals"),
      dispatches: agentName ? [{ ownerAgent: agentName }] : [],
    },
    requirementContract: {
      taskFamily,
    },
  };
}

function evaluateSelfImprovementCase(testCase, { policy, digest, candidateState }) {
  const prompt = safeString(testCase && testCase.prompt, 600);
  const agentName = safeString(testCase && testCase.agentName, 80);
  const planningContext = buildGatePlanningContext(testCase);
  const baseline = buildRuntimeLearningSelection({
    prompt,
    agentName,
    planningContext,
    policy,
    digestOverride: digest,
    selfImprovementState: null,
  });
  const candidate = buildRuntimeLearningSelection({
    prompt,
    agentName,
    planningContext,
    policy,
    digestOverride: digest,
    selfImprovementState: candidateState,
  });
  const baselinePromptInjection = buildRuntimePromptInjection({
    prompt,
    agentName,
    planningContext,
    policy,
    selfImprovementState: null,
  });
  const candidatePromptInjection = buildRuntimePromptInjection({
    prompt,
    agentName,
    planningContext,
    policy,
    selfImprovementState: candidateState,
  });
  const failures = [];
  const requiredTopics = Array.isArray(testCase && testCase.requiredTopics) ? testCase.requiredTopics : [];
  const forbiddenTopics = Array.isArray(testCase && testCase.forbiddenTopics) ? testCase.forbiddenTopics : [];
  requiredTopics.forEach((topic) => {
    if (!candidate.matchedTopics.includes(topic)) {
      failures.push(`missing_required_topic:${topic}`);
    }
  });
  forbiddenTopics.forEach((topic) => {
    if (candidate.matchedTopics.includes(topic)) {
      failures.push(`forbidden_topic_present:${topic}`);
    }
  });
  if (Number.isFinite(Number(testCase && testCase.maxTopics)) && candidate.matchedTopics.length > Number(testCase.maxTopics)) {
    failures.push(`topic_budget_exceeded:${candidate.matchedTopics.length}`);
  }
  if (safeString(baseline.status, 40) === "ready" && safeString(candidate.status, 40) !== "ready") {
    failures.push("baseline_ready_regressed");
  }
  const lostBaselineTopics = Array.isArray(baseline.matchedTopics)
    ? baseline.matchedTopics.filter((topic) => !candidate.matchedTopics.includes(topic))
    : [];
  if (lostBaselineTopics.length) {
    failures.push(`baseline_topics_lost:${lostBaselineTopics.join("|")}`);
  }
  const candidateFrontendQualityNoteIds = Array.isArray(candidatePromptInjection.matchedFrontendQualityNoteIds)
    ? candidatePromptInjection.matchedFrontendQualityNoteIds
    : [];
  if (safeString(testCase && testCase.taskFamily, 80).toLowerCase() !== "web_creative" && candidateFrontendQualityNoteIds.length) {
    failures.push(`frontend_note_leak:${candidateFrontendQualityNoteIds.join("|")}`);
  }
  const noteBudget = Math.max(1, Number(policy && policy.stabilization && policy.stabilization.maxPromptNotes) || 2);
  if (candidateFrontendQualityNoteIds.length > noteBudget) {
    failures.push(`frontend_note_budget_exceeded:${candidateFrontendQualityNoteIds.length}`);
  }
  return {
    caseId: safeString(testCase && testCase.caseId, 120),
    pass: failures.length === 0,
    failures,
    baseline: {
      status: safeString(baseline.status, 40),
      reason: safeString(baseline.reason, 120),
      matchedTopics: Array.isArray(baseline.matchedTopics) ? baseline.matchedTopics.slice(0, 8) : [],
      articleIds: Array.isArray(baseline.articles) ? baseline.articles.map((entry) => safeString(entry && entry.articleId, 120)).filter(Boolean).slice(0, 6) : [],
      matchedFrontendQualityNoteIds: Array.isArray(baselinePromptInjection.matchedFrontendQualityNoteIds)
        ? baselinePromptInjection.matchedFrontendQualityNoteIds.slice(0, 6)
        : [],
    },
    candidate: {
      status: safeString(candidate.status, 40),
      reason: safeString(candidate.reason, 120),
      matchedTopics: Array.isArray(candidate.matchedTopics) ? candidate.matchedTopics.slice(0, 8) : [],
      matchedHintIds: Array.isArray(candidate.matchedHintIds) ? candidate.matchedHintIds.slice(0, 8) : [],
      matchedFrontendQualityNoteIds: candidateFrontendQualityNoteIds.slice(0, 6),
      articleIds: Array.isArray(candidate.articles) ? candidate.articles.map((entry) => safeString(entry && entry.articleId, 120)).filter(Boolean).slice(0, 6) : [],
      promptBlockChars: Number.isFinite(Number(candidatePromptInjection.promptBlockChars))
        ? Math.max(0, Math.trunc(Number(candidatePromptInjection.promptBlockChars)))
        : 0,
    },
  };
}

function buildCandidateSelfImprovementState({ policy, promotionPolicy, proposals, reinforcementMemory = null, nowIso }) {
  const autoApplyCandidates = [];
  const proposalOnly = [];
  const blocked = [];
  const reinforcedFrontendNotes = [];
  const reinforcement = reinforcementMemory && typeof reinforcementMemory === "object" ? reinforcementMemory : {};
  const articleStats = reinforcement.articleStats && typeof reinforcement.articleStats === "object" ? reinforcement.articleStats : {};
  const requiredSuccesses = Math.max(1, Number(policy && policy.stabilization && policy.stabilization.minSuccessfulTurnsForPromotion) || 2);
  const requiredSuccessRate = Math.max(0.5, Number(policy && policy.stabilization && policy.stabilization.minSuccessRate) || 0.67);
  for (const proposal of Array.isArray(proposals) ? proposals : []) {
    const decision = safeString(proposal && proposal.promotion && proposal.promotion.decision, 40);
    if (decision === "blocked") {
      blocked.push(proposal);
      continue;
    }
    const hasRuntimeHint = Boolean(proposal && proposal.candidateChange && proposal.candidateChange.runtimeRetrievalHint);
    const hasFrontendQualityNote = Boolean(proposal && proposal.candidateChange && proposal.candidateChange.frontendQualityNote);
    const stats = articleStats[safeString(proposal && proposal.articleId, 120)] || {};
    const successCount = Math.max(0, Math.trunc(Number(stats.successCount) || 0));
    const failureCount = Math.max(0, Math.trunc(Number(stats.failureCount) || 0));
    const total = successCount + failureCount;
    const successRate = total > 0 ? successCount / total : 0;
    const frontendEligible = hasFrontendQualityNote
      && successCount >= requiredSuccesses
      && successRate >= requiredSuccessRate;
    if (decision === "auto_apply_candidate" && hasRuntimeHint) {
      autoApplyCandidates.push(proposal);
    }
    if (decision === "auto_apply_candidate" && frontendEligible) {
      reinforcedFrontendNotes.push({
        proposalId: safeString(proposal && proposal.proposalId, 160),
        articleId: safeString(proposal && proposal.articleId, 120),
        title: safeString(proposal && proposal.title, 200),
        frontendQualityNote: proposal.candidateChange.frontendQualityNote,
        reinforcement: {
          successCount,
          failureCount,
          successRate: Number(successRate.toFixed(4)),
        },
      });
    }
    if (!(decision === "auto_apply_candidate" && (hasRuntimeHint || frontendEligible))) {
      proposalOnly.push(proposal);
    }
  }
  const maxAutoApply = Math.max(
    1,
    Math.min(
      Number(policy && policy.selfImprovement && policy.selfImprovement.maxAppliedHints) || 12,
      Number(promotionPolicy && promotionPolicy.autoApply && promotionPolicy.autoApply.maxAutoApplyPerLane) || 12
    )
  );
  const candidateHints = autoApplyCandidates.slice(0, maxAutoApply).map((proposal) => ({
    proposalId: safeString(proposal && proposal.proposalId, 160),
    articleId: safeString(proposal && proposal.articleId, 120),
    title: safeString(proposal && proposal.title, 200),
    runtimeRetrievalHint: proposal && proposal.candidateChange ? proposal.candidateChange.runtimeRetrievalHint : null,
  })).filter((entry) => entry.runtimeRetrievalHint);
  return {
    schema: safeString(policy && policy.selfImprovement && policy.selfImprovement.stateSchema, 120) || "self-improvement-state.v1",
    generatedAt: nowIso,
    sourceName: safeString(policy && policy.source && policy.source.name, 120),
    sourceTier: safeString(policy && policy.source && policy.source.tier, 40) || "primary",
    autoApplyCandidateCount: autoApplyCandidates.length,
    autoApplyFrontendQualityNoteCount: reinforcedFrontendNotes.length,
    proposalOnlyCount: proposalOnly.length,
    blockedCount: blocked.length,
    candidateHints,
    candidateFrontendQualityNotes: reinforcedFrontendNotes.slice(
      0,
      Math.max(1, Number(policy && policy.stabilization && policy.stabilization.maxPromotedNotes) || 4)
    ),
    proposalSummaries: (Array.isArray(proposals) ? proposals : []).map((proposal) => ({
      proposalId: safeString(proposal && proposal.proposalId, 160),
      articleId: safeString(proposal && proposal.articleId, 120),
      title: safeString(proposal && proposal.title, 200),
      changeClass: safeString(proposal && proposal.changeClass, 120),
      target: safeString(proposal && proposal.target, 260),
      decision: safeString(proposal && proposal.promotion && proposal.promotion.decision, 40),
    })),
  };
}

function evaluateSelfImprovementGate({ policy, promotionPolicy, digest, candidateState, nowIso }) {
  const cases = Array.isArray(promotionPolicy && promotionPolicy.evalGate && promotionPolicy.evalGate.cases)
    ? promotionPolicy.evalGate.cases
    : [];
  if (!candidateState || !Array.isArray(candidateState.candidateHints) || !candidateState.candidateHints.length) {
    return {
      schema: safeString(policy && policy.selfImprovement && policy.selfImprovement.gateSchema, 120) || "self-improvement-eval-gate.v1",
      generatedAt: nowIso,
      status: "PASS",
      reason: "no_auto_apply_candidates",
      passedCount: cases.length,
      failedCount: 0,
      failedCaseIds: [],
      results: cases.map((entry) => ({
        caseId: safeString(entry && entry.caseId, 120),
        pass: true,
        failures: [],
        baseline: { status: "skipped", reason: "no_auto_apply_candidates", matchedTopics: [], articleIds: [] },
        candidate: { status: "skipped", reason: "no_auto_apply_candidates", matchedTopics: [], matchedHintIds: [], articleIds: [] },
      })),
    };
  }
  const results = cases.map((entry) => evaluateSelfImprovementCase(entry, { policy, digest, candidateState }));
  const failed = results.filter((entry) => !entry.pass);
  return {
    schema: safeString(policy && policy.selfImprovement && policy.selfImprovement.gateSchema, 120) || "self-improvement-eval-gate.v1",
    generatedAt: nowIso,
    status: failed.length ? "FAIL" : "PASS",
    reason: failed.length ? "non_regression_failed" : "all_cases_passed",
    passedCount: results.length - failed.length,
    failedCount: failed.length,
    failedCaseIds: failed.map((entry) => safeString(entry && entry.caseId, 120)).filter(Boolean),
    results,
  };
}

function buildAppliedSelfImprovementState({ policy, promotionPolicy, candidateState, gate, previousState, nowIso }) {
  const previous = previousState && typeof previousState === "object" ? previousState : {};
  const previousAppliedHints = Array.isArray(previous.appliedHints) ? previous.appliedHints : [];
  const previousAppliedFrontendQualityNotes = Array.isArray(previous.appliedFrontendQualityNotes) ? previous.appliedFrontendQualityNotes : [];
  let appliedHints = [];
  let appliedFrontendQualityNotes = [];
  let appliedDecision = "none";
  if (safeString(gate && gate.status, 20) === "PASS" && Array.isArray(candidateState && candidateState.candidateHints) && candidateState.candidateHints.length) {
    appliedHints = candidateState.candidateHints;
    appliedDecision = "applied";
    appliedFrontendQualityNotes = Array.isArray(candidateState && candidateState.candidateFrontendQualityNotes)
      ? candidateState.candidateFrontendQualityNotes
      : [];
  } else if (
    safeString(previous && previous.gateStatus, 20) === "PASS"
    && (previousAppliedHints.length || previousAppliedFrontendQualityNotes.length)
  ) {
    appliedHints = previousAppliedHints;
    appliedFrontendQualityNotes = previousAppliedFrontendQualityNotes;
    appliedDecision = "retained_previous_pass";
  }
  return {
    schema: safeString(policy && policy.selfImprovement && policy.selfImprovement.stateSchema, 120) || "self-improvement-state.v1",
    generatedAt: nowIso,
    sourceName: safeString(policy && policy.source && policy.source.name, 120),
    sourceTier: safeString(policy && policy.source && policy.source.tier, 40) || "primary",
    promotionMode: safeString(promotionPolicy && promotionPolicy.mode, 80) || "machine_guarded_autonomy",
    gateStatus: safeString(gate && gate.status, 20) || "FAIL",
    gateReason: safeString(gate && gate.reason, 120) || "",
    appliedDecision,
    appliedHintCount: appliedHints.length,
    appliedFrontendQualityNoteCount: appliedFrontendQualityNotes.length,
    appliedHintIds: appliedHints.map((entry) => safeString(entry && entry.runtimeRetrievalHint && entry.runtimeRetrievalHint.hintId, 160)).filter(Boolean),
    appliedFrontendQualityNoteIds: appliedFrontendQualityNotes.map((entry) => safeString(entry && entry.frontendQualityNote && entry.frontendQualityNote.noteId, 160)).filter(Boolean),
    autoApplyCandidateCount: Number(candidateState && candidateState.autoApplyCandidateCount) || 0,
    autoApplyFrontendQualityNoteCount: Number(candidateState && candidateState.autoApplyFrontendQualityNoteCount) || 0,
    proposalOnlyCount: Number(candidateState && candidateState.proposalOnlyCount) || 0,
    blockedCount: Number(candidateState && candidateState.blockedCount) || 0,
    failedCaseIds: Array.isArray(gate && gate.failedCaseIds) ? gate.failedCaseIds.slice(0, 8) : [],
    promotionPolicyPath: repoRelative(policy.workspaceRoot, policy.selfImprovement.promotionPolicyPath),
    statePath: repoRelative(policy.workspaceRoot, policy.paths.selfImprovementStatePath),
    gatePath: repoRelative(policy.workspaceRoot, policy.paths.selfImprovementGatePath),
    proposalDir: repoRelative(policy.workspaceRoot, policy.paths.selfImprovementProposalDir),
    appliedHints,
    appliedFrontendQualityNotes,
    proposalSummaries: Array.isArray(candidateState && candidateState.proposalSummaries) ? candidateState.proposalSummaries.slice(0, 16) : [],
  };
}

function refreshSelfImprovementArtifacts({ policy, ledger = null, digest = null, now = new Date() } = {}) {
  const normalizedPolicy = normalizeOpenAIBlogLearningPolicy(policy, {
    policyPath: policy && policy.policyPath ? policy.policyPath : defaultOpenAIBlogLearningPolicyPath,
  });
  if (!normalizedPolicy.selfImprovement || !normalizedPolicy.selfImprovement.enabled) {
    return null;
  }
  const nowIso = new Date(now).toISOString();
  const resolvedLedger = ledger && typeof ledger === "object" ? ledger : readJsonIfExists(normalizedPolicy.paths.ledgerPath);
  const resolvedDigest = digest && typeof digest === "object" ? digest : readJsonIfExists(normalizedPolicy.paths.digestPath);
  if (!resolvedLedger || !Array.isArray(resolvedLedger.articles) || !resolvedDigest || typeof resolvedDigest.topics !== "object") {
    throw new Error("learning artifacts missing before self-improvement refresh");
  }
  const promotionInfo = loadSelfImprovementPromotionPolicy(normalizedPolicy);
  const promotionPolicy = promotionInfo.policy;
  const previousState = readJsonIfExists(normalizedPolicy.paths.selfImprovementStatePath) || {};
  const reinforcementMemory = loadStabilizationMemory(normalizedPolicy);
  const proposals = resolvedLedger.articles.map((article) => buildSelfImprovementProposal(article, normalizedPolicy, promotionPolicy, nowIso));
  const writtenProposalPaths = new Set();
  proposals.forEach((proposal) => {
    const proposalPath = path.join(normalizedPolicy.paths.selfImprovementProposalDir, `${safeString(proposal && proposal.articleId, 120)}.json`);
    writeJson(proposalPath, proposal);
    writtenProposalPaths.add(path.normalize(proposalPath));
  });
  if (fs.existsSync(normalizedPolicy.paths.selfImprovementProposalDir)) {
    for (const entry of fs.readdirSync(normalizedPolicy.paths.selfImprovementProposalDir, { withFileTypes: true })) {
      if (!entry.isFile() || !/\.json$/i.test(entry.name)) {
        continue;
      }
      const filePath = path.join(normalizedPolicy.paths.selfImprovementProposalDir, entry.name);
      if (writtenProposalPaths.has(path.normalize(filePath))) {
        continue;
      }
      try {
        fs.unlinkSync(filePath);
      } catch {
        // Ignore cleanup failures.
      }
    }
  }
  const candidateState = buildCandidateSelfImprovementState({
    policy: normalizedPolicy,
    promotionPolicy,
    proposals,
    reinforcementMemory,
    nowIso,
  });
  const gate = evaluateSelfImprovementGate({
    policy: normalizedPolicy,
    promotionPolicy,
    digest: resolvedDigest,
    candidateState,
    nowIso,
  });
  const state = buildAppliedSelfImprovementState({
    policy: normalizedPolicy,
    promotionPolicy,
    candidateState,
    gate,
    previousState,
    nowIso,
  });
  writeJson(normalizedPolicy.paths.selfImprovementGatePath, gate);
  writeJson(normalizedPolicy.paths.selfImprovementStatePath, state);
  writeJson(normalizedPolicy.paths.stabilizationMemoryPath, reinforcementMemory);
  writeText(
    normalizedPolicy.paths.stabilizationPlaybookPath,
    buildFrontendQualityPlaybook({
      policy: normalizedPolicy,
      selfImprovementState: state,
      reinforcementMemory,
    })
  );
  return {
    proposals,
    gate,
    state,
    reinforcementMemory,
    promotionPolicy,
    paths: {
      proposalDir: repoRelative(normalizedPolicy.workspaceRoot, normalizedPolicy.paths.selfImprovementProposalDir),
      statePath: repoRelative(normalizedPolicy.workspaceRoot, normalizedPolicy.paths.selfImprovementStatePath),
      gatePath: repoRelative(normalizedPolicy.workspaceRoot, normalizedPolicy.paths.selfImprovementGatePath),
      promotionPolicyPath: repoRelative(normalizedPolicy.workspaceRoot, promotionInfo.path),
      stabilizationMemoryPath: repoRelative(normalizedPolicy.workspaceRoot, normalizedPolicy.paths.stabilizationMemoryPath),
      stabilizationPlaybookPath: repoRelative(normalizedPolicy.workspaceRoot, normalizedPolicy.paths.stabilizationPlaybookPath),
    },
  };
}

function buildRuntimeSnapshotFromArtifacts(policy, runtimeState = {}) {
  const ledger = readJsonIfExists(policy.paths.ledgerPath) || {};
  const digest = readJsonIfExists(policy.paths.digestPath) || {};
  const selfImprovementState = readJsonIfExists(policy.paths.selfImprovementStatePath) || {};
  const selfImprovementGate = readJsonIfExists(policy.paths.selfImprovementGatePath) || {};
  const reinforcementMemory = readJsonIfExists(policy.paths.stabilizationMemoryPath) || {};
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
    schema: safeString(policy && policy.artifacts && policy.artifacts.runtimeSchema, 120) || "openai-blog-learning-runtime.v1",
    enabled: Boolean(runtimeState.enabled),
    running: Boolean(runtimeState.running),
    mode: safeString(policy && policy.governance && policy.governance.mode, 80) || "observe_propose_and_doc_sync",
    sourceName: safeString(policy && policy.source && policy.source.name, 120) || "OpenAI Developers Blog",
    sourceUrl: safeString(policy && policy.source && policy.source.indexUrl, 260),
    sourceTier: safeString(policy && policy.source && policy.source.tier, 40) || "primary",
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
    portabilityMode: policy && policy.filters && policy.filters.requirePortablePrinciples ? "portable_principles_only" : "all_articles",
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
      lastHintIds: Array.isArray(runtimeState.lastRetrievalHintIds) ? runtimeState.lastRetrievalHintIds.slice(0, 8) : [],
      lastPromptBlockChars: Number(runtimeState.lastRetrievalPromptBlockChars) || 0,
    },
    selfImprovement: {
      enabled: Boolean(runtimeState.enabled) && Boolean(policy && policy.selfImprovement && policy.selfImprovement.enabled),
      promotionMode: safeString(selfImprovementState && selfImprovementState.promotionMode, 80) || "machine_guarded_autonomy",
      gateStatus: safeString(selfImprovementState && selfImprovementState.gateStatus, 20) || safeString(selfImprovementGate && selfImprovementGate.status, 20) || "NOT_RUN",
      gateReason: safeString(selfImprovementState && selfImprovementState.gateReason, 120) || safeString(selfImprovementGate && selfImprovementGate.reason, 120),
      appliedDecision: safeString(selfImprovementState && selfImprovementState.appliedDecision, 40) || "none",
      appliedHintCount: Number(selfImprovementState && selfImprovementState.appliedHintCount) || 0,
      autoApplyCandidateCount: Number(selfImprovementState && selfImprovementState.autoApplyCandidateCount) || 0,
      proposalOnlyCount: Number(selfImprovementState && selfImprovementState.proposalOnlyCount) || 0,
      blockedCount: Number(selfImprovementState && selfImprovementState.blockedCount) || 0,
      failedCaseIds: Array.isArray(selfImprovementState && selfImprovementState.failedCaseIds)
        ? selfImprovementState.failedCaseIds.slice(0, 8)
        : (Array.isArray(selfImprovementGate && selfImprovementGate.failedCaseIds) ? selfImprovementGate.failedCaseIds.slice(0, 8) : []),
      appliedHintIds: Array.isArray(selfImprovementState && selfImprovementState.appliedHintIds) ? selfImprovementState.appliedHintIds.slice(0, 8) : [],
      proposalDir: repoRelative(policy.workspaceRoot, policy.paths.selfImprovementProposalDir),
      statePath: repoRelative(policy.workspaceRoot, policy.paths.selfImprovementStatePath),
      gatePath: repoRelative(policy.workspaceRoot, policy.paths.selfImprovementGatePath),
      promotionPolicyPath: policy && policy.selfImprovement && policy.selfImprovement.promotionPolicyPath
        ? repoRelative(policy.workspaceRoot, policy.selfImprovement.promotionPolicyPath)
        : repoRelative(policy.workspaceRoot, defaultSelfImprovementPromotionPolicyPath),
      appliedFrontendQualityNoteCount: Number(selfImprovementState && selfImprovementState.appliedFrontendQualityNoteCount) || 0,
      appliedFrontendQualityNoteIds: Array.isArray(selfImprovementState && selfImprovementState.appliedFrontendQualityNoteIds)
        ? selfImprovementState.appliedFrontendQualityNoteIds.slice(0, 8)
        : [],
      playbookPath: repoRelative(policy.workspaceRoot, policy.paths.stabilizationPlaybookPath),
      reinforcementMemoryPath: repoRelative(policy.workspaceRoot, policy.paths.stabilizationMemoryPath),
      lastObservedAt: safeString(reinforcementMemory && reinforcementMemory.lastObservedAt, 40),
      observationCount: Math.max(0, Math.trunc(Number(reinforcementMemory && reinforcementMemory.observationCount) || 0)),
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
    userAgent: normalizedPolicy.source.userAgent,
  });
  const cards = parseIndexCards(indexHtml, normalizedPolicy.source.indexUrl).slice(0, normalizedPolicy.cadence.maxArticlesPerRun);
  const nextArticles = [];
  const proposalSummaries = [];
  const writtenProposalPaths = new Set();
  let newArticlesThisRun = 0;
  let promotedDocUpdates = 0;
  let blockedTargets = 0;
  for (const card of cards) {
    const articleHtml = await fetchText(card.url, {
      timeoutMs: normalizedPolicy.cadence.requestTimeoutMs,
      allowedHosts: normalizedPolicy.source.allowedHosts,
      userAgent: normalizedPolicy.source.userAgent,
    });
    const insights = extractArticleInsights(articleHtml, normalizedPolicy.cadence.maxGuidanceItemsPerArticle);
    const topicTags = classifyTopics({
      title: insights.title || card.title,
      description: selectArticleSummary({
        title: insights.title || card.title,
        sourceName: normalizedPolicy.source.name,
        metaDescription: insights.description,
        heroSummary: insights.heroSummary,
        cardDescription: card.description,
        paragraphs: insights.paragraphs,
      }) || card.description,
      topicLabel: card.topicLabel,
      headings: insights.headings,
      listItems: insights.listItems,
      paragraphs: insights.paragraphs,
    });
    const relevance = deriveRelevance(topicTags);
    const summary = selectArticleSummary({
      title: insights.title || card.title,
      sourceName: normalizedPolicy.source.name,
      metaDescription: insights.description,
      heroSummary: insights.heroSummary,
      cardDescription: card.description,
      paragraphs: insights.paragraphs,
    });
    const article = {
      schema: safeString(normalizedPolicy && normalizedPolicy.artifacts && normalizedPolicy.artifacts.articleSchema, 120) || "openai-blog-learning-article.v1",
      articleId: card.articleId,
      url: normalizeUrl(card.url),
      canonicalUrl: normalizeUrl(insights.canonicalUrl) || normalizeUrl(card.url),
      title: safeString(insights.title || card.title, 200),
      description: safeString(summary || card.description || insights.description, 320),
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
      portability: derivePortability({
        title: insights.title || card.title,
        description: insights.description || card.description,
        headings: insights.headings,
        listItems: insights.listItems,
        paragraphs: insights.paragraphs,
      }, normalizedPolicy),
      promotedToDocs: [],
      proposalIds: [],
    };
    article.guidance = filterGuidanceForPortability(article.guidance, normalizedPolicy).slice(0, normalizedPolicy.cadence.maxGuidanceItemsPerArticle);
    if (shouldSkipLearningArticle(article, normalizedPolicy)) {
      continue;
    }
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
    const proposalPath = path.join(normalizedPolicy.paths.proposalDir, `${article.articleId}.json`);
    writeJson(proposalPath, proposal);
    writtenProposalPaths.add(path.normalize(proposalPath));
    nextArticles.push(article);
  }
  if (fs.existsSync(normalizedPolicy.paths.proposalDir)) {
    for (const entry of fs.readdirSync(normalizedPolicy.paths.proposalDir, { withFileTypes: true })) {
      if (!entry.isFile() || !/\.json$/i.test(entry.name)) {
        continue;
      }
      const proposalPath = path.join(normalizedPolicy.paths.proposalDir, entry.name);
      if (writtenProposalPaths.has(path.normalize(proposalPath))) {
        continue;
      }
      try {
        fs.unlinkSync(proposalPath);
      } catch {
        // Ignore proposal cleanup failures; the next cycle can retry.
      }
    }
  }
  const digest = {
    schema: safeString(normalizedPolicy && normalizedPolicy.artifacts && normalizedPolicy.artifacts.digestSchema, 120) || "openai-blog-learning-digest.v1",
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
    schema: safeString(normalizedPolicy && normalizedPolicy.artifacts && normalizedPolicy.artifacts.ledgerSchema, 120) || "openai-blog-learning-ledger.v1",
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
  const selfImprovement = refreshSelfImprovementArtifacts({
    policy: normalizedPolicy,
    ledger,
    digest,
    now: nowIso,
  });
  writeText(normalizedPolicy.paths.curatedDocPath, buildCuratedDoc(digest, normalizedPolicy));
  const report = {
    title: safeString(normalizedPolicy && normalizedPolicy.presentation && normalizedPolicy.presentation.reportTitle, 120) || "OPENAI_BLOG_LEARNING_REPORT",
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
      selfImprovementProposalDir: selfImprovement && selfImprovement.paths ? selfImprovement.paths.proposalDir : repoRelative(normalizedPolicy.workspaceRoot, normalizedPolicy.paths.selfImprovementProposalDir),
      selfImprovementStatePath: selfImprovement && selfImprovement.paths ? selfImprovement.paths.statePath : repoRelative(normalizedPolicy.workspaceRoot, normalizedPolicy.paths.selfImprovementStatePath),
      selfImprovementGatePath: selfImprovement && selfImprovement.paths ? selfImprovement.paths.gatePath : repoRelative(normalizedPolicy.workspaceRoot, normalizedPolicy.paths.selfImprovementGatePath),
    },
    selfImprovement: selfImprovement && selfImprovement.state
      ? {
        gateStatus: safeString(selfImprovement.state.gateStatus, 20),
        appliedDecision: safeString(selfImprovement.state.appliedDecision, 40),
        appliedHintCount: Number(selfImprovement.state.appliedHintCount) || 0,
        appliedFrontendQualityNoteCount: Number(selfImprovement.state.appliedFrontendQualityNoteCount) || 0,
        proposalOnlyCount: Number(selfImprovement.state.proposalOnlyCount) || 0,
        blockedCount: Number(selfImprovement.state.blockedCount) || 0,
      }
      : null,
  };
  writeText(normalizedPolicy.paths.reportPath, buildMarkdownReport(report));
  return {
    policy: normalizedPolicy,
    ledger,
    digest,
    report,
    selfImprovement,
  };
}

module.exports = {
  buildCandidateSelfImprovementState,
  buildAppliedSelfImprovementState,
  buildFrontendQualityPlaybook,
  evaluateSelfImprovementGate,
  buildRuntimeLearningSelection,
  buildRuntimePromptInjection,
  recordOpenAIBlogLearningObservation,
  defaultOpenAIBlogLearningPolicyPath,
  defaultSelfImprovementPromotionPolicyPath,
  loadOpenAIBlogLearningPolicy,
  loadSelfImprovementPromotionPolicy,
  normalizeOpenAIBlogLearningPolicy,
  parseIndexCards,
  extractArticleInsights,
  buildRuntimeSnapshotFromArtifacts,
  refreshSelfImprovementArtifacts,
  runOpenAIBlogLearningCycle,
  httpFetchText,
};
