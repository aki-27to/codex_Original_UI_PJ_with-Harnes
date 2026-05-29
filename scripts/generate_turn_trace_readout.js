#!/usr/bin/env node
"use strict";

const path = require("path");
const {
  defaultOutputDir,
  writeTurnTraceReadout,
} = require("./lib/turn_trace_readout_builder");
const {
  exportGovernancePublicBundle,
} = require("./lib/governance_public_bundle");

function parseArgs(argv) {
  const options = {
    sourceDir: defaultOutputDir,
    outPath: path.join(defaultOutputDir, "turn_trace_readout.html"),
    refresh: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const token = String(argv[index] || "").trim();
    if (token === "--source-dir" && argv[index + 1]) {
      options.sourceDir = argv[index + 1];
      index += 1;
      continue;
    }
    if (token === "--out" && argv[index + 1]) {
      options.outPath = argv[index + 1];
      index += 1;
      continue;
    }
    if (token === "--refresh") {
      options.refresh = true;
    }
  }
  return options;
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const sourceDir = path.resolve(options.sourceDir);
  if (options.refresh) {
    try {
      exportGovernancePublicBundle({ outputDir: sourceDir });
    } catch {
      // Existing public exports remain valid input for this readout.
    }
  }
  const result = writeTurnTraceReadout({
    sourceDir,
    outPath: path.resolve(options.outPath),
  });
  process.stdout.write(`${JSON.stringify({
    ok: true,
    artifact: path.relative(process.cwd(), result.outPath).replace(/\\/g, "/"),
    schema: result.contract.schema,
    stageCount: result.model.stageCount,
    evidenceSourceCount: result.model.evidenceSourceCount,
    changedArtifactCount: result.model.changedArtifactCount,
  }, null, 2)}\n`);
}

main();
