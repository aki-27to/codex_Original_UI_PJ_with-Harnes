#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const {
  defaultSystemCoherenceReviewContractPath,
  hasRequiredSystemReviewCommand,
  loadSystemCoherenceReviewContract,
  requiresSystemCoherenceReview,
} = require("./lib/system_coherence_review_policy");

const workspaceRoot = path.resolve(__dirname, "..");

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function read(relativePath) {
  return fs.readFileSync(path.join(workspaceRoot, relativePath), "utf8");
}

function readJson(relativePath) {
  return JSON.parse(read(relativePath));
}

function testLoadContract() {
  const contract = loadSystemCoherenceReviewContract(defaultSystemCoherenceReviewContractPath);
  assert(contract.schema === "system-coherence-review-contract.v2", "system coherence review contract schema mismatch");
  assert(contract.requiredCommand === "node scripts/system_coherence_review_test.js", "required command mismatch");
  const planeIds = contract.reviewPlanes.map((entry) => entry.id);
  for (const expected of ["execution_path", "governance_rules", "machine_contracts", "server_runtime", "evaluation_memory", "artifact_surface"]) {
    assert(planeIds.includes(expected), `missing review plane: ${expected}`);
  }
  for (const expectedContract of [
    "scripts/config/authority_registry.json",
    "scripts/config/adoption_readiness_evaluator_contract.json",
    "scripts/config/deployment_posture_profiles.json",
    "scripts/config/harness_plane_contract.json",
    "scripts/config/iteration_control_contract.json",
  ]) {
    assert(contract.requiredMachineContracts.includes(expectedContract), `missing required machine contract: ${expectedContract}`);
  }
  assert(contract.requiredDocs.includes("docs/SINGLE_HARNESS_MULTI_PLANE.md"), "single harness plane doc must be a required coherence doc");
}

function testCoreChangeDetection() {
  const contract = loadSystemCoherenceReviewContract(defaultSystemCoherenceReviewContractPath);
  assert(
    requiresSystemCoherenceReview({
      changedPaths: ["server.js"],
      contract,
    }) === true,
    "server.js changes must require whole-system coherence review"
  );
  assert(
    requiresSystemCoherenceReview({
      changedPaths: ["output/public_regression_summary.json"],
      contract,
    }) === false,
    "non-core output-only changes should not trigger whole-system coherence review"
  );
  assert(
    requiresSystemCoherenceReview({
      prompt: "Review the architecture and /api/exec governance consistency before closing this task.",
      contract,
    }) === true,
    "core prompt markers should require whole-system coherence review even before changed paths exist"
  );
}

function testRequiredCommandDetection() {
  const contract = loadSystemCoherenceReviewContract(defaultSystemCoherenceReviewContractPath);
  assert(
    hasRequiredSystemReviewCommand({
      sampleCommands: ["node scripts/system_coherence_review_test.js"],
      contract,
    }) === true,
    "exact whole-system coherence review command should be recognized"
  );
  assert(
    hasRequiredSystemReviewCommand({
      sampleCommands: ["node scripts/repo_static_hygiene_test.js"],
      contract,
    }) === false,
    "other repo hygiene commands must not satisfy the whole-system coherence review gate"
  );
}

function testRepoSync() {
  const contract = loadSystemCoherenceReviewContract(defaultSystemCoherenceReviewContractPath);
  const packageJson = readJson("package.json");
  const evidenceContract = readJson("scripts/config/evidence_contract.json");
  const agentGovernance = readJson("scripts/config/agent_governance_contracts.json");
  const taskOutcomeContract = readJson("scripts/config/task_outcome_contract.json");
  const operatingRules = read("docs/AGENT_OPERATING_RULES.md");
  const evidenceDoc = read("docs/EVIDENCE_CONTRACT.md");
  const coherenceDoc = read("docs/SYSTEM_COHERENCE_REVIEW.md");
  const architecture = read("docs/CURRENT_ARCHITECTURE.md");
  const planeDoc = read("docs/SINGLE_HARNESS_MULTI_PLANE.md");
  const serverText = read("server.js");

  assert(packageJson.scripts && packageJson.scripts["test:system-coherence"] === contract.requiredCommand, "package.json must expose the whole-system coherence review command");
  assert(
    evidenceContract.minimumEvidenceByChangeType
      && Array.isArray(evidenceContract.minimumEvidenceByChangeType.core_system_change)
      && evidenceContract.minimumEvidenceByChangeType.core_system_change.includes(contract.requiredCommand),
    "evidence contract must require the whole-system coherence review command for core system changes"
  );
  assert(agentGovernance.runtimeInvariants && agentGovernance.runtimeInvariants.systemCoherenceReviewRequiredForCoreChanges === true, "agent governance invariants must require whole-system coherence review for core changes");
  assert(
    taskOutcomeContract.reasonMap && taskOutcomeContract.reasonMap.system_coherence_review_missing === "FAILED_VALIDATION",
    "task outcome contract must classify missing whole-system coherence review as FAILED_VALIDATION"
  );
  assert(/Whole-System Coherence Gate/.test(operatingRules), "AGENT_OPERATING_RULES.md must document the whole-system coherence gate");
  assert(evidenceDoc.includes(contract.requiredCommand), "EVIDENCE_CONTRACT.md must reference the whole-system coherence review command");
  assert(coherenceDoc.includes(contract.primaryExecRoute), "SYSTEM_COHERENCE_REVIEW.md must describe the standard primary execution route");
  assert(architecture.includes("scripts/config/system_coherence_review_contract.json"), "CURRENT_ARCHITECTURE.md must reference the machine-readable whole-system coherence review contract");
  assert(architecture.includes("scripts/config/harness_plane_contract.json"), "CURRENT_ARCHITECTURE.md must reference the machine-readable harness plane contract");
  assert(planeDoc.includes("POST /api/exec"), "SINGLE_HARNESS_MULTI_PLANE.md must describe the execution route");
  assert(planeDoc.includes("POST /api/eval/run"), "SINGLE_HARNESS_MULTI_PLANE.md must describe the evaluation route");
  assert(planeDoc.includes("single governed harness"), "SINGLE_HARNESS_MULTI_PLANE.md must keep the single harness identity");
  assert(serverText.includes("system_coherence_review_missing"), "server.js must enforce whole-system coherence review as a distinct missing-evidence reason");
}

function run() {
  const tests = [
    ["load contract", testLoadContract],
    ["core change detection", testCoreChangeDetection],
    ["required command detection", testRequiredCommandDetection],
    ["repo sync", testRepoSync],
  ];
  let passed = 0;
  for (const [name, fn] of tests) {
    fn();
    passed += 1;
    console.log(`[system-coherence-review-test] PASS ${name}`);
  }
  console.log(`[system-coherence-review-test] total=${tests.length} pass=${passed} fail=0`);
  console.log("PASS");
}

try {
  run();
} catch (error) {
  console.log(`[system-coherence-review-test] FAIL ${error instanceof Error ? error.message : String(error)}`);
  console.log("FAIL");
  process.exitCode = 1;
}
