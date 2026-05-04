#!/usr/bin/env node
"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { resolveServerImplementationPath } = require("./lib/server_source_path");

const workspaceRoot = path.resolve(__dirname, "..");
const { implementationPath: serverImplementationPath } = resolveServerImplementationPath(workspaceRoot);
const serverSource = fs.readFileSync(serverImplementationPath, "utf8");
const runtimeSnapshotServicePath = path.join(workspaceRoot, "server", "services", "runtime_api_snapshot_service.js");
const repoTruthSnapshotServicePath = path.join(workspaceRoot, "server", "services", "repo_truth_runtime_snapshot_service.js");
const runtimeSnapshotServiceSource = fs.readFileSync(runtimeSnapshotServicePath, "utf8");
const repoTruthSnapshotServiceSource = fs.readFileSync(repoTruthSnapshotServicePath, "utf8");

function assertIncludes(source, needle, message) {
  assert(source.includes(needle), message);
}

function assertExcludes(source, needle, message) {
  assert(!source.includes(needle), message);
}

function main() {
  const { createRuntimeApiSnapshotService } = require(runtimeSnapshotServicePath);

  assert.strictEqual(
    typeof createRuntimeApiSnapshotService,
    "function",
    "runtime snapshot service module must export createRuntimeApiSnapshotService"
  );

  assertIncludes(
    serverSource,
    'const {createRuntimeApiSnapshotService}=require("./server/services/runtime_api_snapshot_service");',
    "server_impl must import the runtime snapshot service composition module"
  );
  assertIncludes(
    serverSource,
    'const {createRepoTruthRuntimeSnapshotService}=require("./server/services/repo_truth_runtime_snapshot_service");',
    "server_impl must import the repo truth snapshot service composition module"
  );
  assertIncludes(
    serverSource,
    "const repoTruthRuntimeSnapshotService=createRepoTruthRuntimeSnapshotService({",
    "server_impl must instantiate the repo truth snapshot service once"
  );
  assertIncludes(
    serverSource,
    "const runtimeApiSnapshotService=createRuntimeApiSnapshotService({",
    "server_impl must instantiate the runtime snapshot service once"
  );
  assertIncludes(
    serverSource,
    "return runtimeApiSnapshotService.buildRuntimeApiSnapshot();",
    "server_impl buildRuntimeApiSnapshot should delegate to the extracted service"
  );
  assertIncludes(
    serverSource,
    "return runtimeApiSnapshotService.sanitizeRuntimeSnapshotForOverview(runtimeSnapshot);",
    "server_impl overview sanitization should delegate to the extracted service"
  );
  assertExcludes(
    serverSource,
    'const currentWorkerDecisionSurface=(()=>{try{const candidatePath=path.join(workspaceRoot,"output","governance_public","worker_decision_surface.json");',
    "server_impl should no longer inline current-truth surface loading"
  );
  assertExcludes(
    serverSource,
    'const currentGoalCompletion=(()=>{try{const candidatePath=path.join(workspaceRoot,"output","agi_readiness","goal_completion_status.json");',
    "server_impl should no longer inline program-readiness loading"
  );
  assertExcludes(
    serverSource,
    "function buildRepoTruthRuntimeSnapshot(options={})",
    "server_impl should no longer own repo truth snapshot assembly"
  );
  assertExcludes(
    serverSource,
    "function classifyRepoTruthDirtyEntry(entry)",
    "server_impl should no longer own repo truth dirty-entry classification"
  );

  const { createRepoTruthRuntimeSnapshotService } = require(repoTruthSnapshotServicePath);
  assert.strictEqual(
    typeof createRepoTruthRuntimeSnapshotService,
    "function",
    "repo truth snapshot service module must export createRepoTruthRuntimeSnapshotService"
  );

  assertIncludes(
    runtimeSnapshotServiceSource,
    "function buildCurrentTruthSnapshot(",
    "runtime snapshot service should own current-truth snapshot assembly"
  );
  assertIncludes(
    runtimeSnapshotServiceSource,
    'readCurrentTruthJson("output", "governance_public", "worker_decision_surface.json")',
    "runtime snapshot service should read the reviewer headline surface directly"
  );
  assertIncludes(
    runtimeSnapshotServiceSource,
    "function buildWorkerDecisionSupport(currentTruth)",
    "runtime snapshot service should own worker decision support assembly"
  );
  assertIncludes(
    runtimeSnapshotServiceSource,
    "function buildDesignCompletionEvidenceSnapshot()",
    "runtime snapshot service should expose design completion evidence current truth"
  );
  assertIncludes(
    runtimeSnapshotServiceSource,
    "activePostureProfile",
    "runtime snapshot service should expose activePostureProfile for posture truth"
  );
  assertIncludes(
    runtimeSnapshotServiceSource,
    "buildRepoTruthRuntimeSnapshot",
    "runtime snapshot service should accept repo truth from the runtime boundary"
  );
  assertIncludes(
    runtimeSnapshotServiceSource,
    "buildStatusScopeMap",
    "runtime snapshot service should expose scoped COMPLETED/RELEASE_APPROVED/NOT_YET semantics"
  );
  assertIncludes(
    runtimeSnapshotServiceSource,
    "buildOperationalPostureCurrentTruth",
    "runtime snapshot service should expose reviewer-facing operational posture current truth"
  );
  assertIncludes(
    repoTruthSnapshotServiceSource,
    "function buildRepoTruthRuntimeSnapshot(",
    "repo truth snapshot service should own repo truth snapshot assembly"
  );
  assertIncludes(
    repoTruthSnapshotServiceSource,
    "function classifyRepoTruthDirtyEntry(",
    "repo truth snapshot service should own dirty-entry classification"
  );

  console.log("PASS runtime_snapshot_service_split_test");
}

main();
