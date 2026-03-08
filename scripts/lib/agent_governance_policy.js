"use strict";

const fs = require("fs");
const path = require("path");

const workspaceRoot = path.resolve(__dirname, "..", "..");
const defaultPolicyPath = path.join(workspaceRoot, "scripts", "config", "agent_governance_contracts.json");
const configuredPolicyPath = (() => {
  const raw = typeof process.env.CODEX_AGENT_GOVERNANCE_POLICY_PATH === "string"
    ? process.env.CODEX_AGENT_GOVERNANCE_POLICY_PATH.trim()
    : "";
  if (!raw) {
    return defaultPolicyPath;
  }
  if (path.isAbsolute(raw)) {
    return path.normalize(raw);
  }
  return path.normalize(path.join(workspaceRoot, raw));
})();

const defaultPolicyDefinition = Object.freeze({
  schema: "agent-governance.v1",
    version: "2026-03-07.r1",
  parentAgents: ["default", "intake", "release_manager"],
  contracts: {
    frontend_worker: {
      id: "frontend_worker",
      enforced: true,
      readOnly: false,
      verificationOnly: false,
      scopePaths: ["web/"],
    },
    backend_worker: {
      id: "backend_worker",
      enforced: true,
      readOnly: false,
      verificationOnly: false,
      scopePaths: ["server.js", "scripts/", "docs/"],
    },
    infra_worker: {
      id: "infra_worker",
      enforced: true,
      readOnly: false,
      verificationOnly: false,
      scopePaths: [".codex/", "logs/", "docs/", "start_codex_ui.bat"],
    },
    tester: {
      id: "tester",
      enforced: true,
      readOnly: false,
      verificationOnly: true,
      scopePaths: ["scripts/"],
    },
    reviewer: {
      id: "reviewer",
      enforced: true,
      readOnly: true,
      verificationOnly: true,
      scopePaths: [],
    },
    explorer: {
      id: "explorer",
      enforced: true,
      readOnly: true,
      verificationOnly: true,
      scopePaths: [],
    },
    worker: {
      id: "worker",
      enforced: true,
      readOnly: false,
      verificationOnly: false,
      legacyOnly: true,
      requiresParentOverride: true,
      scopePaths: [],
    },
  },
  exceptions: {
    parentOverride: {
      enabled: true,
      reasonMinLength: 12,
    },
  },
});

let governancePolicyCache = null;
let governancePolicySource = "builtin";
let governancePolicyLoadError = "";

function normalizeAgentName(value) {
  if (typeof value !== "string") {
    return "";
  }
  const trimmed = value.trim().toLowerCase();
  if (!trimmed) {
    return "";
  }
  return trimmed.replace(/[\s-]+/g, "_");
}

function resolveScopedAgentName(normalizedAgentName, knownAgentsSet) {
  const normalized = typeof normalizedAgentName === "string" ? normalizedAgentName : "";
  if (!normalized) {
    return "";
  }
  if (!knownAgentsSet || knownAgentsSet.has(normalized)) {
    return normalized;
  }
  const scopeSep = normalized.indexOf("@");
  if (scopeSep > 0) {
    const base = normalized.slice(0, scopeSep);
    if (knownAgentsSet.has(base)) {
      return base;
    }
  }
  return normalized;
}

function buildKnownAgentSet(policy) {
  const set = new Set();
  if (policy && policy.parentAgents && typeof policy.parentAgents.forEach === "function") {
    policy.parentAgents.forEach((name) => {
      const normalized = normalizeAgentName(name);
      if (normalized) {
        set.add(normalized);
      }
    });
  }
  if (policy && policy.contracts && typeof policy.contracts === "object") {
    Object.keys(policy.contracts).forEach((name) => {
      const normalized = normalizeAgentName(name);
      if (normalized) {
        set.add(normalized);
      }
    });
  }
  return set;
}

function normalizeBoolean(value, fallback) {
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return value !== 0;
  }
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on") {
      return true;
    }
    if (normalized === "0" || normalized === "false" || normalized === "no" || normalized === "off") {
      return false;
    }
  }
  return Boolean(fallback);
}

function normalizePositiveInt(value, fallback, min = 1, max = 1000) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return Math.max(min, Math.min(max, Math.trunc(fallback)));
  }
  return Math.max(min, Math.min(max, Math.trunc(parsed)));
}

function safeString(value, max = 240) {
  if (typeof value !== "string") {
    return "";
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return "";
  }
  return trimmed.slice(0, max);
}

