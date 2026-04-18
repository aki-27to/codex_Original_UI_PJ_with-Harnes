#!/usr/bin/env node
"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { resolveServerImplementationPath } = require("./lib/server_source_path");

const workspaceRoot = path.resolve(__dirname, "..");
const { implementationPath: serverImplementationPath } = resolveServerImplementationPath(workspaceRoot);
const serverSource = fs.readFileSync(serverImplementationPath, "utf8");
const evalServicePath = path.join(workspaceRoot, "server", "services", "eval_service.js");
const execServicePath = path.join(workspaceRoot, "server", "services", "exec_service.js");
const routeServicesPath = path.join(workspaceRoot, "server", "route_services.js");
const routeServicesSource = fs.readFileSync(routeServicesPath, "utf8");

function assertIncludes(source, needle, message) {
  assert(source.includes(needle), message);
}

function main() {
  const { createEvalService } = require(evalServicePath);
  const { createExecService } = require(execServicePath);
  const { createRouteServices } = require(routeServicesPath);

  assert.strictEqual(typeof createEvalService, "function", "eval service factory must export createEvalService");
  assert.strictEqual(typeof createExecService, "function", "exec service factory must export createExecService");
  assert.strictEqual(typeof createRouteServices, "function", "route services module must export createRouteServices");

  assertIncludes(serverSource, 'const {createRouteServices}=require("./server/route_services");', "server_impl must import route services");
  assertIncludes(serverSource, "const routeServices=createRouteServices({", "server_impl must assemble route services through the extracted composition module");
  assertIncludes(routeServicesSource, 'const { createEvalService } = require("./services/eval_service");', "route services module must import eval service");
  assertIncludes(routeServicesSource, 'const { createExecService } = require("./services/exec_service");', "route services module must import exec service");
  assertIncludes(routeServicesSource, "eval: evalService,", "route services module must expose eval service");
  assertIncludes(routeServicesSource, "exec: execService,", "route services module must expose exec service");
  assert(!serverSource.includes('if(req.method==="POST"&&pathname==="/api/eval/run"){'), "server_impl should no longer keep duplicate /api/eval/run authority");
  assert(!serverSource.includes('if(req.method==="GET"&&pathname.startsWith("/api/exec/idempotency/")){'), "server_impl should no longer keep duplicate exec idempotency authority");
  assert(!serverSource.includes('if(req.method==="POST"&&pathname==="/api/exec"){'), "server_impl should no longer keep duplicate /api/exec authority");

  console.log("PASS exec_eval_service_split_test");
}

main();
