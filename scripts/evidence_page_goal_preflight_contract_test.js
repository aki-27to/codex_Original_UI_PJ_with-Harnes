#!/usr/bin/env node
"use strict";

const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const {
  buildEvidencePageModel,
  loadEvidencePageContract,
  renderEvidencePageHtml,
} = require("./lib/evidence_page_builder");
const {
  loadGoalPreflightContract,
  validateGoalPreflight,
} = require("./lib/goal_preflight_policy");

const workspaceRoot = path.resolve(__dirname, "..");

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(workspaceRoot, relativePath), "utf8"));
}

function writeJson(dir, name, value) {
  fs.writeFileSync(path.join(dir, name), `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function testContractWiring() {
  const packageJson = readJson("package.json");
  const evidenceContract = readJson("scripts/config/evidence_contract.json");
  const taskOutcomeContract = readJson("scripts/config/task_outcome_contract.json");
  const systemCoherenceContract = readJson("scripts/config/system_coherence_review_contract.json");
  const evidencePageContract = loadEvidencePageContract();
  const goalPreflightContract = loadGoalPreflightContract();

  assert.strictEqual(evidencePageContract.defaultArtifact, "output/governance_public/closeout_evidence_page.html");
  assert.strictEqual(evidencePageContract.packageCommand, "npm run artifact:evidence-page");
  assert.strictEqual(evidencePageContract.packageVisibleVerifier, "npm run test:evidence-page-goal-preflight-contract");
  assert.strictEqual(goalPreflightContract.packageVisibleVerifier, "npm run test:evidence-page-goal-preflight-contract");
  assert.strictEqual(packageJson.scripts["artifact:evidence-page"], "node scripts/generate_evidence_page.js");
  assert.strictEqual(
    packageJson.scripts["test:evidence-page-goal-preflight-contract"],
    "node scripts/evidence_page_goal_preflight_contract_test.js"
  );
  assert.strictEqual(evidenceContract.reviewerVisibleCloseout.contract, "scripts/config/evidence_page_contract.json");
  assert.strictEqual(evidenceContract.goalPreflight.contract, "scripts/config/goal_preflight_contract.json");
  assert(taskOutcomeContract.proofCarryingRequiredFields.includes("reviewer_visible_evidence_page"));
  assert(taskOutcomeContract.proofCarryingRequiredFields.includes("goal_preflight"));
  assert.strictEqual(taskOutcomeContract.reasonMap.reviewer_visible_evidence_page_missing, "FAILED_VALIDATION");
  assert.strictEqual(taskOutcomeContract.reasonMap.goal_preflight_missing, "FAILED_VALIDATION");
  assert.strictEqual(taskOutcomeContract.reasonMap.subjective_done_when, "FAILED_VALIDATION");
  assert(systemCoherenceContract.requiredMachineContracts.includes("scripts/config/evidence_page_contract.json"));
  assert(systemCoherenceContract.requiredMachineContracts.includes("scripts/config/goal_preflight_contract.json"));
}

function testEvidencePageRendering() {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "harnes-evidence-page-"));
  writeJson(tempRoot, "request_frame.json", {
    user_goal: "Produce a reviewer-visible closeout proof surface.",
    constraints: ["No new orchestration endpoint."],
    acceptance_criteria: ["HTML artifact lists the command evidence."],
  });
  writeJson(tempRoot, "requirement_contract.json", {
    lockedGoal: "Evidence page contract",
    acceptanceChecks: ["command: npm run artifact:evidence-page", "file: output/governance_public/closeout_evidence_page.html"],
    requiredEvidence: ["reviewer verdict"],
  });
  writeJson(tempRoot, "evidence_manifest.json", {
    changedArtifacts: ["scripts/config/evidence_page_contract.json"],
    verification: ["node scripts/evidence_page_goal_preflight_contract_test.js"],
  });
  writeJson(tempRoot, "worker_decision_surface.json", {
    topLevelOutcome: "COMPLETED",
    topLevelSummary: "Reviewer can start from one HTML page.",
    supportingArtifacts: ["closeout_evidence_page.html"],
    residualRisks: ["Runtime consumption is contract-level only in this pass."],
    adoptionReadiness: "READY",
  });
  writeJson(tempRoot, "review_load_breakdown.json", {
    reviewer: "PASS",
    command: "npm run test:evidence-page-goal-preflight-contract",
  });
  writeJson(tempRoot, "stage_timeline.json", { status: "completed" });
  writeJson(tempRoot, "flow_trace_summary.json", { status: "completed" });
  writeJson(tempRoot, "release_decision.json", { status: "RELEASE_APPROVED" });
  writeJson(tempRoot, "adoption_readiness_eval.json", { status: "READY" });

  const model = buildEvidencePageModel({ sourceDir: tempRoot, generatedAt: "2026-05-29T00:00:00.000Z" });
  const html = renderEvidencePageHtml(model);
  for (const id of [
    "original_request",
    "acceptance_checks",
    "changed_artifacts",
    "verification_commands",
    "runtime_truth",
    "reviewer_or_tester_verdict",
    "residual_risks",
    "adoption_decision",
  ]) {
    assert(html.includes(`id="${id}"`), `missing evidence page section ${id}`);
  }
  assert(html.includes("npm run artifact:evidence-page"));
  assert(!/https?:\/\//.test(html), "closeout page must not depend on external network URLs");
  assert(!/<script\s+src=/i.test(html), "closeout page must not load external scripts");
  assert(!/<link\s+href=/i.test(html), "closeout page must not load external stylesheets");
}

function testGoalPreflightValidation() {
  const contract = loadGoalPreflightContract();
  const valid = validateGoalPreflight({
    objective: "Implement closeout evidence page contract.",
    endState: "The repo exposes an HTML artifact command and a dedicated contract test.",
    statedChecks: [
      "command: npm run test:evidence-page-goal-preflight-contract",
      "file: output/governance_public/closeout_evidence_page.html",
    ],
    constraints: ["No new route."],
    nonGoals: ["Do not change /api/exec."],
    evaluator: "independent reviewer or package-visible test",
    evidencePlan: ["json contract", "html artifact", "test command"],
    stopControls: ["fail on missing required section"],
  }, contract);
  assert.strictEqual(valid.ok, true);
  assert.strictEqual(valid.status, "READY_FOR_LONG_RUN");

  const vague = validateGoalPreflight({
    objective: "Make it perfect.",
    endState: "\u3044\u3044\u611f\u3058\u306b\u5b8c\u74a7",
    doneWhen: "looks good",
    statedChecks: ["review it"],
    constraints: [],
    nonGoals: [],
    evaluator: "self",
    evidencePlan: [],
    stopControls: [],
  }, contract);
  assert.strictEqual(vague.ok, false);
  assert(vague.reasons.includes("subjective_done_when"));
  assert(vague.reasons.includes("missing_observable_check"));
}

function run() {
  testContractWiring();
  console.log("[evidence-page-goal-preflight-contract-test] PASS contract wiring");
  testEvidencePageRendering();
  console.log("[evidence-page-goal-preflight-contract-test] PASS evidence page rendering");
  testGoalPreflightValidation();
  console.log("[evidence-page-goal-preflight-contract-test] PASS goal preflight validation");
  console.log("PASS");
}

try {
  run();
} catch (error) {
  console.log(`[evidence-page-goal-preflight-contract-test] FAIL ${error instanceof Error ? error.message : String(error)}`);
  console.log("FAIL");
  process.exitCode = 1;
}
