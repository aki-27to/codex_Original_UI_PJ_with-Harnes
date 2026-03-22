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
  assert(Array.isArray(suite.cases) && suite.cases.length >= 12, "suite should have enough cases");
  const probeCase = suite.cases.find((entry) => entry && entry.driver === "agent_registry_probe");
  assert(probeCase && probeCase.input && probeCase.input.agentName === "worker", "suite should preserve probe-case input payload");
  const scopedWorkerCase = suite.cases.find((entry) => entry && entry.id === "retired_worker_scoped_rejected");
  assert(scopedWorkerCase && scopedWorkerCase.input && scopedWorkerCase.input.agentName === "worker@chat-legacy", "suite should cover scoped retired worker rejection");
  const guardCase = suite.cases.find((entry) => entry && entry.id === "parent_dispatch_guard_violation");
  assert(guardCase && guardCase.input && guardCase.input.mode === "enforce", "suite should pin parent dispatch probe mode");
  assert(guardCase && guardCase.input && Number(guardCase.input.fileChanges) === 1, "suite should require concrete implementation evidence for parent dispatch guard");
  const idempotencyCase = suite.cases.find((entry) => entry && entry.id === "idempotency_failed_outcome_bridge");
  assert(idempotencyCase && idempotencyCase.driver === "idempotency_bridge_probe", "suite should cover idempotency outcome bridge");
  const fastPlanningCase = suite.cases.find((entry) => entry && entry.id === "planning_mode_fast_selected");
  assert(fastPlanningCase && fastPlanningCase.driver === "planning_mode_probe", "suite should cover FAST planning mode");
  assert(fastPlanningCase.expect.fields.selectedAssuranceDepth === "LIGHT_ASSURANCE", "suite should cover LIGHT assurance");
  const discoveryPlanningCase = suite.cases.find((entry) => entry && entry.id === "planning_mode_discovery_selected");
  assert(discoveryPlanningCase && discoveryPlanningCase.driver === "planning_mode_probe", "suite should cover DISCOVERY planning mode");
  assert(discoveryPlanningCase.expect.fields.selectedPlanningDepth === "DISCOVERY_PLANNING", "suite should cover DISCOVERY planning depth");
  const crossSpecialistCase = suite.cases.find((entry) => entry && entry.id === "cross_specialist_dispatch_plan");
  assert(crossSpecialistCase && crossSpecialistCase.driver === "planning_contract_probe", "suite should cover cross-specialist dispatch plan");
  assert(crossSpecialistCase.expect.fields.selectedAssuranceDepth === "SIGNOFF_ASSURANCE", "suite should cover SIGNOFF assurance");
  const contextLeakCase = suite.cases.find((entry) => entry && entry.id === "context_leakage_planning_owned_paths");
  assert(contextLeakCase && contextLeakCase.driver === "planning_contract_probe", "suite should cover context leakage guard");
  const dedicatedTestCase = suite.cases.find((entry) => entry && entry.id === "dedicated_test_required_for_new_logic");
  assert(dedicatedTestCase && dedicatedTestCase.driver === "planning_contract_probe", "suite should cover dedicated test requirement");
}

