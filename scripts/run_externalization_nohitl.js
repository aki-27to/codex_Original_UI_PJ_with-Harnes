#!/usr/bin/env node
"use strict";

const path = require("path");
const {
  adjudicateHumanBaselineEvidence,
  analyzeNoHitl,
  assertProtectedAuditRead,
  exportDeploymentEvidenceTemplate,
  exportExternalAuditPack,
  exportHumanBaselineRunner,
  importDeploymentEvidence,
  importExternalAuditEvidence,
  importHumanBaselineEvidence,
  recomputeClaimGap,
  runFinalExternalizationCompatibility,
  runFinalExternalizationNoHitl,
  summarizeExternalAuditEvidence,
  verifyExternalAuditPack,
  aggregateHumanBaselineEvidence,
  aggregateDeploymentEvidence,
} = require("./lib/externalization_nohitl_runtime");
const { runClaimClosureProgram } = require("./lib/claim_closure_runtime");

function parseFlags(argv) {
  const out = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) continue;
    const key = token.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) {
      out[key] = true;
      continue;
    }
    out[key] = next;
    index += 1;
  }
  return out;
}

async function main() {
  const workspaceRoot = path.resolve(__dirname, "..");
  const command = (process.argv[2] || "full").toLowerCase();
  const flags = parseFlags(process.argv.slice(3));
  if (command === "full") {
    const result = await runFinalExternalizationNoHitl({ workspaceRoot });
    console.log(JSON.stringify({
      status: "AUTO_PASS",
      claimGapPath: result.claimGapPath,
      noHitlPath: result.noHitlPath,
      publicClaimabilityState: result.claimGap.publicClaimabilityState,
    }));
    return;
  }
  if (command === "no-hitl-analyze") {
    const baseOutputs = await runClaimClosureProgram({ workspaceRoot, phase: "all" });
    const result = analyzeNoHitl({
      workspaceRoot,
      claimClosureOutputs: baseOutputs,
      humanAggregate: { humanBaseline: baseOutputs.phase11.report.humanBaseline },
      externalAuditSummary: baseOutputs.phase12.report.externalAuditStatus,
      deploymentAggregate: { productionLikeObservedCount: 0, observedMetrics: { incidentRate: { mean: 0 } } },
    });
    console.log(JSON.stringify(result));
    return;
  }
  if (command === "human-export") {
    const baseOutputs = await runClaimClosureProgram({ workspaceRoot, phase: "all" });
    console.log(JSON.stringify(await exportHumanBaselineRunner({ workspaceRoot, baseOutputs })));
    return;
  }
  if (command === "human-import") {
    console.log(JSON.stringify(importHumanBaselineEvidence({
      workspaceRoot,
      filePath: flags.file || flags.path,
      sourceLabel: flags.label || "cli_import",
    })));
    return;
  }
  if (command === "human-adjudicate") {
    console.log(JSON.stringify(adjudicateHumanBaselineEvidence({
      workspaceRoot,
      primaryPath: flags.primary,
      secondaryPath: flags.secondary || "",
      tieBreakPath: flags.tie_break || "",
    })));
    return;
  }
  if (command === "human-aggregate") {
    const baseOutputs = await runClaimClosureProgram({ workspaceRoot, phase: "all" });
    console.log(JSON.stringify(aggregateHumanBaselineEvidence({ workspaceRoot, baseOutputs })));
    return;
  }
  if (command === "audit-export") {
    console.log(JSON.stringify(exportExternalAuditPack({
      workspaceRoot,
      mode: flags.mode || "blackbox",
    })));
    return;
  }
  if (command === "audit-verify") {
    console.log(JSON.stringify(verifyExternalAuditPack({
      workspaceRoot,
      packRoot: flags.pack,
    })));
    return;
  }
  if (command === "audit-import") {
    console.log(JSON.stringify(importExternalAuditEvidence({
      workspaceRoot,
      filePath: flags.file || flags.path,
      sourceLabel: flags.label || "cli_import",
    })));
    return;
  }
  if (command === "audit-summary") {
    console.log(JSON.stringify(summarizeExternalAuditEvidence({ workspaceRoot })));
    return;
  }
  if (command === "deployment-export") {
    console.log(JSON.stringify(exportDeploymentEvidenceTemplate({ workspaceRoot })));
    return;
  }
  if (command === "deployment-import") {
    console.log(JSON.stringify(importDeploymentEvidence({
      workspaceRoot,
      filePath: flags.file || flags.path,
      sourceLabel: flags.label || "cli_import",
    })));
    return;
  }
  if (command === "deployment-aggregate") {
    console.log(JSON.stringify(aggregateDeploymentEvidence({ workspaceRoot })));
    return;
  }
  if (command === "claim-recompute") {
    const baseOutputs = await runClaimClosureProgram({ workspaceRoot, phase: "all" });
    const humanAggregate = aggregateHumanBaselineEvidence({ workspaceRoot, baseOutputs });
    const externalAuditSummary = summarizeExternalAuditEvidence({ workspaceRoot });
    const deploymentAggregate = aggregateDeploymentEvidence({ workspaceRoot });
    const simulationOverrides = flags.simulation
      ? {
          enabled: true,
          observedHumanCount: Number(flags.sim_humans || 12),
          observedExternalAuditCount: Number(flags.sim_audits || 3),
          blackboxObservedCount: Number(flags.sim_blackbox || 2),
          productionLikeObservedCount: Number(flags.sim_deployments || 3),
          incidentRateMean: Number(flags.sim_incident_mean || 0.05),
        }
      : null;
    console.log(JSON.stringify(recomputeClaimGap({
      workspaceRoot,
      claimClosureOutputs: baseOutputs,
      humanAggregate,
      externalAuditSummary,
      deploymentAggregate,
      simulationOverrides,
    })));
    return;
  }
  if (command === "protected-read-check") {
    console.log(JSON.stringify(assertProtectedAuditRead({
      workspaceRoot,
      actor: flags.actor || "optimizer",
      targetPath: flags.target || "protected/blackbox/agi_readiness_blackbox_suite.json",
    })));
    return;
  }
  if (command === "compat") {
    const compatibility = await runFinalExternalizationCompatibility({ workspaceRoot });
    console.log(JSON.stringify({
      status: "AUTO_PASS",
      publicRegressionVerdict: compatibility.publicRegression.report.verifier.verdict,
      holdoutVerdict: compatibility.holdout.report.verifier.verdict,
    }));
    return;
  }
  throw new Error(`unknown_command:${command}`);
}

if (require.main === module) {
  main().catch((error) => {
    console.error(JSON.stringify({
      status: "AUTO_FAIL",
      error: error instanceof Error ? error.message : String(error),
    }));
    process.exitCode = 1;
  });
}
