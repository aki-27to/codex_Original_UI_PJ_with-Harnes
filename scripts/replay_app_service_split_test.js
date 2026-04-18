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
const appRoutesPath = path.join(workspaceRoot, "server", "routes", "app_routes.js");
const replayRoutesPath = path.join(workspaceRoot, "server", "routes", "replay_routes.js");
const harnessAppServicePath = path.join(workspaceRoot, "server", "services", "harness_app_service.js");
const replayServicePath = path.join(workspaceRoot, "server", "services", "replay_service.js");
const routeServicesPath = path.join(workspaceRoot, "server", "route_services.js");

function assertIncludes(source, needle, message) {
  assert(source.includes(needle), message);
}

function assertExcludes(source, needle, message) {
  assert(!source.includes(needle), message);
}

function main() {
  const { createAppRoutes } = require(appRoutesPath);
  const { createReplayRoutes } = require(replayRoutesPath);
  const { createHarnessAppService } = require(harnessAppServicePath);
  const { createReplayService } = require(replayServicePath);
  const { createRouteServices } = require(routeServicesPath);

  assert.strictEqual(typeof createAppRoutes, "function", "app route factory must export createAppRoutes");
  assert.strictEqual(typeof createReplayRoutes, "function", "replay route factory must export createReplayRoutes");
  assert.strictEqual(
    typeof createHarnessAppService,
    "function",
    "harness app service factory must export createHarnessAppService"
  );
  assert.strictEqual(typeof createReplayService, "function", "replay service factory must export createReplayService");
  assert.strictEqual(typeof createRouteServices, "function", "route services module must export createRouteServices");

  assertIncludes(
    requestHandlerSource,
    'const { createAppRoutes } = require("./routes/app_routes");',
    "request handler must import app routes"
  );
  assertIncludes(
    requestHandlerSource,
    'const { createReplayRoutes } = require("./routes/replay_routes");',
    "request handler must import replay routes"
  );
  assertIncludes(
    requestHandlerSource,
    "...createAppRoutes(ctx),",
    "request handler must register app routes"
  );
  assertIncludes(
    requestHandlerSource,
    "...createReplayRoutes(ctx),",
    "request handler must register replay routes"
  );
  assertExcludes(
    requestHandlerSource,
    'if (req.method === "POST" && pathname.startsWith("/api/apps/")) {',
    "request handler should no longer hardcode app bridge route dispatch"
  );

  assertIncludes(
    serverSource,
    'const {createRouteServices}=require("./server/route_services");',
    "server_impl must import the route services composition module"
  );
  assertIncludes(
    routeServicesSource,
    'const { createHarnessAppService } = require("./services/harness_app_service");',
    "route services module must import harness app service"
  );
  assertIncludes(
    routeServicesSource,
    'const { createReplayService } = require("./services/replay_service");',
    "route services module must import replay service"
  );
  assertIncludes(
    serverSource,
    "const routeServices=createRouteServices({",
    "server_impl must assemble route services through the composition module"
  );
  assertIncludes(
    routeServicesSource,
    "harnessApp: harnessAppService,",
    "route services module must expose the harness app service explicitly"
  );
  assertIncludes(
    routeServicesSource,
    "replay: replayService,",
    "route services module must expose the replay service explicitly"
  );
  assertIncludes(
    serverSource,
    "services:routeServices,",
    "request handler context wiring must flow through the grouped route services"
  );
  assertIncludes(
    fs.readFileSync(appRoutesPath, "utf8"),
    "ctx.services.harnessApp.handleHarnessAppReplyRequest(req, res, decodeURIComponent(match[1]));",
    "app routes must delegate directly to the harness app service"
  );
  assertIncludes(
    fs.readFileSync(replayRoutesPath, "utf8"),
    "return ctx.services.replay.handleReplayTurnsRequest(args);",
    "replay routes must delegate directly to the replay service"
  );
  assertExcludes(
    serverSource,
    'const {createHarnessAppService}=require("./server/services/harness_app_service");',
    "server_impl should no longer import harness app service directly"
  );
  assertExcludes(
    serverSource,
    'const {createReplayService}=require("./server/services/replay_service");',
    "server_impl should no longer import replay service directly"
  );
  assertExcludes(
    serverSource,
    'if(req.method==="POST"&&pathname.startsWith("/api/apps/")){',
    "legacy request handler should no longer hardcode app bridge route dispatch"
  );
  assertExcludes(
    serverSource,
    'if(req.method==="GET"&&pathname==="/api/replay/turns"){',
    "legacy request handler should no longer hardcode replay listing"
  );
  assertExcludes(
    serverSource,
    'if(req.method==="GET"&&pathname.startsWith("/api/replay/turn/")){',
    "legacy request handler should no longer hardcode replay detail"
  );
  assertExcludes(
    serverSource,
    'if(req.method==="POST"&&pathname==="/api/replay/turn"){',
    "legacy request handler should no longer hardcode replay execution"
  );

  console.log("PASS replay_app_service_split_test");
}

main();
