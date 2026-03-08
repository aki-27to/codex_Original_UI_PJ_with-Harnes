"use strict";

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const gitAutomationEnvKeys = Object.freeze({
  autocommitEnabled: "CODEX_GIT_AUTOCOMMIT_ENABLED",
  autopushEnabled: "CODEX_GIT_AUTOPUSH_ENABLED",
  allowDirtyBaseline: "CODEX_GIT_ALLOW_DIRTY_BASELINE",
  remoteName: "CODEX_GIT_REMOTE",
  commitPrefix: "CODEX_GIT_COMMIT_PREFIX",
  commandTimeoutMs: "CODEX_GIT_COMMAND_TIMEOUT_MS",
  pushTimeoutMs: "CODEX_GIT_PUSH_TIMEOUT_MS",
});

function safeString(value, max = 4000) {
  if (typeof value !== "string") {
    return "";
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return "";
  }
  return trimmed.slice(0, max);
}

function toNonNegativeInt(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return 0;
  }
  return Math.max(0, Math.trunc(parsed));
}

function parseBooleanEnv(env, name, fallback) {
  const raw = typeof env[name] === "string" ? env[name].trim().toLowerCase() : "";
  if (!raw) {
    return Boolean(fallback);
  }
  if (raw === "1" || raw === "true" || raw === "yes" || raw === "on") {
    return true;
  }
  if (raw === "0" || raw === "false" || raw === "no" || raw === "off") {
    return false;
  }
  return Boolean(fallback);
}

function parsePositiveIntEnv(env, name, fallback, min, max) {
  const raw = typeof env[name] === "string" ? env[name].trim() : "";
  if (!raw) {
    return fallback;
  }
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  const normalizedMin = Number.isFinite(Number(min)) ? Math.trunc(Number(min)) : 0;
  const normalizedMax = Number.isFinite(Number(max)) ? Math.trunc(Number(max)) : fallback;
  return Math.max(normalizedMin, Math.min(normalizedMax, Math.trunc(parsed)));
}

function normalizeRemoteName(value, fallback = "origin") {
  const normalizedFallback = safeString(fallback, 80) || "origin";
  const normalized = safeString(value, 80);
  return normalized || normalizedFallback;
}

function normalizeCommitPrefix(value, fallback = "chore(codex):") {
  const normalizedFallback = safeString(fallback, 80) || "chore(codex):";
  const normalized = safeString(value, 80);
  return normalized || normalizedFallback;
}

function normalizeStatusLinePath(pathText) {
  const normalized = String(pathText || "").trim().replace(/\\/g, "/");
  return normalized;
}

function normalizeIgnoredRepoPaths(input) {
  const source = Array.isArray(input) ? input : [];
  const normalized = [];
  const seen = new Set();
  for (const entry of source) {
    const text = normalizeStatusLinePath(entry).toLowerCase();
    if (!text) {
      continue;
    }
    if (seen.has(text)) {
      continue;
    }
    seen.add(text);
    normalized.push(text);
  }
  return normalized;
}

function isIgnoredRepoPath(pathText, ignoredPaths) {
  const normalizedPath = normalizeStatusLinePath(pathText).toLowerCase();
  if (!normalizedPath) {
    return false;
  }
  for (const ignoredPath of Array.isArray(ignoredPaths) ? ignoredPaths : []) {
    const candidate = normalizeStatusLinePath(ignoredPath).toLowerCase();
    if (!candidate) {
      continue;
    }
    if (candidate.endsWith("/")) {
      if (normalizedPath.startsWith(candidate)) {
        return true;
      }
      continue;
    }
    if (normalizedPath === candidate || normalizedPath.startsWith(`${candidate}/`)) {
      return true;
    }
  }
  return false;
}

