#!/usr/bin/env node
"use strict";

const path = require("path");
const {
  exportAllExternalPackets,
  fullPreflight,
  importAllObserved,
  recomputePublicClaim,
} = require("./lib/repo_closure_export_runtime");

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
  const command = safeCommand(process.argv[2] || "full_preflight");
  const flags = parseFlags(process.argv.slice(3));

  if (command === "full_preflight") {
    console.log(JSON.stringify(await fullPreflight({ workspaceRoot })));
    return;
  }
  if (command === "export_all_external_packets") {
    console.log(JSON.stringify(await exportAllExternalPackets({ workspaceRoot })));
    return;
  }
  if (command === "import_all_observed") {
    console.log(JSON.stringify(await importAllObserved({
      workspaceRoot,
      mode: flags.mode || "live",
      humanPath: flags.human || "",
      auditPath: flags.audit || "",
      deploymentPath: flags.deployment || "",
    })));
    return;
  }
  if (command === "recompute_public_claim") {
    console.log(JSON.stringify(await recomputePublicClaim({
      workspaceRoot,
      simulation: Boolean(flags.simulation),
      simHumans: Number(flags.sim_humans || 12),
      simAudits: Number(flags.sim_audits || 3),
      simBlackbox: Number(flags.sim_blackbox || 2),
      simDeployments: Number(flags.sim_deployments || 3),
      simIncidentMean: Number(flags.sim_incident_mean || 0.05),
    })));
    return;
  }
  throw new Error(`unknown_command:${command}`);
}

function safeCommand(value) {
  return String(value || "").trim().toLowerCase();
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
