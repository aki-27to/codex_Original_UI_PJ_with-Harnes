"use strict";

const path = require("path");
const {
  loadEvalSuiteFromFile,
  evaluateEvalCaseOutput,
  summarizeEvalCaseResult,
  buildEvalRunSummary,
  compareEvalRuns,
} = require("./lib/eval_harness_policy");

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function testLoadSuite() {
  const suite = loadEvalSuiteFromFile(path.join(__dirname, "config", "eval_suite_default.json"));
  assert(suite && suite.schema === "harness-eval-suite.v1", "suite schema mismatch");
  assert(Array.isArray(suite.cases) && suite.cases.length >= 6, "suite should have enough cases");
  const probeCase = suite.cases.find((entry) => entry && entry.driver === "agent_registry_probe");
  assert(probeCase && probeCase.input && probeCase.input.agentName === "worker", "suite should preserve probe-case input payload");
  const scopedWorkerCase = suite.cases.find((entry) => entry && entry.id === "retired_worker_scoped_rejected");
  assert(scopedWorkerCase && scopedWorkerCase.input && scopedWorkerCase.input.agentName === "worker@chat-legacy", "suite should cover scoped retired worker rejection");
  const guardCase = suite.cases.find((entry) => entry && entry.id === "parent_dispatch_guard_violation");
  assert(guardCase && guardCase.input && guardCase.input.mode === "enforce", "suite should pin parent dispatch probe mode");
  assert(guardCase && guardCase.input && Number(guardCase.input.fileChanges) === 1, "suite should require concrete implementation evidence for parent dispatch guard");
  const idempotencyCase = suite.cases.find((entry) => entry && entry.id === "idempotency_failed_outcome_bridge");
  assert(idempotencyCase && idempotencyCase.driver === "idempotency_bridge_probe", "suite should cover idempotency outcome bridge");
}

function testExpectationModes() {
  const exact = evaluateEvalCaseOutput("ACK", { mode: "exact", value: "ACK" });
  assert(exact.passed === true, "exact mode should pass");

  const include = evaluateEvalCaseOutput("hello worker", { mode: "includes", value: "worker" });
  assert(include.passed === true, "includes mode should pass");

  const regex = evaluateEvalCaseOutput("version:42", { mode: "regex", value: "^version:[0-9]+$" });
  assert(regex.passed === true, "regex mode should pass");

  const jsonFields = evaluateEvalCaseOutput('{"ok":true,"stage":"p0"}', {
    mode: "json_fields",
    fields: { ok: true, stage: "p0" },
  });
  assert(jsonFields.passed === true, "json_fields mode should pass");
}

function testSummaryAndComparison() {
  const evalCase = {
    id: "sample",
    title: "sample",
    driver: "exec",
    weight: 2,
    expect: { mode: "exact", value: "ACK" },
  };
  const passed = summarizeEvalCaseResult({
    evalCase,
    outputText: "ACK",
    latencyMs: 120,
    status: "completed",
    errorText: "",
  });
  const failed = summarizeEvalCaseResult({
    evalCase,
    outputText: "NOPE",
    latencyMs: 140,
    status: "completed",
    errorText: "",
  });

  const runA = buildEvalRunSummary({
    suite: { suiteId: "suite-a" },
    variant: { label: "A" },
    caseResults: [passed, passed],
    startedAt: 1,
    completedAt: 501,
  });
  const runB = buildEvalRunSummary({
    suite: { suiteId: "suite-a" },
    variant: { label: "B" },
    caseResults: [passed, failed],
    startedAt: 1,
    completedAt: 601,
  });

  assert(runA.scoreRate > runB.scoreRate, "runA should score higher");
  const compared = compareEvalRuns(runA, runB);
  assert(compared.winner === "A", "winner should be A");
}

function testPromptlessProbeCaseNormalization() {
  const suite = loadEvalSuiteFromFile(path.join(__dirname, "config", "eval_suite_default.json"));
  const probeCase = suite.cases.find((entry) => entry && entry.driver === "request_user_input_probe");
  assert(probeCase, "promptless probe case should be retained");
  assert(!probeCase.prompt, "probe case should not require a prompt");
  assert(probeCase.expect && probeCase.expect.mode === "json_fields", "probe case expectation should remain intact");
}

function run() {
  const tests = [
    ["load suite", testLoadSuite],
    ["expectation modes", testExpectationModes],
    ["summary and comparison", testSummaryAndComparison],
    ["promptless probe normalization", testPromptlessProbeCaseNormalization],
  ];
  let passed = 0;
  for (const [name, fn] of tests) {
    fn();
    passed += 1;
    console.log(`[eval-harness-policy-test] PASS ${name}`);
  }
  console.log(`[eval-harness-policy-test] total=${tests.length} pass=${passed} fail=0`);
  console.log("PASS");
}

try {
  run();
} catch (error) {
  console.log(`[eval-harness-policy-test] FAIL ${error instanceof Error ? error.message : String(error)}`);
  console.log("FAIL");
  process.exitCode = 1;
}