function parseGitStatusEntries(rawText) {
  const lines = String(rawText || "").split(/\r?\n/);
  const entries = [];
  const seen = new Set();
  for (const line of lines) {
    if (!line || line.length < 3) {
      continue;
    }
    const statusCode = line.slice(0, 2);
    let candidatePath = line.slice(3).trim();
    if (!candidatePath) {
      continue;
    }
    if (candidatePath.includes(" -> ")) {
      const parts = candidatePath.split(" -> ");
      candidatePath = parts[parts.length - 1] || candidatePath;
    }
    const normalizedPath = normalizeStatusLinePath(candidatePath);
    if (!normalizedPath) {
      continue;
    }
    const dedupeKey = `${statusCode}|${normalizedPath}`;
    if (seen.has(dedupeKey)) {
      continue;
    }
    seen.add(dedupeKey);
    entries.push({
      code: statusCode,
      path: normalizedPath,
    });
  }
  return entries;
}

function runGitCommand(repoRoot, args, timeoutMs) {
  const cwd = safeString(repoRoot, 2000);
  const startedAt = Date.now();
  let result;
  try {
    result = spawnSync("git", Array.isArray(args) ? args : [], {
      cwd,
      windowsHide: true,
      encoding: "utf8",
      timeout: toNonNegativeInt(timeoutMs) || 15000,
    });
  } catch (error) {
    return {
      ok: false,
      status: null,
      stdout: "",
      stderr: "",
      error: error instanceof Error ? error.message : String(error),
      timedOut: false,
      durationMs: Math.max(0, Date.now() - startedAt),
      args: Array.isArray(args) ? args.slice(0, 16) : [],
    };
  }
  const stdout = typeof result.stdout === "string" ? result.stdout : "";
  const stderr = typeof result.stderr === "string" ? result.stderr : "";
  const exitCode = Number.isInteger(result.status) ? result.status : null;
  const errorMessage = result.error
    ? (result.error instanceof Error ? result.error.message : String(result.error))
    : "";
  return {
    ok: !result.error && exitCode === 0,
    status: exitCode,
    stdout,
    stderr,
    error: errorMessage,
    timedOut: Boolean(result.error && result.error.code === "ETIMEDOUT"),
    durationMs: Math.max(0, Date.now() - startedAt),
    args: Array.isArray(args) ? args.slice(0, 16) : [],
  };
}

function buildGitCommandFailureReason(commandResult, fallback = "git_command_failed") {
  const result = commandResult && typeof commandResult === "object" ? commandResult : {};
  if (result.error) {
    const lowered = String(result.error).toLowerCase();
    if (lowered.includes("not found") || lowered.includes("enoent")) {
      return "git_not_available";
    }
    if (result.timedOut) {
      return "git_command_timeout";
    }
  }
  const combined = `${result.stdout || ""}\n${result.stderr || ""}`.toLowerCase();
  if (combined.includes("not a git repository")) {
    return "not_git_repository";
  }
  if (combined.includes("no such remote")) {
    return "remote_not_found";
  }
  if (combined.includes("could not read from remote repository")) {
    return "push_remote_read_failed";
  }
  if (combined.includes("failed to push some refs")) {
    return "push_rejected";
  }
  return fallback;
}

function summarizeCommandOutput(result) {
  const source = result && typeof result === "object" ? result : {};
  return {
    code: Number.isInteger(source.status) ? source.status : null,
    durationMs: toNonNegativeInt(source.durationMs),
    stdout: safeString(source.stdout, 4000),
    stderr: safeString(source.stderr, 4000),
    error: safeString(source.error, 400),
    timedOut: source.timedOut ? 1 : 0,
  };
}

