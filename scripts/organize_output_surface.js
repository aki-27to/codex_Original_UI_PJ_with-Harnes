"use strict";

const fs = require("fs");
const path = require("path");

const workspaceRoot = path.resolve(__dirname, "..");
const defaultPolicyPath = path.join(workspaceRoot, "scripts", "config", "output_surface_policy.json");
const defaultManifestPath = path.join(workspaceRoot, "runtime", "last_output_surface_manifest.json");

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function loadJson(jsonPath) {
  return JSON.parse(fs.readFileSync(jsonPath, "utf8"));
}

function normalizeRelativePath(relativePath) {
  return String(relativePath || "").replace(/\\/g, "/");
}

function resolveWorkspacePath(root, relativePath) {
  return path.resolve(root, normalizeRelativePath(relativePath));
}

function uniqueDestination(targetPath) {
  if (!fs.existsSync(targetPath)) {
    return targetPath;
  }
  const parsed = path.parse(targetPath);
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  return path.join(parsed.dir, `${parsed.name}-${stamp}${parsed.ext}`);
}

function moveExistingPath(root, sourceRelativePath, targetRelativePath, moves) {
  const sourcePath = resolveWorkspacePath(root, sourceRelativePath);
  if (!fs.existsSync(sourcePath)) {
    return null;
  }
  const targetPath = uniqueDestination(resolveWorkspacePath(root, targetRelativePath));
  ensureDir(path.dirname(targetPath));
  fs.renameSync(sourcePath, targetPath);
  moves.push({
    source: normalizeRelativePath(sourceRelativePath),
    destination: normalizeRelativePath(path.relative(root, targetPath))
  });
  return targetPath;
}

function globToRegExp(globPattern) {
  const escaped = String(globPattern || "")
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*/g, ".*")
    .replace(/\?/g, ".");
  return new RegExp(`^${escaped}$`, "i");
}

function getRecursiveSize(targetPath) {
  const stats = fs.statSync(targetPath);
  if (stats.isFile()) {
    return stats.size;
  }
  let total = 0;
  const stack = [targetPath];
  while (stack.length) {
    const current = stack.pop();
    const entries = fs.readdirSync(current, { withFileTypes: true });
    for (const entry of entries) {
      const absolutePath = path.join(current, entry.name);
      const entryStats = fs.statSync(absolutePath);
      if (entry.isDirectory()) {
        stack.push(absolutePath);
      } else {
        total += entryStats.size;
      }
    }
  }
  return total;
}

function listTopLevelEntries(dirPath) {
  if (!fs.existsSync(dirPath)) {
    return [];
  }
  return fs.readdirSync(dirPath, { withFileTypes: true }).map((entry) => {
    const absolutePath = path.join(dirPath, entry.name);
    const stats = fs.statSync(absolutePath);
    return {
      name: entry.name,
      absolutePath,
      mtimeMs: stats.mtimeMs,
      sizeBytes: getRecursiveSize(absolutePath)
    };
  });
}

function removePath(targetPath) {
  if (fs.existsSync(targetPath)) {
    fs.rmSync(targetPath, { recursive: true, force: true });
  }
}

function pruneRootByRetention(root, retention, pruned) {
  if (!retention || !fs.existsSync(root)) {
    return;
  }
  const maxDays = Number.isFinite(Number(retention.maxDays)) ? Number(retention.maxDays) : null;
  const maxEntries = Number.isFinite(Number(retention.maxEntries)) ? Number(retention.maxEntries) : null;
  const maxBytes = Number.isFinite(Number(retention.maxBytes)) ? Number(retention.maxBytes) : null;
  const now = Date.now();
  let entries = listTopLevelEntries(root);

  if (maxDays !== null) {
    const cutoff = now - (maxDays * 24 * 60 * 60 * 1000);
    for (const entry of entries) {
      if (entry.mtimeMs >= cutoff) {
        continue;
      }
      removePath(entry.absolutePath);
      pruned.push({
        path: normalizeRelativePath(path.relative(workspaceRoot, entry.absolutePath)),
        reason: `older_than_${maxDays}_days`,
        sizeBytes: entry.sizeBytes
      });
    }
    entries = listTopLevelEntries(root);
  }

  if (maxEntries === null && maxBytes === null) {
    return;
  }

  const sorted = entries.sort((left, right) => right.mtimeMs - left.mtimeMs);
  let keptEntries = 0;
  let keptBytes = 0;
  for (const entry of sorted) {
    const nextEntryCount = keptEntries + 1;
    const nextByteCount = keptBytes + entry.sizeBytes;
    const exceedsEntries = maxEntries !== null && nextEntryCount > maxEntries;
    const exceedsBytes = maxBytes !== null && nextByteCount > maxBytes;
    if (!exceedsEntries && !exceedsBytes) {
      keptEntries = nextEntryCount;
      keptBytes = nextByteCount;
      continue;
    }
    removePath(entry.absolutePath);
    pruned.push({
      path: normalizeRelativePath(path.relative(workspaceRoot, entry.absolutePath)),
      reason: exceedsEntries ? `max_entries_${maxEntries}` : `max_bytes_${maxBytes}`,
      sizeBytes: entry.sizeBytes
    });
  }
}

function validatePolicy(policy) {
  if (!policy || typeof policy !== "object") {
    throw new Error("output surface policy must be an object");
  }
  if (!Array.isArray(policy.transientRoots) || !Array.isArray(policy.transientOutputFiles)) {
    throw new Error("output surface policy must define transientRoots and transientOutputFiles arrays");
  }
}

function organizeOutputSurface(options = {}) {
  const root = path.resolve(options.workspaceRoot || workspaceRoot);
  const policyPath = path.resolve(options.policyPath || defaultPolicyPath);
  const manifestPath = path.resolve(options.manifestPath || defaultManifestPath);
  const policy = loadJson(policyPath);
  validatePolicy(policy);

  const moves = [];
  const pruned = [];
  const intentionalOutputRoots = Array.isArray(policy.intentionalOutputRoots)
    ? policy.intentionalOutputRoots.map(normalizeRelativePath)
    : [];

  for (const item of policy.transientRoots) {
    moveExistingPath(root, item.source, item.target, moves);
    pruneRootByRetention(resolveWorkspacePath(root, item.target), item.retention, pruned);
  }

  const outputRoot = path.join(root, "output");
  const outputFiles = fs.existsSync(outputRoot)
    ? fs.readdirSync(outputRoot, { withFileTypes: true })
      .filter((entry) => entry.isFile())
      .map((entry) => entry.name)
    : [];

  for (const item of policy.transientOutputFiles) {
    const matcher = globToRegExp(item.pattern);
    for (const fileName of outputFiles) {
      if (!matcher.test(fileName)) {
        continue;
      }
      moveExistingPath(root, `output/${fileName}`, `${item.targetDir}/${fileName}`, moves);
    }
    pruneRootByRetention(resolveWorkspacePath(root, item.targetDir), item.retention, pruned);
  }

  const manifest = {
    cleanedAt: new Date().toISOString(),
    policyPath: normalizeRelativePath(path.relative(root, policyPath)),
    intentionalOutputRoots,
    movedCount: moves.length,
    prunedCount: pruned.length,
    moves,
    pruned
  };
  ensureDir(path.dirname(manifestPath));
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  return manifest;
}

function main() {
  const manifest = organizeOutputSurface();
  process.stdout.write(`${JSON.stringify(manifest, null, 2)}\n`);
}

if (require.main === module) {
  main();
}

module.exports = {
  globToRegExp,
  organizeOutputSurface
};
