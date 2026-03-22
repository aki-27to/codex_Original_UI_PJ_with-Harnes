#!/usr/bin/env node
"use strict";

const {
  buildParentDispatchGuardRetryPrompt,
  buildParentDispatchGuardRuntimeSnapshot,
  evaluateParentDispatchGuard,
  normalizeParentDispatchGuardMode,
} = require("./lib/parent_dispatch_guard_policy");

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function testNormalizeMode() {
  assert(normalizeParentDispatchGuardMode("enforce", "warn") === "enforce", "enforce mode should pass through");
  assert(normalizeParentDispatchGuardMode("WARN", "off") === "warn", "mode should normalize case");
  assert(normalizeParentDispatchGuardMode("unknown", "off") === "off", "unknown mode should fallback");
}

function testRuntimeSnapshot() {
  const snapshot = buildParentDispatchGuardRuntimeSnapshot({
    mode: "warn",
    maxRetries: 3,
    parentAgents: ["default", "intake", "release_manager"],
  });
  assert(snapshot.mode === "warn", "snapshot mode mismatch");
  assert(snapshot.enabled === 1, "snapshot enabled mismatch");
  assert(snapshot.maxRetries === 3, "snapshot max retries mismatch");
  assert(Array.isArray(snapshot.parentAgents) && snapshot.parentAgents.length === 3, "snapshot parent agents mismatch");
}

function testRequiredViolationWhenNoDispatch() {
  const verdict = evaluateParentDispatchGuard({
    mode: "enforce",
    parentAgents: ["default", "intake", "release_manager"],
    agentName: "default",
    executionProfile: "standard",
    finalStatus: "completed",
    fileChanges: 1,
    dispatchCount: 0,
    dispatchSuccessCount: 0,
    dispatchFailureCount: 0,
    collabCalls: 0,
    attempt: 0,
    maxRetries: 1,
  });
  assert(verdict.required === 1, "guard should require dispatch for parent completed turn");
  assert(verdict.violation === 1, "guard should detect missing dispatch violation");
  assert(verdict.reason === "dispatch_not_attempted", "guard reason mismatch for missing dispatch");
  assert(verdict.retry === 1, "guard should allow retry on first attempt");
}

function testSatisfiedWhenDispatchSucceeded() {
  const verdict = evaluateParentDispatchGuard({
    mode: "enforce",
    parentAgents: ["default", "intake", "release_manager"],
    agentName: "release_manager",
    executionProfile: "standard",
    finalStatus: "completed",
    fileChanges: 1,
    dispatchCount: 1,
    dispatchSuccessCount: 1,
    dispatchFailureCount: 0,
    collabCalls: 1,
    attempt: 0,
    maxRetries: 1,
  });
  assert(verdict.required === 1, "guard should require dispatch for release manager");
  assert(verdict.satisfied === 1, "guard should pass when dispatch succeeded");
  assert(verdict.violation === 0, "guard should not flag violation when dispatch succeeded");
}

function testScopedDefaultAgentRecognizedAsParent() {
  const verdict = evaluateParentDispatchGuard({
    mode: "enforce",
    parentAgents: ["default", "intake", "release_manager"],
    agentName: "default@chat-001",
    executionProfile: "standard",
    finalStatus: "completed",
    changedFiles: 1,
    dispatchCount: 0,
    dispatchSuccessCount: 0,
    dispatchFailureCount: 0,
    collabCalls: 0,
    attempt: 0,
    maxRetries: 1,
  });
  assert(verdict.required === 1, "scoped default agent should be treated as parent");
  assert(verdict.violation === 1, "scoped default agent should still trigger missing-dispatch violation");
}

function testNotRequiredWithoutImplementationSignals() {
  const verdict = evaluateParentDispatchGuard({
    mode: "enforce",
    parentAgents: ["default", "intake", "release_manager"],
    agentName: "default",
    executionProfile: "standard",
    finalStatus: "completed",
    dispatchCount: 0,
    dispatchSuccessCount: 0,
    dispatchFailureCount: 0,
    collabCalls: 0,
  });
  assert(verdict.required === 0, "guard should not require dispatch for non-implementation parent turn");
  assert(verdict.violation === 0, "non-implementation parent turn should not violate dispatch guard");
}

function testReadOnlyCommandsDoNotRequireDispatch() {
  const verdict = evaluateParentDispatchGuard({
    mode: "enforce",
    parentAgents: ["default", "intake", "release_manager"],
    agentName: "default",
    executionProfile: "standard",
    finalStatus: "completed",
    commandExecutions: 3,
    dispatchCount: 0,
    dispatchSuccessCount: 0,
    dispatchFailureCount: 0,
    collabCalls: 0,
  });
  assert(verdict.required === 0, "read-only command turns should not require dispatch");
  assert(verdict.violation === 0, "read-only command turns should not violate dispatch guard");
  assert(verdict.work.readOnlyInspectionObserved === true, "read-only command observation should still be recorded");
}

