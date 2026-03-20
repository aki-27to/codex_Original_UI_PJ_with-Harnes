#!/usr/bin/env node
"use strict";

const {
  detectUnsolicitedClosingProposal,
  leadContainsCompletionClaim,
  stripUnsolicitedClosingProposal,
} = require("./lib/user_facing_response_policy");
const {
  loadUserFacingResponseContract,
  summarizeUserFacingResponseContract,
} = require("./lib/user_facing_response_contract");

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function testDetectsUnsolicitedClosingParagraph() {
  const finding = detectUnsolicitedClosingProposal({
    prompt: "最新のアップデート情報を教えてください。",
    answer: [
      "最新は 2026-03-19 時点の作業ツリー更新です。",
      "",
      "必要なら次に「UI だけ」「server.js だけ」で切って整理します。",
    ].join("\n"),
    taskOutcomeStatus: "COMPLETED",
  });
  assert(finding && finding.kind === "paragraph", "unsolicited closing paragraph should be detected");
}

function testStripsUnsolicitedClosingParagraph() {
  const rewritten = stripUnsolicitedClosingProposal({
    prompt: "最新のアップデート情報を教えてください。",
    answer: [
      "最新は 2026-03-19 時点の作業ツリー更新です。",
      "",
      "必要なら次に「UI だけ」「server.js だけ」で切って整理します。",
    ].join("\n"),
    taskOutcomeStatus: "COMPLETED",
  });
  assert(rewritten === "最新は 2026-03-19 時点の作業ツリー更新です。", "unsolicited closing should be removed from client-facing text");
}

function testNeedsInputQuestionIsPreserved() {
  const original = "未完了です。ユーザー判断が必要です。\n\nこの 2 案のどちらで進めるかだけ指定してください。";
  const rewritten = stripUnsolicitedClosingProposal({
    prompt: "どちらにするべき？",
    answer: original,
    taskOutcomeStatus: "NEEDS_INPUT",
  });
  assert(rewritten === original, "needs-input response should keep the required decision question");
}

function testPromptThatExplicitlyAsksForOptionsSkipsDetection() {
  const finding = detectUnsolicitedClosingProposal({
    prompt: "選択肢を比較して、次の進め方も整理してください。",
    answer: "候補は 2 つです。\n\n必要なら次に実装順でも整理します。",
    taskOutcomeStatus: "COMPLETED",
  });
  assert(!finding, "option-comparison prompts should not be flagged for optional follow-up framing");
}

function testContractLoadsWithCloseInPlaceRules() {
  const contract = loadUserFacingResponseContract();
  const summary = summarizeUserFacingResponseContract(contract);
  assert(summary.schema === "user-facing-response-contract.v1", "response contract schema should be exposed");
  assert(summary.closeInPlaceEnabled === true, "close-in-place should stay enabled");
  assert(summary.exemptTaskOutcomeStatuses.includes("NEEDS_INPUT"), "needs-input should remain exempt from close-in-place stripping");
  assert(summary.prohibitedClosingCount >= 4, "response contract should list prohibited closing starters");
}

function testEnglishClosingSentenceIsStripped() {
  const rewritten = stripUnsolicitedClosingProposal({
    prompt: "Summarize the latest deployment status.",
    answer: "As of 2026-03-20, the deployment is healthy. If you'd like, I can break this down further.",
    taskOutcomeStatus: "COMPLETED",
  });
  assert(
    rewritten === "As of 2026-03-20, the deployment is healthy.",
    "english unsolicited follow-up sentence should be removed"
  );
}

function testCompletionClaimDetectionUsesContract() {
  assert(leadContainsCompletionClaim("Done. The task is complete."), "english completion claims should be detected");
  assert(!leadContainsCompletionClaim("Current status: validation is still pending."), "non-completion lead should not be flagged");
}

function run() {
  const tests = [
    ["detect unsolicited closing paragraph", testDetectsUnsolicitedClosingParagraph],
    ["strip unsolicited closing paragraph", testStripsUnsolicitedClosingParagraph],
    ["preserve needs-input question", testNeedsInputQuestionIsPreserved],
    ["skip detection when prompt requests options", testPromptThatExplicitlyAsksForOptionsSkipsDetection],
    ["load response contract summary", testContractLoadsWithCloseInPlaceRules],
    ["strip english closing sentence", testEnglishClosingSentenceIsStripped],
    ["detect completion claims from contract", testCompletionClaimDetectionUsesContract],
  ];
  let passed = 0;
  for (const [name, fn] of tests) {
    fn();
    passed += 1;
    console.log(`[user-facing-response-policy-test] PASS ${name}`);
  }
  console.log(`[user-facing-response-policy-test] total=${tests.length} pass=${passed} fail=0`);
  console.log("PASS");
}

try {
  run();
} catch (error) {
  console.log(`[user-facing-response-policy-test] FAIL ${error instanceof Error ? error.message : String(error)}`);
  console.log("FAIL");
  process.exitCode = 1;
}