function captureGitRepoState({ cwd = "", remoteName = "origin", timeoutMs = 15000, ignoredPaths = [] } = {}) {
  const resolvedCwd = safeString(cwd, 2000) ? path.resolve(cwd) : "";
  if (!resolvedCwd || !fs.existsSync(resolvedCwd)) {
    return {
      cwd: resolvedCwd,
      gitAvailable: 0,
      repoDetected: 0,
      dirty: 0,
      reason: "cwd_missing",
      entries: [],
      changedPaths: [],
      branch: "",
      detachedHead: 0,
      remoteName: normalizeRemoteName(remoteName),
      remoteConfigured: 0,
      remoteUrl: "",
    };
  }

  const normalizedRemoteName = normalizeRemoteName(remoteName);
  const topLevelResult = runGitCommand(resolvedCwd, ["rev-parse", "--show-toplevel"], timeoutMs);
  if (!topLevelResult.ok) {
    const reason = buildGitCommandFailureReason(topLevelResult, "git_repo_probe_failed");
    return {
      cwd: resolvedCwd,
      gitAvailable: reason === "git_not_available" ? 0 : 1,
      repoDetected: 0,
      dirty: 0,
      reason,
      entries: [],
      changedPaths: [],
      branch: "",
      detachedHead: 0,
      remoteName: normalizedRemoteName,
      remoteConfigured: 0,
      remoteUrl: "",
      probe: summarizeCommandOutput(topLevelResult),
    };
  }

  const repoRoot = safeString(topLevelResult.stdout, 2000) || resolvedCwd;
  const statusResult = runGitCommand(repoRoot, ["status", "--porcelain", "--untracked-files=all"], timeoutMs);
  const normalizedIgnoredPaths = normalizeIgnoredRepoPaths(ignoredPaths);
  const rawStatusEntries = statusResult.ok ? parseGitStatusEntries(statusResult.stdout) : [];
  const ignoredStatusEntries = rawStatusEntries.filter((entry) => isIgnoredRepoPath(entry.path, normalizedIgnoredPaths));
  const statusEntries = rawStatusEntries.filter((entry) => !isIgnoredRepoPath(entry.path, normalizedIgnoredPaths));
  const branchResult = runGitCommand(repoRoot, ["branch", "--show-current"], timeoutMs);
  const branch = branchResult.ok ? safeString(branchResult.stdout, 200) : "";
  const remoteResult = runGitCommand(repoRoot, ["remote", "get-url", normalizedRemoteName], timeoutMs);
  const remoteUrl = remoteResult.ok ? safeString(remoteResult.stdout, 2000) : "";

  return {
    cwd: resolvedCwd,
    repoRoot,
    gitAvailable: 1,
    repoDetected: 1,
    dirty: statusEntries.length > 0 ? 1 : 0,
    reason: "",
    entries: statusEntries,
    changedPaths: statusEntries.map((entry) => entry.path).slice(0, 120),
    ignoredChangedPaths: ignoredStatusEntries.map((entry) => entry.path).slice(0, 120),
    branch,
    detachedHead: branch ? 0 : 1,
    remoteName: normalizedRemoteName,
    remoteConfigured: remoteUrl ? 1 : 0,
    remoteUrl,
    ignoredPaths: normalizedIgnoredPaths,
    probes: {
      status: summarizeCommandOutput(statusResult),
      branch: summarizeCommandOutput(branchResult),
      remote: summarizeCommandOutput(remoteResult),
    },
  };
}

function buildGitAutomationConfig(env = process.env) {
  const source = env && typeof env === "object" ? env : {};
  const autocommitEnabled = parseBooleanEnv(source, gitAutomationEnvKeys.autocommitEnabled, false);
  const autopushEnabled = autocommitEnabled
    ? parseBooleanEnv(source, gitAutomationEnvKeys.autopushEnabled, false)
    : false;
  return {
    enabled: autocommitEnabled || autopushEnabled,
    autocommitEnabled,
    autopushEnabled,
    allowDirtyBaseline: parseBooleanEnv(source, gitAutomationEnvKeys.allowDirtyBaseline, false),
    remoteName: normalizeRemoteName(source[gitAutomationEnvKeys.remoteName], "origin"),
    commitPrefix: normalizeCommitPrefix(source[gitAutomationEnvKeys.commitPrefix], "chore(codex):"),
    commandTimeoutMs: parsePositiveIntEnv(source, gitAutomationEnvKeys.commandTimeoutMs, 15000, 1000, 120000),
    pushTimeoutMs: parsePositiveIntEnv(source, gitAutomationEnvKeys.pushTimeoutMs, 45000, 1000, 300000),
    envKeys: { ...gitAutomationEnvKeys },
  };
}

