"use strict";

const fs = require("fs");
const path = require("path");

const workspaceRoot = path.resolve(__dirname, "..", "..");
const defaultAuthorityRegistryPath = path.join(workspaceRoot, "scripts", "config", "authority_registry.json");

function safeString(value, max = 400) {
  if (typeof value !== "string") {
    return "";
  }
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, max) : "";
}

function repoRelative(targetPath) {
  return path.relative(workspaceRoot, path.resolve(targetPath)).replace(/\\/g, "/");
}

function normalizeRegistryEntry(rawEntry) {
  const source = rawEntry && typeof rawEntry === "object" ? rawEntry : {};
  return Object.freeze({
    order: Number.isFinite(Number(source.order)) ? Math.max(1, Math.trunc(Number(source.order))) : 99,
    id: safeString(source.id, 120),
    path: safeString(source.path, 260),
    role: safeString(source.role, 240),
    surfaceClass: safeString(source.surfaceClass, 120),
    requiredMarkers: Array.isArray(source.requiredMarkers)
      ? source.requiredMarkers.map((entry) => safeString(entry, 240)).filter(Boolean).slice(0, 16)
      : [],
  });
}

function normalizeAuthorityRegistry(input) {
  const source = input && typeof input === "object" ? input : {};
  const rawPrecedence = Array.isArray(source.precedence) ? source.precedence : [];
  const precedence = rawPrecedence
    .map(normalizeRegistryEntry)
    .filter((entry) => entry.id && entry.path)
    .sort((left, right) => left.order - right.order || left.id.localeCompare(right.id));
  const driftRules = source.driftRules && typeof source.driftRules === "object" ? source.driftRules : {};
  return Object.freeze({
    schema: safeString(source.schema, 120) || "authority-registry.v1",
    version: safeString(source.version, 120) || "builtin",
    sourceDoc: safeString(source.sourceDoc, 260) || "docs/HARNESS_CONSTITUTION.md",
    precedence: Object.freeze(precedence),
    driftRules: Object.freeze({
      singleSupremePath: safeString(driftRules.singleSupremePath, 260) || "docs/HARNESS_CONSTITUTION.md",
      operationalConstitutionPath: safeString(driftRules.operationalConstitutionPath, 260) || "AGENTS.md",
      primaryExecRoute: safeString(driftRules.primaryExecRoute, 120) || "POST /api/exec",
      primaryEvalRoute: safeString(driftRules.primaryEvalRoute, 120) || "POST /api/eval/run",
      forbiddenPrimaryRoutePatterns: Array.isArray(driftRules.forbiddenPrimaryRoutePatterns)
        ? driftRules.forbiddenPrimaryRoutePatterns.map((entry) => safeString(entry, 160)).filter(Boolean).slice(0, 16)
        : [],
    }),
  });
}

function loadAuthorityRegistry(filePath = defaultAuthorityRegistryPath) {
  const raw = fs.readFileSync(path.resolve(filePath), "utf8");
  return normalizeAuthorityRegistry(raw ? JSON.parse(raw) : {});
}

function readTextIfExists(relativePath) {
  const absolutePath = path.join(workspaceRoot, relativePath);
  if (!fs.existsSync(absolutePath) || fs.statSync(absolutePath).isDirectory()) {
    return "";
  }
  return fs.readFileSync(absolutePath, "utf8");
}

function validateAuthorityRegistrySurfaces(registry = loadAuthorityRegistry()) {
  const issues = [];
  for (const entry of registry.precedence) {
    if (entry.path === "scripts/config") {
      continue;
    }
    const absolutePath = path.join(workspaceRoot, entry.path);
    if (!fs.existsSync(absolutePath)) {
      issues.push(`${entry.path}:missing`);
      continue;
    }
    const content = readTextIfExists(entry.path);
    if (!content) {
      issues.push(`${entry.path}:unreadable`);
      continue;
    }
    for (const marker of entry.requiredMarkers) {
      if (!content.includes(marker)) {
        issues.push(`${entry.path}:missing_marker:${marker}`);
      }
    }
  }
  return {
    ok: issues.length === 0,
    issues,
  };
}

function buildAuthorityRuntimeSummary({ registry = loadAuthorityRegistry() } = {}) {
  const validation = validateAuthorityRegistrySurfaces(registry);
  return {
    schema: registry.schema,
    version: registry.version,
    sourceDoc: registry.sourceDoc,
    registryPath: repoRelative(defaultAuthorityRegistryPath),
    singleSupremePath: registry.driftRules.singleSupremePath,
    operationalConstitutionPath: registry.driftRules.operationalConstitutionPath,
    primaryExecRoute: registry.driftRules.primaryExecRoute,
    primaryEvalRoute: registry.driftRules.primaryEvalRoute,
    driftStatus: validation.ok ? "aligned" : "drift_detected",
    issues: validation.issues.slice(0, 16),
    precedence: registry.precedence.map((entry) => ({
      order: entry.order,
      id: entry.id,
      path: entry.path,
      role: entry.role,
      surfaceClass: entry.surfaceClass,
      exists: entry.path === "scripts/config" ? 1 : (fs.existsSync(path.join(workspaceRoot, entry.path)) ? 1 : 0),
    })),
  };
}

module.exports = {
  defaultAuthorityRegistryPath,
  loadAuthorityRegistry,
  normalizeAuthorityRegistry,
  validateAuthorityRegistrySurfaces,
  buildAuthorityRuntimeSummary,
};
