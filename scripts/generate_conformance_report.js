#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const { getLoggingSurfacePaths } = require("./lib/logging_surface");
const { buildConformanceReport, loadOptionalJson, repoRelative } = require("./lib/constitution_conformance");

const workspaceRoot = path.resolve(__dirname, "..");
const loggingSurfacePaths = getLoggingSurfacePaths(workspaceRoot);

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function resolveBundleRoot() {
  const explicit = typeof process.argv[2] === "string" ? process.argv[2].trim() : "";
  return explicit ? path.resolve(workspaceRoot, explicit) : "";
}

function buildFromBundle(bundleRoot) {
  const signoffSummary = loadOptionalJson(path.join(bundleRoot, "signoff_summary.json")) || {};
  const latestRunSummary = loadOptionalJson(path.join(bundleRoot, "latest_run_summary.json")) || {};
  const reviewLoadBreakdown = loadOptionalJson(path.join(bundleRoot, "review_load_breakdown.json")) || {};
  const traceSummary =
    loadOptionalJson(path.join(bundleRoot, "natural_task_trace_summary.json")) ||
    loadOptionalJson(path.join(bundleRoot, "signoff_task_trace_summary.json")) ||
    loadOptionalJson(path.join(bundleRoot, "discovery_task_trace_summary.json")) ||
    {};
  const evidenceManifest = traceSummary && traceSummary.evidenceManifest && typeof traceSummary.evidenceManifest === "object"
    ? traceSummary.evidenceManifest
    : {};
  const flowTrace = traceSummary && traceSummary.flowTraceSummary && typeof traceSummary.flowTraceSummary === "object"
    ? traceSummary.flowTraceSummary
    : {};
  const report = buildConformanceReport({
    latestRunSummary,
    signoffSummary,
    selection: {
      selectedMode: flowTrace.selectedPlanningMode,
      selectedPlanningDepth: flowTrace.selectedPlanningDepth,
      selectedAssuranceDepth: flowTrace.selectedAssuranceDepth,
      planningReasons: flowTrace.planningModeReasons,
      assuranceReasons: flowTrace.assuranceDepthReasons,
      planningScoreBreakdown: flowTrace.planningScoreBreakdown,
      assuranceScoreBreakdown: flowTrace.assuranceScoreBreakdown,
    },
    requirementContract: evidenceManifest.requirementContract,
    dispatchPlan: evidenceManifest.dispatchPlan,
    childEvidenceLedger: flowTrace.childEvidenceLedger,
    acceptanceResults: evidenceManifest.acceptanceResults,
    requiredEvidenceFailures: reviewLoadBreakdown.requiredEvidenceFailures,
    evidenceRefs: [
      repoRelative(path.join(bundleRoot, "signoff_summary.json")),
      repoRelative(path.join(bundleRoot, "latest_run_summary.json")),
      repoRelative(path.join(bundleRoot, "review_load_breakdown.json")),
    ],
    replayBundleRefs: traceSummary && traceSummary.replay ? [repoRelative(path.join(bundleRoot, "raw"))] : [],
    rationaleNotes: [
      `transportMode=${signoffSummary.transportMode || "unknown"}`,
      `baselineTransportMode=${signoffSummary.baselineTransportMode || "unknown"}`,
    ],
  });
  const outputPath = path.join(bundleRoot, "conformance_report.json");
  writeJson(outputPath, report);
  return { outputPath, report };
}

function buildFromCurrent() {
  const latestRunSummary = loadOptionalJson(loggingSurfacePaths.currentLatestRunSummaryPath) || {};
  const latestSignoffSummary = loadOptionalJson(loggingSurfacePaths.currentLatestSignoffSummaryPath) || {};
  const reviewLoadBreakdown = loadOptionalJson(loggingSurfacePaths.currentReviewLoadBreakdownPath) || {};
  const runtimeSnapshot = loadOptionalJson(loggingSurfacePaths.currentRuntimeSnapshotPath) || {};
  const signoffBundlePath =
    latestSignoffSummary &&
    latestSignoffSummary.bundleRef &&
    typeof latestSignoffSummary.bundleRef.bundlePath === "string"
      ? path.resolve(workspaceRoot, latestSignoffSummary.bundleRef.bundlePath)
      : "";
  const bundleReport = signoffBundlePath ? buildFromBundle(signoffBundlePath).report : null;
  const report = bundleReport || buildConformanceReport({
    latestRunSummary,
    signoffSummary: latestSignoffSummary,
    requiredEvidenceFailures: reviewLoadBreakdown.requiredEvidenceFailures,
    evidenceRefs: [
      repoRelative(loggingSurfacePaths.currentLatestRunSummaryPath),
      repoRelative(loggingSurfacePaths.currentReviewLoadBreakdownPath),
      repoRelative(loggingSurfacePaths.currentLatestSignoffSummaryPath),
    ],
    rationaleNotes: [
      `runtimeSnapshot=${runtimeSnapshot && runtimeSnapshot.schema ? runtimeSnapshot.schema : "unavailable"}`,
    ],
  });
  writeJson(loggingSurfacePaths.currentRoot ? path.join(loggingSurfacePaths.currentRoot, "conformance_report.json") : path.join(workspaceRoot, "logs", "current", "conformance_report.json"), report);
  return {
    outputPath: path.join(loggingSurfacePaths.currentRoot, "conformance_report.json"),
    report,
  };
}

function main() {
  const bundleRoot = resolveBundleRoot();
  const result = bundleRoot ? buildFromBundle(bundleRoot) : buildFromCurrent();
  console.log(JSON.stringify({ ok: true, outputPath: repoRelative(result.outputPath) }, null, 2));
}

main();
