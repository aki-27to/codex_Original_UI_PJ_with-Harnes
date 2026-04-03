"use strict";

const fs = require("fs");
const path = require("path");

const defaultAgentRoleContractManifestPath = path.join(__dirname, "..", "config", "agent_role_contract_manifest.json");
const defaultMultiAgentRoutingPolicyPath = path.join(__dirname, "..", "config", "multi_agent_routing_policy.json");

function safeString(value, max = 2000) {
  if (typeof value !== "string") return "";
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, max) : "";
}

function normalizeId(value, fallback = "") {
  const raw = safeString(value, 200).toLowerCase().replace(/[^a-z0-9._-]+/g, "_").replace(/^_+|_+$/g, "");
  return raw || fallback;
}

function uniqueStrings(values, max = 32) {
  const out = [];
  for (const entry of Array.isArray(values) ? values : []) {
    const text = safeString(entry, 240);
    if (!text || out.includes(text)) continue;
    out.push(text);
    if (out.length >= max) break;
  }
  return out;
}

function normalizeBudget(source, fallback = {}) {
  const input = source && typeof source === "object" ? source : {};
  return Object.freeze({
    targetMs: Math.max(1, Math.trunc(Number(input.targetMs) || Number(fallback.targetMs) || 120000)),
    warnMs: Math.max(1, Math.trunc(Number(input.warnMs) || Number(fallback.warnMs) || 300000)),
    hardStopMs: Math.max(1, Math.trunc(Number(input.hardStopMs) || Number(fallback.hardStopMs) || 900000)),
  });
}

function normalizeRoleEntry(entry) {
  const source = entry && typeof entry === "object" ? entry : {};
  const id = normalizeId(source.id, "coordinator");
  return Object.freeze({
    id,
    objective: safeString(source.objective, 800),
    allowedInputs: uniqueStrings(source.allowedInputs, 24),
    requiredInputs: uniqueStrings(source.requiredInputs, 24),
    expectedOutputs: uniqueStrings(source.expectedOutputs, 24),
    allowedTools: uniqueStrings(source.allowedTools, 24),
    deniedTools: uniqueStrings(source.deniedTools, 24),
    writableStateScope: uniqueStrings(source.writableStateScope, 24),
    readableStateScope: uniqueStrings(source.readableStateScope, 32),
    timeBudget: normalizeBudget(source.timeBudget),
    stepBudget: Math.max(1, Math.trunc(Number(source.stepBudget) || 6)),
    stopConditions: uniqueStrings(source.stopConditions, 24),
    escalationConditions: uniqueStrings(source.escalationConditions, 24),
    handoffPreconditions: uniqueStrings(source.handoffPreconditions, 24),
    handoffPostconditions: uniqueStrings(source.handoffPostconditions, 24),
  });
}

function normalizeRoleContractManifest(input) {
  const payload = input && typeof input === "object" ? input : {};
  const roles = [];
  const seen = new Set();
  for (const entry of Array.isArray(payload.roles) ? payload.roles : []) {
    const normalized = normalizeRoleEntry(entry);
    if (!normalized.id || seen.has(normalized.id)) continue;
    seen.add(normalized.id);
    roles.push(normalized);
  }
  const defaultRole = normalizeId(payload.defaultRole, roles[0] ? roles[0].id : "coordinator");
  return Object.freeze({
    schema: safeString(payload.schema, 120) || "agent-role-contract-manifest.v1",
    version: safeString(payload.version, 120) || "2026-03-30.r1",
    defaultRole: roles.some((entry) => entry.id === defaultRole) ? defaultRole : (roles[0] ? roles[0].id : "coordinator"),
    roles: Object.freeze(roles),
  });
}

function loadAgentRoleContractManifest(filePath = defaultAgentRoleContractManifestPath) {
  const absolutePath = path.resolve(filePath);
  const raw = fs.readFileSync(absolutePath, "utf8");
  return normalizeRoleContractManifest(raw ? JSON.parse(raw) : {});
}

function resolveRoleContract({ manifest, role } = {}) {
  const normalizedManifest = normalizeRoleContractManifest(manifest);
  const normalizedRole = normalizeId(role, normalizedManifest.defaultRole);
  return normalizedManifest.roles.find((entry) => entry.id === normalizedRole)
    || normalizedManifest.roles.find((entry) => entry.id === normalizedManifest.defaultRole)
    || null;
}

