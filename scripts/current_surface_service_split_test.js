#!/usr/bin/env node
"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { resolveServerImplementationPath } = require("./lib/server_source_path");

const workspaceRoot = path.resolve(__dirname, "..");
const { implementationPath: serverImplementationPath } = resolveServerImplementationPath(workspaceRoot);
const serverSource = fs.readFileSync(serverImplementationPath, "utf8");
const currentSurfaceServicePath = path.join(workspaceRoot, "server", "services", "current_surface_service.js");
const currentSurfaceServiceSource = fs.readFileSync(currentSurfaceServicePath, "utf8");

function assertIncludes(source, needle, message) {
  assert(source.includes(needle), message);
}

function assertExcludes(source, needle, message) {
  assert(!source.includes(needle), message);
}

function main() {
  const { createCurrentSurfaceService } = require(currentSurfaceServicePath);

  assert.strictEqual(
    typeof createCurrentSurfaceService,
    "function",
    "current surface service module must export createCurrentSurfaceService"
  );

  assertIncludes(
    serverSource,
    'const {createCurrentSurfaceService}=require("./server/services/current_surface_service");',
    "server_impl must import the current surface service composition module"
  );
  assertIncludes(
    serverSource,
    "const currentSurfaceService=createCurrentSurfaceService({",
    "server_impl must instantiate the current surface service once"
  );
  assertExcludes(
    serverSource,
    "const runtime=sanitizeRuntimeSnapshotForOverview(buildRuntimeApiSnapshot());",
    "server_impl should no longer inline current runtime snapshot assembly"
  );

  assertExcludes(
    serverSource,
    'const requestUserInputBlocked=getWorkflowCaseById(coreHarnessWorkflowRun,"needs_input_blocked_policy");',
    "server_impl should no longer inline the design-conformance workflow probe logic"
  );
  assertExcludes(
    serverSource,
    'const relatedSignoffSummary=signoffBundlePath&&latestTurn.artifact_manifest_path',
    "server_impl should no longer inline the latest-run signoff linking logic"
  );
  assertExcludes(
    serverSource,
    'const latestRunEvidenceRef=repoRelativePath(workspaceRoot,loggingSurfacePaths.currentLatestRunSummaryPath);',
    "server_impl should no longer inline current-surface evidence ref assembly"
  );
  assertExcludes(
    serverSource,
    "function canonicalizeOperatorFacingValue(",
    "server_impl should no longer inline current-surface canonicalization helpers"
  );
  assertExcludes(
    serverSource,
    "function buildLatestBundleReference(",
    "server_impl should no longer inline latest bundle reference helpers"
  );
  assertIncludes(
    currentSurfaceServiceSource,
    'const { createCurrentSurfaceSupport } = require("./current_surface_support");',
    "current surface service must import the current-surface support helper"
  );
  assertIncludes(
    currentSurfaceServiceSource,
    "const currentSurfaceSupport = createCurrentSurfaceSupport({",
    "current surface service must instantiate the current-surface support helper"
  );

  assertIncludes(
    currentSurfaceServiceSource,
    "function buildCurrentRuntimeSnapshotFile()",
    "current surface service should own runtime snapshot assembly"
  );
  assertIncludes(
    currentSurfaceServiceSource,
    "function buildCurrentReviewLoadBreakdownFile(",
    "current surface service should own current review-load summary assembly"
  );
  assertIncludes(
    currentSurfaceServiceSource,
    "function buildCurrentIndexFile(",
    "current surface service should own current index assembly"
  );
  assertIncludes(
    currentSurfaceServiceSource,
    "function buildLatestRunSummaryFile()",
    "current surface service should own latest-run summary assembly"
  );
  assertIncludes(
    currentSurfaceServiceSource,
    "function buildCurrentDesignConformanceSummary(",
    "current surface service should own design-conformance summary assembly"
  );
  assertIncludes(
    currentSurfaceServiceSource,
    "function normalizeCurrentLatestRunSummary(",
    "current surface service should own current latest-run normalization"
  );

  console.log("PASS current_surface_service_split_test");
}

main();
