"use strict";

const fs = require("fs");
const path = require("path");

const workspaceRoot = path.resolve(__dirname, "..", "..");
const defaultPolicyPath = path.join(workspaceRoot, "scripts", "config", "skill_portfolio_policy.json");
const defaultCatalogPath = path.join(workspaceRoot, "scripts", "config", "skill_catalog.json");
const defaultOutcomesPath = path.join(workspaceRoot, "logs", "skill_outcomes.jsonl");

const knownClasses = Object.freeze(["global", "role", "scenario", "experiment"]);
const knownCoverageLabels = Object.freeze(["generic", "semi_generic", "partial"]);

let policyCache = null;
let policySource = "builtin";
let policyLoadError = "";

let catalogCache = null;
let catalogSource = "builtin";
let catalogLoadError = "";

function safeString(value, max = 400) {
  if (typeof value !== "string") {
    return "";
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return "";
  }
  return trimmed.slice(0, max);
}

function normalizeNumber(value, fallback = 0, min = 0, max = 1) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.max(min, Math.min(max, parsed));
}

function normalizeInt(value, fallback = 1, min = 1, max = 1000) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.max(min, Math.min(max, Math.trunc(parsed)));
}

function normalizeBoolean(value, fallback = false) {
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value === "number") {
    return Number.isFinite(value) ? value !== 0 : fallback;
  }
  if (typeof value === "string") {
    const lowered = value.trim().toLowerCase();
    if (["1", "true", "yes", "on"].includes(lowered)) {
      return true;
    }
    if (["0", "false", "no", "off"].includes(lowered)) {
      return false;
    }
  }
  return fallback;
}

function uniqueStrings(values) {
  if (!Array.isArray(values)) {
    return [];
  }
  const out = [];
  const seen = new Set();
  for (const raw of values) {
    const value = safeString(raw, 120);
    if (!value || seen.has(value)) {
      continue;
    }
    seen.add(value);
    out.push(value);
  }
  return out;
}

function normalizeRoleName(value) {
  return safeString(value, 120).toLowerCase().replace(/[\s-]+/g, "_");
}

function resolvePath(rawPathValue, fallbackPath) {
  const rawPath = safeString(rawPathValue, 400);
  if (!rawPath) {
    return fallbackPath;
  }
  if (path.isAbsolute(rawPath)) {
    return path.normalize(rawPath);
  }
  return path.normalize(path.join(workspaceRoot, rawPath));
}

function readJsonFile(filePath) {
  try {
    if (!fs.existsSync(filePath)) {
      return { parsed: null, source: "builtin", loadError: `file_not_found:${filePath}` };
    }
    const raw = fs.readFileSync(filePath, "utf8");
    const parsed = JSON.parse(raw);
    return { parsed, source: "file", loadError: "" };
  } catch (error) {
    return {
      parsed: null,
      source: "builtin",
      loadError: error instanceof Error ? error.message : String(error),
    };
  }
}

function normalizeShareMap(input, fallback, classes) {
  const source = input && typeof input === "object" ? input : fallback;
  const out = {};
  for (const className of classes) {
    if (!Object.prototype.hasOwnProperty.call(source, className)) {
      continue;
    }
    out[className] = normalizeNumber(source[className], fallback[className] ?? 0, 0, 1);
  }
  return out;
}

function normalizeRoleRequirements(rawRequirements, classes) {
  const source = rawRequirements && typeof rawRequirements === "object" ? rawRequirements : {};
  const out = {};
  for (const [rawRole, rawEntry] of Object.entries(source)) {
    const role = normalizeRoleName(rawRole);
    if (!role) {
      continue;
    }
    const entry = rawEntry && typeof rawEntry === "object" ? rawEntry : {};
    const requiredClasses = uniqueStrings(entry.requiredClasses)
      .map((className) => className.toLowerCase())
      .filter((className) => classes.includes(className));
    out[role] = Object.freeze({
      role,
      minSkills: normalizeInt(entry.minSkills, 1, 1, 50),
      requiredClasses,
    });
  }
  return Object.freeze(out);
}

