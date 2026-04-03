"use strict";

const fs = require("fs");
const path = require("path");
const { ensureDir, readJsonIfExists, writeJsonFile, repoRelative } = require("./logging_surface");

const defaultKnowledgeBackendPolicyPath = path.join(__dirname, "..", "config", "knowledge_backend_policy.json");

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

function resolvePath(workspaceRoot, maybeRelative, fallbackRelative) {
  const raw = safeString(maybeRelative, 800) || safeString(fallbackRelative, 800);
  if (!raw) return "";
  return path.isAbsolute(raw) ? path.normalize(raw) : path.join(workspaceRoot, raw);
}

function parseJson(filePath, fallback = null) {
  const payload = readJsonIfExists(filePath);
  return payload === null ? fallback : payload;
}

function writeJson(targetPath, payload) {
  ensureDir(path.dirname(targetPath));
  writeJsonFile(targetPath, payload);
}

function appendJsonLine(targetPath, payload) {
  ensureDir(path.dirname(targetPath));
  fs.appendFileSync(targetPath, `${JSON.stringify(payload)}\n`, "utf8");
}

function loadKnowledgeBackendPolicy(filePath = defaultKnowledgeBackendPolicyPath, { workspaceRoot = path.resolve(__dirname, "..", "..") } = {}) {
  const payload = JSON.parse(fs.readFileSync(path.resolve(filePath), "utf8"));
  return Object.freeze({
    schema: safeString(payload.schema, 120) || "knowledge-backend-policy.v1",
    version: safeString(payload.version, 120) || "2026-03-31.r1",
    workspaceRoot,
    defaultBackend: safeString(payload.defaultBackend, 80) || "local_file_backed",
    localBackend: Object.freeze({
      id: "local_file_backed",
      indexPath: resolvePath(workspaceRoot, payload.localBackend && payload.localBackend.indexPath, "logs/archive/raw/knowledge_store/knowledge_index.json"),
    }),
    externalBackendStub: Object.freeze({
      id: "external_store_stub",
      driver: safeString(payload.externalBackendStub && payload.externalBackendStub.driver, 120) || "external_store_stub",
      connectionRef: safeString(payload.externalBackendStub && payload.externalBackendStub.connectionRef, 240) || "env:CODEX_KNOWLEDGE_BACKEND_URL",
      status: safeString(payload.externalBackendStub && payload.externalBackendStub.status, 80) || "stub",
    }),
    remoteAdapterSlot: Object.freeze({
      id: safeString(payload.remoteAdapterSlot && payload.remoteAdapterSlot.id, 80) || "remote_adapter",
      kind: safeString(payload.remoteAdapterSlot && payload.remoteAdapterSlot.kind, 80) || "provider_adapter",
      status: safeString(payload.remoteAdapterSlot && payload.remoteAdapterSlot.status, 80) || "adapter_slot_ready",
      endpointEnvVar: safeString(payload.remoteAdapterSlot && payload.remoteAdapterSlot.endpointEnvVar, 120) || "CODEX_KNOWLEDGE_BACKEND_URL",
      tokenEnvVar: safeString(payload.remoteAdapterSlot && payload.remoteAdapterSlot.tokenEnvVar, 120) || "CODEX_KNOWLEDGE_BACKEND_TOKEN",
      healthcheckPath: safeString(payload.remoteAdapterSlot && payload.remoteAdapterSlot.healthcheckPath, 160) || "/healthz",
    }),
    driftMetricsPath: resolvePath(workspaceRoot, payload.driftMetricsPath, "logs/archive/raw/knowledge_store/retrieval_drift_metrics.jsonl"),
  });
}

function describeKnowledgeBackends({ workspaceRoot = path.resolve(__dirname, "..", "..") } = {}) {
  const policy = loadKnowledgeBackendPolicy(undefined, { workspaceRoot });
  const remoteConfigured = Boolean(process.env[policy.remoteAdapterSlot.endpointEnvVar]) && Boolean(process.env[policy.remoteAdapterSlot.tokenEnvVar]);
  return {
    schema: "knowledge-backend-descriptor.v1",
    generatedAt: nowIso(),
    defaultBackend: policy.defaultBackend,
    backends: [
      {
        id: policy.localBackend.id,
        type: "reference_implementation",
        indexPath: repoRelative(workspaceRoot, policy.localBackend.indexPath),
        status: "active",
      },
      {
        id: policy.externalBackendStub.id,
        type: "external_stub",
        driver: policy.externalBackendStub.driver,
        connectionRef: policy.externalBackendStub.connectionRef,
        status: policy.externalBackendStub.status,
      },
      {
        id: policy.remoteAdapterSlot.id,
        type: policy.remoteAdapterSlot.kind,
        endpointEnvVar: policy.remoteAdapterSlot.endpointEnvVar,
        tokenEnvVar: policy.remoteAdapterSlot.tokenEnvVar,
        healthcheckPath: policy.remoteAdapterSlot.healthcheckPath,
        status: remoteConfigured ? "configured" : "BLOCKED_BY_ENV",
      },
    ],
  };
}

