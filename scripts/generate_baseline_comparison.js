#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const { getLoggingSurfacePaths } = require("./lib/logging_surface");

const workspaceRoot = path.resolve(__dirname, "..");
const loggingSurfacePaths = getLoggingSurfacePaths(workspaceRoot);

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

function repoRelative(filePath) {
  return filePath ? path.relative(workspaceRoot, filePath).split(path.sep).join("/") : "";
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
  return latestDirectory(loggingSurfacePaths.signoffBundlesRoot);
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

function normalizeTransportMode(value) {
  const raw = safeString(value, 80).toLowerCase();
  if (!raw) return "";
  if (raw === "mock" || raw === "fixture" || raw === "mock-fixture") return "mock-fixture";
  if (raw === "live" || raw === "stdio") return "stdio";
  return raw;
}

function resolveCandidatePath(bundleRoot, candidate) {
  const value = safeString(candidate, 400);
  if (!value) return "";
  return path.isAbsolute(value) ? value : path.join(bundleRoot, value);
}

function findExistingArtifactPath(bundleRoot, candidates = []) {
  for (const candidate of Array.isArray(candidates) ? candidates : []) {
    const resolved = resolveCandidatePath(bundleRoot, candidate);
    if (resolved && fs.existsSync(resolved)) {
      return resolved;
    }
  }
  return "";
}

function loadArtifact(bundleRoot, candidates = []) {
  const filePath = findExistingArtifactPath(bundleRoot, candidates);
  return {
    path: filePath,
    value: filePath ? loadOptionalJson(filePath) : null,
  };
}

function buildFixedBundleSurfaceLists(bundleRoot) {
  const rel = (segments) => repoRelative(path.join(bundleRoot, ...segments));
  const topLevelSummaries = [
    rel(["signoff_summary.json"]),
    rel(["runtime_snapshot.json"]),
    rel(["core_harness_workflow_run.json"]),
    rel(["natural_task_trace_summary.json"]),
    rel(["boundary_task_trace_summary.json"]),
    rel(["latest_run_summary.json"]),
    rel(["review_load_breakdown.json"]),
    rel(["conformance_report.json"]),
    rel(["operator_view_summary.json"]),
    rel(["bundle_surface_map.json"]),
  ];
  return {
    topLevelSummaries,
    openFirst: [
      ...topLevelSummaries,
      rel(["raw", "relocated_top_level", "lane_latency_summary.json"]),
      rel(["raw", "relocated_top_level", "signoff_resume_state.json"]),
      rel(["raw", "relocated_top_level", "baseline_comparison_report.json"]),
      rel(["raw", "relocated_top_level", "speed_vs_assurance_report.md"]),
    ],
  };
}

function reconcileBundleComparisonSurfaces({
  bundleRoot,
  report,
  markdown,
  archiveJsonPath,
  archiveMdPath,
  jsonPath,
  mdPath,
}) {
  const relocatedRoot = path.join(bundleRoot, "raw", "relocated_top_level");
  const preferredJsonPath = fs.existsSync(relocatedRoot)
    ? path.join(relocatedRoot, "baseline_comparison_report.json")
    : jsonPath;
  const preferredMdPath = fs.existsSync(relocatedRoot)
    ? path.join(relocatedRoot, "speed_vs_assurance_report.md")
    : mdPath;

  if (preferredJsonPath !== jsonPath) writeJson(preferredJsonPath, report);
  if (preferredMdPath !== mdPath) writeText(preferredMdPath, markdown);
  if (preferredJsonPath !== jsonPath && fs.existsSync(jsonPath)) fs.rmSync(jsonPath, { force: true });
  if (preferredMdPath !== mdPath && fs.existsSync(mdPath)) fs.rmSync(mdPath, { force: true });

  const signoffSummaryPath = path.join(bundleRoot, "signoff_summary.json");
  const signoffSummary = loadOptionalJson(signoffSummaryPath);
  if (signoffSummary && typeof signoffSummary === "object") {
    const nextSummary = { ...signoffSummary };
    nextSummary.updatedAt = new Date().toISOString();
    nextSummary.baselineComparison = {
      ...(nextSummary.baselineComparison && typeof nextSummary.baselineComparison === "object" ? nextSummary.baselineComparison : {}),
      status: "ok",
      reportPath: preferredJsonPath,
      markdownPath: preferredMdPath,
      archiveReportPath: archiveJsonPath,
      archiveMarkdownPath: archiveMdPath,
      truthfulClaimStatus:
        report && report.truthfulClaimStatus && typeof report.truthfulClaimStatus === "object" ? report.truthfulClaimStatus : {},
    };
    nextSummary.paths = {
      ...(nextSummary.paths && typeof nextSummary.paths === "object" ? nextSummary.paths : {}),
      baselineComparisonReport: preferredJsonPath,
      speedVsAssuranceReport: preferredMdPath,
    };
    writeJson(signoffSummaryPath, nextSummary);
  }

  const bundleSurfaceMapPath = path.join(bundleRoot, "bundle_surface_map.json");
  const bundleSurfaceMap = loadOptionalJson(bundleSurfaceMapPath);
  if (bundleSurfaceMap && typeof bundleSurfaceMap === "object") {
    const fixedLists = buildFixedBundleSurfaceLists(bundleRoot);
    const nextSurfaceMap = { ...bundleSurfaceMap };
    nextSurfaceMap.generatedAt = new Date().toISOString();
    nextSurfaceMap.openFirst = fixedLists.openFirst;
    nextSurfaceMap.topLevelSummaries = fixedLists.topLevelSummaries;
    writeJson(bundleSurfaceMapPath, nextSurfaceMap);
  }

  return { preferredJsonPath, preferredMdPath };
}

function classifyMeasuredBaseline(summary) {
  const profile = safeString(summary && summary.profile, 80).toLowerCase();
  const transportMode = normalizeTransportMode(summary && summary.transportMode);
  if (profile === "live-raw-codex-like" || (transportMode === "stdio" && profile !== "measured-baseline-smoke")) {
    return {
      approximationKey: "live-raw-codex-like-profile",
      sampleLabel: "live raw-Codex-like profile",
      markdownSummary: "This report compares governed harness runs against a live raw-Codex-like baseline captured over stdio transport.",
    };
  }
  return {
    approximationKey: "measured-baseline-profile",
    sampleLabel: "measured baseline profile",
    markdownSummary: "This report compares governed harness runs against a measured in-repo baseline profile with governance-light settings.",
  };
}

function classifyRawDirectBaseline(summary) {
  const transportMode = normalizeTransportMode(summary && summary.transportMode);
  return {
    approximationKey: "raw-codex-direct-baseline",
    sampleLabel: "raw Codex direct baseline",
    markdownSummary:
      transportMode === "stdio"
        ? "This report compares governed harness runs against direct stdio Codex app-server runs without harness governance."
        : "This report attempted a raw Codex direct baseline, but the captured transport was not live stdio.",
  };
}

function countMeaningfulDiscoveryQuestions(openQuestions) {
  return uniqueDiscoveryQuestions(openQuestions).length;
}

function uniqueDiscoveryQuestions(openQuestions) {
  const out = [];
  for (const entry of Array.isArray(openQuestions) ? openQuestions : []) {
    const question = safeString(entry, 240);
    if (!question) continue;
    if (/^\[(?:fixture_scenario|baseline_profile)\]/i.test(question)) continue;
    if (/^first make the open questions explicit\.?$/i.test(question)) continue;
    if (/^stop with status:\s*need_user_input\.?$/i.test(question)) continue;
    if (out.includes(question)) continue;
    out.push(question);
  }
  return out;
}

function countDiscoveryEvidenceSignals(traceSummary, flow, evidence) {
  const requirement = evidence && evidence.requirementContract && typeof evidence.requirementContract === "object"
    ? evidence.requirementContract
    : {};
  const finalOutcome = flow && flow.finalOutcome && typeof flow.finalOutcome === "object"
    ? flow.finalOutcome
    : traceSummary && traceSummary.turn && typeof traceSummary.turn === "object"
      ? traceSummary.turn
      : {};
  const meaningfulQuestionCount = countMeaningfulDiscoveryQuestions(requirement.openQuestions);
  return [
    meaningfulQuestionCount >= 2,
    meaningfulQuestionCount >= 4,
    Array.isArray(requirement.assumptions) && requirement.assumptions.length > 0,
    Array.isArray(requirement.nonGoals) && requirement.nonGoals.length > 0,
    Array.isArray(requirement.baselineScope) && requirement.baselineScope.length > 0,
    safeString(finalOutcome.taskOutcomeStatus, 40) === "NEEDS_INPUT",
  ].filter(Boolean).length;
}

function metricFromTrace(traceSummary) {
  if (safeString(traceSummary && traceSummary.schema, 80) === "raw-direct-baseline-trace.v1") {
    const discoverySignals =
      traceSummary && traceSummary.discoverySignals && typeof traceSummary.discoverySignals === "object"
        ? traceSummary.discoverySignals
        : {};
    const meaningfulOpenQuestionsCount = Array.isArray(traceSummary && traceSummary.meaningfulOpenQuestions)
      ? traceSummary.meaningfulOpenQuestions.length
      : 0;
    const discoveryEvidenceScore = [
      meaningfulOpenQuestionsCount >= 2,
      meaningfulOpenQuestionsCount >= 4,
      Number(discoverySignals.assumptions || 0) > 0,
      Number(discoverySignals.nonGoals || 0) > 0,
      Number(discoverySignals.decisionBoundary || 0) > 0,
      Number(discoverySignals.needsInput || 0) > 0,
    ].filter(Boolean).length;
    const changedArtifacts = Array.isArray(traceSummary && traceSummary.changedArtifacts) ? traceSummary.changedArtifacts : [];
    const itemSummaries = Array.isArray(traceSummary && traceSummary.itemSummaries) ? traceSummary.itemSummaries : [];
    const assertions =
      traceSummary && traceSummary.assertions && typeof traceSummary.assertions === "object"
        ? traceSummary.assertions
        : {};
    const success = Boolean(assertions.explicitVerificationPassed || assertions.discoveryBoundaryDetected);
    return {
      planningDepth: null,
      assuranceDepth: null,
      executionFlow: "RAW_DIRECT_BASELINE",
      finalOutcome: traceSummary && traceSummary.turn ? traceSummary.turn : null,
      totalDurationMs: toCount(traceSummary && traceSummary.wallClockMs),
      dispatchCount: 0,
      dispatchSuccessCount: 0,
      reviewerExecuted: 0,
      testerExecuted: 0,
      acceptancePassCount: assertions.explicitVerificationPassed ? 1 : 0,
      acceptanceFailCount: assertions.explicitVerificationPassed ? 0 : 1,
      childEvidenceAgents: 0,
      docSyncStatus: "SKIPPED",
      evidenceSourceCount: itemSummaries.length > 0 ? 1 : 0,
      discoveryEvidenceScore,
      meaningfulOpenQuestionsCount,
      transportMode: normalizeTransportMode(traceSummary && traceSummary.transportMode) || null,
      evidenceQualityScore: [
        safeString(traceSummary && traceSummary.finalText, 120).length > 0,
        changedArtifacts.length > 0,
        itemSummaries.length > 0,
        Boolean(assertions.explicitVerificationPassed),
      ].filter(Boolean).length + discoveryEvidenceScore,
      success,
      extraHitlCount: safeString(traceSummary && traceSummary.turn && traceSummary.turn.taskOutcomeStatus, 40) === "NEEDS_INPUT" ? 1 : 0,
      repairCount: 0,
    };
  }
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
  const dispatchPlan = evidence && evidence.dispatchPlan && typeof evidence.dispatchPlan === "object"
    ? evidence.dispatchPlan
    : {};
  const finalOutcome = flow && flow.finalOutcome && typeof flow.finalOutcome === "object"
    ? flow.finalOutcome
    : traceSummary && traceSummary.turn && typeof traceSummary.turn === "object"
      ? traceSummary.turn
      : {};
  const totalDurationMs = stages.reduce((sum, entry) => sum + (Number(entry && entry.durationMs) || 0), 0);
  const reviewEvidencePresent = Boolean(review) || evidenceSources.includes("review_load_breakdown.json");
  const discoveryEvidenceScore =
    safeString(flow && flow.selectedPlanningDepth, 60) === "DISCOVERY_PLANNING" &&
    safeString(finalOutcome.taskOutcomeStatus, 40) === "NEEDS_INPUT"
      ? countDiscoveryEvidenceSignals(traceSummary, flow, evidence)
      : 0;
  const evidenceQualityScore = [
    childEvidenceLedger.length > 0,
    evidenceSources.length >= 4,
    toCount(flow && flow.reviewerExecuted) > 0,
    toCount(flow && flow.testerExecuted) > 0,
    safeString(docSyncEvidence.status, 20) === "PASS",
    toCount(acceptanceSummary.passCount) > 0,
    reviewEvidencePresent,
    Boolean(evidence),
  ].filter(Boolean).length + discoveryEvidenceScore;
  const transportMode = normalizeTransportMode(
    traceSummary && traceSummary.transportMode
      ? traceSummary.transportMode
      : traceSummary && traceSummary.runtime && traceSummary.runtime.transportMode
        ? traceSummary.runtime.transportMode
        : ""
  );
  const finalTaskOutcomeStatus = safeString(finalOutcome && finalOutcome.taskOutcomeStatus, 40).toUpperCase();
  const success =
    acceptanceSummary && Number(acceptanceSummary.failCount || 0) === 0 &&
    (finalTaskOutcomeStatus === "COMPLETED" || finalTaskOutcomeStatus === "NEEDS_INPUT");
  const repairCount = timeline && timeline.checkpoints ? toCount(timeline.checkpoints.retryLoopCount) : 0;
  return {
    planningDepth: safeString(flow && flow.selectedPlanningDepth, 60) || null,
    assuranceDepth: safeString(flow && flow.selectedAssuranceDepth, 60) || null,
    executionFlow: safeString(flow && flow.executionFlow, 120) || null,
    finalOutcome: finalOutcome || null,
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
    discoveryEvidenceScore,
    meaningfulOpenQuestionsCount:
      evidence && evidence.requirementContract && Array.isArray(evidence.requirementContract.openQuestions)
        ? countMeaningfulDiscoveryQuestions(evidence.requirementContract.openQuestions)
        : 0,
    transportMode: transportMode || null,
    evidenceQualityScore,
    success,
    extraHitlCount: finalTaskOutcomeStatus === "NEEDS_INPUT" ? 1 : 0,
    repairCount,
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

function loadHarnessTraces(bundleRoot, signoffSummary) {
  const summaryPaths = signoffSummary && signoffSummary.paths && typeof signoffSummary.paths === "object"
    ? signoffSummary.paths
    : {};
  const fast = loadArtifact(bundleRoot, [
    summaryPaths.fastTaskTraceSummary,
    "fast_task_trace_summary.json",
    "raw/summaries/fast_task_trace_summary.json",
  ]);
  const discovery = loadArtifact(bundleRoot, [
    summaryPaths.discoveryTaskTraceSummary,
    "discovery_task_trace_summary.json",
    "raw/summaries/discovery_task_trace_summary.json",
  ]);
  const signoff = loadArtifact(bundleRoot, [
    summaryPaths.signoffTaskTraceSummary,
    "signoff_task_trace_summary.json",
    "raw/summaries/signoff_task_trace_summary.json",
  ]);
  const natural = loadArtifact(bundleRoot, [
    summaryPaths.naturalTaskTraceSummary,
    "natural_task_trace_summary.json",
    "raw/summaries/natural_task_trace_summary.json",
  ]);
  const boundary = loadArtifact(bundleRoot, [
    summaryPaths.boundaryTaskTraceSummary,
    "boundary_task_trace_summary.json",
    "raw/relocated_top_level/boundary_task_trace_summary.json",
    "raw/summaries/boundary_task_trace_summary.json",
  ]);
  return {
    traces: {
      fast: fast.value,
      discovery: discovery.value,
      signoff: signoff.value,
      natural: natural.value,
      boundary: boundary.value,
    },
    tracePaths: {
      fast: fast.path,
      discovery: discovery.path,
      signoff: signoff.path,
      natural: natural.path,
      boundary: boundary.path,
    },
  };
}

function loadMeasuredBaseline(bundleRoot, signoffSummary) {
  const summaryPaths = signoffSummary && signoffSummary.paths && typeof signoffSummary.paths === "object"
    ? signoffSummary.paths
    : {};
  const summary = loadArtifact(bundleRoot, [
    summaryPaths.measuredBaselineSummary,
    "measured_baseline_summary.json",
    "raw/measured_baseline/measured_baseline_summary.json",
  ]);
  const fast = loadArtifact(bundleRoot, [
    summaryPaths.baselineFastTaskTraceSummary,
    "baseline_fast_task_trace_summary.json",
    "raw/measured_baseline/baseline_fast_task_trace_summary.json",
  ]);
  const discovery = loadArtifact(bundleRoot, [
    summaryPaths.baselineDiscoveryTaskTraceSummary,
    "baseline_discovery_task_trace_summary.json",
    "raw/measured_baseline/baseline_discovery_task_trace_summary.json",
  ]);
  const signoff = loadArtifact(bundleRoot, [
    summaryPaths.baselineSignoffTaskTraceSummary,
    "baseline_signoff_task_trace_summary.json",
    "raw/measured_baseline/baseline_signoff_task_trace_summary.json",
  ]);
  const natural = loadArtifact(bundleRoot, [
    summaryPaths.baselineNaturalTaskTraceSummary,
    "baseline_natural_task_trace_summary.json",
    "raw/measured_baseline/baseline_natural_task_trace_summary.json",
  ]);
  const boundary = loadArtifact(bundleRoot, [
    summaryPaths.baselineBoundaryTaskTraceSummary,
    "baseline_boundary_task_trace_summary.json",
    "raw/measured_baseline/baseline_boundary_task_trace_summary.json",
  ]);
  const available = [summary.value, fast.value, discovery.value, signoff.value, natural.value, boundary.value].some(Boolean);
  return available
    ? {
        summary: summary.value,
        summaryPath: summary.path,
        traces: {
          fast: fast.value,
          discovery: discovery.value,
          signoff: signoff.value,
          natural: natural.value,
          boundary: boundary.value,
        },
        tracePaths: {
          fast: fast.path,
          discovery: discovery.path,
          signoff: signoff.path,
          natural: natural.path,
          boundary: boundary.path,
        },
      }
    : null;
}

function loadRawDirectBaseline(bundleRoot, signoffSummary) {
  const summaryPaths = signoffSummary && signoffSummary.paths && typeof signoffSummary.paths === "object"
    ? signoffSummary.paths
    : {};
  const summary = loadArtifact(bundleRoot, [
    summaryPaths.rawDirectBaselineSummary,
    "raw_direct_baseline_summary.json",
    "raw/raw_direct_baseline/raw_direct_baseline_summary.json",
  ]);
  const fast = loadArtifact(bundleRoot, [
    summaryPaths.rawDirectFastTaskTraceSummary,
    "raw_direct_fast_task_trace_summary.json",
    "raw/raw_direct_baseline/raw_direct_fast_task_trace_summary.json",
  ]);
  const discovery = loadArtifact(bundleRoot, [
    summaryPaths.rawDirectDiscoveryTaskTraceSummary,
    "raw_direct_discovery_task_trace_summary.json",
    "raw/raw_direct_baseline/raw_direct_discovery_task_trace_summary.json",
  ]);
  const signoff = loadArtifact(bundleRoot, [
    summaryPaths.rawDirectSignoffTaskTraceSummary,
    "raw_direct_signoff_task_trace_summary.json",
    "raw/raw_direct_baseline/raw_direct_signoff_task_trace_summary.json",
  ]);
  const natural = loadArtifact(bundleRoot, [
    summaryPaths.rawDirectNaturalTaskTraceSummary,
    "raw_direct_natural_task_trace_summary.json",
    "raw/raw_direct_baseline/raw_direct_natural_task_trace_summary.json",
  ]);
  const boundary = loadArtifact(bundleRoot, [
    summaryPaths.rawDirectBoundaryTaskTraceSummary,
    "raw_direct_boundary_task_trace_summary.json",
    "raw/raw_direct_baseline/raw_direct_boundary_task_trace_summary.json",
  ]);
  const available = [summary.value, fast.value, discovery.value, signoff.value, natural.value, boundary.value].some(Boolean);
  return available
    ? {
        summary: summary.value,
        summaryPath: summary.path,
        traces: {
          fast: fast.value,
          discovery: discovery.value,
          signoff: signoff.value,
          natural: natural.value,
          boundary: boundary.value,
        },
        tracePaths: {
          fast: fast.path,
          discovery: discovery.path,
          signoff: signoff.path,
          natural: natural.path,
          boundary: boundary.path,
        },
      }
    : null;
}

function buildStructuredBaselineEntry(label, harnessTrace, baselineTrace, baselineSummary, baselineClassification) {
  const harness = metricFromTrace(harnessTrace);
  const baseline = metricFromTrace(baselineTrace);
  const durationDeltaMs = harness.totalDurationMs - baseline.totalDurationMs;
  const evidenceDelta = harness.evidenceQualityScore - baseline.evidenceQualityScore;
  return {
    label,
    approximation: baselineClassification.sampleLabel,
    baselineProfile: safeString(baselineSummary && baselineSummary.profile, 80) || "measured-baseline-smoke",
    harness,
    baseline,
    comparison: {
      durationDeltaMs,
      dispatchDelta: harness.dispatchCount - baseline.dispatchCount,
      reviewDelta: harness.reviewerExecuted - baseline.reviewerExecuted,
      testerDelta: harness.testerExecuted - baseline.testerExecuted,
      extraHitlDelta: (harness.extraHitlCount || 0) - (baseline.extraHitlCount || 0),
      repairDelta: (harness.repairCount || 0) - (baseline.repairCount || 0),
      evidenceQualityDelta: evidenceDelta,
      speedComment:
        durationDeltaMs <= 0
          ? "Harness stayed at or below baseline latency for this sample."
          : `Harness paid ${durationDeltaMs} ms of additional governance cost for this sample.`,
      assuranceComment:
        evidenceDelta > 0
          ? `Harness produced ${evidenceDelta} additional evidence-quality signals over the ${baselineClassification.sampleLabel}.`
          : `Harness evidence advantage was not larger than the ${baselineClassification.sampleLabel} on this sample.`,
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

function buildAggregateComparison(samples = []) {
  const entries = Array.isArray(samples) ? samples : [];
  const sampleCount = entries.length;
  const summarizeSide = (key) => {
    const metrics = entries.map((entry) => entry && entry[key] ? entry[key] : {}).filter(Boolean);
    const successCount = metrics.filter((metric) => metric.success === true).length;
    const totalDurationMs = metrics.reduce((sum, metric) => sum + (Number(metric.totalDurationMs) || 0), 0);
    const extraHitlCount = metrics.reduce((sum, metric) => sum + (Number(metric.extraHitlCount) || 0), 0);
    const repairCount = metrics.reduce((sum, metric) => sum + (Number(metric.repairCount) || 0), 0);
    return {
      sampleCount,
      successCount,
      successRate: sampleCount > 0 ? Number((successCount / sampleCount).toFixed(3)) : 0,
      totalDurationMs,
      averageDurationMs: sampleCount > 0 ? Math.round(totalDurationMs / sampleCount) : 0,
      extraHitlCount,
      repairCount,
    };
  };
  const harness = summarizeSide("harness");
  const baseline = summarizeSide("baseline");
  return {
    harness,
    baseline,
    delta: {
      successRate: Number((harness.successRate - baseline.successRate).toFixed(3)),
      averageDurationMs: harness.averageDurationMs - baseline.averageDurationMs,
      extraHitlCount: harness.extraHitlCount - baseline.extraHitlCount,
      repairCount: harness.repairCount - baseline.repairCount,
    },
  };
}

function buildMarkdown(report) {
  const lines = [
    "# Speed Vs Assurance",
    "",
    `Bundle: ${safeString(report.bundleRoot, 400) || "unavailable"}`,
    "",
    `Transport: ${report.transportModes.length ? report.transportModes.join(", ") : "unknown"}`,
    `Live transport parity: ${safeString(report.truthfulClaimStatus && report.truthfulClaimStatus.liveTransportParity, 40) || "NOT PROVEN"}`,
    `Raw Codex direct superiority: ${safeString(report.truthfulClaimStatus && report.truthfulClaimStatus.rawCodexDirectSuperiority, 40) || "NOT PROVEN"}`,
    "",
    report.approximation === "measured-baseline-profile"
      || report.approximation === "live-raw-codex-like-profile"
      || report.approximation === "raw-codex-direct-baseline"
      ? report.markdownSummary
      : "This report uses a vanilla-like baseline profile, not a real raw Codex run.",
    "",
    "## Aggregate",
    `- Harness success rate: ${Number(report.aggregate && report.aggregate.harness && report.aggregate.harness.successRate) || 0}`,
    `- Baseline success rate: ${Number(report.aggregate && report.aggregate.baseline && report.aggregate.baseline.successRate) || 0}`,
    `- Harness average duration ms: ${Number(report.aggregate && report.aggregate.harness && report.aggregate.harness.averageDurationMs) || 0}`,
    `- Baseline average duration ms: ${Number(report.aggregate && report.aggregate.baseline && report.aggregate.baseline.averageDurationMs) || 0}`,
    `- Harness extra HITL count: ${Number(report.aggregate && report.aggregate.harness && report.aggregate.harness.extraHitlCount) || 0}`,
    `- Baseline extra HITL count: ${Number(report.aggregate && report.aggregate.baseline && report.aggregate.baseline.extraHitlCount) || 0}`,
    `- Harness repair count: ${Number(report.aggregate && report.aggregate.harness && report.aggregate.harness.repairCount) || 0}`,
    `- Baseline repair count: ${Number(report.aggregate && report.aggregate.baseline && report.aggregate.baseline.repairCount) || 0}`,
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
      if (entry.harness.discoveryEvidenceScore || entry.baseline.discoveryEvidenceScore) {
        lines.push(`- Discovery evidence: harness ${entry.harness.discoveryEvidenceScore} / baseline ${entry.baseline.discoveryEvidenceScore}`);
      }
    } else {
      lines.push(`- Harness duration: ${entry.harness.totalDurationMs || 0} ms`);
      lines.push(`- Dispatch/review/test: ${entry.harness.dispatchCount}/${entry.harness.reviewerExecuted}/${entry.harness.testerExecuted}`);
      lines.push(`- Evidence quality: ${entry.harness.evidenceQualityScore}`);
      if (entry.harness.discoveryEvidenceScore) {
        lines.push(`- Discovery evidence: ${entry.harness.discoveryEvidenceScore}`);
      }
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

  const signoffSummary = loadOptionalJson(path.join(bundleRoot, "signoff_summary.json"));
  const harnessBundle = loadHarnessTraces(bundleRoot, signoffSummary);
  const harnessTraces = harnessBundle.traces;
  const measuredBaseline = loadMeasuredBaseline(bundleRoot, signoffSummary);
  const rawDirectBaseline = loadRawDirectBaseline(bundleRoot, signoffSummary);
  const measuredBaselineTraceCount = measuredBaseline ? Object.values(measuredBaseline.traces || {}).filter(Boolean).length : 0;
  const rawDirectTraceCount = rawDirectBaseline ? Object.values(rawDirectBaseline.traces || {}).filter(Boolean).length : 0;
  const usingRawDirectBaseline =
    Boolean(rawDirectBaseline && rawDirectBaseline.summary && safeString(rawDirectBaseline.summary.status, 40) === "ok")
    && rawDirectTraceCount === 5;
  const usingMeasuredBaseline =
    Boolean(measuredBaseline && measuredBaseline.summary)
    && measuredBaselineTraceCount === 5;
  const baselineClassification = usingRawDirectBaseline
    ? classifyRawDirectBaseline(rawDirectBaseline && rawDirectBaseline.summary)
    : classifyMeasuredBaseline(measuredBaseline && measuredBaseline.summary);

  const samples = usingRawDirectBaseline
    ? [
        buildStructuredBaselineEntry("FAST sample", harnessTraces.fast, rawDirectBaseline.traces.fast, rawDirectBaseline.summary, baselineClassification),
        buildStructuredBaselineEntry("DISCOVERY sample", harnessTraces.discovery, rawDirectBaseline.traces.discovery, rawDirectBaseline.summary, baselineClassification),
        buildStructuredBaselineEntry("SIGNOFF sample", harnessTraces.signoff, rawDirectBaseline.traces.signoff, rawDirectBaseline.summary, baselineClassification),
        buildStructuredBaselineEntry("Natural sample", harnessTraces.natural, rawDirectBaseline.traces.natural, rawDirectBaseline.summary, baselineClassification),
        buildStructuredBaselineEntry("Boundary sample", harnessTraces.boundary, rawDirectBaseline.traces.boundary, rawDirectBaseline.summary, baselineClassification),
      ]
    : usingMeasuredBaseline
      ? [
          buildStructuredBaselineEntry("FAST sample", harnessTraces.fast, measuredBaseline.traces.fast, measuredBaseline.summary, baselineClassification),
          buildStructuredBaselineEntry("DISCOVERY sample", harnessTraces.discovery, measuredBaseline.traces.discovery, measuredBaseline.summary, baselineClassification),
          buildStructuredBaselineEntry("SIGNOFF sample", harnessTraces.signoff, measuredBaseline.traces.signoff, measuredBaseline.summary, baselineClassification),
          buildStructuredBaselineEntry("Natural sample", harnessTraces.natural, measuredBaseline.traces.natural, measuredBaseline.summary, baselineClassification),
          buildStructuredBaselineEntry("Boundary sample", harnessTraces.boundary, measuredBaseline.traces.boundary, measuredBaseline.summary, baselineClassification),
        ]
      : [
          buildApproximationEntry("FAST sample", harnessTraces.fast, "fast"),
          buildApproximationEntry("DISCOVERY sample", harnessTraces.discovery, "discovery"),
          buildApproximationEntry("SIGNOFF sample", harnessTraces.signoff, "signoff"),
          buildApproximationEntry("Natural sample", harnessTraces.natural, "normal"),
          buildApproximationEntry("Boundary sample", harnessTraces.boundary, "normal"),
        ];
  const aggregateComparison = buildAggregateComparison(samples);

  const report = {
    schema: "baseline-comparison-report.v2",
    generatedAt: new Date().toISOString(),
    approximation: usingRawDirectBaseline
      ? baselineClassification.approximationKey
      : usingMeasuredBaseline
        ? baselineClassification.approximationKey
        : "vanilla-like baseline profile",
    markdownSummary: usingRawDirectBaseline || usingMeasuredBaseline ? baselineClassification.markdownSummary : "",
    bundleRoot,
    signoffSummaryPath: path.join(bundleRoot, "signoff_summary.json"),
    harnessTracePaths: harnessBundle.tracePaths,
    measuredBaselineSummaryPath: measuredBaseline && measuredBaseline.summaryPath ? measuredBaseline.summaryPath : "",
    rawDirectBaselineSummaryPath: rawDirectBaseline && rawDirectBaseline.summaryPath ? rawDirectBaseline.summaryPath : "",
    samples,
    aggregate: {
      ...aggregateComparison,
      signoffAllPassed: Boolean(signoffSummary && signoffSummary.allPassed),
      sampleCountWithTiming: Object.values(harnessTraces)
        .map(metricFromTrace)
        .filter((entry) => entry.totalDurationMs > 0).length,
      measuredBaselineAvailable: usingMeasuredBaseline ? 1 : 0,
      measuredBaselineTraceCount,
      rawDirectBaselineAvailable: usingRawDirectBaseline ? 1 : 0,
    },
    rawDirectBaseline: {
      status: safeString(rawDirectBaseline && rawDirectBaseline.summary && rawDirectBaseline.summary.status, 40) || "unavailable",
      traceCount: rawDirectTraceCount,
      transportMode: safeString(rawDirectBaseline && rawDirectBaseline.summary && rawDirectBaseline.summary.transportMode, 40),
      directness: safeString(rawDirectBaseline && rawDirectBaseline.summary && rawDirectBaseline.summary.directness, 80),
    },
    transportModes: Array.from(new Set(samples.flatMap((entry) => [
      entry && entry.harness && entry.harness.transportMode ? entry.harness.transportMode : "",
      entry && entry.baseline && entry.baseline.transportMode ? entry.baseline.transportMode : "",
    ]).filter(Boolean))),
    truthfulClaimStatus: {
      liveTransportParity:
        (usingRawDirectBaseline || usingMeasuredBaseline)
        && !Array.from(new Set(samples.flatMap((entry) => [
          entry && entry.harness && entry.harness.transportMode ? entry.harness.transportMode : "",
          entry && entry.baseline && entry.baseline.transportMode ? entry.baseline.transportMode : "",
        ]).filter(Boolean))).includes("mock-fixture")
        && safeString(signoffSummary && signoffSummary.transportMode, 40) === "stdio"
        && Boolean(signoffSummary && signoffSummary.allPassed)
          ? "PROVEN"
          : "NOT PROVEN",
      rawCodexDirectSuperiority: "NOT PROVEN",
    },
    gaps: [],
  };

  if (!harnessTraces.signoff) report.gaps.push("SIGNOFF sample trace is missing.");
  if (!(signoffSummary && typeof signoffSummary === "object")) report.gaps.push("signoff_summary.json is missing.");
  if (rawDirectBaseline && !usingRawDirectBaseline) {
    report.gaps.push("Raw Codex direct baseline was attempted but did not produce a full five-sample direct comparison set.");
  }
  if (measuredBaseline && !usingMeasuredBaseline) {
    report.gaps.push("Measured baseline traces are incomplete; falling back to vanilla-like approximation.");
  }
  if (!usingRawDirectBaseline && !usingMeasuredBaseline) {
    report.gaps.push("Measured baseline traces are unavailable; falling back to vanilla-like approximation.");
  }
  if (report.transportModes.includes("mock-fixture")) report.gaps.push("At least one sample still ran on mock-fixture transport; live raw-Codex parity remains unproven.");

  const jsonPath = path.join(bundleRoot, "baseline_comparison_report.json");
  const mdPath = path.join(bundleRoot, "speed_vs_assurance_report.md");
  const archiveRoot = loggingSurfacePaths.archiveBaselineComparisonRoot;
  const archiveName = path.basename(bundleRoot);
  const archiveJsonPath = path.join(archiveRoot, `${archiveName}.json`);
  const archiveMdPath = path.join(archiveRoot, `${archiveName}.md`);

  const markdown = buildMarkdown(report);
  writeJson(jsonPath, report);
  writeText(mdPath, markdown);
  writeJson(archiveJsonPath, report);
  writeText(archiveMdPath, markdown);
  const reconciled = reconcileBundleComparisonSurfaces({
    bundleRoot,
    report,
    markdown,
    archiveJsonPath,
    archiveMdPath,
    jsonPath,
    mdPath,
  });
  return {
    ok: true,
    bundleRoot,
    jsonPath: reconciled.preferredJsonPath,
    mdPath: reconciled.preferredMdPath,
    archiveJsonPath,
    archiveMdPath,
    report,
  };
}

if (require.main === module) {
  const result = generateBaselineComparison(process.argv[2] || "");
  console.log(JSON.stringify(result, null, 2));
}

module.exports = {
  generateBaselineComparison,
  metricFromTrace,
};
