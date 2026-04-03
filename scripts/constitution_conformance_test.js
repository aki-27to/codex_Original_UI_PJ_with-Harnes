#!/usr/bin/env node
"use strict";

const assert = require("assert");
const path = require("path");

const workspaceRoot = path.resolve(__dirname, "..");
const {
  buildConformanceReport,
} = require(path.join(workspaceRoot, "scripts", "lib", "constitution_conformance.js"));

function invariantStatus(report, id) {
  const entry = Array.isArray(report && report.invariants)
    ? report.invariants.find((item) => item && item.id === id)
    : null;
  return entry ? entry.status : "missing";
}

function main() {
  const autonomyFirstCurrentSurface = buildConformanceReport({
    latestRunSummary: {
      turnId: "turn-current",
      threadId: "thread-current",
      selectedAssuranceDepth: "SIGNOFF_ASSURANCE",
      requestUserInputPolicy: "blocked",
      finalOutcome: { taskOutcomeStatus: "COMPLETED" },
    },
    signoffSummary: {
      allPassed: true,
      runtime: {
        nonInteractiveUserInput: { policy: "blocked" },
      },
    },
    runtimeRequestUserInputPolicy: "auto-default",
  });
  assert.strictEqual(
    invariantStatus(autonomyFirstCurrentSurface, "execution.autonomy_first_user_input_posture"),
    "pass",
    "live autonomy-first runtime posture must dominate a blocked signoff bundle when evaluating the current surface"
  );

  const strictLaneSignoff = buildConformanceReport({
    latestRunSummary: {
      turnId: "turn-signoff",
      threadId: "thread-signoff",
      selectedAssuranceDepth: "SIGNOFF_ASSURANCE",
      requestUserInputPolicy: "blocked",
      finalOutcome: { taskOutcomeStatus: "COMPLETED" },
    },
    signoffSummary: {
      allPassed: true,
      runtime: {
        nonInteractiveUserInput: { policy: "blocked" },
      },
    },
  });
  assert.strictEqual(
    invariantStatus(strictLaneSignoff, "execution.autonomy_first_user_input_posture"),
    "pass",
    "explicit signoff assurance lanes may remain blocked without violating the autonomy-first default invariant"
  );
}

main();
