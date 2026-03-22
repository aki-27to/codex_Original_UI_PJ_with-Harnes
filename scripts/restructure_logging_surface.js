#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");

const workspaceRoot = path.resolve(__dirname, "..");
const {
  ensureDir,
  writeJson,
  getLoggingSurfacePaths,
  buildLogInventory,
  repoRelative,
  refreshCurrentLogSurface,
} = require("./lib/logging_surface");

function removePath(targetPath) {
  if (!targetPath || !fs.existsSync(targetPath)) return false;
  fs.rmSync(targetPath, { recursive: true, force: true });
  return true;
}

function movePath(sourcePath, destinationPath) {
  if (!sourcePath || !destinationPath || !fs.existsSync(sourcePath)) return false;
  ensureDir(path.dirname(destinationPath));
  if (fs.existsSync(destinationPath)) {
    const sourceStat = fs.statSync(sourcePath);
    const destinationStat = fs.statSync(destinationPath);
    if (sourceStat.isDirectory() && destinationStat.isDirectory()) {
      const entries = fs.readdirSync(sourcePath, { withFileTypes: true });
      for (const entry of entries) {
        movePath(path.join(sourcePath, entry.name), path.join(destinationPath, entry.name));
      }
      removePath(sourcePath);
      return true;
    }
    fs.rmSync(destinationPath, { recursive: true, force: true });
  }
  fs.renameSync(sourcePath, destinationPath);
  return true;
}

function safeStatBytes(targetPath) {
  try {
    return Math.max(0, Math.trunc(fs.statSync(targetPath).size || 0));
  } catch {
    return 0;
  }
}

function summarizePathStats(targetPath) {
  if (!targetPath || !fs.existsSync(targetPath)) {
    return { files: 0, directories: 0, bytes: 0 };
  }
  const stat = fs.statSync(targetPath);
  if (stat.isFile()) {
    return { files: 1, directories: 0, bytes: Math.max(0, Math.trunc(stat.size || 0)) };
  }
  let files = 0;
  let directories = 0;
  let bytes = 0;
  const stack = [targetPath];
  while (stack.length) {
    const current = stack.pop();
    const entries = fs.readdirSync(current, { withFileTypes: true });
    for (const entry of entries) {
      const entryPath = path.join(current, entry.name);
      const entryStat = fs.statSync(entryPath);
      if (entry.isDirectory()) {
        directories += 1;
        stack.push(entryPath);
      } else {
        files += 1;
        bytes += Math.max(0, Math.trunc(entryStat.size || 0));
      }
    }
  }
  return { files, directories, bytes };
}

function readJsonIfExists(targetPath) {
  if (!targetPath || !fs.existsSync(targetPath)) return null;
  try {
    return JSON.parse(fs.readFileSync(targetPath, "utf8"));
  } catch {
    return null;
  }
}

function safeString(value, max = 400) {
  if (typeof value !== "string") {
    if (value === null || value === undefined) return "";
    value = String(value);
  }
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, max) : "";
}

function parseTimestamp(value) {
  const numeric = Number(value);
  if (Number.isFinite(numeric) && numeric > 0) return Math.max(0, Math.trunc(numeric));
  const raw = safeString(value, 160);
  if (!raw) return 0;
  const parsed = Date.parse(raw);
  return Number.isFinite(parsed) && parsed > 0 ? Math.max(0, Math.trunc(parsed)) : 0;
}

function normalizeRelative(relativePath) {
  const raw = safeString(relativePath, 2000).replace(/\\/g, "/");
  if (!raw) return "";
  const workspacePrefix = `${workspaceRoot.replace(/\\/g, "/")}/`;
  if (raw.startsWith(workspacePrefix)) {
    return raw.slice(workspacePrefix.length);
  }
  return raw;
}
function isSignoffSummaryAllPassed(summary) {
  if (!summary || typeof summary !== "object") return false;
  if (typeof summary.allPassed !== "undefined") {
    return summary.allPassed === true || Number(summary.allPassed || 0) === 1;
  }
  return Boolean(summary.assertions && summary.assertions.allPassed);
}

function normalizeSignoffTransportMode(summary) {
  const raw = safeString(
    summary && (summary.transportMode || (summary.runtime && summary.runtime.transportMode)),
    80
  ).toLowerCase();
  if (!raw) return "";
  if (raw === "live" || raw === "stdio") return "stdio";
  if (raw === "mock" || raw === "fixture" || raw === "mock-fixture") return "mock-fixture";
  return raw;
}

function selectPreferredSignoffBundle(candidates) {
  const entries = Array.isArray(candidates) ? candidates.filter(Boolean) : [];
  if (!entries.length) return null;
  const latestPassingLive = entries.find((entry) =>
    isSignoffSummaryAllPassed(entry.summary)
    && normalizeSignoffTransportMode(entry.summary) === "stdio"
  );
  if (latestPassingLive) return latestPassingLive;
  const latestPassing = entries.find((entry) => isSignoffSummaryAllPassed(entry.summary));
  if (latestPassing) return latestPassing;
  const latestLive = entries.find((entry) => normalizeSignoffTransportMode(entry.summary) === "stdio");
  if (latestLive) return latestLive;
  return entries[0] || null;
}

