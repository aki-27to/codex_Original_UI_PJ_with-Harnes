"use strict";

const assert = require("assert");
const { buildWorkerCompletionStatus } = require("./lib/worker_completion_status");

function buildAlignedFixture() {
  return {
    workerDecisionSurface: {
      topLevelOutcome: "ADOPTABLE_COMPLETE",
      taskOutcomeStatus: "COMPLETED",
      releaseState: "RELEASE_APPROVED",
      adoptionReady: true,
      constitutionalCompliance: true,
      boundaryCompliance: true,
      intentTrace: {
        goalComparison: {
          originalRequestAligned: true,
          latentIntentAligned: true,
        },
      },
      minimalHitl: {
        humanInterruptionRequired: 0,
        explicitUserJudgmentRequired: 0,
      },
    },
    exportSessionId: "export_primary",
    goalCompletionStatus: {
      exportSessionId: "export_stale",
      goalStatus: "NOT_YET",
    },
    subjectiveGoalCompletionStatus: {
      exportSessionId: "export_stale",
      subjectiveGoalStatus: "NOT_YET",
    },
    compatibilityCompletionStatus: {
      exportSessionId: "export_stale",
      status: "NOT_YET",
    },
    backgroundArtifactSessionConsistency: "aligned",
    backgroundArtifactSessionIds: ["export_primary"],
    backgroundArtifactInputsTrusted: true,
  };
}

const aligned = buildWorkerCompletionStatus(buildAlignedFixture());
assert.strictEqual(aligned.backgroundArtifactSessionConsistency, "aligned");
assert.deepStrictEqual(
  aligned.backgroundArtifactSessionIds,
  ["export_primary"],
  "explicit aligned session ids must stay canonical"
);
assert.strictEqual(aligned.workerStopDecision.presentationRole, "primary_task_verdict");
assert.strictEqual(aligned.backgroundProgramReadiness.presentationRole, "secondary_non_blocking_context");
assert.strictEqual(aligned.backgroundProgramReadiness.doesNotOverrideWorkerVerdict, true);
assert.strictEqual(aligned.backgroundProgramReadiness.displayLabel, "Background program readiness");

const mismatched = buildWorkerCompletionStatus({
  ...buildAlignedFixture(),
  backgroundArtifactSessionConsistency: "",
  backgroundArtifactSessionIds: [],
  backgroundArtifactInputsTrusted: false,
});
assert.strictEqual(
  mismatched.backgroundArtifactSessionConsistency,
  "missing_or_mismatched",
  "missing explicit alignment must fail closed when raw sidecars mismatch"
);
assert(
  Array.isArray(mismatched.backgroundArtifactSessionIds)
  && mismatched.backgroundArtifactSessionIds.includes("export_stale"),
  "mismatched raw sidecar session ids should remain visible for diagnosis"
);
assert.strictEqual(mismatched.backgroundProgramReadiness.backgroundTrusted, false);
assert.strictEqual(mismatched.backgroundProgramReadiness.whyNotYetCount, 1);

process.stdout.write("PASS worker_completion_status_test\n");
