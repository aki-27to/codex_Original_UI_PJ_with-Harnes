#!/usr/bin/env node
"use strict";

const path = require("path");
const {
  defaultTaskOutcomeContractPath,
  deriveTaskOutcome,
  loadTaskOutcomeContract,
  validateTaskOutcomeTurnCompatibility,
  validateTaskOutcomeStatus,
} = require("./lib/task_outcome_policy");

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function testLoadContract() {
  const spec = loadTaskOutcomeContract(path.join(__dirname, "config", "task_outcome_contract.json"));
  assert(spec && spec.schema === "task-outcome-contract.v3", "task outcome contract schema mismatch");
  assert(Array.isArray(spec.statuses) && spec.statuses.some((entry) => entry.id === "NEEDS_INPUT"), "task outcome statuses missing NEEDS_INPUT");
  assert(Array.isArray(spec.proofCarryingRequiredFields) && spec.proofCarryingRequiredFields.includes("goal_alignment_trace"), "task outcome proof fields must include goal_alignment_trace");
  assert(spec.authoritySeparation && spec.authoritySeparation.programReadinessBlockingDefault === false, "program readiness must stay non-blocking by default");
  assert(spec.authoritySeparation.blockingActivation.requiresExplicitUserRequest === true, "program readiness blocking must require explicit user request");
  assert(spec.authoritySeparation.blockingActivation.ordinaryTaskCompletion.taskVerdictPrimary === true, "ordinary task completion must keep task verdict primary");
  assert(spec.authoritySeparation.blockingActivation.ordinaryTaskCompletion.programReadinessMayBlockTaskCompletion === false, "ordinary task completion must not be blocked by program readiness by default");
}

function testValidateStatus() {
  const spec = loadTaskOutcomeContract(defaultTaskOutcomeContractPath);
  const allowed = validateTaskOutcomeStatus({ status: "failed_validation", spec });
  assert(allowed.ok === true, "FAILED_VALIDATION should be allowed");
  const denied = validateTaskOutcomeStatus({ status: "UNKNOWN_STATUS", spec });
  assert(denied.ok === false, "unknown task outcome status should be rejected");
}

function testCompletedDefault() {
  const verdict = deriveTaskOutcome({ turnStatus: "completed" });
  assert(verdict.status === "COMPLETED", "completed turn should default to COMPLETED");
}

function testNeedsInputFromApprovalReason() {
  const verdict = deriveTaskOutcome({
    turnStatus: "failed",
    approvalReason: "interactive_approval_unavailable",
  });
  assert(verdict.status === "NEEDS_INPUT", "interactive approval should map to NEEDS_INPUT");
}

function testBlockedFromGovernanceReason() {
  const verdict = deriveTaskOutcome({
    turnStatus: "failed",
    governanceReason: "legacy_only_requires_parent_override",
  });
  assert(verdict.status === "BLOCKED", "legacy-only worker use should map to BLOCKED");
}

function testFailedValidationFromGuard() {
  const verdict = deriveTaskOutcome({
    turnStatus: "failed",
    parentDispatchViolation: true,
  });
  assert(verdict.status === "FAILED_VALIDATION", "parent dispatch guard violation should map to FAILED_VALIDATION");
}

function testFailedValidationFromSystemCoherenceReview() {
  const verdict = deriveTaskOutcome({
    turnStatus: "failed",
    reason: "system_coherence_review_missing",
  });
  assert(verdict.status === "FAILED_VALIDATION", "missing whole-system coherence review should map to FAILED_VALIDATION");
}

function testFailedValidationFromIntentWildcard() {
  const verdict = deriveTaskOutcome({
    turnStatus: "failed",
    reason: "intent_visual_review_missing",
  });
  assert(verdict.status === "FAILED_VALIDATION", "intent_* reasons should map to FAILED_VALIDATION");
}

function testFailedValidationFromGoalSubstitution() {
  const verdict = deriveTaskOutcome({
    turnStatus: "completed",
    reason: "goal_substitution_detected",
  });
  assert(verdict.status === "FAILED_VALIDATION", "goal substitution must map to FAILED_VALIDATION even after procedural completion");
}

