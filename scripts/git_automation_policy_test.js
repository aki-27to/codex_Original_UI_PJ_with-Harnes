#!/usr/bin/env node
"use strict";

const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

const {
  buildGitAutomationConfig,
  captureGitRepoState,
  runGitAutomationForTurn,
} = require("./lib/git_automation");

function runCheck(name, fn) {
  try {
    const detail = fn();
    console.log(`PASS ${name}${detail ? ` :: ${detail}` : ""}`);
    return true;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`FAIL ${name} :: ${message}`);
    return false;
  }
}

function runGit(args, { cwd = "", allowFailure = false } = {}) {
  const result = spawnSync("git", args, {
    cwd: cwd || undefined,
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

function writeText(filePath, text) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, text, "utf8");
}

function createManagedRepo(label) {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), `codex-git-auto-${label}-`));
  const remoteRoot = path.join(tempRoot, "remote.git");
  const workRoot = path.join(tempRoot, "work");
  fs.mkdirSync(workRoot, { recursive: true });

  runGit(["--version"]);
  runGit(["init", "--bare", remoteRoot]);
  runGit(["init"], { cwd: workRoot });
  runGit(["config", "user.name", "Codex Harness"], { cwd: workRoot });
  runGit(["config", "user.email", "codex-harness@example.invalid"], { cwd: workRoot });

  writeText(path.join(workRoot, "README.md"), "# temp repo\n");
  runGit(["add", "README.md"], { cwd: workRoot });
  runGit(["commit", "-m", "initial"], { cwd: workRoot });
  runGit(["branch", "-M", "main"], { cwd: workRoot });
  runGit(["remote", "add", "origin", remoteRoot], { cwd: workRoot });
  runGit(["push", "-u", "origin", "main"], { cwd: workRoot });

  return { tempRoot, remoteRoot, workRoot };
}

function createConfig(overrides = {}) {
  return buildGitAutomationConfig({
    CODEX_GIT_AUTOCOMMIT_ENABLED: "1",
    CODEX_GIT_AUTOPUSH_ENABLED: "1",
    CODEX_GIT_ALLOW_DIRTY_BASELINE: "0",
    CODEX_GIT_REMOTE: "origin",
    ...overrides,
  });
}

let ok = true;

ok = runCheck("config normalization", () => {
  const defaultConfig = buildGitAutomationConfig({});
  assert.equal(defaultConfig.autocommitEnabled, true);
  assert.equal(defaultConfig.autopushEnabled, true);

  const config = buildGitAutomationConfig({
    CODEX_GIT_AUTOCOMMIT_ENABLED: "1",
    CODEX_GIT_AUTOPUSH_ENABLED: "1",
    CODEX_GIT_ALLOW_DIRTY_BASELINE: "1",
    CODEX_GIT_REMOTE: "upstream",
    CODEX_GIT_COMMIT_PREFIX: "ci(codex):",
    CODEX_GIT_COMMAND_TIMEOUT_MS: "9000",
    CODEX_GIT_PUSH_TIMEOUT_MS: "12000",
  });
  assert.equal(config.autocommitEnabled, true);
  assert.equal(config.autopushEnabled, true);
  assert.equal(config.allowDirtyBaseline, true);
  assert.equal(config.remoteName, "upstream");
  assert.equal(config.commitPrefix, "ci(codex):");
  assert.equal(config.commandTimeoutMs, 9000);
  assert.equal(config.pushTimeoutMs, 12000);
  return "env overrides parsed";
}) && ok;

ok = runCheck("commit and push on clean baseline", () => {
  const repo = createManagedRepo("push");
  const baseline = captureGitRepoState({
    cwd: repo.workRoot,
    remoteName: "origin",
    timeoutMs: 15000,
  });
  assert.equal(baseline.repoDetected, 1);
  assert.equal(baseline.dirty, 0);

  writeText(path.join(repo.workRoot, "README.md"), "# temp repo\n\nupdated by harness\n");
  const result = runGitAutomationForTurn({
    config: createConfig(),
    cwd: repo.workRoot,
    baseline,
    finalStatus: "completed",
    taskOutcomeStatus: "COMPLETED",
    taskOutcomeReason: "baseline delivered",
    turnId: "turn-clean-push-001",
    threadId: "thread-clean-push",
    agentName: "default",
    executionProfile: "full-runtime",
    executionIntent: "interactive",
    executionSource: "api_exec",
  });
  assert.equal(result.status, "pushed");
  assert.equal(result.commit.status, "created");
  assert.equal(result.push.status, "pushed");
  assert(result.commit.hash, "expected commit hash");

  const localHead = String(runGit(["rev-parse", "HEAD"], { cwd: repo.workRoot }).stdout || "").trim();
  const remoteHead = String(runGit(["--git-dir", repo.remoteRoot, "rev-parse", "refs/heads/main"]).stdout || "").trim();
  assert.equal(localHead, remoteHead);

  const finalState = captureGitRepoState({
    cwd: repo.workRoot,
    remoteName: "origin",
    timeoutMs: 15000,
  });
  assert.equal(finalState.dirty, 0);
  return repo.tempRoot;
}) && ok;

