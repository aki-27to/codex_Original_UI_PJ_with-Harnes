#!/usr/bin/env node
"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { runBenchmark, defaultManifestPath } = require("./run_waza_external_benchmark");

const workspaceRoot = path.resolve(__dirname, "..");

function main() {
  const manifest = JSON.parse(fs.readFileSync(defaultManifestPath, "utf8"));
  assert.strictEqual(manifest.schema, "waza-external-benchmark-manifest.v1");
  assert.strictEqual(manifest.actualUseLogPolicy.includes("Do not write"), true);
  assert.ok(fs.existsSync(path.join(workspaceRoot, manifest.wazaEval)), "Waza eval scaffold must exist");
  assert.ok(Array.isArray(manifest.tasks) && manifest.tasks.length >= 3, "benchmark must include multiple tasks");

  const result = runBenchmark({ writeArtifacts: false });
  assert.strictEqual(result.schema, "waza-external-benchmark-result.v1");
  assert.strictEqual(result.boundary.harnessRuntimeIntegrated, false);
  assert.strictEqual(result.boundary.writesActualSkillOutcomes, false);
  assert.strictEqual(result.summary.failed, 0, "benchmark smoke should pass all tasks");

  const current = result.outcomes.find((task) => task.id === "current-skill-design-review");
  assert.ok(current, "current skill task must exist");
  assert.strictEqual(current.analysis.articleAlignment.status, "ARTICLE_ALIGNED");
  assert.strictEqual(current.analysis.articleAlignment.score, 100);
  assert.strictEqual(
    current.analysis.articleAlignment.gateStatuses.naming_side_effect_contract,
    "acceptable_alt",
    "repo-local naming alternative must stay explicit"
  );

  const bad = result.outcomes.find((task) => task.id === "bad-skill-fixture");
  assert.ok(bad, "bad fixture task must exist");
  assert.notStrictEqual(bad.analysis.articleAlignment.status, "ARTICLE_ALIGNED");
  assert.ok(bad.analysis.issues.includes("article_alignment_incomplete"));

  console.log("PASS waza_external_benchmark_test");
}

main();

