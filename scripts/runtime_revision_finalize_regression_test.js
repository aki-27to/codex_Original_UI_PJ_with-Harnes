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
    /async function executeTurnStreaming\(res,prompt,agentName,options\)\{[\s\S]*?let planningContext=sanitizePlanningArtifactsForRuntime\(/.test(source),
    "executeTurnStreaming should keep planningContext mutable for finalize-time revision handling"
  );
  assert(
    /if\(runtimeRevisionGate\.status==="BLOCK"\|\|runtimeRevisionGate\.status==="RETURN_TO_INTAKE"\)\{[\s\S]*?planningContext=sanitizePlanningArtifactsForRuntime\(\{[\s\S]*?state\.lastPlanningContext=planningContext;[\s\S]*?turnRecord\.planningContext=planningContext;/.test(source),
    "runtime revision gate should persist the updated planningContext without crashing finalizeTurn"
  );
  console.log("[runtime-revision-finalize-regression-test] PASS mutable planningContext preserved");
  console.log("PASS");
}

try {
  run();
} catch (error) {
  console.log(
    `[runtime-revision-finalize-regression-test] FAIL ${error instanceof Error ? error.message : String(error)}`
  );
  console.log("FAIL");
  process.exitCode = 1;
}
