"use strict";

const { spawnSync } = require("child_process");

function defaultSafeString(value, max = 12000) {
  if (typeof value !== "string") return "";
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, max) : "";
}

function normalizeRepoTruthRelativePath(value, safeString) {
  return safeString(value, 500).replace(/\\/g, "/").replace(/^\.\//, "");
}

function createRepoTruthRuntimeSnapshotService(deps = {}) {
  const {
    workspaceRoot,
    gitAutomationConfig = {},
    ignoredPaths = [],
    captureGitRepoState,
    safeString = defaultSafeString,
    spawnSyncRef = spawnSync,
  } = deps;

  function classifyRepoTruthDirtyEntry(entry) {
    const relativePath = normalizeRepoTruthRelativePath(entry && entry.path, safeString);
    const status = safeString(entry && entry.code, 10) || "";
    let classification = "unorganized_diff";
    let surface = "dirty_working_tree";
    let reason = "Path is outside the known source, docs, config, runtime, or generated-output surfaces.";
    if (/^(output)\//i.test(relativePath)) {
      classification = "generated_side_effect";
      surface = "generated_output";
      reason = "Tracked output artifact; report separately from source/docs changes.";
    } else if (/^(logs|runtime)\//i.test(relativePath)) {
      classification = "generated_side_effect";
      surface = "live_runtime_output";
      reason = "Runtime/log artifact; report separately from HEAD and source/docs changes.";
    } else if (/^(server|scripts|web|docs|APP|tools|\.agents|\.codex|\.github)\//i.test(relativePath) || /^(AGENTS\.md|README\.md|package\.json|package-lock\.json|server\.js|server_impl\.js|start_codex_ui\.bat)$/i.test(relativePath)) {
      classification = "intended_change_candidate";
      surface = "source_or_docs_working_tree";
      reason = "Source, docs, config, or test path; treat as candidate intended work until the final report classifies it.";
    }
    return {
      path: relativePath,
      status,
      classification,
      surface,
      reason,
    };
  }

  function countRepoTruthClassifications(entries, key) {
    const counts = {};
    for (const entry of Array.isArray(entries) ? entries : []) {
      const value = safeString(entry && entry[key], 80) || "unknown";
      counts[value] = (counts[value] || 0) + 1;
    }
    return counts;
  }

  function runRepoTruthGit(args, timeoutMs = 2500) {
    const startedAt = Date.now();
    let result;
    try {
      result = spawnSyncRef("git", ["-C", workspaceRoot, ...(Array.isArray(args) ? args : [])], {
        windowsHide: true,
        encoding: "utf8",
        timeout: Math.max(500, Math.trunc(Number(timeoutMs) || 2500)),
        maxBuffer: 1024 * 1024,
      });
    } catch (error) {
      return {
        ok: false,
        stdout: "",
        stderr: "",
        status: null,
        error: error instanceof Error ? error.message : String(error),
        durationMs: Math.max(0, Date.now() - startedAt),
      };
    }
    const stdout = typeof result.stdout === "string" ? result.stdout : "";
    const stderr = typeof result.stderr === "string" ? result.stderr : "";
    return {
      ok: !result.error && Number.isInteger(result.status) && result.status === 0,
      stdout,
      stderr,
      status: Number.isInteger(result.status) ? result.status : null,
      error: result.error ? result.error.message : "",
      timedOut: result.error && result.error.code === "ETIMEDOUT",
      durationMs: Math.max(0, Date.now() - startedAt),
    };
  }

  function repoTruthGitText(args, timeoutMs = 2500) {
    const result = runRepoTruthGit(args, timeoutMs);
    return {
      ok: result.ok,
      value: result.ok ? safeString(result.stdout, 4000) : "",
      reason: result.ok ? "" : safeString(result.stderr || result.error, 4000),
      durationMs: result.durationMs,
    };
  }

  function buildRepoTruthRuntimeSnapshot(options = {}) {
    const observedAt = safeString(options && options.observedAt, 80) || new Date().toISOString();
    const remoteName = safeString(gitAutomationConfig && gitAutomationConfig.remoteName, 80) || "origin";
    const repoState = typeof captureGitRepoState === "function"
      ? captureGitRepoState({
        cwd: workspaceRoot,
        remoteName,
        timeoutMs: 2500,
        ignoredPaths,
      })
      : null;
    const branch = safeString(repoState && repoState.branch, 120) || repoTruthGitText(["branch", "--show-current"]).value;
    const originRef = `${remoteName}/${branch || "main"}`;
    const head = repoTruthGitText(["rev-parse", "HEAD"]);
    const headShort = repoTruthGitText(["rev-parse", "--short=12", "HEAD"]);
    let origin = repoTruthGitText(["rev-parse", originRef]);
    let resolvedOriginRef = originRef;
    if (!origin.ok && originRef !== `${remoteName}/main`) {
      const fallbackOrigin = repoTruthGitText(["rev-parse", `${remoteName}/main`]);
      if (fallbackOrigin.ok) {
        origin = fallbackOrigin;
        resolvedOriginRef = `${remoteName}/main`;
      }
    }
    const originShort = origin.ok ? repoTruthGitText(["rev-parse", "--short=12", resolvedOriginRef]) : { ok: false, value: "", reason: origin.reason };
    const statusShort = repoTruthGitText(["status", "--short", "--branch"], 3000);
    const classifiedEntries = Array.isArray(repoState && repoState.entries)
      ? repoState.entries.map((entry) => classifyRepoTruthDirtyEntry(entry))
      : [];
    const generatedEntries = classifiedEntries.filter((entry) => entry.classification === "generated_side_effect");
    const candidateEntries = classifiedEntries.filter((entry) => entry.classification === "intended_change_candidate");
    const unorganizedEntries = classifiedEntries.filter((entry) => entry.classification === "unorganized_diff");
    const dirty = repoState && repoState.dirty ? 1 : 0;
    const headCommit = head.value || "";
    const originCommit = origin.value || "";
    return {
      schema: "repo-truth-snapshot.v1",
      scope: "current_repo_truth",
      observedAt,
      liveVerificationTimestamp: observedAt,
      readOnly: 1,
      noWriteCommands: ["git status --short --branch", "git rev-parse HEAD", `git rev-parse ${resolvedOriginRef}`],
      finalReportCheckCommand: "git status --short --branch",
      truthSurfaces: {
        head: "HEAD",
        dirtyWorkingTree: "dirty_working_tree",
        liveRuntime: "live_runtime",
        generatedOutput: "generated_output",
      },
      head: {
        scope: "HEAD",
        commit: headCommit,
        shortCommit: headShort.value || "",
        branch,
        available: head.ok ? 1 : 0,
        reason: head.reason || "",
      },
      origin: {
        scope: "origin",
        remoteName,
        ref: resolvedOriginRef,
        commit: originCommit,
        shortCommit: originShort.value || "",
        available: origin.ok ? 1 : 0,
        reason: origin.reason || "",
      },
      headEqualsOrigin: head.ok && origin.ok ? headCommit === originCommit : null,
      dirtyState: dirty ? "dirty" : "clean",
      dirtyWorkingTree: {
        scope: "dirty_working_tree",
        dirty,
        repoDetected: repoState && repoState.repoDetected ? 1 : 0,
        gitAvailable: repoState && repoState.gitAvailable ? 1 : 0,
        reason: safeString(repoState && repoState.reason, 120) || "",
        statusShort: statusShort.value || "",
        entryCount: classifiedEntries.length,
        classificationCounts: countRepoTruthClassifications(classifiedEntries, "classification"),
        surfaceCounts: countRepoTruthClassifications(classifiedEntries, "surface"),
        entries: classifiedEntries.slice(0, 40),
      },
      generatedOutput: {
        scope: "generated_output",
        dirtyEntryCount: generatedEntries.length,
        entries: generatedEntries.slice(0, 40),
      },
      intendedChangeCandidates: {
        scope: "source_or_docs_working_tree",
        dirtyEntryCount: candidateEntries.length,
        entries: candidateEntries.slice(0, 40),
      },
      unorganizedDiff: {
        scope: "unorganized_diff",
        dirtyEntryCount: unorganizedEntries.length,
        entries: unorganizedEntries.slice(0, 40),
      },
    };
  }

  return {
    buildRepoTruthRuntimeSnapshot,
    classifyRepoTruthDirtyEntry,
    countRepoTruthClassifications,
  };
}

module.exports = {
  createRepoTruthRuntimeSnapshotService,
};
