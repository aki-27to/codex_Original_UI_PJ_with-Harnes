#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const { runMultiAgentPublicBaseline } = require("./lib/bounded_multi_agent_orchestrator");

const workspaceRoot = path.resolve(__dirname, "..");

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function main() {
  const report = await runMultiAgentPublicBaseline({ workspaceRoot });
  const outputPath = path.join(workspaceRoot, "output", "multi_agent_public_baseline.json");
  const summaryPath = path.join(workspaceRoot, "output", "multi_agent_public_baseline_summary.json");
  writeJson(outputPath, report);
  writeJson(summaryPath, {
    schema: "multi-agent-public-baseline-summary.v1",
    generatedAt: report.generatedAt,
    verdict: report.verdict,
    caseCount: Array.isArray(report.results) ? report.results.length : 0,
    families: Array.from(new Set((Array.isArray(report.results) ? report.results : []).map((entry) => entry.familyId).filter(Boolean))),
  });
  console.log(`[multi-agent-baseline] verdict=${report.verdict} output=${path.relative(workspaceRoot, outputPath).replace(/\\/g, "/")}`);
  if (report.verdict !== "PASS") {
    process.exitCode = 1;
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(`[multi-agent-baseline] FAIL ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  });
}

module.exports = {
  main,
};
