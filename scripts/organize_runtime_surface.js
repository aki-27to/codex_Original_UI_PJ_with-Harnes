"use strict";

const fs = require("fs");
const path = require("path");

const workspaceRoot = path.resolve(__dirname, "..");
const runtimeRoot = path.join(workspaceRoot, "runtime");
const manifestPath = path.join(runtimeRoot, "last_root_cleanup_manifest.json");

const directoryMoves = [
  [".npm-cache", "runtime/npm-cache"],
  [".pw-browsers", "runtime/pw-browsers"],
  [".playwright-cli", "runtime/playwright-cli"],
  [".resume_home", "runtime/resume-home"],
  ["tmp_runtime_revision_verify", "runtime/tmp/runtime_revision_verify"],
  ["提出用", "runtime/archive/legacy-submission-payload"]
];

const rootTempPattern = /^tmp_.*\.(html|txt|json|out|err)$/i;

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function uniqueDestination(relativeTarget) {
  const absoluteTarget = path.join(workspaceRoot, relativeTarget);
  if (!fs.existsSync(absoluteTarget)) {
    return absoluteTarget;
  }
  const parsed = path.parse(absoluteTarget);
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  return path.join(parsed.dir, `${parsed.name}-${stamp}${parsed.ext}`);
}

function moveEntry(sourceName, targetRelativePath, moves) {
  const sourcePath = path.join(workspaceRoot, sourceName);
  if (!fs.existsSync(sourcePath)) {
    return;
  }
  const targetPath = uniqueDestination(targetRelativePath);
  ensureDir(path.dirname(targetPath));
  fs.renameSync(sourcePath, targetPath);
  moves.push({
    source: sourceName.replace(/\\/g, "/"),
    destination: path.relative(workspaceRoot, targetPath).replace(/\\/g, "/")
  });
}

function main() {
  ensureDir(runtimeRoot);
  const moves = [];
  for (const [sourceName, targetRelativePath] of directoryMoves) {
    moveEntry(sourceName, targetRelativePath, moves);
  }

  const rootEntries = fs.readdirSync(workspaceRoot, { withFileTypes: true });
  for (const entry of rootEntries) {
    if (!entry.isFile()) {
      continue;
    }
    if (!rootTempPattern.test(entry.name)) {
      continue;
    }
    moveEntry(entry.name, path.join("runtime", "tmp", entry.name), moves);
  }

  const manifest = {
    cleanedAt: new Date().toISOString(),
    runtimeRoot: "runtime/",
    movedCount: moves.length,
    moves
  };
  ensureDir(path.dirname(manifestPath));
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  console.log(JSON.stringify(manifest, null, 2));
}

main();
