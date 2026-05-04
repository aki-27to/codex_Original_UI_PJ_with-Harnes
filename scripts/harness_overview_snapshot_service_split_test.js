#!/usr/bin/env node
"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { resolveServerImplementationPath } = require("./lib/server_source_path");

const workspaceRoot = path.resolve(__dirname, "..");
const { implementationPath: serverImplementationPath } = resolveServerImplementationPath(workspaceRoot);
const serverSource = fs.readFileSync(serverImplementationPath, "utf8");
const overviewSnapshotServicePath = path.join(workspaceRoot, "server", "services", "harness_overview_snapshot_service.js");
const overviewSnapshotServiceSource = fs.readFileSync(overviewSnapshotServicePath, "utf8");

function assertIncludes(source, needle, message) {
  assert(source.includes(needle), message);
}

function assertExcludes(source, needle, message) {
  assert(!source.includes(needle), message);
}

function main() {
  const { createHarnessOverviewSnapshotService } = require(overviewSnapshotServicePath);

  assert.strictEqual(
    typeof createHarnessOverviewSnapshotService,
    "function",
    "harness overview snapshot service module must export createHarnessOverviewSnapshotService"
  );

  assertIncludes(
    serverSource,
    'const {createHarnessOverviewSnapshotService}=require("./server/services/harness_overview_snapshot_service");',
    "server_impl must import the harness overview snapshot composition module"
  );
  assertIncludes(
    serverSource,
    "let harnessOverviewSnapshotService;",
    "server_impl must reserve the overview snapshot service before runtime snapshot wiring"
  );
  assertIncludes(
    serverSource,
    "harnessOverviewSnapshotService=createHarnessOverviewSnapshotService({",
    "server_impl must instantiate the harness overview snapshot service once"
  );
  assertIncludes(
    serverSource,
    "return harnessOverviewSnapshotService.syncGovernedMemoryGraphFromLiveRuntime(reason);",
    "server_impl overview governed-memory sync must delegate to the extracted service"
  );
  assertIncludes(
    serverSource,
    "return harnessOverviewSnapshotService.buildHarnessOverviewSnapshot(options);",
    "server_impl overview payload assembly must delegate to the extracted service"
  );
  assertExcludes(
    serverSource,
    "function buildBundleOverview(",
    "server_impl should no longer inline bundle overview assembly"
  );
  assertExcludes(
    serverSource,
    "function buildEvalHistoryOverview(",
    "server_impl should no longer inline eval history overview assembly"
  );
  assertExcludes(
    serverSource,
    "function buildExecutionMemoryOverview(",
    "server_impl should no longer inline execution memory overview assembly"
  );
  assertExcludes(
    serverSource,
    "function buildTopographyOverview(",
    "server_impl should no longer inline topography overview assembly"
  );

  assertIncludes(
    overviewSnapshotServiceSource,
    "function buildHarnessOverviewSnapshot(options = {})",
    "overview snapshot service should own harness overview payload assembly"
  );
  assertIncludes(
    overviewSnapshotServiceSource,
    "function buildExecutionMemoryOverview({ limit = 10, window = 60 } = {})",
    "overview snapshot service should own execution memory overview assembly"
  );
  assertIncludes(
    overviewSnapshotServiceSource,
    "function buildTopographyOverview(topographyAgents, assignmentsByRole)",
    "overview snapshot service should own topography overview assembly"
  );

  console.log("PASS harness_overview_snapshot_service_split_test");
}

main();
