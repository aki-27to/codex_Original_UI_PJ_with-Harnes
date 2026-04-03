#!/usr/bin/env node
"use strict";

const path = require("path");
const { runRemainingProgram } = require("./lib/remaining_program_runtime");

async function main() {
  const phase = process.argv[2] || "all";
  const workspaceRoot = path.resolve(__dirname, "..");
  const result = await runRemainingProgram({ workspaceRoot, phase });
  const completed = Object.keys(result);
  console.log(`[remaining-program] phase=${phase} completed=${completed.join(",")}`);
}

if (require.main === module) {
  main().catch((error) => {
    console.error(`[remaining-program] FAIL ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  });
}
