#!/usr/bin/env node
"use strict";

const {
  loadOpenAIBlogLearningPolicy,
  runOpenAIBlogLearningCycle,
} = require("./lib/openai_blog_learning");

async function main() {
  const policy = loadOpenAIBlogLearningPolicy();
  const result = await runOpenAIBlogLearningCycle({ policy });
  const summary = result && result.report && result.report.summary ? result.report.summary : {};
  console.log(`[openai-blog-learning] status=${result.report.status}`);
  console.log(`[openai-blog-learning] tracked=${Number(summary.trackedArticles) || 0} new=${Number(summary.newArticlesThisRun) || 0} proposals=${Number(summary.pendingProposals) || 0}`);
  console.log(`[openai-blog-learning] ledger=${result.report.paths.ledgerPath}`);
  console.log(`[openai-blog-learning] digest=${result.report.paths.digestPath}`);
  console.log(`[openai-blog-learning] report=${result.report.paths.reportPath}`);
  console.log(`[openai-blog-learning] curatedDoc=${result.report.paths.curatedDocPath}`);
}

main().catch((error) => {
  console.error(`[openai-blog-learning] FAIL ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