function normalizeWorkspacePath(value) {
  if (typeof value !== "string") {
    return "";
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return "";
  }
  return trimmed
    .replace(/\\/g, "/")
    .replace(/^\.\/+/, "")
    .replace(/^\/+/, "")
    .replace(/\/+/g, "/")
    .toLowerCase();
}

function normalizeScopePaths(paths) {
  if (!Array.isArray(paths)) {
    return [];
  }
  return paths.map((entry) => normalizeWorkspacePath(entry)).filter(Boolean);
}

function uniqueNormalizedPaths(paths) {
  if (!Array.isArray(paths)) {
    return [];
  }
  const set = new Set();
  for (const pathValue of paths) {
    const normalized = normalizeWorkspacePath(pathValue);
    if (!normalized) {
      continue;
    }
    set.add(normalized);
  }
  return Array.from(set.values());
}

function isScopeMatch(pathValue, scopeValue) {
  const pathNormalized = normalizeWorkspacePath(pathValue);
  const scopeNormalized = normalizeWorkspacePath(scopeValue);
  if (!pathNormalized || !scopeNormalized) {
    return false;
  }
  if (scopeNormalized.endsWith("/")) {
    return pathNormalized.startsWith(scopeNormalized);
  }
  return pathNormalized === scopeNormalized;
}

function isLikelyVerificationPath(pathValue) {
  const normalized = normalizeWorkspacePath(pathValue);
  if (!normalized) {
    return false;
  }
  if (/^scripts\/(test|tests|spec|specs|smoke|harness)\//i.test(normalized)) {
    return true;
  }
  if (/(^|\/)(test|spec|smoke|harness)(\/|[._-])/i.test(normalized)) {
    return true;
  }
  const fileName = normalized.split("/").pop() || "";
  return /(test|spec|smoke|harness)/i.test(fileName);
}

function normalizeContractEntry(agentName, entry) {
  const normalizedAgent = normalizeAgentName(agentName);
  const source = entry && typeof entry === "object" ? entry : {};
  const idCandidate = normalizeAgentName(safeString(source.id, 120)) || normalizedAgent || "unknown";
  return Object.freeze({
    id: idCandidate,
    agent: normalizedAgent || idCandidate,
    enforced: normalizeBoolean(source.enforced, true),
    readOnly: normalizeBoolean(source.readOnly, false),
    verificationOnly: normalizeBoolean(source.verificationOnly, false),
    legacyOnly: normalizeBoolean(source.legacyOnly, false),
    requiresParentOverride: normalizeBoolean(source.requiresParentOverride, false),
    scopePaths: normalizeScopePaths(source.scopePaths),
  });
}

function normalizeParentAgents(input, fallback) {
  const source = Array.isArray(input) ? input : fallback;
  const set = new Set();
  for (const candidate of source) {
    const normalized = normalizeAgentName(candidate);
    if (!normalized) {
      continue;
    }
    set.add(normalized);
  }
  return set;
}

function normalizeExceptionPolicy(input, fallback) {
  const source = input && typeof input === "object" ? input : fallback;
  const parentOverrideSource = source && source.parentOverride && typeof source.parentOverride === "object"
    ? source.parentOverride
    : fallback.parentOverride;
  return Object.freeze({
    parentOverride: Object.freeze({
      enabled: normalizeBoolean(parentOverrideSource.enabled, true),
      reasonMinLength: normalizePositiveInt(parentOverrideSource.reasonMinLength, 12, 4, 200),
    }),
  });
}

function normalizePolicyDefinition(rawDefinition, { source = "builtin", policyPath = defaultPolicyPath } = {}) {
  const definition = rawDefinition && typeof rawDefinition === "object" ? rawDefinition : {};
  const contractsSource = definition.contracts && typeof definition.contracts === "object"
    ? definition.contracts
    : defaultPolicyDefinition.contracts;
  const parentAgents = normalizeParentAgents(
    definition.parentAgents,
    defaultPolicyDefinition.parentAgents
  );
  const normalizedContracts = {};
  for (const [agentName, contract] of Object.entries(contractsSource)) {
    const normalizedAgent = normalizeAgentName(agentName);
    if (!normalizedAgent) {
      continue;
    }
    normalizedContracts[normalizedAgent] = normalizeContractEntry(normalizedAgent, contract);
  }
  if (!Object.prototype.hasOwnProperty.call(normalizedContracts, "worker")) {
    normalizedContracts.worker = normalizeContractEntry("worker", defaultPolicyDefinition.contracts.worker);
  }
  return Object.freeze({
    schema: safeString(definition.schema, 120) || defaultPolicyDefinition.schema,
    version: safeString(definition.version, 120) || defaultPolicyDefinition.version,
    source,
    policyPath,
    parentAgents,
    contracts: Object.freeze(normalizedContracts),
    exceptions: normalizeExceptionPolicy(definition.exceptions, defaultPolicyDefinition.exceptions),
  });
}

