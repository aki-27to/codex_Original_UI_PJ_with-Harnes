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

function stripGoalLabelPrefix(text, max = 320) {
  return safeString(text, max)
    .replace(/^(?:goal|purpose|request|main objective)\s*[:：-]?\s*/i, "")
    .replace(/^(?:依頼文|依頼|目的|主目的|製作目的)(?:は)?\s*[:：-]?\s*/u, "")
    .trim();
}

function splitPromptRequirementSentences(text, max = 6) {
  const sentences = safeString(text, 320).match(/[^.?!。！？]+(?:[.?!。！？]+|$)/gu) || [];
  return sentences
    .map((entry) => safeString(entry, 320))
    .filter(Boolean)
    .slice(0, max);
}

function stripRequirementLeadSentences(text) {
  const sentences = splitPromptRequirementSentences(text, 8);
  while (sentences.length > 0) {
    const first = safeString(sentences[0], 320);
    if (!first) {
      sentences.shift();
      continue;
    }
    if (!isGreetingOnlyLine(first) && !isComplaintLeadLine(first)) break;
    sentences.shift();
  }
  return sentences.join("").trim();
}

function normalizePromptRequirementLine(text, max = 320) {
  return stripRequirementLeadSentences(
    safeString(text, max)
    .replace(/^\s*[-*+]\s*/, "")
    .replace(/^\s*\d+[.)．、]\s*/, "")
    .replace(/^\s{0,3}#{1,6}\s*/, "")
    .trim(),
    max
  );
}

function isGreetingOnlyLine(text) {
  return /^(?:ありがとうございます|ありがとう|よろしくお願いします|お願いします|承知しました|了解です|すみません|失礼しました|お疲れさまです|お疲れ様です)(?:[。.!！…]|$)/u.test(safeString(text, 240));
}

function isComplaintLeadLine(text) {
  const normalized = safeString(text, 320);
  return /(?:思っていた.+違います|全然違います|おかしい仕様|おかしい表示|変な表示|ふざけた表示)/u.test(normalized);
}

function splitPromptIntoRequirementLines(prompt, max = 24) {
  const out = [];
  for (const rawLine of sanitizePromptForPolicyAnalysis(prompt).split(/\r?\n/)) {
    const normalized = normalizePromptRequirementLine(rawLine, 320);
    if (!normalized || out.includes(normalized)) continue;
    out.push(normalized);
    if (out.length >= max) break;
  }
  return out;
}

function scoreGoalCandidate(text) {
  const normalized = normalizePromptRequirementLine(text, 320);
  if (!normalized) return Number.NEGATIVE_INFINITY;
  if (isGreetingOnlyLine(normalized)) return Number.NEGATIVE_INFINITY;
  let score = 0;
  if (isComplaintLeadLine(normalized)) score -= 6;
  if (/(?:goal|purpose|request|main objective|目的|主目的|製作目的)/iu.test(text)) score += 6;
  if (/^(?:以下|次|この)(?:の)?要件(?:で|を)/u.test(normalized)) score += 4;
  if (/(?:してください|して下さい|したい|したく|したうえで|すること|とすること|を作る|を作成|を開発|を再構築|を修正|を更新|を改善|を説明|を起動|を調査|を実施)/u.test(normalized)) score += 4;
  if (/(?:サイト|ページ|UI|アプリ|機能|採用|説明会|TOP|トップ)/iu.test(normalized)) score += 2;
  if (/(?:ページ数|会社名|参考サイト|画像|フォント|問合せページ|問い合わせページ|配下で作業|空欄|配下)/u.test(normalized)) score -= 2;
  if (/[?？]/u.test(normalized)) score -= 1;
  if (normalized.length <= 6) score -= 3;
  return score;
}

function selectBestGoalCandidate(candidates) {
  let bestText = "";
  let bestScore = 0;
  for (const entry of Array.isArray(candidates) ? candidates : []) {
    const normalized = normalizePromptRequirementLine(entry, 320);
    const score = scoreGoalCandidate(entry);
    if (score <= bestScore) continue;
    bestScore = score;
    const displayText = stripGoalLabelPrefix(normalized, 320);
    bestText = displayText.length <= 180 ? displayText : firstSentence(displayText);
  }
  return bestText;
}

function inferBaselineScopeFromPrompt(prompt, explicitGoal = "", max = 24) {
  const excluded = new Set([
    normalizePromptRequirementLine(explicitGoal, 320).toLowerCase(),
    stripGoalLabelPrefix(normalizePromptRequirementLine(explicitGoal, 320), 320).toLowerCase(),
  ].filter(Boolean));
  const inferred = [];
  const stitchContext = extractStitchPromptContext(prompt);
  if (stitchContext) {
    const stitchScope = buildStitchBaselineScope(stitchContext);
    for (const entry of stitchScope) {
      if (!entry) continue;
      inferred.push(entry);
      if (inferred.length >= max) break;
    }
  }
  for (const entry of splitPromptIntoRequirementLines(prompt, 48)) {
    const normalized = normalizePromptRequirementLine(entry, 320);
    if (!normalized) continue;
    const normalizedKey = stripGoalLabelPrefix(normalized, 320).toLowerCase() || normalized.toLowerCase();
    if (excluded.has(normalizedKey)) continue;
    if (isGreetingOnlyLine(normalized) || isComplaintLeadLine(normalized)) continue;
    if (/^(?:以下|次|この)(?:の)?要件(?:で|を)/u.test(normalized)) continue;
    if (
      isHardConstraintDirective(normalized)
      || /(?:ページ数|会社名|参考サイト|画像|フォント|問合せページ|問い合わせページ|配下で作業|空欄|表示できる状態|作業を実施|含むこと|メインに|TOPにする|トップにする|準拠|配下|有限会社|株式会社|合同会社|https?:\/\/)/u.test(normalized)
    ) {
      inferred.push(normalized);
    }
    if (inferred.length >= max) break;
  }
  return uniqueStrings(inferred, max);
}

function extractStitchPromptContext(prompt = "") {
  const text = safeString(prompt, 40000);
  if (!/stitch/i.test(text)) return null;
  const lines = text.split(/\r?\n/);
  let section = "";
  let projectTitle = "";
  let projectId = "";
  const screens = [];
  let currentScreen = null;
  for (const rawLine of lines) {
    const headingMatch = safeString(rawLine, 240).match(/^\s{0,3}#{1,6}\s*(.+?)\s*$/);
    if (headingMatch) {
      const heading = normalizeHeadingLabel(headingMatch[1]);
      if (heading.includes("project")) section = "project";
      else if (heading.includes("screen")) section = "screens";
      else section = "";
      continue;
    }
    const line = safeString(rawLine, 240).replace(/^\s*[-*+]\s*/, "").trim();
    if (!line) continue;
    const titleMatch = line.match(/^title\s*:\s*(.+)$/i);
    if (titleMatch && titleMatch[1]) {
      projectTitle = normalizePromptRequirementLine(titleMatch[1], 200) || safeString(titleMatch[1], 200).trim();
      continue;
    }
    const idMatch = line.match(/^id\s*:\s*([A-Za-z0-9_-]+)\s*$/i);
    if (idMatch && idMatch[1]) {
      if (section === "screens" && currentScreen && !currentScreen.id) currentScreen.id = idMatch[1];
      else if (!projectId || section === "project") projectId = idMatch[1];
      continue;
    }
    if (section === "screens") {
      const screenTitle = safeString(line, 240).replace(/^\s*\d+[.)]\s*/, "").trim();
      if (!screenTitle || /^screens?\s*:/i.test(screenTitle) || /^use a utility/i.test(screenTitle)) continue;
      currentScreen = { title: screenTitle, id: "" };
      screens.push(currentScreen);
    }
  }
  const fetchImagesAndCode = /get the images and code|images and code/i.test(text);
  const requiresHostedUrlDownload = /curl\s+-L/i.test(text) || /hosted urls?/i.test(text);
  const strictRecreation = /(?:完全再現|忠実再現|recreate(?: it)? exactly|match as closely as possible|pixel-?perfect|verbatim recreation|same look|same as the reference)/i.test(text);
  if (!projectTitle && !projectId && !screens.length && !fetchImagesAndCode) return null;
  return {
    projectTitle,
    projectId,
    screens,
    fetchImagesAndCode,
    requiresHostedUrlDownload,
    strictRecreation,
  };
}

function buildStitchRecreationGoal(stitchContext) {
  const context = stitchContext && typeof stitchContext === "object" ? stitchContext : null;
  if (!context) return "";
  const primaryScreen = Array.isArray(context.screens) && context.screens.length ? context.screens[0] : null;
  const projectPart = context.projectTitle ? `Stitch の「${context.projectTitle}」内の` : "Stitch の指定";
  const screenPart = primaryScreen && primaryScreen.title ? `「${primaryScreen.title}」画面` : "screen";
  const fetchPart = context.fetchImagesAndCode ? "の画像とコードを取得し、" : "を基準に、";
  const actionPart = context.strictRecreation ? "WEB UI に忠実再現する" : "WEB UI に反映する";
  return `${projectPart}${screenPart}${fetchPart}${actionPart}`;
}

function buildStitchBaselineScope(stitchContext) {
  const context = stitchContext && typeof stitchContext === "object" ? stitchContext : null;
  if (!context) return [];
  const out = [];
  if (context.projectTitle || context.projectId) {
    out.push(`Stitch project: ${[context.projectTitle, context.projectId ? `ID ${context.projectId}` : ""].filter(Boolean).join(" / ")}`);
  }
  const primaryScreen = Array.isArray(context.screens) && context.screens.length ? context.screens[0] : null;
  if (primaryScreen && primaryScreen.title) {
    out.push(`Stitch screen: ${[primaryScreen.title, primaryScreen.id ? `ID ${primaryScreen.id}` : ""].filter(Boolean).join(" / ")}`);
  }
  if (context.fetchImagesAndCode) out.push("Stitch の画像とコードを取得して実装の基準にする");
  if (context.requiresHostedUrlDownload) out.push("hosted URL は curl -L で取得する");
  if (context.strictRecreation) out.push("指定 screen の再現を最優先にする");
  return uniqueStrings(out, 6);
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
  const stitchGoal = buildStitchRecreationGoal(extractStitchPromptContext(prompt));
  if (stitchGoal) return stitchGoal;
  const aliases = contract && contract.signals && contract.signals.sectionAliases ? contract.signals.sectionAliases.goal : [];
  const goalEntries = collectEntriesFromSections(collectSectionsByAlias(sections, aliases));
  const goalFromSections = selectBestGoalCandidate(goalEntries);
  if (goalFromSections) return goalFromSections;
  const goalFromPromptLines = selectBestGoalCandidate(safeString(prompt, 40000).split(/\r?\n/));
  if (goalFromPromptLines) return goalFromPromptLines;
  if (/[?？]/.test(safeString(prompt, 40000))) {
    const inferredQuestionGoal = inferQuestionAnswerGoal(prompt);
    if (inferredQuestionGoal) return inferredQuestionGoal;
  }
  const paragraphs = extractPromptParagraphs(prompt);
  for (const paragraph of paragraphs) {
    const candidate = normalizePromptRequirementLine(paragraph, 320);
    if (!candidate || isGreetingOnlyLine(candidate) || isComplaintLeadLine(candidate)) continue;
    return firstSentence(candidate);
  }
  return firstSentence(prompt);
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

function buildRequirementContract_legacy({ prompt = "", options = {}, selection, assuranceSelection, contract } = {}) {
  const normalizedSelection = selection && typeof selection === "object" ? selection : buildPlanningSelection({ prompt, options, contract });
  const normalizedAssurance = assuranceSelection && typeof assuranceSelection === "object" ? assuranceSelection : buildAssuranceSelection({ prompt, options, selection: normalizedSelection });
  const assumptions = [];
  if (normalizedSelection.signals.assumptionDependence !== "low") {
    assumptions.push("タスク境界の一部は、まだ入力文の解釈に依存している。");
  }
  if (!normalizedSelection.extracted.nonGoals.length) {
    assumptions.push("Anything outside the explicit goal stays proposal-only unless the prompt says otherwise.");
  }
  if (uniqueStrings(deferredQuestions.defaultable, 8).length) {
    assumptions.push("Low-risk requirement gaps were defaulted against the locked goal, bounded scope, and inferred acceptance checks.");
  }
  if (uniqueStrings(deferredQuestions.taste, 8).length) {
    assumptions.push("Taste-sensitive questions are deferred behind the anchored direction so they do not block the core path.");
  }
  if (uniqueStrings(deferredQuestions.defaultable, 8).length) {
    assumptions.push("Low-risk requirement gaps were defaulted against the locked goal, bounded scope, and inferred acceptance checks.");
  }
  if (uniqueStrings(deferredQuestions.taste, 8).length) {
    assumptions.push("Taste-sensitive questions are deferred behind the anchored direction so they do not block the core path.");
  }
  const userValueFrame = buildUserValueFrame({
    prompt,
    explicitGoal: normalizedSelection.extracted.explicitGoal,
    implicitGoal: normalizedSelection.extracted.implicitGoal,
    taskFamily: safeString(normalizedSelection.taskFamily, 80) || "deterministic_code",
    baselineScope: normalizedSelection.extracted.baselineScope,
    nonGoals: inferNonGoals(normalizedSelection.extracted.nonGoals, normalizedSelection.selectedMode),
    acceptanceChecks: normalizedSelection.extracted.acceptanceChecks,
    approvalBoundaryItems: normalizedSelection.extracted.approvalBoundaryItems,
    benchmarkCandidates: normalizedSelection.extracted.benchmarkCandidates,
  });
  const intentInterpretation = buildRequirementIntentInterpretation({
    prompt,
    explicitGoal: normalizedSelection.extracted.explicitGoal,
    implicitGoal: normalizedSelection.extracted.implicitGoal,
    baselineScope: normalizedSelection.extracted.baselineScope,
    userValueFrame,
  });
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
    userValueFrame,
    intentInterpretation,
    selectedPlanningMode: normalizedSelection.selectedMode,
    selectedPlanningDepth: normalizedSelection.selectedPlanningDepth,
    selectedAssuranceDepth: normalizedAssurance.selectedAssuranceDepth,
    planningModeReasons: normalizedSelection.reasons,
    assuranceDepthReasons: normalizedAssurance.reasons,
  };
}