function testFailedValidationFromCorrectionLearningReasons() {
  const patchVerdict = deriveTaskOutcome({
    turnStatus: "failed",
    reason: "policy_patch_incomplete",
  });
  assert(patchVerdict.status === "FAILED_VALIDATION", "policy patch incompletion should map to FAILED_VALIDATION");
  const replayVerdict = deriveTaskOutcome({
    turnStatus: "failed",
    reason: "replay_verification_missing",
  });
  assert(replayVerdict.status === "FAILED_VALIDATION", "missing replay verification should map to FAILED_VALIDATION");
}

function testPartialFromLatentIntentThreshold() {
  const verdict = deriveTaskOutcome({
    turnStatus: "completed",
    reason: "latent_intent_alignment_below_threshold",
  });
  assert(verdict.status === "PARTIAL", "latent intent under-threshold should map to PARTIAL");
}

function testFailedDefaultBlocked() {
  const verdict = deriveTaskOutcome({
    turnStatus: "failed",
  });
  assert(verdict.status === "BLOCKED", "generic failed turn should default to BLOCKED");
}

function testPartialDelivery() {
  const verdict = deriveTaskOutcome({
    turnStatus: "completed",
    partial: true,
  });
  assert(verdict.status === "PARTIAL", "partial flag should map to PARTIAL");
}

function testTurnCompatibility() {
  const spec = loadTaskOutcomeContract(defaultTaskOutcomeContractPath);
  const ok = validateTaskOutcomeTurnCompatibility({
    turnStatus: "failed",
    taskOutcomeStatus: "FAILED_VALIDATION",
    spec,
  });
  assert(ok.ok === true, "failed turn should accept FAILED_VALIDATION");
  const mismatch = validateTaskOutcomeTurnCompatibility({
    turnStatus: "completed",
    taskOutcomeStatus: "NEEDS_INPUT",
    spec,
  });
  assert(mismatch.ok === false, "completed turn should reject NEEDS_INPUT");
  assert(mismatch.reason === "task_outcome_turn_state_mismatch", "mismatch should report turn-state mismatch");
}

function testReleaseConditionsIgnoredForOrdinaryTask() {
  const verdict = deriveTaskOutcome({
    turnStatus: "completed",
    reason: "release_conditions_unsatisfied",
    prompt: "Fix the worker-completion semantics regression.",
  });
  assert(verdict.status === "COMPLETED", "release conditions must not block ordinary task completion by default");
}

function testReleaseConditionsAppliedForExplicitReleaseScope() {
  const verdict = deriveTaskOutcome({
    turnStatus: "completed",
    reason: "release_conditions_unsatisfied",
    requestedDecisionScopes: ["release"],
  });
  assert(verdict.status === "PARTIAL", "explicit release scope must preserve release condition gating");
}

function run() {
  const tests = [
    ["load contract", testLoadContract],
    ["validate status ids", testValidateStatus],
    ["completed default", testCompletedDefault],
    ["needs input from approval", testNeedsInputFromApprovalReason],
    ["blocked from governance", testBlockedFromGovernanceReason],
    ["failed validation from parent dispatch guard", testFailedValidationFromGuard],
    ["failed validation from whole-system coherence review", testFailedValidationFromSystemCoherenceReview],
    ["failed validation from intent wildcard", testFailedValidationFromIntentWildcard],
    ["failed validation from goal substitution", testFailedValidationFromGoalSubstitution],
    ["failed validation from correction-learning reasons", testFailedValidationFromCorrectionLearningReasons],
    ["partial from latent intent threshold", testPartialFromLatentIntentThreshold],
    ["failed default blocked", testFailedDefaultBlocked],
    ["partial outcome derivation", testPartialDelivery],
    ["turn compatibility", testTurnCompatibility],
    ["release conditions ignored for ordinary tasks", testReleaseConditionsIgnoredForOrdinaryTask],
    ["release conditions applied for explicit release scope", testReleaseConditionsAppliedForExplicitReleaseScope],
  ];
  let passed = 0;
  for (const [name, fn] of tests) {
    fn();
    passed += 1;
    console.log(`[task-outcome-policy-test] PASS ${name}`);
  }
  console.log(`[task-outcome-policy-test] total=${tests.length} pass=${passed} fail=0`);
  console.log("PASS");
}

try {
  run();
} catch (error) {
  console.log(`[task-outcome-policy-test] FAIL ${error instanceof Error ? error.message : String(error)}`);
  console.log("FAIL");
  process.exitCode = 1;
}
