#!/usr/bin/env node
"use strict";

const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { generateBaselineComparison, metricFromTrace } = require("./generate_baseline_comparison");

function buildDiscoveryTrace({ openQuestions = [], nonGoals = [], assumptions = [] } = {}) {
  return {
    turn: {
      status: "interrupted",
      taskOutcomeStatus: "NEEDS_INPUT",
      taskOutcomeReason: "interactive_approval_unavailable",
    },
    flowTraceSummary: {
      selectedPlanningDepth: "DISCOVERY_PLANNING",
      selectedAssuranceDepth: "STANDARD_ASSURANCE",
      executionFlow: "DISCOVERY_PLANNING+STANDARD_ASSURANCE",
      dispatchCount: 0,
      dispatchSuccessCount: 0,
      reviewerExecuted: 0,
      testerExecuted: 0,
      evidenceSources: [
        "events.ndjson",
        "items.ndjson",
        "manifest.json",
        "evidence_manifest.json",
        "stage_timeline.json",
        "flow_trace_summary.json",
        "review_load_breakdown.json",
      ],
      acceptanceSummary: {
        passCount: 0,
        failCount: 0,
      },
      docSyncEvidence: {
        status: "SKIPPED",
      },
      finalOutcome: {
        taskOutcomeStatus: "NEEDS_INPUT",
      },
    },
    stageTimeline: {
      stages: [{ durationMs: 9 }, { durationMs: 3 }],
    },
    evidenceManifest: {
      requirementContract: {
        openQuestions,
        nonGoals,
        assumptions,
      },
      dispatchPlan: {
        proposalOnly: 1,
      },
    },
  };
}

function buildRawDirectTrace() {
  return {
    schema: "raw-direct-baseline-trace.v1",
    transportMode: "stdio",
    wallClockMs: 18,
    finalText: [
      "Open questions:",
      "- What is the concrete product goal?",
      "- Which specialist boundaries are in scope?",
      "Assumptions: implementation stays proposal-only.",
      "Non-goals: no code changes yet.",
      "Decision boundary: stop before implementation.",
      "STATUS: NEED_USER_INPUT",
    ].join("\n"),
    meaningfulOpenQuestions: [
      "What is the concrete product goal?",
      "Which specialist boundaries are in scope?",
    ],
    discoverySignals: {
      assumptions: 1,
      nonGoals: 1,
      decisionBoundary: 1,
      needsInput: 1,
    },
    itemSummaries: [{ type: "agentMessage", detail: "structured discovery output" }],
    assertions: {
      explicitVerificationPassed: 0,
    },
    turn: {
      taskOutcomeStatus: "NEEDS_INPUT",
    },
  };
}

