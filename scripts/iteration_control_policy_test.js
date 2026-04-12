#!/usr/bin/env node
"use strict";

const assert = require("assert");
const {
  loadIterationControlContract,
  buildIterationDecision,
  buildEscalationDecision,
} = require("./lib/iteration_control_policy");

function main() {
  const contract = loadIterationControlContract();
  assert.strictEqual(contract.schema, "iteration-control-contract.v1", "iteration control schema mismatch");
  assert.strictEqual(Number(contract.qualityThresholds.task_contract_integrity), 0.92, "task-contract integrity threshold mismatch");

  const releaseDecision = buildIterationDecision({
    evaluator: {
      scores: {
        boundary_compliance: 1,
        literal_requirement_alignment: 0.95,
        latent_intent_alignment: 0.91,
        task_contract_integrity: 0.98,
        artifact_quality: 0.9,
        adoption_readiness: 0.91,
        iteration_value_remaining: 0.1,
      },
      blockers: [],
    },
    finalOutcome: {
      taskOutcomeStatus: "COMPLETED",
      taskOutcomeReason: "all_checks_passed",
    },
    residualRisks: [],
    assumptions: [],
    requiredEvidenceFailures: [],
    stepCount: 4,
    startedAt: Date.now() - 1000,
    now: Date.now(),
  }, contract);
  assert.strictEqual(releaseDecision.action, "RELEASE", "high-confidence passing state must release");
  assert.strictEqual(Number(releaseDecision.failClosed || 0), 0, "release state must not be fail-closed");

  const validationFailure = buildIterationDecision({
    evaluator: {
      scores: {
        boundary_compliance: 0.4,
        literal_requirement_alignment: 0.2,
        latent_intent_alignment: 0.3,
        task_contract_integrity: 0.18,
        artifact_quality: 0.4,
        adoption_readiness: 0.35,
        iteration_value_remaining: 0.7,
      },
      blockers: ["missing_visual_review"],
    },
    finalOutcome: {
      taskOutcomeStatus: "FAILED_VALIDATION",
      taskOutcomeReason: "missing_visual_review",
    },
    requiredEvidenceFailures: ["visual_review_missing"],
    residualRisks: ["design proof missing"],
    assumptions: [],
    stepCount: 12,
    startedAt: Date.now() - 1000,
    now: Date.now(),
  }, contract);
  assert.strictEqual(validationFailure.action, "FAILED_VALIDATION", "missing required evidence must fail validation");
  assert.strictEqual(Number(validationFailure.failClosed || 0), 1, "failed validation must be fail-closed");

  const goalSubstitutionFailure = buildIterationDecision({
    evaluator: {
      scores: {
        boundary_compliance: 1,
        literal_requirement_alignment: 0.93,
        latent_intent_alignment: 0.9,
        task_contract_integrity: 0.97,
        artifact_quality: 0.9,
        adoption_readiness: 0.88,
        iteration_value_remaining: 0.12,
      },
      blockers: ["goal_substitution_detected"],
      criticalFailures: ["goal_substitution_detected"],
    },
    finalOutcome: {
      taskOutcomeStatus: "COMPLETED",
      taskOutcomeReason: "goal_substitution_detected",
    },
    requiredEvidenceFailures: [],
    residualRisks: [],
    assumptions: [],
    stepCount: 5,
    startedAt: Date.now() - 1000,
    now: Date.now(),
  }, contract);
  assert.strictEqual(goalSubstitutionFailure.action, "FAILED_VALIDATION", "goal substitution must fail validation");
  assert.strictEqual(goalSubstitutionFailure.reason, "goal_substitution_detected", "goal substitution must preserve its distinct failure reason");

  const exhaustedBudget = buildIterationDecision({
    evaluator: {
      scores: {
        boundary_compliance: 1,
        literal_requirement_alignment: 0.94,
        latent_intent_alignment: 0.88,
        task_contract_integrity: 0.95,
        artifact_quality: 0.86,
        adoption_readiness: 0.81,
        iteration_value_remaining: 0.55,
      },
      blockers: [],
    },
    finalOutcome: {
      taskOutcomeStatus: "COMPLETED",
      taskOutcomeReason: "more_value_remaining",
    },
    requiredEvidenceFailures: [],
    residualRisks: ["further refinement available"],
    assumptions: [],
    stepCount: contract.budgets.stepBudget + 1,
    startedAt: Date.now() - 1000,
    now: Date.now(),
  }, contract);
  assert.strictEqual(exhaustedBudget.action, "NEEDS_INPUT", "budget exhaustion with value remaining must escalate to NEEDS_INPUT");

  const escalation = buildEscalationDecision({
    contract,
    iterationDecision: exhaustedBudget,
    finalOutcome: {
      taskOutcomeReason: "budget_exhausted_while_value_remaining",
    },
  });
  assert.strictEqual(Number(escalation.escalationRequired || 0), 1, "NEEDS_INPUT iteration action must require escalation");

  process.stdout.write("PASS iteration_control_policy_test\n");
}

main();
