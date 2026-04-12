#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const { resolveServerImplementationPath } = require("./lib/server_source_path");

const workspaceRoot = path.resolve(__dirname, "..");
const { implementationPath: serverPath } = resolveServerImplementationPath(workspaceRoot);

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function run() {
  const source = fs.readFileSync(serverPath, "utf8");
  assert(
    /function\s+derivePreviousPlanningContextForRequest\(agentState,cwd\)/.test(source),
    "server should define a request-level planning carryover helper"
  );
  assert(
    /const\s+requestedAgentState=getOrCreateAgentState\(agentName\);\s*const\s+previousPlanningContext=derivePreviousPlanningContextForRequest\(requestedAgentState,cwd\);/.test(source),
    "api exec path should derive previous planning context from agent state"
  );
  assert(
    /options:\{[^}]*previousPlanningContext[^}]*\}/.test(source),
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
