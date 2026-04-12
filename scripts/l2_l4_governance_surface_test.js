#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");

const workspaceRoot = path.resolve(__dirname, "..");

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(workspaceRoot, relativePath), "utf8"));
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function main() {
  const agentGovernance = readJson("scripts/config/agent_governance_contracts.json");
  const taskOutcome = readJson("scripts/config/task_outcome_contract.json");
  const iterationControl = readJson("scripts/config/iteration_control_contract.json");
  const adoptionReadiness = readJson("scripts/config/adoption_readiness_evaluator_contract.json");

  assert(
    agentGovernance.runtimeInvariants
      && agentGovernance.runtimeInvariants.userOutcomePriority === "adoption_ready_deliverable_over_procedural_closure",
    "agent governance must prioritize adoption-ready deliverables"
  );
  assert(agentGovernance.runtimeInvariants.internalGoalSubstitutionForbidden === true, "agent governance must forbid internal goal substitution");
  assert(agentGovernance.runtimeInvariants.silentTaskContractRewriteForbidden === true, "agent governance must forbid silent task-contract rewrite");
  assert(agentGovernance.runtimeInvariants.proceduralClosureCountsAsSuccess === false, "agent governance must reject procedural closure as success");
  assert(
    Array.isArray(agentGovernance.runtimeInvariants.returnToHumanOnlyWhen)
      && agentGovernance.runtimeInvariants.returnToHumanOnlyWhen.includes("explicit_user_judgment_required"),
    "agent governance must keep a narrow return-to-human boundary"
  );

  assert(Array.isArray(taskOutcome.proofCarryingRequiredFields) && taskOutcome.proofCarryingRequiredFields.includes("goal_alignment_trace"), "task outcome must require goal_alignment_trace");
  assert(taskOutcome.reasonMap.goal_substitution_detected === "FAILED_VALIDATION", "task outcome must fail validation on goal substitution");
  assert(taskOutcome.reasonMap.silent_task_contract_rewrite === "FAILED_VALIDATION", "task outcome must fail validation on silent contract rewrite");
  assert(taskOutcome.reasonMap.procedural_closure_without_adoption === "FAILED_VALIDATION", "task outcome must fail validation on procedural closure without adoption");

  assert(Number(iterationControl.qualityThresholds.task_contract_integrity) === 0.92, "iteration control must threshold task-contract integrity");
  assert(iterationControl.releaseConditions.includes("task_contract_integrity_at_or_above_threshold"), "iteration control must gate release on task-contract integrity");
  assert(iterationControl.failClosedConditions.includes("goal_substitution_detected"), "iteration control must fail closed on goal substitution");
  assert(iterationControl.validationFailureConditions.includes("procedural_closure_without_adoption"), "iteration control must treat procedural closure without adoption as validation failure");
  assert(iterationControl.retryConditions.includes("latent_intent_alignment_below_threshold"), "iteration control must retry on latent intent misses");

  assert(adoptionReadiness.dimensions.includes("task_contract_integrity"), "adoption readiness must evaluate task-contract integrity");
  assert(
    adoptionReadiness.hardGates
      && adoptionReadiness.hardGates.task_contract_integrity
      && Number(adoptionReadiness.hardGates.task_contract_integrity.min) === 0.92,
    "adoption readiness must hard-gate task-contract integrity"
  );
  assert(
    adoptionReadiness.proceduralClosureRule
      && adoptionReadiness.proceduralClosureRule.proceduralClosureIsNotSuccess === true,
    "adoption readiness must reject procedural closure as success"
  );
  assert(
    Array.isArray(adoptionReadiness.judgmentInputs)
      && adoptionReadiness.judgmentInputs.includes("replanned_goal"),
    "adoption readiness must require replanned_goal in its judgment inputs"
  );

  process.stdout.write("PASS l2_l4_governance_surface_test\n");
}

main();
