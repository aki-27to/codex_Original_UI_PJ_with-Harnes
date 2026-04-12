#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const { loadEvalLanePolicy, loadEvalSuiteForLane } = require("./lib/eval_lane_policy");
const { buildIndependentVerifierReport } = require("./lib/independent_verifier");
const { requestJson, startHarnessForPhase1 } = require("./lib/harness_api_client");
const { runMultiAgentPublicBaseline } = require("./lib/bounded_multi_agent_orchestrator");

const workspaceRoot = path.resolve(__dirname, "..");

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function appendJsonl(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.appendFileSync(filePath, `${JSON.stringify(value)}\n`, "utf8");
}

async function runPublicRegression({
  laneId = "public_regression",
  actor = "ci",
  port = 57572,
  label = "public-regression",
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
            label: "public-gate",
            agentName: "default",
            executionProfile: "eval-public-regression",
            requestUserInputPolicy: "blocked",
            webSearch: 0,
          },
        ],
      },
      timeoutMs: 240000,
    });
    if (res.statusCode !== 200 || !res.json || res.json.ok !== true || !res.json.report) {
      throw new Error(`public regression failed to execute (${res.raw || res.statusCode})`);
    }
    const report = res.json.report;
    const verifier = buildIndependentVerifierReport({
      laneId: lane.id,
      suite,
      runs: Array.isArray(report.runs) ? report.runs : [],
      policy: lane.verifierPolicy,
      source: "public_regression_runner",
    });
    const multiAgentBaseline = await runMultiAgentPublicBaseline({ workspaceRoot });
    const finalReport = {
      schema: "phase1-public-regression-report.v1",
      generatedAt: new Date().toISOString(),
      lane: {
        id: lane.id,
        visibility: lane.visibility,
      },
      proofRoot: path.relative(workspaceRoot, harness.proofRoot).replace(/\\/g, "/"),
      runtimeSuiteId: report && report.suite ? report.suite.suiteId : "",
      apiReport: report,
      verifier,
      multiAgentBaseline,
    };
    writeJson(lane.outputPath, finalReport);
    writeJson(lane.summaryPath, {
      schema: "phase1-public-regression-summary.v1",
      generatedAt: finalReport.generatedAt,
      laneId: lane.id,
      verifierVerdict: verifier.verdict,
      verifierReason: verifier.reason,
      suiteId: report && report.suite ? report.suite.suiteId : "",
      runId: report.runId,
      failureCount: verifier.failureCount,
      multiAgentBaselineVerdict: multiAgentBaseline.verdict,
    });
    appendJsonl(lane.historyPath, {
      generatedAt: finalReport.generatedAt,
      laneId: lane.id,
      runId: report.runId,
      verifierVerdict: verifier.verdict,
      verifierReason: verifier.reason,
      suiteId: report && report.suite ? report.suite.suiteId : "",
      proofRoot: finalReport.proofRoot,
      multiAgentBaselineVerdict: multiAgentBaseline.verdict,
    });
    return {
      ok: verifier.verdict === "PASS" && multiAgentBaseline.verdict === "PASS",
      lane,
      suite,
      report: finalReport,
    };
  } finally {
    await harness.handle.stop();
  }
}

async function main() {
  const result = await runPublicRegression();
  console.log(`[public-regression] suite=${result.report.runtimeSuiteId} verifier=${result.report.verifier.verdict} multi_agent=${result.report.multiAgentBaseline.verdict} output=${path.relative(workspaceRoot, result.lane.outputPath).replace(/\\/g, "/")}`);
  if (!result.ok) {
    process.exitCode = 1;
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(`[public-regression] FAIL ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  });
}

module.exports = {
  runPublicRegression,
};
