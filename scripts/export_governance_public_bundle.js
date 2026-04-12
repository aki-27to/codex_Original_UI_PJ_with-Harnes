#!/usr/bin/env node
"use strict";

const path = require("path");
const {
  defaultLatestSignoffSummaryPath,
  defaultOutputDir,
  exportGovernancePublicBundle,
} = require("./lib/governance_public_bundle");

function safeString(value, max = 400) {
  if (typeof value !== "string") {
    return "";
  }
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, max) : "";
}

function parseArgs(argv) {
  const out = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = safeString(argv[index], 160);
    if (token === "--latest-signoff-summary" && argv[index + 1]) {
      out.latestSignoffSummaryPath = argv[index + 1];
      index += 1;
      continue;
    }
    if (token === "--out-dir" && argv[index + 1]) {
      out.outputDir = argv[index + 1];
      index += 1;
    }
  }
  return out;
}

function main() {
  const parsed = parseArgs(process.argv.slice(2));
  const result = exportGovernancePublicBundle({
    latestSignoffSummaryPath: parsed.latestSignoffSummaryPath || defaultLatestSignoffSummaryPath,
    outputDir: parsed.outputDir || defaultOutputDir,
  });
  process.stdout.write(
    `${JSON.stringify({
      ok: true,
      outputDir: path.relative(process.cwd(), result.outputDir).replace(/\\/g, "/"),
      finalDecision: result.overview.finalDecision,
      selectedTurnId: result.overview.selectedTurnId,
      exportedFiles: result.overview.exportedFiles,
    }, null, 2)}\n`
  );
}

main();