function normalizePromotionRule(rawRule, fallbackRule) {
  const source = rawRule && typeof rawRule === "object" ? rawRule : fallbackRule;
  return Object.freeze({
    minRuns: normalizeInt(source.minRuns, fallbackRule.minRuns, 1, 10000),
    minSuccessRate: normalizeNumber(source.minSuccessRate, fallbackRule.minSuccessRate, 0, 1),
    minPrimaryScore: normalizeNumber(source.minPrimaryScore, fallbackRule.minPrimaryScore, 0, 1),
    maxGuardFailures: normalizeInt(source.maxGuardFailures, fallbackRule.maxGuardFailures, 0, 10000),
  });
}

function normalizePolicy(rawPolicy, { source, policyPath }) {
  const fallback = {
    schema: "skill-portfolio-policy.v1",
    version: "builtin",
    classes: knownClasses,
    coverageLabels: knownCoverageLabels,
    portfolio: {
      minClassDiversity: 3,
      minClassShare: { global: 0.12, role: 0.22, scenario: 0.25 },
      maxClassShare: { global: 0.45, role: 0.55, scenario: 0.70, experiment: 0.25 },
    },
    roleRequirements: {},
    promotionRules: {
      scenarioToRole: { minRuns: 6, minSuccessRate: 0.84, minPrimaryScore: 0.80, maxGuardFailures: 0 },
      roleToGlobal: { minRuns: 12, minSuccessRate: 0.90, minPrimaryScore: 0.87, maxGuardFailures: 0 },
    },
    guardrail: { blockPromotionOnGuardFailure: true },
  };

  const input = rawPolicy && typeof rawPolicy === "object" ? rawPolicy : {};
  const classes = uniqueStrings(input.classes).map((entry) => entry.toLowerCase());
  const normalizedClasses = classes.length ? classes.filter((entry) => knownClasses.includes(entry)) : fallback.classes;
  const coverageLabels = uniqueStrings(input.coverageLabels).map((entry) => entry.toLowerCase());
  const normalizedCoverage = coverageLabels.length
    ? coverageLabels.filter((entry) => knownCoverageLabels.includes(entry))
    : fallback.coverageLabels;

  const minClassShare = normalizeShareMap(input.portfolio && input.portfolio.minClassShare, fallback.portfolio.minClassShare, normalizedClasses);
  const maxClassShare = normalizeShareMap(input.portfolio && input.portfolio.maxClassShare, fallback.portfolio.maxClassShare, normalizedClasses);

  return Object.freeze({
    schema: safeString(input.schema, 120) || fallback.schema,
    version: safeString(input.version, 120) || fallback.version,
    source,
    policyPath,
    classes: Object.freeze(normalizedClasses),
    coverageLabels: Object.freeze(normalizedCoverage),
    portfolio: Object.freeze({
      minClassDiversity: normalizeInt(
        input.portfolio && input.portfolio.minClassDiversity,
        fallback.portfolio.minClassDiversity,
        1,
        normalizedClasses.length
      ),
      minClassShare: Object.freeze(minClassShare),
      maxClassShare: Object.freeze(maxClassShare),
    }),
    roleRequirements: normalizeRoleRequirements(input.roleRequirements, normalizedClasses),
    promotionRules: Object.freeze({
      scenarioToRole: normalizePromotionRule(
        input.promotionRules && input.promotionRules.scenarioToRole,
        fallback.promotionRules.scenarioToRole
      ),
      roleToGlobal: normalizePromotionRule(
        input.promotionRules && input.promotionRules.roleToGlobal,
        fallback.promotionRules.roleToGlobal
      ),
    }),
    guardrail: Object.freeze({
      blockPromotionOnGuardFailure: normalizeBoolean(
        input.guardrail && input.guardrail.blockPromotionOnGuardFailure,
        fallback.guardrail.blockPromotionOnGuardFailure
      ),
    }),
  });
}