function defaultOwnedPathsForRole_legacy(role, selection) {
  const pathHints = Array.isArray(selection && selection.extracted && selection.extracted.pathHints) ? selection.extracted.pathHints : [];
  if (role === "frontend_worker") return pathHints.filter((entry) => entry.startsWith("web/")).length ? pathHints.filter((entry) => entry.startsWith("web/")) : ["web/"];
  if (role === "infra_worker") return pathHints.filter((entry) => entry.startsWith("docs/") || entry.endsWith(".md")).length ? pathHints.filter((entry) => entry.startsWith("docs/") || entry.endsWith(".md")) : ["docs/", "scripts/config/"];
  return pathHints.filter((entry) => entry === "server.js" || entry.startsWith("scripts/")).length ? pathHints.filter((entry) => entry === "server.js" || entry.startsWith("scripts/")) : ["server.js", "scripts/"];
}

function defaultToolsForRole_legacy(role) {
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

function defaultEvidenceForRole_legacy(role, assuranceSelection) {
  const signoff = assuranceSelection && assuranceSelection.selectedAssuranceDepth === "SIGNOFF_ASSURANCE";
  if (role === "reviewer") return ["findings_first_review", "reviewer_summary"];
  if (role === "tester") return ["test_run", "tester_summary"];
  if (role === "explorer") return ["fact_finding_notes", "open_question_register"];
  return signoff ? ["file_change", "artifact_manifest", "doc_sync", "verification_command"] : ["file_change", "artifact_manifest"];
}

function buildDispatchPlan_legacy({ prompt = "", options = {}, selection, assuranceSelection, requirementContract, contract } = {}) {
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

function buildPlanningArtifacts_legacy({ prompt = "", options = {}, contract } = {}) {
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

function sanitizeAcceptanceChecks_legacy(value) {
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

function sanitizeDispatches_legacy(value) {
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

function sanitizePlanningArtifactsForRuntime_legacy(input) {
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
      userValueFrame: sanitizeUserValueFrame(requirement.userValueFrame),
      intentInterpretation: sanitizeRequirementIntentInterpretation(requirement.intentInterpretation),
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

const legacyPlanningModePolicyExports = {
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
  benchmarkCandidates = [],
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
    benchmarkCandidates: uniqueStrings([
      ...extractReferenceUrls(prompt, 6),
      ...uniqueStrings(benchmarkCandidates, 6),
    ], 6),
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

const allowedRequirementProvenanceSources = new Set(["user_explicit", "user_implied", "system_inferred", "policy_default"]);
const allowedRequirementStatuses = new Set(["DRAFT", "BLOCKED", "LOCKED", "REVISED"]);
const allowedRequirementValidationVerdicts = new Set(["PASS", "WARN", "BLOCK"]);

function normalizeRequirementProvenanceSource(value, fallback = "system_inferred") {
  const normalized = safeString(value, 40);
  if (allowedRequirementProvenanceSources.has(normalized)) return normalized;
  return allowedRequirementProvenanceSources.has(fallback) ? fallback : "system_inferred";
}

function normalizeRequirementStatus(value, fallback = "DRAFT") {
  const normalized = safeString(value, 40).toUpperCase();
  if (allowedRequirementStatuses.has(normalized)) return normalized;
  return allowedRequirementStatuses.has(fallback) ? fallback : "DRAFT";
}

function normalizeRequirementValidationVerdict(value, fallback = "WARN") {
  const normalized = safeString(value, 40).toUpperCase();
  if (allowedRequirementValidationVerdicts.has(normalized)) return normalized;
  return allowedRequirementValidationVerdicts.has(fallback) ? fallback : "WARN";
}

function buildRequirementFieldProvenance(source, reason = "") {
  return {
    source: normalizeRequirementProvenanceSource(source, "system_inferred"),
    reason: safeString(reason, 120),
  };
}

function normalizeRequirementProvenanceCompareKey(value) {
  return safeString(value, 320)
    .replace(/^explicit user approval is required before:\s*/i, "")
    .replace(/[?？!！。．:：/／、,\s"'`()\-\[\]{}]+/g, "")
    .toLowerCase();
}

function requirementProvenanceValuesOverlap(left, right, { minLength = 8 } = {}) {
  const leftKey = normalizeRequirementProvenanceCompareKey(left);
  const rightKey = normalizeRequirementProvenanceCompareKey(right);
  if (!leftKey || !rightKey) return false;
  if (leftKey === rightKey) return true;
  if (leftKey.length >= minLength && rightKey.includes(leftKey)) return true;
  if (rightKey.length >= minLength && leftKey.includes(rightKey)) return true;
  return false;
}

function promptMentionsRequirementValue(prompt, value) {
  const promptKey = normalizeRequirementProvenanceCompareKey(prompt);
  const valueKey = normalizeRequirementProvenanceCompareKey(value);
  if (!promptKey || !valueKey || valueKey.length < 8) return false;
  return promptKey.includes(valueKey);
}

function buildRequirementValueProvenanceEntries(values, resolver, max = 16) {
  const list = uniqueStrings(values, max);
  return list.map((value) => {
    const resolved = typeof resolver === "function" ? resolver(value) : {};
    return {
      value,
      source: normalizeRequirementProvenanceSource(resolved && resolved.source, "system_inferred"),
      reason: safeString(resolved && resolved.reason, 120),
    };
  });
}

function sanitizeRequirementFieldProvenance(value, fallbackSource = "system_inferred") {
  const source = value && typeof value === "object" ? value : {};
  return {
    source: normalizeRequirementProvenanceSource(source.source, fallbackSource),
    reason: safeString(source.reason, 120),
  };
}

function sanitizeRequirementValueProvenanceEntries(values, fallbackSource = "system_inferred", max = 16) {
  return (Array.isArray(values) ? values : []).map((entry) => {
    const item = entry && typeof entry === "object" ? entry : {};
    const value = safeString(item.value, 320);
    if (!value) return null;
    return {
      value,
      source: normalizeRequirementProvenanceSource(item.source, fallbackSource),
      reason: safeString(item.reason, 120),
    };
  }).filter(Boolean).slice(0, max);
}

function findRequirementValueProvenanceSource(entries, value, fallbackSource = "system_inferred") {
  const normalizedEntries = Array.isArray(entries) ? entries : [];
  for (const entry of normalizedEntries) {
    if (!entry || typeof entry !== "object") continue;
    if (!requirementProvenanceValuesOverlap(entry.value, value)) continue;
    return normalizeRequirementProvenanceSource(entry.source, fallbackSource);
  }
  return fallbackSource ? normalizeRequirementProvenanceSource(fallbackSource, "system_inferred") : "";
}

function getRequirementGoalAnchor(requirementContract) {
  const requirement = requirementContract && typeof requirementContract === "object" ? requirementContract : {};
  const hypotheses = sanitizeRequirementIntentHypotheses(requirement.intentHypotheses, requirement);
  return safeString(requirement.lockedGoal, 320)
    || safeString(requirement.explicitGoal, 320)
    || safeString(requirement.implicitGoal, 320)
    || safeString(hypotheses[0] && hypotheses[0].goal, 320)
    || safeString(requirement.intentInterpretation && requirement.intentInterpretation.direction, 320);
}

function getRequirementGoalAnchorFieldRefs(requirementContract) {
  const requirement = requirementContract && typeof requirementContract === "object" ? requirementContract : {};
  const refs = [];
  if (safeString(requirement.lockedGoal, 320)) refs.push("lockedGoal");
  if (safeString(requirement.explicitGoal, 320)) refs.push("explicitGoal");
  if (safeString(requirement.implicitGoal, 320)) refs.push("implicitGoal");
  if (sanitizeRequirementIntentHypotheses(requirement.intentHypotheses, requirement).length) refs.push("intentHypotheses");
  if (safeString(requirement.intentInterpretation && requirement.intentInterpretation.direction, 320)) refs.push("intentInterpretation.direction");
  return refs.length ? uniqueStrings(refs, 5) : ["lockedGoal", "explicitGoal", "implicitGoal", "intentHypotheses", "intentInterpretation.direction"];
}

function requirementHasCoreData(requirementContract) {
  const requirement = requirementContract && typeof requirementContract === "object" ? requirementContract : {};
  return Boolean(
    getRequirementGoalAnchor(requirement)
    || uniqueStrings(requirement.baselineScope, 24).length
    || uniqueStrings(requirement.overDeliveryScope, 16).length
    || uniqueStrings(requirement.nonGoals, 16).length
    || uniqueStrings(requirement.assumptions, 12).length
    || uniqueStrings(requirement.openQuestions, 12).length
    || sanitizeAcceptanceChecks(requirement.acceptanceChecks).length
  );
}

function buildRequirementGoalProvenance({ prompt = "", sections = [], contract, explicitGoal = "", implicitGoal = "" } = {}) {
  const aliases = contract && contract.signals && contract.signals.sectionAliases ? contract.signals.sectionAliases : {};
  const goalEntries = collectEntriesFromSections(collectSectionsByAlias(sections, aliases.goal || []));
  const backgroundEntries = collectEntriesFromSections(collectSectionsByAlias(sections, aliases.background || []));
  let explicitSource = "policy_default";
  let explicitReason = "missing";
  if (explicitGoal) {
    if (goalEntries.some((entry) => requirementProvenanceValuesOverlap(entry, explicitGoal))) {
      explicitSource = "user_explicit";
      explicitReason = "goal_section";
    } else if (promptMentionsRequirementValue(prompt, explicitGoal) && !/[?？]/.test(safeString(prompt, 40000))) {
      explicitSource = "user_explicit";
      explicitReason = "prompt_line";
    } else if (/[?？]/.test(safeString(prompt, 40000))) {
      explicitSource = "system_inferred";
      explicitReason = "question_interpretation";
    } else if (promptMentionsRequirementValue(prompt, explicitGoal)) {
      explicitSource = "user_implied";
      explicitReason = "prompt_paragraph";
    } else {
      explicitSource = "system_inferred";
      explicitReason = "fallback_inference";
    }
  }
  let implicitSource = "policy_default";
  let implicitReason = "missing";
  if (implicitGoal) {
    if (backgroundEntries.some((entry) => requirementProvenanceValuesOverlap(entry, implicitGoal))) {
      implicitSource = "user_explicit";
      implicitReason = "background_section";
    } else if (promptMentionsRequirementValue(prompt, implicitGoal)) {
      implicitSource = "user_implied";
      implicitReason = "prompt_background";
    } else {
      implicitSource = "system_inferred";
      implicitReason = "fallback_background_inference";
    }
  }
  return {
    explicitGoal: buildRequirementFieldProvenance(explicitSource, explicitReason),
    implicitGoal: buildRequirementFieldProvenance(implicitSource, implicitReason),
  };
}

function buildRequirementNonGoalProvenance({ prompt = "", explicitNonGoals = [], finalNonGoals = [] } = {}) {
  const explicitList = uniqueStrings(explicitNonGoals, 16);
  return buildRequirementValueProvenanceEntries(finalNonGoals, (value) => {
    if (explicitList.some((entry) => requirementProvenanceValuesOverlap(entry, value))) {
      return { source: "user_explicit", reason: "non_goal_section" };
    }
    if (promptMentionsRequirementValue(prompt, value)) {
      return { source: "user_implied", reason: "prompt_non_goal" };
    }
    return { source: "policy_default", reason: "discovery_default_guardrail" };
  }, 16);
}

function buildRequirementIntentProvenance(intentInterpretation = {}) {
  const presentation = safeString(intentInterpretation.presentation, 40) === "progress_hypothesis" ? "progress_hypothesis" : "goal";
  return {
    presentation: buildRequirementFieldProvenance(
      presentation === "progress_hypothesis" ? "system_inferred" : "policy_default",
      presentation === "progress_hypothesis" ? "interpreted_question_presentation" : "default_goal_presentation"
    ),
    questionLike: buildRequirementFieldProvenance(
      intentInterpretation && intentInterpretation.questionLike ? "system_inferred" : "policy_default",
      intentInterpretation && intentInterpretation.questionLike ? "question_detector" : "not_question"
    ),
    direction: buildRequirementFieldProvenance(
      safeString(intentInterpretation && intentInterpretation.direction, 320) ? "system_inferred" : "policy_default",
      safeString(intentInterpretation && intentInterpretation.direction, 320) ? "direction_interpretation" : "no_direction_interpretation"
    ),
    hypothesis: buildRequirementFieldProvenance(
      safeString(intentInterpretation && intentInterpretation.hypothesis, 320) ? "system_inferred" : "policy_default",
      safeString(intentInterpretation && intentInterpretation.hypothesis, 320) ? "hypothesis_interpretation" : "no_hypothesis_interpretation"
    ),
  };
}

function buildRequirementLockedGoal({ requirementContract, selection, validation, status = "" } = {}) {
  const requirement = requirementContract && typeof requirementContract === "object" ? requirementContract : {};
  const currentSelection = selection && typeof selection === "object" ? selection : {};
  const normalizedValidation = sanitizeRequirementValidation(validation, requirement);
  const allowedStatus = safeString(status, 40).toUpperCase();
  const canLock = (allowedStatus === "LOCKED" || allowedStatus === "REVISED")
    || (
      normalizedValidation.canProceed
      && normalizePlanningMode(currentSelection.selectedMode || requirement.selectedPlanningMode, "NORMAL") !== "DISCOVERY"
      && !currentSelection.needsInputRecommended
    );
  if (!canLock) return "";
  const intent = sanitizeRequirementIntentInterpretation(requirement.intentInterpretation);
  const candidates = [
    intent.presentation === "progress_hypothesis" ? intent.direction : "",
    requirement.explicitGoal,
    intent.direction,
    requirement.implicitGoal,
    requirement.userValueFrame && requirement.userValueFrame.valueThesis,
  ];
  for (const candidate of candidates) {
    const normalized = safeString(candidate, 320).trim();
    if (!normalized || requirementLooksFragmentaryGoalText(normalized)) continue;
    return normalized;
  }
  return "";
}

function buildRequirementIntentHypotheses({ requirementContract, selection, lockedGoal = "" } = {}) {
  const requirement = requirementContract && typeof requirementContract === "object" ? requirementContract : {};
  const currentSelection = selection && typeof selection === "object" ? selection : {};
  const intent = sanitizeRequirementIntentInterpretation(requirement.intentInterpretation);
  const userValueFrame = sanitizeUserValueFrame(requirement.userValueFrame);
  const candidates = [];
  const addCandidate = (goal, confidence, evidence = [], locked = false) => {
    const normalizedGoal = safeString(goal, 320);
    if (!normalizedGoal) return;
    if (candidates.some((entry) => requirementIntentKeysOverlap(entry.goal, normalizedGoal, { minLength: 10 }))) return;
    candidates.push({
      id: `hypothesis_${candidates.length + 1}`,
      goal: normalizedGoal,
      confidence: clampInt(confidence, locked ? 100 : 0, 0, 100),
      evidence: uniqueStrings(evidence, 6),
      locked: Boolean(locked),
    });
  };
  if (lockedGoal) {
    addCandidate(lockedGoal, 100, ["locked_goal", "validated_contract"], true);
  }
  if (intent.presentation === "progress_hypothesis") {
    addCandidate(intent.direction, currentSelection.needsInputRecommended ? 68 : 82, ["intent_direction", "question_interpretation"]);
    addCandidate(intent.hypothesis, 58, ["intent_hypothesis", "question_interpretation"]);
  }
  addCandidate(
    requirement.explicitGoal,
    requirement.provenance && requirement.provenance.explicitGoal && requirement.provenance.explicitGoal.source === "user_explicit" ? 88 : 72,
    [safeString(requirement.provenance && requirement.provenance.explicitGoal && requirement.provenance.explicitGoal.reason, 120) || "explicit_goal"]
  );
  addCandidate(requirement.implicitGoal, 56, ["implicit_goal"]);
  addCandidate(userValueFrame.userWants[0], 52, ["user_value_frame"]);
  return candidates.slice(0, 4);
}

function formatRequirementApprovalBoundary(entry) {
  const normalized = safeString(entry, 240);
  return normalized ? `Approval required before: ${normalized}` : "";
}

function buildRequirementChallengeReport({ requirementContract, selection } = {}) {
  const requirement = requirementContract && typeof requirementContract === "object" ? requirementContract : {};
  const currentSelection = selection && typeof selection === "object" ? selection : {};
  const validation = sanitizeRequirementValidation(requirement.validation, requirement);
  const findings = [];
  const addFinding = (type, severity, detail, requirementRef) => {
    const normalizedDetail = safeString(detail, 320);
    if (!normalizedDetail) return;
    findings.push({
      id: `${type}_${findings.length + 1}`,
      type,
      severity: normalizeRequirementFindingSeverity(severity, "medium"),
      detail: normalizedDetail,
      requirementRef: safeString(requirementRef, 120),
    });
  };
  if (!sanitizeAcceptanceChecks(requirement.acceptanceChecks).length) {
    addFinding("missing_acceptance_check", "high", "Acceptance checks are still too weak to judge completion safely.", "acceptanceChecks");
  }
  uniqueStrings(requirement.openQuestions, 3).forEach((question) => {
    addFinding("must_ask_question", "high", `Must confirm before implementation: ${question}`, "openQuestions");
  });
  uniqueStrings(requirement.assumptions, 2).forEach((entry) => {
    addFinding("hidden_assumption", "medium", `Assumption still carries execution risk: ${entry}`, "assumptions");
  });
  if (!uniqueStrings(requirement.nonGoals, 4).length) {
    addFinding("scope_gap", "medium", "Non-goals are not explicit yet, so scope drift risk remains.", "nonGoals");
  }
  if (sanitizeUserValueFrame(requirement.userValueFrame).benchmarkCandidates.length && currentSelection.taskFamily === "web_creative" && !uniqueStrings(requirement.openQuestions, 12).length) {
    addFinding("likely_implicit_requirement", "medium", "Benchmark context suggests visual/taste expectations that may still need confirmation.", "userValueFrame.benchmarkCandidates");
  }
  uniqueStrings(requirement.approvalBoundaryItems, 2).forEach((entry) => {
    addFinding("proceed_risk", "high", `Approval boundary still blocks safe execution: ${entry}`, "approvalBoundaryItems");
  });
  const contradictoryCheck = validation.checks.find((entry) => entry.id === "contract_consistency" && entry.status === "BLOCK");
  if (contradictoryCheck) {
    addFinding("contradiction", "high", contradictoryCheck.detail, "contract_consistency");
  }
  return sanitizeRequirementChallengeReport({
    summary: findings[0] ? findings[0].detail : "",
    proceedRisk: findings.some((entry) => entry.severity === "high")
      ? "high"
      : findings.some((entry) => entry.severity === "medium")
        ? "medium"
        : "low",
    findings,
  }, requirement);
}

function requirementLooksLikeQuestionText(value) {
  const normalized = safeString(value, 320).trim();
  if (!normalized) return false;
  return /[?？]$/.test(normalized)
    || /^(?:what|which|who|where|when|why|how|can|should|is|are|do|does|did|will|would|could)\b/i.test(normalized);
}

function ensureRequirementQuestionText(value, { fallbackLead = "Can you clarify" } = {}) {
  const normalized = stripQuestionPunctuation(safeString(value, 320).trim());
  if (!normalized) return "";
  if (requirementLooksLikeQuestionText(value) || requirementLooksLikeQuestionText(normalized)) {
    return `${normalized}?`;
  }
  const lead = safeString(fallbackLead, 40) || "Can you clarify";
  const body = normalized.charAt(0).toLowerCase() + normalized.slice(1);
  return `${lead} ${body}?`;
}

function buildRequirementQuestionFromFinding(finding) {
  const normalizedFinding = finding && typeof finding === "object" ? finding : {};
  const type = safeString(normalizedFinding.type, 80).toLowerCase();
  const detail = safeString(normalizedFinding.detail, 320);
  if (type === "missing_acceptance_check") {
    return "What acceptance checks define success?";
  }
  if (type === "must_ask_question") {
    return ensureRequirementQuestionText(
      detail.replace(/^Must confirm before implementation:\s*/i, ""),
      { fallbackLead: "Can you confirm" }
    );
  }
  if (type === "proceed_risk") {
    return "What approval is required before implementation?";
  }
  return "";
}

function requirementLooksFragmentaryGoalText(value) {
  const normalized = safeString(value, 320).trim();
  if (!normalized) return false;
  if (/[?？]$/.test(normalized)) return true;
  return /(?:とき|時|場合|際)(?:は|には)?$|(?:前に|後に|あとで|後で)$|(?:なら|ならば|したら)$/.test(normalized);
}

function classifyRequirementQuestionCategory(question, { taskFamily = "", approvalBoundaryItems = [] } = {}) {
  const normalized = safeString(question, 320).toLowerCase();
  if (!normalized) return "defaultable";
  if ((Array.isArray(approvalBoundaryItems) ? approvalBoundaryItems : []).some((entry) => normalized.includes(String(entry || "").toLowerCase()))) {
    return "blocking";
  }
  if (/(approval|permission|migrate|schema|delete|remove|install|account|security|port|credential|api key|before implementation|what acceptance|which specialist|goal|scope|non-goal|owner)/i.test(normalized)) {
    return "blocking";
  }
  if (taskFamily === "web_creative"
    && /(style|visual|ux|tone|brand|look|feel|preference|benchmark|reference|first impression|typography|color|motion|aesthetic|visual hierarchy|hero|emphasis|emphasize|emphasise)/i.test(normalized)) {
    return "taste";
  }
  if (/(style|visual|ux|tone|brand|look|feel|preference|benchmark|reference|first impression|typography|color|motion|aesthetic|visual hierarchy|hero|emphasis|emphasize|emphasise)/i.test(normalized)) {
    return "taste";
  }
  return "defaultable";
}

function buildAutonomousAcceptanceChecks({
  prompt = "",
  explicitGoal = "",
  implicitGoal = "",
  baselineScope = [],
  nonGoals = [],
  taskFamily = "",
  benchmarkCandidates = [],
  existingAcceptanceChecks = [],
} = {}) {
  const locked = sanitizeAcceptanceChecks(existingAcceptanceChecks);
  if (locked.length) return locked;
  const lowerPrompt = sanitizePromptForPolicyAnalysis(prompt).toLowerCase();
  const stitchContext = extractStitchPromptContext(prompt);
  if (/(?:acceptance checks?|acceptance criteria).*(?:not fixed|not clear|unclear|tbd|to be decided)/i.test(lowerPrompt)) {
    return locked;
  }
  const checks = [];
  const addCheck = (title, source, blocking = true) => {
    const normalizedTitle = safeString(title, 240);
    if (!normalizedTitle) return;
    if (checks.some((entry) => requirementIntentKeysOverlap(entry.title, normalizedTitle, { minLength: 18 }))) return;
    checks.push({
      id: `ac-${checks.length + 1}`,
      title: normalizedTitle,
      source: safeString(source, 80) || "runtime_inferred",
      blocking: blocking !== false,
    });
  };
  const goalAnchor = firstSentence(safeString(explicitGoal || implicitGoal, 240));
  const boundedScope = uniqueStrings(baselineScope, 6);
  const primaryScreen = stitchContext && Array.isArray(stitchContext.screens) && stitchContext.screens.length
    ? stitchContext.screens[0]
    : null;
  if (primaryScreen && primaryScreen.title) {
    addCheck(
      `Stitch の「${primaryScreen.title}」画面の構成と主要要素を WEB UI に再現する`,
      "inferred_stitch_screen_reproduction",
      true
    );
    if (stitchContext.fetchImagesAndCode) {
      addCheck(
        "取得した Stitch の画像とコードを基準に実装する",
        "inferred_stitch_asset_replay",
        true
      );
    }
  }
  if (goalAnchor && !requirementLooksLikeQuestionText(goalAnchor)) {
    addCheck(
      `Deliver the requested outcome without drifting from the goal: ${goalAnchor}`,
      "inferred_goal_anchor",
      true
    );
  }
  if (boundedScope.length > 0 || uniqueStrings(nonGoals, 4).length > 0 || /\b(?:only|keep|preserve|without|do not|must not)\b/i.test(lowerPrompt)) {
    addCheck(
      "Keep the change bounded to the locked scope and avoid unrelated edits.",
      "inferred_scope_guard",
      true
    );
  }
  if (safeString(taskFamily, 80).toLowerCase() === "web_creative") {
    addCheck(
      benchmarkCandidates.length > 0
        ? "The result should satisfy the anchored visual direction while staying responsive."
        : "The result should satisfy the intended visual direction and remain responsive.",
      benchmarkCandidates.length > 0 ? "inferred_benchmark_direction" : "inferred_visual_direction",
      true
    );
  } else if (boundedScope.length > 0 || goalAnchor) {
    addCheck(
      "The final state should be verifiable from the requested scope and user-visible outcome.",
      "inferred_completion_check",
      true
    );
  }
  return checks.slice(0, 4);
}

function partitionRequirementQuestions({
  openQuestions = [],
  taskFamily = "",
  approvalBoundaryItems = [],
  acceptanceChecks = [],
  baselineScope = [],
  benchmarkCandidates = [],
  prompt = "",
} = {}) {
  const blocking = [];
  const defaultable = [];
  const taste = [];
  const addEntry = (list, question, reason = "") => {
    const normalizedQuestion = safeString(question, 320);
    if (!normalizedQuestion) return;
    if ([...blocking, ...defaultable, ...taste].some((entry) => requirementIntentKeysOverlap(entry.question, normalizedQuestion, { minLength: 12 }))) {
      return;
    }
    list.push({
      question: normalizedQuestion,
      reason: safeString(reason, 160),
    });
  };
  const lowerPrompt = sanitizePromptForPolicyAnalysis(prompt).toLowerCase();
  const directionAnchored =
    (Array.isArray(benchmarkCandidates) ? benchmarkCandidates.length : 0) > 0
    || (Array.isArray(acceptanceChecks) ? acceptanceChecks.length : 0) > 0
    || (Array.isArray(baselineScope) ? baselineScope.length : 0) >= 2
    || /(?:readability|clarity|premium|luxury|editorial|minimal|playful|serious|trust|safe|dense|information density|typography|spacing|mobile|responsive|benchmark|reference|suruga-k|ui|ux|look|feel|tone|brand)/i.test(lowerPrompt);
  uniqueStrings(openQuestions, 12).forEach((question) => {
    const normalizedQuestion = safeString(question, 320);
    if (!normalizedQuestion) return;
    const category = classifyRequirementQuestionCategory(normalizedQuestion, { taskFamily, approvalBoundaryItems });
    if (/what acceptance checks define success\??/i.test(normalizedQuestion) && (Array.isArray(acceptanceChecks) ? acceptanceChecks.length : 0) > 0) {
      addEntry(defaultable, normalizedQuestion, "autonomous_acceptance_tightening");
      return;
    }
    if (category === "taste" && directionAnchored) {
      addEntry(taste, normalizedQuestion, "direction_anchor_present");
      return;
    }
    if (category === "defaultable") {
      addEntry(defaultable, normalizedQuestion, "defaultable_under_locked_goal");
      return;
    }
    addEntry(blocking, normalizedQuestion, "blocking_question");
  });
  return { blocking, defaultable, taste };
}

function buildRequirementQuestionPlan({ requirementContract, selection, challengeReport } = {}) {
  const requirement = requirementContract && typeof requirementContract === "object" ? requirementContract : {};
  const currentSelection = selection && typeof selection === "object" ? selection : {};
  const report = sanitizeRequirementChallengeReport(challengeReport, requirement);
  const blocking = [];
  const defaultable = [];
  const taste = [];
  const hasQuestion = (question) => [...blocking, ...defaultable, ...taste].some((entry) => requirementIntentKeysOverlap(entry.question, question, { minLength: 12 }));
  const pushCategorizedEntry = (question, category, reason = "") => {
    const normalizedQuestion = safeString(question, 320);
    if (!normalizedQuestion || hasQuestion(normalizedQuestion)) return;
    const entry = {
      question: normalizedQuestion,
      category,
      reason: safeString(reason, 200),
    };
    if (category === "blocking") blocking.push(entry);
    else if (category === "taste") taste.push(entry);
    else defaultable.push(entry);
  };
  const addQuestion = (question, reason = "") => {
    const normalizedQuestion = safeString(question, 320);
    if (!normalizedQuestion) return;
    if (hasQuestion(normalizedQuestion)) return;
    const category = classifyRequirementQuestionCategory(normalizedQuestion, {
      taskFamily: safeString(currentSelection.taskFamily || requirement.taskFamily, 80),
      approvalBoundaryItems: requirement.approvalBoundaryItems,
    });
    pushCategorizedEntry(normalizedQuestion, category, reason);
  };
  const deferredQuestions = currentSelection
    && currentSelection.extracted
    && currentSelection.extracted.deferredQuestions
    && typeof currentSelection.extracted.deferredQuestions === "object"
      ? currentSelection.extracted.deferredQuestions
      : {};
  uniqueStrings(requirement.openQuestions, 12).forEach((question) => addQuestion(question, "open_question"));
  uniqueStrings(deferredQuestions.defaultable, 8).forEach((question) => pushCategorizedEntry(question, "defaultable", "deferred_defaultable"));
  uniqueStrings(deferredQuestions.taste, 8).forEach((question) => pushCategorizedEntry(question, "taste", "deferred_taste"));
  report.findings.forEach((finding) => {
    if (finding.type === "must_ask_question" || finding.type === "missing_acceptance_check" || finding.type === "proceed_risk") {
      addQuestion(buildRequirementQuestionFromFinding(finding), finding.type);
    }
  });
  return sanitizeRequirementQuestionPlan({
    summary: blocking.length
      ? "Blocking questions must be resolved before execution."
      : taste.length
        ? "Taste questions can improve satisfaction after the core path is clear."
        : defaultable.length
          ? "Remaining questions can be handled with explicit assumptions."
          : "",
    blocking,
    defaultable,
    taste,
    askNext: [...blocking, ...taste, ...defaultable].slice(0, 3),
  }, requirement);
}

function buildRequirementDelightPlan({ requirementContract, selection } = {}) {
  const requirement = requirementContract && typeof requirementContract === "object" ? requirementContract : {};
  const currentSelection = selection && typeof selection === "object" ? selection : {};
  const openQuestionsCount = uniqueStrings(requirement.openQuestions, 12).length;
  const approvalBoundaryCount = uniqueStrings(requirement.approvalBoundaryItems, 12).length;
  const candidates = uniqueStrings(requirement.overDeliveryScope, 6).map((title, index) => ({
    id: `delight_${index + 1}`,
    title,
    reason: currentSelection.taskFamily === "web_creative" ? "separate_delight_lane_for_quality" : "optional_adjacent_value",
    autoEligible: openQuestionsCount === 0 && approvalBoundaryCount === 0,
  }));
  return sanitizeRequirementDelightPlan({
    summary: candidates.length ? "Optional adjacent value is tracked separately from the core contract." : "",
    candidates,
  }, requirement);
}

function buildRequirementDisplayContract({ requirementContract, selection, status = "", challengeReport, questionPlan, delightPlan, intentHypotheses, lockedGoal = "" } = {}) {
  const requirement = requirementContract && typeof requirementContract === "object" ? requirementContract : {};
  const currentSelection = selection && typeof selection === "object" ? selection : {};
  const report = sanitizeRequirementChallengeReport(challengeReport, requirement);
  const questions = sanitizeRequirementQuestionPlan(questionPlan, requirement);
  const delight = sanitizeRequirementDelightPlan(delightPlan, requirement);
  const hypotheses = sanitizeRequirementIntentHypotheses(intentHypotheses, requirement);
  const normalizedStatus = safeString(status || requirement.status, 40).toUpperCase();
  const stitchContext = currentSelection
    && currentSelection.extracted
    && currentSelection.extracted.stitchContext
    && typeof currentSelection.extracted.stitchContext === "object"
      ? currentSelection.extracted.stitchContext
      : null;
  const primaryScreen = stitchContext && Array.isArray(stitchContext.screens) && stitchContext.screens.length
    ? stitchContext.screens[0]
    : null;
  const headline = [
    safeString(lockedGoal, 320),
    safeString(hypotheses[0] && hypotheses[0].goal, 320),
    safeString(requirement.intentInterpretation && requirement.intentInterpretation.direction, 320),
    safeString(requirement.explicitGoal, 320),
    safeString(requirement.implicitGoal, 320),
    safeString(requirement.userValueFrame && requirement.userValueFrame.valueThesis, 320),
  ].find((entry) => entry && !requirementLooksFragmentaryGoalText(entry)) || "";
  const goalMode = lockedGoal ? "locked" : headline ? "hypothesis" : "draft";
  let nextAction = "";
  if (questions.askNext.length) {
    nextAction = `Clarify: ${questions.askNext[0].question}`;
  } else if (stitchContext && primaryScreen && primaryScreen.title) {
    const nextParts = [
      stitchContext.fetchImagesAndCode
        ? `まず Stitch の「${primaryScreen.title}」画面の画像とコードを取得する`
        : `まず Stitch の「${primaryScreen.title}」画面を基準にする`,
      "現UIとの差分を埋める",
    ];
    if (stitchContext.requiresHostedUrlDownload) nextParts.push("hosted URL は curl -L で取得する");
    nextAction = nextParts.join("。");
  } else if (sanitizeAcceptanceChecks(requirement.acceptanceChecks).length) {
    nextAction = `Plan around ${sanitizeAcceptanceChecks(requirement.acceptanceChecks)[0].title}`;
  } else if (uniqueStrings(requirement.baselineScope, 24).length) {
    nextAction = `Stay inside ${uniqueStrings(requirement.baselineScope, 2)[0]}`;
  } else {
    nextAction = "Clarify the core contract before execution.";
  }
  const stitchBoundaries = [];
  if (stitchContext && primaryScreen && primaryScreen.title) {
    stitchBoundaries.push("指定された Stitch screen を基準にする");
    if (stitchContext.strictRecreation) stitchBoundaries.push("完全再現から外れる独自アレンジを入れない");
    stitchBoundaries.push("指定されていない screen へ広げない");
  }
  const holdReason = normalizedStatus === "BLOCKED"
    ? safeString(requirement.statusReason, 320) || safeString(report.summary, 320)
    : "";
  const targetOutcome = stitchContext && primaryScreen && primaryScreen.title
    ? `「${primaryScreen.title}」画面の構成と見た目が WEB UI で再現される`
    : safeString(sanitizeUserValueFrame(requirement.userValueFrame).completedMeans[0], 320)
      || safeString(sanitizeUserValueFrame(requirement.userValueFrame).valueThesis, 320)
      || safeString(sanitizeAcceptanceChecks(requirement.acceptanceChecks)[0] && sanitizeAcceptanceChecks(requirement.acceptanceChecks)[0].title, 320);
  return sanitizeRequirementDisplayContract({
    headline,
    goal: lockedGoal || headline,
    goalMode,
    goalLabel: lockedGoal ? "locked_goal" : "working_hypothesis",
    nextAction,
    holdReason,
    targetOutcome,
    boundaries: [
      ...stitchBoundaries,
      ...uniqueStrings(requirement.nonGoals, 3),
      ...uniqueStrings(requirement.approvalBoundaryItems, 2).map((entry) => formatRequirementApprovalBoundary(entry)),
      ...uniqueStrings(requirement.userValueFrame && requirement.userValueFrame.mustAvoid, 2),
      ...uniqueStrings(requirement.userValueFrame && requirement.userValueFrame.hardConstraints, 2),
    ],
    askNext: questions.askNext,
    delightTitles: delight.candidates.map((entry) => entry.title).slice(0, 3),
    questionPlan: questions,
    delightPlan: delight,
  }, requirement);
}

function buildUserValueFrameProvenance({
  prompt = "",
  options = {},
  explicitGoal = "",
  implicitGoal = "",
  taskFamily = "deterministic_code",
  userValueFrame = {},
  baselineScope = [],
  acceptanceChecks = [],
  approvalBoundaryItems = [],
  benchmarkCandidates = [],
  nonGoalProvenance = [],
  goalProvenance = {},
} = {}) {
  const defaults = buildDefaultUserValueProfile(taskFamily);
  const promptSignals = inferPromptLevelUserValueSignals(prompt, taskFamily);
  const directiveAvoids = extractPromptDirectiveLines(prompt, isAvoidanceDirective, 8);
  const directiveConstraints = extractPromptDirectiveLines(prompt, isHardConstraintDirective, 8);
  const acceptanceTitles = (Array.isArray(acceptanceChecks) ? acceptanceChecks : [])
    .map((entry) => safeString(entry && entry.title, 240))
    .filter(Boolean);
  const directBenchmarks = extractReferenceUrls(prompt, 6);
  const previous = normalizePreviousPlanningContext(options);
  const previousBenchmarkProvenance = previous
    && previous.planningContext
    && previous.planningContext.requirementContract
    && previous.planningContext.requirementContract.provenance
    && previous.planningContext.requirementContract.provenance.userValueFrame
      ? previous.planningContext.requirementContract.provenance.userValueFrame.benchmarkCandidates
      : [];
  const explicitGoalSource = goalProvenance && goalProvenance.explicitGoal ? goalProvenance.explicitGoal.source : "system_inferred";
  const implicitGoalSource = goalProvenance && goalProvenance.implicitGoal ? goalProvenance.implicitGoal.source : "system_inferred";
  return {
    valueThesis: buildRequirementFieldProvenance("policy_default", "task_family_default"),
    userWants: buildRequirementValueProvenanceEntries(userValueFrame.userWants, (value) => {
      if (requirementProvenanceValuesOverlap(value, explicitGoal)) return { source: explicitGoalSource, reason: "explicit_goal" };
      if (requirementProvenanceValuesOverlap(value, implicitGoal)) return { source: implicitGoalSource, reason: "implicit_goal" };
      if (baselineScope.some((entry) => requirementProvenanceValuesOverlap(entry, value))) {
        return { source: promptMentionsRequirementValue(prompt, value) ? "user_explicit" : "user_implied", reason: "baseline_scope" };
      }
      return { source: promptMentionsRequirementValue(prompt, value) ? "user_explicit" : "user_implied", reason: "prompt_want" };
    }, 8),
    userShouldFeelGet: buildRequirementValueProvenanceEntries(userValueFrame.userShouldFeelGet, (value) => {
      if ((promptSignals.userShouldFeelGet || []).some((entry) => requirementProvenanceValuesOverlap(entry, value))) {
        return { source: "user_implied", reason: "prompt_value_signal" };
      }
      return { source: "policy_default", reason: "family_default_signal" };
    }, 8),
    mustAvoid: buildRequirementValueProvenanceEntries(userValueFrame.mustAvoid, (value) => {
      if (directiveAvoids.some((entry) => requirementProvenanceValuesOverlap(entry, value))) {
        return { source: "user_explicit", reason: "avoidance_directive" };
      }
      const inheritedNonGoalSource = findRequirementValueProvenanceSource(nonGoalProvenance, value, "");
      if (inheritedNonGoalSource) {
        return { source: inheritedNonGoalSource, reason: inheritedNonGoalSource === "policy_default" ? "default_non_goal" : "non_goal" };
      }
      if ((promptSignals.mustAvoid || []).some((entry) => requirementProvenanceValuesOverlap(entry, value))) {
        return { source: "user_implied", reason: "prompt_avoid_signal" };
      }
      return { source: "policy_default", reason: "family_default_guardrail" };
    }, 10),
    hardConstraints: buildRequirementValueProvenanceEntries(userValueFrame.hardConstraints, (value) => {
      if (directiveConstraints.some((entry) => requirementProvenanceValuesOverlap(entry, value))) {
        return { source: "user_explicit", reason: "constraint_directive" };
      }
      if (acceptanceTitles.some((entry) => requirementProvenanceValuesOverlap(entry, value))) {
        return { source: "user_explicit", reason: "acceptance_constraint" };
      }
      if (approvalBoundaryItems.some((entry) => value.includes(entry))) {
        return { source: "system_inferred", reason: "approval_boundary_guardrail" };
      }
      return { source: "policy_default", reason: "default_constraint" };
    }, 10),
    qualityAxes: buildRequirementValueProvenanceEntries(userValueFrame.qualityAxes, (value) => {
      if ((promptSignals.qualityAxes || []).some((entry) => requirementProvenanceValuesOverlap(entry, value))) {
        return { source: "user_implied", reason: "prompt_quality_signal" };
      }
      return { source: "policy_default", reason: "family_default_quality_axis" };
    }, 10),
    benchmarkCandidates: buildRequirementValueProvenanceEntries(userValueFrame.benchmarkCandidates || benchmarkCandidates, (value) => {
      if (directBenchmarks.some((entry) => requirementProvenanceValuesOverlap(entry, value))) {
        return { source: "user_explicit", reason: "reference_url" };
      }
      const previousSource = findRequirementValueProvenanceSource(previousBenchmarkProvenance, value, "");
      if (previousSource) {
        return { source: previousSource, reason: "carried_forward_benchmark" };
      }
      return { source: "user_implied", reason: "followup_benchmark_context" };
    }, 6),
    completedMeans: buildRequirementValueProvenanceEntries(userValueFrame.completedMeans, (value) => {
      if (acceptanceTitles.some((entry) => requirementProvenanceValuesOverlap(entry, value))) {
        return { source: "user_explicit", reason: "acceptance_completion" };
      }
      if ((promptSignals.completedMeans || []).some((entry) => requirementProvenanceValuesOverlap(entry, value))) {
        return { source: "user_implied", reason: "prompt_completion_signal" };
      }
      if ((defaults.completedMeans || []).some((entry) => requirementProvenanceValuesOverlap(entry, value))) {
        return { source: "policy_default", reason: "family_default_completion" };
      }
      return { source: "system_inferred", reason: "completion_inference" };
    }, 10),
  };
}

function sanitizeRequirementProvenance(value, requirement = {}) {
  const source = value && typeof value === "object" ? value : {};
  const frame = requirement && requirement.userValueFrame && typeof requirement.userValueFrame === "object" ? requirement.userValueFrame : {};
  const intent = requirement && requirement.intentInterpretation && typeof requirement.intentInterpretation === "object" ? requirement.intentInterpretation : {};
  return {
    explicitGoal: sanitizeRequirementFieldProvenance(source.explicitGoal, safeString(requirement.explicitGoal, 320) ? "system_inferred" : "policy_default"),
    implicitGoal: sanitizeRequirementFieldProvenance(source.implicitGoal, safeString(requirement.implicitGoal, 320) ? "system_inferred" : "policy_default"),
    nonGoals: sanitizeRequirementValueProvenanceEntries(source.nonGoals, "system_inferred", 16),
    userValueFrame: {
      valueThesis: sanitizeRequirementFieldProvenance(source.userValueFrame && source.userValueFrame.valueThesis, safeString(frame.valueThesis, 320) ? "policy_default" : "policy_default"),
      userWants: sanitizeRequirementValueProvenanceEntries(source.userValueFrame && source.userValueFrame.userWants, "system_inferred", 8),
      userShouldFeelGet: sanitizeRequirementValueProvenanceEntries(source.userValueFrame && source.userValueFrame.userShouldFeelGet, "policy_default", 8),
      mustAvoid: sanitizeRequirementValueProvenanceEntries(source.userValueFrame && source.userValueFrame.mustAvoid, "system_inferred", 10),
      hardConstraints: sanitizeRequirementValueProvenanceEntries(source.userValueFrame && source.userValueFrame.hardConstraints, "system_inferred", 10),
      qualityAxes: sanitizeRequirementValueProvenanceEntries(source.userValueFrame && source.userValueFrame.qualityAxes, "policy_default", 10),
      benchmarkCandidates: sanitizeRequirementValueProvenanceEntries(source.userValueFrame && source.userValueFrame.benchmarkCandidates, "system_inferred", 6),
      completedMeans: sanitizeRequirementValueProvenanceEntries(source.userValueFrame && source.userValueFrame.completedMeans, "policy_default", 10),
    },
    intentInterpretation: {
      presentation: sanitizeRequirementFieldProvenance(source.intentInterpretation && source.intentInterpretation.presentation, safeString(intent.presentation, 40) === "progress_hypothesis" ? "system_inferred" : "policy_default"),
      questionLike: sanitizeRequirementFieldProvenance(source.intentInterpretation && source.intentInterpretation.questionLike, intent && intent.questionLike ? "system_inferred" : "policy_default"),
      direction: sanitizeRequirementFieldProvenance(source.intentInterpretation && source.intentInterpretation.direction, safeString(intent.direction, 320) ? "system_inferred" : "policy_default"),
      hypothesis: sanitizeRequirementFieldProvenance(source.intentInterpretation && source.intentInterpretation.hypothesis, safeString(intent.hypothesis, 320) ? "system_inferred" : "policy_default"),
    },
  };
}

function buildRequirementComparableSnapshot(requirementContract = {}) {
  const requirement = requirementContract && typeof requirementContract === "object" ? requirementContract : {};
  const frame = sanitizeUserValueFrame(requirement.userValueFrame);
  const intent = sanitizeRequirementIntentInterpretation(requirement.intentInterpretation);
  const questionPlan = sanitizeRequirementQuestionPlan(requirement.questionPlan, requirement);
  const delightPlan = sanitizeRequirementDelightPlan(requirement.delightPlan, requirement);
  return {
    explicitGoal: safeString(requirement.explicitGoal, 320),
    implicitGoal: safeString(requirement.implicitGoal, 320),
    lockedGoal: safeString(requirement.lockedGoal, 320),
    baselineScope: uniqueStrings(requirement.baselineScope, 24),
    nonGoals: uniqueStrings(requirement.nonGoals, 16),
    approvalBoundaryItems: uniqueStrings(requirement.approvalBoundaryItems, 12),
    acceptanceChecks: sanitizeAcceptanceChecks(requirement.acceptanceChecks).map((entry) => ({ id: entry.id, title: entry.title, blocking: entry.blocking ? 1 : 0 })),
    intentHypotheses: sanitizeRequirementIntentHypotheses(requirement.intentHypotheses, requirement).map((entry) => ({
      goal: entry.goal,
      confidence: entry.confidence,
      locked: entry.locked ? 1 : 0,
    })),
    questionPlan: {
      askNext: questionPlan.askNext.map((entry) => ({ question: entry.question, category: entry.category })),
    },
    delightPlan: {
      candidates: delightPlan.candidates.map((entry) => ({ title: entry.title, autoEligible: entry.autoEligible ? 1 : 0 })),
    },
    userValueFrame: {
      valueThesis: safeString(frame.valueThesis, 320),
      userWants: uniqueStrings(frame.userWants, 8),
      mustAvoid: uniqueStrings(frame.mustAvoid, 10),
      hardConstraints: uniqueStrings(frame.hardConstraints, 10),
      qualityAxes: uniqueStrings(frame.qualityAxes, 10),
      benchmarkCandidates: uniqueStrings(frame.benchmarkCandidates, 6),
      completedMeans: uniqueStrings(frame.completedMeans, 10),
    },
    intentInterpretation: intent,
  };
}

function buildRequirementRevisionLedger({ requirementContract, options = {} } = {}) {
  const currentRequirement = requirementContract && typeof requirementContract === "object" ? requirementContract : {};
  const previous = normalizePreviousPlanningContext(options);
  if (!previous || !previous.planningContext || !previous.planningContext.requirementContract) {
    return {
      revisionNumber: 1,
      revised: false,
      revisionKind: "initial",
      changedFields: [],
      previousPromptHash: "",
      previousStatus: "",
      requiresReapproval: false,
      summary: "Initial requirement contract for this thread.",
    };
  }
  const previousRequirement = previous.planningContext.requirementContract;
  const currentComparable = buildRequirementComparableSnapshot(currentRequirement);
  const previousComparable = buildRequirementComparableSnapshot(previousRequirement);
  const fields = [
    "explicitGoal",
    "implicitGoal",
    "lockedGoal",
    "baselineScope",
    "nonGoals",
    "approvalBoundaryItems",
    "acceptanceChecks",
    "intentHypotheses",
    "questionPlan.askNext",
    "delightPlan.candidates",
    "userValueFrame.valueThesis",
    "userValueFrame.userWants",
    "userValueFrame.mustAvoid",
    "userValueFrame.hardConstraints",
    "userValueFrame.qualityAxes",
    "userValueFrame.benchmarkCandidates",
    "userValueFrame.completedMeans",
    "intentInterpretation.presentation",
    "intentInterpretation.direction",
    "intentInterpretation.hypothesis",
  ];
  const getByPath = (source, fieldPath) => fieldPath.split(".").reduce((acc, key) => (acc && typeof acc === "object" ? acc[key] : undefined), source);
  const changedFields = fields.filter((fieldPath) => JSON.stringify(getByPath(currentComparable, fieldPath)) !== JSON.stringify(getByPath(previousComparable, fieldPath)));
  const revised = changedFields.length > 0;
  const previousRevisionNumber = clampInt(previousRequirement && previousRequirement.revisionLedger && previousRequirement.revisionLedger.revisionNumber, 1, 1, 999);
  const previousApprovalItems = uniqueStrings(previousRequirement && previousRequirement.approvalBoundaryItems, 12);
  const currentApprovalItems = uniqueStrings(currentRequirement && currentRequirement.approvalBoundaryItems, 12);
  const approvalBoundaryExpanded = currentApprovalItems.some((entry) => !previousApprovalItems.some((previousEntry) => requirementProvenanceValuesOverlap(previousEntry, entry)));
  const requiresReapproval = Boolean(revised && (approvalBoundaryExpanded || changedFields.includes("userValueFrame.hardConstraints")));
  return {
    revisionNumber: previousRevisionNumber + 1,
    revised,
    revisionKind: !revised ? "carryover_refresh" : "material_change",
    changedFields,
    previousPromptHash: safeString(previousRequirement && previousRequirement.promptHash, 80),
    previousStatus: normalizeRequirementStatus(previousRequirement && previousRequirement.status, ""),
    requiresReapproval,
    summary: !revised
      ? "Requirement contract matches the prior locked direction."
      : requiresReapproval
        ? `Requirement contract changed in ${changedFields.length} field(s) and tightened an approval or hard-constraint boundary.`
        : `Requirement contract changed in ${changedFields.length} field(s) from the previous turn.`,
  };
}

function sanitizeRequirementRevisionLedger(value) {
  const source = value && typeof value === "object" ? value : {};
  return {
    revisionNumber: clampInt(source.revisionNumber, 1, 1, 999),
    revised: Boolean(source.revised),
    revisionKind: ["initial", "carryover_refresh", "material_change"].includes(safeString(source.revisionKind, 40))
      ? safeString(source.revisionKind, 40)
      : "initial",
    changedFields: uniqueStrings(source.changedFields, 24),
    previousPromptHash: safeString(source.previousPromptHash, 80),
    previousStatus: normalizeRequirementStatus(source.previousStatus, ""),
    requiresReapproval: Boolean(source.requiresReapproval),
    summary: safeString(source.summary, 240),
  };
}

function buildRequirementValidation({ requirementContract, selection } = {}) {
  const requirement = requirementContract && typeof requirementContract === "object" ? requirementContract : {};
  const currentSelection = selection && typeof selection === "object" ? selection : {};
  const goalAnchor = getRequirementGoalAnchor(requirement);
  const goalAnchorFieldRefs = getRequirementGoalAnchorFieldRefs(requirement);
  const acceptanceChecks = sanitizeAcceptanceChecks(requirement.acceptanceChecks);
  const baselineScope = uniqueStrings(requirement.baselineScope, 24);
  const nonGoals = uniqueStrings(requirement.nonGoals, 16);
  const openQuestions = uniqueStrings(requirement.openQuestions, 12);
  const approvalBoundaryItems = uniqueStrings(requirement.approvalBoundaryItems, 12);
  const userValueFrame = sanitizeUserValueFrame(requirement.userValueFrame);
  const provenance = sanitizeRequirementProvenance(requirement.provenance, requirement);
  const revisionLedger = sanitizeRequirementRevisionLedger(requirement.revisionLedger);
  const checks = [];
  const pushCheck = (id, title, status, detail, fieldRefs = []) => {
    checks.push({
      id,
      title,
      status: normalizeRequirementValidationVerdict(status, "WARN"),
      detail: safeString(detail, 320),
      fieldRefs: uniqueStrings(fieldRefs, 8),
    });
  };
  pushCheck(
    "goal_present",
    "Primary goal is locked",
    goalAnchor ? "PASS" : "BLOCK",
    goalAnchor
      ? "A concrete goal anchor exists for planning."
      : "No goal anchor was locked from the requirement contract or its hypotheses.",
    goalAnchorFieldRefs
  );
  const acceptanceStatus = acceptanceChecks.length > 0
    ? "PASS"
    : (safeString(currentSelection.taskFamily || requirement.taskFamily, 80) === "deterministic_code" && baselineScope.length === 0 ? "BLOCK" : "WARN");
  pushCheck(
    "acceptance_defined",
    "Acceptance checks are concrete",
    acceptanceStatus,
    acceptanceChecks.length > 0
      ? `Acceptance checks locked: ${acceptanceChecks.length}.`
      : "Acceptance checks are missing or too weak for reliable completion judgment.",
    ["acceptanceChecks", "baselineScope"]
  );
  pushCheck(
    "blocking_questions_clear",
    "Blocking open questions are cleared",
    openQuestions.length > 0 ? "BLOCK" : "PASS",
    openQuestions.length > 0
      ? `Open questions remain: ${openQuestions.length}.`
      : "No blocking open questions remain in the requirement contract.",
    ["openQuestions"]
  );
  pushCheck(
    "approval_boundary_clear",
    "Approval boundaries are resolved",
    approvalBoundaryItems.length > 0 ? "BLOCK" : "PASS",
    approvalBoundaryItems.length > 0
      ? `Approval-boundary items remain: ${approvalBoundaryItems.length}.`
      : "No unresolved approval-boundary item remains.",
    ["approvalBoundaryItems"]
  );
  const goalConflicts = goalAnchor
    ? nonGoals.some((entry) => requirementProvenanceValuesOverlap(entry, goalAnchor))
    : false;
  const mustAvoidGoalConflict = sanitizeRequirementValueProvenanceEntries(
    provenance && provenance.userValueFrame ? provenance.userValueFrame.mustAvoid : [],
    "system_inferred",
    10
  ).some((entry) => entry.source !== "user_explicit" && goalAnchor && requirementProvenanceValuesOverlap(entry.value, goalAnchor));
  pushCheck(
    "contract_consistency",
    "Goal and guardrails do not contradict each other",
    goalConflicts || mustAvoidGoalConflict ? "BLOCK" : "PASS",
    goalConflicts || mustAvoidGoalConflict
      ? "At least one goal-like statement overlaps with a non-goal or must-avoid entry."
      : "No direct contradiction was detected between goal, non-goals, and must-avoid guardrails.",
    uniqueStrings([...goalAnchorFieldRefs, "nonGoals", "userValueFrame.mustAvoid"], 8)
  );
  pushCheck(
    "provenance_coverage",
    "Critical requirement fields record where they came from",
    provenance.explicitGoal && provenance.userValueFrame && provenance.intentInterpretation ? "PASS" : "WARN",
    provenance.explicitGoal && provenance.userValueFrame && provenance.intentInterpretation
      ? "Goal, value frame, and intent interpretation carry provenance tags."
      : "Some critical requirement fields are missing provenance tags.",
    ["provenance"]
  );
  pushCheck(
    "revision_safety",
    "Revision history is legible",
    revisionLedger.requiresReapproval ? "WARN" : "PASS",
    revisionLedger.requiresReapproval
      ? "Recent contract changes tightened approval or hard-constraint boundaries."
      : revisionLedger.revised
        ? "Recent contract changes were recorded in the revision ledger."
        : "No material requirement revision was detected from the previous turn.",
    ["revisionLedger"]
  );
  const summary = {
    passCount: checks.filter((entry) => entry.status === "PASS").length,
    warnCount: checks.filter((entry) => entry.status === "WARN").length,
    blockCount: checks.filter((entry) => entry.status === "BLOCK").length,
    total: checks.length,
  };
  return {
    schema: "requirement-validation.v1",
    source: "runtime_inferred_pre_dispatch",
    verdict: summary.blockCount > 0 ? "BLOCK" : summary.warnCount > 0 ? "WARN" : "PASS",
    canProceed: summary.blockCount === 0,
    summary,
    checks,
  };
}

function sanitizeRequirementValidation(value, requirementContract = {}) {
  const source = value && typeof value === "object" ? value : null;
  if (!source) {
    return buildRequirementValidation({ requirementContract, selection: {} });
  }
  const summary = source.summary && typeof source.summary === "object" ? source.summary : {};
  return {
    schema: safeString(source.schema, 80) || "requirement-validation.v1",
    source: safeString(source.source, 80) || "runtime_inferred_pre_dispatch",
    verdict: normalizeRequirementValidationVerdict(source.verdict, "WARN"),
    canProceed: Boolean(source.canProceed),
    summary: {
      passCount: clampInt(summary.passCount, 0, 0, 24),
      warnCount: clampInt(summary.warnCount, 0, 0, 24),
      blockCount: clampInt(summary.blockCount, 0, 0, 24),
      total: clampInt(summary.total, 0, 0, 24),
    },
    checks: (Array.isArray(source.checks) ? source.checks : []).map((entry, index) => {
      const item = entry && typeof entry === "object" ? entry : {};
      const title = safeString(item.title, 240);
      if (!title) return null;
      return {
        id: safeString(item.id, 80) || `rv-${index + 1}`,
        title,
        status: normalizeRequirementValidationVerdict(item.status, "WARN"),
        detail: safeString(item.detail, 320),
        fieldRefs: uniqueStrings(item.fieldRefs, 8),
      };
    }).filter(Boolean).slice(0, 16),
  };
}

function deriveRequirementStatus({ requirementContract, selection, validation, revisionLedger } = {}) {
  const requirement = requirementContract && typeof requirementContract === "object" ? requirementContract : {};
  const currentSelection = selection && typeof selection === "object" ? selection : {};
  const normalizedValidation = sanitizeRequirementValidation(validation, requirement);
  const normalizedRevisionLedger = sanitizeRequirementRevisionLedger(revisionLedger);
  if (!requirementHasCoreData(requirement)) {
    return {
      status: "DRAFT",
      statusReason: "Core requirement fields are not locked yet.",
    };
  }
  if (
    normalizedValidation.summary.blockCount > 0
    || normalizePlanningMode(currentSelection.selectedMode || requirement.selectedPlanningMode, "NORMAL") === "DISCOVERY"
    || Boolean(currentSelection.needsInputRecommended)
  ) {
    const blockingCheck = normalizedValidation.checks.find((entry) => entry.status === "BLOCK");
    return {
      status: "BLOCKED",
      statusReason: blockingCheck ? blockingCheck.detail : "Requirement contract still has blocking ambiguity or approval boundaries.",
    };
  }
  if (normalizedRevisionLedger.revised) {
    return {
      status: "REVISED",
      statusReason: normalizedRevisionLedger.summary || "Requirement contract changed from the previous turn.",
    };
  }
  return {
    status: "LOCKED",
    statusReason: "Requirement contract is validated enough to proceed into planning and specialist dispatch.",
  };
}

function normalizeRequirementIntentCompareKey(value) {
  return safeString(value, 320)
    .replace(/^(?:質問に答える|次の点を説明する|Answer the user's question about|Explain these points)\s*:?\s*/i, "")
    .replace(/[?？!！。．:：/／、,\s-]+/g, "")
    .toLowerCase();
}

function requirementIntentKeysOverlap(left, right, { minLength = 12 } = {}) {
  const leftKey = normalizeRequirementIntentCompareKey(left);
  const rightKey = normalizeRequirementIntentCompareKey(right);
  if (!leftKey || !rightKey) return false;
  if (leftKey === rightKey) return true;
  if (leftKey.length >= minLength && rightKey.includes(leftKey)) return true;
  if (rightKey.length >= minLength && leftKey.includes(rightKey)) return true;
  return false;
}

function stripQuestionLeadForIntent(value) {
  return safeString(value, 320)
    .replace(/^(?:質問に答える|次の点を説明する|Answer the user's question about|Explain these points)\s*:?\s*/i, "")
    .replace(/[?？!！。．\s]+$/g, "")
    .trim();
}

function joinIntentPhrases(parts) {
  const phrases = uniqueStrings((Array.isArray(parts) ? parts : []).map((entry) => safeString(entry, 160)).filter(Boolean), 3);
  if (!phrases.length) return "";
  if (phrases.length === 1) return phrases[0];
  return phrases.reduce((acc, entry, index) => {
    if (index === 0) return entry;
    return `${acc.replace(/する$/u, "し、")}${entry}`;
  }, "");
}

function inferQuestionIntentDirection(text) {
  const normalized = stripQuestionLeadForIntent(text);
  if (!normalized) return "";
  const appearanceOnly = /(?:ように見える|見えるだけ|だけでしょうか|だけなのか|見えているだけ)/u.test(normalized);
  const literalVsInterpretation = /(?:そのまま受け取|literal|焼き直し|言い換え|オウム返し)/iu.test(normalized) && /(?:解釈|意図|仮説|要件)/u.test(normalized);
  if (literalVsInterpretation && appearanceOnly) {
    return "要件ロックが原文の反復に見える理由を、見え方と実際の挙動を切り分け、どこまで解釈できていてどこが原文寄りかを整理して説明する";
  }
  if (literalVsInterpretation && /(?:なぜ|なんで|理由|どうして)/u.test(normalized)) {
    return "要件ロックが原文の反復に見える理由と、どこまで解釈できていてどこが原文寄りかを整理して説明する";
  }
  if (literalVsInterpretation) {
    return "要件ロックが原文の反復に見える点を、どこまで解釈できていてどこが原文寄りかを整理する";
  }
  const recentLabel = /(?:最近|直近)/u.test(normalized) ? "最近の" : "今回の";
  let topicLabel = "";
  if (/要件/u.test(normalized) && /(?:修正|変更|直し|改善)/u.test(normalized)) topicLabel = `${recentLabel}要件まわりの修正について、`;
  else if (/(?:表示|UI|画面|見た目)/iu.test(normalized) && /(?:修正|変更|直し|改善)/u.test(normalized)) topicLabel = `${recentLabel}表示まわりの修正について、`;
  else if (/(?:修正|変更|直し|改善)/u.test(normalized)) topicLabel = `${recentLabel}修正について、`;
  const actions = [];
  if (/(?:ええかんじ|ええ感じ|いい感じ|良くなった|よくなった|改善|直った|問題|大丈夫|伝わりやす|見やす|自然|狙いどおり)/u.test(normalized)) {
    actions.push("狙いどおり改善できたかを確認する");
  }
  if (/(?:どんな修正|どこを修正|何を修正|何を変えた|どこを変えた|変更点|修正したか|どう直した|どんな変更)/u.test(normalized)) {
    actions.push("変更点を具体的に説明する");
  }
  if (/(?:なぜ|なんで|理由|どうして)/u.test(normalized)) {
    actions.push("理由を説明する");
  }
  if (!actions.length && /(?:教えて|教えてください|説明して|説明してください|知りたい)/u.test(normalized)) {
    actions.push("知りたいポイントを整理して説明する");
  }
  const actionText = joinIntentPhrases(actions);
  return actionText ? `${topicLabel}${actionText}` : "";
}

function inferQuestionIntentHypothesis(text) {
  const normalized = stripQuestionLeadForIntent(text);
  if (!normalized) return "";
  const appearanceOnly = /(?:ように見える|見えるだけ|だけでしょうか|だけなのか|見えているだけ)/u.test(normalized);
  const literalVsInterpretation = /(?:そのまま受け取|literal|焼き直し|言い換え|オウム返し)/iu.test(normalized) && /(?:解釈|意図|仮説|要件)/u.test(normalized);
  if (literalVsInterpretation && appearanceOnly) {
    return "見え方だけの問題か、実際に意図解釈が弱いのかを切り分けて確かめたい";
  }
  if (literalVsInterpretation) {
    return "原文固定と意図解釈のどちらが支配的かを確かめたい";
  }
  const improvementReview = /(?:ええかんじ|ええ感じ|いい感じ|良くなった|よくなった|改善|直った|問題|大丈夫|伝わりやす|見やす|自然|狙いどおり)/u.test(normalized);
  const changeExplanation = /(?:どんな修正|どこを修正|何を修正|何を変えた|どこを変えた|変更点|修正したか|どう直した|どんな変更)/u.test(normalized);
  if (improvementReview && changeExplanation) return "変更点だけでなく、改善の根拠まで短く把握したい";
  if (changeExplanation) return "変更点とその意図のつながりを把握したい";
  if (improvementReview) return "結果だけでなく、改善できた根拠まで把握したい";
  return "";
}

function distinctRequirementIntentCandidate(value, { literalText = "", blockedValues = [] } = {}) {
  const text = firstSentence(safeString(value, 320).trim());
  if (!text || /[?？]/u.test(text)) return "";
  if (literalText && requirementIntentKeysOverlap(text, literalText, { minLength: 10 })) return "";
  for (const blocked of Array.isArray(blockedValues) ? blockedValues : []) {
    if (requirementIntentKeysOverlap(text, blocked, { minLength: 10 })) return "";
  }
  return text;
}

function collectDistinctRequirementIntentCandidates(values, options = {}) {
  const seen = new Set();
  return (Array.isArray(values) ? values : [])
    .map((entry) => distinctRequirementIntentCandidate(entry, options))
    .filter((text) => {
      const key = normalizeRequirementIntentCompareKey(text);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function extractPrimaryQuestionPromptText(prompt, explicitGoal = "") {
  const promptLines = splitPromptIntoRequirementLines(prompt, 24).filter((entry) => /[?？]/u.test(entry));
  if (promptLines.length) return safeString(promptLines[0], 320);
  const paragraphs = extractPromptParagraphs(prompt);
  const firstParagraph = safeString(paragraphs[0] || prompt || explicitGoal, 320).trim();
  return firstParagraph;
}

function buildRequirementIntentInterpretation({
  prompt = "",
  explicitGoal = "",
  implicitGoal = "",
  baselineScope = [],
  userValueFrame = {},
} = {}) {
  if (extractStitchPromptContext(prompt)) {
    return {
      presentation: "goal",
      questionLike: false,
      direction: "",
      hypothesis: "",
    };
  }
  const literalQuestionText = extractPrimaryQuestionPromptText(prompt, explicitGoal);
  const questionLike = Boolean(literalQuestionText) && (
    /[?？]/u.test(literalQuestionText)
    || /^(?:質問に答える|次の点を説明する|Answer the user's question about|Explain these points)\s*:?\s*/iu.test(explicitGoal)
    || /を説明する$/u.test(explicitGoal)
  );
  if (!questionLike) {
    return {
      presentation: "goal",
      questionLike: false,
      direction: "",
      hypothesis: "",
    };
  }
  const userWants = userValueFrame && Array.isArray(userValueFrame.userWants) ? userValueFrame.userWants : [];
  const questionIntentDirection = inferQuestionIntentDirection(literalQuestionText);
  const questionIntentHypothesis = inferQuestionIntentHypothesis(literalQuestionText);
  const directionCandidates = collectDistinctRequirementIntentCandidates(
    [questionIntentDirection, explicitGoal, ...userWants, ...baselineScope, implicitGoal],
    { literalText: literalQuestionText }
  );
  const direction = directionCandidates[0] || "";
  const hypothesisCandidates = collectDistinctRequirementIntentCandidates(
    [questionIntentHypothesis, ...userWants, ...baselineScope, implicitGoal],
    { literalText: literalQuestionText, blockedValues: [direction] }
  );
  const hypothesis = hypothesisCandidates[0] || "";
  return {
    presentation: direction || hypothesis ? "progress_hypothesis" : "goal",
    questionLike: true,
    direction,
    hypothesis,
  };
}

function sanitizeRequirementIntentInterpretation(value) {
  const source = value && typeof value === "object" ? value : {};
  const presentation = safeString(source.presentation, 40) === "progress_hypothesis" ? "progress_hypothesis" : "goal";
  return {
    presentation,
    questionLike: Boolean(source.questionLike),
    direction: safeString(source.direction, 320),
    hypothesis: safeString(source.hypothesis, 320),
  };
}

function normalizeRequirementQuestionCategory(value, fallback = "defaultable") {
  const normalized = safeString(value, 40).toLowerCase();
  if (normalized === "blocking" || normalized === "defaultable" || normalized === "taste") {
    return normalized;
  }
  return fallback === "blocking" || fallback === "taste" ? fallback : "defaultable";
}

function normalizeRequirementRiskLevel(value, fallback = "medium") {
  const normalized = safeString(value, 40).toLowerCase();
  if (normalized === "low" || normalized === "medium" || normalized === "high") {
    return normalized;
  }
  return fallback === "low" || fallback === "high" ? fallback : "medium";
}

function normalizeRequirementFindingSeverity(value, fallback = "medium") {
  return normalizeRequirementRiskLevel(value, fallback);
}

function normalizeRequirementDisplayMode(value, fallback = "draft") {
  const normalized = safeString(value, 40).toLowerCase();
  if (normalized === "locked" || normalized === "hypothesis" || normalized === "draft") {
    return normalized;
  }
  return fallback === "locked" || fallback === "hypothesis" ? fallback : "draft";
}

function sanitizeRequirementIntentHypotheses(value, requirement = {}) {
  const source = Array.isArray(value) ? value : [];
  const out = source.map((entry, index) => {
    const item = entry && typeof entry === "object" ? entry : {};
    const goal = safeString(item.goal, 320);
    if (!goal) return null;
    return {
      id: safeString(item.id, 80) || `hypothesis_${index + 1}`,
      goal,
      confidence: clampInt(item.confidence, 0, 0, 100),
      evidence: uniqueStrings(item.evidence, 6),
      locked: Boolean(item.locked),
    };
  }).filter(Boolean).slice(0, 4);
  if (out.length) return out;
  const fallbackGoal = safeString(requirement.lockedGoal, 320)
    || safeString(requirement.explicitGoal, 320)
    || safeString(requirement.implicitGoal, 320)
    || safeString(requirement.intentInterpretation && requirement.intentInterpretation.direction, 320);
  if (!fallbackGoal) return [];
  return [{
    id: "hypothesis_1",
    goal: fallbackGoal,
    confidence: safeString(requirement.lockedGoal, 320) ? 100 : 60,
    evidence: uniqueStrings([
      safeString(requirement.lockedGoal, 320) ? "locked_goal" : "",
      safeString(requirement.explicitGoal, 320) ? "explicit_goal" : "",
      safeString(requirement.intentInterpretation && requirement.intentInterpretation.direction, 320) ? "intent_direction" : "",
    ], 3),
    locked: Boolean(safeString(requirement.lockedGoal, 320)),
  }];
}

function sanitizeRequirementChallengeReport(value, requirement = {}) {
  const source = value && typeof value === "object" ? value : {};
  const findings = (Array.isArray(source.findings) ? source.findings : []).map((entry, index) => {
    const item = entry && typeof entry === "object" ? entry : {};
    const detail = safeString(item.detail, 320);
    if (!detail) return null;
    return {
      id: safeString(item.id, 80) || `challenge_${index + 1}`,
      type: safeString(item.type, 80) || "gap",
      severity: normalizeRequirementFindingSeverity(item.severity, "medium"),
      detail,
      requirementRef: safeString(item.requirementRef, 120),
    };
  }).filter(Boolean).slice(0, 8);
  const fallbackSummary = findings[0] ? findings[0].detail : "";
  return {
    summary: safeString(source.summary, 320) || fallbackSummary,
    proceedRisk: normalizeRequirementRiskLevel(source.proceedRisk, findings.some((entry) => entry.severity === "high") ? "high" : "medium"),
    findings,
  };
}

function sanitizeRequirementQuestionEntries(values, fallbackCategory = "defaultable", max = 8) {
  return (Array.isArray(values) ? values : []).map((entry) => {
    if (typeof entry === "string") {
      const question = safeString(entry, 320);
      if (!question) return null;
      return {
        question,
        category: normalizeRequirementQuestionCategory(fallbackCategory, fallbackCategory),
        reason: "",
      };
    }
    const item = entry && typeof entry === "object" ? entry : {};
    const question = safeString(item.question || item.title, 320);
    if (!question) return null;
    return {
      question,
      category: normalizeRequirementQuestionCategory(item.category, fallbackCategory),
      reason: safeString(item.reason, 200),
    };
  }).filter(Boolean).slice(0, max);
}

function sanitizeRequirementQuestionPlan(value, requirement = {}) {
  const source = value && typeof value === "object" ? value : {};
  const blocking = sanitizeRequirementQuestionEntries(source.blocking, "blocking", 8);
  const defaultable = sanitizeRequirementQuestionEntries(source.defaultable, "defaultable", 8);
  const taste = sanitizeRequirementQuestionEntries(source.taste, "taste", 8);
  const askNext = sanitizeRequirementQuestionEntries(
    source.askNext,
    blocking.length ? "blocking" : defaultable.length ? "defaultable" : "taste",
    3
  );
  if (blocking.length || defaultable.length || taste.length || askNext.length) {
    return {
      summary: safeString(source.summary, 320),
      blocking,
      defaultable,
      taste,
      askNext: askNext.length ? askNext : [...blocking, ...defaultable, ...taste].slice(0, 3),
    };
  }
  const fallbackBlocking = uniqueStrings(requirement.openQuestions, 8).map((question) => ({ question, category: "blocking", reason: "" }));
  return {
    summary: "",
    blocking: fallbackBlocking,
    defaultable: [],
    taste: [],
    askNext: fallbackBlocking.slice(0, 3),
  };
}

function sanitizeRequirementDelightPlan(value, requirement = {}) {
  const source = value && typeof value === "object" ? value : {};
  const candidates = (Array.isArray(source.candidates) ? source.candidates : []).map((entry, index) => {
    const item = entry && typeof entry === "object" ? entry : {};
    const title = safeString(item.title || item.value, 240);
    if (!title) return null;
    return {
      id: safeString(item.id, 80) || `delight_${index + 1}`,
      title,
      reason: safeString(item.reason, 200),
      autoEligible: Boolean(item.autoEligible),
    };
  }).filter(Boolean).slice(0, 6);
  if (candidates.length) {
    return {
      summary: safeString(source.summary, 320),
      candidates,
    };
  }
  const fallbackCandidates = uniqueStrings(requirement.overDeliveryScope, 6).map((title, index) => ({
    id: `delight_${index + 1}`,
    title,
    reason: "",
    autoEligible: false,
  }));
  return {
    summary: "",
    candidates: fallbackCandidates,
  };
}

function sanitizeRequirementDisplayContract(value, requirement = {}) {
  const source = value && typeof value === "object" ? value : {};
  const questionPlan = sanitizeRequirementQuestionPlan(source.questionPlan || requirement.questionPlan, requirement);
  const delightPlan = sanitizeRequirementDelightPlan(source.delightPlan || requirement.delightPlan, requirement);
  const boundaries = uniqueStrings(source.boundaries, 6);
  const askNext = sanitizeRequirementQuestionEntries(source.askNext, "blocking", 3);
  const normalizedStatus = safeString(requirement.status, 40).toUpperCase();
  const fallbackGoal = [
    safeString(requirement.lockedGoal, 320),
    safeString(requirement.intentInterpretation && requirement.intentInterpretation.direction, 320),
    safeString(requirement.explicitGoal, 320),
    safeString(requirement.implicitGoal, 320),
    safeString(requirement.userValueFrame && requirement.userValueFrame.valueThesis, 320),
  ].find((entry) => entry && !requirementLooksFragmentaryGoalText(entry))
    || safeString(requirement.intentInterpretation && requirement.intentInterpretation.direction, 320)
    || safeString(requirement.explicitGoal, 320)
    || safeString(requirement.implicitGoal, 320)
    || safeString(requirement.userValueFrame && requirement.userValueFrame.valueThesis, 320);
  const sourceHeadline = safeString(source.headline, 320);
  const sourceGoal = safeString(source.goal, 320);
  const effectiveLockedGoal = safeString(requirement.lockedGoal, 320) && normalizedStatus !== "BLOCKED"
    ? safeString(requirement.lockedGoal, 320)
    : "";
  return {
    headline: !requirementLooksFragmentaryGoalText(sourceHeadline) ? sourceHeadline || fallbackGoal : fallbackGoal,
    goal: !requirementLooksFragmentaryGoalText(sourceGoal) ? sourceGoal || fallbackGoal : fallbackGoal,
    goalMode: normalizeRequirementDisplayMode(source.goalMode, effectiveLockedGoal ? "locked" : fallbackGoal ? "hypothesis" : "draft"),
    goalLabel: safeString(source.goalLabel, 80) || (effectiveLockedGoal ? "locked_goal" : "working_hypothesis"),
    nextAction: safeString(source.nextAction, 320),
    holdReason: safeString(source.holdReason, 320),
    targetOutcome: safeString(source.targetOutcome, 320),
    boundaries: uniqueStrings([
      ...boundaries,
      ...uniqueStrings(requirement.nonGoals, 4),
      ...uniqueStrings(requirement.approvalBoundaryItems, 4).map((entry) => formatRequirementApprovalBoundary(entry)),
      ...uniqueStrings(requirement.userValueFrame && requirement.userValueFrame.mustAvoid, 4),
      ...uniqueStrings(requirement.userValueFrame && requirement.userValueFrame.hardConstraints, 4),
    ], 6),
    askNext: askNext.length ? askNext : questionPlan.askNext,
    delightTitles: uniqueStrings(source.delightTitles, 4).length
      ? uniqueStrings(source.delightTitles, 4)
      : delightPlan.candidates.map((entry) => entry.title).slice(0, 4),
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
  const stitchGoal = buildStitchRecreationGoal(extractStitchPromptContext(prompt));
  if (stitchGoal) return stitchGoal;
  const aliases = contract && contract.signals && contract.signals.sectionAliases ? contract.signals.sectionAliases.goal : [];
  const goalEntries = collectEntriesFromSections(collectSectionsByAlias(sections, aliases));
  const goalFromSections = selectBestGoalCandidate(goalEntries);
  if (goalFromSections) return goalFromSections;
  const goalFromPromptLines = selectBestGoalCandidate(safeString(prompt, 40000).split(/\r?\n/));
  if (goalFromPromptLines) return goalFromPromptLines;
  if (/[?？]/.test(safeString(prompt, 40000))) {
    const inferredQuestionGoal = inferQuestionAnswerGoal(prompt);
    if (inferredQuestionGoal) return inferredQuestionGoal;
  }
  for (const paragraph of extractPromptParagraphs(prompt)) {
    const candidate = normalizePromptRequirementLine(paragraph, 320);
    if (!candidate || isGreetingOnlyLine(candidate) || isComplaintLeadLine(candidate)) continue;
    return firstSentence(candidate);
  }
  return "";
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

function normalizePreviousPlanningContext(options = {}) {
  const raw = options && options.previousPlanningContext && typeof options.previousPlanningContext === "object"
    ? options.previousPlanningContext
    : null;
  if (!raw) return null;
  const sanitized = sanitizePlanningArtifactsForRuntime(raw);
  const benchmarkCandidates = uniqueStrings(
    sanitized
    && sanitized.requirementContract
    && sanitized.requirementContract.userValueFrame
    && Array.isArray(sanitized.requirementContract.userValueFrame.benchmarkCandidates)
      ? sanitized.requirementContract.userValueFrame.benchmarkCandidates
      : [],
    6
  );
  const taskFamily = safeString(sanitized && sanitized.selection && sanitized.selection.taskFamily, 80)
    || safeString(sanitized && sanitized.requirementContract && sanitized.requirementContract.taskFamily, 80);
  if (!taskFamily && benchmarkCandidates.length === 0) return null;
  return {
    planningContext: sanitized,
    taskFamily,
    familyProfileId: safeString(sanitized && sanitized.selection && sanitized.selection.familyProfileId, 80)
      || safeString(sanitized && sanitized.requirementContract && sanitized.requirementContract.familyProfileId, 80)
      || taskFamily,
    familyProfile: sanitized && sanitized.selection && sanitized.selection.familyProfile && typeof sanitized.selection.familyProfile === "object"
      ? sanitized.selection.familyProfile
      : {},
    benchmarkCandidates,
  };
}

function promptLooksLikeWebCreativeFollowUp(prompt = "") {
  const text = sanitizePromptForPolicyAnalysis(prompt);
  if (!text) return false;
  const explanationOnly =
    /(?:why|reason|explain|what happened|なぜ|理由|どういうこと|解説|説明)/i.test(text)
    && !/(?:fix|change|revise|adjust|match|recreate|redo|improve|closer|same|similar|copy|ほぼ同じ|完全再現|丸パクリ|再現|寄せ|似せ|修正|直して|改善|作り直|再構築)/i.test(text);
  if (explanationOnly) return false;
  return /(?:design|ui|ux|website|landing|page|hero|header|footer|layout|font|visual|style|screenshot|benchmark|reference|recreate|match|same|similar|closer|copy|pixel|suruga-k|トップ|ヘッダー|フッター|レイアウト|フォント|見た目|画面|サイト|ページ|参考|再現|寄せ|似せ|全然違う|気に入らん|もっと|修正|直して|改善|作り直|再構築|ほぼ同じ|完全再現|丸パクリ)/i.test(text);
}

function buildInheritedFamilySelection({ familySelection, prompt = "", options = {} } = {}) {
  const current = familySelection && typeof familySelection === "object" ? familySelection : {};
  const previous = normalizePreviousPlanningContext(options);
  if (!previous) return current;
  if (safeString(previous.taskFamily, 80).toLowerCase() !== "web_creative") return current;
  if (!promptLooksLikeWebCreativeFollowUp(prompt)) return current;
  return {
    ...current,
    taskFamily: "web_creative",
    familyProfileId: previous.familyProfileId || "web_creative",
    label: safeString(previous.familyProfile && previous.familyProfile.label, 120) || "Web Creative",
    objective: safeString(previous.familyProfile && previous.familyProfile.objective, 80) || "wow_first",
    minimumPlanningMode: normalizePlanningMode(previous.familyProfile && previous.familyProfile.minimumPlanningMode, "NORMAL"),
    ambiguityHandling: safeString(previous.familyProfile && previous.familyProfile.ambiguityHandling, 80) || "expand_with_directions",
    completionContract: safeString(previous.familyProfile && previous.familyProfile.completionContract, 80) || "design_acceptance",
    reasons: uniqueStrings([
      ...(Array.isArray(current.reasons) ? current.reasons : []),
      "inheritedFamily=web_creative",
      `inheritedBenchmarks=${previous.benchmarkCandidates.length}`,
    ], 8),
    keywordHits: uniqueStrings([
      ...(Array.isArray(current.keywordHits) ? current.keywordHits : []),
      ...previous.benchmarkCandidates,
    ], 8),
    executionSourceMatched: current.executionSourceMatched ? 1 : 0,
  };
}

function extractEffectiveBenchmarkCandidates({ prompt = "", options = {}, selection = null } = {}) {
  const direct = extractReferenceUrls(prompt, 6);
  const fromSelection = Array.isArray(selection && selection.extracted && selection.extracted.benchmarkCandidates)
    ? selection.extracted.benchmarkCandidates
    : [];
  const previous = normalizePreviousPlanningContext(options);
  const inherited = previous && promptLooksLikeWebCreativeFollowUp(prompt)
    ? previous.benchmarkCandidates
    : [];
  return uniqueStrings([...direct, ...fromSelection, ...inherited], 6);
}

function hasStrictBenchmarkRecreationIntent(text = "") {
  return /(?:match (?:it|this|the reference) closely|match as closely as possible|recreate(?: it)? exactly|pixel-?perfect|verbatim recreation|copy it|same look|same as the reference|ほぼ同じ|完全再現|丸パクリ|できる限り同じ|そっくり|そのまま再現|できるだけ近く|限界まで寄せ|限界まで似せ)/i.test(text);
}

function normalizeOwnedPathFromWorkspace(cwd, relativePath) {
  const normalizedCwd = safeString(cwd, 320);
  const normalizedRelative = safeString(relativePath, 240).replace(/\\/g, "/");
  if (!normalizedCwd || !normalizedRelative) return "";
  const absolutePath = path.join(normalizedCwd, normalizedRelative.replace(/\//g, path.sep));
  if (!fs.existsSync(absolutePath)) return "";
  try {
    return fs.statSync(absolutePath).isDirectory()
      ? normalizedRelative.replace(/\/?$/, "/")
      : normalizedRelative.replace(/\/+$/, "");
  } catch {
    return "";
  }
}

function collectWorkspaceOwnedPaths(cwd, candidates, max = 6) {
  return uniqueStrings(
    (Array.isArray(candidates) ? candidates : [])
      .map((entry) => normalizeOwnedPathFromWorkspace(cwd, entry))
      .filter(Boolean),
    max
  );
}

function filterPromptOwnedPaths(prompt, pattern, max = 6) {
  return uniqueStrings(
    extractPathHints(prompt).filter((entry) => pattern.test(entry)),
    max
  );
}

function buildAssuranceSelection({ prompt, selection, assuranceContract }) {
  const analysisPrompt = sanitizePromptForPolicyAnalysis(prompt);
  const text = safeString(analysisPrompt, 40000);
  const areas = detectScopeAreas(analysisPrompt, selection.extracted.baselineScope);
  const benchmarkCandidates = extractEffectiveBenchmarkCandidates({ prompt: analysisPrompt, selection });
  const benchmarkedWebCreative =
    safeString(selection && selection.taskFamily, 80).toLowerCase() === "web_creative"
    && benchmarkCandidates.length > 0;
  const strictBenchmarkRecreation = benchmarkedWebCreative && hasStrictBenchmarkRecreationIntent(text);
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
  const reviewerSuggested = strictBenchmarkRecreation || benchmarkedWebCreative || reviewHits.length > 0 || selection.signals.specialistBoundaryCount > 1;
  const testerSuggested = strictBenchmarkRecreation || testerHits.length > 0 || runtimeTouch || protocolTouch || selection.signals.overDeliveryRisk === "high";
  const signoffImportant =
    strictBenchmarkRecreation ||
    signoffHits.length > 0 ||
    protocolTouch ||
    governanceTouch ||
    (runtimeTouch && (irreversibleRisk || implementationBoundaryCount > 1 || selection.signals.overDeliveryRisk === "high"));
  const newLogicRisk = strictBenchmarkRecreation || newLogicHits.length > 0 || selection.signals.overDeliveryRisk === "high";
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
    !benchmarkedWebCreative &&
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
  let selectedAssuranceDepth = strictBenchmarkRecreation
    ? "SIGNOFF_ASSURANCE"
    : signoffRequired
    ? "SIGNOFF_ASSURANCE"
    : lightEligible
      ? "LIGHT_ASSURANCE"
      : mapAssuranceScoreToDepth(assuranceScoreBreakdown.total);
  if (benchmarkedWebCreative && selectedAssuranceDepth === "LIGHT_ASSURANCE") {
    selectedAssuranceDepth = "STANDARD_ASSURANCE";
  }
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
      `benchmarkAnchored=${benchmarkedWebCreative ? "yes" : "no"}`,
      `strictBenchmarkRecreation=${strictBenchmarkRecreation ? "yes" : "no"}`,
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
      benchmarkAnchored: benchmarkedWebCreative ? 1 : 0,
      strictBenchmarkRecreation: strictBenchmarkRecreation ? 1 : 0,
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
  benchmarkCandidates = [],
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
    (Array.isArray(benchmarkCandidates) ? benchmarkCandidates.length : 0) > 0
    || extractReferenceUrls(normalizedPrompt, 6).length > 0
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
  const stitchContext = extractStitchPromptContext(analysisPrompt);
  const aliases = contracts.planning.signals.sectionAliases;
  const explicitGoal = extractExplicitGoal(analysisPrompt, sections, contracts.planning);
  const implicitGoal = extractImplicitGoal(analysisPrompt, sections, contracts.planning);
  const baselineScope = uniqueStrings([
    ...collectEntriesFromSections(collectSectionsByAlias(sections, aliases.baseline)),
    ...collectEntriesFromSections(collectSectionsByAlias(sections, aliases.constraints)),
    ...inferBaselineScopeFromPrompt(analysisPrompt, explicitGoal),
  ], 24);
  const nonGoals = collectEntriesFromSections(collectSectionsByAlias(sections, aliases.nonGoals));
  const extractedAcceptanceChecks = extractAcceptanceChecks(analysisPrompt, sections, contracts.planning);
  const familySelection = buildInheritedFamilySelection({
    familySelection: selectTaskFamilyProfile({
      prompt: analysisPrompt,
      options,
      contract: contracts.familyProfiles,
    }),
    prompt: analysisPrompt,
    options,
  });
  const benchmarkCandidates = extractEffectiveBenchmarkCandidates({ prompt: analysisPrompt, options });
  const acceptanceChecks = buildAutonomousAcceptanceChecks({
    prompt: analysisPrompt,
    explicitGoal,
    implicitGoal,
    baselineScope,
    nonGoals,
    taskFamily: familySelection.taskFamily,
    benchmarkCandidates,
    existingAcceptanceChecks: extractedAcceptanceChecks,
  });
  const questionCandidates = extractQuestionCandidates(analysisPrompt, contracts.planning.signals.openQuestionKeywords);
  const initialOpenQuestions = uniqueStrings([
    ...filterBlockingOpenQuestions(questionCandidates),
    ...inferOpenQuestionsFromAmbiguity(analysisPrompt),
  ], 12);
  const approvalBoundaryItems = detectApprovalBoundaryItems(analysisPrompt, contracts.planning.signals.approvalBoundaryKeywords);
  const explicitUserDecisionRequired =
    approvalBoundaryItems.length > 0 || hasAnyKeyword(analysisPrompt, contracts.planning.signals.userDecisionKeywords);
  const questionPartition = partitionRequirementQuestions({
    openQuestions: initialOpenQuestions,
    taskFamily: familySelection.taskFamily,
    approvalBoundaryItems,
    acceptanceChecks,
    baselineScope,
    benchmarkCandidates,
    prompt: analysisPrompt,
  });
  const clarificationDecision = buildClarificationDecision({
    prompt: analysisPrompt,
    taskFamily: familySelection.taskFamily,
    openQuestions: questionPartition.blocking.map((entry) => entry.question),
    approvalBoundaryItems,
    explicitUserDecisionRequired,
    acceptanceChecks: extractedAcceptanceChecks,
    baselineScope,
    benchmarkCandidates,
  });
  const openQuestions = uniqueStrings([
    ...questionPartition.blocking.map((entry) => entry.question),
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
    `benchmarkCandidates=${benchmarkCandidates.length}`,
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
      explicitGoal,
      implicitGoal,
      baselineScope,
      overDeliveryScope: overDeliveryRisk.hits,
      nonGoals,
      acceptanceChecks,
      openQuestions,
      approvalBoundaryItems,
      benchmarkCandidates,
      stitchContext,
      deferredQuestions: {
        defaultable: questionPartition.defaultable.map((entry) => entry.question),
        taste: questionPartition.taste.map((entry) => entry.question),
      },
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
  const deferredQuestions = normalizedSelection
    && normalizedSelection.extracted
    && normalizedSelection.extracted.deferredQuestions
    && typeof normalizedSelection.extracted.deferredQuestions === "object"
      ? normalizedSelection.extracted.deferredQuestions
      : {};
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
    benchmarkCandidates: normalizedSelection.extracted.benchmarkCandidates,
  });
  const intentInterpretation = buildRequirementIntentInterpretation({
    prompt: analysisPrompt,
    explicitGoal,
    implicitGoal,
    baselineScope: normalizedSelection.extracted.baselineScope,
    userValueFrame,
  });
  const goalProvenance = buildRequirementGoalProvenance({
    prompt: analysisPrompt,
    sections,
    contract: normalizedContracts.planning,
    explicitGoal,
    implicitGoal,
  });
  const nonGoalProvenance = buildRequirementNonGoalProvenance({
    prompt: analysisPrompt,
    explicitNonGoals: normalizedSelection.extracted.nonGoals,
    finalNonGoals: inferredNonGoals,
  });
  const provenance = {
    explicitGoal: goalProvenance.explicitGoal,
    implicitGoal: goalProvenance.implicitGoal,
    nonGoals: nonGoalProvenance,
    userValueFrame: buildUserValueFrameProvenance({
      prompt: analysisPrompt,
      options,
      explicitGoal,
      implicitGoal,
      taskFamily: safeString(normalizedSelection.taskFamily, 80) || "deterministic_code",
      userValueFrame,
      baselineScope: normalizedSelection.extracted.baselineScope,
      acceptanceChecks: normalizedSelection.extracted.acceptanceChecks,
      approvalBoundaryItems: normalizedSelection.extracted.approvalBoundaryItems,
      benchmarkCandidates: normalizedSelection.extracted.benchmarkCandidates,
      nonGoalProvenance,
      goalProvenance,
    }),
    intentInterpretation: buildRequirementIntentProvenance(intentInterpretation),
  };
  const requirementContract = {
    schema: "requirement-contract.v5",
    source: "runtime_inferred_pre_dispatch",
    promptHash: normalizedSelection.promptHash,
    explicitGoal,
    implicitGoal,
    lockedGoal: "",
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
    intentInterpretation,
    provenance,
    intentHypotheses: [],
    challengeReport: { summary: "", proceedRisk: "medium", findings: [] },
    questionPlan: { summary: "", blocking: [], defaultable: [], taste: [], askNext: [] },
    delightPlan: { summary: "", candidates: [] },
    displayContract: {
      headline: "",
      goal: "",
      goalMode: "draft",
      goalLabel: "working_hypothesis",
      nextAction: "",
      holdReason: "",
      targetOutcome: "",
      boundaries: [],
      askNext: [],
      delightTitles: [],
    },
    selectedPlanningMode: normalizedSelection.selectedMode,
    selectedPlanningDepth: normalizedSelection.selectedPlanningDepth,
    selectedAssuranceDepth: normalizedSelection.selectedAssuranceDepth,
    planningModeReasons: normalizedSelection.planningReasons,
    assuranceDepthReasons: normalizedSelection.assuranceReasons,
  };
  const validation = buildRequirementValidation({ requirementContract, selection: normalizedSelection });
  requirementContract.validation = validation;
  requirementContract.lockedGoal = buildRequirementLockedGoal({
    requirementContract,
    selection: normalizedSelection,
    validation,
  });
  requirementContract.intentHypotheses = buildRequirementIntentHypotheses({
    requirementContract,
    selection: normalizedSelection,
    lockedGoal: requirementContract.lockedGoal,
  });
  requirementContract.challengeReport = buildRequirementChallengeReport({
    requirementContract,
    selection: normalizedSelection,
  });
  requirementContract.questionPlan = buildRequirementQuestionPlan({
    requirementContract,
    selection: normalizedSelection,
    challengeReport: requirementContract.challengeReport,
  });
  requirementContract.delightPlan = buildRequirementDelightPlan({
    requirementContract,
    selection: normalizedSelection,
  });
  requirementContract.displayContract = buildRequirementDisplayContract({
    requirementContract,
    selection: normalizedSelection,
    status: validation.canProceed ? "LOCKED" : "BLOCKED",
    challengeReport: requirementContract.challengeReport,
    questionPlan: requirementContract.questionPlan,
    delightPlan: requirementContract.delightPlan,
    intentHypotheses: requirementContract.intentHypotheses,
    lockedGoal: requirementContract.lockedGoal,
  });
  const revisionLedger = buildRequirementRevisionLedger({ requirementContract, options });
  requirementContract.revisionLedger = revisionLedger;
  const statusDecision = deriveRequirementStatus({
    requirementContract,
    selection: normalizedSelection,
    validation,
    revisionLedger,
  });
  requirementContract.status = statusDecision.status;
  requirementContract.statusReason = statusDecision.statusReason;
  requirementContract.lockedGoal = buildRequirementLockedGoal({
    requirementContract,
    selection: normalizedSelection,
    validation,
    status: statusDecision.status,
  });
  requirementContract.intentHypotheses = buildRequirementIntentHypotheses({
    requirementContract,
    selection: normalizedSelection,
    lockedGoal: requirementContract.lockedGoal,
  });
  requirementContract.displayContract = buildRequirementDisplayContract({
    requirementContract,
    selection: normalizedSelection,
    status: statusDecision.status,
    challengeReport: requirementContract.challengeReport,
    questionPlan: requirementContract.questionPlan,
    delightPlan: requirementContract.delightPlan,
    intentHypotheses: requirementContract.intentHypotheses,
    lockedGoal: requirementContract.lockedGoal,
  });
  return requirementContract;
}

function defaultOwnedPathsForRole(role, prompt, options = {}) {
  const lower = sanitizePromptForPolicyAnalysis(prompt).toLowerCase();
  const cwd = safeString(options && options.cwd, 320);
  switch (role) {
    case "frontend_worker": {
      const promptOwnedPaths = filterPromptOwnedPaths(prompt, /^(?:web\/|resources\/(?:views|css|js)\/?|routes\/web\.php|public\/|src\/|pages\/|components\/|app\/View\/)/i, 6);
      if (promptOwnedPaths.length) return promptOwnedPaths;
      const workspaceOwnedPaths = collectWorkspaceOwnedPaths(cwd, [
        "resources/views",
        "resources/css",
        "resources/js",
        "routes/web.php",
        "web",
        "src",
        "pages",
        "components",
        "public",
      ], 6);
      return workspaceOwnedPaths.length ? workspaceOwnedPaths : ["web/"];
    }
    case "backend_worker": {
      const promptOwnedPaths = filterPromptOwnedPaths(prompt, /^(?:server\.js|scripts\/|app\/|routes\/|config\/|database\/|bootstrap\/)/i, 6);
      if (promptOwnedPaths.length) return promptOwnedPaths;
      const workspaceOwnedPaths = collectWorkspaceOwnedPaths(cwd, [
        "server.js",
        "scripts",
        "app",
        "routes",
        "config",
        "database",
        "bootstrap",
      ], 6);
      if (workspaceOwnedPaths.length) return workspaceOwnedPaths;
      return lower.includes("server.js") ? ["server.js", "scripts/"] : ["scripts/", "server.js"];
    }
    case "infra_worker": {
      const promptOwnedPaths = filterPromptOwnedPaths(prompt, /^(?:docs\/|scripts\/config\/|docker-compose\.yml|docker-compose\.yaml|composer\.json|package\.json|vite\.config\.[cm]?js|\.env(?:\.example)?)/i, 6);
      if (promptOwnedPaths.length) return promptOwnedPaths;
      const workspaceOwnedPaths = collectWorkspaceOwnedPaths(cwd, [
        "docs",
        "scripts/config",
        "docker-compose.yml",
        "docker-compose.yaml",
        "composer.json",
        "package.json",
        "vite.config.js",
        "vite.config.mjs",
        "vite.config.cjs",
        ".env.example",
      ], 6);
      return workspaceOwnedPaths.length ? workspaceOwnedPaths : ["docs/", "scripts/config/"];
    }
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
        ownedPaths: defaultOwnedPathsForRole(role, prompt, options),
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
      schema: safeString(requirement.schema, 80) || "requirement-contract.v5",
      source: safeString(requirement.source, 80) || "runtime_inferred_pre_dispatch",
      promptHash: safeString(requirement.promptHash, 80) || safeString(selection.promptHash, 80),
      explicitGoal: safeString(requirement.explicitGoal, 320),
      implicitGoal: safeString(requirement.implicitGoal, 320),
      lockedGoal: safeString(requirement.lockedGoal, 320),
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
      intentInterpretation: sanitizeRequirementIntentInterpretation(requirement.intentInterpretation),
      intentHypotheses: sanitizeRequirementIntentHypotheses(requirement.intentHypotheses, requirement),
      challengeReport: sanitizeRequirementChallengeReport(requirement.challengeReport, requirement),
      questionPlan: sanitizeRequirementQuestionPlan(requirement.questionPlan, requirement),
      delightPlan: sanitizeRequirementDelightPlan(requirement.delightPlan, requirement),
      displayContract: sanitizeRequirementDisplayContract(requirement.displayContract, requirement),
      status: normalizeRequirementStatus(
        requirement.status,
        !requirementHasCoreData(requirement)
          ? "DRAFT"
          : normalizePlanningMode(requirement.selectedPlanningMode || selectedMode, "NORMAL") === "DISCOVERY"
            ? "BLOCKED"
            : "LOCKED"
      ),
      statusReason: safeString(requirement.statusReason, 240),
      provenance: sanitizeRequirementProvenance(requirement.provenance, requirement),
      validation: sanitizeRequirementValidation(requirement.validation, requirement),
      revisionLedger: sanitizeRequirementRevisionLedger(requirement.revisionLedger),
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
