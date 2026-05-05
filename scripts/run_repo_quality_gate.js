#!/usr/bin/env node
"use strict";

const path = require("path");
const { spawnSync } = require("child_process");
const { runPackageScriptSync } = require("./lib/process_invocation");

const workspaceRoot = path.resolve(__dirname, "..");

const stages = Object.freeze([
  {
    id: "governance",
    label: "repo-quality:governance",
    scripts: [
      "test:document-tooling",
      "test:harness-overview",
      "test:authority-registry",
      "test:l0-l1-governance-surface",
      "test:l2-l4-governance-surface",
      "test:deployment-posture",
      "test:iteration-control",
      "test:adoption-readiness",
      "test:completion-readiness-authority",
      "test:user-facing-response-policy",
      "test:governance-bundle",
      "test:single-harness-multi-plane",
      "test:eval-lane-policy-path-length",
      "test:bounded-multi-agent-simulator-mode",
      "test:self-improvement-governance",
      "test:repo-local-skills",
      "test:mcp-tool-registry-alignment",
      "test:docs:drift",
      "test:github-governance-surface",
      "test:system-coherence",
      "test:request-handler-context-split",
      "test:route-services-split",
      "test:traceability-service-split",
      "test:harness-overview-snapshot-service-split",
      "test:current-log-surface-service-split",
      "test:control-overview-service-split",
      "test:current-surface-service-split",
      "test:repo-quality:structure",
    ],
  },
  {
    id: "runtime",
    label: "repo-quality:runtime",
    scripts: [
      "test:server-request-guards",
      "test:app-server-transport-resilience",
      "test:conversation-voice-service-split",
      "test:replay-app-service-split",
      "test:app-platform-read-surface-security",
      "test:english-standalone-static-security",
      "test:harnesui-duplicate-submit-guard",
      "test:harnesui-control-state-guard",
      "test:harnesui-pending-state",
      "test:harnesui-turn-snapshot",
      "test:runtime-active-turn-cleanup",
      "test:runtime-state-service",
      "test:playwright-mcp",
    ],
  },
  {
    id: "surfaces",
    label: "repo-quality:surfaces",
    scripts: [
      "test:repo-hygiene:static",
      "test:housekeeping:runtime-surface",
      "test:housekeeping:output-surface",
      "test:housekeeping:output-git-policy",
      "test:harness-artifact-mcp",
      "current-surface-truth",
      {
        id: "godot-tetris-visual-guard",
        file: "scripts/godot_tetris_visual_guard_test.js",
      },
    ],
  },
]);

function runScript(entry) {
  if (entry && typeof entry === "object") {
    const scriptPath = path.join(workspaceRoot, entry.file);
    return spawnSync(process.execPath, [scriptPath], {
      cwd: workspaceRoot,
      stdio: "inherit",
      windowsHide: true,
    });
  }
  const name = entry;
  if (name === "current-surface-truth") {
    return runPackageScriptSync("current-surface-truth", {
      cwd: workspaceRoot,
      stdio: "inherit",
    });
  }
  return runPackageScriptSync(name, {
    cwd: workspaceRoot,
    stdio: "inherit",
  });
}

function runGit(args) {
  return spawnSync("git", args, {
    cwd: workspaceRoot,
    encoding: "utf8",
    windowsHide: true,
  });
}

function captureTrackedDiffNames() {
  const names = new Set();
  for (const args of [["diff", "--name-only"], ["diff", "--cached", "--name-only"]]) {
    const result = runGit(args);
    if (result.status !== 0) {
      continue;
    }
    for (const line of String(result.stdout || "").split(/\r?\n/)) {
      const normalized = line.trim().replace(/\\/g, "/");
      if (normalized) {
        names.add(normalized);
      }
    }
  }
  return names;
}

function findNewTrackedDiffNames(before) {
  const after = captureTrackedDiffNames();
  return [...after].filter((name) => !before.has(name)).sort();
}

function main() {
  const requestedStage = String(process.argv[2] || "").trim().toLowerCase();
  const selectedStages = requestedStage
    ? stages.filter((stage) => stage.id === requestedStage)
    : stages;
  if (!selectedStages.length) {
    console.error(`[repo-quality] unknown stage: ${requestedStage}`);
    process.exit(1);
  }
  for (const stage of selectedStages) {
    console.log(`[repo-quality] start ${stage.label}`);
    for (const scriptEntry of stage.scripts) {
      const scriptLabel = typeof scriptEntry === "string" ? scriptEntry : scriptEntry.id || scriptEntry.file;
      const trackedDiffBefore = captureTrackedDiffNames();
      const result = runScript(scriptEntry);
      if (result.status !== 0) {
        console.error(`[repo-quality] fail ${stage.label} at ${scriptLabel}`);
        process.exit(result.status || 1);
      }
      const newTrackedDiffs = findNewTrackedDiffNames(trackedDiffBefore);
      if (newTrackedDiffs.length) {
        console.error(`[repo-quality] fail ${stage.label} at ${scriptLabel}: tracked files changed during validation`);
        for (const name of newTrackedDiffs.slice(0, 40)) {
          console.error(` - ${name}`);
        }
        if (newTrackedDiffs.length > 40) {
          console.error(` - ... ${newTrackedDiffs.length - 40} more`);
        }
        process.exit(1);
      }
    }
    console.log(`[repo-quality] pass ${stage.label}`);
  }
}

main();
