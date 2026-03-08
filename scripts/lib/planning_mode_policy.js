"use strict";

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

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
    };
  }
  return {
    planning: input && typeof input === "object" ? normalizePlanningModeContract(input) : loadPlanningModeContract(),
    assurance: loadAssuranceModeContract(),
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
  const match = normalized.match(/^(.+?[.?!])(?:\s|$)/);
  return match && match[1] ? safeString(match[1], 320) : normalized;
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
    flowPath: planning.flowPath,
    adaptiveFlowId: assurance.adaptiveFlowId,
    needsInputRecommended: planning.needsInputRecommended ? 1 : 0,
    proposalOnlyRecommended: planning.selectedMode === "DISCOVERY" ? 1 : 0,
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
    assumptions.push("Some task boundaries still depend on prompt interpretation.");
  }
  if (!normalizedSelection.extracted.nonGoals.length) {
    assumptions.push("Anything outside the explicit goal stays proposal-only unless the prompt says otherwise.");
  }
  return {
    schema: "requirement-contract.v2",
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
      schema: safeString(requirement.schema, 80) || "requirement-contract.v2",
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

function extractQuestionCandidates(prompt, keywords) {
  const matches = [];
  for (const line of safeString(prompt, 40000).split(/\r?\n/)) {
    const normalized = safeString(line, 280);
    if (!normalized) continue;
    if (/\b(?:no|without)\s+open questions?\b/i.test(normalized) || /\bopen questions?\s+(?:are|is)\s+not\b/i.test(normalized)) continue;
    if (/[?？]/.test(normalized) || hasAnyKeyword(normalized, keywords)) {
      matches.push(normalized.replace(/^\s*[-*+]\s*/, ""));
    }
  }
  return uniqueStrings(matches, 12);
}

function detectApprovalBoundaryItems(prompt, keywords) {
  return uniqueStrings(matchingKeywords(prompt, keywords, 12), 12);
}

function detectSpecialistOwners(prompt, keywordMap) {
  const lower = safeString(prompt, 40000).toLowerCase();
  const owners = [];
  for (const [role, keywords] of Object.entries(keywordMap || {})) {
    if ((Array.isArray(keywords) ? keywords : []).some((keyword) => textIncludesKeyword(lower, keyword))) {
      owners.push(role);
    }
  }
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
  const lower = safeString(prompt, 40000).toLowerCase();
  if (openQuestionsCount >= 2 || /(new feature|greenfield|future product|design a new)/.test(lower)) return { id: "low", score: 0 };
  if (baselineScopeCount >= 1 && acceptanceScore >= 1 && /(existing|small|only|change only|modify only|bounded)/.test(lower)) return { id: "high", score: 2 };
  if (baselineScopeCount >= 1 || acceptanceScore >= 1) return { id: "medium", score: 1 };
  return { id: "low", score: 0 };
}

function scoreChangeScopeClarity({ prompt, baselineScopeCount, specialistBoundaryCount }) {
  const lower = safeString(prompt, 40000).toLowerCase();
  const pathHints = /(?:server\.js|docs\/|web\/|scripts\/|scripts\/config\/|harness_map\.md|readme)/.test(lower);
  if ((baselineScopeCount >= 1 || pathHints) && specialistBoundaryCount <= 1) return { id: "high", score: 2 };
  if (baselineScopeCount >= 1 || pathHints || specialistBoundaryCount <= 2) return { id: "medium", score: 1 };
  return { id: "low", score: 0 };
}

function extractAcceptanceChecks(prompt, sections, contract) {
  const aliases = contract && contract.signals && contract.signals.sectionAliases ? contract.signals.sectionAliases.acceptance : [];
  const fromSections = collectEntriesFromSections(collectSectionsByAlias(sections, aliases));
  const exactReplyMatch = safeString(prompt, 40000).match(/reply with exactly:\s*([^\r\n]+)/i);
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
  return firstSentence(extractPromptParagraphs(prompt)[0] || prompt);
}

function extractImplicitGoal(prompt, sections, contract) {
  const aliases = contract && contract.signals && contract.signals.sectionAliases ? contract.signals.sectionAliases.background : [];
  const backgroundEntries = collectEntriesFromSections(collectSectionsByAlias(sections, aliases));
  if (backgroundEntries.length) return firstSentence(backgroundEntries.join(" "));
  return firstSentence(extractPromptParagraphs(prompt).slice(1, 3).join(" "));
}

function detectScopeAreas(prompt, baselineScope) {
  const lower = safeString(prompt, 40000).toLowerCase();
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
  const text = safeString(prompt, 40000);
  const areas = detectScopeAreas(prompt, selection.extracted.baselineScope);
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
  const signoffRequired =
    signoffImportant ||
    irreversibleRisk ||
    riskScore >= assuranceContract.thresholds.signoff.minRiskScore ||
    (newLogicRisk && regressionRiskScore >= assuranceContract.thresholds.signoff.minRegressionRiskScore);
  const selectedAssuranceDepth = signoffRequired ? "SIGNOFF_ASSURANCE" : lightEligible ? "LIGHT_ASSURANCE" : "STANDARD_ASSURANCE";
  return {
    selectedAssuranceDepth,
    reasons: [
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

function buildPlanningSelection({ prompt = "", options = {}, contract } = {}) {
  const contracts = loadAdaptiveContracts(contract);
  const sections = parsePromptSections(prompt);
  const aliases = contracts.planning.signals.sectionAliases;
  const acceptanceChecks = extractAcceptanceChecks(prompt, sections, contracts.planning);
  const baselineScope = uniqueStrings([
    ...collectEntriesFromSections(collectSectionsByAlias(sections, aliases.baseline)),
    ...collectEntriesFromSections(collectSectionsByAlias(sections, aliases.constraints)),
  ], 24);
  const nonGoals = collectEntriesFromSections(collectSectionsByAlias(sections, aliases.nonGoals));
  const openQuestions = extractQuestionCandidates(prompt, contracts.planning.signals.openQuestionKeywords);
  const approvalBoundaryItems = detectApprovalBoundaryItems(prompt, contracts.planning.signals.approvalBoundaryKeywords);
  const userDecisionRequired = approvalBoundaryItems.length > 0 || openQuestions.length > 0 || hasAnyKeyword(prompt, contracts.planning.signals.userDecisionKeywords);
  const specialistOwners = detectSpecialistOwners(prompt, contracts.planning.signals.specialistKeywords);
  const acceptanceClarity = scoreAcceptanceClarity(acceptanceChecks);
  const overDeliveryRisk = scoreOverDeliveryRisk({ prompt, keywords: contracts.planning.signals.overDeliveryRiskKeywords, specialistBoundaryCount: specialistOwners.length, acceptanceScore: acceptanceClarity.score });
  const assumptionDependence = scoreAssumptionDependence({
    acceptanceScore: acceptanceClarity.score,
    openQuestionsCount: openQuestions.length,
    baselineScopeCount: baselineScope.length,
    promptLength: safeString(prompt, 40000).length,
  });
  const existingSpecClarity = scoreExistingSpecClarity({ prompt, baselineScopeCount: baselineScope.length, acceptanceScore: acceptanceClarity.score, openQuestionsCount: openQuestions.length });
  const changeScopeClarity = scoreChangeScopeClarity({ prompt, baselineScopeCount: baselineScope.length, specialistBoundaryCount: specialistOwners.length });
  const fastEligible =
    openQuestions.length <= contracts.planning.thresholds.fast.maxOpenQuestions &&
    acceptanceClarity.score >= contracts.planning.thresholds.fast.minAcceptanceScore &&
    specialistOwners.length <= contracts.planning.thresholds.fast.maxSpecialistBoundaries &&
    approvalBoundaryItems.length === 0 &&
    !userDecisionRequired &&
    assumptionDependence.score <= contracts.planning.thresholds.fast.maxAssumptionScore &&
    overDeliveryRisk.score <= contracts.planning.thresholds.fast.maxOverDeliveryRiskScore &&
    existingSpecClarity.score >= contracts.planning.thresholds.fast.minExistingSpecClarityScore &&
    changeScopeClarity.score >= contracts.planning.thresholds.fast.minChangeScopeClarityScore;
  const discoveryRequired =
    approvalBoundaryItems.length > 0 ||
    userDecisionRequired ||
    openQuestions.length >= contracts.planning.thresholds.discovery.minOpenQuestions ||
    acceptanceClarity.score <= contracts.planning.thresholds.discovery.maxAcceptanceScore ||
    assumptionDependence.score >= contracts.planning.thresholds.discovery.minAssumptionScore ||
    overDeliveryRisk.score >= contracts.planning.thresholds.discovery.minOverDeliveryRiskScore ||
    existingSpecClarity.score <= contracts.planning.thresholds.discovery.maxExistingSpecClarityScore ||
    changeScopeClarity.score <= contracts.planning.thresholds.discovery.maxChangeScopeClarityScore;
  const selectedMode = discoveryRequired ? "DISCOVERY" : fastEligible ? "FAST" : "NORMAL";
  const selectedPlanningDepth = toPlanningDepth(selectedMode);
  const planningReasons = [
    `openQuestions=${openQuestions.length}`,
    `acceptanceClarity=${acceptanceClarity.id}`,
    `specialistBoundaries=${specialistOwners.length}`,
    `approvalBoundaryTouched=${approvalBoundaryItems.length > 0 ? "yes" : "no"}`,
    `overDeliveryRisk=${overDeliveryRisk.id}`,
    `userDecisionRequired=${userDecisionRequired ? "yes" : "no"}`,
    `assumptionDependence=${assumptionDependence.id}`,
    `existingSpecClarity=${existingSpecClarity.id}`,
    `changeScopeClarity=${changeScopeClarity.id}`,
  ];
  const selection = {
    schema: "adaptive-execution-selection.v1",
    version: planningModePolicyVersion,
    promptHash: hashPrompt(prompt),
    selectedMode,
    selectedPlanningDepth,
    flowPath: `${selectedMode}_PATH`,
    executionFlow: "",
    reasons: planningReasons,
    planningReasons,
    needsInputRecommended: selectedMode === "DISCOVERY" && (userDecisionRequired || approvalBoundaryItems.length > 0 || openQuestions.length > 0),
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
      assumptionDependence: assumptionDependence.id,
      existingSpecClarity: existingSpecClarity.id,
      changeScopeClarity: changeScopeClarity.id,
    },
    extracted: {
      explicitGoal: extractExplicitGoal(prompt, sections, contracts.planning),
      implicitGoal: extractImplicitGoal(prompt, sections, contracts.planning),
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
    },
  };
  const assuranceSelection = buildAssuranceSelection({ prompt, selection, assuranceContract: contracts.assurance });
  selection.selectedAssuranceDepth = assuranceSelection.selectedAssuranceDepth;
  selection.assuranceReasons = assuranceSelection.reasons;
  selection.assuranceSignals = assuranceSelection.signals;
  selection.executionFlow = `${selection.selectedPlanningDepth}+${selection.selectedAssuranceDepth}`;
  return selection;
}

function buildRequirementContract({ prompt = "", options = {}, selection, contract } = {}) {
  const normalizedSelection = selection && typeof selection === "object" ? selection : buildPlanningSelection({ prompt, options, contract });
  const assumptions = [];
  if (normalizedSelection.signals.assumptionDependence !== "low") {
    assumptions.push(
      normalizedSelection.signals.acceptanceClarity === "low"
        ? "Acceptance checks are not fully specified, so implementation details may require user confirmation."
        : "Some task boundaries still depend on inferred scope from the prompt."
    );
  }
  if (!normalizedSelection.extracted.nonGoals.length) assumptions.push("Any scope outside the explicit goal should stay proposal-only unless the prompt states otherwise.");
  return {
    schema: "requirement-contract.v1",
    source: "runtime_inferred_pre_dispatch",
    promptHash: normalizedSelection.promptHash,
    explicitGoal: normalizedSelection.extracted.explicitGoal,
    implicitGoal: normalizedSelection.extracted.implicitGoal,
    baselineScope: normalizedSelection.extracted.baselineScope,
    overDeliveryScope: normalizedSelection.extracted.overDeliveryScope,
    nonGoals: normalizedSelection.extracted.nonGoals,
    assumptions: uniqueStrings(assumptions, 8),
    openQuestions: normalizedSelection.extracted.openQuestions,
    approvalBoundaryItems: normalizedSelection.extracted.approvalBoundaryItems,
    acceptanceChecks: normalizedSelection.extracted.acceptanceChecks,
    selectedPlanningMode: normalizedSelection.selectedMode,
    selectedPlanningDepth: normalizedSelection.selectedPlanningDepth,
    selectedAssuranceDepth: normalizedSelection.selectedAssuranceDepth,
    planningModeReasons: normalizedSelection.planningReasons,
    assuranceDepthReasons: normalizedSelection.assuranceReasons,
  };
}

function defaultOwnedPathsForRole(role, prompt) {
  const lower = safeString(prompt, 40000).toLowerCase();
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
      return ["fact_finding_notes"];
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
  const reviewerRequired = normalizedSelection.selectedPlanningDepth !== "FAST_PLANNING" || Boolean(normalizedSelection.assuranceSignals && normalizedSelection.assuranceSignals.reviewerSuggested) || normalizedSelection.signals.specialistBoundaryCount > 1;
  const testerRequired = assuranceDepth === "SIGNOFF_ASSURANCE" || Boolean(normalizedSelection.assuranceSignals && normalizedSelection.assuranceSignals.testerSuggested);
  const signoffRequired = assuranceDepth === "SIGNOFF_ASSURANCE";
  const dedicatedTestsRequired = assuranceDepth === "SIGNOFF_ASSURANCE" && Boolean(normalizedSelection.assuranceSignals && (normalizedSelection.assuranceSignals.newLogicRisk || normalizedSelection.assuranceSignals.runtimeTouch || normalizedSelection.assuranceSignals.protocolTouch));
  const dispatches = [];
  if (normalizedSelection.selectedPlanningDepth === "DISCOVERY_PLANNING") {
    dispatches.push({
      dispatchId: "dispatch-default-discovery",
      ownerAgent: safeString(options && options.agentName, 80) || "default",
      ownedPaths: [],
      taskSummary: "Clarify unresolved requirements, non-goals, assumptions, and approval-boundary items before implementation.",
      acceptanceChecks: acceptanceIds,
      toolsMcpRequirements: ["planning_contract", "read_only_analysis"],
      reviewerRequired: 0,
      testerRequired: 0,
      signoffRequired: signoffRequired ? 1 : 0,
      escalationPoint: "If blocking questions or approval-boundary items remain, stop with NEEDS_INPUT.",
      expectedEvidence: uniqueStrings(["requirement_contract", "flow_trace_summary", "open_questions"], 8),
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
          ? "Own contracts, docs sync, runtime observability, and signoff-facing evidence updates."
          : role === "backend_worker"
            ? "Own server-side orchestration, policies, and runtime behavior changes."
            : role === "frontend_worker"
              ? "Own UI and operator-facing web changes."
              : "Own bounded specialist execution for the selected scope.",
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
  if (normalizedSelection.selectedPlanningDepth === "DISCOVERY_PLANNING") residualRisks.push("Implementation is intentionally paused until user decisions resolve the open questions.");
  else if (normalizedSelection.signals.assumptionDependence !== "low") residualRisks.push("Some implementation details still depend on inferred assumptions from the prompt.");
  if (dedicatedTestsRequired) residualRisks.push("New logic or protocol-sensitive behavior requires dedicated verification before signoff.");
  return {
    schema: "dispatch-plan.v1",
    source: "runtime_inferred_pre_dispatch",
    promptHash: normalizedSelection.promptHash,
    planningMode: normalizedSelection.selectedMode,
    planningDepth: normalizedSelection.selectedPlanningDepth,
    assuranceDepth,
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
  const requirementContract = buildRequirementContract({ prompt, options, selection, contract: contracts });
  const dispatchPlan = buildDispatchPlan({ prompt, options, selection, requirementContract, contract: contracts });
  return { schema: "planning-artifacts.v2", policyVersion: planningModePolicyVersion, contracts, selection, requirementContract, dispatchPlan };
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
  const requirement = payload.requirementContract && typeof payload.requirementContract === "object" ? payload.requirementContract : {};
  const dispatchPlan = payload.dispatchPlan && typeof payload.dispatchPlan === "object" ? payload.dispatchPlan : {};
  const selectedMode = normalizePlanningMode(selection.selectedMode || requirement.selectedPlanningMode || dispatchPlan.planningMode, "NORMAL");
  const selectedPlanningDepth = normalizePlanningDepth(selection.selectedPlanningDepth || requirement.selectedPlanningDepth || dispatchPlan.planningDepth || toPlanningDepth(selectedMode), "STANDARD_PLANNING");
  const selectedAssuranceDepth = normalizeAssuranceMode(selection.selectedAssuranceDepth || requirement.selectedAssuranceDepth || dispatchPlan.assuranceDepth, "STANDARD_ASSURANCE");
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
        assumptionDependence: safeString(selection.signals && selection.signals.assumptionDependence, 40) || "low",
        existingSpecClarity: safeString(selection.signals && selection.signals.existingSpecClarity, 40) || "low",
        changeScopeClarity: safeString(selection.signals && selection.signals.changeScopeClarity, 40) || "low",
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
    requirementContract: {
      schema: safeString(requirement.schema, 80) || "requirement-contract.v2",
      source: safeString(requirement.source, 80) || "runtime_inferred_pre_dispatch",
      promptHash: safeString(requirement.promptHash, 80) || safeString(selection.promptHash, 80),
      explicitGoal: safeString(requirement.explicitGoal, 320),
      implicitGoal: safeString(requirement.implicitGoal, 320),
      baselineScope: uniqueStrings(requirement.baselineScope, 24),
      overDeliveryScope: uniqueStrings(requirement.overDeliveryScope, 16),
      nonGoals: uniqueStrings(requirement.nonGoals, 16),
      assumptions: uniqueStrings(requirement.assumptions, 12),
      openQuestions: uniqueStrings(requirement.openQuestions, 12),
      approvalBoundaryItems: uniqueStrings(requirement.approvalBoundaryItems, 12),
      acceptanceChecks: sanitizeAcceptanceChecks(requirement.acceptanceChecks),
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
  loadAssuranceModeContract,
  loadAssuranceDepthContract: loadAssuranceModeContract,
  loadPlanningModeContract,
  normalizeAssuranceMode,
  normalizeAssuranceModeContract,
  normalizeAssuranceDepth: normalizeAssuranceMode,
  normalizeAssuranceDepthContract: normalizeAssuranceModeContract,
  normalizePlanningDepth,
  normalizePlanningMode,
  normalizePlanningModeContract,
  planningModePolicyVersion,
  sanitizePlanningArtifactsForRuntime,
  toPlanningDepth,
};
