#!/usr/bin/env node
"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");

const workspaceRoot = path.resolve(__dirname, "..");

function read(relativePath) {
  return fs.readFileSync(path.join(workspaceRoot, relativePath), "utf8");
}

function readJson(relativePath) {
  return JSON.parse(read(relativePath));
}

function main() {
  const contract = readJson("scripts/config/local_memory_search_contract.json");
  const packageJson = readJson("package.json");
  const memoryGraph = read("scripts/lib/governed_memory_graph.js");
  assert.strictEqual(contract.schema, "local-memory-search-contract.v1", "memory search contract schema mismatch");
  assert.strictEqual(contract.principles.humanReadableOriginalsSeparateFromIndexes, true, "human sources and indexes must be separated");
  assert.strictEqual(contract.principles.giantMarkdownMemoryForbidden, true, "giant markdown memory must stay forbidden");
  for (const command of contract.packageCommands) {
    const scriptName = command.replace(/^npm run\s+/, "");
    assert(Object.prototype.hasOwnProperty.call(packageJson.scripts, scriptName), `missing package command ${command}`);
  }
  assert(memoryGraph.includes("governed-memory-public-overview.v1"), "governed memory public overview must remain implemented");
  assert(memoryGraph.includes("governed-memory-public-export-manifest.v1"), "governed memory public manifest must remain implemented");
  assert(memoryGraph.includes("pack_causal_trace_public"), "memory public export must include causal trace pointers");
  assert(contract.machineReadableIndexes.some((entry) => entry.includes("memory_public_export_manifest.json")), "contract must point to the machine-readable export manifest");
  console.log("PASS local_memory_search_layer_test");
}

main();
