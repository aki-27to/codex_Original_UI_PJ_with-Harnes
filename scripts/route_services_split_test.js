#!/usr/bin/env node
"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { resolveServerImplementationPath } = require("./lib/server_source_path");

const workspaceRoot = path.resolve(__dirname, "..");
const { implementationPath: serverImplementationPath } = resolveServerImplementationPath(workspaceRoot);
const serverSource = fs.readFileSync(serverImplementationPath, "utf8");
const routeServicesPath = path.join(workspaceRoot, "server", "route_services.js");
const routeServicesSource = fs.readFileSync(routeServicesPath, "utf8");

function assertIncludes(source, needle, message) {
  assert(source.includes(needle), message);
}

function assertExcludes(source, needle, message) {
  assert(!source.includes(needle), message);
}

function main() {
  const { createRouteServices } = require(routeServicesPath);

  assert.strictEqual(
    typeof createRouteServices,
    "function",
    "route services module must export createRouteServices"
  );

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
  assertIncludes(
    routeServicesSource,
    'const { createConversationService } = require("./services/conversation_service");',
    "route services module must import conversation service"
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
    routeServicesSource,
    'const { createEvalService } = require("./services/eval_service");',
    "route services module must import eval service"
  );
  assertIncludes(
    routeServicesSource,
    'const { createExecService } = require("./services/exec_service");',
    "route services module must import exec service"
  );
  assertIncludes(
    routeServicesSource,
    "return Object.freeze({",
    "route services module must return the grouped route-service surface"
  );
  assertIncludes(
    routeServicesSource,
    "overview: overviewService,",
    "route services module must expose the overview service"
  );
  assertIncludes(
    routeServicesSource,
    "control: controlService,",
    "route services module must expose the control service"
  );

  assertIncludes(
    serverSource,
    'const {createRouteServices}=require("./server/route_services");',
    "server_impl must import the route services composition module"
  );
  assertIncludes(
    serverSource,
    "const routeServices=createRouteServices({",
    "server_impl must assemble route services through the extracted composition module"
  );
  assertExcludes(
    serverSource,
    'const {createConversationService}=require("./server/services/conversation_service");',
    "server_impl should no longer import conversation service directly"
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
    'const {createEvalService}=require("./server/services/eval_service");',
    "server_impl should no longer import eval service directly"
  );
  assertExcludes(
    serverSource,
    'const {createExecService}=require("./server/services/exec_service");',
    "server_impl should no longer import exec service directly"
  );
  assertExcludes(
    serverSource,
    "const routeServices=Object.freeze({",
    "server_impl should no longer inline the route service grouping"
  );

  console.log("PASS route_services_split_test");
}

main();
