"use strict";

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const {
  defaultTaskFamilyProfilesPath,
  loadTaskFamilyProfilesContract,
  normalizeTaskFamilyProfilesContract,
  selectTaskFamilyProfile,
} = require("./task_family_profile_policy");

const planningModePolicyVersion = "adaptive-execution-policy.v2";
const allowedPlanningModes = Object.freeze(["FAST", "NORMAL", "DISCOVERY"]);
const allowedPlanningDepths = Object.freeze(["FAST_PLANNING", "STANDARD_PLANNING", "DISCOVERY_PLANNING"]);
const allowedAssuranceModes = Object.freeze(["LIGHT_ASSURANCE", "STANDARD_ASSURANCE", "SIGNOFF_ASSURANCE"]);

const defaultPlanningModeContractPath = path.join(__dirname, "..", "config", "planning_mode_contract.json");
const defaultAssuranceModeContractPath = path.join(__dirname, "..", "config", "assurance_depth_contract.json");
const defaultRequirementContractSchemaPath = path.join(__dirname, "..", "config", "requirement_contract.schema.json");
const defaultDispatchPlanSchemaPath = path.join(__dirname, "..", "config", "dispatch_plan.schema.json");
const defaultPlanningDecisionContractSchemaPath = path.join(__dirname, "..", "config", "planning_decision_contract.schema.json");

const defaultPlanningModeContractDefinition = Object.freeze({
  schema: "planning-mode-contract.v1",
  version: "2026-03-08.r2",
  modes: allowedPlanningModes,
  thresholds: {
    fast: {
      maxOpenQuestions: 1,
      minAcceptanceScore: 1,
      maxSpecialistBoundaries: 1,
      maxAssumptionScore: 1,
      maxOverDeliveryRiskScore: 1,
      minExistingSpecClarityScore: 1,
      minChangeScopeClarityScore: 1,
    },
    discovery: {
      minOpenQuestions: 2,
      maxAcceptanceScore: 0,
      minAssumptionScore: 2,
      minOverDeliveryRiskScore: 2,
      maxExistingSpecClarityScore: 0,
      maxChangeScopeClarityScore: 0,
    },
  },
  signals: {
    openQuestionKeywords: [
      "open question",
      "tbd",
      "to be decided",
      "unclear",
      "ambiguous",
      "discovery",
      "what should",
      "which",
      "need input",
      "need decision",
      "user decision",
    ],
    userDecisionKeywords: [
      "user decision",
      "approval required",
      "needs input",
      "need input",
      "clarify",
      "confirm",
      "choose",
      "approval boundary",
      "must decide",
    ],
    approvalBoundaryKeywords: [
      "delete",
      "remove dependency",
      "install",
      "permission",
      "security boundary",
      "external service",
      "external system",
      "account write",
      "migration",
      "schema change",
      "destructive",
      "dependency/runtime installation",
      "cross-session",
      "cross-project",
    ],
    overDeliveryRiskKeywords: [
      "rewrite",
      "redesign",
      "re-architecture",
      "new feature",
      "greenfield",
      "broad change",
      "sweep",
      "invent",
      "speculative",
      "over-delivery",
      "new logic",
      "protocol change",
    ],
    specialistKeywords: {
      frontend_worker: ["frontend", "ui", "ux", "browser", "css", "html", "react", "component", "layout", "web/"],
      backend_worker: ["backend", "server", "api", "protocol", "endpoint", "route", "script", "scripts/", "server.js", "contract", "schema", "harness"],
      infra_worker: ["infra", "runtime", "config", "logging", "signoff", "proof", "docs", "changelog", "architecture", "eval", "replay"],
      tester: ["test", "tester", "verification", "smoke", "prove", "proof", "eval", "pass/fail"],
      reviewer: ["review", "reviewer", "audit", "findings", "risk review"],
      explorer: ["explore", "investigate", "fact-find", "discovery"],
    },
    sectionAliases: {
      goal: ["request", "goal", "purpose", "main objective"],
      baseline: ["implementation", "implementation requirements", "deliverables", "baseline scope", "scope"],
      acceptance: ["acceptance", "acceptance criteria", "success criteria"],
      nonGoals: ["non-goal", "non goal", "non-goals"],
      background: ["background", "context", "why"],
      constraints: ["constraint", "constraints", "guardrails"],
    },
  },
});

const defaultAssuranceModeContractDefinition = Object.freeze({
  schema: "assurance-mode-contract.v1",
  version: "2026-03-08.r1",
  modes: allowedAssuranceModes,
  thresholds: {
    light: {
      maxSpecialistBoundaries: 1,
      maxRegressionRiskScore: 1,
      maxUserFacingImpactScore: 1,
    },
    signoff: {
      minRiskScore: 3,
      minRegressionRiskScore: 2,
    },
  },
  signals: {
    docsOnlyKeywords: ["docs only", "docs-only", "documentation only", "readme", "changelog", "harness_map", ".md", "docs/"],
    runtimeKeywords: ["server.js", "runtime", "protocol", "infra", "api", "/api/exec", "app server", "replay", "eval", "signoff", "proof", "scripts/", "scripts/config/", ".codex", "skill governance", "agent governance"],
    userFacingKeywords: ["ui", "ux", "web", "frontend", "html", "css", "browser", "label", "copy"],
    irreversibleKeywords: ["delete", "remove", "drop", "migration", "destructive", "irreversible", "install"],
    reviewKeywords: ["review", "reviewer", "audit", "finding", "findings"],
    testerKeywords: ["test", "tester", "eval", "proof", "verification", "smoke"],
    signoffKeywords: ["signoff", "proof", "release gate", "operator evidence"],
    newLogicKeywords: ["new logic", "new feature", "over-delivery", "rewrite", "redesign", "refactor behavior", "protocol change"],
  },
});

function safeString(value, max = 2000) {
  if (typeof value !== "string") return "";
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, max) : "";
}

function clampInt(value, fallback, min, max) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, Math.trunc(parsed)));
}

function normalizePlanningMode(value, fallback = "NORMAL") {
  const normalized = safeString(value, 40).toUpperCase();
  if (allowedPlanningModes.includes(normalized)) return normalized;
  return allowedPlanningModes.includes(fallback) ? fallback : "NORMAL";
}

function toPlanningDepth(mode) {
  switch (normalizePlanningMode(mode, "NORMAL")) {
    case "FAST":
      return "FAST_PLANNING";
    case "DISCOVERY":
      return "DISCOVERY_PLANNING";
    default:
      return "STANDARD_PLANNING";
  }
}

function normalizePlanningDepth(value, fallback = "STANDARD_PLANNING") {
  const normalized = safeString(value, 60).toUpperCase();
  if (allowedPlanningDepths.includes(normalized)) return normalized;
  return allowedPlanningDepths.includes(fallback) ? fallback : "STANDARD_PLANNING";
}

function normalizeBooleanOption(value, fallback = false) {
  if (value === undefined || value === null) return Boolean(fallback);
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (!normalized) return Boolean(fallback);
    return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
  }
  return Boolean(value);
}

function normalizeAssuranceMode(value, fallback = "STANDARD_ASSURANCE") {
  const normalized = safeString(value, 60).toUpperCase();
  if (allowedAssuranceModes.includes(normalized)) return normalized;
  return allowedAssuranceModes.includes(fallback) ? fallback : "STANDARD_ASSURANCE";
}

function normalizeStringArray(values, fallback = []) {
  const source = Array.isArray(values) ? values : fallback;
  const out = [];
  for (const entry of source) {
    const text = safeString(String(entry || ""), 160);
    if (!text || out.includes(text)) continue;
    out.push(text);
  }
  return Object.freeze(out);
}

function normalizeAliasMap(input, fallback) {
  const source = input && typeof input === "object" ? input : fallback;
  const out = {};
  for (const [key, values] of Object.entries(source || {})) {
    const normalizedKey = safeString(key, 80);
    if (!normalizedKey) continue;
    out[normalizedKey] = normalizeStringArray(values, Array.isArray(fallback && fallback[normalizedKey]) ? fallback[normalizedKey] : []);
  }
  return Object.freeze(out);
}

function normalizeSpecialistKeywordMap(input, fallback) {
  const source = input && typeof input === "object" ? input : fallback;
  const out = {};
  for (const [key, values] of Object.entries(source || {})) {
    const normalizedKey = safeString(key, 80);
    if (!normalizedKey) continue;
    out[normalizedKey] = normalizeStringArray(values, Array.isArray(fallback && fallback[normalizedKey]) ? fallback[normalizedKey] : []);
  }
  return Object.freeze(out);
}

function normalizePlanningModeContract(input) {
  const payload = input && typeof input === "object" ? input : {};
  const fallback = defaultPlanningModeContractDefinition;
  const thresholdsSource = payload.thresholds && typeof payload.thresholds === "object" ? payload.thresholds : {};
  const fastSource = thresholdsSource.fast && typeof thresholdsSource.fast === "object" ? thresholdsSource.fast : {};
  const discoverySource = thresholdsSource.discovery && typeof thresholdsSource.discovery === "object" ? thresholdsSource.discovery : {};
  return Object.freeze({
    schema: safeString(payload.schema, 120) || fallback.schema,
    version: safeString(payload.version, 120) || fallback.version,
    modes: normalizeStringArray(payload.modes, fallback.modes).map((entry) => normalizePlanningMode(entry, entry)),
    thresholds: Object.freeze({
      fast: Object.freeze({
        maxOpenQuestions: clampInt(fastSource.maxOpenQuestions, fallback.thresholds.fast.maxOpenQuestions, 0, 8),
        minAcceptanceScore: clampInt(fastSource.minAcceptanceScore, fallback.thresholds.fast.minAcceptanceScore, 0, 2),
        maxSpecialistBoundaries: clampInt(fastSource.maxSpecialistBoundaries, fallback.thresholds.fast.maxSpecialistBoundaries, 0, 8),
        maxAssumptionScore: clampInt(fastSource.maxAssumptionScore, fallback.thresholds.fast.maxAssumptionScore, 0, 2),
        maxOverDeliveryRiskScore: clampInt(fastSource.maxOverDeliveryRiskScore, fallback.thresholds.fast.maxOverDeliveryRiskScore, 0, 2),
        minExistingSpecClarityScore: clampInt(fastSource.minExistingSpecClarityScore, fallback.thresholds.fast.minExistingSpecClarityScore, 0, 2),
        minChangeScopeClarityScore: clampInt(fastSource.minChangeScopeClarityScore, fallback.thresholds.fast.minChangeScopeClarityScore, 0, 2),
      }),
      discovery: Object.freeze({
        minOpenQuestions: clampInt(discoverySource.minOpenQuestions, fallback.thresholds.discovery.minOpenQuestions, 0, 8),
        maxAcceptanceScore: clampInt(discoverySource.maxAcceptanceScore, fallback.thresholds.discovery.maxAcceptanceScore, 0, 2),
        minAssumptionScore: clampInt(discoverySource.minAssumptionScore, fallback.thresholds.discovery.minAssumptionScore, 0, 2),
        minOverDeliveryRiskScore: clampInt(discoverySource.minOverDeliveryRiskScore, fallback.thresholds.discovery.minOverDeliveryRiskScore, 0, 2),
        maxExistingSpecClarityScore: clampInt(discoverySource.maxExistingSpecClarityScore, fallback.thresholds.discovery.maxExistingSpecClarityScore, 0, 2),
        maxChangeScopeClarityScore: clampInt(discoverySource.maxChangeScopeClarityScore, fallback.thresholds.discovery.maxChangeScopeClarityScore, 0, 2),
      }),
    }),
    signals: Object.freeze({
      openQuestionKeywords: normalizeStringArray(payload.signals && payload.signals.openQuestionKeywords, fallback.signals.openQuestionKeywords),
      userDecisionKeywords: normalizeStringArray(payload.signals && payload.signals.userDecisionKeywords, fallback.signals.userDecisionKeywords),
      approvalBoundaryKeywords: normalizeStringArray(payload.signals && payload.signals.approvalBoundaryKeywords, fallback.signals.approvalBoundaryKeywords),
      overDeliveryRiskKeywords: normalizeStringArray(payload.signals && payload.signals.overDeliveryRiskKeywords, fallback.signals.overDeliveryRiskKeywords),
      specialistKeywords: normalizeSpecialistKeywordMap(payload.signals && payload.signals.specialistKeywords, fallback.signals.specialistKeywords),
      sectionAliases: normalizeAliasMap(payload.signals && payload.signals.sectionAliases, fallback.signals.sectionAliases),
    }),
  });
}

function normalizeAssuranceModeContract(input) {
  const payload = input && typeof input === "object" ? input : {};
  const fallback = defaultAssuranceModeContractDefinition;
  const thresholdsSource = payload.thresholds && typeof payload.thresholds === "object" ? payload.thresholds : {};
  const lightSource = thresholdsSource.light && typeof thresholdsSource.light === "object" ? thresholdsSource.light : {};
  const signoffSource = thresholdsSource.signoff && typeof thresholdsSource.signoff === "object" ? thresholdsSource.signoff : {};
  return Object.freeze({
    schema: safeString(payload.schema, 120) || fallback.schema,
    version: safeString(payload.version, 120) || fallback.version,
    modes: normalizeStringArray(payload.modes, fallback.modes).map((entry) => normalizeAssuranceMode(entry, entry)),
    thresholds: Object.freeze({
      light: Object.freeze({
        maxSpecialistBoundaries: clampInt(lightSource.maxSpecialistBoundaries, fallback.thresholds.light.maxSpecialistBoundaries, 0, 8),
        maxRegressionRiskScore: clampInt(lightSource.maxRegressionRiskScore, fallback.thresholds.light.maxRegressionRiskScore, 0, 2),
        maxUserFacingImpactScore: clampInt(lightSource.maxUserFacingImpactScore, fallback.thresholds.light.maxUserFacingImpactScore, 0, 2),
      }),
      signoff: Object.freeze({
        minRiskScore: clampInt(signoffSource.minRiskScore, fallback.thresholds.signoff.minRiskScore, 0, 8),
        minRegressionRiskScore: clampInt(signoffSource.minRegressionRiskScore, fallback.thresholds.signoff.minRegressionRiskScore, 0, 2),
      }),
    }),
    signals: Object.freeze({
      docsOnlyKeywords: normalizeStringArray(payload.signals && payload.signals.docsOnlyKeywords, fallback.signals.docsOnlyKeywords),
      runtimeKeywords: normalizeStringArray(payload.signals && payload.signals.runtimeKeywords, fallback.signals.runtimeKeywords),
      userFacingKeywords: normalizeStringArray(payload.signals && payload.signals.userFacingKeywords, fallback.signals.userFacingKeywords),
      irreversibleKeywords: normalizeStringArray(payload.signals && payload.signals.irreversibleKeywords, fallback.signals.irreversibleKeywords),
      reviewKeywords: normalizeStringArray(payload.signals && payload.signals.reviewKeywords, fallback.signals.reviewKeywords),
      testerKeywords: normalizeStringArray(payload.signals && payload.signals.testerKeywords, fallback.signals.testerKeywords),
      signoffKeywords: normalizeStringArray(payload.signals && payload.signals.signoffKeywords, fallback.signals.signoffKeywords),
      newLogicKeywords: normalizeStringArray(payload.signals && payload.signals.newLogicKeywords, fallback.signals.newLogicKeywords),
    }),
  });
}

function loadPlanningModeContract(filePath = defaultPlanningModeContractPath) {
  const raw = fs.readFileSync(path.resolve(filePath), "utf8");
  return normalizePlanningModeContract(raw ? JSON.parse(raw) : {});
}

function loadAssuranceModeContract(filePath = defaultAssuranceModeContractPath) {
  const raw = fs.readFileSync(path.resolve(filePath), "utf8");
  return normalizeAssuranceModeContract(raw ? JSON.parse(raw) : {});
}

function loadAdaptiveContracts(input) {
  if (input && typeof input === "object" && input.planning && input.assurance) {
    return {
      planning: normalizePlanningModeContract(input.planning),
      assurance: normalizeAssuranceModeContract(input.assurance),
      familyProfiles: input.familyProfiles
        ? normalizeTaskFamilyProfilesContract(input.familyProfiles)
        : loadTaskFamilyProfilesContract(),
    };
  }
  return {
    planning: input && typeof input === "object" ? normalizePlanningModeContract(input) : loadPlanningModeContract(),
    assurance: loadAssuranceModeContract(),
    familyProfiles: loadTaskFamilyProfilesContract(),
  };
}

function hashPrompt(prompt) {
  return crypto.createHash("sha256").update(String(prompt || ""), "utf8").digest("hex");
}

