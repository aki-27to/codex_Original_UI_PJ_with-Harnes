#!/usr/bin/env node
"use strict";

const {
  buildAdversarialRetryPrompt,
  shouldRetryAdversarialLoop,
} = require("./lib/adversarial_loop_policy");

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function testShouldRetryWhenReviewFails() {
  const decision = shouldRetryAdversarialLoop({
    enabled: true,
    finalStatus: "completed",
    taskOutcomeStatus: "COMPLETED",
    decision: "needs_improvement",
    attempt: 0,
    maxRetries: 2,
    writable: true,
    clientClosed: false,
  });
  assert(decision.retry === true, "failed review should trigger retry");
  assert(decision.nextAttempt === 1, "next attempt should increment");
}

function testNoRetryOnPass() {
  const decision = shouldRetryAdversarialLoop({
    enabled: true,
    finalStatus: "completed",
    taskOutcomeStatus: "COMPLETED",
    decision: "pass",
    attempt: 0,
    maxRetries: 2,
    writable: true,
    clientClosed: false,
  });
  assert(decision.retry === false, "pass decision must not retry");
  assert(decision.reason === "review_passed", "reason should indicate pass");
}

function testNoRetryWhenBudgetExhausted() {
  const decision = shouldRetryAdversarialLoop({
    enabled: true,
    finalStatus: "completed",
    taskOutcomeStatus: "COMPLETED",
    decision: "needs_improvement",
    attempt: 2,
    maxRetries: 2,
    writable: true,
    clientClosed: false,
  });
  assert(decision.retry === false, "retry budget exhausted must stop");
  assert(decision.reason === "retry_budget_exhausted", "reason should indicate exhausted budget");
}

function testRetryOnFailedValidation() {
  const decision = shouldRetryAdversarialLoop({
    enabled: true,
    finalStatus: "failed",
    taskOutcomeStatus: "FAILED_VALIDATION",
    decision: "needs_improvement",
    attempt: 0,
    maxRetries: 1,
    writable: true,
    clientClosed: false,
  });
  assert(decision.retry === true, "FAILED_VALIDATION should still retry");
  assert(decision.reason === "failed_validation_review_failed", "reason should reflect failed validation retry path");
}

function testNoRetryOnNeedsInput() {
  const decision = shouldRetryAdversarialLoop({
    enabled: true,
    finalStatus: "failed",
    taskOutcomeStatus: "NEEDS_INPUT",
    decision: "needs_improvement",
    attempt: 0,
    maxRetries: 2,
    writable: true,
    clientClosed: false,
  });
  assert(decision.retry === false, "NEEDS_INPUT should not retry");
  assert(decision.reason === "task_outcome_needs_input", "reason should reflect needs-input stop");
}

function testPromptIncludesFindings() {
  const prompt = buildAdversarialRetryPrompt({
    originalPrompt: "Give the latest release summary with sources.",
    previousAnswer: "The latest release is stable.",
    review: {
      red: {
        findings: [
          { id: "recency_without_date_signal", severity: "medium", message: "missing date context" },
          { id: "citation_requested_but_missing", severity: "medium", message: "missing citation links" },
        ],
      },
    },
    attempt: 0,
    maxRetries: 1,
    maxChars: 24000,
  });
  assert(prompt.includes("missing date context"), "retry prompt should include finding details");
  assert(prompt.includes("Original user request"), "retry prompt should include original request block");
  assert(prompt.includes("Do not mention internal review"), "retry prompt should include behavior rules");
}

function run() {
  const tests = [
    ["retry on failed review", testShouldRetryWhenReviewFails],
    ["no retry on pass", testNoRetryOnPass],
    ["no retry after budget exhausted", testNoRetryWhenBudgetExhausted],
    ["retry on failed validation", testRetryOnFailedValidation],
    ["no retry on needs input", testNoRetryOnNeedsInput],
    ["retry prompt contains findings", testPromptIncludesFindings],
  ];
  let passed = 0;
  for (const [name, fn] of tests) {
    fn();
    passed += 1;
    console.log(`[adversarial-loop-test] PASS ${name}`);
  }
  console.log(`[adversarial-loop-test] total=${tests.length} pass=${passed} fail=0`);
  console.log("PASS");
}

try {
  run();
} catch (error) {
  console.log(`[adversarial-loop-test] FAIL ${error instanceof Error ? error.message : String(error)}`);
  console.log("FAIL");
  process.exitCode = 1;
}
