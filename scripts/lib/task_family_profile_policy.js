"use strict";

const fs = require("fs");
const path = require("path");

const allowedPlanningModes = Object.freeze(["FAST", "NORMAL", "DISCOVERY"]);
const defaultTaskFamilyProfilesPath = path.join(__dirname, "..", "config", "task_family_profiles.json");

const defaultTaskFamilyProfilesDefinition = Object.freeze({
  schema: "task-family-profiles.v2",
  version: "2026-03-30.r2",
  defaultFamily: "deterministic_code",
  families: [
    {
      id: "deterministic_code",
      label: "Deterministic Code",
      objective: "correctness_first",
      minimumPlanningMode: "FAST",
      ambiguityHandling: "bounded_assumption",
      completionContract: "task_outcome_default",
      keywords: ["fix", "bug", "implement", "refactor", "api", "test", "server.js", "scripts/", "repo"],
      sources: ["api_exec", "batch"],
    },
    {
      id: "coding",
      label: "Coding",
      objective: "correctness_first",
      minimumPlanningMode: "FAST",
      ambiguityHandling: "bounded_assumption",
      completionContract: "task_outcome_default",
      keywords: ["coding", "code", "patch", "implement", "repair", "feature", "test"],
      sources: ["api_exec", "batch"],
    },
    {
      id: "web_creative",
      label: "Web Creative",
      objective: "wow_first",
      minimumPlanningMode: "NORMAL",
      ambiguityHandling: "expand_with_directions",
      completionContract: "design_acceptance",
      keywords: ["website", "landing", "visual", "brand", "design", "ui", "ux", "quality", "premium", "creative", "frontend", "page"],
      sources: ["web_ui"],
    },
    {
      id: "research_analysis",
      label: "Research Analysis",
      objective: "coverage_and_insight",
      minimumPlanningMode: "NORMAL",
      ambiguityHandling: "compare_hypotheses",
      completionContract: "task_outcome_default",
      keywords: ["research", "analysis", "investigate", "compare", "survey", "sources"],
      sources: [],
    },
    {
      id: "research",
      label: "Research",
      objective: "coverage_and_insight",
      minimumPlanningMode: "NORMAL",
      ambiguityHandling: "compare_hypotheses",
      completionContract: "task_outcome_default",
      keywords: ["research", "source", "evidence", "survey", "citation", "benchmark"],
      sources: ["web_search"],
    },
    {
      id: "planning_design",
      label: "Planning Design",
      objective: "decision_support",
      minimumPlanningMode: "NORMAL",
      ambiguityHandling: "surface_decisions",
      completionContract: "task_outcome_default",
      keywords: ["plan", "planning", "architecture", "spec", "requirements", "proposal", "roadmap"],
      sources: [],
    },
    {
      id: "planning",
      label: "Planning",
      objective: "decision_support",
      minimumPlanningMode: "NORMAL",
      ambiguityHandling: "surface_decisions",
      completionContract: "task_outcome_default",
      keywords: ["plan", "milestone", "acceptance", "roadmap", "decision", "handoff"],
      sources: [],
    },
    {
      id: "analysis",
      label: "Analysis",
      objective: "coverage_and_insight",
      minimumPlanningMode: "NORMAL",
      ambiguityHandling: "compare_hypotheses",
      completionContract: "task_outcome_default",
      keywords: ["analyze", "analysis", "classify", "derive", "explain", "trend"],
      sources: [],
    },
    {
      id: "business_ops",
      label: "Business Ops",
      objective: "operator_ready_output",
      minimumPlanningMode: "NORMAL",
      ambiguityHandling: "surface_decisions",
      completionContract: "task_outcome_default",
      keywords: ["handoff", "ops", "report", "weekly", "status", "operator", "runbook"],
      sources: [],
    },
    {
      id: "multimodal_docs",
      label: "Multimodal Docs",
      objective: "artifact_fidelity",
      minimumPlanningMode: "NORMAL",
      ambiguityHandling: "bounded_assumption",
      completionContract: "task_outcome_default",
      keywords: ["pdf", "document", "docs", "layout", "render", "extract", "multimodal"],
      sources: ["pdf"],
    },
    {
      id: "spreadsheets_structured_artifacts",
      label: "Spreadsheets & Structured Artifacts",
      objective: "artifact_fidelity",
      minimumPlanningMode: "NORMAL",
      ambiguityHandling: "bounded_assumption",
      completionContract: "task_outcome_default",
      keywords: ["spreadsheet", "xlsx", "csv", "table", "sheet", "structured artifact", "formula"],
      sources: ["spreadsheet"],
    },
    {
      id: "web_tool_use",
      label: "Web Tool Use",
      objective: "bounded_interaction",
      minimumPlanningMode: "NORMAL",
      ambiguityHandling: "bounded_assumption",
      completionContract: "task_outcome_default",
      keywords: ["browser", "web tool", "navigate", "form", "click", "playwright", "website"],
      sources: ["web_search", "playwright"],
    },
    {
      id: "debugging_incident_response",
      label: "Debugging Incident Response",
      objective: "fault_isolation",
      minimumPlanningMode: "NORMAL",
      ambiguityHandling: "compare_hypotheses",
      completionContract: "task_outcome_default",
      keywords: ["incident", "debug", "outage", "root cause", "rollback", "failure", "regression"],
      sources: ["api_exec", "batch"],
    },
    {
      id: "tool_learning_or_new_tool_adoption",
      label: "Tool Learning / New Tool Adoption",
      objective: "safe_tool_adoption",
      minimumPlanningMode: "DISCOVERY",
      ambiguityHandling: "surface_decisions",
      completionContract: "task_outcome_default",
      keywords: ["new tool", "tool learning", "tool adoption", "wrapper", "schema", "capability"],
      sources: [],
    },
  ],
});

