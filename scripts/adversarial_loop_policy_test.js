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
  assert(prompt.includes("lead with the direct answer in the first line or sentence"), "retry prompt should enforce direct-answer-first behavior");
  assert(prompt.includes("Do not append optional next-step offers"), "retry prompt should enforce close-in-place behavior");
}

function testExecutionRetryPromptPreservesExecutionWork() {
  const prompt = buildAdversarialRetryPrompt({
    originalPrompt: [
      "# Goal",
      "Complete the repo task.",
      "- Use apply_patch for file edits.",
      "- Delegate the implementation edits to infra_worker.",
      "- Request independent read-only reviewer and tester checks before finalizing.",
      "- Final reply must be exactly: SIGNOFF_TASK_OK path/to/file",
    ].join("\n"),
    previousAnswer: "SIGNOFF_TASK_OK path/to/file",
    review: {
      red: {
        findings: [
          { id: "terminal_status_not_completed", severity: "high", message: "turn finished without completed terminal status" },
        ],
      },
    },
    attempt: 0,
    maxRetries: 1,
    maxChars: 24000,
  });
  assert(prompt.includes("Re-attempt the original user request as an execution task."), "execution retry should preserve execution framing");
  assert(prompt.includes("Actually perform the required edits"), "execution retry should demand actual work");
  assert(!prompt.includes("Write a corrected final answer for the original user request."), "execution retry should not degrade to answer-only rewrite");
}

function testExecutionRetryPromptUsesExplicitTaskKindAndDispatchPlan() {
  const prompt = buildAdversarialRetryPrompt({
    originalPrompt: [
      "\u30d5\u30a9\u30f3\u30c8\u3084\u30ec\u30a4\u30a2\u30a6\u30c8\u3092 https://www.suruga-k.jp/ \u3092\u53c2\u8003\u306b\u5237\u65b0\u3057\u3066\u4e0b\u3055\u3044\u3002",
      "\u30da\u30fc\u30b8\u6570\u3082\u4eca\u306f1\u30da\u30fc\u30b8\u3057\u304b\u306a\u3044\u3002\u3068\u308a\u3042\u3048\u305a3\u30da\u30fc\u30b8\u306b\u3057\u3066\u4e0b\u3055\u3044\u3002",
    ].join("\n"),
    previousAnswer: "\u8aac\u660e\u6587\u3092\u8fd4\u3057\u305f\u3060\u3051\u3002",
    review: {
      red: {
        findings: [
          { id: "terminal_status_not_completed", severity: "high", message: "turn finished without completed terminal status" },
        ],
      },
    },
    executionTask: true,
    dispatchPlan: {
      reviewerRequired: 1,
      testerRequired: 0,
      dedicatedTestsRequired: 0,
      dispatches: [
        { ownerAgent: "frontend_worker", ownedPaths: ["web/"], acceptanceChecks: ["three_pages"] },
      ],
    },
    attempt: 0,
    maxRetries: 1,
    maxChars: 24000,
  });
  assert(prompt.includes("[REQUIREMENT_LOCK_V1]"), "explicit execution retries should carry a requirement lock");
  assert(prompt.includes("frontend_worker"), "execution retry should surface the planned specialist");
  assert(prompt.includes("owned paths: web/"), "execution retry should surface owned paths");
  assert(prompt.includes("Reviewer evidence required: yes"), "execution retry should preserve reviewer requirement");
  assert(prompt.includes("Re-attempt the original user request as an execution task."), "explicit execution flag should force execution framing");
}

function run() {
  const tests = [
    ["retry on failed review", testShouldRetryWhenReviewFails],
    ["no retry on pass", testNoRetryOnPass],
    ["no retry after budget exhausted", testNoRetryWhenBudgetExhausted],
    ["retry on failed validation", testRetryOnFailedValidation],
    ["no retry on needs input", testNoRetryOnNeedsInput],
    ["retry prompt contains findings", testPromptIncludesFindings],
    ["execution retry preserves work", testExecutionRetryPromptPreservesExecutionWork],
    ["execution retry respects explicit task kind", testExecutionRetryPromptUsesExplicitTaskKindAndDispatchPlan],
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