function loadPolicyDefinition() {
  if (governancePolicyCache) {
    return governancePolicyCache;
  }
  let parsed = null;
  let source = "builtin";
  let loadError = "";
  try {
    if (fs.existsSync(configuredPolicyPath)) {
      parsed = JSON.parse(fs.readFileSync(configuredPolicyPath, "utf8"));
      source = "file";
    }
  } catch (error) {
    loadError = error instanceof Error ? error.message : String(error);
    parsed = null;
    source = "builtin";
  }
  governancePolicyCache = normalizePolicyDefinition(parsed || defaultPolicyDefinition, {
    source,
    policyPath: configuredPolicyPath,
  });
  governancePolicySource = source;
  governancePolicyLoadError = loadError;
  return governancePolicyCache;
}

function getParentAgentSet() {
  return loadPolicyDefinition().parentAgents;
}

function normalizeOverrideRequest(value) {
  if (!value || typeof value !== "object") {
    return null;
  }
  const requestedBy = normalizeAgentName(
    safeString(value.requestedBy || value.by || value.agent || value.parentAgent, 120)
  );
  const reason = safeString(value.reason, 500);
  const ticket = safeString(value.ticket || value.ticketId || value.reference, 120);
  if (!requestedBy) {
    return null;
  }
  return {
    requestedBy,
    reason,
    ticket,
  };
}

function evaluateParentOverride({ override, policy }) {
  const normalizedOverride = normalizeOverrideRequest(override);
  if (!normalizedOverride) {
    return {
      requested: false,
      applied: false,
      requestedBy: "",
      reason: "",
      ticket: "",
      failureReason: "",
    };
  }
  const parentOverride = policy.exceptions.parentOverride;
  const requestedBy = resolveScopedAgentName(normalizedOverride.requestedBy, policy.parentAgents);
  if (!parentOverride.enabled) {
    return {
      requested: true,
      applied: false,
      requestedBy,
      reason: normalizedOverride.reason,
      ticket: normalizedOverride.ticket,
      failureReason: "parent_override_disabled",
    };
  }
  if (!policy.parentAgents.has(requestedBy)) {
    return {
      requested: true,
      applied: false,
      requestedBy,
      reason: normalizedOverride.reason,
      ticket: normalizedOverride.ticket,
      failureReason: "parent_override_requires_parent_agent",
    };
  }
  if (normalizedOverride.reason.length < parentOverride.reasonMinLength) {
    return {
      requested: true,
      applied: false,
      requestedBy,
      reason: normalizedOverride.reason,
      ticket: normalizedOverride.ticket,
      failureReason: "parent_override_reason_too_short",
    };
  }
  return {
    requested: true,
    applied: true,
    requestedBy,
    reason: normalizedOverride.reason,
    ticket: normalizedOverride.ticket,
    failureReason: "",
  };
}

function getAgentGovernanceContract(agentName) {
  const policy = loadPolicyDefinition();
  const normalizedRaw = normalizeAgentName(agentName);
  const normalized = resolveScopedAgentName(normalizedRaw, buildKnownAgentSet(policy));
  const base = policy.contracts[normalized];
  if (!base) {
    return {
      id: normalized || "unknown",
      agent: normalized || "unknown",
      enforced: false,
      readOnly: false,
      verificationOnly: false,
      legacyOnly: false,
      requiresParentOverride: false,
      scopePaths: [],
      parent: getParentAgentSet().has(normalized),
    };
  }
  return {
    id: base.id,
    agent: normalized,
    enforced: Boolean(base.enforced),
    readOnly: Boolean(base.readOnly),
    verificationOnly: Boolean(base.verificationOnly),
    legacyOnly: Boolean(base.legacyOnly),
    requiresParentOverride: Boolean(base.requiresParentOverride),
    scopePaths: Array.isArray(base.scopePaths) ? [...base.scopePaths] : [],
    parent: getParentAgentSet().has(normalized),
  };
}

function summarizeAgentGovernance(agentName) {
  const contract = getAgentGovernanceContract(agentName);
  const policy = loadPolicyDefinition();
  return {
    id: contract.id,
    source: policy.source,
    version: policy.version,
    enforced: contract.enforced,
    readOnly: contract.readOnly,
    verificationOnly: contract.verificationOnly,
    legacyOnly: contract.legacyOnly,
    requiresParentOverride: contract.requiresParentOverride,
    scopePaths: contract.scopePaths.slice(0, 12),
  };
}

