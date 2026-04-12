"use strict";

const assert = require("assert");
const { spawnSync } = require("child_process");
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

function runGit(args, { allowFailure = false } = {}) {
  const result = spawnSync("git", args, {
    cwd: workspaceRoot,
    windowsHide: true,
    encoding: "utf8",
    timeout: 30000,
  });
  if (!allowFailure && (result.error || result.status !== 0)) {
    const stderr = typeof result.stderr === "string" ? result.stderr.trim() : "";
    const stdout = typeof result.stdout === "string" ? result.stdout.trim() : "";
    const reason = result.error
      ? result.error.message
      : (stderr || stdout || `exit code ${result.status}`);
    throw new Error(`git ${args.join(" ")} failed: ${reason}`);
  }
  return result;
}

function gitCheckIgnore(relativePath) {
  const normalized = normalizeRelativePath(relativePath);
  const result = runGit(["check-ignore", "-q", normalized], { allowFailure: true });
  if (result.status === 0 && !result.error) {
    return true;
  }
  if (!result.error && result.status === 1) {
    return false;
  }
  const stderr = typeof result.stderr === "string" ? result.stderr.trim() : "";
  const stdout = typeof result.stdout === "string" ? result.stdout.trim() : "";
  const reason = result.error
    ? result.error.message
    : (stderr || stdout || `exit code ${result.status}`);
  throw new Error(`git check-ignore -q ${normalized} failed: ${reason}`);
}

function gitTrackedOutputFiles() {
  const raw = runGit(["ls-files", "output"]).stdout;
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
