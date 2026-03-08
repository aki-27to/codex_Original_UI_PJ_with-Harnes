#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");

const workspaceRoot = path.resolve(__dirname, "..");

function safeString(value, max = 2000) {
  if (typeof value !== "string") return "";
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, max) : "";
}

function readJson(filePath) {
  const raw = fs.readFileSync(filePath, "utf8");
  return raw ? JSON.parse(raw) : null;
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function writeText(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, value, "utf8");
}

function latestDirectory(rootDir) {
  if (!fs.existsSync(rootDir)) return null;
  const entries = fs.readdirSync(rootDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => {
      const fullPath = path.join(rootDir, entry.name);
      const stat = fs.statSync(fullPath);
      return { path: fullPath, mtimeMs: Number(stat.mtimeMs || 0) };
    })
    .sort((left, right) => right.mtimeMs - left.mtimeMs);
  return entries[0] ? entries[0].path : null;
}

function resolveBundleRoot() {
  const explicit = safeString(process.argv[2], 400);
  if (explicit) return path.resolve(workspaceRoot, explicit);
  return latestDirectory(path.join(workspaceRoot, "logs", "signoff-bundles"));
}

function loadOptionalJson(filePath) {
  if (!filePath || !fs.existsSync(filePath)) return null;
  try {
    return readJson(filePath);
  } catch {
    return null;
  }
}

function toCount(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.trunc(parsed)) : 0;
}

function metricFromTrace(traceSummary) {
  const flow = traceSummary && traceSummary.flowTraceSummary && typeof traceSummary.flowTraceSummary === "object"
    ? traceSummary.flowTraceSummary
    : null;
  const timeline = traceSummary && traceSummary.stageTimeline && typeof traceSummary.stageTimeline === "object"
    ? traceSummary.stageTimeline
    : null;
  const evidence = traceSummary && traceSummary.evidenceManifest && typeof traceSummary.evidenceManifest === "object"
    ? traceSummary.evidenceManifest
    : null;
  const review = traceSummary && traceSummary.reviewLoadBreakdown && typeof traceSummary.reviewLoadBreakdown === "object"
    ? traceSummary.reviewLoadBreakdown
    : null;
  const stages = Array.isArray(timeline && timeline.stages) ? timeline.stages : [];
  const childEvidenceLedger = Array.isArray(flow && flow.childEvidenceLedger) ? flow.childEvidenceLedger : [];
  const evidenceSources = Array.isArray(flow && flow.evidenceSources) ? flow.evidenceSources : [];
  const docSyncEvidence = flow && flow.docSyncEvidence && typeof flow.docSyncEvidence === "object"
    ? flow.docSyncEvidence
    : {};
  const acceptanceSummary = flow && flow.acceptanceSummary && typeof flow.acceptanceSummary === "object"
    ? flow.acceptanceSummary
    : {};
  const totalDurationMs = stages.reduce((sum, entry) => sum + (Number(entry && entry.durationMs) || 0), 0);
  const evidenceQualityScore = [
    childEvidenceLedger.length > 0,
    evidenceSources.length >= 4,
    toCount(flow && flow.reviewerExecuted) > 0,
    toCount(flow && flow.testerExecuted) > 0,
    safeString(docSyncEvidence.status, 20) === "PASS",
    toCount(acceptanceSummary.passCount) > 0,
    Boolean(review),
    Boolean(evidence),
  ].filter(Boolean).length;
  return {
    planningDepth: safeString(flow && flow.selectedPlanningDepth, 60) || null,
    assuranceDepth: safeString(flow && flow.selectedAssuranceDepth, 60) || null,
    executionFlow: safeString(flow && flow.executionFlow, 120) || null,
    finalOutcome: flow && flow.finalOutcome ? flow.finalOutcome : traceSummary && traceSummary.turn ? traceSummary.turn : null,
    totalDurationMs,
    dispatchCount: toCount(flow && flow.dispatchCount),
    dispatchSuccessCount: toCount(flow && flow.dispatchSuccessCount),
    reviewerExecuted: toCount(flow && flow.reviewerExecuted),
    testerExecuted: toCount(flow && flow.testerExecuted),
    acceptancePassCount: toCount(acceptanceSummary.passCount),
    acceptanceFailCount: toCount(acceptanceSummary.failCount),
    childEvidenceAgents: childEvidenceLedger.length,
    docSyncStatus: safeString(docSyncEvidence.status, 20) || "UNKNOWN",
    evidenceSourceCount: evidenceSources.length,
    evidenceQualityScore,
  };
}