function probeKnowledgeBackend({
  workspaceRoot = path.resolve(__dirname, "..", ".."),
  backendId = "",
} = {}) {
  const policy = loadKnowledgeBackendPolicy(undefined, { workspaceRoot });
  const resolvedBackendId = safeString(backendId, 80) || policy.remoteAdapterSlot.id;
  if (resolvedBackendId === policy.localBackend.id) {
    return {
      schema: "knowledge-backend-probe.v1",
      generatedAt: nowIso(),
      backendId: resolvedBackendId,
      status: "AUTO_PASS",
      detail: "local_reference_backend_available",
    };
  }
  const endpointConfigured = Boolean(process.env[policy.remoteAdapterSlot.endpointEnvVar]);
  const tokenConfigured = Boolean(process.env[policy.remoteAdapterSlot.tokenEnvVar]);
  return {
    schema: "knowledge-backend-probe.v1",
    generatedAt: nowIso(),
    backendId: resolvedBackendId,
    status: endpointConfigured && tokenConfigured ? "AUTO_PASS" : "BLOCKED_BY_ENV",
    detail: endpointConfigured && tokenConfigured ? "remote_backend_adapter_configured" : "remote_backend_adapter_missing_env",
    endpointEnvVar: policy.remoteAdapterSlot.endpointEnvVar,
    tokenEnvVar: policy.remoteAdapterSlot.tokenEnvVar,
  };
}

function readKnowledgeIndexFromBackend({ workspaceRoot = path.resolve(__dirname, "..", ".."), backendId = "" } = {}) {
  const policy = loadKnowledgeBackendPolicy(undefined, { workspaceRoot });
  const resolvedBackendId = safeString(backendId, 80) || policy.defaultBackend;
  if (resolvedBackendId === policy.externalBackendStub.id) {
    return {
      schema: "knowledge-backend-read.v1",
      generatedAt: nowIso(),
      backendId: resolvedBackendId,
      status: "stub",
      entries: [],
    };
  }
  const payload = parseJson(policy.localBackend.indexPath, { entries: [] });
  return {
    schema: "knowledge-backend-read.v1",
    generatedAt: nowIso(),
    backendId: policy.localBackend.id,
    status: "ok",
    entries: ensureArray(payload.entries),
  };
}

function recordRetrievalDriftMetric({
  workspaceRoot = path.resolve(__dirname, "..", ".."),
  taskId = "",
  staleHitRate = 0,
  wrongSourceRate = 0,
  unverifiableRate = 0,
  invalidationPropagationLagMinutes = 0,
} = {}) {
  const policy = loadKnowledgeBackendPolicy(undefined, { workspaceRoot });
  const entry = {
    schema: "knowledge-retrieval-drift-metric.v1",
    recordedAt: nowIso(),
    taskId: safeString(taskId, 120),
    staleHitRate: Number(staleHitRate) || 0,
    wrongSourceRate: Number(wrongSourceRate) || 0,
    unverifiableRate: Number(unverifiableRate) || 0,
    invalidationPropagationLagMinutes: Number(invalidationPropagationLagMinutes) || 0,
  };
  appendJsonLine(policy.driftMetricsPath, entry);
  return {
    ok: true,
    path: repoRelative(workspaceRoot, policy.driftMetricsPath),
    entry,
  };
}

function writeBackendStubState({
  workspaceRoot = path.resolve(__dirname, "..", ".."),
  status = "ready_for_externalization",
} = {}) {
  const policy = loadKnowledgeBackendPolicy(undefined, { workspaceRoot });
  const outputPath = path.join(workspaceRoot, "output", "claim_closure", "phase14", "knowledge_backend_state.json");
  writeJson(outputPath, {
    schema: "knowledge-backend-state.v1",
    generatedAt: nowIso(),
    defaultBackend: policy.defaultBackend,
    externalBackendStub: {
      ...policy.externalBackendStub,
      status: safeString(status, 80) || "ready_for_externalization",
    },
  });
  return {
    ok: true,
    path: repoRelative(workspaceRoot, outputPath),
  };
}

module.exports = {
  defaultKnowledgeBackendPolicyPath,
  describeKnowledgeBackends,
  loadKnowledgeBackendPolicy,
  probeKnowledgeBackend,
  readKnowledgeIndexFromBackend,
  recordRetrievalDriftMetric,
  writeBackendStubState,
};