function buildGitAutomationCommitMessage(config, meta = {}) {
  const prefix = normalizeCommitPrefix(config && config.commitPrefix, "chore(codex):");
  const agentName = safeString(meta.agentName, 40) || "default";
  const taskOutcomeStatus = safeString(meta.taskOutcomeStatus, 40).toUpperCase() || "COMPLETED";
  const turnId = safeString(meta.turnId, 40);
  const shortTurn = turnId ? turnId.slice(0, 12) : "turn";
  const base = `${prefix} ${agentName} ${shortTurn} [${taskOutcomeStatus}]`;
  return safeString(base, 120) || `${prefix} codex turn [${taskOutcomeStatus}]`;
}

function buildSkippedResult({
  config,
  cwd,
  baseline,
  current = null,
  status = "skipped",
  reason = "",
  finalStatus = "",
  taskOutcomeStatus = "",
  taskOutcomeReason = "",
  turnId = "",
  threadId = "",
  agentName = "",
  executionProfile = "",
  executionIntent = "",
  executionSource = "",
  startedAt = Date.now(),
} = {}) {
  return {
    mode: "completed-turn",
    status,
    reason: safeString(reason, 120),
    cwd: safeString(cwd, 2000),
    repoRoot: safeString(current && current.repoRoot, 2000) || safeString(baseline && baseline.repoRoot, 2000),
    finalStatus: safeString(finalStatus, 40),
    taskOutcomeStatus: safeString(taskOutcomeStatus, 80).toUpperCase(),
    taskOutcomeReason: safeString(taskOutcomeReason, 160),
    turnId: safeString(turnId, 160),
    threadId: safeString(threadId, 160),
    agentName: safeString(agentName, 120),
    executionProfile: safeString(executionProfile, 80),
    executionIntent: safeString(executionIntent, 80),
    executionSource: safeString(executionSource, 80),
    autocommitEnabled: config && config.autocommitEnabled ? 1 : 0,
    autopushEnabled: config && config.autopushEnabled ? 1 : 0,
    allowDirtyBaseline: config && config.allowDirtyBaseline ? 1 : 0,
    baseline: baseline || null,
    current: current || null,
    commit: {
      attempted: 0,
      status: "skipped",
      message: "",
      hash: "",
    },
    push: {
      attempted: 0,
      status: "skipped",
      remoteName: config && config.remoteName ? config.remoteName : "origin",
      branch: "",
    },
    startedAt,
    completedAt: Date.now(),
  };
}