ok = runCheck("dirty baseline skips automation", () => {
  const repo = createManagedRepo("dirty");
  writeText(path.join(repo.workRoot, "notes.txt"), "before baseline dirty change\n");
  const baseline = captureGitRepoState({
    cwd: repo.workRoot,
    remoteName: "origin",
    timeoutMs: 15000,
  });
  assert.equal(baseline.dirty, 1);

  const result = runGitAutomationForTurn({
    config: createConfig(),
    cwd: repo.workRoot,
    baseline,
    finalStatus: "completed",
    taskOutcomeStatus: "COMPLETED",
    taskOutcomeReason: "baseline delivered",
    turnId: "turn-dirty-001",
    threadId: "thread-dirty",
    agentName: "default",
    executionProfile: "full-runtime",
    executionIntent: "interactive",
    executionSource: "api_exec",
  });
  assert.equal(result.status, "skipped");
  assert.equal(result.reason, "dirty_baseline");
  return repo.tempRoot;
}) && ok;

ok = runCheck("no changes skips automation", () => {
  const repo = createManagedRepo("nochange");
  const baseline = captureGitRepoState({
    cwd: repo.workRoot,
    remoteName: "origin",
    timeoutMs: 15000,
  });
  assert.equal(baseline.dirty, 0);

  const result = runGitAutomationForTurn({
    config: createConfig(),
    cwd: repo.workRoot,
    baseline,
    finalStatus: "completed",
    taskOutcomeStatus: "COMPLETED",
    taskOutcomeReason: "baseline delivered",
    turnId: "turn-nochange-001",
    threadId: "thread-nochange",
    agentName: "default",
    executionProfile: "full-runtime",
    executionIntent: "interactive",
    executionSource: "api_exec",
  });
  assert.equal(result.status, "skipped");
  assert.equal(result.reason, "no_repo_changes");
  return repo.tempRoot;
}) && ok;

ok = runCheck("ignored runtime metadata does not trigger automation", () => {
  const repo = createManagedRepo("ignored");
  const ignoredPaths = ["logs/archive/raw/harness_execution_memory.json", "logs/archive/raw/eval_runs.jsonl"];
  const baseline = captureGitRepoState({
    cwd: repo.workRoot,
    remoteName: "origin",
    timeoutMs: 15000,
    ignoredPaths,
  });
  assert.equal(baseline.dirty, 0);

  writeText(path.join(repo.workRoot, "logs", "archive", "raw", "runtime_state", "harness_execution_memory.json"), "{\"ok\":true}\n");
  const current = captureGitRepoState({
    cwd: repo.workRoot,
    remoteName: "origin",
    timeoutMs: 15000,
    ignoredPaths,
  });
  assert.equal(current.dirty, 0);
  assert(current.ignoredChangedPaths.includes("logs/archive/raw/harness_execution_memory.json"));

  const result = runGitAutomationForTurn({
    config: {
      ...createConfig(),
      ignoredPaths,
    },
    cwd: repo.workRoot,
    baseline,
    finalStatus: "completed",
    taskOutcomeStatus: "COMPLETED",
    taskOutcomeReason: "baseline delivered",
    turnId: "turn-ignored-001",
    threadId: "thread-ignored",
    agentName: "default",
    executionProfile: "full-runtime",
    executionIntent: "interactive",
    executionSource: "api_exec",
  });
  assert.equal(result.status, "skipped");
  assert.equal(result.reason, "no_repo_changes");
  return repo.tempRoot;
}) && ok;

if (!ok) {
  process.exitCode = 1;
}
