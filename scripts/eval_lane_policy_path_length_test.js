#!/usr/bin/env node
"use strict";

const assert = require("assert");
const path = require("path");
const {
  assertEvalLaneAccess,
  normalizeEvalLanePolicy,
} = require("./lib/eval_lane_policy");

const workspaceRoot = path.resolve(__dirname, "..");

function main() {
  const longSegment = "a".repeat(150);
  const suitePath = path.join(workspaceRoot, "scripts", longSegment, "public_regression_overlay.json");
  const historyPath = path.join(workspaceRoot, "logs", "archive", "raw", longSegment, "public_regression_runs.jsonl");
  const policy = normalizeEvalLanePolicy({
    schema: "eval-lane-policy.v1",
    publicLaneId: "public_regression",
    protectedPaths: [path.join(workspaceRoot, "protected", longSegment, "holdout")],
    lanes: [
      {
        id: "public_regression",
        visibility: "public",
        suitePaths: [suitePath],
        historyPath,
        allowedActors: ["ci"],
      },
    ],
  }, { workspaceRoot });
  const lane = assertEvalLaneAccess({
    policy,
    laneId: "public_regression",
    actor: "ci",
    env: {},
  });

  assert.strictEqual(lane.suitePaths[0], path.normalize(suitePath), "suitePaths must preserve execution paths");
  assert.strictEqual(lane.historyPath, path.normalize(historyPath), "historyPath must preserve execution paths");
  assert.ok(lane.suitePaths[0].length > 160, "test fixture must exceed the old display truncation limit");
  assert.ok(lane.historyPath.length > 160, "history fixture must exceed the old display truncation limit");

  console.log("PASS eval_lane_policy_path_length_test");
}

main();
