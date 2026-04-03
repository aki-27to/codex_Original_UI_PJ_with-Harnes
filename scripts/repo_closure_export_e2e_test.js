#!/usr/bin/env node
"use strict";

const { spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function runJson(args, workspaceRoot) {
  const result = spawnSync(process.execPath, args, {
    cwd: workspaceRoot,
    encoding: "utf8",
    env: {
      ...process.env,
      CODEX_HOLDOUT_EVAL_UNLOCK: process.env.CODEX_HOLDOUT_EVAL_UNLOCK || "1",
      CODEX_BLACKBOX_EVAL_UNLOCK: process.env.CODEX_BLACKBOX_EVAL_UNLOCK || "1",
    },
  });
  if (result.status !== 0) {
    throw new Error(`command_failed:${args.join(" ")}\nSTDOUT:\n${result.stdout}\nSTDERR:\n${result.stderr}`);
  }
  return JSON.parse(result.stdout);
}

function main() {
  const workspaceRoot = path.resolve(__dirname, "..");
  const preflight = runJson(["scripts/run_repo_closure_export.js", "full_preflight"], workspaceRoot);
  assert(preflight.status === "AUTO_PASS", "full_preflight did not return AUTO_PASS");
  assert(preflight.structuredStatus.repoImplementationStatus === "PARTIAL" || preflight.structuredStatus.repoImplementationStatus === "DONE", "unexpected repoImplementationStatus");
  assert(preflight.structuredStatus.publicClaimStatus === "PUBLIC_CLAIM_BLOCKED", "live public claim should remain blocked");

  const packetExport = runJson(["scripts/run_repo_closure_export.js", "export_all_external_packets"], workspaceRoot);
  assert(packetExport.packetPaths.length === 5, "expected five external packets");

  const dryRun = runJson(["scripts/run_repo_closure_export.js", "import_all_observed", "--mode", "dry_run"], workspaceRoot);
  assert(dryRun.status === "AUTO_PASS", "dry_run import did not pass");

  const liveRecompute = runJson(["scripts/run_repo_closure_export.js", "recompute_public_claim"], workspaceRoot);
  assert(liveRecompute.publicClaimabilityState === "PUBLIC_AGI_CLAIM_BLOCKED", "live recompute should stay blocked");

  const simulationRecompute = runJson([
    "scripts/run_repo_closure_export.js",
    "recompute_public_claim",
    "--simulation",
    "--sim_humans",
    "12",
    "--sim_audits",
    "3",
    "--sim_blackbox",
    "2",
    "--sim_deployments",
    "3",
    "--sim_incident_mean",
    "0.05",
  ], workspaceRoot);
  assert(simulationRecompute.publicClaimabilityState === "PUBLIC_CLAIM_READY_SIMULATION_ONLY", "simulation recompute should hit simulation-only ready");

  const externalizationE2e = spawnSync(process.execPath, ["scripts/externalization_nohitl_e2e_test.js"], {
    cwd: workspaceRoot,
    encoding: "utf8",
    env: {
      ...process.env,
      CODEX_HOLDOUT_EVAL_UNLOCK: process.env.CODEX_HOLDOUT_EVAL_UNLOCK || "1",
      CODEX_BLACKBOX_EVAL_UNLOCK: process.env.CODEX_BLACKBOX_EVAL_UNLOCK || "1",
    },
  });
  if (externalizationE2e.status !== 0) {
    throw new Error(`externalization_e2e_failed\nSTDOUT:\n${externalizationE2e.stdout}\nSTDERR:\n${externalizationE2e.stderr}`);
  }

  const claimClosureE2e = spawnSync(process.execPath, ["scripts/claim_closure_program_e2e_test.js"], {
    cwd: workspaceRoot,
    encoding: "utf8",
    env: {
      ...process.env,
      CODEX_HOLDOUT_EVAL_UNLOCK: process.env.CODEX_HOLDOUT_EVAL_UNLOCK || "1",
      CODEX_BLACKBOX_EVAL_UNLOCK: process.env.CODEX_BLACKBOX_EVAL_UNLOCK || "1",
    },
  });
  if (claimClosureE2e.status !== 0) {
    throw new Error(`claim_closure_e2e_failed\nSTDOUT:\n${claimClosureE2e.stdout}\nSTDERR:\n${claimClosureE2e.stderr}`);
  }

  const proofPath = path.join(workspaceRoot, "output", "repo_closure_export", "repo_closure_e2e_status.json");
  fs.mkdirSync(path.dirname(proofPath), { recursive: true });
  fs.writeFileSync(proofPath, `${JSON.stringify({
    schema: "repo-closure-e2e-status.v1",
    generatedAt: new Date().toISOString(),
    status: "AUTO_PASS",
    livePublicClaimStatus: preflight.structuredStatus.publicClaimStatus,
    dryRunClaimState: dryRun.claimGapState,
    simulationClaimState: simulationRecompute.publicClaimabilityState,
  }, null, 2)}\n`, "utf8");

  console.log(`[repo-closure-e2e] preflight=${preflight.structuredStatus.publicClaimStatus} dryRun=${dryRun.claimGapState} simulation=${simulationRecompute.publicClaimabilityState}`);
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(`[repo-closure-e2e] FAIL ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}
