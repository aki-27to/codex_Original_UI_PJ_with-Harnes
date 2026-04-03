#!/usr/bin/env node
"use strict";

const path = require("path");
const { readImprovementAuditLog } = require("./lib/improvement_checkpoint");

const workspaceRoot = path.resolve(__dirname, "..");

async function main() {
  const result = readImprovementAuditLog({ workspaceRoot, limit: 20 });
  console.log(`[self-improvement-audit] path=${path.relative(workspaceRoot, result.logPath).replace(/\\/g, "/")} entries=${result.entries.length}`);
  console.log(JSON.stringify(result.entries, null, 2));
}

main().catch((error) => {
  console.error(`[self-improvement-audit] FAIL ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