function summarizeRoleContract(contract) {
  const source = contract && typeof contract === "object" ? contract : {};
  return {
    id: safeString(source.id, 80),
    allowedToolCount: Array.isArray(source.allowedTools) ? source.allowedTools.length : 0,
    deniedToolCount: Array.isArray(source.deniedTools) ? source.deniedTools.length : 0,
    writableScopeCount: Array.isArray(source.writableStateScope) ? source.writableStateScope.length : 0,
    readableScopeCount: Array.isArray(source.readableStateScope) ? source.readableStateScope.length : 0,
    stepBudget: Math.max(1, Math.trunc(Number(source.stepBudget) || 0)),
    targetMs: Math.max(1, Math.trunc(Number(source.timeBudget && source.timeBudget.targetMs) || 120000)),
  };
}

function normalizeRoutingPolicy(input) {
  const payload = input && typeof input === "object" ? input : {};
  const familyRoleSequences = {};
  for (const [familyId, sequence] of Object.entries(payload.familyRoleSequences || {})) {
    const normalizedFamilyId = normalizeId(familyId);
    if (!normalizedFamilyId) continue;
    familyRoleSequences[normalizedFamilyId] = uniqueStrings(sequence, 8).map((entry) => normalizeId(entry));
  }
  return Object.freeze({
    schema: safeString(payload.schema, 120) || "bounded-multi-agent-routing-policy.v1",
    version: safeString(payload.version, 120) || "2026-03-30.r1",
    fallback: Object.freeze({
      maxAcceptanceItems: Math.max(1, Math.trunc(Number(payload.fallback && payload.fallback.maxAcceptanceItems) || 1)),
      maxSteps: Math.max(1, Math.trunc(Number(payload.fallback && payload.fallback.maxSteps) || 2)),
      smallTaskFamilies: uniqueStrings(payload.fallback && payload.fallback.smallTaskFamilies, 16).map((entry) => normalizeId(entry)),
    }),
    familyRoleSequences: Object.freeze(familyRoleSequences),
    replanTriggers: uniqueStrings(payload.replanTriggers, 24),
  });
}

function loadMultiAgentRoutingPolicy(filePath = defaultMultiAgentRoutingPolicyPath) {
  const absolutePath = path.resolve(filePath);
  const raw = fs.readFileSync(absolutePath, "utf8");
  return normalizeRoutingPolicy(raw ? JSON.parse(raw) : {});
}

function roleAllowsTool(contract, toolName) {
  const normalizedTool = safeString(toolName, 120);
  if (!normalizedTool) return false;
  return Array.isArray(contract && contract.allowedTools) && contract.allowedTools.includes(normalizedTool)
    && !(Array.isArray(contract && contract.deniedTools) && contract.deniedTools.includes(normalizedTool));
}

function roleAllowsStateWrite(contract, scopeName) {
  const normalizedScope = safeString(scopeName, 120);
  if (!normalizedScope) return false;
  return Array.isArray(contract && contract.writableStateScope) && contract.writableStateScope.includes(normalizedScope);
}

function selectRoleSequence({ routingPolicy, familyId, acceptanceCount = 0, stepCount = 0, forceMultiAgent = false } = {}) {
  const normalizedPolicy = normalizeRoutingPolicy(routingPolicy);
  const normalizedFamilyId = normalizeId(familyId);
  const configured = normalizedPolicy.familyRoleSequences[normalizedFamilyId] || ["planner", "executor", "verifier"];
  const acceptanceItems = Math.max(0, Math.trunc(Number(acceptanceCount) || 0));
  const steps = Math.max(0, Math.trunc(Number(stepCount) || 0));
  const shouldFallback = !forceMultiAgent && (
    acceptanceItems <= normalizedPolicy.fallback.maxAcceptanceItems
    || steps <= normalizedPolicy.fallback.maxSteps
    || normalizedPolicy.fallback.smallTaskFamilies.includes(normalizedFamilyId)
  );
  return {
    mode: shouldFallback ? "single_agent_fallback" : "multi_agent",
    sequence: shouldFallback ? [] : configured,
    familyId: normalizedFamilyId,
  };
}

module.exports = {
  defaultAgentRoleContractManifestPath,
  defaultMultiAgentRoutingPolicyPath,
  loadAgentRoleContractManifest,
  loadMultiAgentRoutingPolicy,
  normalizeRoleContractManifest,
  resolveRoleContract,
  roleAllowsStateWrite,
  roleAllowsTool,
  selectRoleSequence,
  summarizeRoleContract,
};
