"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

function safeString(value, max = 2000) {
  if (typeof value !== "string") return "";
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, max) : "";
}

function ensureDir(targetPath) {
  fs.mkdirSync(targetPath, { recursive: true });
}

function isPathWithin(rootPath, candidatePath) {
  const root = path.resolve(rootPath);
  const candidate = path.resolve(candidatePath);
  if (root === candidate) return true;
  return candidate.startsWith(`${root}${path.sep}`);
}

function hashFile(filePath) {
  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) return "";
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

function serializeTargets(targets, workspaceRoot) {
  const out = [];
  const seen = new Set();
  for (const entry of Array.isArray(targets) ? targets : []) {
    const absolute = path.resolve(entry);
    if (seen.has(absolute)) continue;
    seen.add(absolute);
    const exists = fs.existsSync(absolute);
    const stat = exists ? fs.statSync(absolute) : null;
    out.push({
      path: absolute,
      relativePath: path.relative(workspaceRoot, absolute).replace(/\\/g, "/"),
      exists,
      type: !exists ? "missing" : stat.isDirectory() ? "directory" : "file",
      hash: exists && stat.isFile() ? hashFile(absolute) : "",
    });
  }
  return out;
}

function copyEntry(sourcePath, destinationPath) {
  const stat = fs.statSync(sourcePath);
  if (stat.isDirectory()) {
    fs.cpSync(sourcePath, destinationPath, { recursive: true, force: true });
    return;
  }
  ensureDir(path.dirname(destinationPath));
  fs.copyFileSync(sourcePath, destinationPath);
}

function removeEntry(targetPath) {
  if (!fs.existsSync(targetPath)) return;
  fs.rmSync(targetPath, { recursive: true, force: true });
}

function writeJson(filePath, value) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function readJsonIfExists(filePath) {
  if (!fs.existsSync(filePath)) return null;
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function assertTargetsNotProtected({ targets, protectedRoots = [] } = {}) {
  for (const target of Array.isArray(targets) ? targets : []) {
    const absolute = path.resolve(target);
    for (const root of Array.isArray(protectedRoots) ? protectedRoots : []) {
      if (isPathWithin(root, absolute)) {
        throw new Error(`protected_target_blocked:${absolute}`);
      }
    }
  }
}

function createCheckpoint({
  workspaceRoot,
  label = "checkpoint",
  targets = [],
  protectedRoots = [],
  metadata = {},
} = {}) {
  const root = path.resolve(workspaceRoot || path.join(__dirname, "..", ".."));
  const checkpointId = `${Date.now()}-${crypto.randomBytes(4).toString("hex")}-${safeString(label, 40).toLowerCase().replace(/[^a-z0-9._-]+/g, "-") || "checkpoint"}`;
  const checkpointRoot = path.join(root, "logs", "archive", "raw", "improvement_checkpoints", checkpointId);
  const payloadRoot = path.join(checkpointRoot, "payload");
  const normalizedTargets = serializeTargets(targets, root);
  assertTargetsNotProtected({ targets: normalizedTargets.map((entry) => entry.path), protectedRoots });
  for (const entry of normalizedTargets) {
    if (!entry.exists) continue;
    copyEntry(entry.path, path.join(payloadRoot, entry.relativePath));
  }
  const manifest = {
    schema: "improvement-checkpoint.v1",
    checkpointId,
    createdAt: new Date().toISOString(),
    workspaceRoot: root,
    label: safeString(label, 80),
    metadata: metadata && typeof metadata === "object" ? metadata : {},
    targets: normalizedTargets,
  };
  writeJson(path.join(checkpointRoot, "manifest.json"), manifest);
  return {
    checkpointId,
    checkpointRoot,
    payloadRoot,
    manifest,
  };
}

function restoreCheckpoint({ checkpointRoot } = {}) {
  const resolvedRoot = path.resolve(checkpointRoot || "");
  const manifestPath = path.join(resolvedRoot, "manifest.json");
  const manifest = readJsonIfExists(manifestPath);
  if (!manifest || !Array.isArray(manifest.targets)) {
    throw new Error(`checkpoint_manifest_missing:${resolvedRoot}`);
  }
  const payloadRoot = path.join(resolvedRoot, "payload");
  for (const entry of manifest.targets) {
    const targetPath = path.resolve(manifest.workspaceRoot, safeString(entry && entry.relativePath, 600));
    if (entry && entry.exists) {
      const sourcePath = path.join(payloadRoot, safeString(entry.relativePath, 600));
      if (!fs.existsSync(sourcePath)) {
        throw new Error(`checkpoint_payload_missing:${sourcePath}`);
      }
      removeEntry(targetPath);
      copyEntry(sourcePath, targetPath);
    } else {
      removeEntry(targetPath);
    }
  }
  return {
    checkpointId: safeString(manifest.checkpointId, 120),
    restoredAt: new Date().toISOString(),
    targetCount: manifest.targets.length,
  };
}

function readLatestCheckpoint({ workspaceRoot } = {}) {
  const root = path.resolve(workspaceRoot || path.join(__dirname, "..", ".."));
  const checkpointBase = path.join(root, "logs", "archive", "raw", "improvement_checkpoints");
  if (!fs.existsSync(checkpointBase)) return null;
  const dirs = fs.readdirSync(checkpointBase, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  if (!dirs.length) return null;
  return path.join(checkpointBase, dirs[dirs.length - 1]);
}

function appendImprovementAuditLog({ workspaceRoot, entry } = {}) {
  const root = path.resolve(workspaceRoot || path.join(__dirname, "..", ".."));
  const logPath = path.join(root, "logs", "archive", "raw", "improvement_audit.jsonl");
  ensureDir(path.dirname(logPath));
  fs.appendFileSync(logPath, `${JSON.stringify({
    generatedAt: new Date().toISOString(),
    ...(entry && typeof entry === "object" ? entry : {}),
  })}\n`, "utf8");
  return logPath;
}

function readImprovementAuditLog({ workspaceRoot, limit = 20 } = {}) {
  const root = path.resolve(workspaceRoot || path.join(__dirname, "..", ".."));
  const logPath = path.join(root, "logs", "archive", "raw", "improvement_audit.jsonl");
  if (!fs.existsSync(logPath)) return { logPath, entries: [] };
  const lines = fs.readFileSync(logPath, "utf8").split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const selected = lines.slice(Math.max(0, lines.length - Math.max(1, Math.trunc(Number(limit) || 20))));
  return {
    logPath,
    entries: selected.map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return { parseError: true, raw: line };
      }
    }),
  };
}

module.exports = {
  appendImprovementAuditLog,
  assertTargetsNotProtected,
  createCheckpoint,
  readImprovementAuditLog,
  readLatestCheckpoint,
  restoreCheckpoint,
};
