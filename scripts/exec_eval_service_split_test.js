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

function assertIncludes(source, needle, message) {
  assert(source.includes(needle), message);
}

function main() {
  const { createEvalService } = require(evalServicePath);
  const { createExecService } = require(execServicePath);

  assert.strictEqual(typeof createEvalService, "function", "eval service factory must export createEvalService");
  assert.strictEqual(typeof createExecService, "function", "exec service factory must export createExecService");

  assertIncludes(serverSource, 'const {createEvalService}=require("./server/services/eval_service");', "server_impl must import eval service");
  assertIncludes(serverSource, 'const {createExecService}=require("./server/services/exec_service");', "server_impl must import exec service");
  assertIncludes(serverSource, "const evalService=createEvalService({", "server_impl must assemble eval service");
  assertIncludes(serverSource, "const execService=createExecService({", "server_impl must assemble exec service");
  assertIncludes(serverSource, 'if(req.method==="POST"&&pathname==="/api/eval/run"){', "legacy handler must still expose /api/eval/run");
  assertIncludes(serverSource, "await handleEvalRunRequest({req,res,url,pathname});", "legacy eval route must delegate to service-backed handler");
  assertIncludes(serverSource, 'if(req.method==="GET"&&pathname.startsWith("/api/exec/idempotency/")){', "legacy handler must still expose exec idempotency route");
  assertIncludes(serverSource, "await handleExecIdempotencyRequest({req,res,url,pathname});", "legacy exec idempotency route must delegate to service-backed handler");
  assertIncludes(serverSource, 'if(req.method==="POST"&&pathname==="/api/exec"){', "legacy handler must still expose /api/exec");
  assertIncludes(serverSource, "await handleExecRequest({req,res,url,pathname});", "legacy exec route must delegate to service-backed handler");

  console.log("PASS exec_eval_service_split_test");
}

main();
