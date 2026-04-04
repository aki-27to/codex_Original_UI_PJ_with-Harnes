"use strict";

const path = require("path");
const {
  exportGovernedMemoryPublicArtifacts,
} = require("./lib/governed_memory_graph");

const workspaceRoot = path.resolve(__dirname, "..");

function main() {
  const result = exportGovernedMemoryPublicArtifacts({ workspaceRoot });
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
    files: result && result.exportManifest && result.exportManifest.outputs ? result.exportManifest.outputs : {},
  };
  process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
}

main();
