#!/usr/bin/env node
"use strict";

const path = require("path");
const { runClaimClosureProgram } = require("./lib/claim_closure_runtime");

async function main() {
  const phase = process.argv[2] || "all";
  const workspaceRoot = path.resolve(__dirname, "..");
  const result = await runClaimClosureProgram({ workspaceRoot, phase });
  const completed = Object.keys(result);
  console.log(`[claim-closure] phase=${phase} completed=${completed.join(",")}`);
}

if (require.main === module) {
  main().catch((error) => {
    console.error(`[claim-closure] FAIL ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  });
}
