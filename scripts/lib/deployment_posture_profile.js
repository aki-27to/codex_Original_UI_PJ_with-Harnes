"use strict";

const fs = require("fs");
const path = require("path");

const workspaceRoot = path.resolve(__dirname, "..", "..");
const defaultDeploymentPostureProfilesPath = path.join(workspaceRoot, "scripts", "config", "deployment_posture_profiles.json");
const postureEnvKey = "CODEX_DEPLOYMENT_POSTURE";

function safeString(value, max = 200) {
  if (typeof value !== "string") {
    return "";
  }
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, max) : "";
}

function normalizeBoolean(value, fallback = false) {
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value === "number") {
    return Number.isFinite(value) ? value !== 0 : fallback;
  }
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["1", "true", "yes", "on"].includes(normalized)) return true;
    if (["0", "false", "no", "off"].includes(normalized)) return false;
  }
  return fallback;
}

function normalizeProfileEntry(profileId, rawEntry) {
  const source = rawEntry && typeof rawEntry === "object" ? rawEntry : {};
  const defaults = source.defaults && typeof source.defaults === "object" ? source.defaults : {};
  return Object.freeze({
    id: safeString(profileId, 80),
    label: safeString(source.label, 120) || safeString(profileId, 80),
    description: safeString(source.description, 400),
    defaults: Object.freeze({
      sandboxMode: safeString(defaults.sandboxMode, 80) || "workspace-write",
      approvalPolicy: safeString(defaults.approvalPolicy, 80) || "on-request",
      autoCommitAndPush: normalizeBoolean(defaults.autoCommitAndPush, false),
    }),
    referenceArchitectureDefault: normalizeBoolean(source.referenceArchitectureDefault, false),
  });
}

function normalizeDeploymentPostureProfiles(input) {
  const source = input && typeof input === "object" ? input : {};
  const profiles = {};
  const rawProfiles = source.profiles && typeof source.profiles === "object" ? source.profiles : {};
  for (const [profileId, profileEntry] of Object.entries(rawProfiles)) {
    const normalized = normalizeProfileEntry(profileId, profileEntry);
    if (normalized.id) {
      profiles[normalized.id] = normalized;
    }
  }
  const defaultProfile = safeString(source.defaultProfile, 80) || "portable_local";
  return Object.freeze({
    schema: safeString(source.schema, 120) || "deployment-posture-profiles.v1",
    version: safeString(source.version, 120) || "builtin",
    defaultProfile: Object.prototype.hasOwnProperty.call(profiles, defaultProfile) ? defaultProfile : "portable_local",
    profiles: Object.freeze(profiles),
  });
}

function loadDeploymentPostureProfiles(filePath = defaultDeploymentPostureProfilesPath) {
  const raw = fs.readFileSync(path.resolve(filePath), "utf8");
  return normalizeDeploymentPostureProfiles(raw ? JSON.parse(raw) : {});
}

function resolveDeploymentPosture({
  approvalPolicy = "",
  sandboxMode = "",
  autoCommitAndPush = false,
  explicitProfile = "",
  profiles = loadDeploymentPostureProfiles(),
} = {}) {
  const requested = safeString(explicitProfile || process.env[postureEnvKey], 80).toLowerCase();
  if (requested && Object.prototype.hasOwnProperty.call(profiles.profiles, requested)) {
    return { active: profiles.profiles[requested], explicit: true };
  }
  const normalizedApproval = safeString(approvalPolicy, 80).toLowerCase();
  const normalizedSandbox = safeString(sandboxMode, 80).toLowerCase();
  const normalizedAutoCommit = Boolean(autoCommitAndPush);
  for (const profile of Object.values(profiles.profiles)) {
    if (
      safeString(profile.defaults.approvalPolicy, 80).toLowerCase() === normalizedApproval
      && safeString(profile.defaults.sandboxMode, 80).toLowerCase() === normalizedSandbox
      && Boolean(profile.defaults.autoCommitAndPush) === normalizedAutoCommit
    ) {
      return { active: profile, explicit: false };
    }
  }
  return {
    active: profiles.profiles[profiles.defaultProfile],
    explicit: false,
  };
}

function buildDeploymentPostureRuntimeSummary(options = {}) {
  const profiles = loadDeploymentPostureProfiles();
  const resolved = resolveDeploymentPosture({ ...options, profiles });
  const active = resolved.active;
  return {
    schema: profiles.schema,
    version: profiles.version,
    profilePath: path.relative(workspaceRoot, defaultDeploymentPostureProfilesPath).replace(/\\/g, "/"),
    envKey: postureEnvKey,
    activeProfile: active ? active.id : profiles.defaultProfile,
    activePostureProfile: active ? active.id : profiles.defaultProfile,
    activeLabel: active ? active.label : profiles.defaultProfile,
    activePostureProfileLabel: active ? active.label : profiles.defaultProfile,
    explicitSelection: resolved.explicit ? 1 : 0,
    referenceArchitectureDefault: active && active.referenceArchitectureDefault ? 1 : 0,
    defaults: active ? active.defaults : {},
    profiles: Object.values(profiles.profiles).map((entry) => ({
      id: entry.id,
      label: entry.label,
      referenceArchitectureDefault: entry.referenceArchitectureDefault ? 1 : 0,
      approvalPolicy: entry.defaults.approvalPolicy,
      sandboxMode: entry.defaults.sandboxMode,
      autoCommitAndPush: entry.defaults.autoCommitAndPush ? 1 : 0,
    })),
  };
}

module.exports = {
  defaultDeploymentPostureProfilesPath,
  loadDeploymentPostureProfiles,
  resolveDeploymentPosture,
  buildDeploymentPostureRuntimeSummary,
  postureEnvKey,
};
