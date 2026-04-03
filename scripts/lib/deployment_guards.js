"use strict";

const fs = require("fs");
const path = require("path");
const { ensureDir, readJsonIfExists, writeJsonFile, repoRelative } = require("./logging_surface");
const { loadAutonomyRiskPolicy, loadDeploymentControlState, updateDeploymentControlState } = require("./agi_candidate_runtime");

const defaultDeploymentTierPolicyPath = path.join(__dirname, "..", "config", "deployment_tier_policy.json");
const defaultApprovalMatrixPath = path.join(__dirname, "..", "config", "approval_matrix.json");

function safeString(value, max = 4000) {
  if (typeof value !== "string") return "";
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, max) : "";
}

function nowIso() {
  return new Date().toISOString();
}

function ensureArray(value) {
  return Array.isArray(value) ? value : [];
}

function parseJson(filePath, fallback = null) {
  const payload = readJsonIfExists(filePath);
  return payload === null ? fallback : payload;
}

function writeJson(targetPath, payload) {
  ensureDir(path.dirname(targetPath));
  writeJsonFile(targetPath, payload);
}

function loadDeploymentTierPolicy(filePath = defaultDeploymentTierPolicyPath, { workspaceRoot = path.resolve(__dirname, "..", "..") } = {}) {
  const payload = JSON.parse(fs.readFileSync(path.resolve(filePath), "utf8"));
  const readOnlyDegradedModePath = path.isAbsolute(payload.readOnlyDegradedModePath || "")
    ? path.normalize(payload.readOnlyDegradedModePath)
    : path.join(workspaceRoot, safeString(payload.readOnlyDegradedModePath, 320) || "logs/archive/raw/deployment_controls/degraded_mode_state.json");
  return Object.freeze({
    schema: safeString(payload.schema, 120) || "deployment-tier-policy.v1",
    version: safeString(payload.version, 120) || "2026-03-31.r1",
    tiers: ensureArray(payload.tiers),
    freezeSensitiveActions: ensureArray(payload.freezeSensitiveActions),
    readOnlyDegradedModePath,
  });
}

function loadApprovalMatrix(filePath = defaultApprovalMatrixPath) {
  const payload = JSON.parse(fs.readFileSync(path.resolve(filePath), "utf8"));
  return Object.freeze({
    schema: safeString(payload.schema, 120) || "approval-matrix.v1",
    version: safeString(payload.version, 120) || "2026-03-31.r1",
    rules: ensureArray(payload.rules),
  });
}

function findApprovalRule({ matrix, taskFamily = "", tool = "", environment = "" }) {
  return ensureArray(matrix && matrix.rules).find((entry) =>
    safeString(entry && entry.taskFamily, 120) === safeString(taskFamily, 120)
    && safeString(entry && entry.tool, 120) === safeString(tool, 120)
    && safeString(entry && entry.environment, 120) === safeString(environment, 120)
  ) || null;
}

function assertOperationalModeAllowed({
  workspaceRoot = path.resolve(__dirname, "..", ".."),
  actionType = "",
  taskFamily = "",
  tool = "",
  environment = "sandbox",
  approved = false,
} = {}) {
  const autonomyPolicy = loadAutonomyRiskPolicy(undefined, { workspaceRoot });
  const deploymentTierPolicy = loadDeploymentTierPolicy(undefined, { workspaceRoot });
  const approvalMatrix = loadApprovalMatrix();
  const state = loadDeploymentControlState(autonomyPolicy, workspaceRoot);
  const normalizedAction = safeString(actionType, 120);
  if (Number(state.killSwitch) === 1) {
    throw new Error(`kill_switch_active:${normalizedAction}`);
  }
  if (Number(state.freeze) === 1 && deploymentTierPolicy.freezeSensitiveActions.includes(normalizedAction)) {
    throw new Error(`freeze_mode_blocks:${normalizedAction}`);
  }
  const rule = findApprovalRule({ matrix: approvalMatrix, taskFamily, tool: tool || normalizedAction, environment });
  if (rule && rule.approvalRequired && !approved) {
    throw new Error(`approval_matrix_block:${safeString(taskFamily, 120)}:${safeString(tool || normalizedAction, 120)}:${safeString(environment, 120)}`);
  }
  return {
    schema: "deployment-guard-eval.v1",
    generatedAt: nowIso(),
    actionType: normalizedAction,
    taskFamily: safeString(taskFamily, 120),
    tool: safeString(tool || normalizedAction, 120),
    environment: safeString(environment, 120),
    allowed: 1,
  };
}

function setReadOnlyDegradedMode({
  workspaceRoot = path.resolve(__dirname, "..", ".."),
  enabled = false,
  reason = "",
} = {}) {
  const deploymentTierPolicy = loadDeploymentTierPolicy(undefined, { workspaceRoot });
  writeJson(deploymentTierPolicy.readOnlyDegradedModePath, {
    schema: "read-only-degraded-mode-state.v1",
    generatedAt: nowIso(),
    enabled: enabled ? 1 : 0,
    reason: safeString(reason, 400),
  });
  return {
    ok: true,
    path: repoRelative(workspaceRoot, deploymentTierPolicy.readOnlyDegradedModePath),
  };
}

function buildIncidentReplay({
  workspaceRoot = path.resolve(__dirname, "..", ".."),
  incidentKind = "",
  causalChain = [],
  containmentStatus = "",
  remediationStatus = "",
} = {}) {
  const outputRoot = path.join(workspaceRoot, "output", "claim_closure", "phase16");
  ensureDir(outputRoot);
  const replayPath = path.join(outputRoot, `incident_replay_${Date.now()}.json`);
  const payload = {
    schema: "incident-replay.v1",
    generatedAt: nowIso(),
    incidentKind: safeString(incidentKind, 120),
    causalChain: ensureArray(causalChain).map((entry) => safeString(entry, 400)),
    containmentStatus: safeString(containmentStatus, 160),
    remediationStatus: safeString(remediationStatus, 160),
  };
  writeJson(replayPath, payload);
  return {
    ok: true,
    path: repoRelative(workspaceRoot, replayPath),
    payload,
  };
}

module.exports = {
  assertOperationalModeAllowed,
  buildIncidentReplay,
  defaultApprovalMatrixPath,
  defaultDeploymentTierPolicyPath,
  findApprovalRule,
  loadApprovalMatrix,
  loadDeploymentTierPolicy,
  setReadOnlyDegradedMode,
  updateDeploymentControlState,
};
