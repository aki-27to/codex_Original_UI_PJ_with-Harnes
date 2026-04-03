#!/usr/bin/env node
"use strict";

const assert = require("assert");
const {
  buildHarnessAgiImprovementFlywheelRuntimeSummary,
} = require("./lib/agi_improvement_flywheel_runtime");

function runCheck(name, fn) {
  try {
    fn();
    console.log(`PASS ${name}`);
    return true;
  } catch (error) {
    console.error(`FAIL ${name} :: ${error instanceof Error ? error.message : String(error)}`);
    return false;
  }
}

function testFlywheelSummaryLoadsConfig() {
  const summary = buildHarnessAgiImprovementFlywheelRuntimeSummary();
  assert.strictEqual(summary.status, "ready", "flywheel summary must load");
  assert.strictEqual(summary.schema, "harness-agi-improvement-flywheel.v1", "flywheel schema mismatch");
  assert.strictEqual(summary.boundedLoopsOnly, true, "flywheel must reject unbounded loops");
  assert(summary.loopCount >= 5, "flywheel must expose loop stack");
  assert(summary.kpiCount >= 5, "flywheel must expose KPIs");
  assert(summary.failureModeCount >= 4, "flywheel must expose failure modes");
}

function testSelfImprovementLoopRequiresStops() {
  const summary = buildHarnessAgiImprovementFlywheelRuntimeSummary();
  const selfImprovement = summary.loops.find((entry) => entry.id === "self-improvement");
  assert(selfImprovement, "self-improvement loop missing");
  assert(selfImprovement.stopConditionCount >= 2, "self-improvement loop must expose stop conditions");
  assert(selfImprovement.rollbackTriggerCount >= 2, "self-improvement loop must expose rollback triggers");
}

function main() {
  const checks = [
    ["flywheel summary loads config", testFlywheelSummaryLoadsConfig],
    ["self improvement loop requires stops", testSelfImprovementLoopRequiresStops],
  ];
  let failed = 0;
  for (const [name, fn] of checks) {
    if (!runCheck(name, fn)) {
      failed += 1;
    }
  }
  if (failed) {
    process.exitCode = 1;
    return;
  }
  console.log("PASS agi improvement flywheel runtime tests");
}

main();