function normalizeMetric(metric, fallbackName, fallbackTarget, fallbackDirection) {
  const source = metric && typeof metric === "object" ? metric : {};
  const direction = safeString(source.direction, 80).toLowerCase() || fallbackDirection;
  return Object.freeze({
    name: safeString(source.name, 120) || fallbackName,
    target: normalizeNumber(source.target, fallbackTarget, 0, 1),
    limit: normalizeNumber(source.limit, fallbackTarget, 0, 1),
    direction: ["higher_is_better", "lower_is_better"].includes(direction) ? direction : fallbackDirection,
  });
}

function normalizeSkillEntry(skillId, rawEntry, policy) {
  const entry = rawEntry && typeof rawEntry === "object" ? rawEntry : {};
  const metadataIssues = [];
  const normalizedClass = safeString(entry.class, 50).toLowerCase();
  const normalizedCoverage = safeString(entry.coverage, 50).toLowerCase();
  const ownerRoles = uniqueStrings(entry.ownerRoles).map((role) => normalizeRoleName(role)).filter(Boolean);

  if (!policy.classes.includes(normalizedClass)) {
    metadataIssues.push("invalid_class");
  }
  if (!policy.coverageLabels.includes(normalizedCoverage)) {
    metadataIssues.push("invalid_coverage");
  }
  if (!ownerRoles.length) {
    metadataIssues.push("missing_owner_roles");
  }
  if (!safeString(entry.intent, 500)) {
    metadataIssues.push("missing_intent");
  }

  const primaryMetric = normalizeMetric(
    entry.primaryMetric,
    "unspecified_primary_metric",
    0.8,
    "higher_is_better"
  );
  if (primaryMetric.name === "unspecified_primary_metric") {
    metadataIssues.push("missing_primary_metric");
  }

  const guardMetrics = Array.isArray(entry.guardMetrics)
    ? entry.guardMetrics.map((metric, index) => normalizeMetric(metric, `guard_metric_${index + 1}`, 0.1, "lower_is_better"))
    : [];
  if (!guardMetrics.length) {
    metadataIssues.push("missing_guard_metrics");
  }

  return Object.freeze({
    id: safeString(skillId, 120),
    class: policy.classes.includes(normalizedClass) ? normalizedClass : "scenario",
    coverage: policy.coverageLabels.includes(normalizedCoverage) ? normalizedCoverage : "partial",
    maturity: safeString(entry.maturity, 80) || "candidate",
    ownerRoles,
    intent: safeString(entry.intent, 500),
    primaryMetric,
    guardMetrics: Object.freeze(guardMetrics),
    metadataIssues: Object.freeze(metadataIssues),
  });
}

function normalizeCatalog(rawCatalog, policy, { source, catalogPath }) {
  const input = rawCatalog && typeof rawCatalog === "object" ? rawCatalog : {};
  const rawAssignments = input.assignments && typeof input.assignments === "object" ? input.assignments : {};
  const assignments = {};
  for (const [rawRole, rawSkills] of Object.entries(rawAssignments)) {
    const role = normalizeRoleName(rawRole);
    if (!role) {
      continue;
    }
    assignments[role] = uniqueStrings(rawSkills);
  }

  const rawSkills = input.skills && typeof input.skills === "object" ? input.skills : {};
  const normalizedSkills = {};
  for (const [skillId, skillEntry] of Object.entries(rawSkills)) {
    const id = safeString(skillId, 120);
    if (!id) {
      continue;
    }
    normalizedSkills[id] = normalizeSkillEntry(id, skillEntry, policy);
  }

  const normalizedMissingProposals = Array.isArray(input.missingProposals)
    ? input.missingProposals.map((entry) => {
      const sourceEntry = entry && typeof entry === "object" ? entry : {};
      return Object.freeze({
        id: safeString(sourceEntry.id, 120),
        skill: safeString(sourceEntry.skill, 120),
        desiredClass: safeString(sourceEntry.desiredClass, 50).toLowerCase(),
        coverage: safeString(sourceEntry.coverage, 50).toLowerCase(),
        intendedOwnerRoles: uniqueStrings(sourceEntry.intendedOwnerRoles).map((role) => normalizeRoleName(role)).filter(Boolean),
        neededCapability: safeString(sourceEntry.neededCapability, 500),
      });
    })
    : [];

  return Object.freeze({
    schema: safeString(input.schema, 120) || "skill-catalog.v1",
    version: safeString(input.version, 120) || "builtin",
    updatedAt: safeString(input.updatedAt, 60) || "",
    source,
    catalogPath,
    assignments: Object.freeze(assignments),
    skills: Object.freeze(normalizedSkills),
    missingProposals: Object.freeze(normalizedMissingProposals),
  });
}

