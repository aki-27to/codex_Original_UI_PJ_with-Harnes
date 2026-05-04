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
  assert(unknown.decision === "deny", "unknown agent file changes should be blocked");
  assert(unknown.reason === "unknown_agent_file_change_forbidden", "unknown file changes should have a specific reason");

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
  assert(snapshot.runtimeInvariants && typeof snapshot.runtimeInvariants === "object", "policy snapshot must expose runtime invariants");
  assert(
    snapshot.runtimeInvariants.defaultRequestUserInputPolicy === "auto-default",
    "runtime invariants must keep the live request-user-input posture autonomy-first"
  );
  assert(
    snapshot.runtimeInvariants.strictLaneRequestUserInputPolicy === "blocked",
    "runtime invariants must keep strict proof/repro lanes blocked"
  );
  assert(
    snapshot.runtimeInvariants.continuousGapClosureLoop === "identify_next_gap_then_close_it_until_terminal_state",
    "runtime invariants must expose the continuous gap-closure loop"
  );
  assert(
    snapshot.runtimeInvariants.postCompletionNextTaskSynthesis === "after_each_local_completion_recompute_remaining_gap_and_queue_next_task",
    "runtime invariants must expose post-completion next-task synthesis"
  );
  assert(
    snapshot.runtimeInvariants.userOutcomePriority === "adoption_ready_deliverable_over_procedural_closure",
    "runtime invariants must prioritize adoption-ready user outcomes over procedural closure"
  );
  assert(
    snapshot.runtimeInvariants.literalRequestPreservationRequired === true,
    "runtime invariants must preserve literal request alignment"
  );
  assert(
    snapshot.runtimeInvariants.latentIntentPreservationRequired === true,
    "runtime invariants must preserve latent intent alignment"
  );
  assert(
    snapshot.runtimeInvariants.internalGoalSubstitutionForbidden === true,
    "runtime invariants must forbid internal goal substitution"
  );
  assert(
    snapshot.runtimeInvariants.silentTaskContractRewriteForbidden === true,
    "runtime invariants must forbid silent task-contract rewrites"
  );
  assert(
    snapshot.runtimeInvariants.proceduralClosureCountsAsSuccess === false,
    "runtime invariants must reject procedural closure as sufficient success"
  );
  assert(
    Array.isArray(snapshot.runtimeInvariants.returnToHumanOnlyWhen)
      && snapshot.runtimeInvariants.returnToHumanOnlyWhen.includes("explicit_user_judgment_required"),
    "runtime invariants must expose narrow return-to-human conditions"
  );
  assert(snapshot.runtimeInvariants.singleWriterApplyStepRequired === true, "runtime invariants must require a single writer apply step");
  assert(snapshot.runtimeInvariants.allowIntegrationOwnerPlannedPaths === true, "integration owner should be allowed on planned write paths");
  assert(snapshot.runtimeInvariants.unknownAgentFileChangePolicy === "deny", "unknown agent file changes should deny by default");
  assert(snapshot.contracts && snapshot.contracts.frontend_worker, "policy contracts should include frontend_worker");
}

function testSingleWriterMutex() {
  const taskContext = {
    dispatchPlan: {
      coordinationMode: "single_writer",
      singleWriter: 1,
      integrationOwner: "backend_worker",
      advisoryAgents: ["infra_worker"],
      dispatches: [
        {
          ownerAgent: "backend_worker",
          participationMode: "writer",
          mayWrite: 1,
          ownedPaths: ["server.js", "web/01.HarnesUI/app.js"],
        },
        {
          ownerAgent: "infra_worker",
          participationMode: "advisory",
          mayWrite: 0,
          ownedPaths: [],
        },
      ],
    },
  };

  const writerAllowed = evaluateAgentGovernance({
    agentName: "backend_worker@turn-1",
    operation: "fileChange",
    changedPaths: ["web/01.HarnesUI/app.js"],
    taskContext,
  });
  assert(writerAllowed.decision === "allow", "integration writer should be allowed on planned write paths");
  assert(
    writerAllowed.writerPolicy && writerAllowed.writerPolicy.integrationOwner === "backend_worker",
    "writer policy should expose the integration owner"
  );

  const advisorDenied = evaluateAgentGovernance({
    agentName: "infra_worker",
    operation: "fileChange",
    changedPaths: ["docs/CURRENT_ARCHITECTURE.md"],
    taskContext,
  });
  assert(advisorDenied.decision === "deny", "advisory agent should not become a parallel writer");
  assert(advisorDenied.reason === "parallel_writer_conflict", "advisory writer attempt should be a writer conflict");

  const writerOutOfPlanDenied = evaluateAgentGovernance({
    agentName: "backend_worker",
    operation: "fileChange",
    changedPaths: ["package.json"],
    taskContext,
  });
  assert(writerOutOfPlanDenied.decision === "deny", "integration writer should still be bounded by planned paths");
  assert(writerOutOfPlanDenied.reason === "path_out_of_scope", "out-of-plan writer paths should keep scope enforcement");
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
    ["single writer mutex", testSingleWriterMutex],
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
