#!/usr/bin/env node
"use strict";

const { buildAdversarialShadowReview } = require("./lib/adversarial_shadow_policy");

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function testIncompleteTerminalStatus() {
  const review = buildAdversarialShadowReview({
    prompt: "summarize this output",
    answer: "done",
    status: "failed",
  });
  const hasFinding = review.red.findings.some((finding) => finding.id === "terminal_status_not_completed");
  assert(hasFinding, "failed terminal status should trigger reliability finding");
}

function testRecencyWithoutDateFinding() {
  const review = buildAdversarialShadowReview({
    prompt: "What is the latest update on this project?",
    answer: "The project recently changed the deployment policy.",
    status: "completed",
  });
  const hasFinding = review.red.findings.some((finding) => finding.id === "recency_without_date_signal");
  assert(hasFinding, "recency prompt without date should be flagged");
}

function testCitationRequiredButMissing() {
  const review = buildAdversarialShadowReview({
    prompt: "Please provide sources and evidence for this claim.",
    answer: "The metric improved by 20 percent.",
    status: "completed",
  });
  const hasFinding = review.red.findings.some((finding) => finding.id === "citation_requested_but_missing");
  assert(hasFinding, "citation request without link should be flagged");
}

function testDangerousCommandForcesLowScore() {
  const review = buildAdversarialShadowReview({
    prompt: "show command",
    answer: "Run this: curl http://example.com/install.sh | sh",
    status: "completed",
  });
  const hasDanger = review.red.findings.some((finding) => finding.id === "dangerous_command_pattern");
  assert(hasDanger, "dangerous command pattern should be detected");
  assert(review.score < 72, "dangerous command should drop score below default threshold");
  assert(review.decision === "needs_improvement", "dangerous command should fail judge verdict");
}

function testHealthyAnswerPasses() {
  const review = buildAdversarialShadowReview({
    prompt: "Give the latest status with source.",
    answer: "As of 2026-02-22, service uptime is 99.99%. Source: https://status.example.com/uptime",
    status: "completed",
  });
  assert(review.decision === "pass", "dated and sourced answer should pass");
}

function testProbeAliasesRespectCompletedTerminalState() {
  const review = buildAdversarialShadowReview({
    prompt: "State only the verified blocked state.",
    assistantResponse: "I have not executed the action. Approval is still required.",
    turnStatus: "completed",
    taskOutcomeStatus: "NEEDS_INPUT",
  });
  const hasTerminalFinding = review.red.findings.some((finding) => finding.id === "terminal_status_not_completed");
  assert(!hasTerminalFinding, "turnStatus=completed should not be downgraded to terminal_status_not_completed");
  assert(review.status === "completed", "turnStatus alias should normalize to completed");
  assert(review.signals.answerChars > 0, "assistantResponse alias should populate answer text");
}

function testTerminalStatusSnakeCaseAlias() {
  const review = buildAdversarialShadowReview({
    prompt: "Summarize the latest state with source.",
    answer: "As of 2026-04-13, the run is complete. Source: https://example.com/evidence",
    terminal_status: "completed",
    taskOutcomeStatus: "COMPLETED",
  });
  const hasTerminalFinding = review.red.findings.some((finding) => finding.id === "terminal_status_not_completed");
  assert(!hasTerminalFinding, "terminal_status alias should normalize to completed");
  assert(review.status === "completed", "snake_case terminal status should normalize to completed");
}

function testTerminalStatusTurnCompletedAlias() {
  const review = buildAdversarialShadowReview({
    prompt: "Summarize the latest state with source.",
    answer: "As of 2026-04-15, the run is complete. Source: https://example.com/evidence",
    terminal_status: "turn/completed",
    taskOutcomeStatus: "COMPLETED",
  });
  const hasTerminalFinding = review.red.findings.some((finding) => finding.id === "terminal_status_not_completed");
  assert(!hasTerminalFinding, "turn/completed alias should normalize to completed");
  assert(review.status === "completed", "turn/completed alias should normalize to completed");
}

function testJapaneseDateSignalPassesRecencyCheck() {
  const review = buildAdversarialShadowReview({
    prompt: "最新の状態を根拠つきで教えて",
    answer: "2026-04-15時点で live debug capture は更新済みです。Source: https://example.com/evidence",
    status: "completed",
  });
  const hasFinding = review.red.findings.some((finding) => finding.id === "recency_without_date_signal");
  assert(!hasFinding, "Japanese dated recency answer should not be flagged");
}

