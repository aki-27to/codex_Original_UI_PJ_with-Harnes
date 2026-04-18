#!/usr/bin/env node
"use strict";

const path = require("path");
const {
  buildAcceptanceLock,
  buildCorrectionLearningDirective,
  buildCorrectionLearningRuntimeSummary,
  buildIntentLock,
  correctionFeedbackLooksActionable,
  createCorrectionEvent,
  evaluatePolicyPatchCompletion,
  loadCorrectionLearningContract,
  triageCorrectionLearning,
} = require("./lib/correction_learning_policy");

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function testLoadContract() {
  const contract = loadCorrectionLearningContract(path.join(__dirname, "config", "correction_learning_contract.json"));
  assert(contract.schema === "correction-learning-contract.v1", "contract schema mismatch");
  assert(contract.correctionEvent.requiredFields.includes("observed_miss"), "correction event required field missing");
  assert(contract.policyPatch.completionArtifactKinds.includes("regression_test"), "policy patch artifact kind missing");
  assert(contract.learningTriage.requiredDecisions.includes("patch_target_decision"), "learning triage should expose required decisions");
  assert(contract.learningTriage.requiredSteps.includes("patch_target_decision"), "learning triage should expose patch target decision");
  assert(contract.learningTriage.lifecycleDecisions.includes("gated_candidate"), "learning triage should expose lifecycle decisions");
  assert(contract.learningTriage.decisionPrinciple === "smallest_scope_that_prevents_recurrence", "learning triage should expose its routing principle");
  assert(correctionFeedbackLooksActionable("この文言はみ出ているやん", contract) === true, "overflow complaint should trigger correction handling");
  const directive = buildCorrectionLearningDirective({ contract });
  assert(/Correction loop:/i.test(directive), "directive should expose the correction loop contract");
  assert(/Learning triage:/i.test(directive), "directive should expose the learning triage contract");
  const runtimeSummary = buildCorrectionLearningRuntimeSummary({ contract });
  assert(runtimeSummary.summary.replayRequired === true, "runtime summary should preserve replay requirements");
  assert(runtimeSummary.summary.requiredDecisions.includes("improvement_lifecycle_decision"), "runtime summary should expose required decisions");
  assert(runtimeSummary.summary.learningTriageSteps.includes("skill_promotion_audit"), "runtime summary should expose triage stage order");
}

function testLockBuildersSeparateIntentAndAcceptance() {
  const requirementContract = {
    explicitGoal: "Ship a convincing Tetris UI.",
    implicitGoal: "Make it feel deliberate rather than templated.",
    lockedGoal: "Ship a convincing Tetris UI without visual breakage.",
    nonGoals: ["Do not ship placeholder language."],
    userValueFrame: {
      valueThesis: "The outcome should feel materially real.",
      mustAvoid: ["AI-feeling glassmorphism"],
      completedMeans: ["No overflow under worst-state copy."],
    },
    acceptanceChecks: [
      { id: "ac-1", title: "No text may overflow any panel bounds.", blocking: true },
      { id: "ac-2", title: "Worst-state screenshot proves no collisions.", blocking: true },
    ],
  };
  const intentLock = buildIntentLock({ requirementContract });
  const acceptanceLock = buildAcceptanceLock({ requirementContract });
  assert(intentLock.lockStatus === "locked", "intent lock should lock when a goal is locked");
  assert(intentLock.nonTargets.includes("Do not ship placeholder language."), "intent lock should preserve non-targets");
  assert(acceptanceLock.lockStatus === "locked", "acceptance lock should lock when checks exist");
  assert(acceptanceLock.passConditions.length === 2, "acceptance lock should surface pass conditions separately");
  assert(acceptanceLock.failureConditions.some((entry) => /Failure if unmet/i.test(entry)), "acceptance lock should make failure conditions explicit");
}

