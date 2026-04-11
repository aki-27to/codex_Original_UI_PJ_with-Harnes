#!/usr/bin/env node
"use strict";

const assert = require("assert");
const {
  loadAdoptionReadinessContract,
  evaluateAdoptionReadiness,
  evaluateEvalRunAdoptionReadiness,
} = require("./lib/adoption_readiness_policy");

function main() {
  const contract = loadAdoptionReadinessContract();
  assert.strictEqual(contract.schema, "adoption-readiness-evaluator-contract.v1", "adoption readiness schema mismatch");
  assert(contract.dimensions.includes("latent_intent_alignment"), "latent intent dimension must exist");
  assert(contract.dimensions.includes("adoption_readiness"), "adoption readiness dimension must exist");

  const passing = evaluateAdoptionReadiness({
    acceptanceResults: [
      { id: "ac-1", status: "PASS" },
      { id: "ac-2", status: "PASS" },
    ],
    reviewBundle: {
      recommended_release_state: "RELEASE_APPROVED",
      blockers: [],
    },
    finalOutcome: {
      taskOutcomeStatus: "COMPLETED",
      taskOutcomeReason: "all_checks_passed",
    },
    clauseCompletionScorecard: {
      status: "PASS",
    },
    residualRisks: [],
    assumptions: ["operator accepted bounded assumption"],
    evidenceRefs: ["review_bundle.json", "release_decision.json", "iteration_decision.json", "adoption_readiness_eval.json"],
    expectedEvidenceRefCount: 4,
    iterationDecision: {
      action: "RELEASE",
      blockers: [],
    },
  }, contract);
  assert.strictEqual(Number(passing.completedStateObserved || 0), 1, "completed state must be observed for passing case");
  assert(Number(passing.scores.adoption_readiness) >= 0.8, "passing case must be adoption-ready");
  assert.strictEqual(passing.blockers.length, 0, "passing case must not carry blockers");

  const failing = evaluateAdoptionReadiness({
    acceptanceResults: [
      { id: "ac-1", status: "FAIL" },
    ],
    reviewBundle: {
      recommended_release_state: "RELEASE_BLOCKED",
      blockers: ["visual_review_missing"],
    },
    finalOutcome: {
      taskOutcomeStatus: "FAILED_VALIDATION",
      taskOutcomeReason: "visual_review_missing",
    },
    clauseCompletionScorecard: {
      status: "FAIL",
    },
    residualRisks: ["no visual comparison"],
    assumptions: [],
    requiredEvidenceFailures: ["visual_review_missing"],
    evidenceRefs: ["review_bundle.json"],
    expectedEvidenceRefCount: 4,
    iterationDecision: {
      action: "FAILED_VALIDATION",
      blockers: ["visual_review_missing"],
    },
  }, contract);
  assert(Number(failing.scores.adoption_readiness) < 0.8, "failing case must stay below adoption threshold");
  assert(failing.blockers.includes("visual_review_missing"), "failing case must preserve blockers");

  const evalRun = evaluateEvalRunAdoptionReadiness({
    suite: { suiteId: "public_regression" },
    runs: [
      {
        cases: [
          { id: "case-1", passed: true },
          { id: "case-2", passed: true },
        ],
      },
    ],
    verifier: { verdict: "PASS", reason: "all_cases_passed" },
    comparison: { winner: "candidate", reason: "candidate_beats_baseline" },
  }, contract);
  assert.strictEqual(evalRun.schema, "adoption-readiness-eval.v1", "eval-run adoption readiness schema mismatch");
  assert(Number(evalRun.scores.adoption_readiness) >= 0.8, "passing eval run must be adoption-ready");

  process.stdout.write("PASS adoption_readiness_policy_test\n");
}

main();
