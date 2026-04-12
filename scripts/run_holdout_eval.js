#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const { loadEvalLanePolicy, loadEvalSuiteForLane } = require("./lib/eval_lane_policy");
const { buildIndependentVerifierReport } = require("./lib/independent_verifier");
const { requestJson, startHarnessForPhase1 } = require("./lib/harness_api_client");

const workspaceRoot = path.resolve(__dirname, "..");

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function runHoldoutEval({
  laneId = "hidden_holdout",
  actor = "release",
  port = 57573,
  label = "holdout-regression",
} = {}) {
  const lanePolicy = loadEvalLanePolicy(undefined, { workspaceRoot });
  const { lane, suite } = loadEvalSuiteForLane({ policy: lanePolicy, laneId, actor, env: process.env });
  const proofRoot = path.join(workspaceRoot, "logs", "archive", "raw", "phase1_runs", `${label}-${Date.now()}`);
  const harness = await startHarnessForPhase1({
    workspaceRoot,
    proofRoot,
    port,
  });
  try {
    const res = await requestJson({
      port: harness.port,
      path: "/api/eval/run",
      method: "POST",
      headers: harness.authHeaders,
      body: {
        laneId: lane.id,
        actor,
        suite,
        variants: [
          {
            label: "holdout-gate",
            agentName: "default",
            executionProfile: "eval-holdout-regression",
            requestUserInputPolicy: "blocked",
            webSearch: 0,
          },
        ],
      },
      timeoutMs: 240000,
    });
    if (res.statusCode !== 200 || !res.json || res.json.ok !== true || !res.json.report) {
      throw new Error(`holdout eval failed to execute (${res.raw || res.statusCode})`);
    }
    const report = res.json.report;
    const verifier = buildIndependentVerifierReport({
      laneId: lane.id,
      suite,
      runs: Array.isArray(report.runs) ? report.runs : [],
      policy: lane.verifierPolicy,
      source: "holdout_regression_runner",
    });
    const detailedReport = {
      schema: "phase1-holdout-regression-report.v1",
      generatedAt: new Date().toISOString(),
      lane: {
        id: lane.id,
        visibility: lane.visibility,
      },
      proofRoot: path.relative(workspaceRoot, harness.proofRoot).replace(/\\/g, "/"),
      apiReport: report,
      verifier,
    };
    writeJson(lane.outputPath, detailedReport);
    writeJson(lane.summaryPath, {
      schema: "phase1-holdout-redacted-summary.v1",
      generatedAt: detailedReport.generatedAt,
      laneId: lane.id,
      verifierVerdict: verifier.verdict,
      verifierReason: verifier.reason,
      suiteId: report && report.suite ? report.suite.suiteId : "",
      runId: report.runId,
      failureCount: verifier.failureCount,
      proofRoot: detailedReport.proofRoot,
    });
    return {
      ok: verifier.verdict === "PASS",
      lane,
      suite,
      report: detailedReport,
    };
  } finally {
    await harness.handle.stop();
  }
}

async function main() {
  const result = await runHoldoutEval({
    actor: process.env.PHASE1_EVAL_ACTOR || "release",
  });
  console.log(`[holdout-eval] verifier=${result.report.verifier.verdict} summary=${path.relative(workspaceRoot, result.lane.summaryPath).replace(/\\/g, "/")}`);
  if (!result.ok) {
    process.exitCode = 1;
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(`[holdout-eval] FAIL ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  });
}

module.exports = {
  runHoldoutEval,
};