function testLoadUserValueSuite() {
  const suite = loadEvalSuiteFromFile(path.join(__dirname, "config", "eval_suite_user_value.json"));
  assert(suite && suite.kind === "user_value", "user-value suite should normalize kind");
  assert(suite && suite.scoring && suite.scoring.correctnessVeto === true, "user-value suite should preserve scoring");
  assert(Array.isArray(suite.cases) && suite.cases.length >= 3, "user-value suite should expose cases");
  const reviewCase = suite.cases.find((entry) => entry && entry.id === "repo_code_review_findings_first");
  assert(reviewCase && reviewCase.userValue && Array.isArray(reviewCase.userValue.actionabilityPatterns) && reviewCase.userValue.actionabilityPatterns.length >= 1, "user-value suite should preserve rubric aliases");
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

function testUserValueSummaryAndComparison() {
  const suite = {
    suiteId: "uv-inline.v1",
    kind: "user_value",
    scoring: {
      weights: {
        correctness: 0.4,
        completeness: 0.2,
        specificity: 0.15,
        actionability: 0.15,
        followUpCorrectionPressure: 0.1,
      },
      correctnessVeto: true,
      winThreshold: 0.05,
    },
  };
  const evalCase = {
    id: "uv-case",
    title: "uv-case",
    driver: "user_value_probe",
    weight: 1,
    expect: { mode: "includes", value: "verification" },
    userValue: {
      taskClass: "coding_repo",
      criticalPatterns: ["fix", "verification"],
      coveragePatterns: ["fix", "verification", "server.js"],
      specificityPatterns: ["server.js", "node scripts/test.js"],
      actionabilityPatterns: ["run", "verify"],
    },
  };
  const strong = summarizeEvalCaseResult({
    suite,
    evalCase,
    outputText: "1. Fix server.js\n2. Run node scripts/test.js for verification",
    latencyMs: 100,
    status: "completed",
    errorText: "",
  });
  const weak = summarizeEvalCaseResult({
    suite,
    evalCase,
    outputText: "Maybe inspect it.",
    latencyMs: 100,
    status: "completed",
    errorText: "",
  });
  const runA = buildEvalRunSummary({
    suite,
    variant: { label: "A" },
    caseResults: [strong],
    startedAt: 1,
    completedAt: 101,
  });
  const runB = buildEvalRunSummary({
    suite,
    variant: { label: "B" },
    caseResults: [weak],
    startedAt: 1,
    completedAt: 111,
  });
  assert(runA.userValue && runB.userValue, "user-value runs should expose aggregate metrics");
  assert(runA.userValue.score > runB.userValue.score, "stronger answer should score higher");
  const compared = compareEvalRuns(runA, runB, suite.scoring);
  assert(compared.winner === "A", "user-value comparison should prefer stronger answer");
  assert(compared.userValue && compared.userValue.left && compared.userValue.right, "user-value comparison should expose both metric sets");
}

function testWebCreativeUserValueComparison() {
  const suite = {
    suiteId: "uv-web-inline.v1",
    kind: "user_value",
    scoring: {
      weights: {
        correctness: 0.35,
        completeness: 0.2,
        specificity: 0.2,
        actionability: 0.15,
        followUpCorrectionPressure: 0.1,
      },
      correctnessVeto: true,
      winThreshold: 0.05,
    },
  };
  const evalCase = {
    id: "uv-web-case",
    title: "uv-web-case",
    driver: "user_value_probe",
    weight: 1,
    expect: { mode: "includes", value: "benchmark" },
    userValue: {
      taskClass: "web_ui",
      taskFamily: "web_creative",
      criticalPatterns: ["benchmark", "layout"],
      coveragePatterns: ["benchmark", "typography", "desktop", "mobile"],
      specificityPatterns: ["hero", "section rhythm", "responsive"],
      actionabilityPatterns: ["implement", "review", "responsive"],
    },
  };
  const strong = summarizeEvalCaseResult({
    suite,
    evalCase,
    outputText: "Implement a premium hero and section rhythm, beat the benchmark with stronger typography hierarchy, add responsive desktop/mobile layouts, and review screenshots for credibility proof.",
    latencyMs: 100,
    status: "completed",
    errorText: "",
  });
  const weak = summarizeEvalCaseResult({
    suite,
    evalCase,
    outputText: "Make it look nice and modern. Maybe adjust some cards.",
    latencyMs: 100,
    status: "completed",
    errorText: "",
  });
  assert(strong.userValue && strong.userValue.taskFamily === "web_creative", "web creative case should preserve taskFamily");
  assert(strong.userValue.familySignals && Array.isArray(strong.userValue.familySignals.matchedSignals), "web creative case should expose family signals");
  const runA = buildEvalRunSummary({
    suite,
    variant: { label: "A" },
    caseResults: [strong],
    startedAt: 1,
    completedAt: 101,
  });
  const runB = buildEvalRunSummary({
    suite,
    variant: { label: "B" },
    caseResults: [weak],
    startedAt: 1,
    completedAt: 111,
  });
  assert(runA.userValue.score > runB.userValue.score, "web creative stronger answer should score higher");
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
    ["load user-value suite", testLoadUserValueSuite],
    ["expectation modes", testExpectationModes],
    ["summary and comparison", testSummaryAndComparison],
    ["user-value summary and comparison", testUserValueSummaryAndComparison],
    ["web creative user-value comparison", testWebCreativeUserValueComparison],
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