function testReadOnlyMcpCallsDoNotRequireDispatch() {
  const verdict = evaluateParentDispatchGuard({
    mode: "enforce",
    parentAgents: ["default", "intake", "release_manager"],
    agentName: "default",
    executionProfile: "standard",
    finalStatus: "completed",
    mcpCalls: 2,
    dispatchCount: 0,
    dispatchSuccessCount: 0,
    dispatchFailureCount: 0,
    collabCalls: 0,
  });
  assert(verdict.required === 0, "read-only MCP inspection turns should not require dispatch");
  assert(verdict.violation === 0, "read-only MCP inspection turns should not violate dispatch guard");
  assert(verdict.work.readOnlyInspectionObserved === true, "read-only MCP observation should still be recorded");
}

function testRequiresDispatchWhenPlanStillExpectsChildWork() {
  const verdict = evaluateParentDispatchGuard({
    mode: "enforce",
    parentAgents: ["default", "intake", "release_manager"],
    agentName: "default@chat-001",
    executionProfile: "standard",
    finalStatus: "completed",
    dispatchCount: 0,
    dispatchSuccessCount: 0,
    dispatchFailureCount: 0,
    collabCalls: 0,
    routingDecisionPresent: true,
    plannedDispatchCount: 1,
    proposalOnly: false,
  });
  assert(verdict.required === 1, "planned child work should require dispatch even before implementation signals are observed");
  assert(verdict.plannedExecution === 1, "guard should record planned execution");
  assert(verdict.violation === 1, "planned child work without dispatch should violate the guard");
  assert(verdict.reason === "dispatch_not_attempted", "guard should report missing dispatch when planned child work never started");
}

function testSkippedForSmokeProfile() {
  const verdict = evaluateParentDispatchGuard({
    mode: "enforce",
    parentAgents: ["default", "intake", "release_manager"],
    agentName: "intake",
    executionProfile: "smoke-test",
    finalStatus: "completed",
    fileChanges: 1,
    dispatchCount: 0,
    dispatchSuccessCount: 0,
    dispatchFailureCount: 0,
    collabCalls: 0,
  });
  assert(verdict.required === 0, "guard should not require dispatch in smoke profile");
  assert(verdict.violation === 0, "guard should not violate in smoke profile");
}

function testRetryPromptBuilder() {
  const prompt = buildParentDispatchGuardRetryPrompt({
    originalPrompt: "Implement feature X.",
    reason: "dispatch_not_attempted",
    attempt: 1,
    maxRetries: 2,
    maxChars: 500,
  });
  assert(prompt.includes("spawn_agent -> wait"), "retry prompt should include collab sequence");
  assert(prompt.includes("dispatch_not_attempted"), "retry prompt should include guard reason");
  assert(prompt.includes("Do not quote or reveal"), "retry prompt should instruct the model not to leak internal guard text");
  assert(!prompt.includes("[Parent Dispatch Guard]"), "retry prompt should avoid user-facing guard banner text");
}

function run() {
  const tests = [
    ["normalize mode", testNormalizeMode],
    ["runtime snapshot", testRuntimeSnapshot],
    ["required violation when no dispatch", testRequiredViolationWhenNoDispatch],
    ["satisfied when dispatch succeeded", testSatisfiedWhenDispatchSucceeded],
    ["scoped default agent recognized as parent", testScopedDefaultAgentRecognizedAsParent],
    ["skip non-implementation parent turn", testNotRequiredWithoutImplementationSignals],
    ["skip read-only command inspection turn", testReadOnlyCommandsDoNotRequireDispatch],
    ["skip read-only MCP inspection turn", testReadOnlyMcpCallsDoNotRequireDispatch],
    ["require dispatch when plan expects child work", testRequiresDispatchWhenPlanStillExpectsChildWork],
    ["skip for smoke profile", testSkippedForSmokeProfile],
    ["retry prompt builder", testRetryPromptBuilder],
  ];
  let passed = 0;
  for (const [name, fn] of tests) {
    fn();
    passed += 1;
    console.log(`[parent-dispatch-guard-test] PASS ${name}`);
  }
  console.log(`[parent-dispatch-guard-test] total=${tests.length} pass=${passed} fail=0`);
  console.log("PASS");
}

try {
  run();
} catch (error) {
  console.log(`[parent-dispatch-guard-test] FAIL ${error instanceof Error ? error.message : String(error)}`);
  console.log("FAIL");
  process.exitCode = 1;
}
