#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const { runCompatibilitySuite, runRemainingProgram } = require("./lib/remaining_program_runtime");

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

async function main() {
  const workspaceRoot = path.resolve(__dirname, "..");
  process.env.CODEX_HOLDOUT_EVAL_UNLOCK = process.env.CODEX_HOLDOUT_EVAL_UNLOCK || "1";
  process.env.CODEX_BLACKBOX_EVAL_UNLOCK = process.env.CODEX_BLACKBOX_EVAL_UNLOCK || "1";

  const result = await runRemainingProgram({ workspaceRoot, phase: "all" });
  const compatibility = await runCompatibilitySuite({ workspaceRoot });

  const requiredPaths = [
    path.join(workspaceRoot, result.phase5.scorecardPath),
    path.join(workspaceRoot, result.phase6.reportPath),
    path.join(workspaceRoot, result.phase7.curriculumPath),
    path.join(workspaceRoot, result.phase8.reportPath),
    path.join(workspaceRoot, result.phase9.reportPath),
    path.join(workspaceRoot, result.phase10.readinessReportPath),
    path.join(workspaceRoot, result.phase10.claimGatePath),
  ];
  for (const filePath of requiredPaths) {
    assert(fs.existsSync(filePath), `missing output:${filePath}`);
  }

  const claimGate = readJson(path.join(workspaceRoot, result.phase10.claimGatePath));
  assert(claimGate.claimRecommendation !== "READY_FOR_EXTERNAL_AUDIT", "claim gate unexpectedly passed external audit threshold");
  assert(["NOT_READY", "PARTIAL_READINESS"].includes(claimGate.claimRecommendation), "unexpected claim recommendation");

  const phase5Scorecard = readJson(path.join(workspaceRoot, result.phase5.scorecardPath));
  assert(Number(phase5Scorecard.performanceScore || 0) >= 0, "phase5 scorecard missing");

  console.log(`[remaining-program-e2e] phase10=${claimGate.claimRecommendation} public=${compatibility.publicRegression.report.verifier.verdict} holdout=${compatibility.holdout.report.verifier.verdict}`);
}

if (require.main === module) {
  main().catch((error) => {
    console.error(`[remaining-program-e2e] FAIL ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  });
}
