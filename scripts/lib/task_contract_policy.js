"use strict";

const fs = require("fs");
const path = require("path");

const defaultTaskContractManifestPath = path.join(__dirname, "..", "config", "task_contract_manifest.json");

const defaultTaskContractManifest = Object.freeze({
  schema: "task-contract-manifest.v1",
  version: "2026-03-29.r1",
  defaultFamily: "deterministic_code",
  contracts: [
    {
      id: "deterministic_code",
      familyId: "deterministic_code",
      successCriteria: ["requested behavior is implemented"],
      timeBudget: { targetMs: 120000, warnMs: 300000, hardStopMs: 900000 },
      allowedTools: ["api_exec", "batch", "shell", "apply_patch", "eval_public"],
      deniedTools: ["holdout_eval_lane", "external_write"],
      stopConditions: ["requirements_satisfied", "verification_recorded"],
      approvalBoundary: { requiredWhen: ["dependency_add", "external_write"] },
      humanComparableTaskFraming: "Implement deterministic behavior with executable verification.",
      difficultyTiers: ["basic", "standard"],
      modalityTags: ["text", "code"],
      structureTags: ["deterministic", "repo_local"],
      verifierRequirements: ["tests_or_probes"]
    }
  ]
});

function safeString(value, max = 2000) {
  if (typeof value !== "string") return "";
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, max) : "";
}

function clampPositiveInt(value, fallback, max = 86400000) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return Math.max(1, Math.min(max, Math.trunc(parsed)));
}

function uniqueStrings(values, max = 32) {
  const out = [];
  for (const entry of Array.isArray(values) ? values : []) {
    const text = safeString(entry, 160);
    if (!text || out.includes(text)) continue;
    out.push(text);
    if (out.length >= max) break;
  }
  return out;
}

function normalizeTaskContractEntry(input) {
  const source = input && typeof input === "object" ? input : {};
  const id = safeString(source.id, 80).toLowerCase().replace(/[\s-]+/g, "_");
  if (!id) return null;
  const familyId = safeString(source.familyId, 80).toLowerCase().replace(/[\s-]+/g, "_") || id;
  const timeBudget = source.timeBudget && typeof source.timeBudget === "object" ? source.timeBudget : {};
  return Object.freeze({
    id,
    familyId,
    humanComparableTaskFraming: safeString(source.humanComparableTaskFraming, 600),
    successCriteria: uniqueStrings(source.successCriteria, 16),
    timeBudget: Object.freeze({
      targetMs: clampPositiveInt(timeBudget.targetMs, 120000),
      warnMs: clampPositiveInt(timeBudget.warnMs, 300000),
      hardStopMs: clampPositiveInt(timeBudget.hardStopMs, 900000)
    }),
    allowedTools: uniqueStrings(source.allowedTools, 24),
    deniedTools: uniqueStrings(source.deniedTools, 24),
    stopConditions: uniqueStrings(source.stopConditions, 16),
    difficultyTiers: uniqueStrings(source.difficultyTiers, 12),
    modalityTags: uniqueStrings(source.modalityTags, 12),
    structureTags: uniqueStrings(source.structureTags, 12),
    verifierRequirements: uniqueStrings(source.verifierRequirements, 16),
    approvalBoundary: Object.freeze({
      requiredWhen: uniqueStrings(source.approvalBoundary && source.approvalBoundary.requiredWhen, 16)
    })
  });
}

function normalizeTaskContractManifest(input) {
  const payload = input && typeof input === "object" ? input : {};
  const fallback = defaultTaskContractManifest;
  const contracts = [];
  const seen = new Set();
  for (const entry of Array.isArray(payload.contracts) ? payload.contracts : fallback.contracts) {
    const normalized = normalizeTaskContractEntry(entry);
    if (!normalized || seen.has(normalized.id)) continue;
    seen.add(normalized.id);
    contracts.push(normalized);
  }
  if (!contracts.length) {
    contracts.push(normalizeTaskContractEntry(fallback.contracts[0]));
  }
  const defaultFamily = safeString(payload.defaultFamily, 80).toLowerCase().replace(/[\s-]+/g, "_") || fallback.defaultFamily;
  return Object.freeze({
    schema: safeString(payload.schema, 120) || fallback.schema,
    version: safeString(payload.version, 120) || fallback.version,
    defaultFamily: contracts.some((entry) => entry.familyId === defaultFamily) ? defaultFamily : contracts[0].familyId,
    contracts: Object.freeze(contracts)
  });
}

function loadTaskContractManifest(filePath = defaultTaskContractManifestPath) {
  const absolutePath = path.resolve(filePath);
  const raw = fs.readFileSync(absolutePath, "utf8");
  return normalizeTaskContractManifest(raw ? JSON.parse(raw) : {});
}

function resolveTaskContractForFamily({ manifest, familyId } = {}) {
  const normalizedManifest = normalizeTaskContractManifest(manifest);
  const normalizedFamily = safeString(familyId, 80).toLowerCase().replace(/[\s-]+/g, "_") || normalizedManifest.defaultFamily;
  return normalizedManifest.contracts.find((entry) => entry.familyId === normalizedFamily) || normalizedManifest.contracts[0] || null;
}

function summarizeTaskContract(contract) {
  const source = contract && typeof contract === "object" ? contract : {};
  return {
    id: safeString(source.id, 80),
    familyId: safeString(source.familyId, 80),
    humanComparableTaskFraming: safeString(source.humanComparableTaskFraming, 240),
    successCriteriaCount: Array.isArray(source.successCriteria) ? source.successCriteria.length : 0,
    allowedToolCount: Array.isArray(source.allowedTools) ? source.allowedTools.length : 0,
    deniedToolCount: Array.isArray(source.deniedTools) ? source.deniedTools.length : 0,
    stopConditionCount: Array.isArray(source.stopConditions) ? source.stopConditions.length : 0,
    difficultyTierCount: Array.isArray(source.difficultyTiers) ? source.difficultyTiers.length : 0,
    modalityTagCount: Array.isArray(source.modalityTags) ? source.modalityTags.length : 0,
    structureTagCount: Array.isArray(source.structureTags) ? source.structureTags.length : 0,
    verifierRequirementCount: Array.isArray(source.verifierRequirements) ? source.verifierRequirements.length : 0,
    targetMs: clampPositiveInt(source.timeBudget && source.timeBudget.targetMs, 120000),
    warnMs: clampPositiveInt(source.timeBudget && source.timeBudget.warnMs, 300000),
    hardStopMs: clampPositiveInt(source.timeBudget && source.timeBudget.hardStopMs, 900000),
    approvalBoundaryCount: Array.isArray(source.approvalBoundary && source.approvalBoundary.requiredWhen)
      ? source.approvalBoundary.requiredWhen.length
      : 0
  };
}

module.exports = {
  defaultTaskContractManifestPath,
  loadTaskContractManifest,
  normalizeTaskContractManifest,
  resolveTaskContractForFamily,
  summarizeTaskContract
};
