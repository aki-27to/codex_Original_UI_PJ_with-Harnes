#!/usr/bin/env node
"use strict";

const assert = require("assert");
const path = require("path");
const {
  dispatchChildTask,
  executeChildTask,
} = require("./lib/bounded_multi_agent_orchestrator");
const {
  initializeTask,
} = require("./lib/long_horizon_continuity");

const workspaceRoot = path.resolve(__dirname, "..");

function main() {
  const parentTaskId = `simulator-mode-${Date.now()}`;
  initializeTask({
    workspaceRoot,
    taskId: parentTaskId,
    sessionId: "simulator-mode",
    title: "Bounded multi-agent simulator mode",
    objective: "prove bounded multi-agent output is labeled as artifact simulator evidence",
    familyId: "deterministic_code",
    acceptanceCriteria: ["simulator mode labeled"],
    role: "coordinator",
    orchestrationMode: "bounded_multi_agent",
  });
  const child = dispatchChildTask({
    workspaceRoot,
    parentTaskId,
    sessionId: "simulator-mode",
    role: "executor",
    delegatedObjective: "record simulator-labeled executor output",
    acceptanceSubset: ["simulator mode labeled"],
    expectedDeliverable: "simulator-labeled output",
  });
  const execution = executeChildTask({
    workspaceRoot,
    childTaskId: child.childTaskId,
    sessionId: "simulator-mode",
    payload: {
      deliverableSummary: "executor artifact output labeled by provenance",
      changedSurface: ["scripts/lib/bounded_multi_agent_orchestrator.js"],
    },
  });

  assert.strictEqual(execution.rawOutput.executionMode, "artifact_simulator");
  assert.strictEqual(execution.rawOutput.independentAgentExecution, 0);
  assert.strictEqual(execution.normalizedResult.executionMode, "artifact_simulator");
  assert.strictEqual(execution.normalizedResult.independentAgentExecution, 0);

  console.log("PASS bounded_multi_agent_simulator_mode_test");
}

main();