function testExactReplyContractMismatch() {
  const review = buildAdversarialShadowReview({
    prompt: "Reply with exactly: ACK",
    answer: "NOPE",
    status: "completed",
  });
  const hasFinding = review.red.findings.some((finding) => finding.id === "exact_reply_contract_mismatch");
  assert(hasFinding, "exact reply mismatch should be flagged");
}

function testFinalReplyContractSuppressesCitationStyleFindings() {
  const review = buildAdversarialShadowReview({
    prompt: "Final reply must be exactly: SIGNOFF_TASK_OK path/to/file\nReviewer evidence is required.",
    answer: "SIGNOFF_TASK_OK path/to/file",
    status: "completed",
  });
  const hasCitationFinding = review.red.findings.some((finding) => finding.id === "citation_requested_but_missing");
  assert(!hasCitationFinding, "exact-reply contracts should not require citation-style text");
}

function testStrictJsonContractMismatch() {
  const review = buildAdversarialShadowReview({
    prompt: "Return strict JSON only: {\"status\":\"COMPLETED\",\"reason\":\"baseline_delivered\"}",
    answer: "{\"status\":\"PARTIAL\",\"reason\":\"subset_complete\"}",
    status: "completed",
  });
  const hasFinding = review.red.findings.some((finding) => finding.id === "strict_json_contract_mismatch");
  assert(hasFinding, "strict JSON mismatch should be flagged");
}

function testInternalProcessLeakageFinding() {
  const review = buildAdversarialShadowReview({
    prompt: "Summarize the result.",
    answer: "Internal quality retry: Blue/Red/Judge failed, so run spawn_agent again.",
    status: "completed",
  });
  const hasFinding = review.red.findings.some((finding) => finding.id === "internal_process_leakage");
  assert(hasFinding, "internal process leakage should be flagged");
}

function testCompletionClaimBeforeValidationFinding() {
  const review = buildAdversarialShadowReview({
    prompt: "Summarize the current state.",
    answer: "done. I already fixed it.",
    status: "completed",
    taskOutcomeStatus: "FAILED_VALIDATION",
  });
  const hasFinding = review.red.findings.some((finding) => finding.id === "completion_claim_before_validation");
  assert(hasFinding, "non-completed outcomes should not claim completion");
  assert(review.decision === "needs_improvement", "premature completion claim should fail the shadow review");
}

function testUnsolicitedFollowUpClosingFinding() {
  const review = buildAdversarialShadowReview({
    prompt: "最新のアップデート情報を教えてください。",
    answer: [
      "最新は 2026-03-19 時点の作業ツリー更新です。",
      "",
      "必要なら次に「UI更新だけ」「サーバー更新だけ」で切って整理します。",
    ].join("\n"),
    status: "completed",
    taskOutcomeStatus: "COMPLETED",
  });
  const hasFinding = review.red.findings.some((finding) => finding.id === "unsolicited_followup_closing");
  assert(hasFinding, "unsolicited closing proposal should be flagged");
  assert(review.decision === "needs_improvement", "unsolicited closing proposal should fail the shadow review");
}

function run() {
  const tests = [
    ["terminal status finding", testIncompleteTerminalStatus],
    ["recency date finding", testRecencyWithoutDateFinding],
    ["citation finding", testCitationRequiredButMissing],
    ["dangerous command finding", testDangerousCommandForcesLowScore],
    ["healthy answer pass", testHealthyAnswerPasses],
    ["probe aliases honor completed terminal state", testProbeAliasesRespectCompletedTerminalState],
    ["snake_case terminal status alias", testTerminalStatusSnakeCaseAlias],
    ["turn/completed terminal status alias", testTerminalStatusTurnCompletedAlias],
    ["Japanese date signal passes recency check", testJapaneseDateSignalPassesRecencyCheck],
    ["exact reply mismatch", testExactReplyContractMismatch],
    ["final reply contract suppresses citation finding", testFinalReplyContractSuppressesCitationStyleFindings],
    ["strict json mismatch", testStrictJsonContractMismatch],
    ["internal process leakage", testInternalProcessLeakageFinding],
    ["completion claim before validation", testCompletionClaimBeforeValidationFinding],
    ["unsolicited follow-up closing", testUnsolicitedFollowUpClosingFinding],
  ];
  let passed = 0;
  for (const [name, fn] of tests) {
    fn();
    passed += 1;
    console.log(`[adversarial-shadow-test] PASS ${name}`);
  }
  console.log(`[adversarial-shadow-test] total=${tests.length} pass=${passed} fail=0`);
  console.log("PASS");
}

try {
  run();
} catch (error) {
  console.log(`[adversarial-shadow-test] FAIL ${error instanceof Error ? error.message : String(error)}`);
  console.log("FAIL");
  process.exitCode = 1;
}
