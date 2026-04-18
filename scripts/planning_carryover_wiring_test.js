#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const { resolveServerImplementationPath } = require("./lib/server_source_path");

const workspaceRoot = path.resolve(__dirname, "..");
const { implementationPath: serverPath } = resolveServerImplementationPath(workspaceRoot);
const execServicePath = path.join(workspaceRoot, "server", "services", "exec_service.js");

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function run() {
  const source = fs.readFileSync(serverPath, "utf8");
  const execServiceSource = fs.readFileSync(execServicePath, "utf8");
  assert(
    /function\s+derivePreviousPlanningContextForRequest\(agentState,cwd\)/.test(source),
    "server should define a request-level planning carryover helper"
  );
  assert(
    /const\s+requestedAgentState\s*=\s*getOrCreateAgentState\(agentName\);\s*const\s+previousPlanningContext\s*=\s*forceNewSession\s*\?\s*null\s*:\s*derivePreviousPlanningContextForRequest\(requestedAgentState,\s*cwd\);/.test(execServiceSource),
    "api exec path should sever previous planning context when forceNewSession requests a fresh thread"
  );
  assert(
    /options:\s*\{[\s\S]*previousPlanningContext[\s\S]*\}/.test(execServiceSource),
    "api exec path should forward previousPlanningContext into the requirement guard"
  );
  assert(
    /return\{[\s\S]*previousPlanningContext,[\s\S]*planningContext,/.test(source),
    "normalizeExecOptionsForRun should preserve previousPlanningContext"
  );
  console.log("[planning-carryover-wiring-test] PASS planning carryover wiring");
  console.log("PASS");
}

try {
  run();
} catch (error) {
  console.log(`[planning-carryover-wiring-test] FAIL ${error instanceof Error ? error.message : String(error)}`);
  console.log("FAIL");
  process.exitCode = 1;
}
