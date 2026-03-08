#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");

const workspaceRoot = path.resolve(__dirname, "..");
const serverPath = path.join(workspaceRoot, "server.js");

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
    /const\s+loopActive\s*=\s*adversarialShadowEnabled&&adversarialLoopEnabled/.test(source),
    "loopActive gate definition was not found"
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