function loadLatestSignoffBundleSummary(surface) {
  const signoffRoot = path.join(surface.bundlesRoot, "signoff");
  if (!fs.existsSync(signoffRoot)) return null;
  const candidates = fs.readdirSync(signoffRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => {
      const dirPath = path.join(signoffRoot, entry.name);
      const summaryPath = path.join(dirPath, "signoff_summary.json");
      if (!fs.existsSync(summaryPath)) return null;
      const summary = readJsonIfExists(summaryPath);
      return {
        dirPath,
        summaryPath,
        mtimeMs: Number(fs.statSync(summaryPath).mtimeMs || 0),
        summary,
        generatedAt: parseTimestamp(summary && summary.generatedAt),
      };
    })
    .filter(Boolean)
    .sort((left, right) => {
      const leftTime = left.generatedAt || left.mtimeMs || 0;
      const rightTime = right.generatedAt || right.mtimeMs || 0;
      if (rightTime !== leftTime) return rightTime - leftTime;
      if ((right.mtimeMs || 0) !== (left.mtimeMs || 0)) return (right.mtimeMs || 0) - (left.mtimeMs || 0);
      return String(right.dirPath || "").localeCompare(String(left.dirPath || ""));
    });
  return selectPreferredSignoffBundle(candidates);
}

function buildFixedLatestSignoffSummary({ latestSignoffSummary, latestBundle }) {
  const bundleRef = latestSignoffSummary && latestSignoffSummary.bundleRef && typeof latestSignoffSummary.bundleRef === "object"
    ? latestSignoffSummary.bundleRef
    : {};
  const bundlePath = bundleRef.bundlePath
    ? normalizeRelative(bundleRef.bundlePath)
    : latestSignoffSummary && latestSignoffSummary.bundlePath
      ? normalizeRelative(latestSignoffSummary.bundlePath)
    : latestBundle
      ? repoRelative(workspaceRoot, latestBundle.dirPath)
      : "";
  const summaryPath = bundleRef.summaryPath
    ? normalizeRelative(bundleRef.summaryPath)
    : latestSignoffSummary && latestSignoffSummary.summaryPath
      ? normalizeRelative(latestSignoffSummary.summaryPath)
    : latestBundle
      ? repoRelative(workspaceRoot, latestBundle.summaryPath)
      : "";
  const assertions = latestSignoffSummary && latestSignoffSummary.assertions && typeof latestSignoffSummary.assertions === "object"
    ? latestSignoffSummary.assertions
    : {};
  const runtime = latestSignoffSummary && latestSignoffSummary.runtime && typeof latestSignoffSummary.runtime === "object"
    ? latestSignoffSummary.runtime
    : {};
  const coreHarnessWorkflow = latestSignoffSummary && latestSignoffSummary.coreHarnessWorkflow && typeof latestSignoffSummary.coreHarnessWorkflow === "object"
    ? latestSignoffSummary.coreHarnessWorkflow
    : {};
  const runtimePostureSafe = Boolean(
    latestSignoffSummary && typeof latestSignoffSummary.runtimePostureSafe !== "undefined"
      ? latestSignoffSummary.runtimePostureSafe
      : assertions.runtimePostureSafe
  );
  const coreHarnessWorkflowPassed = Boolean(
    latestSignoffSummary && typeof latestSignoffSummary.coreHarnessWorkflowPassed !== "undefined"
      ? latestSignoffSummary.coreHarnessWorkflowPassed
      : Number(coreHarnessWorkflow.failedCases || 0) === 0
  );
  const naturalTaskTracePassed = Boolean(
    latestSignoffSummary && typeof latestSignoffSummary.naturalTaskTracePassed !== "undefined"
      ? latestSignoffSummary.naturalTaskTracePassed
      : assertions.naturalTaskTracePassed
  );
  const allPassed = isSignoffSummaryAllPassed(latestSignoffSummary)
    || Boolean(assertions.allPassed);
  const signoffReady = Boolean(
    latestSignoffSummary && typeof latestSignoffSummary.signoffReady !== "undefined"
      ? latestSignoffSummary.signoffReady
      : allPassed
  );
  const finalDecision = safeString(latestSignoffSummary && latestSignoffSummary.finalDecision, 80)
    || (signoffReady ? "RELEASE_APPROVED" : "RELEASE_BLOCKED");
  return {
    schema: "latest-signoff-summary.v3",
    generatedAt: new Date().toISOString(),
    allPassed,
    runtimePostureSafe,
    coreHarnessWorkflowPassed,
    naturalTaskTracePassed,
    signoffReady,
    bundleRef: {
      bundleName: safeString(bundleRef.bundleName || (latestBundle && path.basename(latestBundle.dirPath)), 160),
      bundlePath,
      summaryPath,
    },
    finalDecision,
  };
}

