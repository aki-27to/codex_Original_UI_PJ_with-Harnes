#!/usr/bin/env node
"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const {
  loadAuthorityRegistry,
  validateAuthorityRegistrySurfaces,
  buildAuthorityRuntimeSummary,
} = require("./lib/authority_registry");

const workspaceRoot = path.resolve(__dirname, "..");

function read(relativePath) {
  return fs.readFileSync(path.join(workspaceRoot, relativePath), "utf8");
}

const expectedAgentsBoundaryLine =
  "\u3053\u306e\u30d5\u30a1\u30a4\u30eb\u306f\u6700\u4e0a\u4f4d\u61b2\u6cd5\u3067\u306f\u306a\u304f\u3001runtime behavior constraints \u3092\u5b9a\u3081\u308b operational constitution \u3067\u3059\u3002";

const deprecatedSupremeClaim =
  "\u3053\u306e\u30d5\u30a1\u30a4\u30eb\u306f\u6700\u4e0a\u4f4d\u306e\u61b2\u6cd5";

function main() {
  const registry = loadAuthorityRegistry();
  assert.strictEqual(registry.schema, "authority-registry.v1", "authority registry schema mismatch");
  assert.strictEqual(registry.sourceDoc, "docs/HARNESS_CONSTITUTION.md", "authority registry source doc mismatch");
  assert.strictEqual(registry.driftRules.singleSupremePath, "docs/HARNESS_CONSTITUTION.md", "single supreme path mismatch");
  assert.strictEqual(registry.driftRules.operationalConstitutionPath, "AGENTS.md", "operational constitution path mismatch");
  assert.strictEqual(registry.driftRules.primaryExecRoute, "POST /api/exec", "primary exec route mismatch");
  assert.strictEqual(registry.driftRules.primaryEvalRoute, "POST /api/eval/run", "primary eval route mismatch");

  const precedenceIds = registry.precedence.map((entry) => entry.id);
  assert.deepStrictEqual(
    precedenceIds.slice(0, 5),
    [
      "supreme_frozen_constitution",
      "operational_constitution",
      "active_design_spec",
      "machine_contract_truth",
      "proof_contract_truth",
    ],
    "authority registry precedence must prioritize constitution, operations, architecture, and machine contracts"
  );

  const validation = validateAuthorityRegistrySurfaces(registry);
  assert.strictEqual(validation.ok, true, `authority registry surfaces must validate: ${validation.issues.join(", ")}`);

  const runtimeSummary = buildAuthorityRuntimeSummary({ registry });
  assert.strictEqual(runtimeSummary.schema, "authority-registry.v1", "runtime summary schema mismatch");
  assert.strictEqual(runtimeSummary.driftStatus, "aligned", "runtime summary must report aligned drift status");
  assert.strictEqual(runtimeSummary.registryPath, "scripts/config/authority_registry.json", "runtime summary registry path mismatch");

  const readme = read("README.md");
  const harnessMap = read("HARNESS_MAP.md");
  const docsIndex = read("docs/README.md");
  const architecture = read("docs/CURRENT_ARCHITECTURE.md");
  const agents = read("AGENTS.md");
  const constitution = read("docs/HARNESS_CONSTITUTION.md");

  assert(readme.includes("authority-registry.v1"), "README.md must mention authority-registry.v1");
  assert(harnessMap.includes("authority-registry.v1"), "HARNESS_MAP.md must mention authority-registry.v1");
  assert(docsIndex.includes("authority-registry.v1"), "docs/README.md must mention authority-registry.v1");
  assert(architecture.includes("authority-registry.v1"), "CURRENT_ARCHITECTURE.md must mention authority-registry.v1");
  assert(agents.includes("operational constitution"), "AGENTS.md must stay the operational constitution");
  assert(
    agents.includes(expectedAgentsBoundaryLine),
    "AGENTS.md must keep the Japanese operational constitution boundary line"
  );
  assert(!agents.includes(deprecatedSupremeClaim), "AGENTS.md must not claim supreme authority");
  assert(constitution.includes("single supreme frozen constitution"), "HARNESS_CONSTITUTION.md must declare the single supreme frozen constitution role");

  process.stdout.write("PASS authority_registry_test\n");
}

main();