function vanillaLikeProfile(name) {
  switch (name) {
    case "fast":
      return {
        profile: "vanilla-like",
        intent: "Approximate raw Codex on a small bounded task with minimal orchestration.",
        expectedDispatchOverhead: "minimal",
        expectedReviewOverhead: "none",
        expectedEvidenceQuality: "low_to_medium",
      };
    case "discovery":
      return {
        profile: "vanilla-like",
        intent: "Approximate raw Codex on an ambiguous task without governed requirement contracts.",
        expectedDispatchOverhead: "minimal",
        expectedReviewOverhead: "low",
        expectedEvidenceQuality: "low",
      };
    case "signoff":
      return {
        profile: "vanilla-like",
        intent: "Approximate raw Codex on a high-risk task without governed signoff artifacts.",
        expectedDispatchOverhead: "minimal",
        expectedReviewOverhead: "operator_manual",
        expectedEvidenceQuality: "low_to_medium",
      };
    default:
      return {
        profile: "vanilla-like",
        intent: "Approximate raw Codex on a normal task without multi-agent governance.",
        expectedDispatchOverhead: "minimal",
        expectedReviewOverhead: "ad_hoc",
        expectedEvidenceQuality: "low",
      };
  }
}

function loadMeasuredBaseline(bundleRoot) {
  const summary = loadOptionalJson(path.join(bundleRoot, "measured_baseline_summary.json"));
  const traces = {
    fast: loadOptionalJson(path.join(bundleRoot, "baseline_fast_task_trace_summary.json")),
    discovery: loadOptionalJson(path.join(bundleRoot, "baseline_discovery_task_trace_summary.json")),
    signoff: loadOptionalJson(path.join(bundleRoot, "baseline_signoff_task_trace_summary.json")),
    natural: loadOptionalJson(path.join(bundleRoot, "baseline_natural_task_trace_summary.json")),
  };
  const available = Object.values(traces).some(Boolean);
  return available || summary ? { summary, traces } : null;
}

function buildMeasuredBaselineEntry(label, harnessTrace, baselineTrace, baselineSummary) {
  const harness = metricFromTrace(harnessTrace);
  const baseline = metricFromTrace(baselineTrace);
  const durationDeltaMs = harness.totalDurationMs - baseline.totalDurationMs;
  const evidenceDelta = harness.evidenceQualityScore - baseline.evidenceQualityScore;
  return {
    label,
    approximation: "measured baseline profile",
    baselineProfile: safeString(baselineSummary && baselineSummary.profile, 80) || "measured-baseline-smoke",
    harness,
    baseline,
    comparison: {
      durationDeltaMs,
      dispatchDelta: harness.dispatchCount - baseline.dispatchCount,
      reviewDelta: harness.reviewerExecuted - baseline.reviewerExecuted,
      testerDelta: harness.testerExecuted - baseline.testerExecuted,
      evidenceQualityDelta: evidenceDelta,
      speedComment:
        durationDeltaMs <= 0
          ? "Harness stayed at or below measured baseline latency for this sample."
          : `Harness paid ${durationDeltaMs} ms of additional governance cost for this sample.`,
      assuranceComment:
        evidenceDelta > 0
          ? `Harness produced ${evidenceDelta} additional evidence-quality signals over the measured baseline profile.`
          : "Harness evidence advantage was not larger than the measured baseline on this sample.",
    },
  };
}

function buildApproximationEntry(label, traceSummary, baselineKind) {
  const harness = metricFromTrace(traceSummary);
  return {
    label,
    approximation: "vanilla-like baseline",
    baseline: vanillaLikeProfile(baselineKind),
    harness,
    comparison: {
      speedComment:
        harness.totalDurationMs > 0
          ? harness.dispatchCount > 0 || harness.reviewerExecuted || harness.testerExecuted
            ? "Harness paid governance cost in exchange for traceability."
            : "Harness stayed close to raw execution cost."
          : "No live timing data available.",
      assuranceComment:
        harness.evidenceQualityScore >= 4
          ? "Harness produced materially stronger evidence than the vanilla-like baseline would."
          : "Harness evidence advantage could not be demonstrated from the available bundle.",
    },
  };
}

function buildMarkdown(report) {
  const lines = [
    "# Speed Vs Assurance",
    "",
    `Bundle: ${safeString(report.bundleRoot, 400) || "unavailable"}`,
    "",
    report.approximation === "measured-baseline-profile"
      ? "This report compares governed harness runs against a measured in-repo baseline profile with governance-light settings."
      : "This report uses a vanilla-like baseline profile, not a real raw Codex run.",
    "",
  ];
  for (const entry of report.samples) {
    lines.push(`## ${entry.label}`);
    lines.push(`- Harness depth: ${entry.harness.planningDepth || "n/a"} + ${entry.harness.assuranceDepth || "n/a"}`);
    if (entry.baseline) {
      lines.push(`- Baseline depth: ${entry.baseline.planningDepth || "n/a"} + ${entry.baseline.assuranceDepth || "n/a"}`);
      lines.push(`- Duration: harness ${entry.harness.totalDurationMs || 0} ms / baseline ${entry.baseline.totalDurationMs || 0} ms`);
      lines.push(`- Dispatch/review/test: harness ${entry.harness.dispatchCount}/${entry.harness.reviewerExecuted}/${entry.harness.testerExecuted} / baseline ${entry.baseline.dispatchCount}/${entry.baseline.reviewerExecuted}/${entry.baseline.testerExecuted}`);
      lines.push(`- Evidence quality: harness ${entry.harness.evidenceQualityScore} / baseline ${entry.baseline.evidenceQualityScore}`);
    } else {
      lines.push(`- Harness duration: ${entry.harness.totalDurationMs || 0} ms`);
      lines.push(`- Dispatch/review/test: ${entry.harness.dispatchCount}/${entry.harness.reviewerExecuted}/${entry.harness.testerExecuted}`);
      lines.push(`- Evidence quality: ${entry.harness.evidenceQualityScore}`);
    }
    lines.push(`- Speed: ${entry.comparison.speedComment}`);
    lines.push(`- Assurance: ${entry.comparison.assuranceComment}`);
    lines.push("");
  }
  if (Array.isArray(report.gaps) && report.gaps.length) {
    lines.push("## Gaps");
    for (const gap of report.gaps) {
      lines.push(`- ${gap}`);
    }
    lines.push("");
  }
  return `${lines.join("\n").trim()}\n`;
}