function buildFixedDesignConformanceSummary({ designConformanceSummary }) {
  const fixed = { schema: "design-conformance-summary.v3", generatedAt: new Date().toISOString() };
  const keys = [
    "defaultExecAgentIsDefault",
    "requestUserInputPolicyBlocked",
    "parentDispatchGuardEnforced",
    "retiredWorkerNotRoutable",
    "planningDepthSelectorWorking",
    "assuranceDepthSelectorWorking",
    "specialistDispatchObservedWhenImplementationOccurred",
    "reviewerObservedWhenRequired",
    "testerObservedWhenRequired",
    "taskOutcomeSemanticsValid",
    "docSyncEvidencePresentWhenRequired",
    "signoffCriteriaSatisfied",
    "overallDesignConformance",
  ];
  for (const key of keys) {
    const source = designConformanceSummary && designConformanceSummary[key] && typeof designConformanceSummary[key] === "object"
      ? designConformanceSummary[key]
      : {};
    fixed[key] = {
      status: safeString(source.status || source.passFail, 20) || "fail",
      reason: safeString(source.reason, 400),
      evidenceRef: normalizeRelative(source.evidenceRef || source.evidencePath || ""),
    };
  }
  return fixed;
}

function buildFixedLatestRunSummary({ latestRunSummary, fixedLatestSignoffSummary }) {
  const finalOutcome = latestRunSummary && latestRunSummary.finalOutcome && typeof latestRunSummary.finalOutcome === "object"
    ? latestRunSummary.finalOutcome
    : {};
  const existingEvidenceRefs = latestRunSummary && latestRunSummary.evidenceRefs && typeof latestRunSummary.evidenceRefs === "object"
    ? latestRunSummary.evidenceRefs
    : {};
  const signoffSummaryPath = normalizeRelative(
    existingEvidenceRefs.signoffSummaryPath
    || existingEvidenceRefs.signoffSummary
    || fixedLatestSignoffSummary.bundleRef.summaryPath
    || ""
  );
  const naturalTaskTraceSummaryPath = normalizeRelative(
    existingEvidenceRefs.naturalTaskTraceSummaryPath
    || existingEvidenceRefs.naturalTaskTraceSummary
    || (signoffSummaryPath ? path.posix.join(path.posix.dirname(signoffSummaryPath), "natural_task_trace_summary.json") : "")
  );
  const coreHarnessWorkflowRunPath = normalizeRelative(
    existingEvidenceRefs.coreHarnessWorkflowRunPath
    || existingEvidenceRefs.coreHarnessWorkflowRun
    || (signoffSummaryPath ? path.posix.join(path.posix.dirname(signoffSummaryPath), "core_harness_workflow_run.json") : "")
  );
  return {
    schema: "latest-run-summary.v3",
    generatedAt: new Date().toISOString(),
    runId: safeString(latestRunSummary && (latestRunSummary.runId || latestRunSummary.taskId || latestRunSummary.turnId), 160),
    threadId: safeString(latestRunSummary && latestRunSummary.threadId, 160),
    turnId: safeString(latestRunSummary && latestRunSummary.turnId, 160),
    selectedPlanningDepth: safeString(latestRunSummary && latestRunSummary.selectedPlanningDepth, 80),
    selectedAssuranceDepth: safeString(latestRunSummary && latestRunSummary.selectedAssuranceDepth, 80),
    finalOutcome,
    usedAgents: Array.isArray(latestRunSummary && latestRunSummary.usedAgents) ? latestRunSummary.usedAgents : [],
    usedPolicies: Array.isArray(latestRunSummary && latestRunSummary.usedPolicies) ? latestRunSummary.usedPolicies : [],
    usedContracts: Array.isArray(latestRunSummary && latestRunSummary.usedContracts) ? latestRunSummary.usedContracts : [],
    usedSkills: Array.isArray(latestRunSummary && latestRunSummary.usedSkills) ? latestRunSummary.usedSkills : [],
    dispatchCount: Number(latestRunSummary && latestRunSummary.dispatchCount || 0),
    dispatchSuccessCount: Number(latestRunSummary && latestRunSummary.dispatchSuccessCount || 0),
    implementationObserved: Boolean(latestRunSummary && latestRunSummary.implementationObserved),
    reviewerObserved: Boolean(latestRunSummary && latestRunSummary.reviewerObserved),
    testerObserved: Boolean(latestRunSummary && latestRunSummary.testerObserved),
    changedPaths: Array.isArray(latestRunSummary && latestRunSummary.changedPaths) ? latestRunSummary.changedPaths.map((entry) => normalizeRelative(entry)) : [],
    docSyncSummary: latestRunSummary && latestRunSummary.docSyncSummary && typeof latestRunSummary.docSyncSummary === "object"
      ? latestRunSummary.docSyncSummary
      : {},
    evidenceRefs: {
      bundlePath: normalizeRelative(fixedLatestSignoffSummary.bundleRef.bundlePath || existingEvidenceRefs.bundlePath || ""),
      signoffSummaryPath,
      naturalTaskTraceSummaryPath,
      coreHarnessWorkflowRunPath,
    },
    residualRisks: Array.isArray(latestRunSummary && latestRunSummary.residualRisks) ? latestRunSummary.residualRisks : [],
    informationalNotes: Array.isArray(latestRunSummary && latestRunSummary.informationalNotes) ? latestRunSummary.informationalNotes : [],
    assumptions: Array.isArray(latestRunSummary && latestRunSummary.assumptions) ? latestRunSummary.assumptions : [],
    operatorCaveats: Array.isArray(latestRunSummary && latestRunSummary.operatorCaveats) ? latestRunSummary.operatorCaveats : [],
    signoffRef: {
      allPassed: Boolean(fixedLatestSignoffSummary.allPassed),
      bundlePath: fixedLatestSignoffSummary.bundleRef.bundlePath,
      summaryPath: fixedLatestSignoffSummary.bundleRef.summaryPath,
    },
  };
}

