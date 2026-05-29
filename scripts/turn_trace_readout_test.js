#!/usr/bin/env node
"use strict";

const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const {
  buildTurnTraceReadoutModel,
  loadTurnTraceReadoutContract,
  writeTurnTraceReadout,
} = require("./lib/turn_trace_readout_builder");

const workspaceRoot = path.resolve(__dirname, "..");
const sourceDir = path.join(workspaceRoot, "output", "governance_public");

function main() {
  const contract = loadTurnTraceReadoutContract();
  assert.strictEqual(contract.schema, "turn-trace-readout-contract.v1", "contract schema mismatch");
  const model = buildTurnTraceReadoutModel({ sourceDir, generatedAt: "2026-05-29T00:00:00.000Z" });
  for (const field of contract.requiredModelFields) {
    assert(Object.prototype.hasOwnProperty.call(model, field), `missing model field ${field}`);
  }
  assert(model.stageCount > 0, "model must expose at least one timeline stage");
  assert(model.evidenceSourceCount > 0, "model must expose evidence sources");
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "turn-trace-readout-"));
  const outPath = path.join(tempDir, "turn_trace_readout.html");
  const result = writeTurnTraceReadout({
    sourceDir,
    outPath,
    generatedAt: "2026-05-29T00:00:00.000Z",
  });
  const html = fs.readFileSync(result.outPath, "utf8");
  for (const id of contract.requiredSections) {
    assert(html.includes(`id="${id}"`), `missing required HTML section ${id}`);
  }
  assert(!html.includes(workspaceRoot), "turn trace readout must not expose the workspace absolute path");
  assert(html.includes("Turn Trace Readout"), "turn trace readout title missing");
  console.log("PASS turn_trace_readout_test");
}

main();
