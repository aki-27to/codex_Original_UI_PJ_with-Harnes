#!/usr/bin/env node
"use strict";

const {
  loadAnthropicEngineeringLearningPolicy,
  runAnthropicEngineeringLearningCycle,
} = require("./lib/anthropic_engineering_learning");

async function main() {
  const policy = loadAnthropicEngineeringLearningPolicy();
  const result = await runAnthropicEngineeringLearningCycle({ policy });
  const summary = result && result.report && result.report.summary ? result.report.summary : {};
  console.log(`[anthropic-engineering-learning] status=${result.report.status}`);
  console.log(`[anthropic-engineering-learning] tracked=${Number(summary.trackedArticles) || 0} new=${Number(summary.newArticlesThisRun) || 0} proposals=${Number(summary.pendingProposals) || 0}`);
  console.log(`[anthropic-engineering-learning] ledger=${result.report.paths.ledgerPath}`);
  console.log(`[anthropic-engineering-learning] digest=${result.report.paths.digestPath}`);
  console.log(`[anthropic-engineering-learning] report=${result.report.paths.reportPath}`);
  console.log(`[anthropic-engineering-learning] curatedDoc=${result.report.paths.curatedDocPath}`);
}

main().catch((error) => {
  console.error(`[anthropic-engineering-learning] FAIL ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