function runGitAutomationForTurn({
  config,
  cwd = "",
  baseline = null,
  finalStatus = "",
  taskOutcomeStatus = "",
  taskOutcomeReason = "",
  turnId = "",
  threadId = "",
  agentName = "",
  executionProfile = "",
  executionIntent = "",
  executionSource = "",
} = {}) {
  const normalizedConfig = config && typeof config === "object"
    ? config
    : buildGitAutomationConfig(process.env);
  const startedAt = Date.now();
  const resolvedCwd = safeString(cwd, 2000) ? path.resolve(cwd) : "";
  const normalizedFinalStatus = safeString(finalStatus, 40).toLowerCase();
  const normalizedTaskOutcomeStatus = safeString(taskOutcomeStatus, 80).toUpperCase();
  const normalizedIgnoredPaths = normalizeIgnoredRepoPaths(normalizedConfig.ignoredPaths);

  if (!normalizedConfig.autocommitEnabled) {
    return buildSkippedResult({
      config: normalizedConfig,
      cwd: resolvedCwd,
      baseline,
      reason: "autocommit_disabled",
      finalStatus: normalizedFinalStatus,
      taskOutcomeStatus: normalizedTaskOutcomeStatus,
      taskOutcomeReason,
      turnId,
      threadId,
      agentName,
      executionProfile,
      executionIntent,
      executionSource,
      startedAt,
    });
  }
  if (normalizedFinalStatus !== "completed") {
    return buildSkippedResult({
      config: normalizedConfig,
      cwd: resolvedCwd,
      baseline,
      reason: "turn_not_completed",
      finalStatus: normalizedFinalStatus,
      taskOutcomeStatus: normalizedTaskOutcomeStatus,
      taskOutcomeReason,
      turnId,
      threadId,
      agentName,
      executionProfile,
      executionIntent,
      executionSource,
      startedAt,
    });
  }
  if (normalizedTaskOutcomeStatus !== "COMPLETED") {
    return buildSkippedResult({
      config: normalizedConfig,
      cwd: resolvedCwd,
      baseline,
      reason: "task_outcome_not_completed",
      finalStatus: normalizedFinalStatus,
      taskOutcomeStatus: normalizedTaskOutcomeStatus,
      taskOutcomeReason,
      turnId,
      threadId,
      agentName,
      executionProfile,
      executionIntent,
      executionSource,
      startedAt,
    });
  }

  const current = captureGitRepoState({
    cwd: resolvedCwd,
    remoteName: normalizedConfig.remoteName,
    timeoutMs: normalizedConfig.commandTimeoutMs,
    ignoredPaths: normalizedIgnoredPaths,
  });

  if (!current.gitAvailable) {
    return buildSkippedResult({
      config: normalizedConfig,
      cwd: resolvedCwd,
      baseline,
      current,
      reason: safeString(current.reason, 120) || "git_not_available",
      finalStatus: normalizedFinalStatus,
      taskOutcomeStatus: normalizedTaskOutcomeStatus,
      taskOutcomeReason,
      turnId,
      threadId,
      agentName,
      executionProfile,
      executionIntent,
      executionSource,
      startedAt,
    });
  }
  if (!current.repoDetected) {
    return buildSkippedResult({
      config: normalizedConfig,
      cwd: resolvedCwd,
      baseline,
      current,
      reason: safeString(current.reason, 120) || "not_git_repository",
      finalStatus: normalizedFinalStatus,
      taskOutcomeStatus: normalizedTaskOutcomeStatus,
      taskOutcomeReason,
      turnId,
      threadId,
      agentName,
      executionProfile,
      executionIntent,
      executionSource,
      startedAt,
    });
  }

  const baselineState = baseline && typeof baseline === "object" ? baseline : null;
  if (
    baselineState &&
    baselineState.repoDetected &&
    baselineState.dirty &&
    !normalizedConfig.allowDirtyBaseline
  ) {
    return buildSkippedResult({
      config: normalizedConfig,
      cwd: resolvedCwd,
      baseline: baselineState,
      current,
      reason: "dirty_baseline",
      finalStatus: normalizedFinalStatus,
      taskOutcomeStatus: normalizedTaskOutcomeStatus,
      taskOutcomeReason,
      turnId,
      threadId,
      agentName,
      executionProfile,
      executionIntent,
      executionSource,
      startedAt,
    });
  }
  if (!current.dirty) {
    return buildSkippedResult({
      config: normalizedConfig,
      cwd: resolvedCwd,
      baseline: baselineState,
      current,
      reason: "no_repo_changes",
      finalStatus: normalizedFinalStatus,
      taskOutcomeStatus: normalizedTaskOutcomeStatus,
      taskOutcomeReason,
      turnId,
      threadId,
      agentName,
      executionProfile,
      executionIntent,
      executionSource,
      startedAt,
    });
  }

  const commitMessage = buildGitAutomationCommitMessage(normalizedConfig, {
    turnId,
    agentName,
    taskOutcomeStatus: normalizedTaskOutcomeStatus,
  });
  const addResult = runGitCommand(current.repoRoot, ["add", "-A"], normalizedConfig.commandTimeoutMs);
  if (!addResult.ok) {
    return {
      mode: "completed-turn",
      status: "failed",
      reason: buildGitCommandFailureReason(addResult, "git_add_failed"),
      cwd: resolvedCwd,
      repoRoot: current.repoRoot,
      finalStatus: normalizedFinalStatus,
      taskOutcomeStatus: normalizedTaskOutcomeStatus,
      taskOutcomeReason: safeString(taskOutcomeReason, 160),
      turnId: safeString(turnId, 160),
      threadId: safeString(threadId, 160),
      agentName: safeString(agentName, 120),
      executionProfile: safeString(executionProfile, 80),
      executionIntent: safeString(executionIntent, 80),
      executionSource: safeString(executionSource, 80),
      autocommitEnabled: 1,
      autopushEnabled: normalizedConfig.autopushEnabled ? 1 : 0,
      allowDirtyBaseline: normalizedConfig.allowDirtyBaseline ? 1 : 0,
      baseline: baselineState,
      current,
      commit: {
        attempted: 1,
        status: "failed",
        message: commitMessage,
        hash: "",
        add: summarizeCommandOutput(addResult),
      },
      push: {
        attempted: 0,
        status: "skipped",
        remoteName: normalizedConfig.remoteName,
        branch: safeString(current.branch, 120),
      },
      startedAt,
      completedAt: Date.now(),
    };
  }

  const ignoredChangedPaths = Array.isArray(current.ignoredChangedPaths)
    ?current.ignoredChangedPaths.slice(0,32)
    :[];
  let resetIgnoredResult=null;
  if(ignoredChangedPaths.length){
    resetIgnoredResult=runGitCommand(
      current.repoRoot,
      ["reset","HEAD","--",...ignoredChangedPaths],
      normalizedConfig.commandTimeoutMs
    );
    if(!resetIgnoredResult.ok){
      return {
        mode: "completed-turn",
        status: "failed",
        reason: buildGitCommandFailureReason(resetIgnoredResult, "git_reset_ignored_failed"),
        cwd: resolvedCwd,
        repoRoot: current.repoRoot,
        finalStatus: normalizedFinalStatus,
        taskOutcomeStatus: normalizedTaskOutcomeStatus,
        taskOutcomeReason: safeString(taskOutcomeReason, 160),
        turnId: safeString(turnId, 160),
        threadId: safeString(threadId, 160),
        agentName: safeString(agentName, 120),
        executionProfile: safeString(executionProfile, 80),
        executionIntent: safeString(executionIntent, 80),
        executionSource: safeString(executionSource, 80),
        autocommitEnabled: 1,
        autopushEnabled: normalizedConfig.autopushEnabled ? 1 : 0,
        allowDirtyBaseline: normalizedConfig.allowDirtyBaseline ? 1 : 0,
        baseline: baselineState,
        current,
        commit: {
          attempted: 1,
          status: "failed",
          message: commitMessage,
          hash: "",
          add: summarizeCommandOutput(addResult),
          resetIgnored: summarizeCommandOutput(resetIgnoredResult),
        },
        push: {
          attempted: 0,
          status: "skipped",
          remoteName: normalizedConfig.remoteName,
          branch: safeString(current.branch, 120),
        },
        startedAt,
        completedAt: Date.now(),
      };
    }
  }

  const commitResult = runGitCommand(current.repoRoot, ["commit", "-m", commitMessage], normalizedConfig.commandTimeoutMs);
  const commitFailedReason = buildGitCommandFailureReason(commitResult, "git_commit_failed");
  if (!commitResult.ok) {
    const combined = `${commitResult.stdout || ""}\n${commitResult.stderr || ""}`.toLowerCase();
    const nothingToCommit = combined.includes("nothing to commit") || combined.includes("no changes added to commit");
    return {
      mode: "completed-turn",
      status: nothingToCommit ? "skipped" : "failed",
      reason: nothingToCommit ? "no_repo_changes" : commitFailedReason,
      cwd: resolvedCwd,
      repoRoot: current.repoRoot,
      finalStatus: normalizedFinalStatus,
      taskOutcomeStatus: normalizedTaskOutcomeStatus,
      taskOutcomeReason: safeString(taskOutcomeReason, 160),
      turnId: safeString(turnId, 160),
      threadId: safeString(threadId, 160),
      agentName: safeString(agentName, 120),
      executionProfile: safeString(executionProfile, 80),
      executionIntent: safeString(executionIntent, 80),
      executionSource: safeString(executionSource, 80),
      autocommitEnabled: 1,
      autopushEnabled: normalizedConfig.autopushEnabled ? 1 : 0,
      allowDirtyBaseline: normalizedConfig.allowDirtyBaseline ? 1 : 0,
      baseline: baselineState,
      current,
      commit: {
        attempted: 1,
        status: nothingToCommit ? "skipped" : "failed",
        message: commitMessage,
        hash: "",
        add: summarizeCommandOutput(addResult),
        resetIgnored: summarizeCommandOutput(resetIgnoredResult),
        commit: summarizeCommandOutput(commitResult),
      },
      push: {
        attempted: 0,
        status: "skipped",
        remoteName: normalizedConfig.remoteName,
        branch: safeString(current.branch, 120),
      },
      startedAt,
      completedAt: Date.now(),
    };
  }

  const headResult = runGitCommand(current.repoRoot, ["rev-parse", "--short=12", "HEAD"], normalizedConfig.commandTimeoutMs);
  const commitHash = headResult.ok ? safeString(headResult.stdout, 40) : "";
  const baseResult = {
    mode: "completed-turn",
    status: "committed",
    reason: "",
    cwd: resolvedCwd,
    repoRoot: current.repoRoot,
    finalStatus: normalizedFinalStatus,
    taskOutcomeStatus: normalizedTaskOutcomeStatus,
    taskOutcomeReason: safeString(taskOutcomeReason, 160),
    turnId: safeString(turnId, 160),
    threadId: safeString(threadId, 160),
    agentName: safeString(agentName, 120),
    executionProfile: safeString(executionProfile, 80),
    executionIntent: safeString(executionIntent, 80),
    executionSource: safeString(executionSource, 80),
    autocommitEnabled: 1,
    autopushEnabled: normalizedConfig.autopushEnabled ? 1 : 0,
    allowDirtyBaseline: normalizedConfig.allowDirtyBaseline ? 1 : 0,
    baseline: baselineState,
    current,
    commit: {
      attempted: 1,
      status: "created",
      message: commitMessage,
      hash: commitHash,
      add: summarizeCommandOutput(addResult),
      resetIgnored: summarizeCommandOutput(resetIgnoredResult),
      commit: summarizeCommandOutput(commitResult),
      head: summarizeCommandOutput(headResult),
    },
    push: {
      attempted: 0,
      status: "skipped",
      remoteName: normalizedConfig.remoteName,
      branch: safeString(current.branch, 120),
      remoteConfigured: current.remoteConfigured ? 1 : 0,
    },
    startedAt,
    completedAt: Date.now(),
  };

  if (!normalizedConfig.autopushEnabled) {
    return baseResult;
  }
  if (!current.remoteConfigured) {
    return {
      ...baseResult,
      reason: "remote_not_configured",
      push: {
        attempted: 0,
        status: "skipped",
        remoteName: normalizedConfig.remoteName,
        branch: safeString(current.branch, 120),
        remoteConfigured: 0,
      },
      completedAt: Date.now(),
    };
  }
  if (!current.branch || current.detachedHead) {
    return {
      ...baseResult,
      reason: "detached_head",
      push: {
        attempted: 0,
        status: "skipped",
        remoteName: normalizedConfig.remoteName,
        branch: safeString(current.branch, 120),
        remoteConfigured: current.remoteConfigured ? 1 : 0,
      },
      completedAt: Date.now(),
    };
  }

  const pushResult = runGitCommand(
    current.repoRoot,
    ["push", "-u", normalizedConfig.remoteName, current.branch],
    normalizedConfig.pushTimeoutMs
  );
  if (!pushResult.ok) {
    return {
      ...baseResult,
      status: "committed_push_failed",
      reason: buildGitCommandFailureReason(pushResult, "git_push_failed"),
      push: {
        attempted: 1,
        status: "failed",
        remoteName: normalizedConfig.remoteName,
        branch: safeString(current.branch, 120),
        remoteConfigured: current.remoteConfigured ? 1 : 0,
        push: summarizeCommandOutput(pushResult),
      },
      completedAt: Date.now(),
    };
  }

  return {
    ...baseResult,
    status: "pushed",
    reason: "",
    push: {
      attempted: 1,
      status: "pushed",
      remoteName: normalizedConfig.remoteName,
      branch: safeString(current.branch, 120),
      remoteConfigured: current.remoteConfigured ? 1 : 0,
      push: summarizeCommandOutput(pushResult),
    },
    completedAt: Date.now(),
  };
}

module.exports = {
  buildGitAutomationCommitMessage,
  buildGitAutomationConfig,
  captureGitRepoState,
  gitAutomationEnvKeys,
  runGitAutomationForTurn,
};