function buildFixedReviewLoadBreakdown({ reviewLoadBreakdown }) {
  return {
    schema: "review-load-breakdown.v3",
    generatedAt: new Date().toISOString(),
    totalStep4DurationMs: Number(reviewLoadBreakdown && reviewLoadBreakdown.totalStep4DurationMs || 0),
    evidenceCollectionTimeMs: Number(reviewLoadBreakdown && reviewLoadBreakdown.evidenceCollectionTimeMs || 0),
    reviewerTimeMs: Number(reviewLoadBreakdown && reviewLoadBreakdown.reviewerTimeMs || 0),
    testerTimeMs: Number(reviewLoadBreakdown && reviewLoadBreakdown.testerTimeMs || 0),
    docSyncVerificationTimeMs: Number(reviewLoadBreakdown && reviewLoadBreakdown.docSyncVerificationTimeMs || 0),
    retryLoopCount: Number(reviewLoadBreakdown && reviewLoadBreakdown.retryLoopCount || 0),
    dominantBottleneck: safeString(reviewLoadBreakdown && reviewLoadBreakdown.dominantBottleneck, 80) || "none",
    timingModel: safeString(reviewLoadBreakdown && reviewLoadBreakdown.timingModel, 120) || "overlapping_estimates_with_wall_clock_total",
    componentTimesMayOverlap: Boolean(reviewLoadBreakdown && reviewLoadBreakdown.componentTimesMayOverlap),
    interpretationGuide: Array.isArray(reviewLoadBreakdown && reviewLoadBreakdown.interpretationGuide)
      ? reviewLoadBreakdown.interpretationGuide
      : [],
  };
}

function buildFixedOperatorSummary({ operatorSummary, fixedDesignConformanceSummary, fixedLatestRunSummary, fixedReviewLoadBreakdown, fixedLatestSignoffSummary }) {
  const postureSummarySource = operatorSummary && operatorSummary.postureSummary && typeof operatorSummary.postureSummary === "object"
    ? operatorSummary.postureSummary
    : operatorSummary && operatorSummary.posture && typeof operatorSummary.posture === "object"
      ? operatorSummary.posture
      : {};
  const designConformanceStatus = safeString(fixedDesignConformanceSummary.overallDesignConformance && fixedDesignConformanceSummary.overallDesignConformance.status, 20) || "fail";
  const latestRunStatus = safeString(
    fixedLatestRunSummary.finalOutcome && (fixedLatestRunSummary.finalOutcome.taskOutcomeStatus || fixedLatestRunSummary.finalOutcome.status),
    80
  ) || "UNKNOWN";
  const signoffStatus = fixedLatestSignoffSummary.allPassed ? "PASS" : "FAIL";
  const hasReviewLoadSummary =
    Number(fixedReviewLoadBreakdown.totalStep4DurationMs || 0) > 0
    || Number(fixedReviewLoadBreakdown.evidenceCollectionTimeMs || 0) > 0
    || Number(fixedReviewLoadBreakdown.reviewerTimeMs || 0) > 0
    || Number(fixedReviewLoadBreakdown.testerTimeMs || 0) > 0
    || Number(fixedReviewLoadBreakdown.docSyncVerificationTimeMs || 0) > 0
    || (safeString(fixedReviewLoadBreakdown.dominantBottleneck, 80) && safeString(fixedReviewLoadBreakdown.dominantBottleneck, 80) !== "none");
  const reviewLoadStatus = hasReviewLoadSummary ? "REVIEW_SUMMARY_AVAILABLE" : "MISSING";
  const recommendedDecision = fixedLatestSignoffSummary.signoffReady
    && designConformanceStatus === "pass"
    && latestRunStatus === "COMPLETED"
    ? "SAFE_TO_SIGNOFF"
    : latestRunStatus === "UNKNOWN" || reviewLoadStatus === "MISSING"
      ? "CURRENT_TRUTH_INCOMPLETE"
      : latestRunStatus === "COMPLETED"
        ? "REVIEW_BEFORE_SIGNOFF"
        : "DO_NOT_SIGNOFF";
  const topLineDecision = recommendedDecision;
  const whyThisIsSafe = [];
  if (latestRunStatus === "COMPLETED") whyThisIsSafe.push("Latest run completed.");
  if (designConformanceStatus === "pass") whyThisIsSafe.push("Design conformance checks are passing.");
  if (fixedLatestSignoffSummary.signoffReady) whyThisIsSafe.push("Latest signoff checks passed.");
  const whyThisMayNeedAttention = [];
  if (fixedLatestRunSummary.residualRisks.length) whyThisMayNeedAttention.push(`Residual risks: ${fixedLatestRunSummary.residualRisks.join("; ")}`);
  if (fixedLatestRunSummary.informationalNotes.length) whyThisMayNeedAttention.push(`Informational notes: ${fixedLatestRunSummary.informationalNotes.join("; ")}`);
  if (fixedReviewLoadBreakdown.dominantBottleneck && fixedReviewLoadBreakdown.dominantBottleneck !== "none") {
    whyThisMayNeedAttention.push(`Dominant Step 4 bottleneck: ${fixedReviewLoadBreakdown.dominantBottleneck}.`);
  }
  if (reviewLoadStatus === "MISSING") whyThisMayNeedAttention.push("Current review-load summary is missing.");
  if (designConformanceStatus !== "pass") whyThisMayNeedAttention.push("Design conformance summary is not fully passing.");
  if (!fixedLatestSignoffSummary.signoffReady) whyThisMayNeedAttention.push("Latest signoff bundle is not fully passing.");
  return {
    schema: "operator-summary.v3",
    generatedAt: new Date().toISOString(),
    topLineDecision,
    recommendedDecision,
    designConformanceStatus,
    latestRunStatus,
    signoffStatus,
    reviewLoadStatus,
    whyThisIsSafe,
    whyThisMayNeedAttention,
    openOnlyIfNeeded: [
      "logs/current/design_conformance_summary.json",
      "logs/current/latest_run_summary.json",
      "logs/current/review_load_breakdown.json",
      "logs/current/latest_signoff_summary.json",
      ...(fixedLatestSignoffSummary.bundleRef.bundlePath ? [fixedLatestSignoffSummary.bundleRef.bundlePath] : []),
    ],
    postureSummary: {
      loggingMode: safeString(postureSummarySource.loggingMode, 40),
      requestUserInputPolicy: safeString(postureSummarySource.requestUserInputPolicy, 40),
      parentDispatchGuardMode: safeString(postureSummarySource.parentDispatchGuardMode, 40),
      defaultExecAgent:
        designConformanceStatus === "pass"
          ? "default"
          : safeString(postureSummarySource.defaultExecAgent, 80),
      runtimePostureSafe: Boolean(postureSummarySource.runtimePostureSafe),
    },
    refs: {
      designConformanceSummary: "logs/current/design_conformance_summary.json",
      latestRunSummary: "logs/current/latest_run_summary.json",
      reviewLoadBreakdown: "logs/current/review_load_breakdown.json",
      latestSignoffSummary: "logs/current/latest_signoff_summary.json",
      bundlePath: fixedLatestSignoffSummary.bundleRef.bundlePath,
    },
  };
}