function evaluateAgentGovernance({ agentName, operation, changedPaths, override }) {
  const policy = loadPolicyDefinition();
  const contract = getAgentGovernanceContract(agentName);
  const normalizedOperation = typeof operation === "string" ? operation : "unknown";
  const normalizedPaths = uniqueNormalizedPaths(changedPaths);
  const overrideResult = evaluateParentOverride({ override, policy });

  if (!contract.enforced) {
    return {
      decision: "allow",
      reason: "",
      operation: normalizedOperation,
      contract,
      violationCount: 0,
      violations: [],
      override: overrideResult,
    };
  }

  if ((contract.legacyOnly || contract.requiresParentOverride) && !overrideResult.applied) {
    return {
      decision: "deny",
      reason: contract.legacyOnly ? "legacy_only_requires_parent_override" : "parent_override_required",
      operation: normalizedOperation,
      contract,
      violationCount: 1,
      violations: [{ path: "", reason: contract.legacyOnly ? "legacy_only_requires_parent_override" : "parent_override_required" }],
      override: overrideResult,
    };
  }

  if (
    contract.readOnly &&
    (normalizedOperation === "commandExecution" ||
      normalizedOperation === "fileChange" ||
      normalizedOperation === "toolCall")
  ) {
    return {
      decision: "deny",
      reason: "agent_read_only_role",
      operation: normalizedOperation,
      contract,
      violationCount: 1,
      violations: [{ path: "", reason: "agent_read_only_role" }],
      override: overrideResult,
    };
  }

  if (normalizedOperation !== "fileChange") {
    return {
      decision: "allow",
      reason: "",
      operation: normalizedOperation,
      contract,
      violationCount: 0,
      violations: [],
      override: overrideResult,
    };
  }

  if (!normalizedPaths.length) {
    return {
      decision: "allow",
      reason: "",
      operation: normalizedOperation,
      contract,
      violationCount: 0,
      violations: [],
      override: overrideResult,
    };
  }

  const violations = [];
  for (const changedPath of normalizedPaths) {
    if (
      contract.scopePaths.length > 0 &&
      !contract.scopePaths.some((scopePath) => isScopeMatch(changedPath, scopePath))
    ) {
      violations.push({ path: changedPath, reason: "path_out_of_scope" });
      continue;
    }
    if (contract.verificationOnly && !isLikelyVerificationPath(changedPath)) {
      violations.push({ path: changedPath, reason: "verification_scope_violation" });
    }
  }

  if (!violations.length) {
    return {
      decision: "allow",
      reason: "",
      operation: normalizedOperation,
      contract,
      violationCount: 0,
      violations: [],
      override: overrideResult,
    };
  }

  if (overrideResult.applied) {
    return {
      decision: "allow",
      reason: "parent_override",
      operation: normalizedOperation,
      contract,
      violationCount: violations.length,
      violations: violations.slice(0, 24),
      override: overrideResult,
    };
  }

  return {
    decision: "deny",
    reason: violations[0].reason,
    operation: normalizedOperation,
    contract,
    violationCount: violations.length,
    violations: violations.slice(0, 24),
    override: overrideResult,
  };
}

function getAgentGovernancePolicySnapshot() {
  const policy = loadPolicyDefinition();
  const contracts = {};
  for (const [name, contract] of Object.entries(policy.contracts)) {
    contracts[name] = {
      id: contract.id,
      enforced: Boolean(contract.enforced),
      readOnly: Boolean(contract.readOnly),
      verificationOnly: Boolean(contract.verificationOnly),
      legacyOnly: Boolean(contract.legacyOnly),
      requiresParentOverride: Boolean(contract.requiresParentOverride),
      scopePaths: Array.isArray(contract.scopePaths) ? contract.scopePaths.slice(0, 20) : [],
    };
  }
  return {
    schema: policy.schema,
    version: policy.version,
    source: governancePolicySource,
    path: configuredPolicyPath,
    loadError: governancePolicyLoadError || "",
    parentAgents: Array.from(policy.parentAgents.values()),
    exceptions: {
      parentOverride: {
        enabled: Boolean(policy.exceptions.parentOverride.enabled),
        reasonMinLength: policy.exceptions.parentOverride.reasonMinLength,
      },
    },
    contracts,
  };
}

module.exports = {
  evaluateAgentGovernance,
  getAgentGovernancePolicySnapshot,
  getAgentGovernanceContract,
  isLikelyVerificationPath,
  normalizeAgentName,
  normalizeOverrideRequest,
  normalizeWorkspacePath,
  summarizeAgentGovernance,
};
