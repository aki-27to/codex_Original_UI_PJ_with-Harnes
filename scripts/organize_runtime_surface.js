"use strict";

const fs = require("fs");
const path = require("path");

const workspaceRoot = path.resolve(__dirname, "..");
const defaultRuntimeRoot = path.join(workspaceRoot, "runtime");
const defaultManifestPath = path.join(defaultRuntimeRoot, "last_root_cleanup_manifest.json");

const defaultDirectoryMoves = [
  [".npm-cache", "runtime/npm-cache"],
  [".pw-browsers", "runtime/pw-browsers"],
  [".playwright-cli", "runtime/playwright-cli"],
  [".resume_home", "runtime/resume-home"],
  ["tmp_runtime_revision_verify", "runtime/tmp/runtime_revision_verify"]
];

const defaultRootTransientFileRoutes = [
  {
    pattern: /^tmp_.*\.(html|txt|json|out|err)$/i,
    resolveTarget: (name) => path.join("runtime", "tmp", name)
  },
  {
    pattern: /^share_.*\.html$/i,
    resolveTarget: (name) => path.join("runtime", "shared-pages", name)
  }
];

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function uniqueDestination(root, relativeTarget) {
  const absoluteTarget = path.join(root, relativeTarget);
  if (!fs.existsSync(absoluteTarget)) {
    return absoluteTarget;
  }
  const parsed = path.parse(absoluteTarget);
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  return path.join(parsed.dir, `${parsed.name}-${stamp}${parsed.ext}`);
}

function moveEntry(root, sourceName, targetRelativePath, moves) {
  const sourcePath = path.join(root, sourceName);
  if (!fs.existsSync(sourcePath)) {
    return;
  }
  const targetPath = uniqueDestination(root, targetRelativePath);
  ensureDir(path.dirname(targetPath));
  fs.renameSync(sourcePath, targetPath);
  moves.push({
    source: sourceName.replace(/\\/g, "/"),
    destination: path.relative(root, targetPath).replace(/\\/g, "/")
  });
}

function organizeRuntimeSurface(options = {}) {
  const root = path.resolve(options.workspaceRoot || workspaceRoot);
  const runtimeRoot = path.resolve(options.runtimeRoot || path.join(root, "runtime"));
  const manifestPath = path.resolve(options.manifestPath || path.join(runtimeRoot, "last_root_cleanup_manifest.json"));
  const directoryMoves = Array.isArray(options.directoryMoves) ? options.directoryMoves : defaultDirectoryMoves;
  const rootTransientFileRoutes = Array.isArray(options.rootTransientFileRoutes)
    ? options.rootTransientFileRoutes
    : defaultRootTransientFileRoutes;

  ensureDir(runtimeRoot);
  const moves = [];
  for (const [sourceName, targetRelativePath] of directoryMoves) {
    moveEntry(root, sourceName, targetRelativePath, moves);
  }

  const rootEntries = fs.readdirSync(root, { withFileTypes: true });
  for (const entry of rootEntries) {
    if (!entry.isFile()) {
      continue;
    }
    const matchedRoute = rootTransientFileRoutes.find((route) => route.pattern.test(entry.name));
    if (!matchedRoute) {
      continue;
    }
    moveEntry(root, entry.name, matchedRoute.resolveTarget(entry.name), moves);
  }

  const manifest = {
    cleanedAt: new Date().toISOString(),
    runtimeRoot: "runtime/",
    movedCount: moves.length,
    moves
  };
  ensureDir(path.dirname(manifestPath));
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  return manifest;
}

function main() {
  const manifest = organizeRuntimeSurface();
  console.log(JSON.stringify(manifest, null, 2));
}

if (require.main === module) {
  main();
}

module.exports = {
  organizeRuntimeSurface,
};
