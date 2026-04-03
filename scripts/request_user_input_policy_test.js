#!/usr/bin/env node
"use strict";

const {
  normalizeRequestUserInputPolicy,
  resolveNonInteractiveUserInput,
} = require("./lib/request_user_input_policy");

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function testNormalizePolicy() {
  assert(normalizeRequestUserInputPolicy(undefined, "auto-default") === "auto-default", "default policy should be autonomy-first");
  assert(
    normalizeRequestUserInputPolicy("auto_default", "auto-default") === "auto-default",
    "auto_default alias should normalize"
  );
  assert(normalizeRequestUserInputPolicy("autonomy-first", "blocked") === "auto-default", "autonomy-first alias should normalize");
  assert(normalizeRequestUserInputPolicy("empty", "auto-default") === "auto-empty", "empty alias should normalize");
  assert(
    normalizeRequestUserInputPolicy("unknown", "auto-default") === "auto-default",
    "invalid policy should use fallback"
  );
}

function testBlockedPolicy() {
  const resolution = resolveNonInteractiveUserInput({
    policy: "blocked",
    params: {
      questions: [{ id: "q1", options: [{ label: "yes", value: "yes" }] }],
    },
  });
  assert(resolution.decision === "blocked", "blocked policy should block");
  assert(resolution.questionCount === 1, "blocked policy should still count questions");
  assert(resolution.answeredCount === 0, "blocked policy should not answer");
}

function testImplicitDefaultPolicyIsAutoDefault() {
  const resolution = resolveNonInteractiveUserInput({
    params: {
      questions: [{ id: "q1", options: [{ label: "yes", value: "yes" }] }],
    },
  });
  assert(resolution.policy === "auto-default", "implicit policy should normalize to auto-default");
  assert(resolution.decision === "auto_default", "implicit policy should auto-answer");
  assert(resolution.answers.q1 === "yes", "implicit auto-default should pick the first available option");
  assert(resolution.reason === "auto_default_user_input_policy", "implicit policy should expose auto-default reason");
}

function testAutoEmptyPolicy() {
  const resolution = resolveNonInteractiveUserInput({
    policy: "auto-empty",
    params: {
      questions: [{ id: "q1", options: [{ label: "yes", value: "yes" }] }],
    },
  });
  assert(resolution.decision === "auto_empty", "auto-empty should return auto_empty decision");
  assert(typeof resolution.answers === "object" && Object.keys(resolution.answers).length === 0, "auto-empty answers should be empty");
}

function testAutoDefaultExplicitDefault() {
  const resolution = resolveNonInteractiveUserInput({
    policy: "auto-default",
    params: {
      questions: [
        {
          id: "mode",
          default: "safe",
          options: [{ label: "safe", value: "safe" }, { label: "fast", value: "fast" }],
        },
      ],
    },
  });
  assert(resolution.decision === "auto_default", "auto-default should return auto_default decision");
  assert(resolution.answers.mode === "safe", "explicit default should win");
  assert(resolution.answeredCount === 1, "explicit default should count as answered");
}

function testAutoDefaultRecommendedOption() {
  const resolution = resolveNonInteractiveUserInput({
    policy: "auto-default",
    params: {
      questions: [
        {
          id: "execution_mode",
          options: [
            { label: "manual", value: "manual" },
            { label: "auto (Recommended)", value: "auto" },
          ],
        },
      ],
    },
  });
  assert(resolution.answers.execution_mode === "auto", "recommended option should be selected");
  assert(resolution.answeredCount === 1, "recommended option should count as answered");
}

function testAutoDefaultMissingQuestionId() {
  const resolution = resolveNonInteractiveUserInput({
    policy: "auto-default",
    params: {
      questions: [{ header: "No id question", options: [{ label: "yes", value: "yes" }] }],
    },
  });
  assert(resolution.questionCount === 1, "missing-id question should still be counted");
  assert(resolution.answeredCount === 0, "missing-id question should not be auto-answered");
  assert(
    Array.isArray(resolution.assumptions) && resolution.assumptions.some((entry) => String(entry).includes("missing id")),
    "missing-id question should record assumption"
  );
}

function run() {
  const tests = [
    ["normalize policy aliases", testNormalizePolicy],
    ["blocked policy behavior", testBlockedPolicy],
    ["implicit default policy is auto-default", testImplicitDefaultPolicyIsAutoDefault],
    ["auto-empty behavior", testAutoEmptyPolicy],
    ["auto-default explicit default", testAutoDefaultExplicitDefault],
    ["auto-default recommended option", testAutoDefaultRecommendedOption],
    ["auto-default missing question id", testAutoDefaultMissingQuestionId],
  ];
  let passed = 0;
  for (const [name, testFn] of tests) {
    testFn();
    passed += 1;
    console.log(`[request-user-input-test] PASS ${name}`);
  }
  console.log(`[request-user-input-test] total=${tests.length} pass=${passed} fail=0`);
  console.log("PASS");
}

try {
  run();
} catch (error) {
  console.log(`[request-user-input-test] FAIL ${error instanceof Error ? error.message : String(error)}`);
  console.log("FAIL");
  process.exitCode = 1;
}
