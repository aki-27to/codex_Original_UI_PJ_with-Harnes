#!/usr/bin/env node
"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const {
  loadTaskOutcomeContract,
} = require("./lib/task_outcome_policy");
const {
  loadUserFacingResponseContract,
} = require("./lib/user_facing_response_contract");
const {
  buildReleaseDecision,
} = require("./lib/constitution_conformance");

const workspaceRoot = path.resolve(__dirname, "..");

function read(relativePath) {
  return fs.readFileSync(path.join(workspaceRoot, relativePath), "utf8");
}

function main() {
  const taskOutcomeContract = loadTaskOutcomeContract(path.join(workspaceRoot, "scripts", "config", "task_outcome_contract.json"));
  const responseContract = loadUserFacingResponseContract(path.join(workspaceRoot, "scripts", "config", "user_facing_response_contract.json"));
  const releaseContract = JSON.parse(read(path.join("scripts", "config", "release_decision_contract.json")));
  const architectureDoc = read(path.join("docs", "CURRENT_ARCHITECTURE.md"));
  const completionDoc = read(path.join("docs", "AGI_OPERATIONAL_COMPLETION.md"));

  assert.strictEqual(
    taskOutcomeContract.authoritySeparation.programReadinessBlockingDefault,
    false,
    "task outcome contract must keep program readiness non-blocking by default"
  );
  assert.strictEqual(
    taskOutcomeContract.authoritySeparation.blockingActivation.requiresExplicitUserRequest,
    true,
    "task outcome contract must require explicit user request before program readiness becomes blocking"
  );
  assert(
    taskOutcomeContract.authoritySeparation.blockingActivation.explicitRequestScopes.includes("readiness")
      && taskOutcomeContract.authoritySeparation.blockingActivation.explicitRequestScopes.includes("release")
      && taskOutcomeContract.authoritySeparation.blockingActivation.explicitRequestScopes.includes("whole_harness_completion"),
    "task outcome contract must enumerate the explicit request scopes that can promote program readiness to blocking authority"
  );
  assert.strictEqual(
    taskOutcomeContract.authoritySeparation.blockingActivation.ordinaryTaskCompletion.taskVerdictPrimary,
    true,
    "ordinary task completion must keep task verdict primary"
  );
  assert.strictEqual(
    taskOutcomeContract.authoritySeparation.blockingActivation.ordinaryTaskCompletion.programReadinessMayBlockTaskCompletion,
    false,
    "ordinary task completion must not be blocked by program readiness by default"
  );

  assert.strictEqual(
    releaseContract.decisionScope,
    "release_readiness_and_whole_harness_completion_only",
    "release decision contract must scope itself to release/readiness/whole-harness decisions"
  );
  assert.strictEqual(
    releaseContract.defaultBlockingAuthority,
    false,
    "release decision contract must not be a default blocker for ordinary task completion"
  );
  assert.strictEqual(
    releaseContract.blockingAuthorityActivation.requiresExplicitUserRequest,
    true,
    "release decision contract must require an explicit user request before becoming blocking authority"
  );
  assert(
    Array.isArray(releaseContract.blockingAuthorityActivation.explicitRequestScopes)
      && releaseContract.blockingAuthorityActivation.explicitRequestScopes.includes("release")
      && releaseContract.blockingAuthorityActivation.explicitRequestScopes.includes("readiness")
      && releaseContract.blockingAuthorityActivation.explicitRequestScopes.includes("whole_harness_completion"),
    "release decision contract must enumerate the explicit request scopes that can promote it to blocking authority"
  );
  assert.strictEqual(
    releaseContract.blockingAuthorityActivation.ordinaryTaskCompletion.blockedByReleaseDecisionByDefault,
    false,
    "release decision contract must keep ordinary task completion unblocked by default"
  );
  assert.strictEqual(
    releaseContract.blockingAuthorityActivation.ordinaryTaskCompletion.releaseDecisionIsSeparateScope,
    true,
    "release decision contract must keep release judgment as a separate scope"
  );

  const releaseDecisionArtifact = buildReleaseDecision({
    finalOutcome: { taskOutcomeStatus: "COMPLETED", taskOutcomeReason: "task_complete" },
    reviewBundle: { recommended_release_state: "EXTERNAL_ACTION_REQUIRED" },
    signoffRefs: ["review_bundle.json"],
    replayBundleRefs: ["thread-1"],
    residualRisks: [],
    assumptions: ["Explicit release approval still required."],
    missingEvidence: [],
    rationaleNotes: ["task_outcome_status=COMPLETED"],
  });
  assert.strictEqual(
    releaseDecisionArtifact.contract_scope,
    releaseContract.decisionScope,
    "release decision runtime artifact must consume release decision contract scope"
  );
  assert.strictEqual(
    releaseDecisionArtifact.default_blocking_authority,
    releaseContract.defaultBlockingAuthority,
    "release decision runtime artifact must consume release decision default blocking authority"
  );
  assert.deepStrictEqual(
    releaseDecisionArtifact.blocking_authority_activation,
    releaseContract.blockingAuthorityActivation,
    "release decision runtime artifact must consume release decision blocking activation settings"
  );
  assert.strictEqual(
    releaseDecisionArtifact.terminal_state,
    "EXTERNAL_ACTION_REQUIRED",
    "release decision runtime artifact must still preserve the derived terminal state"
  );

  assert.strictEqual(responseContract.reportingSeparation.enabled, true, "user-facing response contract must enable reporting separation");
  assert.strictEqual(
    responseContract.reportingSeparation.ordinaryTaskReports.primarySection,
    "task_verdict",
    "ordinary task reports must lead with task verdict"
  );
  assert.strictEqual(
    responseContract.reportingSeparation.ordinaryTaskReports.secondarySection,
    "program_readiness",
    "ordinary task reports must keep program readiness secondary"
  );
  assert.strictEqual(
    responseContract.reportingSeparation.ordinaryTaskReports.leadWithProgramReadiness,
    false,
    "ordinary task reports must not lead with program readiness"
  );
  assert.strictEqual(
    responseContract.reportingSeparation.ordinaryTaskReports.treatProgramReadinessNotYetAsBackgroundByDefault,
    true,
    "ordinary task reports must treat program readiness NOT_YET as background by default"
  );
  assert.strictEqual(
    responseContract.reportingSeparation.programReadinessBlockingActivation.requiresExplicitUserRequest,
    true,
    "program readiness reporting escalation must require explicit user request"
  );

  assert(
    architectureDoc.includes("ordinary task completion keeps the task verdict primary"),
    "CURRENT_ARCHITECTURE.md must describe task verdict as primary for ordinary task completion"
  );
  assert(
    architectureDoc.includes("program readiness becomes blocking only for explicit readiness / release / whole-harness completion asks"),
    "CURRENT_ARCHITECTURE.md must describe the explicit activation rule"
  );
  assert(
    completionDoc.includes("Task verdict first, Program readiness second"),
    "AGI_OPERATIONAL_COMPLETION.md must describe the reporting order"
  );
  assert(
    completionDoc.includes("Do not lead an ordinary task report with program-readiness NOT_YET"),
    "AGI_OPERATIONAL_COMPLETION.md must prohibit leading ordinary task reports with program-readiness NOT_YET"
  );

  process.stdout.write("PASS completion_readiness_authority_test\n");
}

try {
  main();
} catch (error) {
  process.stderr.write(`FAIL completion_readiness_authority_test: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
}
