#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const {
  aggregateDeploymentEvidence,
  aggregateHumanBaselineEvidence,
  assertProtectedAuditRead,
  importDeploymentEvidence,
  importExternalAuditEvidence,
  importHumanBaselineEvidence,
  recomputeClaimGap,
  runFinalExternalizationCompatibility,
  runFinalExternalizationNoHitl,
  summarizeExternalAuditEvidence,
} = require("./lib/externalization_nohitl_runtime");

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function main() {
  const workspaceRoot = path.resolve(__dirname, "..");
  process.env.CODEX_HOLDOUT_EVAL_UNLOCK = process.env.CODEX_HOLDOUT_EVAL_UNLOCK || "1";
  process.env.CODEX_BLACKBOX_EVAL_UNLOCK = process.env.CODEX_BLACKBOX_EVAL_UNLOCK || "1";

  const result = await runFinalExternalizationNoHitl({ workspaceRoot });

  assert(fs.existsSync(path.join(workspaceRoot, result.humanExport.trialManifestPath)), "human trial manifest missing");
  const humanImport = importHumanBaselineEvidence({
    workspaceRoot,
    filePath: result.humanExport.mockObservedPath,
    sourceLabel: "e2e_mock_human",
  });
  assert(Number(humanImport.entry.mockCount) > 0, "human mock import missing");

  const humanAggregate = aggregateHumanBaselineEvidence({ workspaceRoot, baseOutputs: result.baseOutputs });
  assert(Number(humanAggregate.humanBaseline.observedHumanCount) === 0, "observed human count should remain zero for mock-only import");
  assert(Number(humanAggregate.humanBaseline.mockFixtureCount) > 0, "human mock fixture count missing");

  assert(fs.existsSync(path.join(workspaceRoot, result.auditExport.packRoot)), "sealed audit pack missing");
  let protectedReadBlocked = "";
  try {
    assertProtectedAuditRead({
      workspaceRoot,
      actor: "optimizer",
      targetPath: "protected/blackbox/agi_readiness_blackbox_suite.json",
    });
  } catch (error) {
    protectedReadBlocked = error instanceof Error ? error.message : String(error);
  }
  assert(protectedReadBlocked.includes("BLOCKED_BY_POLICY:protected_audit_path_denied"), "protected audit path was not blocked");

  const externalImport = importExternalAuditEvidence({
    workspaceRoot,
    filePath: result.baseOutputs.phase12.report.mockExternalImportPath,
    sourceLabel: "e2e_mock_external",
  });
  assert(Number(externalImport.entry.mockCount) > 0, "external mock import missing");

  const externalSummary = summarizeExternalAuditEvidence({ workspaceRoot });
  assert(Number(externalSummary.observedExternalAuditCount) === 0, "observed external audit count should remain zero for mock-only import");
  assert(Number(externalSummary.mockExternalAuditCount) > 0, "external mock count missing");

  const deploymentImport = importDeploymentEvidence({
    workspaceRoot,
    filePath: result.deploymentExport.mockPath,
    sourceLabel: "e2e_mock_deployment",
  });
  assert(Number(deploymentImport.entry.mockCount) > 0, "deployment mock import missing");

  const deploymentAggregate = aggregateDeploymentEvidence({ workspaceRoot });
  assert(Number(deploymentAggregate.productionLikeObservedCount) === 0, "deployment observed count should remain zero for mock-only import");
  assert(Number(deploymentAggregate.mockCount) > 0, "deployment mock count missing");

  assert(result.baseOutputs.phase13.report.publicSuite.caseCount > 0, "open-world public suite missing");
  assert(result.baseOutputs.phase13.report.blackboxSuite.caseCount > 0, "open-world blackbox suite missing");
  assert(result.baseOutputs.phase13.report.longDurationMetrics.repeatedTrials.length >= 3, "long-duration trials missing");
  assert(Number(result.baseOutputs.phase15.report.promotionDecision.rollbackAvailable) === 1, "adaptation rollback missing");
  assert(String(result.baseOutputs.phase16.report.freezeBlocked).includes("freeze_mode_blocks"), "freeze mode did not block execution");

  const blockedGap = recomputeClaimGap({
    workspaceRoot,
    claimClosureOutputs: result.baseOutputs,
    humanAggregate,
    externalAuditSummary: externalSummary,
    deploymentAggregate,
  });
  assert(blockedGap.publicClaimabilityState === "PUBLIC_AGI_CLAIM_BLOCKED", "public claim should stay blocked without observed evidence");
  assert(blockedGap.privateOperatorLoopState === "PRIVATE_LOOP_OPERATIONAL", "private operator loop state missing");
  assert(blockedGap.humanBaselineRoles.privateOperator === "calibration_only_for_private_governance", "private human baseline role mismatch");
  assert(blockedGap.remainingBlockers.includes("synthetic_only_baseline"), "synthetic baseline blocker missing");
  assert(blockedGap.remainingBlockers.includes("external_audit_not_executed"), "external audit blocker missing");

  const simulatedReady = recomputeClaimGap({
    workspaceRoot,
    claimClosureOutputs: result.baseOutputs,
    humanAggregate,
    externalAuditSummary: externalSummary,
    deploymentAggregate,
    simulationOverrides: {
      enabled: true,
      observedHumanCount: 12,
      observedExternalAuditCount: 3,
      blackboxObservedCount: 2,
      productionLikeObservedCount: 3,
      incidentRateMean: 0.05,
    },
  });
  assert(simulatedReady.publicClaimabilityState === "PUBLIC_CLAIM_READY_SIMULATION_ONLY", "simulation-only ready branch missing");

  const compatibility = await runFinalExternalizationCompatibility({ workspaceRoot });
  assert(compatibility.publicRegression.report.verifier.verdict === "PASS", "public regression failed");
  assert(compatibility.holdout.report.verifier.verdict === "PASS", "holdout eval failed");

  console.log(
    `[externalization-nohitl-e2e] live=${blockedGap.publicClaimabilityState} simulation=${simulatedReady.publicClaimabilityState} publicRegression=${compatibility.publicRegression.report.verifier.verdict} holdout=${compatibility.holdout.report.verifier.verdict}`
  );
}

if (require.main === module) {
  main().catch((error) => {
    console.error(`[externalization-nohitl-e2e] FAIL ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  });
}
