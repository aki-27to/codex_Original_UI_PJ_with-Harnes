#!/usr/bin/env node
"use strict";

const assert = require("assert");
const path = require("path");
const {
  buildPlanningArtifacts,
  loadPlanningModeContract,
  sanitizePlanningArtifactsForRuntime,
} = require("./lib/planning_mode_policy");

function run() {
  const contract = loadPlanningModeContract(path.join(__dirname, "config", "planning_mode_contract.json"));
  assert.strictEqual(contract.schema, "planning-mode-contract.v1", "planning mode contract schema mismatch");

  const fastPrompt = [
    "# Goal",
    "Update only docs/CURRENT_ARCHITECTURE.md with one wording fix.",
    "# Acceptance Criteria",
    "- Change exactly one sentence.",
    "- Do not modify any other file.",
  ].join("\n");
  const fastArtifacts = buildPlanningArtifacts({ prompt: fastPrompt, options: { agentName: "default" }, contract });
  assert.strictEqual(fastArtifacts.selection.selectedMode, "FAST", "small bounded task should select FAST");
  assert.strictEqual(fastArtifacts.selection.selectedPlanningDepth, "FAST_PLANNING", "FAST task should map to FAST_PLANNING");
  assert.strictEqual(fastArtifacts.selection.selectedAssuranceDepth, "LIGHT_ASSURANCE", "docs-only fast task should select LIGHT_ASSURANCE");
  assert.strictEqual(fastArtifacts.dispatchPlan.dispatches[0].ownerAgent, "infra_worker", "docs-only task should route to infra_worker");

  const normalPrompt = [
    "# Goal",
    "Update server.js and docs/CURRENT_ARCHITECTURE.md to expose the selected execution flow in runtime output.",
    "# Implementation Requirements",
    "- Update server.js runtime output.",
    "- Update docs/CURRENT_ARCHITECTURE.md.",
    "# Acceptance Criteria",
    "- Reviewer evidence is required.",
    "- Tester evidence is required.",
  ].join("\n");
  const normalArtifacts = buildPlanningArtifacts({ prompt: normalPrompt, options: { agentName: "default" }, contract });
  assert.strictEqual(normalArtifacts.selection.selectedMode, "NORMAL", "cross-specialist bounded task should select NORMAL");
  assert.strictEqual(normalArtifacts.selection.selectedPlanningDepth, "STANDARD_PLANNING", "NORMAL task should map to STANDARD_PLANNING");
  assert.strictEqual(normalArtifacts.selection.selectedAssuranceDepth, "SIGNOFF_ASSURANCE", "runtime/doc task with reviewer/tester should select SIGNOFF_ASSURANCE");
  assert.deepStrictEqual(
    normalArtifacts.dispatchPlan.dispatches.map((entry) => entry.ownerAgent),
    ["backend_worker", "infra_worker"],
    "NORMAL plan should split backend and infra ownership"
  );
  assert.strictEqual(normalArtifacts.dispatchPlan.reviewerRequired, 1, "NORMAL plan should require reviewer");
  assert.strictEqual(normalArtifacts.dispatchPlan.testerRequired, 1, "NORMAL plan should require tester");
  assert.strictEqual(normalArtifacts.dispatchPlan.signoffRequired, 1, "high-risk runtime task should require signoff");

  const discoveryPrompt = [
    "# Goal",
    "Design a new enterprise execution workflow for a future product line.",
    "# Background",
    "The goal, non-goals, specialist ownership, and acceptance checks are not fixed yet.",
    "User decision is required before implementation.",
    "# Acceptance Criteria",
    "- First make the open questions explicit.",
    "- Do not implement anything.",
  ].join("\n");
  const discoveryArtifacts = buildPlanningArtifacts({ prompt: discoveryPrompt, options: { agentName: "default" }, contract });
  assert.strictEqual(discoveryArtifacts.selection.selectedMode, "DISCOVERY", "ambiguous task should select DISCOVERY");
  assert.strictEqual(discoveryArtifacts.selection.selectedPlanningDepth, "DISCOVERY_PLANNING", "DISCOVERY task should map to DISCOVERY_PLANNING");
  assert.strictEqual(discoveryArtifacts.selection.selectedAssuranceDepth, "STANDARD_ASSURANCE", "ambiguous non-runtime task should default to STANDARD_ASSURANCE");
  assert.strictEqual(discoveryArtifacts.selection.needsInputRecommended, true, "DISCOVERY should recommend NEEDS_INPUT");
  assert.strictEqual(discoveryArtifacts.dispatchPlan.proposalOnly, 1, "DISCOVERY dispatch plan should stay proposal-only");

  const sanitized = sanitizePlanningArtifactsForRuntime(discoveryArtifacts);
  assert.strictEqual(sanitized.requirementContract.selectedPlanningDepth, "DISCOVERY_PLANNING", "sanitized artifacts should preserve planning depth");
  assert.strictEqual(sanitized.requirementContract.selectedAssuranceDepth, "STANDARD_ASSURANCE", "sanitized artifacts should preserve assurance depth");
  assert.ok(Array.isArray(sanitized.dispatchPlan.dispatches), "sanitized dispatch plan should keep dispatches");
}

try {
  run();
  console.log("PASS planning_mode_policy_test");
} catch (error) {
  console.error(`FAIL planning_mode_policy_test: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}