function rewriteCurrentSurfaceToFixedGoal({ surface }) {
  const currentRoot = surface.currentRoot;
  const operatorSummary = readJsonIfExists(path.join(currentRoot, "operator_summary.json")) || {};
  const designConformanceSummary = readJsonIfExists(path.join(currentRoot, "design_conformance_summary.json")) || {};
  const latestBundle = loadLatestSignoffBundleSummary(surface);
  const bundleLatestRunSummary = latestBundle
    ? readJsonIfExists(path.join(latestBundle.dirPath, "latest_run_summary.json")) || {}
    : {};
  const bundleReviewLoadBreakdown = latestBundle
    ? readJsonIfExists(path.join(latestBundle.dirPath, "review_load_breakdown.json")) || {}
    : {};
  const bundleSignoffSummary = latestBundle && latestBundle.summary && typeof latestBundle.summary === "object"
    ? latestBundle.summary
    : {};

  const fixedLatestSignoffSummary = buildFixedLatestSignoffSummary({ latestSignoffSummary: bundleSignoffSummary, latestBundle });
  const fixedDesignConformanceSummary = buildFixedDesignConformanceSummary({ designConformanceSummary });
  const fixedLatestRunSummary = buildFixedLatestRunSummary({ latestRunSummary: bundleLatestRunSummary, fixedLatestSignoffSummary });
  const fixedReviewLoadBreakdown = buildFixedReviewLoadBreakdown({ reviewLoadBreakdown: bundleReviewLoadBreakdown });
  const fixedOperatorSummary = buildFixedOperatorSummary({
    operatorSummary,
    fixedDesignConformanceSummary,
    fixedLatestRunSummary,
    fixedReviewLoadBreakdown,
    fixedLatestSignoffSummary,
  });

  writeJson(path.join(currentRoot, "operator_summary.json"), fixedOperatorSummary);
  writeJson(path.join(currentRoot, "design_conformance_summary.json"), fixedDesignConformanceSummary);
  writeJson(path.join(currentRoot, "latest_run_summary.json"), fixedLatestRunSummary);
  writeJson(path.join(currentRoot, "review_load_breakdown.json"), fixedReviewLoadBreakdown);
  writeJson(path.join(currentRoot, "latest_signoff_summary.json"), fixedLatestSignoffSummary);
  ["index.json", "runtime_snapshot.json", "conformance_report.json", "operator_view_summary.json"].forEach((name) => {
    const targetPath = path.join(currentRoot, name);
    if (fs.existsSync(targetPath)) fs.rmSync(targetPath, { force: true });
  });
}

function startsWithRelative(targetPath, prefix) {
  return normalizeRelative(targetPath).startsWith(normalizeRelative(prefix));
}

function countDirectChildren(targetPath) {
  if (!targetPath || !fs.existsSync(targetPath)) return 0;
  try {
    return fs.readdirSync(targetPath, { withFileTypes: true }).filter(Boolean).length;
  } catch {
    return 0;
  }
}

function listDirectChildren(targetPath) {
  if (!targetPath || !fs.existsSync(targetPath)) return [];
  try {
    return fs.readdirSync(targetPath, { withFileTypes: true })
      .filter(Boolean)
      .map((entry) => entry.name)
      .sort();
  } catch {
    return [];
  }
}

