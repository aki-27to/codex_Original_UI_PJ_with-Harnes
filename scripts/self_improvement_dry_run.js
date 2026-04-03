#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const {
  clonePolicyForDryRun,
  loadLearningPolicyByLane,
  refreshSelfImprovementArtifacts,
  summarizeSelfImprovementResult,
} = require("./lib/self_improvement_phase1");

const workspaceRoot = path.resolve(__dirname, "..");

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function main() {
  const laneArg = process.argv.find((entry) => entry.startsWith("--lane="));
  const lane = laneArg ? laneArg.split("=", 2)[1] : "openai_blog";
  const loaded = loadLearningPolicyByLane(lane);
  const dryRunRoot = path.join(workspaceRoot, "output", "phase1_dry_runs", `${loaded.lane}-${Date.now()}`);
  const dryRunPolicy = clonePolicyForDryRun(loaded.policy, dryRunRoot);
  const result = refreshSelfImprovementArtifacts({ policy: dryRunPolicy });
  const summary = {
    schema: "phase1-self-improvement-dry-run.v1",
    generatedAt: new Date().toISOString(),
    lane: loaded.lane,
    dryRunRoot: path.relative(workspaceRoot, dryRunRoot).replace(/\\/g, "/"),
    result: summarizeSelfImprovementResult(result),
  };
  writeJson(path.join(dryRunRoot, "summary.json"), summary);
  console.log(`[self-improvement-dry-run] lane=${loaded.lane} gate=${summary.result.gateStatus} decision=${summary.result.appliedDecision} output=${summary.dryRunRoot}/summary.json`);
}

main().catch((error) => {
  console.error(`[self-improvement-dry-run] FAIL ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
