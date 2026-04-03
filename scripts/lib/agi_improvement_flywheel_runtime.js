"use strict";

const path = require("path");
const { readJsonIfExists, repoRelative } = require("./logging_surface");

const defaultAgiImprovementFlywheelRelativePath = path.join("scripts", "config", "agi_improvement_flywheel.json");

function safeString(value, max = 400) {
  if (typeof value !== "string") return "";
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, max) : "";
}

function normalizeStringList(values, maxItems = 16, maxChars = 160) {
  const out = [];
  const seen = new Set();
  for (const entry of Array.isArray(values) ? values : []) {
    const text = safeString(entry, maxChars);
    const key = text.toLowerCase();
    if (!text || seen.has(key)) continue;
    seen.add(key);
    out.push(text);
    if (out.length >= maxItems) break;
  }
  return out;
}

function resolveConfigPath(workspaceRoot, targetPath = "") {
  const raw = safeString(targetPath, 800) || defaultAgiImprovementFlywheelRelativePath;
  if (path.isAbsolute(raw)) return path.normalize(raw);
  return path.join(workspaceRoot, raw);
}

function buildHarnessAgiImprovementFlywheelRuntimeSummary({
  workspaceRoot = path.resolve(__dirname, "..", ".."),
  configPath = "",
} = {}) {
  const resolvedPath = resolveConfigPath(workspaceRoot, configPath);
  const relativePath = repoRelative(workspaceRoot, resolvedPath);
  const payload = readJsonIfExists(resolvedPath);
  if (!payload || typeof payload !== "object") {
    return {
      enabled: true,
      status: "missing",
      configPath: relativePath,
      schema: "",
      strategy: "",
      boundedLoopsOnly: true,
      northStar: "",
      antiGoal: "",
      loopCount: 0,
      kpiCount: 0,
      failureModeCount: 0,
      promotionPath: [],
      loops: [],
      kpis: [],
      failureModes: [],
    };
  }
  const guardrails = payload.guardrails && typeof payload.guardrails === "object" ? payload.guardrails : {};
  const northStar = payload.northStar && typeof payload.northStar === "object" ? payload.northStar : {};
  const loops = (Array.isArray(payload.loops) ? payload.loops : []).map((entry) => ({
    id: safeString(entry && entry.id, 80),
    name: safeString(entry && entry.name, 120),
    objective: safeString(entry && entry.objective, 220),
    stopConditionCount: normalizeStringList(entry && entry.stopConditions, 12, 160).length,
    rollbackTriggerCount: normalizeStringList(entry && entry.rollbackTriggers, 12, 160).length,
  })).filter((entry) => entry.id && entry.name);
  const kpis = normalizeStringList(payload.kpis, 24, 120);
  const failureModes = normalizeStringList(payload.failureModes, 24, 160);
  return {
    enabled: true,
    status: "ready",
    configPath: relativePath,
    schema: safeString(payload.schema, 120),
    strategy: safeString(payload.strategy, 120),
    boundedLoopsOnly: !Boolean(guardrails.unboundedLoopsAllowed),
    requiresEvalGateForPromotion: Boolean(guardrails.requiresEvalGateForPromotion),
    requiresRollbackPath: Boolean(guardrails.requiresRollbackPath),
    autoMutatePolicy: Boolean(guardrails.autoMutatePolicy),
    autoMutateConstitution: Boolean(guardrails.autoMutateConstitution),
    northStar: safeString(northStar.objective, 240),
    antiGoal: safeString(northStar.antiGoal, 240),
    loopCount: loops.length,
    kpiCount: kpis.length,
    failureModeCount: failureModes.length,
    promotionPath: normalizeStringList(payload.promotionPath, 12, 120),
    loops,
    kpis,
    failureModes,
  };
}

module.exports = {
  buildHarnessAgiImprovementFlywheelRuntimeSummary,
  defaultAgiImprovementFlywheelRelativePath,
  resolveConfigPath,
};