function normalizeHeadingLabel(value) {
  return safeString(value, 200).toLowerCase().replace(/[`*_:#]/g, " ").replace(/\s+/g, " ").trim();
}

function parsePromptSections(prompt) {
  const text = safeString(prompt, 40000);
  const lines = text ? text.split(/\r?\n/) : [];
  const sections = [];
  let current = { heading: "", label: "", lines: [] };
  for (const rawLine of lines) {
    const line = typeof rawLine === "string" ? rawLine : "";
    const headingMatch = line.match(/^\s{0,3}#{1,6}\s*(.+?)\s*$/);
    if (headingMatch) {
      if (current.heading || current.lines.length) sections.push(current);
      current = { heading: safeString(headingMatch[1], 200), label: normalizeHeadingLabel(headingMatch[1]), lines: [] };
      continue;
    }
    current.lines.push(line);
  }
  if (current.heading || current.lines.length) sections.push(current);
  if (!sections.length) sections.push({ heading: "", label: "", lines });
  return sections;
}

function collectSectionsByAlias(sections, aliases) {
  const aliasSet = new Set((Array.isArray(aliases) ? aliases : []).map((entry) => normalizeHeadingLabel(entry)).filter(Boolean));
  return (Array.isArray(sections) ? sections : []).filter((section) => aliasSet.has(normalizeHeadingLabel(section && section.label)));
}

function collectEntriesFromSections(sections) {
  const out = [];
  for (const section of Array.isArray(sections) ? sections : []) {
    const lines = Array.isArray(section && section.lines) ? section.lines : [];
    for (const rawLine of lines) {
      const line = safeString(rawLine, 400);
      if (!line) continue;
      const bullet = line.replace(/^\s*[-*+]\s*/, "").trim();
      if (!bullet) continue;
      out.push(bullet);
    }
  }
  return out;
}

function extractPromptParagraphs(prompt) {
  return safeString(prompt, 40000).split(/\r?\n\r?\n/).map((entry) => safeString(entry, 400)).filter(Boolean);
}

function firstSentence(text) {
  const normalized = safeString(text, 320);
  if (!normalized) return "";
  const match = normalized.match(/^(.+?[.?!。！？])(?:\s|$)/);
  return match && match[1] ? safeString(match[1], 320) : normalized;
}

function stripQuestionPunctuation(text) {
  return safeString(text, 320)
    .replace(/[?？!！。．\s]+$/g, "")
    .trim();
}

function summarizeQuestionTopicForGoal(text) {
  const normalized = stripQuestionPunctuation(stripPolicyControlLine(text));
  if (!normalized) return "";
  let match = normalized.match(/^(.+?)(?:っていうのは|というのは|とは)(?:何|なに)(?:ですか|なの|なんですか)?$/);
  if (match && match[1]) return `${match[1].trim()}の意味`;
  match = normalized.match(/^(.+?)(?:って何|ってなに|とは何|とはなに)(?:ですか|なの|なんですか)?$/);
  if (match && match[1]) return `${match[1].trim()}の意味`;
  match = normalized.match(/^(.+?場合)(?:は)?どうなる(?:の|んですか|か)?$/);
  if (match && match[1]) return `${match[1].trim()}の挙動`;
  match = normalized.match(/^(.+?)(?:のとき|の時)(?:は)?どうなる(?:の|んですか|か)?$/);
  if (match && match[1]) return `${match[1].trim()}ときの挙動`;
  match = normalized.match(/^(.+?)どうなる(?:の|んですか|か)?$/);
  if (match && match[1]) return `${match[1].trim()}ときの挙動`;
  match = normalized.match(/^(.+?)(?:を|について)?(?:どうすればいい|どうしたらいい|どうやる|どう使う)(?:の|んですか|か)?$/);
  if (match && match[1]) return `${match[1].trim()}の進め方`;
  match = normalized.match(/^(.+?)(?:って)?(?:何|なに)(?:ですか)?$/);
  if (match && match[1]) return `${match[1].trim()}の内容`;
  return normalized;
}

function joinTopicsForGoal(parts) {
  if (!parts.length) return "";
  if (parts.length === 1) return parts[0];
  if (parts.length === 2) return `${parts[0]}と${parts[1]}`;
  return `${parts.slice(0, 2).join("、")}など`;
}

function inferQuestionAnswerGoal(prompt) {
  const firstParagraph = extractPromptParagraphs(prompt)[0] || prompt;
  const parts = uniqueStrings(
    safeString(firstParagraph, 400)
      .split(/[?？]+/)
      .map((entry) => summarizeQuestionTopicForGoal(entry))
      .filter(Boolean),
    3
  );
  if (!parts.length) return "";
  return `${joinTopicsForGoal(parts)}を説明する`;
}

function uniqueStrings(values, max = 24) {
  const out = [];
  for (const entry of Array.isArray(values) ? values : []) {
    const text = safeString(entry, 240);
    if (!text || out.includes(text)) continue;
    out.push(text);
    if (out.length >= max) break;
  }
  return out;
}

function hasAnyKeyword(text, keywords) {
  const lower = safeString(text, 40000).toLowerCase();
  return (Array.isArray(keywords) ? keywords : []).some((keyword) => {
    return textIncludesKeyword(lower, keyword);
  });
}

function matchingKeywords(text, keywords, max = 12) {
  const lower = safeString(text, 40000).toLowerCase();
  return uniqueStrings((Array.isArray(keywords) ? keywords : []).filter((keyword) => {
    return textIncludesKeyword(lower, keyword);
  }), max);
}

function textIncludesKeyword(lowerText, keyword) {
  const normalized = safeString(keyword, 120).toLowerCase();
  if (!normalized) return false;
  if (/^[a-z0-9_./-]{1,3}$/.test(normalized)) {
    const escaped = normalized.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`(^|[^a-z0-9_])${escaped}([^a-z0-9_]|$)`, "i").test(lowerText);
  }
  return lowerText.includes(normalized);
}

function extractPathHints(prompt) {
  const directMatches = safeString(prompt, 40000).match(/\b(?:[A-Za-z0-9._-]+\/)+[A-Za-z0-9._-]+\b/g) || [];
  const extras = [];
  if (/\bserver\.js\b/i.test(prompt)) extras.push("server.js");
  if (/\bAGENTS\.md\b/i.test(prompt)) extras.push("AGENTS.md");
  if (/\bHARNESS_MAP\.md\b/i.test(prompt)) extras.push("HARNESS_MAP.md");
  return uniqueStrings([...directMatches, ...extras], 24).map((entry) => entry.replace(/\\/g, "/"));
}

function scoreAcceptanceClarity(acceptanceChecks) {
  const count = Array.isArray(acceptanceChecks) ? acceptanceChecks.length : 0;
  if (count >= 2) return { id: "high", score: 2 };
  if (count === 1) return { id: "medium", score: 1 };
  return { id: "low", score: 0 };
}

function scoreExistingSpecClarity(prompt, pathHints) {
  const lower = safeString(prompt, 40000).toLowerCase();
  if (/\bexisting\b|\bcurrent\b|\balready\b|\bchange only\b|\bsingle file\b|\bbounded\b/.test(lower) || pathHints.length === 1) {
    return { id: "high", score: 2 };
  }
  if (pathHints.length >= 2) {
    return { id: "medium", score: 1 };
  }
  return { id: "low", score: 0 };
}

function scoreChangeScopeClarity(pathHints) {
  if (pathHints.length === 1) return { id: "high", score: 2 };
  if (pathHints.length >= 2 && pathHints.length <= 3) return { id: "medium", score: 1 };
  return { id: "low", score: 0 };
}

function extractAcceptanceChecks(prompt, sections, contract) {
  const aliases = contract && contract.signals && contract.signals.sectionAliases ? contract.signals.sectionAliases.acceptance : [];
  const fromSections = collectEntriesFromSections(collectSectionsByAlias(sections, aliases));
  const exactReplyMatch = safeString(prompt, 40000).match(/reply with exactly:\s*([^\r\n]+)/i);
  const outputs = [];
  let nextId = 1;
  for (const title of fromSections) {
    outputs.push({
      id: `ac-${nextId++}`,
      title,
      source: "prompt_section",
      blocking: true,
    });
  }
  if (exactReplyMatch && exactReplyMatch[1]) {
    outputs.push({
      id: `ac-${nextId++}`,
      title: `Final reply must be exactly: ${safeString(exactReplyMatch[1], 200)}`,
      source: "exact_reply_contract",
      blocking: true,
    });
  }
  return outputs.slice(0, 12);
}

function extractExplicitGoal(prompt, sections, contract) {
  const aliases = contract && contract.signals && contract.signals.sectionAliases ? contract.signals.sectionAliases.goal : [];
  const goalEntries = collectEntriesFromSections(collectSectionsByAlias(sections, aliases));
  if (goalEntries.length) return firstSentence(goalEntries.join(" "));
  const paragraphs = extractPromptParagraphs(prompt);
  return firstSentence(paragraphs[0] || prompt);
}

function extractImplicitGoal(prompt, sections, contract) {
  const aliases = contract && contract.signals && contract.signals.sectionAliases ? contract.signals.sectionAliases.background : [];
  const backgroundEntries = collectEntriesFromSections(collectSectionsByAlias(sections, aliases));
  if (backgroundEntries.length) return firstSentence(backgroundEntries.join(" "));
  const paragraphs = extractPromptParagraphs(prompt);
  return firstSentence(paragraphs.slice(1, 3).join(" "));
}

function addLocalizedSpecialistOwners(prompt, owners, pathHints = []) {
  const text = safeString(prompt, 40000);
  const hints = Array.isArray(pathHints) ? pathHints.map((entry) => safeString(entry, 240).toLowerCase()) : [];
  if (!text && !hints.length) return uniqueStrings(owners, 8);
  const addOwner = (role, condition) => {
    if (condition) owners.push(role);
  };
  const hasUrl = /https?:\/\//i.test(text);
  addOwner(
    "frontend_worker",
    /\b(?:frontend|ui|ux|css|html|browser)\b/i.test(text)
      || /(?:\u30d5\u30a9\u30f3\u30c8|\u30ec\u30a4\u30a2\u30a6\u30c8|\u30c7\u30b6\u30a4\u30f3|\u898b\u305f\u76ee|\u753b\u9762|\u30d6\u30e9\u30a6\u30b6|\u30d5\u30ed\u30f3\u30c8|\u30c8\u30c3\u30d7\u30da\u30fc\u30b8|\u30e9\u30f3\u30c7\u30a3\u30f3\u30b0\u30da\u30fc\u30b8|\u5c0e\u7dda)/.test(text)
      || (hasUrl && /(?:\u30da\u30fc\u30b8|\u30da\u30fc\u30b8\u6570|\u30b5\u30a4\u30c8|\u30ec\u30a4\u30a2\u30a6\u30c8|\u30d5\u30a9\u30f3\u30c8)/.test(text))
      || hints.some((entry) => entry.startsWith("web/"))
  );
  addOwner(
    "backend_worker",
    /\b(?:backend|server|api|protocol|endpoint|route)\b/i.test(text)
      || /(?:\u30d0\u30c3\u30af\u30a8\u30f3\u30c9|\u30b5\u30fc\u30d0|\u30a8\u30f3\u30c9\u30dd\u30a4\u30f3\u30c8|\u30eb\u30fc\u30c8|\u30d7\u30ed\u30c8\u30b3\u30eb|\u30b9\u30ad\u30fc\u30de|\u5951\u7d04)/.test(text)
      || hints.some((entry) => entry === "server.js" || entry.startsWith("scripts/"))
  );
  addOwner(
    "infra_worker",
    /\b(?:infra|runtime|config|logging|signoff|proof|docs|changelog|architecture|eval|replay)\b/i.test(text)
      || /(?:\u30a4\u30f3\u30d5\u30e9|\u30e9\u30f3\u30bf\u30a4\u30e0|\u8a2d\u5b9a|\u30ed\u30b0|\u69cb\u6210|\u30c9\u30ad\u30e5\u30e1\u30f3\u30c8|\u5909\u66f4\u5c65\u6b74|\u30a2\u30fc\u30ad\u30c6\u30af\u30c1\u30e3)/.test(text)
      || hints.some((entry) => entry.startsWith("docs/") || entry.endsWith(".md"))
  );
  addOwner(
    "tester",
    /\b(?:test|tester|verification|smoke|prove|proof|eval)\b/i.test(text)
      || /(?:\u30c6\u30b9\u30c8|\u691c\u8a3c|\u30b9\u30e2\u30fc\u30af|\u8a55\u4fa1|\u518d\u73fe\u78ba\u8a8d)/.test(text)
  );
  addOwner(
    "reviewer",
    /\b(?:review|reviewer|audit|findings)\b/i.test(text)
      || /(?:\u30ec\u30d3\u30e5\u30fc|\u76e3\u67fb|\u6307\u6458|\u30ea\u30b9\u30af\u30ec\u30d3\u30e5\u30fc)/.test(text)
  );
  addOwner(
    "explorer",
    /\b(?:explore|investigate|fact-find|discovery)\b/i.test(text)
      || /(?:\u8abf\u67fb|\u63a2\u7d22|\u4e8b\u5b9f\u78ba\u8a8d|\u539f\u56e0\u5206\u6790)/.test(text)
  );
  return uniqueStrings(owners, 8);
}

function detectSpecialistOwners(prompt, specialistKeywords, pathHints = []) {
  const lower = safeString(prompt, 40000).toLowerCase();
  const hints = Array.isArray(pathHints) ? pathHints.map((entry) => safeString(entry, 240).toLowerCase()) : [];
  const owners = [];
  for (const [role, keywords] of Object.entries(specialistKeywords || {})) {
    const matched = (Array.isArray(keywords) ? keywords : []).some((keyword) => {
      const normalized = safeString(keyword, 120).toLowerCase();
      return normalized && (lower.includes(normalized) || hints.some((hint) => hint.includes(normalized)));
    });
    if (matched) owners.push(role);
  }
  addLocalizedSpecialistOwners(prompt, owners, pathHints);
  if (!owners.length) {
    if (hints.some((entry) => entry.startsWith("web/"))) owners.push("frontend_worker");
    else if (hints.some((entry) => entry.startsWith("docs/") || entry.endsWith(".md"))) owners.push("infra_worker");
    else owners.push("backend_worker");
  }
  return uniqueStrings(owners, 8);
}

function buildPlanningSelection({ prompt = "", options = {}, contract } = {}) {
  const normalizedContract = normalizePlanningModeContract(contract);
  const sections = parsePromptSections(prompt);
  const aliases = normalizedContract.signals.sectionAliases;
  const acceptanceChecks = extractAcceptanceChecks(prompt, sections, normalizedContract);
  const baselineScope = uniqueStrings(
    [
      ...collectEntriesFromSections(collectSectionsByAlias(sections, aliases.baseline)),
      ...collectEntriesFromSections(collectSectionsByAlias(sections, aliases.constraints)),
    ],
    24
  );
  const nonGoals = collectEntriesFromSections(collectSectionsByAlias(sections, aliases.nonGoals));
  const openQuestions = uniqueStrings([
    ...matchingKeywords(prompt, normalizedContract.signals.openQuestionKeywords, 12),
    ...safeString(prompt, 40000)
      .split(/\r?\n/)
      .map((entry) => safeString(entry, 240))
      .filter((entry) => /[?？]/.test(entry)),
  ], 12);
  const approvalBoundaryItems = matchingKeywords(prompt, normalizedContract.signals.approvalBoundaryKeywords, 12);
  const pathHints = extractPathHints(prompt);
  const specialistOwners = detectSpecialistOwners(prompt, normalizedContract.signals.specialistKeywords, pathHints);
  const implementationBoundaryCount = specialistOwners.filter((role) => implementationRoles.has(role)).length;
  const acceptanceClarity = scoreAcceptanceClarity(acceptanceChecks);
  const existingSpecClarity = scoreExistingSpecClarity(prompt, pathHints);
  const changeScopeClarity = scoreChangeScopeClarity(pathHints);
  const overDeliveryRisk = (() => {
    const hits = matchingKeywords(prompt, normalizedContract.signals.overDeliveryRiskKeywords, 8);
    if (hits.length >= 2 || implementationBoundaryCount >= 3) return { id: "high", score: 2, hits };
    if (hits.length >= 1 || implementationBoundaryCount >= 2) return { id: "medium", score: 1, hits };
    return { id: "low", score: 0, hits };
  })();
  const assumptionDependence = (() => {
    if (openQuestions.length >= 2 || acceptanceClarity.score <= 0 || existingSpecClarity.score <= 0 || changeScopeClarity.score <= 0) {
      return { id: "high", score: 2 };
    }
    if (openQuestions.length === 0 && acceptanceClarity.score >= 1 && existingSpecClarity.score >= 1 && changeScopeClarity.score >= 1) {
      return { id: "low", score: 0 };
    }
    return { id: "medium", score: 1 };
  })();
  const userDecisionRequired =
    approvalBoundaryItems.length > 0 ||
    openQuestions.length > 0 ||
    hasAnyKeyword(prompt, normalizedContract.signals.userDecisionKeywords);
  const fastEligible =
    openQuestions.length <= normalizedContract.thresholds.fast.maxOpenQuestions &&
    acceptanceClarity.score >= normalizedContract.thresholds.fast.minAcceptanceScore &&
    implementationBoundaryCount <= normalizedContract.thresholds.fast.maxSpecialistBoundaries &&
    assumptionDependence.score <= normalizedContract.thresholds.fast.maxAssumptionScore &&
    overDeliveryRisk.score <= normalizedContract.thresholds.fast.maxOverDeliveryRiskScore &&
    existingSpecClarity.score >= normalizedContract.thresholds.fast.minExistingSpecClarityScore &&
    changeScopeClarity.score >= normalizedContract.thresholds.fast.minChangeScopeClarityScore &&
    approvalBoundaryItems.length === 0 &&
    !userDecisionRequired;
  const discoveryRequired =
    approvalBoundaryItems.length > 0 ||
    userDecisionRequired ||
    openQuestions.length >= normalizedContract.thresholds.discovery.minOpenQuestions ||
    acceptanceClarity.score <= normalizedContract.thresholds.discovery.maxAcceptanceScore ||
    assumptionDependence.score >= normalizedContract.thresholds.discovery.minAssumptionScore ||
    overDeliveryRisk.score >= normalizedContract.thresholds.discovery.minOverDeliveryRiskScore ||
    existingSpecClarity.score <= normalizedContract.thresholds.discovery.maxExistingSpecClarityScore ||
    changeScopeClarity.score <= normalizedContract.thresholds.discovery.maxChangeScopeClarityScore;
  const selectedMode = discoveryRequired ? "DISCOVERY" : fastEligible ? "FAST" : "NORMAL";
  return {
    schema: "planning-mode-selection.v2",
    version: planningModePolicyVersion,
    promptHash: hashPrompt(prompt),
    selectedMode,
    selectedPlanningDepth: toPlanningDepth(selectedMode),
    flowPath: `${selectedMode}_PATH`,
    reasons: [
      `openQuestions=${openQuestions.length}`,
      `acceptanceClarity=${acceptanceClarity.id}`,
      `specialistBoundaries=${implementationBoundaryCount}`,
      `approvalBoundaryTouched=${approvalBoundaryItems.length ? "yes" : "no"}`,
      `overDeliveryRisk=${overDeliveryRisk.id}`,
      `userDecisionRequired=${userDecisionRequired ? "yes" : "no"}`,
      `assumptionDependence=${assumptionDependence.id}`,
      `existingSpecClarity=${existingSpecClarity.id}`,
      `changeScopeClarity=${changeScopeClarity.id}`,
    ],
    needsInputRecommended: selectedMode === "DISCOVERY" && (userDecisionRequired || approvalBoundaryItems.length > 0 || openQuestions.length > 0),
    signals: {
      openQuestionsCount: openQuestions.length,
      acceptanceCheckCount: acceptanceChecks.length,
      acceptanceClarity: acceptanceClarity.id,
      specialistBoundaryCount: implementationBoundaryCount,
      specialistOwners,
      approvalBoundaryTouched: approvalBoundaryItems.length > 0,
      approvalBoundaryCount: approvalBoundaryItems.length,
      overDeliveryRisk: overDeliveryRisk.id,
      userDecisionRequired: userDecisionRequired ? 1 : 0,
      assumptionDependence: assumptionDependence.id,
      existingSpecClarity: existingSpecClarity.id,
      changeScopeClarity: changeScopeClarity.id,
      pathHints,
    },
    extracted: {
      explicitGoal: extractExplicitGoal(prompt, sections, normalizedContract),
      implicitGoal: extractImplicitGoal(prompt, sections, normalizedContract),
      baselineScope,
      overDeliveryScope: [],
      nonGoals,
      acceptanceChecks,
      openQuestions,
      approvalBoundaryItems,
      pathHints,
    },
    runtime: {
      agentName: safeString(options && options.agentName, 80) || "",
      requestUserInputPolicy: safeString(options && options.requestUserInputPolicy, 40) || "",
      sandboxMode: safeString(options && options.sandboxMode, 40) || "",
      approvalPolicy: safeString(options && options.approvalPolicy, 40) || "",
    },
  };
}

function scoreUserFacingImpact(prompt, pathHints) {
  const userFacing = hasAnyKeyword(prompt, defaultAssuranceModeContractDefinition.signals.userFacingKeywords) || pathHints.some((entry) => entry.startsWith("web/"));
  if (userFacing && hasAnyKeyword(prompt, ["label", "copy", "text only", "wording"])) return { id: "medium", score: 1 };
  if (userFacing) return { id: "high", score: 2 };
  return { id: "low", score: 0 };
}

function buildAssuranceSelection({ prompt = "", options = {}, selection, contract } = {}) {
  const normalizedContract = normalizeAssuranceModeContract(contract);
  const normalizedSelection = selection && typeof selection === "object" ? selection : buildPlanningSelection({ prompt, options });
  const pathHints = Array.isArray(normalizedSelection.extracted && normalizedSelection.extracted.pathHints) ? normalizedSelection.extracted.pathHints : [];
  const docsOnly =
    pathHints.length > 0 &&
    pathHints.every((entry) => entry.startsWith("docs/") || entry.endsWith(".md")) &&
    !hasAnyKeyword(prompt, normalizedContract.signals.runtimeKeywords);
  const runtimeTouched = hasAnyKeyword(prompt, normalizedContract.signals.runtimeKeywords) || pathHints.includes("server.js") || pathHints.some((entry) => entry.startsWith("scripts/"));
  const irreversible = hasAnyKeyword(prompt, normalizedContract.signals.irreversibleKeywords);
  const reviewerRequested = hasAnyKeyword(prompt, normalizedContract.signals.reviewKeywords);
  const testerRequested = hasAnyKeyword(prompt, normalizedContract.signals.testerKeywords);
  const signoffImportance = hasAnyKeyword(prompt, normalizedContract.signals.signoffKeywords) || runtimeTouched;
  const newLogic = hasAnyKeyword(prompt, normalizedContract.signals.newLogicKeywords) || normalizedSelection.signals.overDeliveryRisk !== "low";
  const userFacingImpact = scoreUserFacingImpact(prompt, pathHints);
  const regressionRisk = (() => {
    if (runtimeTouched || irreversible) return { id: "high", score: 2 };
    if (newLogic || pathHints.some((entry) => entry.startsWith("web/") || entry.startsWith("scripts/"))) return { id: "medium", score: 1 };
    return { id: "low", score: 0 };
  })();
  const riskScore =
    (runtimeTouched ? 1 : 0) +
    (irreversible ? 1 : 0) +
    (signoffImportance ? 1 : 0) +
    (newLogic ? 1 : 0) +
    (Number(normalizedSelection.signals && normalizedSelection.signals.specialistBoundaryCount || 0) > 1 ? 1 : 0);
  const lightEligible =
    (docsOnly || hasAnyKeyword(prompt, normalizedContract.signals.docsOnlyKeywords)) &&
    Number(normalizedSelection.signals && normalizedSelection.signals.specialistBoundaryCount || 0) <= normalizedContract.thresholds.light.maxSpecialistBoundaries &&
    regressionRisk.score <= normalizedContract.thresholds.light.maxRegressionRiskScore &&
    userFacingImpact.score <= normalizedContract.thresholds.light.maxUserFacingImpactScore &&
    !signoffImportance &&
    !reviewerRequested &&
    !testerRequested &&
    !newLogic;
  const selectedAssuranceDepth = lightEligible
    ? "LIGHT_ASSURANCE"
    : riskScore >= normalizedContract.thresholds.signoff.minRiskScore || regressionRisk.score >= normalizedContract.thresholds.signoff.minRegressionRiskScore
      ? "SIGNOFF_ASSURANCE"
      : "STANDARD_ASSURANCE";
  const reviewerRequired = selectedAssuranceDepth === "SIGNOFF_ASSURANCE" ? 1 : reviewerRequested || Number(normalizedSelection.signals && normalizedSelection.signals.specialistBoundaryCount || 0) > 1 ? 1 : 0;
  const testerRequired = selectedAssuranceDepth === "SIGNOFF_ASSURANCE" ? 1 : testerRequested || runtimeTouched || newLogic ? 1 : 0;
  const dedicatedTestsRequired = selectedAssuranceDepth === "SIGNOFF_ASSURANCE" || newLogic ? 1 : 0;
  return {
    schema: "assurance-mode-selection.v1",
    version: planningModePolicyVersion,
    promptHash: normalizedSelection.promptHash,
    selectedAssuranceDepth,
    adaptiveFlowId: `${normalizedSelection.selectedPlanningDepth}__${selectedAssuranceDepth}`,
    reviewerRequired,
    testerRequired,
    dedicatedTestsRequired,
    signoffBundleRequired: selectedAssuranceDepth === "SIGNOFF_ASSURANCE" ? 1 : 0,
    minimalEvidenceProfile: selectedAssuranceDepth === "LIGHT_ASSURANCE" ? 1 : 0,
    reasons: [
      `docsOnly=${docsOnly ? "yes" : "no"}`,
      `runtimeTouched=${runtimeTouched ? "yes" : "no"}`,
      `regressionRisk=${regressionRisk.id}`,
      `signoffImportance=${signoffImportance ? "high" : "low"}`,
      `userFacingImpact=${userFacingImpact.id}`,
      `reviewerRequired=${reviewerRequired ? "yes" : "no"}`,
      `testerRequired=${testerRequired ? "yes" : "no"}`,
      `dedicatedTestsRequired=${dedicatedTestsRequired ? "yes" : "no"}`,
    ],
    signals: {
      docsOnly: docsOnly ? 1 : 0,
      runtimeTouched: runtimeTouched ? 1 : 0,
      irreversible: irreversible ? 1 : 0,
      regressionRisk: regressionRisk.id,
      userFacingImpact: userFacingImpact.id,
      signoffImportance: signoffImportance ? 1 : 0,
      newLogic: newLogic ? 1 : 0,
    },
  };
}

function buildPlanningDecisionContract({ selection, assuranceSelection } = {}) {
  const planning = selection && typeof selection === "object" ? selection : buildPlanningSelection({});
  const assurance = assuranceSelection && typeof assuranceSelection === "object" ? assuranceSelection : buildAssuranceSelection({ selection: planning });
  return {
    schema: "planning-decision-contract.v1",
    source: "runtime_inferred_pre_dispatch",
    promptHash: planning.promptHash,
    selectedPlanningMode: planning.selectedMode,
    selectedPlanningDepth: planning.selectedPlanningDepth,
    selectedAssuranceDepth: assurance.selectedAssuranceDepth,
    taskFamily: safeString(planning.taskFamily, 80) || "deterministic_code",
    familyProfileId: safeString(planning.familyProfileId, 80) || safeString(planning.taskFamily, 80) || "deterministic_code",
    flowPath: planning.flowPath,
    adaptiveFlowId: assurance.adaptiveFlowId,
    needsInputRecommended: planning.needsInputRecommended ? 1 : 0,
    proposalOnlyRecommended: planning.selectedMode === "DISCOVERY" ? 1 : 0,
    planningScore: clampInt(planning.planningScore, 0, 0, 8),
    planningScoreBreakdown: planning.planningScoreBreakdown && typeof planning.planningScoreBreakdown === "object" ? planning.planningScoreBreakdown : {},
    assuranceScore: clampInt(assurance.assuranceScore, 0, 0, 8),
    assuranceScoreBreakdown: assurance.assuranceScoreBreakdown && typeof assurance.assuranceScoreBreakdown === "object" ? assurance.assuranceScoreBreakdown : {},
    planningReasons: uniqueStrings(planning.reasons, 16),
    assuranceReasons: uniqueStrings(assurance.reasons, 16),
    planningSignals: planning.signals,
    assuranceSignals: assurance.signals,
  };
}

function buildRequirementContract({ prompt = "", options = {}, selection, assuranceSelection, contract } = {}) {
  const normalizedSelection = selection && typeof selection === "object" ? selection : buildPlanningSelection({ prompt, options, contract });
  const normalizedAssurance = assuranceSelection && typeof assuranceSelection === "object" ? assuranceSelection : buildAssuranceSelection({ prompt, options, selection: normalizedSelection });
  const assumptions = [];
  if (normalizedSelection.signals.assumptionDependence !== "low") {
    assumptions.push("タスク境界の一部は、まだ入力文の解釈に依存している。");
  }
  if (!normalizedSelection.extracted.nonGoals.length) {
    assumptions.push("Anything outside the explicit goal stays proposal-only unless the prompt says otherwise.");
  }
  return {
    schema: "requirement-contract.v3",
    source: "runtime_inferred_pre_dispatch",
    promptHash: normalizedSelection.promptHash,
    explicitGoal: normalizedSelection.extracted.explicitGoal,
    implicitGoal: normalizedSelection.extracted.implicitGoal,
    baselineScope: normalizedSelection.extracted.baselineScope,
    overDeliveryScope: normalizedSelection.extracted.overDeliveryScope,
    nonGoals: inferNonGoals(normalizedSelection.extracted.nonGoals, normalizedSelection.selectedMode),
    assumptions: uniqueStrings(assumptions, 8),
    openQuestions: normalizedSelection.extracted.openQuestions,
    approvalBoundaryItems: normalizedSelection.extracted.approvalBoundaryItems,
    acceptanceChecks: normalizedSelection.extracted.acceptanceChecks,
    selectedPlanningMode: normalizedSelection.selectedMode,
    selectedPlanningDepth: normalizedSelection.selectedPlanningDepth,
    selectedAssuranceDepth: normalizedAssurance.selectedAssuranceDepth,
    planningModeReasons: normalizedSelection.reasons,
    assuranceDepthReasons: normalizedAssurance.reasons,
  };
}

function defaultOwnedPathsForRole(role, selection) {
  const pathHints = Array.isArray(selection && selection.extracted && selection.extracted.pathHints) ? selection.extracted.pathHints : [];
  if (role === "frontend_worker") return pathHints.filter((entry) => entry.startsWith("web/")).length ? pathHints.filter((entry) => entry.startsWith("web/")) : ["web/"];
  if (role === "infra_worker") return pathHints.filter((entry) => entry.startsWith("docs/") || entry.endsWith(".md")).length ? pathHints.filter((entry) => entry.startsWith("docs/") || entry.endsWith(".md")) : ["docs/", "scripts/config/"];
  return pathHints.filter((entry) => entry === "server.js" || entry.startsWith("scripts/")).length ? pathHints.filter((entry) => entry === "server.js" || entry.startsWith("scripts/")) : ["server.js", "scripts/"];
}

function defaultToolsForRole(role) {
  switch (role) {
    case "frontend_worker":
      return ["apply_patch", "shell_command"];
    case "backend_worker":
    case "infra_worker":
      return ["apply_patch", "shell_command", "node"];
    case "tester":
      return ["shell_command", "node"];
    default:
      return ["shell_command"];
  }
}

function defaultEvidenceForRole(role, assuranceSelection) {
  const signoff = assuranceSelection && assuranceSelection.selectedAssuranceDepth === "SIGNOFF_ASSURANCE";
  if (role === "reviewer") return ["findings_first_review", "reviewer_summary"];
  if (role === "tester") return ["test_run", "tester_summary"];
  if (role === "explorer") return ["fact_finding_notes", "open_question_register"];
  return signoff ? ["file_change", "artifact_manifest", "doc_sync", "verification_command"] : ["file_change", "artifact_manifest"];
}

function buildDispatchPlan({ prompt = "", options = {}, selection, assuranceSelection, requirementContract, contract } = {}) {
  const normalizedSelection = selection && typeof selection === "object" ? selection : buildPlanningSelection({ prompt, options, contract });
  const normalizedAssurance = assuranceSelection && typeof assuranceSelection === "object" ? assuranceSelection : buildAssuranceSelection({ prompt, options, selection: normalizedSelection });
  const requirement = requirementContract && typeof requirementContract === "object"
    ? requirementContract
    : buildRequirementContract({ prompt, options, selection: normalizedSelection, assuranceSelection: normalizedAssurance, contract });
  const acceptanceIds = Array.isArray(requirement.acceptanceChecks)
    ? requirement.acceptanceChecks.map((entry) => safeString(entry && entry.id, 60)).filter(Boolean)
    : [];
  const roles = Array.isArray(normalizedSelection.signals && normalizedSelection.signals.specialistOwners)
    ? normalizedSelection.signals.specialistOwners.filter((role) => implementationRoles.has(role))
    : [];
  const dispatches = [];
  if (normalizedSelection.selectedMode === "DISCOVERY") {
    dispatches.push({
      dispatchId: "dispatch-1-explorer",
      ownerAgent: "explorer",
      ownedPaths: [],
      taskSummary: "Clarify unresolved requirements, non-goals, and approval-boundary items before implementation.",
      acceptanceChecks: acceptanceIds,
      toolsMcpRequirements: ["planning_contract", "read_only_analysis"],
      reviewerRequired: 0,
      testerRequired: 0,
      escalationPoint: "If blocking questions remain, stop with NEEDS_INPUT.",
      expectedEvidence: ["planning_decision_contract", "requirement_contract", "open_question_register"],
    });
  } else {
    const effectiveRoles = roles.length ? roles : ["backend_worker"];
    let index = 1;
    for (const role of effectiveRoles) {
      dispatches.push({
        dispatchId: `dispatch-${index++}-${role}`,
        ownerAgent: role,
        ownedPaths: defaultOwnedPathsForRole(role, normalizedSelection),
        taskSummary:
          role === "infra_worker"
            ? "Own contracts, docs sync, and operator-visible harness wiring."
            : role === "backend_worker"
              ? "Own runtime, server, protocol, and orchestration behavior changes."
              : "Own UI and operator-facing web changes.",
        acceptanceChecks: acceptanceIds,
        toolsMcpRequirements: defaultToolsForRole(role),
        reviewerRequired: normalizedAssurance.reviewerRequired ? 1 : 0,
        testerRequired: normalizedAssurance.testerRequired ? 1 : 0,
        escalationPoint:
          normalizedSelection.selectedPlanningDepth === "FAST_PLANNING"
            ? "Escalate if owned paths expand beyond the locked fast path."
            : "Escalate if owned paths or acceptance checks drift from the requirement contract.",
        expectedEvidence: defaultEvidenceForRole(role, normalizedAssurance),
      });
    }
  }
  const residualRisks = [];
  if (normalizedSelection.selectedMode === "DISCOVERY") residualRisks.push("Implementation is intentionally paused until user decisions resolve the open questions.");
  if (normalizedAssurance.dedicatedTestsRequired) residualRisks.push("Dedicated verification evidence is required for new or risky logic.");
  return {
    schema: "dispatch-plan.v2",
    source: "runtime_inferred_pre_dispatch",
    promptHash: normalizedSelection.promptHash,
    planningMode: normalizedSelection.selectedMode,
    planningDepth: normalizedSelection.selectedPlanningDepth,
    assuranceDepth: normalizedAssurance.selectedAssuranceDepth,
    flowPath: normalizedSelection.flowPath,
    adaptiveFlowId: normalizedAssurance.adaptiveFlowId,
    proposalOnly: normalizedSelection.selectedMode === "DISCOVERY" ? 1 : 0,
    reviewerRequired: normalizedAssurance.reviewerRequired ? 1 : 0,
    testerRequired: normalizedAssurance.testerRequired ? 1 : 0,
    dedicatedTestsRequired: normalizedAssurance.dedicatedTestsRequired ? 1 : 0,
    signoffRequired: normalizedAssurance.signoffBundleRequired ? 1 : 0,
    dispatches,
    sharedEscalationPoints: uniqueStrings(dispatches.map((entry) => entry.escalationPoint).filter(Boolean), 8),
    expectedEvidence: uniqueStrings(dispatches.flatMap((entry) => Array.isArray(entry.expectedEvidence) ? entry.expectedEvidence : []), 20),
    residualRisks,
  };
}

function buildPlanningArtifacts({ prompt = "", options = {}, contract } = {}) {
  const contracts = loadAdaptiveContracts(contract);
  const selection = buildPlanningSelection({ prompt, options, contract: contracts.planning });
  const assuranceSelection = buildAssuranceSelection({ prompt, options, selection, contract: contracts.assurance });
  selection.selectedAssuranceDepth = assuranceSelection.selectedAssuranceDepth;
  selection.assuranceReasons = assuranceSelection.reasons;
  selection.adaptiveFlowId = assuranceSelection.adaptiveFlowId;
  const planningDecisionContract = buildPlanningDecisionContract({ selection, assuranceSelection });
  const requirementContract = buildRequirementContract({ prompt, options, selection, assuranceSelection, contract: contracts.planning });
  const dispatchPlan = buildDispatchPlan({ prompt, options, selection, assuranceSelection, requirementContract, contract: contracts.planning });
  return {
    schema: "planning-artifacts.v2",
    policyVersion: planningModePolicyVersion,
    selection,
    assuranceSelection,
    planningDecisionContract,
    requirementContract,
    dispatchPlan,
  };
}

function sanitizeAcceptanceChecks(value) {
  return (Array.isArray(value) ? value : []).map((entry, index) => {
    const item = entry && typeof entry === "object" ? entry : {};
    const title = safeString(item.title, 240);
    if (!title) return null;
    return {
      id: safeString(item.id, 60) || `ac-${index + 1}`,
      title,
      source: safeString(item.source, 80) || "runtime_inferred",
      blocking: item.blocking === false ? false : true,
    };
  }).filter(Boolean).slice(0, 16);
}

function sanitizeDispatches(value) {
  return (Array.isArray(value) ? value : []).map((entry, index) => {
    const item = entry && typeof entry === "object" ? entry : {};
    const ownerAgent = safeString(item.ownerAgent, 80);
    const taskSummary = safeString(item.taskSummary, 320);
    if (!ownerAgent || !taskSummary) return null;
    return {
      dispatchId: safeString(item.dispatchId, 80) || `dispatch-${index + 1}`,
      ownerAgent,
      ownedPaths: uniqueStrings(item.ownedPaths, 12),
      taskSummary,
      acceptanceChecks: uniqueStrings(item.acceptanceChecks, 16),
      toolsMcpRequirements: uniqueStrings(item.toolsMcpRequirements, 16),
      reviewerRequired: item.reviewerRequired ? 1 : 0,
      testerRequired: item.testerRequired ? 1 : 0,
      escalationPoint: safeString(item.escalationPoint, 240),
      expectedEvidence: uniqueStrings(item.expectedEvidence, 12),
    };
  }).filter(Boolean).slice(0, 16);
}

function sanitizePlanningArtifactsForRuntime(input) {
  const payload = input && typeof input === "object" ? input : {};
  const selection = payload.selection && typeof payload.selection === "object" ? payload.selection : {};
  const assuranceSelection = payload.assuranceSelection && typeof payload.assuranceSelection === "object" ? payload.assuranceSelection : {};
  const planningDecisionContract = payload.planningDecisionContract && typeof payload.planningDecisionContract === "object" ? payload.planningDecisionContract : {};
  const requirement = payload.requirementContract && typeof payload.requirementContract === "object" ? payload.requirementContract : {};
  const dispatchPlan = payload.dispatchPlan && typeof payload.dispatchPlan === "object" ? payload.dispatchPlan : {};
  const normalizedPlanningMode = normalizePlanningMode(selection.selectedMode || requirement.selectedPlanningMode || dispatchPlan.planningMode, "NORMAL");
  const normalizedPlanningDepth = normalizePlanningDepth(selection.selectedPlanningDepth || requirement.selectedPlanningDepth || dispatchPlan.planningDepth, toPlanningDepth(normalizedPlanningMode));
  const normalizedAssuranceDepth = normalizeAssuranceMode(
    assuranceSelection.selectedAssuranceDepth || planningDecisionContract.selectedAssuranceDepth || requirement.selectedAssuranceDepth || dispatchPlan.assuranceDepth,
    "STANDARD_ASSURANCE"
  );
  const flowPath = safeString(selection.flowPath || dispatchPlan.flowPath, 80) || `${normalizedPlanningMode}_PATH`;
  const adaptiveFlowId = safeString(assuranceSelection.adaptiveFlowId || planningDecisionContract.adaptiveFlowId || dispatchPlan.adaptiveFlowId, 120) || `${normalizedPlanningDepth}__${normalizedAssuranceDepth}`;
  return {
    schema: "planning-artifacts.v2",
    policyVersion: safeString(payload.policyVersion, 80) || planningModePolicyVersion,
    selection: {
      schema: safeString(selection.schema, 80) || "planning-mode-selection.v2",
      version: safeString(selection.version, 80) || planningModePolicyVersion,
      promptHash: safeString(selection.promptHash, 80) || "",
      selectedMode: normalizedPlanningMode,
      selectedPlanningDepth: normalizedPlanningDepth,
      selectedAssuranceDepth: normalizedAssuranceDepth,
      flowPath,
      adaptiveFlowId,
      reasons: uniqueStrings(selection.reasons, 16),
      assuranceReasons: uniqueStrings(selection.assuranceReasons, 16),
      needsInputRecommended: selection.needsInputRecommended ? 1 : 0,
      signals: selection.signals && typeof selection.signals === "object" ? selection.signals : {},
    },
    assuranceSelection: {
      schema: safeString(assuranceSelection.schema, 80) || "assurance-mode-selection.v1",
      version: safeString(assuranceSelection.version, 80) || planningModePolicyVersion,
      promptHash: safeString(assuranceSelection.promptHash, 80) || "",
      selectedAssuranceDepth: normalizedAssuranceDepth,
      adaptiveFlowId,
      reasons: uniqueStrings(assuranceSelection.reasons, 16),
      reviewerRequired: assuranceSelection.reviewerRequired ? 1 : 0,
      testerRequired: assuranceSelection.testerRequired ? 1 : 0,
      dedicatedTestsRequired: assuranceSelection.dedicatedTestsRequired ? 1 : 0,
      signoffBundleRequired: assuranceSelection.signoffBundleRequired ? 1 : 0,
      minimalEvidenceProfile: assuranceSelection.minimalEvidenceProfile ? 1 : 0,
      signals: assuranceSelection.signals && typeof assuranceSelection.signals === "object" ? assuranceSelection.signals : {},
    },
    planningDecisionContract: {
      schema: safeString(planningDecisionContract.schema, 80) || "planning-decision-contract.v1",
      source: safeString(planningDecisionContract.source, 80) || "runtime_inferred_pre_dispatch",
      promptHash: safeString(planningDecisionContract.promptHash, 80) || "",
      selectedPlanningMode: normalizedPlanningMode,
      selectedPlanningDepth: normalizedPlanningDepth,
      selectedAssuranceDepth: normalizedAssuranceDepth,
      flowPath,
      adaptiveFlowId,
      needsInputRecommended: planningDecisionContract.needsInputRecommended ? 1 : 0,
      proposalOnlyRecommended: planningDecisionContract.proposalOnlyRecommended ? 1 : 0,
      planningReasons: uniqueStrings(planningDecisionContract.planningReasons || selection.reasons, 16),
      assuranceReasons: uniqueStrings(planningDecisionContract.assuranceReasons || assuranceSelection.reasons, 16),
      planningSignals: planningDecisionContract.planningSignals && typeof planningDecisionContract.planningSignals === "object" ? planningDecisionContract.planningSignals : {},
      assuranceSignals: planningDecisionContract.assuranceSignals && typeof planningDecisionContract.assuranceSignals === "object" ? planningDecisionContract.assuranceSignals : {},
    },
    requirementContract: {
      schema: safeString(requirement.schema, 80) || "requirement-contract.v3",
      source: safeString(requirement.source, 80) || "runtime_inferred_pre_dispatch",
      promptHash: safeString(requirement.promptHash, 80) || safeString(selection.promptHash, 80) || "",
      explicitGoal: safeString(requirement.explicitGoal, 320),
      implicitGoal: safeString(requirement.implicitGoal, 320),
      baselineScope: uniqueStrings(requirement.baselineScope, 24),
      overDeliveryScope: uniqueStrings(requirement.overDeliveryScope, 16),
      nonGoals: uniqueStrings(requirement.nonGoals, 16),
      assumptions: uniqueStrings(requirement.assumptions, 12),
      openQuestions: uniqueStrings(requirement.openQuestions, 12),
      approvalBoundaryItems: uniqueStrings(requirement.approvalBoundaryItems, 12),
      acceptanceChecks: sanitizeAcceptanceChecks(requirement.acceptanceChecks),
      selectedPlanningMode: normalizedPlanningMode,
      selectedPlanningDepth: normalizedPlanningDepth,
      selectedAssuranceDepth: normalizedAssuranceDepth,
      planningModeReasons: uniqueStrings(requirement.planningModeReasons || selection.reasons, 16),
      assuranceDepthReasons: uniqueStrings(requirement.assuranceDepthReasons || assuranceSelection.reasons, 16),
    },
    dispatchPlan: {
      schema: safeString(dispatchPlan.schema, 80) || "dispatch-plan.v2",
      source: safeString(dispatchPlan.source, 80) || "runtime_inferred_pre_dispatch",
      promptHash: safeString(dispatchPlan.promptHash, 80) || safeString(selection.promptHash, 80) || "",
      planningMode: normalizedPlanningMode,
      planningDepth: normalizedPlanningDepth,
      assuranceDepth: normalizedAssuranceDepth,
      flowPath,
      adaptiveFlowId,
      proposalOnly: dispatchPlan.proposalOnly ? 1 : 0,
      reviewerRequired: dispatchPlan.reviewerRequired ? 1 : 0,
      testerRequired: dispatchPlan.testerRequired ? 1 : 0,
      dedicatedTestsRequired: dispatchPlan.dedicatedTestsRequired ? 1 : 0,
      signoffRequired: dispatchPlan.signoffRequired ? 1 : 0,
      dispatches: sanitizeDispatches(dispatchPlan.dispatches),
      sharedEscalationPoints: uniqueStrings(dispatchPlan.sharedEscalationPoints, 8),
      expectedEvidence: uniqueStrings(dispatchPlan.expectedEvidence, 20),
      residualRisks: uniqueStrings(dispatchPlan.residualRisks, 12),
    },
  };
}

module.exports = {
  allowedAssuranceDepths: allowedAssuranceModes,
  allowedPlanningDepths,
  allowedPlanningModes,
  buildAssuranceSelection,
  buildDispatchPlan,
  buildPlanningArtifacts,
  buildPlanningDecisionContract,
  buildPlanningSelection,
  buildRequirementContract,
  defaultAssuranceDepthContractPath: defaultAssuranceModeContractPath,
  defaultAssuranceModeContractPath,
  defaultDispatchPlanSchemaPath,
  defaultPlanningDecisionContractSchemaPath,
  defaultPlanningModeContractPath,
  defaultRequirementContractSchemaPath,
  loadAssuranceDepthContract: loadAssuranceModeContract,
  loadAssuranceModeContract,
  loadPlanningModeContract,
  normalizeAssuranceDepth: normalizeAssuranceMode,
  normalizeAssuranceDepthContract: normalizeAssuranceModeContract,
  normalizeAssuranceModeContract,
  normalizeAssuranceMode,
  normalizePlanningDepth,
  normalizePlanningMode,
  normalizePlanningModeContract,
  planningModePolicyVersion,
  sanitizePlanningArtifactsForRuntime,
};

function stripPolicyControlLine(line) {
  const normalized = safeString(line, 280);
  if (!normalized) return "";
  if (/^\[(?:fixture_scenario|baseline_profile)\][^\r\n]*$/i.test(normalized)) return "";
  const stripped = normalized
    .replace(/^(?:(?:#|\[)(?:requirement-locked|scope-core|scope-plus|scope-expand|scope-no-plus|guard-bypass|rbj-bypass)(?:\]|)\b[ \t]*)+/i, "")
    .trim();
  return stripped;
}

function sanitizePromptForPolicyAnalysis(prompt) {
  return safeString(prompt, 40000)
    .split(/\r?\n/)
    .map((line) => stripPolicyControlLine(line))
    .filter(Boolean)
    .join("\n");
}

function inferOpenQuestionsFromAmbiguity(prompt) {
  const lower = safeString(prompt, 40000).toLowerCase();
  const inferred = [];
  if (/(?:goal|product goal).*(?:not fixed|not clear|unclear|tbd|to be decided)/i.test(lower)) {
    inferred.push("What is the concrete product goal?");
  }
  if (/(?:non-goals?|non goals?).*(?:not fixed|not clear|unclear|tbd|to be decided)/i.test(lower)) {
    inferred.push("What are the non-goals?");
  }
  if (/(?:specialist ownership|specialist boundaries|ownership).*(?:not fixed|not clear|unclear|tbd|to be decided)/i.test(lower)) {
    inferred.push("Which specialist boundaries are in scope?");
  }
  if (/(?:acceptance checks?|acceptance criteria).*(?:not fixed|not clear|unclear|tbd|to be decided)/i.test(lower)) {
    inferred.push("What acceptance checks define success?");
  }
  if (/(?:user decision|needs input|need input|approval required|required before implementation)/i.test(lower)) {
    inferred.push("Which user decision is required before implementation?");
  }
  if (/(?:approval boundary|approval).*(?:required|needed)/i.test(lower)) {
    inferred.push("What approval is required before implementation?");
  }
  return uniqueStrings(inferred, 12);
}

function inferNonGoals(nonGoals, selectedMode) {
  const existing = uniqueStrings(nonGoals, 16);
  if (existing.length || normalizePlanningMode(selectedMode, "NORMAL") !== "DISCOVERY") return existing;
  return [
    "未解決の確認事項が片付くまでは、実装や設定変更を行わない。",
    "要件確認の範囲を超えてスコープを広げない。",
  ];
}

function extractPromptDirectiveLines(prompt, matcher, max = 8) {
  const lines = sanitizePromptForPolicyAnalysis(prompt).split(/\r?\n/);
  const matched = [];
  for (const rawLine of lines) {
    const normalized = safeString(rawLine, 240)
      .replace(/^\s*[-*+]\s*/, "")
      .replace(/^\s{0,3}#{1,6}\s*/, "")
      .trim();
    if (!normalized || matched.includes(normalized)) continue;
    if (typeof matcher === "function" && !matcher(normalized)) continue;
    matched.push(normalized);
    if (matched.length >= max) break;
  }
  return matched;
}

function extractReferenceUrls(prompt, max = 6) {
  const matches = safeString(prompt, 40000).match(/https?:\/\/[^\s)]+/gi) || [];
  return uniqueStrings(matches.map((entry) => String(entry).replace(/[),.;]+$/, "")), max);
}

function isAvoidanceDirective(text) {
  return /(?:\bavoid\b|\bdo not\b|\bdon't\b|\bmust not\b|\bnever\b|\bwithout\b|\bskip\b|\bno\b.+\b(?:generic|filler|extra|scope)\b|禁止|避け|しない|やらない|不要|ダメ|だめ)/i.test(text);
}

function isHardConstraintDirective(text) {
  return /(?:\bmust\b|\brequired\b|\bexactly\b|\bonly\b|\bwithout\b|\bkeep\b|\bpreserve\b|\bdo not\b|\bmust not\b|\bnever\b|\bno\b.+\b(?:other file|dependency|installation|destructive|migration)\b|必須|禁止|のみ|だけ|変更しない|壊さない|追加しない)/i.test(text);
}

function buildDefaultUserValueProfile(taskFamily) {
  switch (safeString(taskFamily, 80).toLowerCase()) {
    case "web_creative":
      return {
        valueThesis: "依頼された Web 体験を、手順のきれいさよりも第一印象と情報の強さが先に伝わる形で届ける。",
        userShouldFeelGet: [
          "テンプレートではなく、意図を持って設計されたように感じる。",
          "価値と構造がひと目で伝わる。",
          "PC とモバイルの両方でちゃんとして見える。",
        ],
        mustAvoid: [
          "AIっぽい無難な量産レイアウト。",
          "区切りのリズムがない単調なカード並び。",
          "根拠のない抽象的な埋め草コピー。",
        ],
        qualityAxes: [
          "first_impression",
          "information_hierarchy",
          "typography_and_spacing",
          "responsive_realness",
          "benchmark_superiority",
        ],
        completedMeans: [
          "結果が、無難な平均解より一段上の意図された出来に感じられる。",
          "ページの価値が分かりやすく伝わり、安っぽさを避け、レスポンシブでも破綻しない。",
        ],
      };
    case "research_analysis":
      return {
        valueThesis: "意思決定に使える答えとして信頼できるように、網羅性と比較の根拠、不確実さの明示を重視して届ける。",
        userShouldFeelGet: [
          "重要な選択肢や仮説の差が分かりやすく比較されている。",
          "何が事実で、何が推測で、何がまだ不明かが見える。",
        ],
        mustAvoid: [
          "比較なしの一方向な断定。",
          "根拠のない主張。",
          "不確実さを隠すこと。",
        ],
        qualityAxes: [
          "coverage",
          "source_grounding",
          "hypothesis_separation",
          "comparison_quality",
          "decision_usefulness",
        ],
        completedMeans: [
          "重要な可能性を押さえ、比較し、確信度も正直に示している。",
        ],
      };
    case "planning_design":
      return {
        valueThesis: "結論を押しつける前に、選択肢とトレードオフ、実行した場合の影響を整理して、次の判断をしやすくする。",
        userShouldFeelGet: [
          "次に何を決めるべきかが、前より曖昧でなくなる。",
          "おすすめだけでなく、差分や影響まで理解できる。",
        ],
        mustAvoid: [
          "早すぎる一択の断定。",
          "実行影響が見えないふわっとした計画。",
          "重要なトレードオフの見落とし。",
        ],
        qualityAxes: [
          "decision_support",
          "tradeoff_clarity",
          "option_quality",
          "execution_readiness",
          "risk_visibility",
        ],
        completedMeans: [
          "トレードオフ、リスク、次の一手が分かり、進路を選べる。",
        ],
      };
    default:
      return {
        valueThesis: "依頼された変更を正しく、局所的に、あとからの手戻り圧を増やさない形で届ける。",
        userShouldFeelGet: [
          "余計な巻き込みなしで、求めた振る舞いが手に入る。",
          "変更範囲が適切で、技術的にも妥当だと判断できる。",
        ],
        mustAvoid: [
          "推測でのスコープ拡大。",
          "必要のない大きな書き換え。",
          "具体的な検証なしの完了宣言。",
        ],
        qualityAxes: [
          "correctness",
          "bounded_scope",
          "regression_resistance",
          "maintainability",
          "actionability",
        ],
        completedMeans: [
          "依頼された変更が機能し、範囲も適切で、明らかな回帰圧を増やさない。",
        ],
      };
  }
}

function inferPromptLevelUserValueSignals(prompt, taskFamily) {
  const lower = sanitizePromptForPolicyAnalysis(prompt).toLowerCase();
  const values = {
    userShouldFeelGet: [],
    mustAvoid: [],
    qualityAxes: [],
    completedMeans: [],
  };
  if (taskFamily === "web_creative") {
    if (/(?:premium|luxury|high-end|editorial|高級|上質)/i.test(lower)) {
      values.userShouldFeelGet.push("安っぽいテンプレートではなく、上質に感じる。");
    }
    if (/(?:landing|lp|conversion|cta|コンバージョン|lp)/i.test(lower)) {
      values.userShouldFeelGet.push("何を勧めているのかが早く伝わり、次の行動が分かりやすい。");
      values.qualityAxes.push("conversion_clarity");
    }
    if (/(?:benchmark|reference|suruga-k|参考|ベンチマーク)/i.test(lower)) {
      values.qualityAxes.push("reference_benchmarking");
      values.completedMeans.push("結果が、明示または暗黙の比較対象に見劣りしない。");
    }
    if (/(?:avoid ai|ai-looking|aiっぽ|安っぽ|cheap)/i.test(lower)) {
      values.mustAvoid.push("AIっぽい安さや、露骨なテンプレ感。");
    }
    if (/(?:mobile|responsive|desktop|レスポンシブ|モバイル)/i.test(lower)) {
      values.qualityAxes.push("responsive_quality");
    }
  } else if (taskFamily === "research_analysis") {
    if (/(?:compare|比較|tradeoff|トレードオフ)/i.test(lower)) values.qualityAxes.push("comparative_reasoning");
    if (/(?:source|citation|根拠|出典)/i.test(lower)) values.qualityAxes.push("source_quality");
  } else if (taskFamily === "planning_design") {
    if (/(?:roadmap|phases|step|段階|ロードマップ)/i.test(lower)) values.qualityAxes.push("sequencing");
    if (/(?:tradeoff|comparison|比較|選択肢)/i.test(lower)) values.qualityAxes.push("option_tradeoffs");
  } else {
    if (/(?:test|verification|verify|検証|テスト)/i.test(lower)) values.qualityAxes.push("verification");
    if (/(?:local|bounded|minimal|small|局所|最小)/i.test(lower)) values.qualityAxes.push("locality");
    if (/(?:regression|rollback|safe|回帰|安全)/i.test(lower)) values.qualityAxes.push("regression_safety");
  }
  if (/(?:best|strongest|excellent|圧倒的|最強|最高品質)/i.test(lower)) {
    values.userShouldFeelGet.push("無難な平均解より明らかに強いと感じる。");
    values.completedMeans.push("単にレビュー可能な最低線ではなく、はっきり上振れした出来に感じられる。");
  }
  return values;
}

function buildUserValueFrame({
  prompt = "",
  explicitGoal = "",
  implicitGoal = "",
  taskFamily = "deterministic_code",
  baselineScope = [],
  nonGoals = [],
  acceptanceChecks = [],
  approvalBoundaryItems = [],
} = {}) {
  const defaults = buildDefaultUserValueProfile(taskFamily);
  const promptSignals = inferPromptLevelUserValueSignals(prompt, taskFamily);
  const directiveAvoids = extractPromptDirectiveLines(prompt, isAvoidanceDirective, 8);
  const directiveConstraints = extractPromptDirectiveLines(prompt, isHardConstraintDirective, 8);
  const acceptanceTitles = (Array.isArray(acceptanceChecks) ? acceptanceChecks : [])
    .map((entry) => safeString(entry && entry.title, 240))
    .filter(Boolean);
  const wants = uniqueStrings(
    [
      explicitGoal,
      ...baselineScope,
      implicitGoal,
    ],
    8
  );
  const hardConstraints = uniqueStrings(
    [
      ...directiveConstraints,
      ...acceptanceTitles.filter((entry) => isHardConstraintDirective(entry)),
      ...approvalBoundaryItems.map((entry) => `Explicit user approval is required before: ${entry}.`),
    ],
    10
  );
  const completedMeans = uniqueStrings(
    [
      ...defaults.completedMeans,
      ...promptSignals.completedMeans,
      ...acceptanceTitles,
    ],
    10
  );
  return {
    valueThesis: safeString(defaults.valueThesis, 320),
    userWants: wants,
    userShouldFeelGet: uniqueStrings(
      [...defaults.userShouldFeelGet, ...promptSignals.userShouldFeelGet],
      8
    ),
    mustAvoid: uniqueStrings(
      [...defaults.mustAvoid, ...directiveAvoids, ...nonGoals, ...promptSignals.mustAvoid],
      10
    ),
    hardConstraints,
    qualityAxes: uniqueStrings(
      [...defaults.qualityAxes, ...promptSignals.qualityAxes],
      10
    ),
    benchmarkCandidates: extractReferenceUrls(prompt, 6),
    completedMeans,
  };
}

function sanitizeUserValueFrame(value) {
  const source = value && typeof value === "object" ? value : {};
  return {
    valueThesis: safeString(source.valueThesis, 320),
    userWants: uniqueStrings(source.userWants, 8),
    userShouldFeelGet: uniqueStrings(source.userShouldFeelGet, 8),
    mustAvoid: uniqueStrings(source.mustAvoid, 10),
    hardConstraints: uniqueStrings(source.hardConstraints, 10),
    qualityAxes: uniqueStrings(source.qualityAxes, 10),
    benchmarkCandidates: uniqueStrings(source.benchmarkCandidates, 6),
    completedMeans: uniqueStrings(source.completedMeans, 10),
  };
}

function extractQuestionCandidates(prompt, keywords) {
  const matches = [];
  for (const line of safeString(prompt, 40000).split(/\r?\n/)) {
    const normalized = stripPolicyControlLine(line);
    if (!normalized) continue;
    if (/\b(?:no|without)\s+open questions?\b/i.test(normalized) || /\bopen questions?\s+(?:are|is)\s+not\b/i.test(normalized)) continue;
    if (/^first make the open questions explicit\.?$/i.test(normalized)) continue;
    if (/^stop with status:\s*need_user_input\.?$/i.test(normalized)) continue;
    if (/[?？]/.test(normalized) || hasAnyKeyword(normalized, keywords)) {
      matches.push(normalized.replace(/^\s*[-*+]\s*/, ""));
    }
  }
  return uniqueStrings(matches, 12);
}

function filterBlockingOpenQuestions(candidates) {
  return uniqueStrings(
    (Array.isArray(candidates) ? candidates : []).filter((entry) => {
      const normalized = safeString(entry, 240);
      if (!normalized) return false;
      if (!/[?？]/.test(normalized)) return true;
      return /(?:goal|scope|non-goal|non goal|acceptance|success criteria|benchmark|reference|direction|preference|constraint|approval|decision|required|owner|ownership|boundary|implementation|before implementation|要件|非対象|受け入れ|基準|参考|方向|好み|制約|承認|判断|境界|実装前|優先)/i.test(normalized);
    }),
    12
  );
}

function detectApprovalBoundaryItems(prompt, keywords) {
  return uniqueStrings(matchingKeywords(prompt, keywords, 12), 12);
}

function detectSpecialistOwners(prompt, keywordMap) {
  const lower = sanitizePromptForPolicyAnalysis(prompt).toLowerCase();
  const owners = [];
  for (const [role, keywords] of Object.entries(keywordMap || {})) {
    if ((Array.isArray(keywords) ? keywords : []).some((keyword) => textIncludesKeyword(lower, keyword))) {
      owners.push(role);
    }
  }
  addLocalizedSpecialistOwners(prompt, owners);
  if (!owners.length) owners.push("backend_worker");
  return uniqueStrings(owners, 8);
}

function scoreAcceptanceClarity(acceptanceChecks) {
  const count = Array.isArray(acceptanceChecks) ? acceptanceChecks.length : 0;
  if (count >= 2) return { id: "high", score: 2 };
  if (count >= 1) return { id: "medium", score: 1 };
  return { id: "low", score: 0 };
}

function scoreAssumptionDependence({ acceptanceScore, openQuestionsCount, baselineScopeCount, promptLength }) {
  if (openQuestionsCount >= 2 || acceptanceScore <= 0) return { id: "high", score: 2 };
  if (acceptanceScore >= 1 && openQuestionsCount === 0) return { id: "low", score: 0 };
  if (baselineScopeCount <= 1 || promptLength < 140) return { id: "medium", score: 1 };
  return { id: "low", score: 0 };
}

function scoreOverDeliveryRisk({ prompt, keywords, specialistBoundaryCount, acceptanceScore }) {
  const hits = matchingKeywords(prompt, keywords, 12);
  if (hits.length >= 2 || (hits.length >= 1 && acceptanceScore <= 0)) return { id: "high", score: 2, hits };
  if (hits.length >= 1 || specialistBoundaryCount >= 3) return { id: "medium", score: 1, hits };
  return { id: "low", score: 0, hits: [] };
}

function scoreExistingSpecClarity({ prompt, baselineScopeCount, acceptanceScore, openQuestionsCount }) {
  const lower = sanitizePromptForPolicyAnalysis(prompt).toLowerCase();
  if (openQuestionsCount >= 2 || /(new feature|greenfield|future product|design a new)/.test(lower)) return { id: "low", score: 0 };
  if (baselineScopeCount >= 1 && acceptanceScore >= 1 && /(existing|small|only|change only|modify only|bounded)/.test(lower)) return { id: "high", score: 2 };
  if (baselineScopeCount >= 1 || acceptanceScore >= 1) return { id: "medium", score: 1 };
  return { id: "low", score: 0 };
}

function scoreChangeScopeClarity({ prompt, baselineScopeCount, specialistBoundaryCount }) {
  const lower = sanitizePromptForPolicyAnalysis(prompt).toLowerCase();
  const pathHints = /(?:server\.js|docs\/|web\/|scripts\/|scripts\/config\/|harness_map\.md|readme)/.test(lower);
  if ((baselineScopeCount >= 1 || pathHints) && specialistBoundaryCount <= 1) return { id: "high", score: 2 };
  if (baselineScopeCount >= 1 || pathHints || specialistBoundaryCount <= 2) return { id: "medium", score: 1 };
  return { id: "low", score: 0 };
}

function mapPlanningScoreToDepth(total) {
  const normalized = clampInt(total, 0, 0, 8);
  if (normalized <= 2) return "FAST_PLANNING";
  if (normalized <= 5) return "STANDARD_PLANNING";
  return "DISCOVERY_PLANNING";
}

function mapPlanningDepthToMode(depth) {
  const normalized = normalizePlanningDepth(depth, "STANDARD_PLANNING");
  if (normalized === "FAST_PLANNING") return "FAST";
  if (normalized === "DISCOVERY_PLANNING") return "DISCOVERY";
  return "NORMAL";
}

function mapAssuranceScoreToDepth(total) {
  const normalized = clampInt(total, 0, 0, 8);
  if (normalized <= 2) return "LIGHT_ASSURANCE";
  if (normalized <= 5) return "STANDARD_ASSURANCE";
  return "SIGNOFF_ASSURANCE";
}

function buildPlanningScoreBreakdown({
  openQuestionsCount,
  acceptanceClarity,
  overDeliveryRisk,
  approvalBoundaryItems,
  userDecisionRequired,
  existingSpecClarity,
  changeScopeClarity,
  specialistBoundaryCount,
  prompt,
}) {
  const ambiguity = approvalBoundaryItems.length > 0 || openQuestionsCount >= 3 || specialistBoundaryCount >= 3
    ? 2
    : (userDecisionRequired || openQuestionsCount >= 1 || specialistBoundaryCount >= 2 ? 1 : 0);
  const acceptanceUncertainty = acceptanceClarity.score <= 0 ? 2 : acceptanceClarity.score === 1 ? 1 : 0;
  const novelty = overDeliveryRisk.score >= 2 || existingSpecClarity.score <= 0 || specialistBoundaryCount >= 2 || /(?:new feature|future product|greenfield|design a new)/i.test(prompt)
    ? 2
    : (overDeliveryRisk.score === 1 || existingSpecClarity.score === 1 || changeScopeClarity.score === 1 ? 1 : 0);
  const externalDependency = approvalBoundaryItems.length >= 2 || /(?:user decision is required|needs input|need input|approval required|must decide)/i.test(prompt)
    ? 2
    : (approvalBoundaryItems.length === 1 || userDecisionRequired || /(?:external service|external system|account|dependency|migration)/i.test(prompt) ? 1 : 0);
  const total = ambiguity + acceptanceUncertainty + novelty + externalDependency;
  return {
    ambiguity,
    acceptance_uncertainty: acceptanceUncertainty,
    novelty,
    external_dependency: externalDependency,
    total,
    rationale: [
      `ambiguity=${ambiguity}`,
      `acceptance_uncertainty=${acceptanceUncertainty}`,
      `novelty=${novelty}`,
      `external_dependency=${externalDependency}`,
    ],
  };
}

function buildAssuranceScoreBreakdown({
  runtimeTouch,
  protocolTouch,
  governanceTouch,
  userFacingImpact,
  irreversibleRisk,
  signoffImportant,
  reviewerSuggested,
  testerSuggested,
  implementationBoundaryCount,
}) {
  const blastRadius = protocolTouch || governanceTouch || implementationBoundaryCount > 1
    ? 2
    : (runtimeTouch || userFacingImpact ? 1 : 0);
  const irreversibility = irreversibleRisk ? 2 : 0;
  const releaseCriticality = signoffImportant || protocolTouch || governanceTouch
    ? 2
    : (runtimeTouch || userFacingImpact ? 1 : 0);
  const evidenceBurden = signoffImportant || (reviewerSuggested && testerSuggested)
    ? 2
    : (reviewerSuggested || testerSuggested ? 1 : 0);
  const total = blastRadius + irreversibility + releaseCriticality + evidenceBurden;
  return {
    blast_radius: blastRadius,
    irreversibility,
    release_criticality: releaseCriticality,
    evidence_burden: evidenceBurden,
    total,
    rationale: [
      `blast_radius=${blastRadius}`,
      `irreversibility=${irreversibility}`,
      `release_criticality=${releaseCriticality}`,
      `evidence_burden=${evidenceBurden}`,
    ],
  };
}

function extractAcceptanceChecks(prompt, sections, contract) {
  const aliases = contract && contract.signals && contract.signals.sectionAliases ? contract.signals.sectionAliases.acceptance : [];
  const fromSections = collectEntriesFromSections(collectSectionsByAlias(sections, aliases));
  const exactReplyMatch = sanitizePromptForPolicyAnalysis(prompt).match(/reply with exactly:\s*([^\r\n]+)/i);
  const outputs = [];
  let nextId = 1;
  for (const title of fromSections) {
    outputs.push({ id: `ac-${nextId++}`, title, source: "prompt_section", blocking: true });
  }
  if (exactReplyMatch && exactReplyMatch[1]) {
    outputs.push({
      id: `ac-${nextId++}`,
      title: `Final reply must be exactly: ${safeString(exactReplyMatch[1], 200)}`,
      source: "exact_reply_contract",
      blocking: true,
    });
  }
  return outputs.slice(0, 12);
}

function extractExplicitGoal(prompt, sections, contract) {
  const aliases = contract && contract.signals && contract.signals.sectionAliases ? contract.signals.sectionAliases.goal : [];
  const goalEntries = collectEntriesFromSections(collectSectionsByAlias(sections, aliases));
  if (goalEntries.length) return firstSentence(goalEntries.join(" "));
  if (/[?？]/.test(safeString(prompt, 40000))) {
    const inferredQuestionGoal = inferQuestionAnswerGoal(prompt);
    if (inferredQuestionGoal) return inferredQuestionGoal;
  }
  return firstSentence(extractPromptParagraphs(prompt)[0] || prompt);
}

function extractImplicitGoal(prompt, sections, contract) {
  const aliases = contract && contract.signals && contract.signals.sectionAliases ? contract.signals.sectionAliases.background : [];
  const backgroundEntries = collectEntriesFromSections(collectSectionsByAlias(sections, aliases));
  if (backgroundEntries.length) return firstSentence(backgroundEntries.join(" "));
  return firstSentence(extractPromptParagraphs(prompt).slice(1, 3).join(" "));
}

function detectScopeAreas(prompt, baselineScope) {
  const lower = sanitizePromptForPolicyAnalysis(prompt).toLowerCase();
  const scopeText = uniqueStrings(baselineScope, 24).join(" ").toLowerCase();
  const text = `${lower}\n${scopeText}`;
  return {
    docs: /(?:\bdocs\/|\.[a-z0-9_-]*md\b|\breadme\b|\bchangelog\b|\bharness_map\b)/i.test(text),
    web: /(?:\bweb\/|\bfrontend\b|\bui\b|\bux\b|\bhtml\b|\bcss\b|\bbrowser\b|\blabel\b|\bcopy\b)/i.test(text),
    server: /(?:\bserver\.js\b|\bapi\b|\bendpoint\b|\broute\b|\bprotocol\b|\bruntime\b)/i.test(text),
    scripts: /(?:\bscripts\/|\bscripts\/config\/|\beval\b|\breplay\b|\bproof\b|\bsignoff\b)/i.test(text),
    governance: /(?:\b\.codex\b|\bskill governance\b|\bagent governance\b|\bcontract\b|\bschema\b|\bpolicy\b)/i.test(text),
  };
}

function buildAssuranceSelection({ prompt, selection, assuranceContract }) {
  const analysisPrompt = sanitizePromptForPolicyAnalysis(prompt);
  const text = safeString(analysisPrompt, 40000);
  const areas = detectScopeAreas(analysisPrompt, selection.extracted.baselineScope);
  const docsOnly = areas.docs && !areas.web && !areas.server && !areas.scripts && !areas.governance;
  const implementationBoundaryCount = Array.isArray(selection.signals && selection.signals.specialistOwners)
    ? selection.signals.specialistOwners.filter((role) => !["reviewer", "tester", "explorer"].includes(role)).length
    : 0;
  const reviewHits = matchingKeywords(text, assuranceContract.signals.reviewKeywords, 8);
  const testerHits = matchingKeywords(text, assuranceContract.signals.testerKeywords, 8);
  const signoffHits = matchingKeywords(text, assuranceContract.signals.signoffKeywords, 8);
  const runtimeHits = matchingKeywords(text, assuranceContract.signals.runtimeKeywords, 12);
  const userFacingHits = matchingKeywords(text, assuranceContract.signals.userFacingKeywords, 8);
  const irreversibleHits = matchingKeywords(text, assuranceContract.signals.irreversibleKeywords, 8);
  const newLogicHits = matchingKeywords(text, assuranceContract.signals.newLogicKeywords, 8);
  const runtimeTouch = runtimeHits.length > 0 || areas.server || areas.scripts || areas.governance;
  const protocolTouch = /(?:protocol|\/api\/exec|app server|turn contract|task outcome contract)/i.test(text);
  const governanceTouch = areas.governance;
  const userFacingImpact = userFacingHits.length > 0 || areas.web;
  const irreversibleRisk = irreversibleHits.length > 0 || selection.signals.approvalBoundaryTouched;
  const reviewerSuggested = reviewHits.length > 0 || selection.signals.specialistBoundaryCount > 1;
  const testerSuggested = testerHits.length > 0 || runtimeTouch || protocolTouch || selection.signals.overDeliveryRisk === "high";
  const signoffImportant =
    signoffHits.length > 0 ||
    protocolTouch ||
    governanceTouch ||
    (runtimeTouch && (irreversibleRisk || implementationBoundaryCount > 1 || selection.signals.overDeliveryRisk === "high"));
  const newLogicRisk = newLogicHits.length > 0 || selection.signals.overDeliveryRisk === "high";
  const regressionRiskScore = runtimeTouch || selection.signals.specialistBoundaryCount > 1 ? 2 : userFacingImpact ? 1 : 0;
  const userFacingImpactScore = userFacingImpact ? 1 : 0;
  const microTask =
    selection.selectedPlanningDepth === "FAST_PLANNING" &&
    selection.signals.specialistBoundaryCount <= 1 &&
    selection.signals.openQuestionsCount === 0 &&
    selection.signals.overDeliveryRisk === "low";
  const riskScore = [
    protocolTouch ? 1 : 0,
    governanceTouch ? 1 : 0,
    irreversibleRisk ? 1 : 0,
    signoffImportant ? 1 : 0,
    newLogicRisk ? 1 : 0,
    implementationBoundaryCount > 1 ? 1 : 0,
  ].reduce((sum, value) => sum + value, 0);
  const lightEligible =
    (docsOnly || microTask) &&
    selection.signals.specialistBoundaryCount <= assuranceContract.thresholds.light.maxSpecialistBoundaries &&
    regressionRiskScore <= assuranceContract.thresholds.light.maxRegressionRiskScore &&
    userFacingImpactScore <= assuranceContract.thresholds.light.maxUserFacingImpactScore &&
    !irreversibleRisk &&
    !signoffImportant &&
    !reviewerSuggested &&
    !testerSuggested;
  const assuranceScoreBreakdown = buildAssuranceScoreBreakdown({
    runtimeTouch,
    protocolTouch,
    governanceTouch,
    userFacingImpact,
    irreversibleRisk,
    signoffImportant,
    reviewerSuggested,
    testerSuggested,
    implementationBoundaryCount,
  });
  const signoffRequired =
    signoffImportant ||
    irreversibleRisk ||
    riskScore >= assuranceContract.thresholds.signoff.minRiskScore ||
    (newLogicRisk && regressionRiskScore >= assuranceContract.thresholds.signoff.minRegressionRiskScore);
  let selectedAssuranceDepth = signoffRequired
    ? "SIGNOFF_ASSURANCE"
    : lightEligible
      ? "LIGHT_ASSURANCE"
      : mapAssuranceScoreToDepth(assuranceScoreBreakdown.total);
  if (selection.selectedPlanningDepth === "DISCOVERY_PLANNING" && selectedAssuranceDepth === "LIGHT_ASSURANCE") {
    selectedAssuranceDepth = "STANDARD_ASSURANCE";
  }
  return {
    selectedAssuranceDepth,
    assuranceScore: assuranceScoreBreakdown.total,
    assuranceScoreBreakdown,
    reasons: [
      ...assuranceScoreBreakdown.rationale,
      `changeKinds=${uniqueStrings([docsOnly ? "docs-only" : "", runtimeTouch ? "runtime" : "", protocolTouch ? "protocol" : "", governanceTouch ? "governance" : "", userFacingImpact ? "user-facing" : ""], 6).join("|") || "bounded"}`,
      `reviewerSuggested=${reviewerSuggested ? "yes" : "no"}`,
      `testerSuggested=${testerSuggested ? "yes" : "no"}`,
      `signoffImportance=${signoffImportant ? "high" : "normal"}`,
      `irreversibleRisk=${irreversibleRisk ? "yes" : "no"}`,
      `newLogicRisk=${newLogicRisk ? "yes" : "no"}`,
      `regressionRisk=${regressionRiskScore >= 2 ? "high" : regressionRiskScore === 1 ? "medium" : "low"}`,
    ],
    signals: {
      docsOnly: docsOnly ? 1 : 0,
      runtimeTouch: runtimeTouch ? 1 : 0,
      protocolTouch: protocolTouch ? 1 : 0,
      governanceTouch: governanceTouch ? 1 : 0,
      userFacingImpact: userFacingImpact ? 1 : 0,
      irreversibleRisk: irreversibleRisk ? 1 : 0,
      reviewerSuggested: reviewerSuggested ? 1 : 0,
      testerSuggested: testerSuggested ? 1 : 0,
      signoffImportant: signoffImportant ? 1 : 0,
      newLogicRisk: newLogicRisk ? 1 : 0,
      regressionRiskScore,
      riskScore,
    },
  };
}

function buildClarificationDecision({
  prompt = "",
  taskFamily = "",
  openQuestions = [],
  approvalBoundaryItems = [],
  explicitUserDecisionRequired = false,
  acceptanceChecks = [],
  baselineScope = [],
} = {}) {
  const normalizedPrompt = sanitizePromptForPolicyAnalysis(prompt);
  const lower = normalizedPrompt.toLowerCase();
  const normalizedTaskFamily = safeString(taskFamily, 80).toLowerCase();
  if (approvalBoundaryItems.length > 0 || explicitUserDecisionRequired) {
    return {
      action: "needs_input",
      reason: "explicit_user_decision_required",
      question: "",
      summary: "Approval-boundary or explicit user decision items block safe execution.",
      missingAnchors: [],
    };
  }
  if (normalizedTaskFamily !== "web_creative") {
    return {
      action: "proceed",
      reason: "task_family_not_design_sensitive",
      question: "",
      summary: "",
      missingAnchors: [],
    };
  }
  if ((Array.isArray(openQuestions) ? openQuestions.length : 0) >= 2) {
    return {
      action: "needs_input",
      reason: "multiple_open_questions_present",
      question: "",
      summary: "Multiple unresolved questions remain for a design-sensitive request.",
      missingAnchors: [],
    };
  }
  const benchmarkAnchored =
    extractReferenceUrls(normalizedPrompt, 6).length > 0
    || /(?:benchmark|reference|inspired by|modeled after|match(?: the)? style|参考|参照|ベンチマーク|寄せて|雰囲気を合わせ|似せて|suruga-k|dribbble|figma)/i.test(normalizedPrompt);
  const directionAnchored =
    /(?:readability|clarity|conversion|premium|luxury|editorial|minimal|playful|serious|trust|safe|dense|information density|typography|spacing|operator|developer|enterprise|mobile|responsive|高級|上品|見やす|読みやす|安心|信頼|情報量|余白|タイポ|可読|ブランド|世界観|印象|雰囲気|開発者向け|運用者向け|社内向け|スマホ|モバイル|レスポンシブ)/i.test(normalizedPrompt);
  const preferenceDriven =
    /(?:user(?:'s)? taste|taste|preference|fit the user's taste|good looking|good feel|feel right|redesign|refresh|polish|improve this ui|良い感じ|好み|ユーザーの好み|見た目|デザイン|雰囲気|印象|世界観|UI|UX)/i.test(normalizedPrompt);
  const scopeConcrete =
    Array.isArray(acceptanceChecks) && acceptanceChecks.length > 0
      ? true
      : Array.isArray(baselineScope) && baselineScope.length >= 2;
  if (preferenceDriven && !benchmarkAnchored && !directionAnchored && !scopeConcrete) {
    return {
      action: "ask_user_once",
      reason: "web_creative_missing_direction_anchor",
      question: "この UI 改善で最優先したい方向は何ですか。参考にしたい見た目や、逆に避けたい雰囲気があれば 1 つだけ教えてください。",
      summary: "Preference-sensitive UI request lacks both a benchmark anchor and an explicit priority axis.",
      missingAnchors: ["priority_axis", "benchmark_or_visual_reference"],
    };
  }
  return {
    action: "proceed",
    reason: benchmarkAnchored || directionAnchored ? "design_direction_anchored" : "bounded_design_scope",
    question: "",
    summary: "",
    missingAnchors: [],
  };
}

function buildPlanningSelection({ prompt = "", options = {}, contract } = {}) {
  const contracts = loadAdaptiveContracts(contract);
  const analysisPrompt = sanitizePromptForPolicyAnalysis(prompt);
  const sections = parsePromptSections(analysisPrompt);
  const aliases = contracts.planning.signals.sectionAliases;
  const acceptanceChecks = extractAcceptanceChecks(analysisPrompt, sections, contracts.planning);
  const baselineScope = uniqueStrings([
    ...collectEntriesFromSections(collectSectionsByAlias(sections, aliases.baseline)),
    ...collectEntriesFromSections(collectSectionsByAlias(sections, aliases.constraints)),
  ], 24);
  const nonGoals = collectEntriesFromSections(collectSectionsByAlias(sections, aliases.nonGoals));
  const questionCandidates = extractQuestionCandidates(analysisPrompt, contracts.planning.signals.openQuestionKeywords);
  const rawOpenQuestions = uniqueStrings([
    ...filterBlockingOpenQuestions(questionCandidates),
    ...inferOpenQuestionsFromAmbiguity(analysisPrompt),
  ], 12);
  const approvalBoundaryItems = detectApprovalBoundaryItems(analysisPrompt, contracts.planning.signals.approvalBoundaryKeywords);
  const explicitUserDecisionRequired =
    approvalBoundaryItems.length > 0 || hasAnyKeyword(analysisPrompt, contracts.planning.signals.userDecisionKeywords);
  const familySelection = selectTaskFamilyProfile({
    prompt: analysisPrompt,
    options,
    contract: contracts.familyProfiles,
  });
  const clarificationDecision = buildClarificationDecision({
    prompt: analysisPrompt,
    taskFamily: familySelection.taskFamily,
    openQuestions: rawOpenQuestions,
    approvalBoundaryItems,
    explicitUserDecisionRequired,
    acceptanceChecks,
    baselineScope,
  });
  const openQuestions = uniqueStrings([
    ...rawOpenQuestions,
    clarificationDecision.action === "ask_user_once" ? clarificationDecision.question : "",
  ], 12);
  const fastModeEnabled = normalizeBooleanOption(options && options.fastModeEnabled, false);
  const userDecisionRequired =
    explicitUserDecisionRequired
    || clarificationDecision.action !== "proceed"
    || openQuestions.length > 0;
  const specialistOwners = detectSpecialistOwners(analysisPrompt, contracts.planning.signals.specialistKeywords);
  const acceptanceClarity = scoreAcceptanceClarity(acceptanceChecks);
  const overDeliveryRisk = scoreOverDeliveryRisk({
    prompt: analysisPrompt,
    keywords: contracts.planning.signals.overDeliveryRiskKeywords,
    specialistBoundaryCount: specialistOwners.length,
    acceptanceScore: acceptanceClarity.score,
  });
  const assumptionDependence = scoreAssumptionDependence({
    acceptanceScore: acceptanceClarity.score,
    openQuestionsCount: openQuestions.length,
    baselineScopeCount: baselineScope.length,
    promptLength: safeString(analysisPrompt, 40000).length,
  });
  const existingSpecClarity = scoreExistingSpecClarity({
    prompt: analysisPrompt,
    baselineScopeCount: baselineScope.length,
    acceptanceScore: acceptanceClarity.score,
    openQuestionsCount: openQuestions.length,
  });
  const changeScopeClarity = scoreChangeScopeClarity({
    prompt: analysisPrompt,
    baselineScopeCount: baselineScope.length,
    specialistBoundaryCount: specialistOwners.length,
  });
  const planningScoreBreakdown = buildPlanningScoreBreakdown({
    openQuestionsCount: openQuestions.length,
    acceptanceClarity,
    overDeliveryRisk,
    approvalBoundaryItems,
    userDecisionRequired,
    existingSpecClarity,
    changeScopeClarity,
    specialistBoundaryCount: specialistOwners.length,
    prompt: analysisPrompt,
  });
  let selectedPlanningDepth = mapPlanningScoreToDepth(planningScoreBreakdown.total);
  let selectedMode = mapPlanningDepthToMode(selectedPlanningDepth);
  const deterministicImplementationNeedsDiscovery =
    familySelection.taskFamily === "deterministic_code" &&
    acceptanceChecks.length === 0 &&
    baselineScope.length === 0 &&
    existingSpecClarity.score === 0 &&
    assumptionDependence.score >= 1;
  if (clarificationDecision.action === "ask_user_once" || clarificationDecision.action === "needs_input") {
    selectedMode = "DISCOVERY";
    selectedPlanningDepth = "DISCOVERY_PLANNING";
  }
  if (deterministicImplementationNeedsDiscovery && selectedMode !== "DISCOVERY") {
    selectedMode = "DISCOVERY";
    selectedPlanningDepth = "DISCOVERY_PLANNING";
  }
  if (
    familySelection.taskFamily === "web_creative" &&
    familySelection.ambiguityHandling === "expand_with_directions" &&
    approvalBoundaryItems.length === 0 &&
    !explicitUserDecisionRequired &&
    clarificationDecision.action === "proceed" &&
    selectedMode === "DISCOVERY"
  ) {
    selectedMode = "NORMAL";
    selectedPlanningDepth = "STANDARD_PLANNING";
  }
  if (familySelection.minimumPlanningMode === "NORMAL" && selectedMode === "FAST") {
    selectedMode = "NORMAL";
    selectedPlanningDepth = "STANDARD_PLANNING";
  }
  if (
    fastModeEnabled &&
    selectedMode === "NORMAL" &&
    approvalBoundaryItems.length === 0 &&
    !explicitUserDecisionRequired &&
    clarificationDecision.action === "proceed"
  ) {
    selectedMode = "FAST";
    selectedPlanningDepth = "FAST_PLANNING";
  }
  const planningReasons = [
    `taskFamily=${familySelection.taskFamily}`,
    `familyAmbiguityHandling=${familySelection.ambiguityHandling}`,
    ...planningScoreBreakdown.rationale,
    `openQuestions=${openQuestions.length}`,
    `acceptanceClarity=${acceptanceClarity.id}`,
    `specialistBoundaries=${specialistOwners.length}`,
    `approvalBoundaryTouched=${approvalBoundaryItems.length > 0 ? "yes" : "no"}`,
    `overDeliveryRisk=${overDeliveryRisk.id}`,
    `userDecisionRequired=${userDecisionRequired ? "yes" : "no"}`,
    `clarificationAction=${clarificationDecision.action}`,
    `clarificationReason=${clarificationDecision.reason}`,
    `assumptionDependence=${assumptionDependence.id}`,
    `existingSpecClarity=${existingSpecClarity.id}`,
    `changeScopeClarity=${changeScopeClarity.id}`,
    `fastMode=${fastModeEnabled ? "on" : "off"}`,
  ];
  const selection = {
    schema: "adaptive-execution-selection.v1",
    version: planningModePolicyVersion,
    promptHash: hashPrompt(analysisPrompt),
    selectedMode,
    selectedPlanningDepth,
    planningScore: planningScoreBreakdown.total,
    planningScoreBreakdown,
    taskFamily: familySelection.taskFamily,
    familyProfileId: familySelection.familyProfileId,
    familyProfile: {
      label: familySelection.label,
      objective: familySelection.objective,
      minimumPlanningMode: familySelection.minimumPlanningMode,
      ambiguityHandling: familySelection.ambiguityHandling,
      completionContract: familySelection.completionContract,
      reasons: Array.isArray(familySelection.reasons) ? familySelection.reasons : [],
      keywordHits: Array.isArray(familySelection.keywordHits) ? familySelection.keywordHits : [],
      executionSourceMatched: familySelection.executionSourceMatched ? 1 : 0,
    },
    flowPath: `${selectedMode}_PATH`,
    executionFlow: "",
    reasons: planningReasons,
    planningReasons,
    needsInputRecommended: selectedMode === "DISCOVERY" && (
      clarificationDecision.action !== "proceed" ||
      explicitUserDecisionRequired ||
      approvalBoundaryItems.length > 0 ||
      (familySelection.taskFamily !== "web_creative" && openQuestions.length > 0)
    ),
    signals: {
      openQuestionsCount: openQuestions.length,
      acceptanceCheckCount: acceptanceChecks.length,
      acceptanceClarity: acceptanceClarity.id,
      specialistBoundaryCount: specialistOwners.length,
      specialistOwners,
      approvalBoundaryTouched: approvalBoundaryItems.length > 0,
      approvalBoundaryCount: approvalBoundaryItems.length,
      overDeliveryRisk: overDeliveryRisk.id,
      userDecisionRequired: userDecisionRequired ? 1 : 0,
      explicitUserDecisionRequired: explicitUserDecisionRequired ? 1 : 0,
      clarificationAction: clarificationDecision.action,
      clarificationReason: clarificationDecision.reason,
      clarificationQuestion: clarificationDecision.question,
      clarificationSummary: clarificationDecision.summary,
      clarificationMissingAnchors: clarificationDecision.missingAnchors,
      assumptionDependence: assumptionDependence.id,
      existingSpecClarity: existingSpecClarity.id,
      changeScopeClarity: changeScopeClarity.id,
      ambiguityInventoryCount: openQuestions.length + approvalBoundaryItems.length,
    },
    extracted: {
      explicitGoal: extractExplicitGoal(analysisPrompt, sections, contracts.planning),
      implicitGoal: extractImplicitGoal(analysisPrompt, sections, contracts.planning),
      baselineScope,
      overDeliveryScope: overDeliveryRisk.hits,
      nonGoals,
      acceptanceChecks,
      openQuestions,
      approvalBoundaryItems,
    },
    runtime: {
      agentName: safeString(options && options.agentName, 80),
      requestUserInputPolicy: safeString(options && options.requestUserInputPolicy, 40),
      sandboxMode: safeString(options && options.sandboxMode, 40),
      approvalPolicy: safeString(options && options.approvalPolicy, 40),
      fastModeEnabled: fastModeEnabled ? 1 : 0,
    },
  };
  const assuranceSelection = buildAssuranceSelection({ prompt: analysisPrompt, selection, assuranceContract: contracts.assurance });
  selection.selectedAssuranceDepth = assuranceSelection.selectedAssuranceDepth;
  selection.assuranceScore = assuranceSelection.assuranceScore;
  selection.assuranceScoreBreakdown = assuranceSelection.assuranceScoreBreakdown;
  selection.assuranceReasons = assuranceSelection.reasons;
  selection.assuranceSignals = assuranceSelection.signals;
  selection.executionFlow = `${selection.selectedPlanningDepth}+${selection.selectedAssuranceDepth}`;
  return selection;
}

function buildRequirementContract({ prompt = "", options = {}, selection, contract } = {}) {
  const normalizedSelection = selection && typeof selection === "object" ? selection : buildPlanningSelection({ prompt, options, contract });
  const normalizedContracts = loadAdaptiveContracts(contract);
  const analysisPrompt = sanitizePromptForPolicyAnalysis(prompt);
  const sections = parsePromptSections(analysisPrompt);
  const explicitGoal = extractExplicitGoal(analysisPrompt, sections, normalizedContracts.planning);
  const implicitGoal = extractImplicitGoal(analysisPrompt, sections, normalizedContracts.planning);
  const inferredNonGoals = inferNonGoals(normalizedSelection.extracted.nonGoals, normalizedSelection.selectedMode);
  const assumptions = [];
  if (normalizedSelection.signals.assumptionDependence !== "low") {
    assumptions.push(
      normalizedSelection.signals.acceptanceClarity === "low"
        ? "受け入れ条件がまだ十分に固まっていないため、実装詳細はユーザー確認が必要になる可能性がある。"
        : "タスク境界の一部は、まだ入力文からの推定に依存している。"
    );
  }
  if (!normalizedSelection.extracted.nonGoals.length) assumptions.push("明示ゴールの外側は、入力で明示されていない限り提案止まりにする。");
  const userValueFrame = buildUserValueFrame({
    prompt: analysisPrompt,
    explicitGoal,
    implicitGoal,
    taskFamily: safeString(normalizedSelection.taskFamily, 80) || "deterministic_code",
    baselineScope: normalizedSelection.extracted.baselineScope,
    nonGoals: inferredNonGoals,
    acceptanceChecks: normalizedSelection.extracted.acceptanceChecks,
    approvalBoundaryItems: normalizedSelection.extracted.approvalBoundaryItems,
  });
  return {
    schema: "requirement-contract.v3",
    source: "runtime_inferred_pre_dispatch",
    promptHash: normalizedSelection.promptHash,
    explicitGoal,
    implicitGoal,
    taskFamily: safeString(normalizedSelection.taskFamily, 80) || "deterministic_code",
    familyProfileId: safeString(normalizedSelection.familyProfileId, 80) || safeString(normalizedSelection.taskFamily, 80) || "deterministic_code",
    baselineScope: normalizedSelection.extracted.baselineScope,
    overDeliveryScope: normalizedSelection.extracted.overDeliveryScope,
    nonGoals: inferredNonGoals,
    assumptions: uniqueStrings(assumptions, 8),
    openQuestions: normalizedSelection.extracted.openQuestions,
    approvalBoundaryItems: normalizedSelection.extracted.approvalBoundaryItems,
    acceptanceChecks: normalizedSelection.extracted.acceptanceChecks,
    userValueFrame,
    selectedPlanningMode: normalizedSelection.selectedMode,
    selectedPlanningDepth: normalizedSelection.selectedPlanningDepth,
    selectedAssuranceDepth: normalizedSelection.selectedAssuranceDepth,
    planningModeReasons: normalizedSelection.planningReasons,
    assuranceDepthReasons: normalizedSelection.assuranceReasons,
  };
}

function defaultOwnedPathsForRole(role, prompt) {
  const lower = sanitizePromptForPolicyAnalysis(prompt).toLowerCase();
  switch (role) {
    case "frontend_worker":
      return ["web/"];
    case "backend_worker":
      return lower.includes("server.js") ? ["server.js", "scripts/"] : ["scripts/", "server.js"];
    case "infra_worker":
      return ["docs/", "scripts/config/"];
    default:
      return [];
  }
}

function defaultToolsForRole(role) {
  switch (role) {
    case "frontend_worker":
      return ["apply_patch", "shell_command"];
    case "backend_worker":
    case "infra_worker":
      return ["apply_patch", "shell_command", "node"];
    case "tester":
      return ["shell_command", "node"];
    default:
      return ["shell_command"];
  }
}

function defaultEvidenceForRole(role, assuranceDepth, dedicatedTestsRequired) {
  switch (role) {
    case "backend_worker":
      return uniqueStrings(["file_change", "verification_command", "artifact_manifest", assuranceDepth === "SIGNOFF_ASSURANCE" ? "signoff_trace" : "", dedicatedTestsRequired ? "dedicated_test_run" : ""], 8);
    case "frontend_worker":
      return uniqueStrings(["file_change", "ui_verification", "artifact_manifest"], 8);
    case "infra_worker":
      return uniqueStrings(["contract_update", "doc_sync", "artifact_manifest", assuranceDepth === "SIGNOFF_ASSURANCE" ? "signoff_bundle" : ""], 8);
    case "tester":
      return uniqueStrings(["test_run", "eval_or_smoke_output", dedicatedTestsRequired ? "dedicated_test_run" : ""], 8);
    case "reviewer":
      return ["findings_first_review"];
    case "explorer":
      return ["fact_finding_notes", "open_question_register"];
    default:
      return ["artifact_manifest"];
  }
}

function buildDispatchPlan({ prompt = "", options = {}, selection, requirementContract, contract } = {}) {
  const normalizedSelection = selection && typeof selection === "object" ? selection : buildPlanningSelection({ prompt, options, contract });
  const requirement = requirementContract && typeof requirementContract === "object" ? requirementContract : buildRequirementContract({ prompt, options, selection: normalizedSelection, contract });
  const acceptanceIds = Array.isArray(requirement.acceptanceChecks) ? requirement.acceptanceChecks.map((entry) => safeString(entry && entry.id, 60)).filter(Boolean) : [];
  const roles = normalizedSelection.signals.specialistOwners.filter((role) => !["reviewer", "tester", "explorer"].includes(role));
  const assuranceDepth = normalizeAssuranceMode(normalizedSelection.selectedAssuranceDepth, "STANDARD_ASSURANCE");
  const reviewerRequired = assuranceDepth === "SIGNOFF_ASSURANCE" || Boolean(normalizedSelection.assuranceSignals && normalizedSelection.assuranceSignals.reviewerSuggested);
  const testerRequired = assuranceDepth === "SIGNOFF_ASSURANCE" || Boolean(normalizedSelection.assuranceSignals && normalizedSelection.assuranceSignals.testerSuggested);
  const signoffRequired = assuranceDepth === "SIGNOFF_ASSURANCE";
  const dedicatedTestsRequired = assuranceDepth === "SIGNOFF_ASSURANCE" && Boolean(normalizedSelection.assuranceSignals && (normalizedSelection.assuranceSignals.newLogicRisk || normalizedSelection.assuranceSignals.runtimeTouch || normalizedSelection.assuranceSignals.protocolTouch));
  const dispatches = [];
  if (normalizedSelection.selectedPlanningDepth === "DISCOVERY_PLANNING") {
    const clarificationAction = safeString(normalizedSelection.signals && normalizedSelection.signals.clarificationAction, 40);
    const clarificationQuestion = safeString(normalizedSelection.signals && normalizedSelection.signals.clarificationQuestion, 320);
    const clarificationSummary = safeString(normalizedSelection.signals && normalizedSelection.signals.clarificationSummary, 320);
    dispatches.push({
      dispatchId: "dispatch-default-discovery",
      ownerAgent: safeString(options && options.agentName, 80) || "default",
      ownedPaths: [],
      taskSummary: clarificationAction === "ask_user_once"
        ? `\u5b9f\u88c5\u524d\u306b\u3001\u6700\u3082\u52b9\u304f\u78ba\u8a8d\u3067\u304d\u308b\u8cea\u554f\u30921\u3064\u3060\u3051\u884c\u3046\u3002${clarificationQuestion ? ` \u8cea\u554f: ${clarificationQuestion}` : ""}`
        : clarificationAction === "needs_input"
          ? "\u5b9f\u88c5\u524d\u306b\u5fc5\u8981\u306a\u30e6\u30fc\u30b6\u30fc\u5224\u65ad\u307e\u305f\u306f\u627f\u8a8d\u304c\u63c3\u3046\u307e\u3067\u5b9f\u884c\u3092\u505c\u6b62\u3059\u308b\u3002"
          : "\u5b9f\u88c5\u306b\u5165\u308b\u524d\u306b\u3001\u672a\u89e3\u6c7a\u306e\u8981\u4ef6\u3001\u975e\u5bfe\u8c61\u7bc4\u56f2\u3001\u524d\u63d0\u3001\u627f\u8a8d\u5883\u754c\u3092\u6574\u7406\u3059\u308b\u3002",
      acceptanceChecks: acceptanceIds,
      toolsMcpRequirements: ["planning_contract", "read_only_analysis"],
      reviewerRequired: 0,
      testerRequired: 0,
      signoffRequired: signoffRequired ? 1 : 0,
      escalationPoint: clarificationAction === "ask_user_once"
        ? "\u30e6\u30fc\u30b6\u30fc\u304c\u78ba\u8a8d\u8cea\u554f\u306b\u56de\u7b54\u3059\u308b\u307e\u3067\u306f\u5b9f\u88c5\u3057\u306a\u3044\u3002"
        : "\u672a\u89e3\u6c7a\u306e\u78ba\u8a8d\u4e8b\u9805\u307e\u305f\u306f\u627f\u8a8d\u5883\u754c\u304c\u6b8b\u308b\u5834\u5408\u306f\u3001NEEDS_INPUT \u3067\u505c\u6b62\u3059\u308b\u3002",
      expectedEvidence: uniqueStrings(["requirement_contract", "flow_trace_summary", "open_question_register", "assumption_register", "non_goal_register", clarificationAction === "ask_user_once" ? "clarification_prompt" : "", clarificationSummary], 8),
    });
  } else {
    const effectiveRoles = roles.length ? roles : [normalizedSelection.assuranceSignals && normalizedSelection.assuranceSignals.docsOnly ? "infra_worker" : "backend_worker"];
    let index = 1;
    for (const role of effectiveRoles) {
      dispatches.push({
        dispatchId: `dispatch-${index++}-${role}`,
        ownerAgent: role,
        ownedPaths: defaultOwnedPathsForRole(role, prompt),
        taskSummary: role === "infra_worker"
          ? "\u5951\u7d04\u3001docs sync\u3001runtime \u53ef\u89b3\u6e2c\u6027\u3001signoff \u5411\u3051\u8a3c\u8de1\u66f4\u65b0\u3092\u62c5\u5f53\u3059\u308b\u3002"
          : role === "backend_worker"
            ? "\u30b5\u30fc\u30d0\u30fc\u5074\u306e\u30aa\u30fc\u30b1\u30b9\u30c8\u30ec\u30fc\u30b7\u30e7\u30f3\u3001\u30dd\u30ea\u30b7\u30fc\u3001runtime \u632f\u308b\u821e\u3044\u5909\u66f4\u3092\u62c5\u5f53\u3059\u308b\u3002"
            : role === "frontend_worker"
              ? "UI \u3068\u30aa\u30da\u30ec\u30fc\u30bf\u30fc\u5411\u3051 Web \u5909\u66f4\u3092\u62c5\u5f53\u3059\u308b\u3002"
              : "\u9078\u629e\u3055\u308c\u305f\u7bc4\u56f2\u306e specialist \u5b9f\u884c\u3092\u62c5\u5f53\u3059\u308b\u3002",
        acceptanceChecks: acceptanceIds,
        toolsMcpRequirements: defaultToolsForRole(role),
        reviewerRequired: reviewerRequired ? 1 : 0,
        testerRequired: testerRequired ? 1 : 0,
        signoffRequired: signoffRequired ? 1 : 0,
        escalationPoint: normalizedSelection.selectedPlanningDepth === "FAST_PLANNING"
          ? "Escalate if owned paths expand beyond the selected specialist boundary."
          : "Escalate if owned paths or acceptance checks drift from the requirement contract.",
        expectedEvidence: defaultEvidenceForRole(role, assuranceDepth, dedicatedTestsRequired),
      });
    }
  }
  const residualRisks = [];
  if (normalizedSelection.selectedPlanningDepth === "DISCOVERY_PLANNING") {
    const clarificationAction = safeString(normalizedSelection.signals && normalizedSelection.signals.clarificationAction, 40);
    if (clarificationAction === "ask_user_once") residualRisks.push("Implementation is intentionally paused until one clarifying answer anchors the design direction.");
    else residualRisks.push("Implementation is intentionally paused until user decisions resolve the open questions.");
  }
  else if (normalizedSelection.signals.assumptionDependence !== "low") residualRisks.push("Some implementation details still depend on inferred assumptions from the prompt.");
  if (dedicatedTestsRequired) residualRisks.push("New logic or protocol-sensitive behavior requires dedicated verification before signoff.");
  return {
    schema: "dispatch-plan.v2",
    source: "runtime_inferred_pre_dispatch",
    promptHash: normalizedSelection.promptHash,
    planningMode: normalizedSelection.selectedMode,
    planningDepth: normalizedSelection.selectedPlanningDepth,
    assuranceDepth,
    taskFamily: safeString(normalizedSelection.taskFamily, 80) || "deterministic_code",
    familyProfileId: safeString(normalizedSelection.familyProfileId, 80) || safeString(normalizedSelection.taskFamily, 80) || "deterministic_code",
    flowPath: normalizedSelection.flowPath,
    executionFlow: normalizedSelection.executionFlow,
    proposalOnly: normalizedSelection.selectedPlanningDepth === "DISCOVERY_PLANNING" ? 1 : 0,
    reviewerRequired: reviewerRequired ? 1 : 0,
    testerRequired: testerRequired ? 1 : 0,
    signoffRequired: signoffRequired ? 1 : 0,
    dedicatedTestsRequired: dedicatedTestsRequired ? 1 : 0,
    dispatches,
    sharedEscalationPoints: uniqueStrings(dispatches.map((entry) => entry.escalationPoint).filter(Boolean), 6),
    expectedEvidence: uniqueStrings(["requirement_contract", "dispatch_plan", "evidence_manifest", "stage_timeline", "flow_trace_summary", "review_load_breakdown", reviewerRequired ? "reviewer_summary" : "", testerRequired ? "tester_summary" : "", signoffRequired ? "signoff_bundle" : "", dedicatedTestsRequired ? "dedicated_test_run" : ""], 16),
    residualRisks,
  };
}

function buildPlanningArtifacts({ prompt = "", options = {}, contract } = {}) {
  const contracts = loadAdaptiveContracts(contract);
  const selection = buildPlanningSelection({ prompt, options, contract: contracts });
  const assuranceSelection = {
    selectedAssuranceDepth: selection.selectedAssuranceDepth,
    assuranceScore: selection.assuranceScore,
    assuranceScoreBreakdown: selection.assuranceScoreBreakdown,
    reasons: Array.isArray(selection.assuranceReasons) ? selection.assuranceReasons : [],
    signals: selection.assuranceSignals && typeof selection.assuranceSignals === "object" ? selection.assuranceSignals : {},
  };
  const planningDecisionContract = buildPlanningDecisionContract({ selection, assuranceSelection });
  const requirementContract = buildRequirementContract({ prompt, options, selection, contract: contracts });
  const dispatchPlan = buildDispatchPlan({ prompt, options, selection, requirementContract, contract: contracts });
  return {
    schema: "planning-artifacts.v2",
    policyVersion: planningModePolicyVersion,
    contracts,
    selection,
    assuranceSelection,
    planningDecisionContract,
    requirementContract,
    dispatchPlan,
  };
}

function sanitizeAcceptanceChecks(value) {
  return (Array.isArray(value) ? value : []).map((entry, index) => {
    const item = entry && typeof entry === "object" ? entry : {};
    const id = safeString(item.id, 60) || `ac-${index + 1}`;
    const title = safeString(item.title, 240);
    if (!title) return null;
    return { id, title, source: safeString(item.source, 80) || "runtime_inferred", blocking: item.blocking === false ? false : true };
  }).filter(Boolean).slice(0, 16);
}

function sanitizeDispatches(value) {
  return (Array.isArray(value) ? value : []).map((entry, index) => {
    const item = entry && typeof entry === "object" ? entry : {};
    const ownerAgent = safeString(item.ownerAgent, 80);
    const taskSummary = safeString(item.taskSummary, 320);
    if (!ownerAgent || !taskSummary) return null;
    return {
      dispatchId: safeString(item.dispatchId, 80) || `dispatch-${index + 1}`,
      ownerAgent,
      ownedPaths: uniqueStrings(item.ownedPaths, 12),
      taskSummary,
      acceptanceChecks: uniqueStrings(item.acceptanceChecks, 16),
      toolsMcpRequirements: uniqueStrings(item.toolsMcpRequirements, 16),
      reviewerRequired: item.reviewerRequired ? 1 : 0,
      testerRequired: item.testerRequired ? 1 : 0,
      signoffRequired: item.signoffRequired ? 1 : 0,
      escalationPoint: safeString(item.escalationPoint, 240),
      expectedEvidence: uniqueStrings(item.expectedEvidence, 12),
    };
  }).filter(Boolean).slice(0, 12);
}

function sanitizePlanningArtifactsForRuntime(input) {
  const payload = input && typeof input === "object" ? input : {};
  const selection = payload.selection && typeof payload.selection === "object" ? payload.selection : {};
  const assuranceSelection = payload.assuranceSelection && typeof payload.assuranceSelection === "object" ? payload.assuranceSelection : {};
  const planningDecisionContract = payload.planningDecisionContract && typeof payload.planningDecisionContract === "object" ? payload.planningDecisionContract : {};
  const requirement = payload.requirementContract && typeof payload.requirementContract === "object" ? payload.requirementContract : {};
  const dispatchPlan = payload.dispatchPlan && typeof payload.dispatchPlan === "object" ? payload.dispatchPlan : {};
  const selectedMode = normalizePlanningMode(selection.selectedMode || requirement.selectedPlanningMode || dispatchPlan.planningMode, "NORMAL");
  const selectedPlanningDepth = normalizePlanningDepth(selection.selectedPlanningDepth || requirement.selectedPlanningDepth || dispatchPlan.planningDepth || toPlanningDepth(selectedMode), "STANDARD_PLANNING");
  const selectedAssuranceDepth = normalizeAssuranceMode(
    selection.selectedAssuranceDepth || assuranceSelection.selectedAssuranceDepth || planningDecisionContract.selectedAssuranceDepth || requirement.selectedAssuranceDepth || dispatchPlan.assuranceDepth,
    "STANDARD_ASSURANCE"
  );
  const taskFamily = safeString(selection.taskFamily || planningDecisionContract.taskFamily || requirement.taskFamily || dispatchPlan.taskFamily, 80) || "deterministic_code";
  const familyProfileId = safeString(selection.familyProfileId || planningDecisionContract.familyProfileId || requirement.familyProfileId || dispatchPlan.familyProfileId, 80) || taskFamily;
  return {
    schema: "planning-artifacts.v2",
    policyVersion: safeString(payload.policyVersion, 80) || planningModePolicyVersion,
    selection: {
      schema: safeString(selection.schema, 80) || "adaptive-execution-selection.v1",
      version: safeString(selection.version, 80) || planningModePolicyVersion,
      promptHash: safeString(selection.promptHash, 80),
      selectedMode,
      selectedPlanningDepth,
      selectedAssuranceDepth,
      taskFamily,
      familyProfileId,
      planningScore: clampInt(selection.planningScore, 0, 0, 8),
      planningScoreBreakdown: selection.planningScoreBreakdown && typeof selection.planningScoreBreakdown === "object" ? selection.planningScoreBreakdown : {},
      assuranceScore: clampInt(selection.assuranceScore, 0, 0, 8),
      assuranceScoreBreakdown: selection.assuranceScoreBreakdown && typeof selection.assuranceScoreBreakdown === "object" ? selection.assuranceScoreBreakdown : {},
      familyProfile: {
        label: safeString(selection.familyProfile && selection.familyProfile.label, 120),
        objective: safeString(selection.familyProfile && selection.familyProfile.objective, 80),
        minimumPlanningMode: normalizePlanningMode(selection.familyProfile && selection.familyProfile.minimumPlanningMode, "NORMAL"),
        ambiguityHandling: safeString(selection.familyProfile && selection.familyProfile.ambiguityHandling, 80),
        completionContract: safeString(selection.familyProfile && selection.familyProfile.completionContract, 80),
        reasons: uniqueStrings(selection.familyProfile && selection.familyProfile.reasons, 8),
        keywordHits: uniqueStrings(selection.familyProfile && selection.familyProfile.keywordHits, 8),
        executionSourceMatched: selection.familyProfile && selection.familyProfile.executionSourceMatched ? 1 : 0,
      },
      flowPath: safeString(selection.flowPath, 80) || `${selectedMode}_PATH`,
      executionFlow: safeString(selection.executionFlow, 120) || `${selectedPlanningDepth}+${selectedAssuranceDepth}`,
      reasons: uniqueStrings(selection.reasons || selection.planningReasons, 16),
      planningReasons: uniqueStrings(selection.planningReasons || selection.reasons, 16),
      assuranceReasons: uniqueStrings(selection.assuranceReasons, 16),
      needsInputRecommended: selection.needsInputRecommended ? 1 : 0,
      signals: {
        openQuestionsCount: clampInt(selection.signals && selection.signals.openQuestionsCount, 0, 0, 12),
        acceptanceCheckCount: clampInt(selection.signals && selection.signals.acceptanceCheckCount, 0, 0, 24),
        acceptanceClarity: safeString(selection.signals && selection.signals.acceptanceClarity, 40) || "low",
        specialistBoundaryCount: clampInt(selection.signals && selection.signals.specialistBoundaryCount, 0, 0, 8),
        specialistOwners: uniqueStrings(selection.signals && selection.signals.specialistOwners, 8),
        approvalBoundaryTouched: selection.signals && selection.signals.approvalBoundaryTouched ? 1 : 0,
        approvalBoundaryCount: clampInt(selection.signals && selection.signals.approvalBoundaryCount, 0, 0, 12),
        overDeliveryRisk: safeString(selection.signals && selection.signals.overDeliveryRisk, 40) || "low",
        userDecisionRequired: selection.signals && selection.signals.userDecisionRequired ? 1 : 0,
        explicitUserDecisionRequired: selection.signals && selection.signals.explicitUserDecisionRequired ? 1 : 0,
        clarificationAction: safeString(selection.signals && selection.signals.clarificationAction, 40),
        clarificationReason: safeString(selection.signals && selection.signals.clarificationReason, 120),
        clarificationQuestion: safeString(selection.signals && selection.signals.clarificationQuestion, 320),
        clarificationSummary: safeString(selection.signals && selection.signals.clarificationSummary, 320),
        clarificationMissingAnchors: uniqueStrings(selection.signals && selection.signals.clarificationMissingAnchors, 4),
        assumptionDependence: safeString(selection.signals && selection.signals.assumptionDependence, 40) || "low",
        existingSpecClarity: safeString(selection.signals && selection.signals.existingSpecClarity, 40) || "low",
        changeScopeClarity: safeString(selection.signals && selection.signals.changeScopeClarity, 40) || "low",
        ambiguityInventoryCount: clampInt(selection.signals && selection.signals.ambiguityInventoryCount, 0, 0, 24),
      },
      assuranceSignals: {
        docsOnly: selection.assuranceSignals && selection.assuranceSignals.docsOnly ? 1 : 0,
        runtimeTouch: selection.assuranceSignals && selection.assuranceSignals.runtimeTouch ? 1 : 0,
        protocolTouch: selection.assuranceSignals && selection.assuranceSignals.protocolTouch ? 1 : 0,
        governanceTouch: selection.assuranceSignals && selection.assuranceSignals.governanceTouch ? 1 : 0,
        userFacingImpact: selection.assuranceSignals && selection.assuranceSignals.userFacingImpact ? 1 : 0,
        irreversibleRisk: selection.assuranceSignals && selection.assuranceSignals.irreversibleRisk ? 1 : 0,
        reviewerSuggested: selection.assuranceSignals && selection.assuranceSignals.reviewerSuggested ? 1 : 0,
        testerSuggested: selection.assuranceSignals && selection.assuranceSignals.testerSuggested ? 1 : 0,
        signoffImportant: selection.assuranceSignals && selection.assuranceSignals.signoffImportant ? 1 : 0,
        newLogicRisk: selection.assuranceSignals && selection.assuranceSignals.newLogicRisk ? 1 : 0,
        regressionRiskScore: clampInt(selection.assuranceSignals && selection.assuranceSignals.regressionRiskScore, 0, 0, 3),
        riskScore: clampInt(selection.assuranceSignals && selection.assuranceSignals.riskScore, 0, 0, 8),
      },
    },
    assuranceSelection: {
      schema: safeString(assuranceSelection.schema, 80) || "assurance-mode-selection.v1",
      selectedAssuranceDepth,
      assuranceScore: clampInt(assuranceSelection.assuranceScore || selection.assuranceScore || planningDecisionContract.assuranceScore, 0, 0, 8),
      assuranceScoreBreakdown: assuranceSelection.assuranceScoreBreakdown && typeof assuranceSelection.assuranceScoreBreakdown === "object"
        ? assuranceSelection.assuranceScoreBreakdown
        : selection.assuranceScoreBreakdown && typeof selection.assuranceScoreBreakdown === "object"
          ? selection.assuranceScoreBreakdown
          : planningDecisionContract.assuranceScoreBreakdown && typeof planningDecisionContract.assuranceScoreBreakdown === "object"
            ? planningDecisionContract.assuranceScoreBreakdown
            : {},
      reasons: uniqueStrings(assuranceSelection.reasons || selection.assuranceReasons, 16),
      signals: assuranceSelection.signals && typeof assuranceSelection.signals === "object"
        ? assuranceSelection.signals
        : selection.assuranceSignals && typeof selection.assuranceSignals === "object"
          ? selection.assuranceSignals
          : {},
    },
    planningDecisionContract: {
      schema: safeString(planningDecisionContract.schema, 80) || "planning-decision-contract.v1",
      source: safeString(planningDecisionContract.source, 80) || "runtime_inferred_pre_dispatch",
      promptHash: safeString(planningDecisionContract.promptHash, 80) || safeString(selection.promptHash, 80),
      selectedPlanningMode: selectedMode,
      selectedPlanningDepth,
      selectedAssuranceDepth,
      taskFamily,
      familyProfileId,
      flowPath: safeString(planningDecisionContract.flowPath, 80) || safeString(selection.flowPath, 80) || `${selectedMode}_PATH`,
      adaptiveFlowId: safeString(planningDecisionContract.adaptiveFlowId, 120) || `${selectedPlanningDepth}__${selectedAssuranceDepth}`,
      needsInputRecommended: planningDecisionContract.needsInputRecommended ? 1 : 0,
      proposalOnlyRecommended: planningDecisionContract.proposalOnlyRecommended ? 1 : 0,
      planningScore: clampInt(planningDecisionContract.planningScore || selection.planningScore, 0, 0, 8),
      planningScoreBreakdown: planningDecisionContract.planningScoreBreakdown && typeof planningDecisionContract.planningScoreBreakdown === "object"
        ? planningDecisionContract.planningScoreBreakdown
        : selection.planningScoreBreakdown && typeof selection.planningScoreBreakdown === "object"
          ? selection.planningScoreBreakdown
          : {},
      assuranceScore: clampInt(planningDecisionContract.assuranceScore || assuranceSelection.assuranceScore || selection.assuranceScore, 0, 0, 8),
      assuranceScoreBreakdown: planningDecisionContract.assuranceScoreBreakdown && typeof planningDecisionContract.assuranceScoreBreakdown === "object"
        ? planningDecisionContract.assuranceScoreBreakdown
        : assuranceSelection.assuranceScoreBreakdown && typeof assuranceSelection.assuranceScoreBreakdown === "object"
          ? assuranceSelection.assuranceScoreBreakdown
          : selection.assuranceScoreBreakdown && typeof selection.assuranceScoreBreakdown === "object"
            ? selection.assuranceScoreBreakdown
            : {},
      planningReasons: uniqueStrings(planningDecisionContract.planningReasons || selection.planningReasons || selection.reasons, 16),
      assuranceReasons: uniqueStrings(planningDecisionContract.assuranceReasons || assuranceSelection.reasons || selection.assuranceReasons, 16),
      planningSignals: planningDecisionContract.planningSignals && typeof planningDecisionContract.planningSignals === "object" ? planningDecisionContract.planningSignals : selection.signals && typeof selection.signals === "object" ? selection.signals : {},
      assuranceSignals: planningDecisionContract.assuranceSignals && typeof planningDecisionContract.assuranceSignals === "object" ? planningDecisionContract.assuranceSignals : selection.assuranceSignals && typeof selection.assuranceSignals === "object" ? selection.assuranceSignals : {},
    },
    requirementContract: {
      schema: safeString(requirement.schema, 80) || "requirement-contract.v3",
      source: safeString(requirement.source, 80) || "runtime_inferred_pre_dispatch",
      promptHash: safeString(requirement.promptHash, 80) || safeString(selection.promptHash, 80),
      explicitGoal: safeString(requirement.explicitGoal, 320),
      implicitGoal: safeString(requirement.implicitGoal, 320),
      taskFamily,
      familyProfileId,
      baselineScope: uniqueStrings(requirement.baselineScope, 24),
      overDeliveryScope: uniqueStrings(requirement.overDeliveryScope, 16),
      nonGoals: uniqueStrings(requirement.nonGoals, 16),
      assumptions: uniqueStrings(requirement.assumptions, 12),
      openQuestions: uniqueStrings(requirement.openQuestions, 12),
      approvalBoundaryItems: uniqueStrings(requirement.approvalBoundaryItems, 12),
      acceptanceChecks: sanitizeAcceptanceChecks(requirement.acceptanceChecks),
      userValueFrame: sanitizeUserValueFrame(requirement.userValueFrame),
      selectedPlanningMode: normalizePlanningMode(requirement.selectedPlanningMode || selectedMode, "NORMAL"),
      selectedPlanningDepth: normalizePlanningDepth(requirement.selectedPlanningDepth || selectedPlanningDepth, "STANDARD_PLANNING"),
      selectedAssuranceDepth: normalizeAssuranceMode(requirement.selectedAssuranceDepth || selectedAssuranceDepth, "STANDARD_ASSURANCE"),
      planningModeReasons: uniqueStrings(requirement.planningModeReasons || selection.reasons, 16),
      assuranceDepthReasons: uniqueStrings(requirement.assuranceDepthReasons || selection.assuranceReasons, 16),
    },
    dispatchPlan: {
      schema: safeString(dispatchPlan.schema, 80) || "dispatch-plan.v2",
      source: safeString(dispatchPlan.source, 80) || "runtime_inferred_pre_dispatch",
      promptHash: safeString(dispatchPlan.promptHash, 80) || safeString(selection.promptHash, 80),
      planningMode: normalizePlanningMode(dispatchPlan.planningMode || selectedMode, "NORMAL"),
      planningDepth: normalizePlanningDepth(dispatchPlan.planningDepth || selectedPlanningDepth, "STANDARD_PLANNING"),
      assuranceDepth: normalizeAssuranceMode(dispatchPlan.assuranceDepth || selectedAssuranceDepth, "STANDARD_ASSURANCE"),
      taskFamily,
      familyProfileId,
      flowPath: safeString(dispatchPlan.flowPath, 80) || `${selectedMode}_PATH`,
      executionFlow: safeString(dispatchPlan.executionFlow, 120) || `${selectedPlanningDepth}+${selectedAssuranceDepth}`,
      proposalOnly: dispatchPlan.proposalOnly ? 1 : 0,
      reviewerRequired: dispatchPlan.reviewerRequired ? 1 : 0,
      testerRequired: dispatchPlan.testerRequired ? 1 : 0,
      signoffRequired: dispatchPlan.signoffRequired ? 1 : 0,
      dedicatedTestsRequired: dispatchPlan.dedicatedTestsRequired ? 1 : 0,
      dispatches: sanitizeDispatches(dispatchPlan.dispatches),
      sharedEscalationPoints: uniqueStrings(dispatchPlan.sharedEscalationPoints, 8),
      expectedEvidence: uniqueStrings(dispatchPlan.expectedEvidence, 16),
      residualRisks: uniqueStrings(dispatchPlan.residualRisks, 12),
    },
  };
}

module.exports = {
  allowedAssuranceModes,
  allowedAssuranceDepths: allowedAssuranceModes,
  allowedPlanningDepths,
  allowedPlanningModes,
  buildAssuranceSelection,
  buildDispatchPlan,
  buildPlanningArtifacts,
  buildPlanningDecisionContract,
  buildPlanningSelection,
  buildRequirementContract,
  defaultAssuranceModeContractPath,
  defaultAssuranceDepthContractPath: defaultAssuranceModeContractPath,
  defaultDispatchPlanSchemaPath,
  defaultPlanningDecisionContractSchemaPath,
  defaultPlanningModeContractPath,
  defaultRequirementContractSchemaPath,
  defaultTaskFamilyProfilesPath,
  loadAssuranceModeContract,
  loadAssuranceDepthContract: loadAssuranceModeContract,
  loadPlanningModeContract,
  loadTaskFamilyProfilesContract,
  normalizeAssuranceMode,
  normalizeAssuranceModeContract,
  normalizeAssuranceDepth: normalizeAssuranceMode,
  normalizeAssuranceDepthContract: normalizeAssuranceModeContract,
  normalizePlanningDepth,
  normalizePlanningMode,
  normalizePlanningModeContract,
  normalizeTaskFamilyProfilesContract,
  planningModePolicyVersion,
  sanitizePlanningArtifactsForRuntime,
  selectTaskFamilyProfile,
  toPlanningDepth,
};
