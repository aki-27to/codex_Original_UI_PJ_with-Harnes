#!/usr/bin/env node
"use strict";

const path = require("path");
const {
  appendImprovementAuditLog,
  readLatestCheckpoint,
  restoreCheckpoint,
} = require("./lib/improvement_checkpoint");

const workspaceRoot = path.resolve(__dirname, "..");

async function main() {
  const latest = readLatestCheckpoint({ workspaceRoot });
  if (!latest) {
    throw new Error("no_checkpoint_available");
  }
  const rollback = restoreCheckpoint({ checkpointRoot: latest });
  const auditPath = appendImprovementAuditLog({
    workspaceRoot,
    entry: {
      action: "manual_rollback_latest",
      checkpointId: rollback.checkpointId,
      rollback,
    },
  });
  console.log(`[self-improvement-rollback] checkpoint=${rollback.checkpointId} audit=${path.relative(workspaceRoot, auditPath).replace(/\\/g, "/")}`);
}

main().catch((error) => {
  console.error(`[self-improvement-rollback] FAIL ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