function loadSkillPortfolioPolicy() {
  if (policyCache) {
    return policyCache;
  }
  const policyPath = resolvePath(process.env.CODEX_SKILL_PORTFOLIO_POLICY_PATH, defaultPolicyPath);
  const loaded = readJsonFile(policyPath);
  policySource = loaded.source;
  policyLoadError = loaded.loadError;
  policyCache = normalizePolicy(loaded.parsed, { source: loaded.source, policyPath });
  return policyCache;
}

function loadSkillCatalog() {
  if (catalogCache) {
    return catalogCache;
  }
  const policy = loadSkillPortfolioPolicy();
  const catalogPath = resolvePath(process.env.CODEX_SKILL_CATALOG_PATH, defaultCatalogPath);
  const loaded = readJsonFile(catalogPath);
  catalogSource = loaded.source;
  catalogLoadError = loaded.loadError;
  catalogCache = normalizeCatalog(loaded.parsed, policy, { source: loaded.source, catalogPath });
  return catalogCache;
}

function parseOutcomeEventsFromJsonl(inputPath = defaultOutcomesPath) {
  const outcomePath = resolvePath(inputPath, defaultOutcomesPath);
  if (!fs.existsSync(outcomePath)) {
    return {
      source: "missing",
      path: outcomePath,
      events: [],
      parseErrors: [],
    };
  }
  const raw = fs.readFileSync(outcomePath, "utf8");
  const lines = raw.split(/\r?\n/).filter((line) => line.trim().length > 0);
  const events = [];
  const parseErrors = [];
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    try {
      const parsed = JSON.parse(line);
      const skill = safeString(parsed.skill || parsed.skillId, 120);
      if (!skill) {
        parseErrors.push(`line_${index + 1}:missing_skill`);
        continue;
      }
      const result = safeString(parsed.result || parsed.status, 40).toLowerCase();
      const success = result === "pass" || result === "success" || result === "completed";
      const guardPass = normalizeBoolean(parsed.guardPass, true);
      const primaryScore = normalizeNumber(
        parsed.primaryScore,
        success ? 1 : 0,
        0,
        1
      );
      events.push({
        skill,
        result: result || (success ? "pass" : "fail"),
        success,
        primaryScore,
        guardPass,
      });
    } catch (error) {
      parseErrors.push(`line_${index + 1}:${error instanceof Error ? error.message : String(error)}`);
    }
  }
  return {
    source: "file",
    path: outcomePath,
    events,
    parseErrors,
  };
}

