"use strict";

const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const {
  exportGovernedMemoryPublicArtifacts,
  syncGovernedMemoryGraph,
} = require("./lib/governed_memory_graph");
const {
  createGovernedMemoryPublicFixtureRuntime,
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

function main() {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "governed-memory-public-"));
  [
    path.join("scripts", "config", "memory_spec_graph_catalog.json"),
    path.join("scripts", "config", "memory_retrieval_policy.json"),
    path.join("scripts", "config", "memory_type_catalog.json"),
    path.join("scripts", "config", "memory_eval_suite.json"),
    path.join("scripts", "config", "memory_public_export_policy.json"),
  ].forEach((relativePath) => copyJson(relativePath, tempRoot));
  seedGovernedMemoryPublicCompatibilityArtifacts(tempRoot);

  const runtime = createGovernedMemoryPublicFixtureRuntime();
  const traceability = createGovernedMemoryPublicFixtureTraceability();

  syncGovernedMemoryGraph({
    workspaceRoot: tempRoot,
    runtime,
    traceability,
    reason: "test_sync_public",
  });
  const exported = exportGovernedMemoryPublicArtifacts({ workspaceRoot: tempRoot });

  const outputRoot = path.join(tempRoot, "output", "memory_public");
  assert(fs.existsSync(path.join(outputRoot, "latest_overview.json")), "public overview json must exist");
  assert(fs.existsSync(path.join(outputRoot, "workspace_progress_public.json")), "workspace progress public json must exist");
  assert(fs.existsSync(path.join(outputRoot, "latest_pack_public.json")), "latest pack public json must exist");
  assert(fs.existsSync(path.join(outputRoot, "promotion_revocation_health_public.json")), "promotion health public json must exist");
  assert(fs.existsSync(path.join(outputRoot, "memory_eval_public_status.json")), "memory eval public status json must exist");
  assert(fs.existsSync(path.join(outputRoot, "openai_primary_lane_projection.json")), "openai lane projection must exist");
  assert(fs.existsSync(path.join(outputRoot, "anthropic_secondary_lane_projection.json")), "anthropic lane projection must exist");

  const overviewText = fs.readFileSync(path.join(outputRoot, "latest_overview.json"), "utf8");
  assert(!overviewText.includes(tempRoot), "public overview must not leak the absolute workspace path");
  const workspaceProgress = JSON.parse(fs.readFileSync(path.join(outputRoot, "workspace_progress_public.json"), "utf8"));
  assert(!JSON.stringify(workspaceProgress).includes(tempRoot), "workspace progress public artifact must not leak the absolute workspace path");
  assert.strictEqual(workspaceProgress.workspaceRoot, undefined, "workspace progress public artifact must not expose workspaceRoot");
  const latestPack = JSON.parse(fs.readFileSync(path.join(outputRoot, "latest_pack_public.json"), "utf8"));
  assert(Array.isArray(latestPack.latestPack.selectedItems), "latest pack public artifact must expose selectedItems");
  assert(latestPack.latestPack.selectedItems.every((entry) => typeof entry.publicRef === "string" && entry.publicRef.startsWith("mem_")), "latest pack public artifact must expose redacted publicRefs");
  assert(latestPack.latestPack.selectedItems.every((entry) => !String(entry.publicRef).includes("episode:")), "latest pack public artifact must not leak raw memory ids");
  const evalStatus = JSON.parse(fs.readFileSync(path.join(outputRoot, "memory_eval_public_status.json"), "utf8"));
  assert.strictEqual(evalStatus.status, "PASS", "memory eval public status must pass for the seeded canonical store");
  const openaiLane = JSON.parse(fs.readFileSync(path.join(outputRoot, "openai_primary_lane_projection.json"), "utf8"));
  assert(openaiLane.canonicalCounts.lessonCount >= 1, "openai lane projection must derive lesson counts from canonical graph");
  assert.strictEqual(openaiLane.compatibilityState.gateStatus, "PASS", "openai lane projection must preserve compatibility gate status");
  const anthropicLane = JSON.parse(fs.readFileSync(path.join(outputRoot, "anthropic_secondary_lane_projection.json"), "utf8"));
  assert(anthropicLane.canonicalCounts.lessonCount >= 1, "anthropic lane projection must derive lesson counts from canonical graph");
  assert.strictEqual(anthropicLane.compatibilityState.observationStatus, "disabled", "anthropic lane projection must preserve compatibility observation status");
  assert(exported.exportManifest && exported.exportManifest.outputs, "export manifest must be returned");

  console.log("governed_memory_public_export_test: ok");
}

main();
