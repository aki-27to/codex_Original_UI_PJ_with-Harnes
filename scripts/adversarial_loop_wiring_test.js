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
    /const\s+retryVerdict\s*=\s*shouldRetryAdversarialLoop\(/.test(source),
    "retry verdict call to shouldRetryAdversarialLoop was not found"
  );
  assert(
    /if\s*\(\s*retryVerdict\s*&&\s*retryVerdict\.retry\s*\)\s*\{[\s\S]*?executeTurnStreaming\(/.test(source),
    "retry branch executing executeTurnStreaming was not found"
  );
  assert(
    /adversarialAttempt:\s*nextAttempt/.test(source),
    "retry branch does not forward adversarialAttempt=nextAttempt"
  );
  assert(
    /buildAdversarialRetryPrompt\(\{[\s\S]*executionTask:\s*planningContextRequiresDispatch\(planningContext\)[\s\S]*dispatchPlan:\s*planningContext&&planningContext\.dispatchPlan\?planningContext\.dispatchPlan:null[\s\S]*\}\)/.test(source),
    "adversarial retry prompt should carry explicit execution-task and dispatch-plan context"
  );
  assert(
    /executeTurnStreaming\(res,retryPrompt\|\|adversarialRootPrompt\|\|prompt,agentName,\{[\s\S]*planningContext[\s\S]*adversarialAttempt:\s*nextAttempt/.test(source),
    "adversarial retry branch should preserve planningContext across retries"
  );
  assert(
    /executeTurnStreaming\(res,retryPrompt\|\|parentDispatchRootPrompt\|\|prompt,agentName,\{[\s\S]*planningContext[\s\S]*parentDispatchAttempt:\s*nextAttempt/.test(source),
    "parent dispatch retry branch should preserve planningContext across retries"
  );
  assert(
    /evaluateParentDispatchGuard\(\{[\s\S]*plannedDispatchCount:Array\.isArray\(planningContext&&planningContext\.dispatchPlan&&planningContext\.dispatchPlan\.dispatches\)[\s\S]*proposalOnly:Boolean\(planningContext&&planningContext\.dispatchPlan&&planningContext\.dispatchPlan\.proposalOnly\)/.test(source),
    "parent dispatch guard should receive planned dispatch metadata from planningContext"
  );
  assert(
    /const\s+loopActive\s*=\s*adversarialShadowEnabled&&adversarialLoopEnabled/.test(source),
    "loopActive gate definition was not found"
  );
  assert(
    /const\s+shadowInput=\{[\s\S]*taskOutcomeStatus:taskOutcome\.status[\s\S]*\}/.test(source),
    "shadow review input should receive the derived task outcome status"
  );
  assert(
    /const\s+clientFinalText=rewriteClientFinalTextForOutcome\(authoritativeFinalText,\{taskOutcomeStatus:taskOutcome\.status\}\);/.test(source),
    "client final text should be normalized against non-completed task outcomes"
  );
  console.log("[adversarial-loop-wiring-test] PASS loop wiring patterns");
  console.log("PASS");
}

try {
  run();
} catch (error) {
  console.log(`[adversarial-loop-wiring-test] FAIL ${error instanceof Error ? error.message : String(error)}`);
  console.log("FAIL");
  process.exitCode = 1;
}