function buildOutcomeStats(outcomeEvents) {
  const statsBySkill = {};
  const source = Array.isArray(outcomeEvents) ? outcomeEvents : [];
  for (const event of source) {
    if (!event || typeof event !== "object") {
      continue;
    }
    const skill = safeString(event.skill, 120);
    if (!skill) {
      continue;
    }
    if (!statsBySkill[skill]) {
      statsBySkill[skill] = {
        skill,
        runs: 0,
        successes: 0,
        primaryScoreSum: 0,
        guardFailures: 0,
      };
    }
    const bucket = statsBySkill[skill];
    bucket.runs += 1;
    if (normalizeBoolean(event.success, false)) {
      bucket.successes += 1;
    }
    bucket.primaryScoreSum += normalizeNumber(event.primaryScore, 0, 0, 1);
    if (!normalizeBoolean(event.guardPass, true)) {
      bucket.guardFailures += 1;
    }
  }
  const summary = {};
  for (const [skill, bucket] of Object.entries(statsBySkill)) {
    const runs = bucket.runs || 0;
    summary[skill] = {
      skill,
      runs,
      successes: bucket.successes,
      successRate: runs > 0 ? bucket.successes / runs : 0,
      avgPrimaryScore: runs > 0 ? bucket.primaryScoreSum / runs : 0,
      guardFailures: bucket.guardFailures,
    };
  }
  return summary;
}

function collectPromotionCandidates({ policy, catalog, outcomeStats }) {
  const candidates = [];
  const scenarioRule = policy.promotionRules.scenarioToRole;
  const roleRule = policy.promotionRules.roleToGlobal;
  for (const [skillId, skillDef] of Object.entries(catalog.skills)) {
    const stat = outcomeStats[skillId];
    if (!stat) {
      continue;
    }
    const guardFailureHardStop = policy.guardrail.blockPromotionOnGuardFailure && stat.guardFailures > 0;
    if (skillDef.class === "scenario") {
      const qualified = stat.runs >= scenarioRule.minRuns
        && stat.successRate >= scenarioRule.minSuccessRate
        && stat.avgPrimaryScore >= scenarioRule.minPrimaryScore
        && stat.guardFailures <= scenarioRule.maxGuardFailures
        && !guardFailureHardStop;
      if (qualified) {
        candidates.push({
          skill: skillId,
          fromClass: "scenario",
          toClass: "role",
          evidence: stat,
        });
      }
      continue;
    }
    if (skillDef.class === "role") {
      const qualified = stat.runs >= roleRule.minRuns
        && stat.successRate >= roleRule.minSuccessRate
        && stat.avgPrimaryScore >= roleRule.minPrimaryScore
        && stat.guardFailures <= roleRule.maxGuardFailures
        && !guardFailureHardStop;
      if (qualified) {
        candidates.push({
          skill: skillId,
          fromClass: "role",
          toClass: "global",
          evidence: stat,
        });
      }
    }
  }
  return candidates;
}

