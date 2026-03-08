#!/usr/bin/env node
"use strict";

const {
  evaluateAgentGovernance,
  getAgentGovernancePolicySnapshot,
  getAgentGovernanceContract,
  normalizeAgentName,
} = require("./lib/agent_governance_policy");

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function testNormalizeAgentName() {
  assert(normalizeAgentName("Frontend-Worker") === "frontend_worker", "agent name should normalize to underscore form");
  assert(normalizeAgentName("  TESTER  ") === "tester", "agent name should trim/lower");
}

function testReviewerReadOnly() {
  const verdict = evaluateAgentGovernance({
    agentName: "reviewer",
    operation: "commandExecution",
    changedPaths: [],
  });
  assert(verdict.decision === "deny", "reviewer command should be denied");
  assert(verdict.reason === "agent_read_only_role", "reviewer denial reason should be read-only");
}

function testFrontendScope() {
  const allowed = evaluateAgentGovernance({
    agentName: "frontend_worker",
    operation: "fileChange",
    changedPaths: ["web/01.HarnesUI/app.js"],
  });
  assert(allowed.decision === "allow", "frontend web path should be allowed");

  const denied = evaluateAgentGovernance({
    agentName: "frontend_worker",
    operation: "fileChange",
    changedPaths: ["server.js"],
  });
  assert(denied.decision === "deny", "frontend server path should be denied");
  assert(denied.reason === "path_out_of_scope", "frontend server path should be scope violation");

  const scopedAllowed = evaluateAgentGovernance({
    agentName: "frontend_worker@chat-1",
    operation: "fileChange",
    changedPaths: ["web/01.HarnesUI/app.js"],
  });
  assert(scopedAllowed.decision === "allow", "scoped frontend agent should inherit frontend contract");
}

function testTesterVerificationScope() {
  const denied = evaluateAgentGovernance({
    agentName: "tester",
    operation: "fileChange",
    changedPaths: ["scripts/new_feature.js"],
  });
  assert(denied.decision === "deny", "tester non-test path should be denied");
  assert(denied.reason === "verification_scope_violation", "tester non-test path should be verification-only violation");

  const allowed = evaluateAgentGovernance({
    agentName: "tester",
    operation: "fileChange",
    changedPaths: ["scripts/new_feature_test.js"],
  });
  assert(allowed.decision === "allow", "tester test path should be allowed");
}

function testUnknownAgentAndWorkerLegacyBehavior() {
  const unknown = evaluateAgentGovernance({
    agentName: "custom-agent",
    operation: "fileChange",
    changedPaths: ["server.js"],
  });
  assert(unknown.decision === "allow", "unknown agent should not be force-restricted");

  const workerDenied = evaluateAgentGovernance({
    agentName: "worker",
    operation: "commandExecution",
    changedPaths: [],
  });
  assert(workerDenied.decision === "deny", "worker should be blocked without explicit parent override");
  assert(workerDenied.reason === "legacy_only_requires_parent_override", "worker denial should require explicit parent override");

  const workerAllowed = evaluateAgentGovernance({
    agentName: "worker",
    operation: "fileChange",
    changedPaths: ["skills/blender-pro-character-pipeline/SKILL.md"],
    override: {
      requestedBy: "default",
      reason: "legacy compatibility lane required for bounded skill maintenance",
      ticket: "LEGACY-1",
    },
  });
  assert(workerAllowed.decision === "allow", "worker should be allowed only with explicit parent override");

  const workerContract = getAgentGovernanceContract("worker");
  assert(workerContract.enforced === true, "worker should now be force-restricted");
  assert(workerContract.legacyOnly === true, "worker should be marked legacy-only");
  assert(workerContract.requiresParentOverride === true, "worker should require parent override");
}

function testPolicySnapshotHasSingleSource() {
  const snapshot = getAgentGovernancePolicySnapshot();
  assert(snapshot && typeof snapshot === "object", "policy snapshot should be object");
  assert(snapshot.source === "file" || snapshot.source === "builtin", "policy source should be known value");
  assert(snapshot.path && snapshot.path.includes("agent_governance_contracts.json"), "policy path should target governance contracts file");
  assert(snapshot.contracts && snapshot.contracts.frontend_worker, "policy contracts should include frontend_worker");
}

function testParentOverrideProcedure() {
  const allowed = evaluateAgentGovernance({
    agentName: "frontend_worker",
    operation: "fileChange",
    changedPaths: ["server.js"],
    override: {
      requestedBy: "intake",
      reason: "hotfix required to unblock release flow",
      ticket: "OPS-42",
    },
  });
  assert(allowed.decision === "allow", "parent override should allow out-of-scope change");
  assert(allowed.reason === "parent_override", "parent override should set parent_override reason");
  assert(allowed.override && allowed.override.applied === true, "override should be marked as applied");

  const scopedAllowed = evaluateAgentGovernance({
    agentName: "frontend_worker",
    operation: "fileChange",
    changedPaths: ["server.js"],
    override: {
      requestedBy: "default@chat-001",
      reason: "urgent release gate rollback requires parent override now",
      ticket: "OPS-99",
    },
  });
  assert(scopedAllowed.decision === "allow", "scoped default parent override should be allowed");
  assert(scopedAllowed.override && scopedAllowed.override.applied === true, "scoped default override should be applied");

  const denied = evaluateAgentGovernance({
    agentName: "frontend_worker",
    operation: "fileChange",
    changedPaths: ["server.js"],
    override: {
      requestedBy: "worker",
      reason: "attempt bypass",
    },
  });
  assert(denied.decision === "deny", "non-parent override should still be denied");
  assert(
    denied.override && denied.override.failureReason === "parent_override_requires_parent_agent",
    "override failure reason should indicate parent-only rule"
  );
}

function run() {
  const tests = [
    ["normalize agent name", testNormalizeAgentName],
    ["reviewer read-only command", testReviewerReadOnly],
    ["frontend scope enforcement", testFrontendScope],
    ["tester verification-only scope", testTesterVerificationScope],
    ["unknown and worker legacy behavior", testUnknownAgentAndWorkerLegacyBehavior],
    ["policy snapshot source of truth", testPolicySnapshotHasSingleSource],
    ["parent override procedure", testParentOverrideProcedure],
  ];
  let passed = 0;
  for (const [name, fn] of tests) {
    fn();
    passed += 1;
    console.log(`[agent-governance-test] PASS ${name}`);
  }
  console.log(`[agent-governance-test] total=${tests.length} pass=${passed} fail=0`);
  console.log("PASS");
}

try {
  run();
} catch (error) {
  console.log(`[agent-governance-test] FAIL ${error instanceof Error ? error.message : String(error)}`);
  console.log("FAIL");
  process.exitCode = 1;
}
