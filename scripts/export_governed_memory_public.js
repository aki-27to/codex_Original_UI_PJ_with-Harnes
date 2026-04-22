"use strict";

const path = require("path");
const {
  exportGovernedMemoryPublicArtifacts,
} = require("./lib/governed_memory_graph");
const {
  exportGovernancePublicBundle,
} = require("./lib/governance_public_bundle");
const {
  refreshGovernedLiveAgiBundle,
} = require("./lib/governed_live_agi_bundle");

const workspaceRoot = path.resolve(__dirname, "..");

function main() {
  let result = exportGovernedMemoryPublicArtifacts({ workspaceRoot });
  const bundleRefresh = refreshGovernedLiveAgiBundle({ workspaceRoot });
  if (bundleRefresh && bundleRefresh.written) {
    result = exportGovernedMemoryPublicArtifacts({ workspaceRoot });
  }
  let governanceBundleRefreshed = false;
  try {
    exportGovernancePublicBundle();
    governanceBundleRefreshed = true;
    result = exportGovernedMemoryPublicArtifacts({ workspaceRoot });
  } catch (error) {
    governanceBundleRefreshed = false;
  }
  const payload = {
    ok: true,
    workspaceId: result && result.summary ? result.summary.workspaceId : "",
    status: result && result.evalStatus ? result.evalStatus.status : "UNKNOWN",
    publicOutputRoot: result && result.paths && result.paths.publicOutput
      ? path.relative(workspaceRoot, result.paths.publicOutput.root).replace(/\\/g, "/")
      : "output/memory_public",
    agiReadinessRoot: result && result.paths && result.paths.agiReadiness
      ? path.relative(workspaceRoot, result.paths.agiReadiness.root).replace(/\\/g, "/")
      : "output/agi_readiness",
    continuityPublicRoot: result && result.paths && result.paths.continuityPublic
      ? path.relative(workspaceRoot, result.paths.continuityPublic.root).replace(/\\/g, "/")
      : "output/continuity_public",
    governedLiveBundleRefreshed: Boolean(bundleRefresh && bundleRefresh.written),
    governanceBundleRefreshed,
    files: result && result.exportManifest && result.exportManifest.outputs ? result.exportManifest.outputs : {},
  };
  process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
}

main();
