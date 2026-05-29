#!/usr/bin/env node
"use strict";

const { writeEvidencePage } = require("./lib/evidence_page_builder");

function readArg(name) {
  const index = process.argv.indexOf(name);
  if (index === -1 || index + 1 >= process.argv.length) {
    return "";
  }
  return process.argv[index + 1];
}

try {
  const sourceDir = readArg("--source") || undefined;
  const outPath = readArg("--out") || undefined;
  const result = writeEvidencePage({ sourceDir, outPath });
  console.log(`[evidence-page] wrote ${result.outPath}`);
  console.log(`[evidence-page] sections=${result.model.sections.length}`);
} catch (error) {
  console.error(`[evidence-page] FAIL ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}
