"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const {
  exportGovernedMemoryPublicArtifacts,
  syncGovernedMemoryGraph,
} = require("./lib/governed_memory_graph");
const {
  createGovernedMemoryPublicFixtureRuntime,
  createGovernedMemoryPublicFixtureSecondPassRuntime,
  createGovernedMemoryPublicFixtureTraceability,
  seedGovernedMemoryPublicCompatibilityArtifacts,
} = require("./lib/governed_memory_public_fixture");

const repoRoot = path.resolve(__dirname, "..");

function copyJson(relativePath, targetRoot) {
  const sourcePath = path.join(repoRoot, relativePath);
  const targetPath = path.join(targetRoot, relativePath);
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  fs.copyFileSync(sourcePath, targetPath);
}

function copyTree(sourceRoot, targetRoot) {
  if (!fs.existsSync(sourceRoot)) return;
  fs.rmSync(targetRoot, { recursive: true, force: true });
  fs.mkdirSync(targetRoot, { recursive: true });
  for (const entry of fs.readdirSync(sourceRoot, { withFileTypes: true })) {
    const sourcePath = path.join(sourceRoot, entry.name);
    const targetPath = path.join(targetRoot, entry.name);
    if (entry.isDirectory()) {
      copyTree(sourcePath, targetPath);
    } else if (entry.isFile()) {
      fs.mkdirSync(path.dirname(targetPath), { recursive: true });
      fs.copyFileSync(sourcePath, targetPath);
    }
  }
}

function annotateSampleManifest(targetRoot, extra) {
  const manifestPath = path.join(targetRoot, "output", "memory_public", "export_manifest.json");
  const payload = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  fs.writeFileSync(manifestPath, `${JSON.stringify({ ...payload, ...extra }, null, 2)}\n`, "utf8");
}

function main() {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "governed-memory-public-sample-"));
  [
    path.join("scripts", "config", "memory_spec_graph_catalog.json"),
    path.join("scripts", "config", "memory_retrieval_policy.json"),
    path.join("scripts", "config", "memory_type_catalog.json"),
    path.join("scripts", "config", "memory_eval_suite.json"),
    path.join("scripts", "config", "memory_public_export_policy.json"),
  ].forEach((relativePath) => copyJson(relativePath, tempRoot));
  seedGovernedMemoryPublicCompatibilityArtifacts(tempRoot);
  const traceability = createGovernedMemoryPublicFixtureTraceability();
  syncGovernedMemoryGraph({
    workspaceRoot: tempRoot,
    runtime: createGovernedMemoryPublicFixtureRuntime(),
    traceability,
    reason: "sample_public_export_seed",
  });
  syncGovernedMemoryGraph({
    workspaceRoot: tempRoot,
    runtime: createGovernedMemoryPublicFixtureSecondPassRuntime(),
    traceability,
    reason: "sample_public_export_reuse",
  });
  const exported = exportGovernedMemoryPublicArtifacts({ workspaceRoot: tempRoot });
  copyTree(path.join(tempRoot, "output", "memory_public"), path.join(repoRoot, "output", "memory_public"));
  annotateSampleManifest(repoRoot, {
    sourceMode: "deterministic_fixture_sample",
    sampleSyncPassCount: 2,
    canonicalReuseVerified: true,
  });
  process.stdout.write(`${JSON.stringify({
    ok: true,
    status: exported && exported.evalStatus ? exported.evalStatus.status : "UNKNOWN",
    outputRoot: "output/memory_public",
    files: exported && exported.exportManifest && exported.exportManifest.outputs ? exported.exportManifest.outputs : {},
  }, null, 2)}\n`);
}

main();