function countRelocatedBundleTopLevelEntries(signoffBundlesRoot) {
  if (!signoffBundlesRoot || !fs.existsSync(signoffBundlesRoot)) return 0;
  let count = 0;
  const bundles = fs.readdirSync(signoffBundlesRoot, { withFileTypes: true }).filter((entry) => entry.isDirectory());
  for (const bundle of bundles) {
    const relocatedRoot = path.join(signoffBundlesRoot, bundle.name, "raw", "relocated_top_level");
    count += countDirectChildren(relocatedRoot);
  }
  return count;
}

function buildReductionSummary({ before, after, actions, currentSurface, surface }) {
  const beforeEntries = Array.isArray(before && before.entries) ? before.entries : [];
  const afterEntries = Array.isArray(after && after.entries) ? after.entries : [];
  const beforePaths = new Set(beforeEntries.map((entry) => entry.relativePath));
  const afterPaths = new Set(afterEntries.map((entry) => entry.relativePath));
  const removedRootEntries = [...beforePaths].filter((entry) => !afterPaths.has(entry));
  const addedRootEntries = [...afterPaths].filter((entry) => !beforePaths.has(entry));
  const movedActions = actions.filter((entry) => entry.action === "moved");
  const deletedActions = actions.filter((entry) => entry.action === "deleted");
  const archivedActions = movedActions.filter((entry) => startsWithRelative(entry.destination, "logs/archive/"));
  const rawArchivedActions = archivedActions.filter((entry) => startsWithRelative(entry.destination, "logs/archive/raw/"));
  const legacyDeletedActions = deletedActions.filter((entry) => !startsWithRelative(entry.source, "logs/README.md"));
  const currentFiles = fs.existsSync(surface.currentRoot)
    ? fs.readdirSync(surface.currentRoot).sort().map((name) => `logs/current/${name}`.replace(/\\/g, "/"))
    : [];
  const currentDirectoryStats = summarizePathStats(surface.currentRoot);
  const legacyRootNames = listDirectChildren(path.join(surface.legacyRoot, "root_adhoc"));
  const removedCurrentNames = listDirectChildren(path.join(surface.legacyRoot, "current_removed"));
  const inferredLegacyRootEntries = countDirectChildren(path.join(surface.legacyRoot, "root_adhoc"));
  const inferredLegacyCurrentFiles = countDirectChildren(path.join(surface.legacyRoot, "current_removed"));
  const inferredRelocatedBundleTopLevelEntries = countRelocatedBundleTopLevelEntries(surface.signoffBundlesRoot);
  const rootEntriesAfterCount = afterEntries.length;
  const rootEntriesBeforeList = [
    ...legacyRootNames.map((name) => `logs/${name}`.replace(/\\/g, "/")),
    ...afterEntries.map((entry) => entry.relativePath),
  ];
  const rootEntriesAfterList = afterEntries.map((entry) => entry.relativePath);
  const currentFilesBeforeList = [
    ...removedCurrentNames.map((name) => `logs/current/${name}`.replace(/\\/g, "/")),
    ...currentFiles,
  ];
  const totalMovedByFixedGoal = inferredLegacyRootEntries + inferredLegacyCurrentFiles + inferredRelocatedBundleTopLevelEntries;
  return {
    rootEntriesBefore: rootEntriesBeforeList,
    rootEntriesAfter: rootEntriesAfterList,
    removedRootEntries: legacyRootNames.map((name) => `logs/${name}`.replace(/\\/g, "/")),
    addedRootEntries,
    rootEntriesReduced: inferredLegacyRootEntries,
    operatorSurfaceReduced: inferredLegacyCurrentFiles,
    rawArtifactsArchived: {
      count: rawArchivedActions.length,
      files: rawArchivedActions.reduce((sum, entry) => sum + Number(entry.filesTouched || 0), 0),
      bytes: rawArchivedActions.reduce((sum, entry) => sum + Number(entry.bytesTouched || 0), 0),
    },
    archivedArtifacts: {
      count: archivedActions.length,
      files: archivedActions.reduce((sum, entry) => sum + Number(entry.filesTouched || 0), 0),
      bytes: archivedActions.reduce((sum, entry) => sum + Number(entry.bytesTouched || 0), 0),
    },
    legacyArtifactsDeleted: {
      count: legacyDeletedActions.length,
      files: deletedActions.reduce((sum, entry) => sum + Number(entry.filesTouched || 0), 0),
      bytes: deletedActions.reduce((sum, entry) => sum + Number(entry.deletedBytes || 0), 0),
    },
    movedCount: totalMovedByFixedGoal,
    deletedCount: deletedActions.length,
    sizeDeltaBytes: Number((after && after.totals && after.totals.bytes) || 0) - Number((before && before.totals && before.totals.bytes) || 0),
    currentSurface: {
      currentFileCount: currentDirectoryStats.files,
      routineHumanReviewFileCount: currentFiles.length,
      routineHumanReviewFiles: currentFiles,
      routineHumanReviewFilesBefore: currentFilesBeforeList,
      routineHumanReviewFilesReducedBy: inferredLegacyCurrentFiles,
      optionalDetailFiles: [],
    },
    reductionEvidence: {
      derivedFromArchivedEvidence: true,
      signoffBundleDisallowedTopLevelEntriesReducedBy: inferredRelocatedBundleTopLevelEntries,
    },
  };
}

