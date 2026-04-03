#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const { runClaimClosureCompatibility, runClaimClosureProgram } = require("./lib/claim_closure_runtime");

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

  const result = await runClaimClosureProgram({ workspaceRoot, phase: "all" });
  const compatibility = await runClaimClosureCompatibility({ workspaceRoot });

  const phase11 = result.phase11.report;
  const phase12 = result.phase12.report;
  const phase13 = result.phase13.report;
  const phase15 = result.phase15.report;
  const phase16 = result.phase16.report;
  const phase17 = result.phase17.claimGate;

  assert(phase11.humanBaseline.mockFixtureCount > 0, "human mock fixture import missing");
  assert(phase11.humanBaseline.observedHumanCount === 0, "observed human count should stay zero in fixture run");
  assert(fs.existsSync(path.join(workspaceRoot, phase12.sealedPackRoot)), "sealed audit pack missing");
  assert(String(phase12.breachMessage).includes("protected_audit_path_denied"), "protected path breach was not rejected");
  assert(phase13.publicSuite.caseCount > 0 && phase13.blackboxSuite.caseCount > 0, "open-world suites missing");
  assert(phase13.longDurationMetrics.repeatedTrials.length >= 3, "long duration repeated trials missing");
  assert(phase15.promotionDecision.rollbackAvailable === 1, "adaptation rollback path missing");
  assert(String(phase16.freezeBlocked).includes("freeze_mode_blocks"), "freeze mode did not block delegation");
  assert(phase17.claimGateState === "CLAIM_READY_FOR_EXTERNAL_REVIEW", "internal claim state not raised to external-review readiness");
  assert(phase17.publicClaimState === "PUBLIC_AGI_CLAIM_BLOCKED", "public claim should remain blocked");

  const finalReport = readJson(path.join(workspaceRoot, result.phase17.reportPath));
  assert(Array.isArray(finalReport.remainingBlockers) && finalReport.remainingBlockers.includes("synthetic_only_baseline"), "remaining blockers missing synthetic baseline block");

  console.log(
    `[claim-closure-e2e] claim=${phase17.claimGateState} public=${phase17.publicClaimState} publicRegression=${compatibility.publicRegression.report.verifier.verdict} holdout=${compatibility.holdout.report.verifier.verdict}`
  );
}

if (require.main === module) {
  main().catch((error) => {
    console.error(`[claim-closure-e2e] FAIL ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  });
}