function evaluateSkillPortfolio({ policy, catalog, outcomeEvents } = {}) {
  const activePolicy = policy || loadSkillPortfolioPolicy();
  const activeCatalog = catalog || loadSkillCatalog();
  const issues = [];
  const warnings = [];
  const roleChecks = [];
  const exposureByClass = {};
  for (const className of activePolicy.classes) {
    exposureByClass[className] = 0;
  }
  let exposureTotal = 0;

  for (const [skillId, skillDef] of Object.entries(activeCatalog.skills)) {
    if (skillDef.metadataIssues.length > 0) {
      issues.push({
        type: "skill_metadata",
        skill: skillId,
        detail: skillDef.metadataIssues.join(","),
      });
    }
  }

  for (const [role, requiredPolicy] of Object.entries(activePolicy.roleRequirements)) {
    const assigned = Array.isArray(activeCatalog.assignments[role]) ? activeCatalog.assignments[role] : [];
    const seenClasses = new Set();
    const missingSkills = [];
    for (const skillId of assigned) {
      const skillDef = activeCatalog.skills[skillId];
      if (!skillDef) {
        missingSkills.push(skillId);
        continue;
      }
      seenClasses.add(skillDef.class);
      exposureByClass[skillDef.class] = (exposureByClass[skillDef.class] || 0) + 1;
      exposureTotal += 1;
    }

    if (missingSkills.length > 0) {
      issues.push({
        type: "assignment_skill_missing",
        role,
        detail: missingSkills.join(","),
      });
    }

    const missingClasses = requiredPolicy.requiredClasses.filter((className) => !seenClasses.has(className));
    const pass = assigned.length >= requiredPolicy.minSkills && missingClasses.length === 0 && missingSkills.length === 0;
    if (!pass) {
      issues.push({
        type: "role_requirement",
        role,
        detail: `minSkills=${requiredPolicy.minSkills} assigned=${assigned.length} missingClasses=${missingClasses.join("|") || "-"}`,
      });
    }
    roleChecks.push({
      role,
      assignedCount: assigned.length,
      minSkills: requiredPolicy.minSkills,
      requiredClasses: requiredPolicy.requiredClasses,
      missingClasses,
      missingSkills,
      pass,
    });
  }

  for (const role of Object.keys(activeCatalog.assignments)) {
    if (!Object.prototype.hasOwnProperty.call(activePolicy.roleRequirements, role)) {
      warnings.push({
        type: "unscoped_role_assignment",
        role,
      });
    }
  }

  const activeClassCount = Object.values(exposureByClass).filter((value) => value > 0).length;
  if (activeClassCount < activePolicy.portfolio.minClassDiversity) {
    issues.push({
      type: "portfolio_diversity",
      detail: `activeClasses=${activeClassCount} required=${activePolicy.portfolio.minClassDiversity}`,
    });
  }

  const classShare = {};
  for (const className of activePolicy.classes) {
    classShare[className] = exposureTotal > 0 ? (exposureByClass[className] || 0) / exposureTotal : 0;
    if (Object.prototype.hasOwnProperty.call(activePolicy.portfolio.minClassShare, className)) {
      const minShare = activePolicy.portfolio.minClassShare[className];
      if (classShare[className] < minShare) {
        issues.push({
          type: "class_share_under",
          className,
          detail: `share=${classShare[className].toFixed(4)} min=${minShare.toFixed(4)}`,
        });
      }
    }
    if (Object.prototype.hasOwnProperty.call(activePolicy.portfolio.maxClassShare, className)) {
      const maxShare = activePolicy.portfolio.maxClassShare[className];
      if (classShare[className] > maxShare) {
        issues.push({
          type: "class_share_over",
          className,
          detail: `share=${classShare[className].toFixed(4)} max=${maxShare.toFixed(4)}`,
        });
      }
    }
  }

  const outcomeStats = buildOutcomeStats(outcomeEvents || []);
  const promotionCandidates = collectPromotionCandidates({
    policy: activePolicy,
    catalog: activeCatalog,
    outcomeStats,
  });

  return {
    status: issues.length > 0 ? "FAIL" : "PASS",
    policy: {
      schema: activePolicy.schema,
      version: activePolicy.version,
      source: policySource,
      path: activePolicy.policyPath,
      loadError: policyLoadError || "",
    },
    catalog: {
      schema: activeCatalog.schema,
      version: activeCatalog.version,
      source: catalogSource,
      path: activeCatalog.catalogPath,
      loadError: catalogLoadError || "",
      updatedAt: activeCatalog.updatedAt,
    },
    portfolio: {
      exposureTotal,
      exposureByClass,
      classShare,
      activeClassCount,
      requiredClassDiversity: activePolicy.portfolio.minClassDiversity,
    },
    roleChecks,
    issues,
    warnings,
    outcomeStats,
    promotionCandidates,
    missingProposals: activeCatalog.missingProposals,
  };
}

module.exports = {
  buildOutcomeStats,
  defaultCatalogPath,
  defaultOutcomesPath,
  defaultPolicyPath,
  evaluateSkillPortfolio,
  loadSkillCatalog,
  loadSkillPortfolioPolicy,
  parseOutcomeEventsFromJsonl,
};