function buildDeliveryTrace({
  planningDepth = "STANDARD_PLANNING",
  assuranceDepth = "LIGHT_ASSURANCE",
  executionFlow = "STANDARD_PLANNING+LIGHT_ASSURANCE",
  durationMs = 18,
  dispatchCount = 1,
  reviewerExecuted = 0,
  testerExecuted = 0,
  transportMode = "stdio",
} = {}) {
  return {
    transportMode,
    turn: {
      status: "completed",
      taskOutcomeStatus: "COMPLETED",
      taskOutcomeReason: "completed_default",
    },
    flowTraceSummary: {
      selectedPlanningDepth: planningDepth,
      selectedAssuranceDepth: assuranceDepth,
      executionFlow,
      dispatchCount,
      dispatchSuccessCount: dispatchCount,
      reviewerExecuted,
      testerExecuted,
      childEvidenceLedger: reviewerExecuted || testerExecuted ? [{ actor: "reviewer" }] : [],
      evidenceSources: [
        "events.ndjson",
        "items.ndjson",
        "manifest.json",
        "evidence_manifest.json",
        "stage_timeline.json",
        "flow_trace_summary.json",
      ],
      acceptanceSummary: {
        passCount: 1,
        failCount: 0,
      },
      docSyncEvidence: {
        status: "PASS",
      },
      finalOutcome: {
        taskOutcomeStatus: "COMPLETED",
      },
    },
    stageTimeline: {
      stages: [{ durationMs }],
    },
    evidenceManifest: {
      requirementContract: {
        openQuestions: [],
        nonGoals: [],
        assumptions: [],
      },
      dispatchPlan: {
        proposalOnly: 0,
      },
    },
    reviewLoadBreakdown: {
      dominantBottleneck: "reviewer",
    },
  };
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function repoRelativeForTest(filePath) {
  return path.relative(path.resolve(__dirname, ".."), filePath).replace(/\\/g, "/");
}

function run() {
  const harnessTrace = buildDiscoveryTrace({
    openQuestions: [
      "What is the concrete product goal?",
      "Which specialist boundaries are in scope?",
      "What acceptance checks define success?",
    ],
    nonGoals: ["No implementation or config changes until the open questions are resolved."],
    assumptions: ["Anything outside the explicit goal stays proposal-only unless the prompt says otherwise."],
  });
  const baselineTrace = buildDiscoveryTrace({
    openQuestions: ["[FIXTURE_SCENARIO] DISCOVERY_SAMPLE"],
    nonGoals: [],
    assumptions: ["Anything outside the explicit goal stays proposal-only unless the prompt says otherwise."],
  });

  const harnessMetric = metricFromTrace(harnessTrace);
  const baselineMetric = metricFromTrace(baselineTrace);
  const rawDirectMetric = metricFromTrace(buildRawDirectTrace());

  assert.strictEqual(harnessMetric.discoveryEvidenceScore, 4, "structured discovery artifacts should earn the richer discovery evidence score");
  assert.strictEqual(baselineMetric.discoveryEvidenceScore, 2, "fixture-marker-only discovery artifacts should keep only the minimal discovery credit");
  assert(harnessMetric.evidenceQualityScore > baselineMetric.evidenceQualityScore, "structured discovery evidence should beat the weaker baseline");
  assert.strictEqual(rawDirectMetric.discoveryEvidenceScore, 5, "raw direct discovery traces should surface their direct-output evidence richness");
  assert.strictEqual(rawDirectMetric.transportMode, "stdio", "raw direct discovery traces should preserve live transport provenance");

  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "baseline-comparison-"));
  const fallbackRoot = fs.mkdtempSync(path.join(os.tmpdir(), "baseline-comparison-fallback-"));
  try {
    const rawSummaryRoot = path.join(tempRoot, "raw", "summaries");
    const rawDirectRoot = path.join(tempRoot, "raw", "raw_direct_baseline");
    const signoffSummaryPath = path.join(tempRoot, "signoff_summary.json");
    const bundleSurfaceMapPath = path.join(tempRoot, "bundle_surface_map.json");
    const fastTracePath = path.join(rawSummaryRoot, "fast_task_trace_summary.json");
    const discoveryTracePath = path.join(rawSummaryRoot, "discovery_task_trace_summary.json");
    const signoffTracePath = path.join(rawSummaryRoot, "signoff_task_trace_summary.json");
    const naturalTracePath = path.join(tempRoot, "natural_task_trace_summary.json");
    const declaredBoundaryTracePath = path.join(tempRoot, "boundary_task_trace_summary.json");
    const boundaryTracePath = path.join(tempRoot, "raw", "relocated_top_level", "boundary_task_trace_summary.json");
    const rawDirectSummaryPath = path.join(rawDirectRoot, "raw_direct_baseline_summary.json");
    const rawDirectFastPath = path.join(rawDirectRoot, "raw_direct_fast_task_trace_summary.json");
    const rawDirectDiscoveryPath = path.join(rawDirectRoot, "raw_direct_discovery_task_trace_summary.json");
    const rawDirectSignoffPath = path.join(rawDirectRoot, "raw_direct_signoff_task_trace_summary.json");
    const rawDirectNaturalPath = path.join(rawDirectRoot, "raw_direct_natural_task_trace_summary.json");
    const rawDirectBoundaryPath = path.join(rawDirectRoot, "raw_direct_boundary_task_trace_summary.json");

    writeJson(signoffSummaryPath, {
      allPassed: true,
      transportMode: "stdio",
      paths: {
        fastTaskTraceSummary: fastTracePath,
        discoveryTaskTraceSummary: discoveryTracePath,
        signoffTaskTraceSummary: signoffTracePath,
        naturalTaskTraceSummary: naturalTracePath,
        boundaryTaskTraceSummary: declaredBoundaryTracePath,
        rawDirectBaselineSummary: rawDirectSummaryPath,
        rawDirectFastTaskTraceSummary: rawDirectFastPath,
        rawDirectDiscoveryTaskTraceSummary: rawDirectDiscoveryPath,
        rawDirectSignoffTaskTraceSummary: rawDirectSignoffPath,
        rawDirectNaturalTaskTraceSummary: rawDirectNaturalPath,
        rawDirectBoundaryTaskTraceSummary: rawDirectBoundaryPath,
      },
    });
    writeJson(bundleSurfaceMapPath, {
      schema: "bundle-surface-map.v1",
      openFirst: [],
      topLevelSummaries: [],
    });
    writeJson(fastTracePath, buildDeliveryTrace({ durationMs: 24 }));
    writeJson(discoveryTracePath, harnessTrace);
    writeJson(signoffTracePath, buildDeliveryTrace({
      assuranceDepth: "SIGNOFF_ASSURANCE",
      executionFlow: "STANDARD_PLANNING+SIGNOFF_ASSURANCE",
      durationMs: 28,
      reviewerExecuted: 1,
      testerExecuted: 1,
    }));
    writeJson(naturalTracePath, buildDeliveryTrace({
      durationMs: 22,
      reviewerExecuted: 1,
    }));
    writeJson(boundaryTracePath, buildDeliveryTrace({
      durationMs: 20,
      reviewerExecuted: 1,
    }));
    writeJson(rawDirectSummaryPath, {
      status: "ok",
      transportMode: "stdio",
      directness: "app-server-direct",
      profile: "raw-codex-direct",
    });
    writeJson(rawDirectFastPath, {
      ...buildRawDirectTrace(),
      meaningfulOpenQuestions: [],
      discoverySignals: {},
      wallClockMs: 11,
      finalText: "FAST_TASK_OK sample",
      assertions: { explicitVerificationPassed: 1 },
      turn: { taskOutcomeStatus: "COMPLETED" },
    });
    writeJson(rawDirectDiscoveryPath, buildRawDirectTrace());
    writeJson(rawDirectSignoffPath, {
      ...buildRawDirectTrace(),
      meaningfulOpenQuestions: [],
      discoverySignals: {},
      wallClockMs: 13,
      finalText: "SIGNOFF_TASK_OK sample",
      assertions: { explicitVerificationPassed: 1 },
      turn: { taskOutcomeStatus: "COMPLETED" },
    });
    writeJson(rawDirectNaturalPath, {
      ...buildRawDirectTrace(),
      meaningfulOpenQuestions: [],
      discoverySignals: {},
      wallClockMs: 12,
      finalText: "DOC_TASK_OK sample",
      assertions: { explicitVerificationPassed: 1 },
      turn: { taskOutcomeStatus: "COMPLETED" },
    });
    writeJson(rawDirectBoundaryPath, {
      ...buildRawDirectTrace(),
      meaningfulOpenQuestions: [],
      discoverySignals: {},
      wallClockMs: 10,
      finalText: "BOUNDARY_TASK_OK sample",
      assertions: { explicitVerificationPassed: 1 },
      turn: { taskOutcomeStatus: "COMPLETED" },
    });

    const result = generateBaselineComparison(tempRoot);
    assert.strictEqual(result.report.approximation, "raw-codex-direct-baseline", "raw direct baseline should take precedence when all five direct traces exist");
    assert.strictEqual(result.report.aggregate.rawDirectBaselineAvailable, 1, "raw direct availability should be reported");
    assert.strictEqual(result.report.truthfulClaimStatus.liveTransportParity, "PROVEN", "all-stdio full signoff bundles should mark live parity proven");
    assert.strictEqual(result.report.rawDirectBaseline.traceCount, 5, "all raw direct traces should be counted");
    assert.strictEqual(result.report.measuredBaselineSummaryPath, "", "missing measured baseline summary should stay empty");
    assert.strictEqual(result.report.rawDirectBaselineSummaryPath, rawDirectSummaryPath, "report should point at the actual raw direct baseline summary path");
    assert.strictEqual(result.report.harnessTracePaths.boundary, boundaryTracePath, "comparison should recover the relocated boundary trace when the declared top-level path is absent");
    assert.strictEqual(result.report.aggregate.harness.sampleCount, 5, "aggregate harness metrics should count all five samples");
    assert.strictEqual(result.report.aggregate.harness.extraHitlCount, 1, "aggregate harness metrics should count discovery HITL");
    assert.strictEqual(result.report.aggregate.baseline.extraHitlCount, 1, "aggregate baseline metrics should count discovery HITL");
    const bundleSurfaceMap = JSON.parse(fs.readFileSync(bundleSurfaceMapPath, "utf8"));
    assert.deepStrictEqual(bundleSurfaceMap.topLevelSummaries, [
      repoRelativeForTest(path.join(tempRoot, "signoff_summary.json")),
      repoRelativeForTest(path.join(tempRoot, "runtime_snapshot.json")),
      repoRelativeForTest(path.join(tempRoot, "core_harness_workflow_run.json")),
      repoRelativeForTest(path.join(tempRoot, "natural_task_trace_summary.json")),
      repoRelativeForTest(path.join(tempRoot, "boundary_task_trace_summary.json")),
      repoRelativeForTest(path.join(tempRoot, "latest_run_summary.json")),
      repoRelativeForTest(path.join(tempRoot, "review_load_breakdown.json")),
      repoRelativeForTest(path.join(tempRoot, "conformance_report.json")),
      repoRelativeForTest(path.join(tempRoot, "operator_view_summary.json")),
      repoRelativeForTest(path.join(tempRoot, "bundle_surface_map.json")),
    ], "comparison refresh should normalize fixed top-level summary refs");
    assert(bundleSurfaceMap.openFirst.includes(repoRelativeForTest(path.join(tempRoot, "raw", "relocated_top_level", "baseline_comparison_report.json"))), "comparison refresh should expose the relocated comparison report in openFirst");
    assert(bundleSurfaceMap.openFirst.includes(repoRelativeForTest(path.join(tempRoot, "raw", "relocated_top_level", "speed_vs_assurance_report.md"))), "comparison refresh should expose the relocated comparison markdown in openFirst");

    const fallbackRawSummaryRoot = path.join(fallbackRoot, "raw", "summaries");
    const fallbackMeasuredRoot = path.join(fallbackRoot, "raw", "measured_baseline");
    writeJson(path.join(fallbackRoot, "signoff_summary.json"), {
      allPassed: true,
      transportMode: "stdio",
      paths: {
        fastTaskTraceSummary: path.join(fallbackRawSummaryRoot, "fast_task_trace_summary.json"),
        discoveryTaskTraceSummary: path.join(fallbackRawSummaryRoot, "discovery_task_trace_summary.json"),
        signoffTaskTraceSummary: path.join(fallbackRawSummaryRoot, "signoff_task_trace_summary.json"),
        naturalTaskTraceSummary: path.join(fallbackRoot, "natural_task_trace_summary.json"),
        measuredBaselineSummary: path.join(fallbackMeasuredRoot, "measured_baseline_summary.json"),
        baselineFastTaskTraceSummary: path.join(fallbackMeasuredRoot, "baseline_fast_task_trace_summary.json"),
      },
    });
    writeJson(path.join(fallbackRoot, "bundle_surface_map.json"), {
      schema: "bundle-surface-map.v1",
      openFirst: [],
      topLevelSummaries: [],
    });
    writeJson(path.join(fallbackRawSummaryRoot, "fast_task_trace_summary.json"), buildDeliveryTrace({ durationMs: 24 }));
    writeJson(path.join(fallbackRawSummaryRoot, "discovery_task_trace_summary.json"), harnessTrace);
    writeJson(path.join(fallbackRawSummaryRoot, "signoff_task_trace_summary.json"), buildDeliveryTrace({
      assuranceDepth: "SIGNOFF_ASSURANCE",
      executionFlow: "STANDARD_PLANNING+SIGNOFF_ASSURANCE",
      durationMs: 28,
      reviewerExecuted: 1,
      testerExecuted: 1,
    }));
    writeJson(path.join(fallbackRoot, "natural_task_trace_summary.json"), buildDeliveryTrace({ durationMs: 22, reviewerExecuted: 1 }));
    writeJson(path.join(fallbackMeasuredRoot, "measured_baseline_summary.json"), {
      profile: "live-raw-codex-like",
      transportMode: "stdio",
    });
    writeJson(path.join(fallbackMeasuredRoot, "baseline_fast_task_trace_summary.json"), buildDeliveryTrace({ durationMs: 19, dispatchCount: 0, transportMode: "stdio" }));

    const fallbackResult = generateBaselineComparison(fallbackRoot);
    assert.strictEqual(fallbackResult.report.approximation, "vanilla-like baseline profile", "partial measured baselines must not overstate approximation quality");
    assert.strictEqual(fallbackResult.report.truthfulClaimStatus.liveTransportParity, "NOT PROVEN", "fallback without a full direct/measured baseline must not claim live parity");
    assert(fallbackResult.report.gaps.includes("Measured baseline traces are incomplete; falling back to vanilla-like approximation."), "partial measured baseline should be reported as a gap");
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
    fs.rmSync(fallbackRoot, { recursive: true, force: true });
  }
}

try {
  run();
  console.log("PASS baseline_comparison_test");
} catch (error) {
  console.error(`FAIL baseline_comparison_test: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}
