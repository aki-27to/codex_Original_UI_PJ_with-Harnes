"use strict";

const assert = require("assert");
const { execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const workspaceRoot = path.resolve(__dirname, "..");
const outputSurfacePolicy = JSON.parse(
  fs.readFileSync(path.join(workspaceRoot, "scripts", "config", "output_surface_policy.json"), "utf8")
);

function globToRegExp(globPattern) {
  const escaped = String(globPattern || "")
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*\*/g, "__DOUBLE_STAR__")
    .replace(/\*/g, "[^/]*")
    .replace(/\?/g, "[^/]")
    .replace(/__DOUBLE_STAR__/g, ".*");
  return new RegExp(`^${escaped}$`, "i");
}

function normalizeRelativePath(relativePath) {
  return String(relativePath || "").replace(/\\/g, "/");
}

function synthesizeProbePath(pattern) {
  const normalized = normalizeRelativePath(pattern)
    .replace(/\*\*/g, "__DOUBLE_STAR__")
    .replace(/\*/g, "sample")
    .replace(/\?/g, "x")
    .replace(/__DOUBLE_STAR__\/?/g, "sample/");
  if (normalized.endsWith("/")) {
    return `${normalized}sample.txt`;
  }
  if (normalized.includes(".")) {
    return normalized;
  }
  return `${normalized}/sample.txt`;
}

function gitCheckIgnore(relativePath) {
  const normalized = normalizeRelativePath(relativePath);
  try {
    execFileSync("git", ["check-ignore", "-q", normalized], {
      cwd: workspaceRoot,
      stdio: "ignore",
    });
    return true;
  } catch (error) {
    if (error && error.status === 1) {
      return false;
    }
    throw error;
  }
}

function gitTrackedOutputFiles() {
  const raw = execFileSync("git", ["ls-files", "output"], {
    cwd: workspaceRoot,
    encoding: "utf8",
  });
  return raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map(normalizeRelativePath);
}

function main() {
  const trackedPatterns = Array.isArray(outputSurfacePolicy.gitTrackedAllowPatterns)
    ? outputSurfacePolicy.gitTrackedAllowPatterns.map(normalizeRelativePath)
    : [];
  const localOnlyPatterns = Array.isArray(outputSurfacePolicy.localOnlyIntentionalPatterns)
    ? outputSurfacePolicy.localOnlyIntentionalPatterns.map(normalizeRelativePath)
    : [];
  const transientRootPatterns = (outputSurfacePolicy.transientRoots || []).map((item) => `${normalizeRelativePath(item.source)}/**`);
  const transientFilePatterns = (outputSurfacePolicy.transientOutputFiles || []).map((item) => normalizeRelativePath(item.pattern.startsWith("output/") ? item.pattern : `output/${item.pattern}`));

  assert(trackedPatterns.length > 0, "output surface policy must define gitTrackedAllowPatterns");
  assert(localOnlyPatterns.length > 0, "output surface policy must define localOnlyIntentionalPatterns");

  for (const pattern of trackedPatterns) {
    const probePath = synthesizeProbePath(pattern);
    assert.strictEqual(
      gitCheckIgnore(probePath),
      false,
      `repo-tracked intentional output must not be git-ignored: ${probePath}`
    );
  }

  for (const pattern of [...localOnlyPatterns, ...transientRootPatterns, ...transientFilePatterns]) {
    const probePath = synthesizeProbePath(pattern);
    assert.strictEqual(
      gitCheckIgnore(probePath),
      true,
      `local-only or transient output must stay git-ignored: ${probePath}`
    );
  }

  const trackedFiles = gitTrackedOutputFiles();
  const trackedRegexes = trackedPatterns.map(globToRegExp);
  const localOnlyRegexes = [...localOnlyPatterns, ...transientRootPatterns, ...transientFilePatterns].map(globToRegExp);

  for (const trackedFile of trackedFiles) {
    assert(
      trackedRegexes.some((regex) => regex.test(trackedFile)),
      `tracked output file is outside the repo-tracked allowlist: ${trackedFile}`
    );
    assert(
      !localOnlyRegexes.some((regex) => regex.test(trackedFile)),
      `tracked output file must not match a local-only/transient pattern: ${trackedFile}`
    );
  }

  process.stdout.write("PASS output_surface_git_policy_test\n");
}

main();
