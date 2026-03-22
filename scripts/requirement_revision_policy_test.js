#!/usr/bin/env node
"use strict";

const assert = require("assert");

const {
  REVISION_PROPOSAL_MARKER,
  buildClauseCompletionScorecard,
  buildRequirementRevisionProposal,
  buildRuntimeRevisionGateDecision,
  collectRequirementRevisionProposalsFromTexts,
} = require("./lib/requirement_revision_policy");
const {
  buildReleaseDecision,
  buildReviewBundle,
} = require("./lib/constitution_conformance");

function run() {
  const parsed = collectRequirementRevisionProposalsFromTexts([
    {
      fallbackAgent: "backend_worker",
      text: [
        "Need intake review before changing the locked contract.",
        REVISION_PROPOSAL_MARKER,
        JSON.stringify({
          changedFields: ["baselineScope", "acceptanceChecks"],
          reason: "A runtime contract change is required to enforce revision gating.",
          evidence: ["dispatch:backend", "flow_trace_summary.json"],
          requiresReapproval: true,
          originatingAgent: "backend_worker",
        }),
      ].join("\n"),
    },
  ]);
  assert.strictEqual(parsed.length, 1, "marked revision proposal text should parse once");
  assert.deepStrictEqual(
    parsed[0].changedFields,
    ["baselineScope", "acceptanceChecks"],
    "parsed revision proposal should preserve changedFields"
  );

  const pendingProposal = buildRequirementRevisionProposal({
    changedFields: ["baselineScope"],
    reason: "Need to expand runtime scope.",
    evidence: ["dispatch:backend"],
    requiresReapproval: true,
    originatingAgent: "default",
  });
  const silentRewrite = buildRuntimeRevisionGateDecision({
    activeRevisionProposal: pendingProposal,
    revisionGate: {
      status: "proposal_required",
      authoritativeOwner: "intake",
      currentAgent: "default",
      changedFields: pendingProposal.changedFields,
    },
    observedRevisionProposals: [],
    agentName: "default",
    ownerAgent: "intake",
  });
  assert.strictEqual(silentRewrite.status, "BLOCK", "silent rewrite attempts should BLOCK");
  assert.strictEqual(
    silentRewrite.taskOutcomeReason,
    "silent_requirement_rewrite",
    "silent rewrite attempts should map to silent_requirement_rewrite"
  );

  const downstreamProposal = buildRuntimeRevisionGateDecision({
    activeRevisionProposal: pendingProposal,
    revisionGate: {
      status: "proposal_required",
      authoritativeOwner: "intake",
      currentAgent: "default",
      changedFields: pendingProposal.changedFields,
    },
    observedRevisionProposals: parsed,
    agentName: "default",
    ownerAgent: "intake",
  });
  assert.strictEqual(
    downstreamProposal.status,
    "RETURN_TO_INTAKE",
    "observed downstream revision proposals should return control to intake"
  );
  assert.strictEqual(
    downstreamProposal.taskOutcomeReason,
    "return_to_intake_required",
    "observed downstream proposals should require return_to_intake_required"
  );

  const intakeClear = buildRuntimeRevisionGateDecision({
    activeRevisionProposal: downstreamProposal.proposal,
    revisionGate: {
      status: "pending_intake_confirmation",
      authoritativeOwner: "intake",
      currentAgent: "intake",
      changedFields: downstreamProposal.proposal.changedFields,
    },
    observedRevisionProposals: [],
    agentName: "intake",
    ownerAgent: "intake",
  });
  assert.strictEqual(intakeClear.status, "CLEAR", "intake should be able to clear the revision gate");

  const clauseCompletionScorecard = buildClauseCompletionScorecard({
    clauses: [
      {
        clauseId: "req-1",
        text: "Keep the runtime revision gate enforced.",
        core: true,
        state: "mapped",
        requirementRefs: ["baselineScope"],
        dispatchIds: [],
        planStepIds: ["plan-1"],
        acceptanceCheckRefs: ["ac-1"],
      },
      {
        clauseId: "req-2",
        text: "Optional polish item.",
        core: true,
        state: "dropped",
        requirementRefs: ["overDeliveryScope"],
        dispatchIds: ["dispatch-2"],
        planStepIds: ["plan-2"],
        acceptanceCheckRefs: [],
        droppedReasonCode: "deferred_nonblocking",
      },
    ],
    acceptanceResults: [
      { id: "ac-1", status: "PASS", evidence: ["test:tester"] },
    ],
    postLockDrift: {
      driftedClauseIds: [],
      unmappedCoreClauseIds: [],
    },
    finalStatus: "completed",
    taskOutcomeStatus: "COMPLETED",
    docSyncEvidence: {
      status: "PASS",
      updatedPaths: ["docs/CURRENT_ARCHITECTURE.md"],
    },
    childEvidenceLedger: [
      { agent: "reviewer", reviewerObserved: true },
      { agent: "tester", testerObserved: true },
    ],
  });
  assert.strictEqual(
    clauseCompletionScorecard.status,
    "FAIL",
    "missing dispatch coverage for a core clause should fail the scorecard"
  );
  assert.strictEqual(
    clauseCompletionScorecard.summary.unsatisfiedCount,
    1,
    "exactly one core clause should remain unsatisfied in the probe scorecard"
  );
  assert.strictEqual(
    clauseCompletionScorecard.summary.waivedCount,
    1,
    "dropped core clauses should be counted as waived"
  );

  const reviewBundle = buildReviewBundle({
    acceptanceResults: [{ id: "ac-1", title: "Runtime gate enforced", status: "PASS", evidence: ["test:tester"] }],
    childEvidenceLedger: [{ agent: "reviewer", reviewerObserved: true, evidenceNotes: ["No findings."] }],
    requiredEvidenceFailures: [],
    residualRisks: [],
    assumptions: [],
    finalOutcome: { taskOutcomeStatus: "COMPLETED", taskOutcomeReason: "" },
    clauseCompletionScorecard,
  });
  assert.strictEqual(
    reviewBundle.clause_completion_scorecard.summary.unsatisfiedCount,
    1,
    "review bundle should embed the clause-by-clause completion scorecard"
  );
  const releaseDecision = buildReleaseDecision({
    finalOutcome: { taskOutcomeStatus: "COMPLETED", taskOutcomeReason: "" },
    reviewBundle,
    signoffRefs: ["review_bundle.json"],
    replayBundleRefs: ["thread-1"],
    residualRisks: [],
    assumptions: [],
    missingEvidence: [],
    clauseCompletionScorecard,
    rationaleNotes: ["task_outcome_status=COMPLETED"],
  });
  assert.strictEqual(
    releaseDecision.terminal_state,
    "HARNESS_FAILURE",
    "release decisions must fail when any core clause remains unsatisfied"
  );
  assert.ok(
    releaseDecision.blocker_list.some((entry) => entry.includes("req-1")),
    "release blocker list should identify the unsatisfied core clause"
  );
}

try {
  run();
  console.log("PASS requirement_revision_policy_test");
} catch (error) {
  console.error(`FAIL requirement_revision_policy_test: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}
