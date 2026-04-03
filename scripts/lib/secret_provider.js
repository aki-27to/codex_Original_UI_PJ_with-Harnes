"use strict";

const fs = require("fs");
const path = require("path");
const { ensureDir, readJsonIfExists, writeJsonFile, repoRelative } = require("./logging_surface");

const defaultSecretProviderPolicyPath = path.join(__dirname, "..", "config", "secret_provider_policy.json");

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

function loadSecretProviderPolicy(filePath = defaultSecretProviderPolicyPath, { workspaceRoot = path.resolve(__dirname, "..", "..") } = {}) {
  const payload = JSON.parse(fs.readFileSync(path.resolve(filePath), "utf8"));
  const deniedActors = ensureArray(payload.deniedActors).map((entry) => safeString(entry, 80)).filter(Boolean);
  const allowedActors = ensureArray(payload.allowedActors).map((entry) => safeString(entry, 80)).filter(Boolean);
  const resolvedAllowedActors = allowedActors.length
    ? allowedActors
    : ["runtime", "executor", "planner", "verifier", "coordinator", "developer", "ci"].filter((entry) => !deniedActors.includes(entry));
  return Object.freeze({
    schema: safeString(payload.schema, 120) || "secret-provider-policy.v1",
    version: safeString(payload.version, 120) || "2026-03-31.r1",
    workspaceRoot,
    defaultProvider: safeString(payload.defaultProvider, 80) || "local_dev",
    localDevProvider: Object.freeze({
      id: "local_dev",
      path: resolvePath(
        workspaceRoot,
        payload.localDevProvider && (payload.localDevProvider.path || payload.localDevProvider.seedPath),
        "logs/archive/raw/secrets/local_dev_secrets.json"
      ),
    }),
    productionProviderStub: Object.freeze({
      id: "production_stub",
      driver: safeString(payload.productionProviderStub && payload.productionProviderStub.driver, 120) || "production_secret_stub",
      connectionRef: safeString(payload.productionProviderStub && (payload.productionProviderStub.connectionRef || payload.productionProviderStub.endpointEnvVar), 240) || "env:CODEX_SECRET_PROVIDER_URL",
      status: safeString(payload.productionProviderStub && payload.productionProviderStub.status, 80) || "stub",
    }),
    productionAdapterSlot: Object.freeze({
      id: safeString(payload.productionAdapterSlot && payload.productionAdapterSlot.id, 80) || "production_adapter",
      kind: safeString(payload.productionAdapterSlot && payload.productionAdapterSlot.kind, 80) || "provider_adapter",
      status: safeString(payload.productionAdapterSlot && payload.productionAdapterSlot.status, 80) || "adapter_slot_ready",
      endpointEnvVar: safeString(payload.productionAdapterSlot && payload.productionAdapterSlot.endpointEnvVar, 120) || "CODEX_SECRET_PROVIDER_URL",
      tokenEnvVar: safeString(payload.productionAdapterSlot && payload.productionAdapterSlot.tokenEnvVar, 120) || "CODEX_SECRET_PROVIDER_TOKEN",
      rotationSupported: payload.productionAdapterSlot && payload.productionAdapterSlot.rotationSupported !== false ? 1 : 0,
      revocationSupported: payload.productionAdapterSlot && payload.productionAdapterSlot.revocationSupported !== false ? 1 : 0,
    }),
    accessLogPath: resolvePath(workspaceRoot, payload.accessLogPath, "logs/archive/raw/secrets/secret_access_log.jsonl"),
    denialLogPath: resolvePath(workspaceRoot, payload.denialLogPath, "logs/archive/raw/secrets/secret_denial_log.jsonl"),
    allowedActors: resolvedAllowedActors,
    deniedActors,
  });
}

function ensureLocalDevProvider(policy) {
  ensureDir(path.dirname(policy.localDevProvider.path));
  if (!fs.existsSync(policy.localDevProvider.path)) {
    writeJson(policy.localDevProvider.path, {
      schema: "local-secret-provider.v1",
      generatedAt: nowIso(),
      secrets: {
        sample_api_token: "dev-token-placeholder",
        sample_service_account: "dev-service-placeholder",
      },
    });
  }
}