function safeString(value, max = 2000) {
  if (typeof value !== "string") return "";
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, max) : "";
}

function uniqueStrings(values, max = 24) {
  const out = [];
  for (const entry of Array.isArray(values) ? values : []) {
    const text = safeString(entry, 160).toLowerCase();
    if (!text || out.includes(text)) continue;
    out.push(text);
    if (out.length >= max) break;
  }
  return out;
}

function escapeRegExp(value) {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizePlanningMode(value, fallback = "NORMAL") {
  const normalized = safeString(value, 40).toUpperCase();
  if (allowedPlanningModes.includes(normalized)) return normalized;
  return allowedPlanningModes.includes(fallback) ? fallback : "NORMAL";
}

function normalizeFamilyEntry(value) {
  const source = value && typeof value === "object" ? value : {};
  const id = safeString(source.id, 80).toLowerCase().replace(/[\s-]+/g, "_");
  if (!id) return null;
  return Object.freeze({
    id,
    label: safeString(source.label, 120) || id,
    objective: safeString(source.objective, 80) || "task_outcome_default",
    minimumPlanningMode: normalizePlanningMode(source.minimumPlanningMode, "NORMAL"),
    ambiguityHandling: safeString(source.ambiguityHandling, 80) || "bounded_assumption",
    completionContract: safeString(source.completionContract, 80) || "task_outcome_default",
    keywords: uniqueStrings(source.keywords, 32),
    sources: uniqueStrings(source.sources, 8),
  });
}

function normalizeTaskFamilyProfilesContract(input) {
  const payload = input && typeof input === "object" ? input : {};
  const fallback = defaultTaskFamilyProfilesDefinition;
  const normalizedFamilies = [];
  const seen = new Set();
  for (const entry of Array.isArray(payload.families) ? payload.families : fallback.families) {
    const normalized = normalizeFamilyEntry(entry);
    if (!normalized || seen.has(normalized.id)) continue;
    seen.add(normalized.id);
    normalizedFamilies.push(normalized);
  }
  if (!normalizedFamilies.some((entry) => entry.id === fallback.defaultFamily)) {
    normalizedFamilies.unshift(normalizeFamilyEntry(fallback.families[0]));
  }
  const defaultFamily = safeString(payload.defaultFamily, 80).toLowerCase().replace(/[\s-]+/g, "_") || fallback.defaultFamily;
  const effectiveDefault = normalizedFamilies.some((entry) => entry.id === defaultFamily) ? defaultFamily : fallback.defaultFamily;
  return Object.freeze({
    schema: safeString(payload.schema, 120) || fallback.schema,
    version: safeString(payload.version, 120) || fallback.version,
    defaultFamily: effectiveDefault,
    families: Object.freeze(normalizedFamilies),
  });
}

function loadTaskFamilyProfilesContract(filePath = defaultTaskFamilyProfilesPath) {
  const raw = fs.readFileSync(path.resolve(filePath), "utf8");
  return normalizeTaskFamilyProfilesContract(raw ? JSON.parse(raw) : {});
}

function countKeywordMatches(text, keywords) {
  let score = 0;
  const hits = [];
  const haystack = safeString(text, 40000).toLowerCase();
  for (const keyword of Array.isArray(keywords) ? keywords : []) {
    const needle = safeString(keyword, 120).toLowerCase();
    if (!needle || !haystack.includes(needle)) continue;
    if (needle.length <= 2 && /^[a-z0-9]+$/.test(needle)) {
      const bounded = new RegExp(`\\b${escapeRegExp(needle)}\\b`, "i");
      if (!bounded.test(haystack)) continue;
    }
    score += needle.includes(" ") ? 2 : 1;
    hits.push(needle);
  }
  return { score, hits };
}

function selectTaskFamilyProfile({ prompt = "", options = {}, contract } = {}) {
  const normalizedContract = normalizeTaskFamilyProfilesContract(contract);
  const executionSource = safeString(options && options.executionSource, 80).toLowerCase();
  let best = null;
  for (const family of normalizedContract.families) {
    const keywordMatches = countKeywordMatches(prompt, family.keywords);
    const sourceMatched = executionSource && family.sources.includes(executionSource);
    const score = keywordMatches.score + (sourceMatched ? 1 : 0);
    const candidate = {
      family,
      score,
      sourceMatched,
      keywordHits: keywordMatches.hits,
    };
    if (!best || candidate.score > best.score) {
      best = candidate;
      continue;
    }
    if (candidate.score === best.score && candidate.score > 0) {
      if (sourceMatched && !best.sourceMatched) {
        best = candidate;
        continue;
      }
      if (candidate.keywordHits.length > best.keywordHits.length) best = candidate;
    }
  }
  const selectedFamily = best && best.score > 0
    ? best.family
    : normalizedContract.families.find((entry) => entry.id === normalizedContract.defaultFamily) || normalizedContract.families[0];
  const reasons = [];
  if (best && best.score > 0) {
    reasons.push(`keywordHits=${best.keywordHits.slice(0, 6).join(",") || "none"}`);
    reasons.push(`executionSourceMatched=${best.sourceMatched ? "yes" : "no"}`);
  } else {
    reasons.push(`defaultFamily=${normalizedContract.defaultFamily}`);
    reasons.push("keywordHits=none");
  }
  return {
    schema: "task-family-selection.v1",
    version: normalizedContract.version,
    taskFamily: selectedFamily ? selectedFamily.id : normalizedContract.defaultFamily,
    familyProfileId: selectedFamily ? selectedFamily.id : normalizedContract.defaultFamily,
    label: selectedFamily ? selectedFamily.label : normalizedContract.defaultFamily,
    objective: selectedFamily ? selectedFamily.objective : "correctness_first",
    minimumPlanningMode: selectedFamily ? selectedFamily.minimumPlanningMode : "NORMAL",
    ambiguityHandling: selectedFamily ? selectedFamily.ambiguityHandling : "bounded_assumption",
    completionContract: selectedFamily ? selectedFamily.completionContract : "task_outcome_default",
    reasons,
    keywordHits: best && best.score > 0 ? best.keywordHits.slice(0, 8) : [],
    executionSourceMatched: best && best.sourceMatched ? 1 : 0,
  };
}

module.exports = {
  defaultTaskFamilyProfilesDefinition,
  defaultTaskFamilyProfilesPath,
  loadTaskFamilyProfilesContract,
  normalizeTaskFamilyProfilesContract,
  selectTaskFamilyProfile,
};
