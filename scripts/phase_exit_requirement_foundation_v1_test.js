#!/usr/bin/env node
"use strict";

const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

const {
  runRequirementFoundationV1ExitAudit,
} = require("./phase_exit_requirement_foundation_v1");

function run() {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "requirement-foundation-v1-exit-"));
  const report = runRequirementFoundationV1ExitAudit({ outputDir: tempRoot, writeOutputs: true });
  const jsonPath = path.join(tempRoot, "phase_exit_requirement_foundation_v1.json");
  const markdownPath = path.join(tempRoot, "phase_exit_requirement_foundation_v1.md");
  assert.strictEqual(report.status, "PASS", "exit audit should pass against the current requirement foundation baseline");
  assert.strictEqual(report.summary.passedCount, 8, "exit audit should require all 8 checks to pass");
  assert.strictEqual(report.phaseStatus.requirementFoundationV1, "done", "phase status should flip to done only on PASS");
  assert(fs.existsSync(jsonPath), "exit audit should write the JSON report");
  assert(fs.existsSync(markdownPath), "exit audit should write the markdown report");
  const written = JSON.parse(fs.readFileSync(jsonPath, "utf8"));
  assert.strictEqual(written.status, "PASS", "written JSON report should preserve PASS");
  assert.strictEqual(written.summary.totalCount, 8, "written JSON report should preserve the 8-check contract");
}

try {
  run();
  console.log("PASS phase_exit_requirement_foundation_v1_test");
} catch (error) {
  console.error(`FAIL phase_exit_requirement_foundation_v1_test: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}
