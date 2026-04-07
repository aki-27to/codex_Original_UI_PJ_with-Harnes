"use strict";

const path = require("path");
const {
  loadHarnessTurnContractSpec,
  validateTurnTransition,
  validateTurnTerminalContract,
  validateTurnTaskOutcomeContract,
} = require("./lib/harness_contract_policy");
const { __riskAudit } = require("../server.js");

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function testLoadContract() {
  const spec = loadHarnessTurnContractSpec(path.join(__dirname, "config", "harness_contract_spec.json"));
  assert(spec && /^harness-turn-contract\.v\d+$/i.test(String(spec.schema || "")), "contract schema mismatch");
  assert(Array.isArray(spec.turn.states) && spec.turn.states.includes("completed"), "contract states missing completed");
}

function testValidTransition() {
  const spec = loadHarnessTurnContractSpec(path.join(__dirname, "config", "harness_contract_spec.json"));
  const verdict = validateTurnTransition({ from: "in_progress", to: "completed", spec });
  assert(verdict.ok === true, "in_progress -> completed should be allowed");
}

function testInvalidTransition() {
  const spec = loadHarnessTurnContractSpec(path.join(__dirname, "config", "harness_contract_spec.json"));
  const verdict = validateTurnTransition({ from: "completed", to: "failed", spec });
  assert(verdict.ok === false, "completed -> failed should be blocked");
}

function testTerminalContract() {
  const spec = loadHarnessTurnContractSpec(path.join(__dirname, "config", "harness_contract_spec.json"));
  const ok = validateTurnTerminalContract({ status: "completed", terminalEvent: "turn/completed", spec });
  assert(ok.ok === true, "terminal contract should pass");
  const ng = validateTurnTerminalContract({ status: "completed", terminalEvent: "turn/done", spec });
  assert(ng.ok === false, "unexpected terminal event should fail");
}

function testTurnTaskOutcomeBridge() {
  const spec = loadHarnessTurnContractSpec(path.join(__dirname, "config", "harness_contract_spec.json"));
  const ok = validateTurnTaskOutcomeContract({ turnStatus: "failed", taskOutcomeStatus: "FAILED_VALIDATION", spec });
  assert(ok.ok === true, "failed turn should allow FAILED_VALIDATION");
  const blocked = validateTurnTaskOutcomeContract({ turnStatus: "failed", taskOutcomeStatus: "BLOCKED", spec });
  assert(blocked.ok === true, "failed turn should allow BLOCKED");
  const mismatch = validateTurnTaskOutcomeContract({ turnStatus: "completed", taskOutcomeStatus: "NEEDS_INPUT", spec });
  assert(mismatch.ok === false, "completed turn should reject NEEDS_INPUT");
}

function testIdempotencySnapshotLifecycle() {
  const snapshot = __riskAudit.buildExecIdempotencySnapshot("bridge-key", {
    key: "bridge-key",
    state: "failed",
    createdAt: 1,
    updatedAt: 2,
    expiresAt: 3,
    responseClosedAt: 4,
    responseCloseDisposition: "pre_terminal",
    metadata: { method: "POST", path: "/api/exec", requestHash: "abc" },
    outcome: {
      status: "failed",
      taskOutcomeStatus: "FAILED_VALIDATION",
      taskOutcomeReason: "parent_dispatch_guard_block",
      error: "probe failure",
      completedAt: 5,
    },
  });
  assert(snapshot && snapshot.state === "failed", "idempotency snapshot should preserve failed terminal state");
  assert(snapshot.lifecycle && snapshot.lifecycle.state === "failed", "idempotency snapshot should expose lifecycle object");
  assert(snapshot.lifecycle.terminal === 1, "idempotency lifecycle should report terminal flag");
  assert(snapshot.lifecycle.responseClosed === 1, "idempotency lifecycle should report response close");
  assert(snapshot.lifecycle.responseCloseDisposition === "pre_terminal", "idempotency lifecycle should preserve response close disposition");
  assert(snapshot.terminalStatus === "failed", "idempotency snapshot should expose failed terminal status separately");
  assert(snapshot.outcome && snapshot.outcome.status === "failed", "idempotency outcome should preserve failed terminal result");
}

function run() {
  const tests = [
    ["load contract", testLoadContract],
    ["valid transition", testValidTransition],
    ["invalid transition", testInvalidTransition],
    ["terminal contract", testTerminalContract],
    ["turn task outcome bridge", testTurnTaskOutcomeBridge],
    ["idempotency snapshot lifecycle", testIdempotencySnapshotLifecycle],
  ];
  let passed = 0;
  for (const [name, fn] of tests) {
    fn();
    passed += 1;
    console.log(`[harness-contract-policy-test] PASS ${name}`);
  }
  console.log(`[harness-contract-policy-test] total=${tests.length} pass=${passed} fail=0`);
  console.log("PASS");
}

try {
  run();
} catch (error) {
  console.log(`[harness-contract-policy-test] FAIL ${error instanceof Error ? error.message : String(error)}`);
  console.log("FAIL");
  process.exitCode = 1;
}