function describeSecretProviders({ workspaceRoot = path.resolve(__dirname, "..", "..") } = {}) {
  const policy = loadSecretProviderPolicy(undefined, { workspaceRoot });
  ensureLocalDevProvider(policy);
  const productionConnected = Boolean(process.env[policy.productionAdapterSlot.endpointEnvVar]) && Boolean(process.env[policy.productionAdapterSlot.tokenEnvVar]);
  return {
    schema: "secret-provider-descriptor.v1",
    generatedAt: nowIso(),
    defaultProvider: policy.defaultProvider,
    providers: [
      {
        id: policy.localDevProvider.id,
        type: "local_dev",
        path: repoRelative(workspaceRoot, policy.localDevProvider.path),
        status: "active",
      },
      {
        id: policy.productionProviderStub.id,
        type: "production_stub",
        driver: policy.productionProviderStub.driver,
        connectionRef: policy.productionProviderStub.connectionRef,
        status: policy.productionProviderStub.status,
      },
      {
        id: policy.productionAdapterSlot.id,
        type: policy.productionAdapterSlot.kind,
        endpointEnvVar: policy.productionAdapterSlot.endpointEnvVar,
        tokenEnvVar: policy.productionAdapterSlot.tokenEnvVar,
        rotationSupported: policy.productionAdapterSlot.rotationSupported,
        revocationSupported: policy.productionAdapterSlot.revocationSupported,
        status: productionConnected ? "configured" : "BLOCKED_BY_ENV",
      },
    ],
  };
}

function probeSecretProvider({
  workspaceRoot = path.resolve(__dirname, "..", ".."),
  providerId = "",
} = {}) {
  const policy = loadSecretProviderPolicy(undefined, { workspaceRoot });
  const resolvedProviderId = safeString(providerId, 80) || policy.productionAdapterSlot.id;
  if (resolvedProviderId === policy.localDevProvider.id) {
    ensureLocalDevProvider(policy);
    return {
      schema: "secret-provider-probe.v1",
      generatedAt: nowIso(),
      providerId: resolvedProviderId,
      status: "AUTO_PASS",
      detail: "local_dev_provider_available",
    };
  }
  const endpointConfigured = Boolean(process.env[policy.productionAdapterSlot.endpointEnvVar]);
  const tokenConfigured = Boolean(process.env[policy.productionAdapterSlot.tokenEnvVar]);
  return {
    schema: "secret-provider-probe.v1",
    generatedAt: nowIso(),
    providerId: resolvedProviderId,
    status: endpointConfigured && tokenConfigured ? "AUTO_PASS" : "BLOCKED_BY_ENV",
    detail: endpointConfigured && tokenConfigured ? "production_adapter_configured" : "production_adapter_missing_env",
    endpointEnvVar: policy.productionAdapterSlot.endpointEnvVar,
    tokenEnvVar: policy.productionAdapterSlot.tokenEnvVar,
  };
}

function readSecret({
  workspaceRoot = path.resolve(__dirname, "..", ".."),
  actor = "runtime",
  providerId = "",
  secretKey = "",
  approved = false,
} = {}) {
  const policy = loadSecretProviderPolicy(undefined, { workspaceRoot });
  const resolvedProviderId = safeString(providerId, 80) || policy.defaultProvider;
  const normalizedActor = safeString(actor, 80) || "runtime";
  const normalizedKey = safeString(secretKey, 120);
  if (!policy.allowedActors.includes(normalizedActor) || !approved) {
    appendJsonLine(policy.denialLogPath, {
      schema: "secret-denial-log-entry.v1",
      recordedAt: nowIso(),
      actor: normalizedActor,
      providerId: resolvedProviderId,
      secretKey: normalizedKey,
      reason: !policy.allowedActors.includes(normalizedActor) ? "actor_not_allowed" : "approval_required",
    });
    throw new Error(`secret_access_denied:${normalizedActor}:${resolvedProviderId}:${normalizedKey}`);
  }
  if (resolvedProviderId === policy.productionProviderStub.id) {
    appendJsonLine(policy.denialLogPath, {
      schema: "secret-denial-log-entry.v1",
      recordedAt: nowIso(),
      actor: normalizedActor,
      providerId: resolvedProviderId,
      secretKey: normalizedKey,
      reason: "production_stub_only",
    });
    throw new Error(`secret_provider_stub_only:${normalizedKey}`);
  }
  ensureLocalDevProvider(policy);
  const payload = parseJson(policy.localDevProvider.path, { secrets: {} });
  const value = payload && payload.secrets ? payload.secrets[normalizedKey] : "";
  appendJsonLine(policy.accessLogPath, {
    schema: "secret-access-log-entry.v1",
    recordedAt: nowIso(),
    actor: normalizedActor,
    providerId: resolvedProviderId,
    secretKey: normalizedKey,
    granted: value ? 1 : 0,
  });
  return {
    schema: "secret-read-result.v1",
    generatedAt: nowIso(),
    providerId: resolvedProviderId,
    secretKey: normalizedKey,
    granted: value ? 1 : 0,
    redactedValue: value ? "***" : "",
  };
}

module.exports = {
  defaultSecretProviderPolicyPath,
  describeSecretProviders,
  loadSecretProviderPolicy,
  probeSecretProvider,
  readSecret,
};