function removeEmptyDirectories(targetPath, floorPath) {
  if (!targetPath || !fs.existsSync(targetPath)) return;
  const resolvedFloor = path.resolve(floorPath);
  let current = path.resolve(targetPath);
  while (current.startsWith(resolvedFloor)) {
    if (current === resolvedFloor) break;
    let entries = [];
    try {
      entries = fs.readdirSync(current);
    } catch {
      break;
    }
    if (entries.length > 0) break;
    fs.rmdirSync(current);
    current = path.dirname(current);
  }
}

function migrateLogs() {
  const surface = getLoggingSurfacePaths(workspaceRoot);
  ensureDir(surface.logsRoot);
  ensureDir(surface.currentRoot);
  ensureDir(surface.signoffBundlesRoot);
  ensureDir(surface.proofBundlesRoot);
  ensureDir(surface.replayBundlesRoot);
  ensureDir(surface.adminRoot);
  ensureDir(surface.archiveOperationLogsRoot);
  ensureDir(surface.archiveTurnsRoot);
  ensureDir(surface.archiveTestProofsRoot);
  ensureDir(surface.archiveBaselineComparisonRoot);
  ensureDir(surface.archiveLegacyMiscRoot);
  ensureDir(surface.runtimeStateRoot);

  const actions = [];

  function moveEntry(relativeSource, relativeDestination, reason) {
    const sourcePath = path.join(surface.logsRoot, relativeSource);
    const destinationPath = path.join(surface.logsRoot, relativeDestination);
    if (!fs.existsSync(sourcePath)) return;
    const sourceStats = summarizePathStats(sourcePath);
    movePath(sourcePath, destinationPath);
    actions.push({
      action: "moved",
      source: `logs/${relativeSource}`.replace(/\\/g, "/"),
      destination: `logs/${relativeDestination}`.replace(/\\/g, "/"),
      reason,
      filesTouched: sourceStats.files,
      directoriesTouched: sourceStats.directories,
      bytesTouched: sourceStats.bytes,
    });
    removeEmptyDirectories(path.dirname(sourcePath), surface.logsRoot);
  }

  function deleteEntry(relativeSource, reason) {
    const sourcePath = path.join(surface.logsRoot, relativeSource);
    if (!fs.existsSync(sourcePath)) return;
    const deletedStats = summarizePathStats(sourcePath);
    removePath(sourcePath);
    actions.push({
      action: "deleted",
      source: `logs/${relativeSource}`.replace(/\\/g, "/"),
      destination: null,
      reason,
      filesTouched: deletedStats.files,
      directoriesTouched: deletedStats.directories,
      deletedBytes: deletedStats.bytes,
    });
    removeEmptyDirectories(path.dirname(sourcePath), surface.logsRoot);
  }

  function moveCurrentDisallowedFile(fileName, reason) {
    const sourcePath = path.join(surface.currentRoot, fileName);
    if (!fs.existsSync(sourcePath)) return;
    const destinationPath = path.join(surface.legacyRoot, "current_removed", fileName);
    const sourceStats = summarizePathStats(sourcePath);
    movePath(sourcePath, destinationPath);
    actions.push({
      action: "moved",
      source: `logs/current/${fileName}`.replace(/\\/g, "/"),
      destination: repoRelative(workspaceRoot, destinationPath),
      reason,
      filesTouched: sourceStats.files,
      directoriesTouched: sourceStats.directories,
      bytesTouched: sourceStats.bytes,
    });
  }

  function sanitizeSignoffBundleTopLevel(bundleRoot) {
    if (!bundleRoot || !fs.existsSync(bundleRoot)) return;
    const allowed = new Set([
      "signoff_summary.json",
      "runtime_snapshot.json",
      "core_harness_workflow_run.json",
      "natural_task_trace_summary.json",
      "latest_run_summary.json",
      "review_load_breakdown.json",
      "conformance_report.json",
      "operator_view_summary.json",
      "bundle_surface_map.json",
      "raw",
    ]);
    const entries = fs.readdirSync(bundleRoot, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry || !entry.name || allowed.has(entry.name)) continue;
      const sourcePath = path.join(bundleRoot, entry.name);
      const destinationPath = path.join(bundleRoot, "raw", "relocated_top_level", entry.name);
      const sourceStats = summarizePathStats(sourcePath);
      movePath(sourcePath, destinationPath);
      actions.push({
        action: "moved",
        source: repoRelative(workspaceRoot, sourcePath),
        destination: repoRelative(workspaceRoot, destinationPath),
        reason: "signoff bundle top-level must remain summary-first; non-summary entries belong under raw/",
        filesTouched: sourceStats.files,
        directoriesTouched: sourceStats.directories,
        bytesTouched: sourceStats.bytes,
      });
    }
  }

  moveEntry("signoff-bundles", path.join("bundles", "signoff"), "signoff bundles belong under logs/bundles/signoff");
  moveEntry("proofs", path.join("bundles", "proof"), "runtime proofs belong under logs/bundles/proof");
  moveEntry("turns", path.join("archive", "raw", "turns"), "raw turn artifacts should not stay on the active operator surface");
  deleteEntry("test-proofs", "legacy test-only proof folders should be removed from the active log surface");
  deleteEntry("baseline-comparison", "baseline comparison reports are duplicate surfaces already stored inside signoff bundles");
  moveEntry("harness_execution_memory.json", path.join("archive", "raw", "harness_execution_memory.json"), "runtime state should live under archive/raw");
  moveEntry("eval_runs.jsonl", path.join("archive", "raw", "eval_runs.jsonl"), "eval history should live under archive/raw");
  moveEntry("conversation_persona_memory.json", path.join("archive", "raw", "runtime_state", "conversation_persona_memory.json"), "conversation persona memory should live under archive/raw/runtime_state");
  moveEntry("fixtures", path.join("archive", "raw", "fixtures"), "fixture workspaces should stay off the active root log surface");
  moveEntry("log_inventory_before.json", path.join("archive", "admin", "log_inventory_before.json"), "migration inventory should live under archive/admin");
  moveEntry("log_inventory_after.json", path.join("archive", "admin", "log_inventory_after.json"), "migration inventory should live under archive/admin");
  moveEntry("log_deletion_report.json", path.join("archive", "admin", "log_deletion_report.json"), "migration reports should live under archive/admin");
  deleteEntry("README.md", "root logs README is redundant once operator_summary.json becomes the only human-first entrypoint");

  const rootEntries = fs.existsSync(surface.logsRoot)
    ? fs.readdirSync(surface.logsRoot, { withFileTypes: true }).filter((entry) => entry && entry.isFile())
    : [];
  for (const entry of rootEntries) {
    if (!/^codex_ops(?:[_-].+)?\.jsonl(?:\.gz)?$/i.test(entry.name)) continue;
    moveEntry(entry.name, path.join("archive", "raw", "operation_logs", entry.name), "raw operation logs are archive-only by default");
  }

  moveEntry(path.join("archive", "raw", "runtime_state", "harness_execution_memory.json"), path.join("archive", "raw", "harness_execution_memory.json"), "runtime state should live under archive/raw");
  moveEntry(path.join("archive", "raw", "runtime_state", "eval_runs.jsonl"), path.join("archive", "raw", "eval_runs.jsonl"), "eval history should live under archive/raw");

  const currentDisallowed = ["index.json", "runtime_snapshot.json", "conformance_report.json", "operator_view_summary.json"];
  currentDisallowed.forEach((name) => {
    moveCurrentDisallowedFile(name, "current operator surface is fixed to five summary files only");
  });

  const signoffBundles = fs.existsSync(surface.signoffBundlesRoot)
    ? fs.readdirSync(surface.signoffBundlesRoot, { withFileTypes: true }).filter((entry) => entry.isDirectory())
    : [];
  for (const entry of signoffBundles) {
    sanitizeSignoffBundleTopLevel(path.join(surface.signoffBundlesRoot, entry.name));
  }

  const finalRootEntries = fs.existsSync(surface.logsRoot)
    ? fs.readdirSync(surface.logsRoot, { withFileTypes: true }).filter((entry) => entry && entry.name !== "current" && entry.name !== "bundles" && entry.name !== "archive")
    : [];
  for (const entry of finalRootEntries) {
    const sourcePath = path.join(surface.logsRoot, entry.name);
    const destinationPath = path.join(surface.legacyRoot, "root_adhoc", entry.name);
    const sourceStats = summarizePathStats(sourcePath);
    movePath(sourcePath, destinationPath);
    actions.push({
      action: "moved",
      source: `logs/${entry.name}`.replace(/\\/g, "/"),
      destination: repoRelative(workspaceRoot, destinationPath),
      reason: "logs/ root is fixed to current, bundles, and archive only",
      filesTouched: sourceStats.files,
      directoriesTouched: sourceStats.directories,
      bytesTouched: sourceStats.bytes,
    });
  }

  return { surface, actions };
}

