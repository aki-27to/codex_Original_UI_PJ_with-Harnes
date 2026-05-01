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
    /This is waiting on user input, not a failed turn\. Reply with the missing information, approval, or decision to continue\./.test(serverSource),
    "server should soften needs_input leads into actionable input-wait wording"
  );
  assert(
    /not a failed turn; collect the missing information, approval, or decision and continue from the current turn/.test(serverSource),
    "server logs/recovery hints should classify NEEDS_INPUT as input-wait rather than failure"
  );
  assert(
    /waiting on user input; reply with the missing information, approval, or decision to continue/.test(serverSource),
    "server activity details should tell the user that replying continues the turn"
  );
  assert(
    !/User input is still required\./.test(serverSource),
    "server should not regress to the harsher needs_input lead"
  );
  assert(
    !/Not completed yet\./.test(serverSource),
    "server should not regress to the blunt incomplete lead"
  );
  assert(
    /const clientFinalText=stripPlanningStatusDirective\(authoritativeFinalText\);/.test(serverSource)
      || /const clientFinalText=rewriteClientFinalTextForOutcome\(authoritativeFinalText,\{taskOutcomeStatus:taskOutcome\.status(?:,prompt)?\}\);/.test(serverSource),
    "server should strip STATUS directives before emitting final text to the client"
  );
  assert(
    !/未完了タスク:/.test(appSource),
    "operator UI should avoid blunt unfinished-task labels"
  );
  assert(
    /失敗ではありません。必要な情報や判断を返信すると、この作業を続きから再開できます。/.test(appSource),
    "operator UI should explain that NEEDS_INPUT is a reply-to-continue input-wait state"
  );
  assert(
    /返信で続行/.test(appSource),
    "operator UI should expose a concise reply-to-continue label for NEEDS_INPUT"
  );
}

try {
  run();
  console.log("PASS needs_input_surface_test");
} catch (error) {
  console.error(`FAIL needs_input_surface_test: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}
