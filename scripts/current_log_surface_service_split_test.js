#!/usr/bin/env node
"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { resolveServerImplementationPath } = require("./lib/server_source_path");

const workspaceRoot = path.resolve(__dirname, "..");
const { implementationPath: serverImplementationPath } = resolveServerImplementationPath(workspaceRoot);
const serverSource = fs.readFileSync(serverImplementationPath, "utf8");
const currentLogSurfaceServicePath = path.join(workspaceRoot, "server", "services", "current_log_surface_service.js");
const currentLogSurfaceServiceSource = fs.readFileSync(currentLogSurfaceServicePath, "utf8");

function assertIncludes(source, needle, message) {
  assert(source.includes(needle), message);
}

function assertExcludes(source, needle, message) {
  assert(!source.includes(needle), message);
}

function main() {
  const { createCurrentLogSurfaceService } = require(currentLogSurfaceServicePath);

  assert.strictEqual(
    typeof createCurrentLogSurfaceService,
    "function",
    "current log surface service module must export createCurrentLogSurfaceService"
  );
  assertIncludes(
    serverSource,
    'const {createCurrentLogSurfaceService}=require("./server/services/current_log_surface_service");',
    "server_impl must import the current log surface service module"
  );
  assertIncludes(
    serverSource,
    "const currentLogSurfaceService=createCurrentLogSurfaceService({",
    "server_impl must instantiate the current log surface service once"
  );
  assertIncludes(
    serverSource,
    "const updateCurrentLogSurface=(options={})=>currentLogSurfaceService.updateCurrentLogSurface(options);",
    "server_impl must delegate current log surface refreshes to the extracted service"
  );
  assertIncludes(
    serverSource,
    "return currentLogSurfaceService.buildRefreshCurrentLogSurfaceResult();",
    "server_impl refreshCurrentLogSurface must return the extracted current-log surface summary"
  );
  assertExcludes(
    serverSource,
    'logOperation("current_logs.updated",{',
    "server_impl should no longer inline current-log update logging"
  );
  assertExcludes(
    serverSource,
    "writeLoggingSurfaceJson(loggingSurfacePaths.currentOperatorSummaryPath,operatorSummary);",
    "server_impl should no longer inline current-log artifact writes"
  );

  assertIncludes(
    currentLogSurfaceServiceSource,
    "function updateCurrentLogSurface(",
    "current log surface service must own current-log refresh assembly"
  );
  assertIncludes(
    currentLogSurfaceServiceSource,
    "function buildRefreshCurrentLogSurfaceResult()",
    "current log surface service must own the refresh result payload"
  );

  console.log("PASS current_log_surface_service_split_test");
}

main();
