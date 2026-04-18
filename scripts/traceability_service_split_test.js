#!/usr/bin/env node
"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { resolveServerImplementationPath } = require("./lib/server_source_path");

const workspaceRoot = path.resolve(__dirname, "..");
const { implementationPath: serverImplementationPath } = resolveServerImplementationPath(workspaceRoot);
const serverSource = fs.readFileSync(serverImplementationPath, "utf8");
const traceabilityServicePath = path.join(workspaceRoot, "server", "services", "traceability_service.js");
const traceabilityServiceSource = fs.readFileSync(traceabilityServicePath, "utf8");

function assertIncludes(source, needle, message) {
  assert(source.includes(needle), message);
}

function assertExcludes(source, needle, message) {
  assert(!source.includes(needle), message);
}

function main() {
  const { createTraceabilityService } = require(traceabilityServicePath);

  assert.strictEqual(
    typeof createTraceabilityService,
    "function",
    "traceability service module must export createTraceabilityService"
  );
  assertIncludes(
    serverSource,
    'const {createTraceabilityService}=require("./server/services/traceability_service");',
    "server_impl must import the traceability service module"
  );
  assertIncludes(
    serverSource,
    "const traceabilityService=createTraceabilityService({",
    "server_impl must instantiate the traceability service once"
  );
  assertIncludes(
    serverSource,
    "const buildPlanningTraceabilityData=(options={})=>traceabilityService.buildPlanningTraceabilityData(options);",
    "server_impl must delegate planning traceability assembly to the extracted service"
  );
  assertIncludes(
    serverSource,
    'traceabilityService.buildHarnessTraceabilitySnapshot(planningContext,agentName);',
    "server_impl must delegate harness traceability snapshots to the extracted service"
  );
  assertIncludes(
    serverSource,
    "const buildPostLockDriftSnapshot=(options={})=>traceabilityService.buildPostLockDriftSnapshot(options);",
    "server_impl must delegate post-lock drift assembly to the extracted service"
  );
  assertExcludes(
    serverSource,
    "function uniqueOverviewStrings(",
    "server_impl should no longer inline traceability string dedupe helpers"
  );
  assertExcludes(
    serverSource,
    "function clampOverviewInt(",
    "server_impl should no longer inline traceability integer clamps"
  );
  assertExcludes(
    serverSource,
    "function buildPostLockDriftSnapshot(",
    "server_impl should no longer inline the post-lock drift snapshot builder"
  );

  assertIncludes(
    traceabilityServiceSource,
    "function buildPlanningTraceabilityData(",
    "traceability service must own planning traceability assembly"
  );
  assertIncludes(
    traceabilityServiceSource,
    "function buildHarnessTraceabilitySnapshot(",
    "traceability service must own harness traceability snapshots"
  );
  assertIncludes(
    traceabilityServiceSource,
    "function buildPostLockDriftSnapshot(",
    "traceability service must own post-lock drift snapshots"
  );

  console.log("PASS traceability_service_split_test");
}

main();
