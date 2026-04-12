#!/usr/bin/env node
"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { resolveServerImplementationPath } = require("./lib/server_source_path");

function read(relativePath) {
  return fs.readFileSync(path.join(__dirname, "..", relativePath), "utf8");
}

function run() {
  const appSource = read(path.join("web", "01.HarnesUI", "app.js"));
  assert(
    /else if\(st==="needs_input"\)\{ttype="needs_input";/.test(appSource),
    "runPrompt status handler should preserve streamed needs_input terminal state"
  );
  assert(
    /else if\(ttype==="needs_input"\)hset\(c,"needs_input"\);/.test(appSource),
    "runPrompt finalizer should not overwrite needs_input back to completed"
  );

  const { implementationPath: serverPath } = resolveServerImplementationPath(path.join(__dirname, ".."));
  const serverSource = fs.readFileSync(serverPath, "utf8");
  assert(
    /taskOutcome\.status==="NEEDS_INPUT"\?"needs_input":finalStatus/.test(serverSource),
    "server should surface NEEDS_INPUT turns to the client as needs_input status"
  );
  assert(
    /const clientFinalText=stripPlanningStatusDirective\(authoritativeFinalText\);/.test(serverSource)
      || /const clientFinalText=rewriteClientFinalTextForOutcome\(authoritativeFinalText,\{taskOutcomeStatus:taskOutcome\.status\}\);/.test(serverSource),
    "server should strip STATUS directives before emitting final text to the client"
  );
}

try {
  run();
  console.log("PASS needs_input_surface_test");
} catch (error) {
  console.error(`FAIL needs_input_surface_test: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}
