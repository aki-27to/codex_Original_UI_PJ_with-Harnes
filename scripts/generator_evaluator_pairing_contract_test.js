#!/usr/bin/env node
"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");

const workspaceRoot = path.resolve(__dirname, "..");

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(workspaceRoot, relativePath), "utf8"));
}

function main() {
  const pairing = readJson("scripts/config/generator_evaluator_pairing_contract.json");
  const governance = readJson("scripts/config/agent_governance_contracts.json");
  const adoption = readJson("scripts/config/adoption_readiness_evaluator_contract.json");
  const taskOutcome = readJson("scripts/config/task_outcome_contract.json");
  assert.strictEqual(pairing.schema, "generator-evaluator-pairing-contract.v1", "pairing contract schema mismatch");
  for (const role of pairing.generatorRoles) {
    assert(governance.contracts[role], `missing generator role ${role}`);
    assert.strictEqual(governance.contracts[role].verificationOnly, false, `${role} must be able to generate implementation work`);
  }
  for (const role of pairing.evaluatorRoles) {
    assert(governance.contracts[role], `missing evaluator role ${role}`);
    assert.strictEqual(governance.contracts[role].verificationOnly, true, `${role} must be verification-only`);
  }
  for (const role of pairing.readOnlyEvaluatorRoles) {
    assert.strictEqual(governance.contracts[role].readOnly, true, `${role} must be read-only`);
  }
  for (const input of pairing.requiredGateInputs) {
    assert(adoption.judgmentInputs.includes(input), `adoption readiness must consume ${input}`);
  }
  assert.strictEqual(governance.runtimeInvariants.singleWriterApplyStepRequired, true, "single-writer invariant must remain enabled");
  assert.strictEqual(taskOutcome.reasonMap.single_writer_missing_integration_owner, "FAILED_VALIDATION", "missing integration owner must fail validation");
  assert(pairing.prohibitions.includes("self_review_as_completion_gate"), "self-review gate prohibition missing");
  console.log("PASS generator_evaluator_pairing_contract_test");
}

main();