function main() {
  const surface = getLoggingSurfacePaths(workspaceRoot);
  ensureDir(surface.logsRoot);
  const before = buildLogInventory(workspaceRoot);
  writeJson(surface.inventoryBeforePath, before);

  const migration = migrateLogs();
  const currentSurface = refreshCurrentLogSurface({ workspaceRoot });
  rewriteCurrentSurfaceToFixedGoal({ surface });
  const after = buildLogInventory(workspaceRoot);
  writeJson(surface.inventoryAfterPath, after);
  const reductionSummary = buildReductionSummary({
    before,
    after,
    actions: migration.actions,
    currentSurface,
    surface,
  });

  const report = {
    schema: "log-deletion-report.v3",
    generatedAt: new Date().toISOString(),
    workspaceRoot,
    beforePath: repoRelative(workspaceRoot, surface.inventoryBeforePath),
    afterPath: repoRelative(workspaceRoot, surface.inventoryAfterPath),
    actions: migration.actions,
    summary: reductionSummary,
    currentSurface: {
      operatorSummaryPath: repoRelative(workspaceRoot, currentSurface.operatorSummaryPath),
      designConformancePath: repoRelative(workspaceRoot, currentSurface.designConformancePath),
      latestRunPath: repoRelative(workspaceRoot, currentSurface.latestRunPath),
      reviewLoadPath: repoRelative(workspaceRoot, currentSurface.reviewLoadPath),
      latestSignoffPath: repoRelative(workspaceRoot, currentSurface.latestSignoffPath),
    },
  };
  writeJson(surface.deletionReportPath, report);
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}

main();
