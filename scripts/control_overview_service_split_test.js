#!/usr/bin/env node
"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { resolveServerImplementationPath } = require("./lib/server_source_path");

const workspaceRoot = path.resolve(__dirname, "..");
const { implementationPath: serverImplementationPath } = resolveServerImplementationPath(workspaceRoot);
const serverSource = fs.readFileSync(serverImplementationPath, "utf8");
const requestHandlerSource = fs.readFileSync(path.join(workspaceRoot, "server", "request_handler.js"), "utf8");
const routeServicesSource = fs.readFileSync(path.join(workspaceRoot, "server", "route_services.js"), "utf8");
const overviewRoutesPath = path.join(workspaceRoot, "server", "routes", "overview_routes.js");
const controlRoutesPath = path.join(workspaceRoot, "server", "routes", "control_routes.js");
const overviewServicePath = path.join(workspaceRoot, "server", "services", "overview_service.js");
const controlServicePath = path.join(workspaceRoot, "server", "services", "control_service.js");

function assertIncludes(source, needle, message) {
  assert(source.includes(needle), message);
}

function assertExcludes(source, needle, message) {
  assert(!source.includes(needle), message);
}

function main() {
  const { createOverviewRoutes } = require(overviewRoutesPath);
  const { createControlRoutes } = require(controlRoutesPath);
  const { createOverviewService } = require(overviewServicePath);
  const { createControlService } = require(controlServicePath);

  assert.strictEqual(typeof createOverviewRoutes, "function", "overview route factory must export createOverviewRoutes");
  assert.strictEqual(typeof createControlRoutes, "function", "control route factory must export createControlRoutes");
  assert.strictEqual(typeof createOverviewService, "function", "overview service factory must export createOverviewService");
  assert.strictEqual(typeof createControlService, "function", "control service factory must export createControlService");

  assertIncludes(
    requestHandlerSource,
    'const { createOverviewRoutes } = require("./routes/overview_routes");',
    "request handler must import overview routes"
  );
  assertIncludes(
    requestHandlerSource,
    'const { createControlRoutes } = require("./routes/control_routes");',
    "request handler must import control routes"
  );
  assertIncludes(requestHandlerSource, "...createOverviewRoutes(ctx),", "request handler must register overview routes");
  assertIncludes(requestHandlerSource, "...createControlRoutes(ctx),", "request handler must register control routes");

  assertIncludes(
    routeServicesSource,
    'const { createOverviewService } = require("./services/overview_service");',
    "route services module must import overview service"
  );
  assertIncludes(
    routeServicesSource,
    'const { createControlService } = require("./services/control_service");',
    "route services module must import control service"
  );
  assertIncludes(routeServicesSource, "overview: overviewService,", "route services must expose overview service");
  assertIncludes(routeServicesSource, "control: controlService,", "route services must expose control service");

  assertIncludes(
    fs.readFileSync(overviewRoutesPath, "utf8"),
    "ctx.services.overview.handleHarnessOverviewRequest(args);",
    "overview routes must delegate to the overview service surface"
  );
  assertIncludes(
    fs.readFileSync(controlRoutesPath, "utf8"),
    "ctx.services.control.handleOpenCmdRequest(args);",
    "control routes must delegate to the control service surface"
  );

  assertExcludes(
    serverSource,
    'if(req.method==="GET"&&pathname==="/api/harness/overview"){',
    "server_impl should no longer keep duplicate overview route authority"
  );
  assertExcludes(
    serverSource,
    'if(req.method==="POST"&&pathname==="/api/intent/profile"){',
    "server_impl should no longer keep duplicate intent-profile mutation authority"
  );
  assertExcludes(
    serverSource,
    'if(req.method==="POST"&&pathname==="/api/open-cmd"){',
    "server_impl should no longer keep duplicate open-cmd authority"
  );

  console.log("PASS control_overview_service_split_test");
}

main();
