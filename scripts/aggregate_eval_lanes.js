#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const { loadEvalLanePolicy } = require("./lib/eval_lane_policy");

const workspaceRoot = path.resolve(__dirname, "..");

function readJsonIfExists(filePath) {
  if (!fs.existsSync(filePath)) return null;
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function summarizeLaneFile(lane, payload) {
  const source = payload && typeof payload === "object" ? payload : {};
  return {
    laneId: lane.id,
    visibility: lane.visibility,
    verifierVerdict: source.verifierVerdict || (source.verifier && source.verifier.verdict) || "NOT_RUN",
    verifierReason: source.verifierReason || (source.verifier && source.verifier.reason) || "",
    suiteId: source.suiteId || (source.apiReport && source.apiReport.suite && source.apiReport.suite.suiteId) || "",
    runId: source.runId || (source.apiReport && source.apiReport.runId) || "",
    failureCount: Number.isFinite(Number(source.failureCount || (source.verifier && source.verifier.failureCount))) ? Math.max(0, Math.trunc(Number(source.failureCount || (source.verifier && source.verifier.failureCount)))) : 0,
  };
}

async function main() {
  const policy = loadEvalLanePolicy(undefined, { workspaceRoot });
  const lanes = Array.isArray(policy.lanes) ? policy.lanes : [];
  const summaries = lanes.map((lane) => {
    const payload = readJsonIfExists(lane.visibility === "protected" ? lane.summaryPath : lane.outputPath);
    return summarizeLaneFile(lane, payload);
  });
  const aggregate = {
    schema: "phase1-eval-lane-aggregate.v1",
    generatedAt: new Date().toISOString(),
    publicLaneId: policy.publicLaneId,
    lanes: summaries,
    overallStatus: summaries.every((entry) => entry.verifierVerdict === "PASS") ? "PASS" : "FAIL",
  };
  writeJson(policy.aggregateOutputPath, aggregate);
  console.log(`[eval-aggregate] status=${aggregate.overallStatus} output=${path.relative(workspaceRoot, policy.aggregateOutputPath).replace(/\\/g, "/")}`);
  if (aggregate.overallStatus !== "PASS") {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(`[eval-aggregate] FAIL ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
