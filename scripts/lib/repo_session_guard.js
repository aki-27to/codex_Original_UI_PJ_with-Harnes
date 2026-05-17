"use strict";

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

function safeString(value, max = 4000) {
  if (typeof value !== "string") return "";
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, max) : "";
}

function normalizeRepoPath(value) {
  return String(value || "").trim().replace(/\\/g, "/").replace(/^\.\//, "");
}

function runGit(cwd, args, timeoutMs = 15000) {
  const startedAt = Date.now();
  let result;
  try {
    result = spawnSync("git", Array.isArray(args) ? args : [], {
      cwd,
      windowsHide: true,
      encoding: "utf8",
      timeout: Math.max(1000, Math.trunc(Number(timeoutMs) || 15000)),
      maxBuffer: 1024 * 1024 * 4,
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
    };
  }
  return {
    ok: !result.error && Number.isInteger(result.status) && result.status === 0,
    status: Number.isInteger(result.status) ? result.status : null,
    stdout: typeof result.stdout === "string" ? result.stdout : "",
    stderr: typeof result.stderr === "string" ? result.stderr : "",
    error: result.error ? result.error.message : "",
    timedOut: Boolean(result.error && result.error.code === "ETIMEDOUT"),
    durationMs: Math.max(0, Date.now() - startedAt),
  };
}

function splitStatusLine(line) {
  return String(line || "").split(" ");
}

function parseAheadBehind(value) {
  const match = String(value || "").match(/\+(\d+)\s+-?(\d+)/);
  if (!match) {
    return { ahead: 0, behind: 0 };
  }
  return {
    ahead: Number(match[1]) || 0,
    behind: Number(match[2]) || 0,
  };
}

function parsePorcelainV2Status(source) {
  const branch = {
    oid: "",
    head: "",
    upstream: "",
    ahead: 0,
    behind: 0,
  };
  const entries = [];
  for (const line of String(source || "").split(/\r?\n/)) {
    if (!line) continue;
    if (line.startsWith("# branch.oid ")) {
      branch.oid = safeString(line.slice("# branch.oid ".length), 80);
      continue;
    }
    if (line.startsWith("# branch.head ")) {
      branch.head = safeString(line.slice("# branch.head ".length), 160);
      continue;
    }
    if (line.startsWith("# branch.upstream ")) {
      branch.upstream = safeString(line.slice("# branch.upstream ".length), 160);
      continue;
    }
    if (line.startsWith("# branch.ab ")) {
      Object.assign(branch, parseAheadBehind(line.slice("# branch.ab ".length)));
      continue;
    }
    if (line.startsWith("1 ")) {
      const parts = splitStatusLine(line);
      const repoPath = normalizeRepoPath(parts.slice(8).join(" "));
      if (repoPath) {
        entries.push({ record: "ordinary", code: safeString(parts[1], 8), path: repoPath });
      }
      continue;
    }
    if (line.startsWith("2 ")) {
      const parts = splitStatusLine(line);
      const pathPair = parts.slice(9).join(" ");
      const [repoPath, originalPath = ""] = pathPair.split("\t");
      const normalizedPath = normalizeRepoPath(repoPath);
      if (normalizedPath) {
        entries.push({
          record: "renamed",
          code: safeString(parts[1], 8),
          path: normalizedPath,
          originalPath: normalizeRepoPath(originalPath),
        });
      }
      continue;
    }
    if (line.startsWith("u ")) {
      const parts = splitStatusLine(line);
      const repoPath = normalizeRepoPath(parts.slice(10).join(" "));
      if (repoPath) {
        entries.push({ record: "unmerged", code: safeString(parts[1], 8), path: repoPath });
      }
      continue;
    }
    if (line.startsWith("? ")) {
      const repoPath = normalizeRepoPath(line.slice(2));
      if (repoPath) {
        entries.push({ record: "untracked", code: "??", path: repoPath });
      }
      continue;
    }
    if (line.startsWith("! ")) {
      const repoPath = normalizeRepoPath(line.slice(2));
      if (repoPath) {
        entries.push({ record: "ignored", code: "!!", path: repoPath });
      }
    }
  }
  return { branch, entries };
}

function classifySessionEntry(entry) {
  const repoPath = normalizeRepoPath(entry && entry.path);
  const lower = repoPath.toLowerCase();
  const rootFile = !repoPath.includes("/");
  let classification = "unknown_dirty";
  let surface = "unknown";
  let action = "Classify this path before starting new work; do not mix it into the next task.";

  if (/^(output|logs|runtime|coverage|dist|build)\//i.test(repoPath)) {
    classification = "generated_or_runtime";
    surface = "generated_output";
    action = "Move with housekeeping, ignore if transient, or commit only when the artifact is intentionally tracked.";
  } else if (
    /^(\.env|.*secret.*|.*credential.*|passport_.*|.*passport.*)$/i.test(repoPath)
    || (rootFile && /\.(jpg|jpeg|png|gif|webp|heic|pdf|docx|xlsx|pptx|zip|7z|rar)$/i.test(repoPath))
  ) {
    classification = "private_or_local_artifact";
    surface = "local_private";
    action = "Move outside the repo or add a machine-local rule to .git/info/exclude after confirming it is not source.";
  } else if (
    /^(server|scripts|web|docs|APP|tools|desktop|plugins|\.agents|\.codex|\.github)\//i.test(repoPath)
    || /^(AGENTS\.md|README\.md|package\.json|package-lock\.json|server\.js|server_impl\.js|start_codex_ui\.bat|start_harnes_desktop_app\.bat|\.gitignore)$/i.test(repoPath)
  ) {
    classification = "intended_change_candidate";
    surface = "source_or_docs";
    action = "Finish, verify, and commit/push this work, or move it to a WIP branch before starting the next task.";
  }

  return {
    path: repoPath,
    code: safeString(entry && entry.code, 8),
    record: safeString(entry && entry.record, 40),
    classification,
    surface,
    action,
  };
}

function countBy(entries, key) {
  const counts = {};
  for (const entry of Array.isArray(entries) ? entries : []) {
    const value = safeString(entry && entry[key], 100) || "unknown";
    counts[value] = (counts[value] || 0) + 1;
  }
  return counts;
}

function captureSessionGitState(options = {}) {
  const cwd = path.resolve(options.cwd || process.cwd());
  const timeoutMs = Number(options.timeoutMs) || 15000;
  if (!fs.existsSync(cwd)) {
    return {
      ok: false,
      reason: "cwd_missing",
      cwd,
      repoRoot: "",
      branch: {},
      entries: [],
      classifiedEntries: [],
    };
  }

  const rootResult = runGit(cwd, ["rev-parse", "--show-toplevel"], timeoutMs);
  if (!rootResult.ok) {
    return {
      ok: false,
      reason: "not_git_repository",
      cwd,
      repoRoot: "",
      branch: {},
      entries: [],
      classifiedEntries: [],
      git: { root: rootResult },
    };
  }

  const repoRoot = safeString(rootResult.stdout, 2000) || cwd;
  const statusResult = runGit(repoRoot, ["-c", "core.quotePath=false", "status", "--porcelain=v2", "--branch", "--untracked-files=all"], timeoutMs);
  const parsedStatus = statusResult.ok
    ? parsePorcelainV2Status(statusResult.stdout)
    : { branch: {}, entries: [] };
  const headResult = runGit(repoRoot, ["rev-parse", "HEAD"], timeoutMs);
  const headShortResult = runGit(repoRoot, ["rev-parse", "--short=12", "HEAD"], timeoutMs);
  const upstreamRef = parsedStatus.branch.upstream || "";
  const upstreamResult = upstreamRef
    ? runGit(repoRoot, ["rev-parse", upstreamRef], timeoutMs)
    : { ok: false, stdout: "", stderr: "", error: "upstream_missing", status: null, durationMs: 0 };
  const upstreamShortResult = upstreamRef
    ? runGit(repoRoot, ["rev-parse", "--short=12", upstreamRef], timeoutMs)
    : { ok: false, stdout: "", stderr: "", error: "upstream_missing", status: null, durationMs: 0 };
  const classifiedEntries = parsedStatus.entries.map(classifySessionEntry);

  return {
    ok: statusResult.ok,
    reason: statusResult.ok ? "" : safeString(statusResult.stderr || statusResult.error, 400),
    cwd,
    repoRoot,
    branch: {
      name: safeString(parsedStatus.branch.head, 160),
      upstream: safeString(upstreamRef, 160),
      ahead: Number(parsedStatus.branch.ahead) || 0,
      behind: Number(parsedStatus.branch.behind) || 0,
      head: safeString(headResult.stdout, 80),
      headShort: safeString(headShortResult.stdout, 40),
      upstreamCommit: upstreamResult.ok ? safeString(upstreamResult.stdout, 80) : "",
      upstreamShort: upstreamShortResult.ok ? safeString(upstreamShortResult.stdout, 40) : "",
      upstreamAvailable: upstreamResult.ok ? 1 : 0,
    },
    entries: parsedStatus.entries,
    classifiedEntries,
    counts: {
      total: classifiedEntries.length,
      byClassification: countBy(classifiedEntries, "classification"),
      bySurface: countBy(classifiedEntries, "surface"),
    },
    git: {
      root: rootResult,
      status: statusResult,
      head: headResult,
      upstream: upstreamResult,
    },
  };
}

function buildRecommendations(classifiedEntries, mode, branch = {}) {
  const classifications = new Set((classifiedEntries || []).map((entry) => entry.classification));
  const recommendations = [];
  if (!classifiedEntries || classifiedEntries.length === 0) {
    recommendations.push(mode === "closeout" ? "Working tree is clean; verify push state before final closure." : "Clean baseline; safe to start the next scoped task.");
  }
  if (classifications.has("intended_change_candidate")) {
    recommendations.push("Close source/docs candidates with verification and commit/push, or move them to a WIP branch before starting unrelated work.");
  }
  if (classifications.has("generated_or_runtime")) {
    recommendations.push("Run housekeeping or decide whether tracked generated artifacts are intentional before claiming clean closeout.");
  }
  if (classifications.has("private_or_local_artifact")) {
    recommendations.push("Move private/local artifacts outside the repo or hide them with .git/info/exclude after confirming they are not source.");
  }
  if (classifications.has("unknown_dirty")) {
    recommendations.push("Classify unknown dirty paths manually; do not absorb them into a new task by default.");
  }
  if (mode === "closeout" && Number(branch.ahead) > 0) {
    recommendations.push("Push local commits or explicitly report that HEAD is ahead of upstream.");
  }
  if (mode === "closeout" && Number(branch.behind) > 0) {
    recommendations.push("Sync with upstream before claiming the repo is ready for the next session.");
  }
  if (mode === "closeout" && !branch.upstream) {
    recommendations.push("No upstream is configured; local cleanliness cannot prove remote sync.");
  }
  return recommendations;
}

function isUntrackedEntry(entry) {
  return safeString(entry && entry.code, 8) === "??" || safeString(entry && entry.record, 40) === "untracked";
}

function isHighRiskPrivatePath(repoPath) {
  const normalized = normalizeRepoPath(repoPath);
  return /^(\.env|.*secret.*|.*credential.*|passport_.*|.*passport.*)$/i.test(normalized);
}

function buildAutoClosePlan(options = {}) {
  const report = buildPreflightReport(options);
  const entries = Array.isArray(report.entries) ? report.entries : [];
  const includePrivate = Boolean(options.includePrivate);
  const includeUnknown = Boolean(options.includeUnknown);
  const quarantinePrivate = options.quarantinePrivate !== false;
  const blockers = [];
  const quarantineEntries = [];
  const stageEntries = [];

  for (const entry of entries) {
    if (entry.classification === "private_or_local_artifact" && !includePrivate) {
      if (quarantinePrivate && isUntrackedEntry(entry)) {
        quarantineEntries.push(entry);
      } else if (!isUntrackedEntry(entry) && !isHighRiskPrivatePath(entry.path)) {
        stageEntries.push(entry);
      } else {
        blockers.push({
          path: entry.path,
          reason: isUntrackedEntry(entry)
            ? "private_or_local_artifact_requires_quarantine_or_explicit_include"
            : "tracked_private_or_local_artifact_requires_explicit_include",
        });
      }
      continue;
    }
    if (entry.classification === "unknown_dirty" && !includeUnknown) {
      blockers.push({
        path: entry.path,
        reason: "unknown_dirty_requires_manual_classification_or_explicit_include",
      });
      continue;
    }
    stageEntries.push(entry);
  }

  const pushNeeded = Number(report.branch && report.branch.ahead) > 0;
  return {
    schema: "repo-session-autoclose-plan.v1",
    mode: "autoclose",
    observedAt: new Date().toISOString(),
    cwd: report.cwd,
    repoRoot: report.repoRoot,
    branch: report.branch,
    dirtyStatus: report.status,
    stageCount: stageEntries.length,
    quarantineCount: quarantineEntries.length,
    blockerCount: blockers.length,
    pushNeeded,
    stageEntries,
    quarantineEntries,
    blockers,
    canRun: report.status !== "BLOCKED" && blockers.length === 0,
    noChanges: entries.length === 0,
    policy: {
      includePrivate: includePrivate ? 1 : 0,
      includeUnknown: includeUnknown ? 1 : 0,
      quarantinePrivate: quarantinePrivate ? 1 : 0,
      destructiveCommands: 0,
      stagesAllKnownNonPrivateDirty: 1,
      commitsAndPushesWhenNeeded: 1,
    },
  };
}

function appendLocalExcludes(repoRoot, entries) {
  const normalizedEntries = (Array.isArray(entries) ? entries : [])
    .map((entry) => normalizeRepoPath(entry && entry.path))
    .filter(Boolean);
  if (!normalizedEntries.length) {
    return [];
  }
  const excludePath = path.join(repoRoot, ".git", "info", "exclude");
  const existing = fs.existsSync(excludePath) ? fs.readFileSync(excludePath, "utf8") : "";
  const existingLines = new Set(existing.split(/\r?\n/).map((line) => normalizeRepoPath(line)));
  const additions = normalizedEntries.filter((entryPath) => !existingLines.has(entryPath));
  if (!additions.length) {
    return [];
  }
  const prefix = existing.endsWith("\n") || existing.length === 0 ? "" : "\n";
  const body = [
    prefix,
    "# repo-session-autoclose private/local artifacts",
    ...additions,
    "",
  ].join("\n");
  fs.appendFileSync(excludePath, body, "utf8");
  return additions;
}

function chunkArray(values, chunkSize) {
  const chunks = [];
  const normalizedSize = Math.max(1, Math.trunc(Number(chunkSize) || 50));
  for (let index = 0; index < values.length; index += normalizedSize) {
    chunks.push(values.slice(index, index + normalizedSize));
  }
  return chunks;
}

function runGitOrThrow(repoRoot, args, timeoutMs) {
  const result = runGit(repoRoot, args, timeoutMs);
  if (!result.ok) {
    const reason = safeString(result.stderr || result.stdout || result.error, 1000) || `exit ${result.status}`;
    throw new Error(`git ${args.join(" ")} failed: ${reason}`);
  }
  return result;
}

function hasStagedChanges(repoRoot, timeoutMs) {
  const result = runGit(repoRoot, ["diff", "--cached", "--quiet"], timeoutMs);
  return result.status === 1;
}

function resolveCommitMessage(options = {}) {
  return safeString(options.message, 120) || "chore(codex): close dirty baseline before next task";
}

function runAutoClose(options = {}) {
  const timeoutMs = Number(options.timeoutMs) || 45000;
  const plan = buildAutoClosePlan(options);
  const dryRun = Boolean(options.dryRun);
  const push = options.push !== false;
  const result = {
    schema: "repo-session-autoclose-result.v1",
    mode: "autoclose",
    startedAt: new Date().toISOString(),
    status: "NOT_RUN",
    dryRun: dryRun ? 1 : 0,
    plan,
    quarantined: [],
    stagedCount: 0,
    commit: {
      attempted: 0,
      status: "not_run",
      hash: "",
      message: resolveCommitMessage(options),
    },
    push: {
      attempted: 0,
      status: "not_run",
      upstream: safeString(plan.branch && plan.branch.upstream, 160),
    },
    finalReport: null,
  };

  if (!plan.canRun) {
    result.status = "BLOCKED";
    result.reason = plan.blockers.length ? "unsafe_dirty_state" : "repo_state_unavailable";
    result.completedAt = new Date().toISOString();
    return result;
  }
  if (dryRun) {
    result.status = plan.noChanges && !plan.pushNeeded ? "DRY_RUN_ALREADY_CLEAN" : "DRY_RUN_READY";
    result.completedAt = new Date().toISOString();
    return result;
  }

  result.quarantined = appendLocalExcludes(plan.repoRoot, plan.quarantineEntries);

  const trackedStageEntries = plan.stageEntries.filter((entry) => !isUntrackedEntry(entry));
  const untrackedStagePaths = plan.stageEntries
    .filter((entry) => isUntrackedEntry(entry))
    .map((entry) => normalizeRepoPath(entry.path))
    .filter(Boolean);
  if (trackedStageEntries.length > 0) {
    runGitOrThrow(plan.repoRoot, ["-c", "core.safecrlf=false", "add", "-u", "--", "."], timeoutMs);
    result.stagedCount += trackedStageEntries.length;
  }
  for (const chunk of chunkArray(untrackedStagePaths, 40)) {
    runGitOrThrow(plan.repoRoot, ["-c", "core.safecrlf=false", "add", "-A", "--", ...chunk], timeoutMs);
    result.stagedCount += chunk.length;
  }

  if (hasStagedChanges(plan.repoRoot, timeoutMs)) {
    result.commit.attempted = 1;
    runGitOrThrow(plan.repoRoot, ["commit", "-m", result.commit.message], timeoutMs);
    const hash = runGitOrThrow(plan.repoRoot, ["rev-parse", "HEAD"], timeoutMs);
    result.commit.status = "created";
    result.commit.hash = safeString(hash.stdout, 80);
  } else {
    result.commit.status = "skipped_no_staged_changes";
  }

  const afterCommit = buildCloseoutReport({ cwd: plan.repoRoot, timeoutMs });
  const shouldPush = push && afterCommit.branch && Number(afterCommit.branch.ahead) > 0;
  if (shouldPush) {
    if (!afterCommit.branch.upstream) {
      result.status = "BLOCKED";
      result.reason = "upstream_missing_after_commit";
      result.finalReport = afterCommit;
      result.completedAt = new Date().toISOString();
      return result;
    }
    result.push.attempted = 1;
    runGitOrThrow(plan.repoRoot, ["push"], timeoutMs);
    result.push.status = "pushed";
  } else {
    result.push.status = push ? "skipped_no_ahead_commits" : "skipped_by_option";
  }

  result.finalReport = buildCloseoutReport({ cwd: plan.repoRoot, timeoutMs });
  result.status = result.finalReport.cleanStartForNextSession ? "CLEAN_READY" : "PARTIAL";
  result.completedAt = new Date().toISOString();
  return result;
}

function buildPreflightReport(options = {}) {
  const observedAt = new Date().toISOString();
  const state = captureSessionGitState(options);
  const dirty = state.classifiedEntries.length > 0;
  const status = !state.ok ? "BLOCKED" : dirty ? "DIRTY_BASELINE" : "CLEAN";
  return {
    schema: "repo-session-preflight.v1",
    mode: "preflight",
    observedAt,
    status,
    cleanStartAllowed: state.ok && !dirty,
    cwd: state.cwd,
    repoRoot: state.repoRoot,
    branch: state.branch,
    counts: state.counts,
    entries: state.classifiedEntries,
    requiredAction: state.ok && !dirty ? "start_task" : "close_or_isolate_dirty_state_before_new_task",
    recommendations: buildRecommendations(state.classifiedEntries, "preflight", state.branch),
    commands: {
      inspect: "git status --porcelain=v2 --branch --untracked-files=all",
      startGate: "npm run repo:preflight",
      closeoutGate: "npm run repo:closeout",
    },
  };
}

function buildCloseoutReport(options = {}) {
  const observedAt = new Date().toISOString();
  const state = captureSessionGitState(options);
  const dirty = state.classifiedEntries.length > 0;
  const branch = state.branch || {};
  let status = "CLEAN_READY";
  if (!state.ok) {
    status = "BLOCKED";
  } else if (dirty) {
    status = "DIRTY_CLOSEOUT_BLOCKED";
  } else if (!branch.upstream) {
    status = "CLEAN_NO_UPSTREAM";
  } else if (Number(branch.behind) > 0) {
    status = "SYNC_REQUIRED";
  } else if (Number(branch.ahead) > 0) {
    status = "PUSH_REQUIRED";
  }

  return {
    schema: "repo-session-closeout.v1",
    mode: "closeout",
    observedAt,
    status,
    cleanStartForNextSession: status === "CLEAN_READY",
    cwd: state.cwd,
    repoRoot: state.repoRoot,
    branch,
    counts: state.counts,
    entries: state.classifiedEntries,
    requiredAction: status === "CLEAN_READY" ? "final_report_allowed" : "resolve_dirty_or_remote_sync_before_final_clean_claim",
    recommendations: buildRecommendations(state.classifiedEntries, "closeout", branch),
    commands: {
      inspect: "git status --porcelain=v2 --branch --untracked-files=all",
      preflightGate: "npm run repo:preflight",
      closeoutGate: "npm run repo:closeout",
    },
  };
}

function formatReport(report) {
  const lines = [];
  lines.push(`[repo-session] ${report.mode} status=${report.status}`);
  lines.push(`[repo-session] clean=${report.mode === "preflight" ? report.cleanStartAllowed : report.cleanStartForNextSession ? 1 : 0}`);
  if (report.branch && report.branch.name) {
    const upstream = report.branch.upstream || "none";
    lines.push(`[repo-session] branch=${report.branch.name} upstream=${upstream} ahead=${report.branch.ahead || 0} behind=${report.branch.behind || 0}`);
  }
  const counts = report.counts && report.counts.byClassification ? report.counts.byClassification : {};
  lines.push(`[repo-session] dirty_entries=${report.counts ? report.counts.total : 0} classifications=${JSON.stringify(counts)}`);
  for (const entry of (report.entries || []).slice(0, 40)) {
    lines.push(` - ${entry.code} ${entry.path} :: ${entry.classification} :: ${entry.action}`);
  }
  if ((report.entries || []).length > 40) {
    lines.push(` - ... ${(report.entries || []).length - 40} more`);
  }
  for (const recommendation of report.recommendations || []) {
    lines.push(`[repo-session] next=${recommendation}`);
  }
  return `${lines.join("\n")}\n`;
}

module.exports = {
  buildAutoClosePlan,
  buildCloseoutReport,
  buildPreflightReport,
  captureSessionGitState,
  classifySessionEntry,
  formatReport,
  normalizeRepoPath,
  parsePorcelainV2Status,
  runAutoClose,
  runGit,
};