function testCorrectionEventAndPolicyPatchClosure() {
  const contract = loadCorrectionLearningContract();
  const correctionEvent = createCorrectionEvent({
    observed_miss: "Footer copy overflowed the panel.",
    expected_outcome: "Footer copy stays within the panel under the longest string.",
    artifact_or_surface: "web footer strip",
    user_dissatisfaction_reason: "Visible overflow is an obvious quality miss.",
    candidate_failed_phase: "acceptance_lock",
    learning_scope_candidate: "harness",
  }, { contract });
  const verdict = evaluatePolicyPatchCompletion({
    contract,
    correctionEvent,
    policyPatch: {
      correctionEventId: correctionEvent.eventId,
      patchArtifacts: [
        { kind: "machine_readable_contract", target: "scripts/config/design_acceptance_contract.json", changeSummary: "Added overflow hard-fail semantics." },
        { kind: "regression_test", target: "scripts/planning_mode_policy_test.js", changeSummary: "Added acceptance lock regression assertions." },
      ],
      replayVerification: {
        status: "verified",
        evidenceRefs: ["scripts/planning_mode_policy_test.js", "scripts/correction_learning_policy_test.js"],
        scenariosCovered: ["original overflow case", "adjacent longest-string case"],
      },
      completionStatus: "complete",
    },
  });
  assert(verdict.canClose === true, "complete policy patch with replay coverage should close");
  assert(verdict.reason === "", "complete policy patch should not emit a blocking reason");
}

function testPolicyPatchFailsClosedWithoutReplay() {
  const verdict = evaluatePolicyPatchCompletion({
    correctionEvent: {
      observed_miss: "Panels overlap under pause state.",
      expected_outcome: "Pause state remains collision-free.",
      artifact_or_surface: "pause overlay",
      user_dissatisfaction_reason: "Overlap reads as unfinished UI.",
      candidate_failed_phase: "review_gate",
      learning_scope_candidate: "project",
    },
    policyPatch: {
      patchArtifacts: [
        { kind: "planning_rule", target: "scripts/lib/planning_mode_policy.js", changeSummary: "Auto-add longest-copy review." },
      ],
      replayVerification: {
        status: "pending",
        evidenceRefs: [],
        scenariosCovered: ["original overlap case"],
      },
    },
  });
  assert(verdict.canClose === false, "missing verified replay should fail closed");
  assert(verdict.reason === "replay_verification_missing", "missing replay should map to a machine-readable reason");
}

function testLearningTriageSeparatesPatchTargetLifecycleAndSkillPromotion() {
  const triage = triageCorrectionLearning({
    correctionEvent: {
      observed_miss: "A reusable correction workflow was missing.",
      expected_outcome: "The repo should route this through the right learning path.",
      artifact_or_surface: "correction learning runtime",
      user_dissatisfaction_reason: "The learning destination was ambiguous.",
      candidate_failed_phase: "review_gate",
      learning_scope_candidate: "project",
    },
    changeClass: "skill_surface_policy",
    targetPath: "scripts/config/skill_catalog.json",
    reusableWorkflow: true,
    repeatedSuccessCount: 3,
    guardFailures: 0,
  });
  assert(triage.patchTargetDecision.scope === "project", "triage should preserve the smallest viable patch target scope");
  assert(triage.patchTargetDecision.decisionPrinciple === "smallest_scope_that_prevents_recurrence", "triage should expose its routing principle");
  assert(triage.improvementLifecycleDecision.decision === "shadow_candidate", "target override should route skill catalog updates through shadow candidate lifecycle");
  assert(triage.skillPromotionAudit.directPromotionAllowed === false, "skill promotion should remain post-replay only");
  assert(triage.skillPromotionAudit.eligibleAfterReplay === false, "repeated success below the promotion threshold must not become skill-eligible");
}

function run() {
  const tests = [
    ["load contract", testLoadContract],
    ["lock builders", testLockBuildersSeparateIntentAndAcceptance],
    ["correction event with complete patch", testCorrectionEventAndPolicyPatchClosure],
    ["policy patch fails closed without replay", testPolicyPatchFailsClosedWithoutReplay],
    ["learning triage separates patch lifecycle and promotion", testLearningTriageSeparatesPatchTargetLifecycleAndSkillPromotion],
  ];
  let passed = 0;
  for (const [name, fn] of tests) {
    fn();
    passed += 1;
    console.log(`[correction-learning-policy-test] PASS ${name}`);
  }
  console.log(`[correction-learning-policy-test] total=${tests.length} pass=${passed} fail=0`);
  console.log("PASS");
}

try {
  run();
} catch (error) {
  console.log(`[correction-learning-policy-test] FAIL ${error instanceof Error ? error.message : String(error)}`);
  console.log("FAIL");
  process.exitCode = 1;
}
