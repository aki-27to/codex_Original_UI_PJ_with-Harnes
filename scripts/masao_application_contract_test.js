#!/usr/bin/env node
"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");

const workspaceRoot = path.resolve(__dirname, "..");

function read(relativePath) {
  return fs.readFileSync(path.join(workspaceRoot, relativePath), "utf8");
}

function readJson(relativePath) {
  return JSON.parse(read(relativePath));
}

function assertExists(relativePath) {
  assert(fs.existsSync(path.join(workspaceRoot, relativePath)), `missing proof file ${relativePath}`);
}

function main() {
  const contract = readJson("scripts/config/masao_application_contract.json");
  const packageJson = readJson("package.json");
  const runnerSource = read("scripts/run_repo_quality_gate.js");
  const evidenceContract = readJson("scripts/config/evidence_contract.json");
  const systemCoherence = readJson("scripts/config/system_coherence_review_contract.json");
  assert.strictEqual(contract.schema, "masao-application-contract.v1", "Masao application contract schema mismatch");
  assert.strictEqual(contract.sourceBoundary.includes("Do not copy paid source text"), true, "source boundary must be explicit");
  const expectedIds = [
    "p0_evidence_page_contract",
    "p0_goal_preflight_contract",
    "p1_turn_trace_readout",
    "p1_skill_portfolio_audit",
    "p1_generator_evaluator_pairing",
    "p2_structured_work_graph_experiment",
    "p2_external_memory_search_layer",
    "p2_app_server_schema_drift_check"
  ];
  const actualIds = contract.items.map((item) => item.id);
  assert.deepStrictEqual(actualIds, expectedIds, "Masao application items must cover the full Harnes application map");
  for (const item of contract.items) {
    assert.strictEqual(item.status, "implemented", `${item.id} must be implemented`);
    for (const filePath of item.proofFiles) assertExists(filePath);
    for (const scriptName of item.packageCommands) {
      assert(Object.prototype.hasOwnProperty.call(packageJson.scripts, scriptName), `${item.id} missing package script ${scriptName}`);
    }
  }
  assert(Object.prototype.hasOwnProperty.call(packageJson.scripts, "test:masao-application-contract"), "aggregate package script missing");
  assert(runnerSource.includes('"test:masao-application-contract"'), "repo-quality governance stage must include Masao application contract checks");
  assert(evidenceContract.masaoAppliedHarness && evidenceContract.masaoAppliedHarness.contract === "scripts/config/masao_application_contract.json", "evidence contract must reference Masao applied harness contract");
  for (const requiredContract of [
    "scripts/config/masao_application_contract.json",
    "scripts/config/turn_trace_readout_contract.json",
    "scripts/config/app_server_schema_contract.json",
    "scripts/config/generator_evaluator_pairing_contract.json",
    "scripts/config/structured_work_graph_experiment.json",
    "scripts/config/local_memory_search_contract.json"
  ]) {
    assert(systemCoherence.requiredMachineContracts.includes(requiredContract), `system coherence contract missing ${requiredContract}`);
  }
  console.log("PASS masao_application_contract_test");
}

main();