function generateBaselineComparison(bundleRootInput = "") {
  const bundleRoot = bundleRootInput ? path.resolve(workspaceRoot, bundleRootInput) : resolveBundleRoot();
  if (!bundleRoot || !fs.existsSync(bundleRoot)) {
    throw new Error("signoff bundle root not found");
  }

  const harnessTraces = {
    fast: loadOptionalJson(path.join(bundleRoot, "fast_task_trace_summary.json")),
    discovery: loadOptionalJson(path.join(bundleRoot, "discovery_task_trace_summary.json")),
    signoff: loadOptionalJson(path.join(bundleRoot, "signoff_task_trace_summary.json")),
    natural: loadOptionalJson(path.join(bundleRoot, "natural_task_trace_summary.json")),
  };
  const signoffSummary = loadOptionalJson(path.join(bundleRoot, "signoff_summary.json"));
  const measuredBaseline = loadMeasuredBaseline(bundleRoot);
  const usingMeasuredBaseline = Boolean(measuredBaseline && Object.values(measuredBaseline.traces || {}).some(Boolean));

  const samples = usingMeasuredBaseline
    ? [
        buildMeasuredBaselineEntry("FAST sample", harnessTraces.fast, measuredBaseline.traces.fast, measuredBaseline.summary),
        buildMeasuredBaselineEntry("DISCOVERY sample", harnessTraces.discovery, measuredBaseline.traces.discovery, measuredBaseline.summary),
        buildMeasuredBaselineEntry("SIGNOFF sample", harnessTraces.signoff, measuredBaseline.traces.signoff, measuredBaseline.summary),
        buildMeasuredBaselineEntry("Natural sample", harnessTraces.natural, measuredBaseline.traces.natural, measuredBaseline.summary),
      ]
    : [
        buildApproximationEntry("FAST sample", harnessTraces.fast, "fast"),
        buildApproximationEntry("DISCOVERY sample", harnessTraces.discovery, "discovery"),
        buildApproximationEntry("SIGNOFF sample", harnessTraces.signoff, "signoff"),
        buildApproximationEntry("Natural sample", harnessTraces.natural, "normal"),
      ];

  const report = {
    schema: "baseline-comparison-report.v2",
    generatedAt: new Date().toISOString(),
    approximation: usingMeasuredBaseline ? "measured-baseline-profile" : "vanilla-like baseline profile",
    bundleRoot,
    signoffSummaryPath: path.join(bundleRoot, "signoff_summary.json"),
    measuredBaselineSummaryPath: path.join(bundleRoot, "measured_baseline_summary.json"),
    samples,
    aggregate: {
      signoffAllPassed: Boolean(signoffSummary && signoffSummary.allPassed),
      sampleCountWithTiming: Object.values(harnessTraces)
        .map(metricFromTrace)
        .filter((entry) => entry.totalDurationMs > 0).length,
      measuredBaselineAvailable: usingMeasuredBaseline ? 1 : 0,
    },
    gaps: [],
  };

  if (!harnessTraces.signoff) report.gaps.push("SIGNOFF sample trace is missing.");
  if (!(signoffSummary && typeof signoffSummary === "object")) report.gaps.push("signoff_summary.json is missing.");
  if (!usingMeasuredBaseline) report.gaps.push("Measured baseline traces are unavailable; falling back to vanilla-like approximation.");

  const jsonPath = path.join(bundleRoot, "baseline_comparison_report.json");
  const mdPath = path.join(bundleRoot, "speed_vs_assurance_report.md");
  const archiveRoot = path.join(workspaceRoot, "logs", "baseline-comparison");
  const archiveName = path.basename(bundleRoot);
  const archiveJsonPath = path.join(archiveRoot, `${archiveName}.json`);
  const archiveMdPath = path.join(archiveRoot, `${archiveName}.md`);

  writeJson(jsonPath, report);
  writeText(mdPath, buildMarkdown(report));
  writeJson(archiveJsonPath, report);
  writeText(archiveMdPath, buildMarkdown(report));
  return { ok: true, bundleRoot, jsonPath, mdPath, archiveJsonPath, archiveMdPath, report };
}

if (require.main === module) {
  const result = generateBaselineComparison(process.argv[2] || "");
  console.log(JSON.stringify(result, null, 2));
}

module.exports = {
  generateBaselineComparison,
};
