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
  const secondPassRuntime = createGovernedMemoryPublicFixtureSecondPassRuntime();
  const traceability = createGovernedMemoryPublicFixtureTraceability();

  syncGovernedMemoryGraph({
    workspaceRoot: tempRoot,
    runtime,
    traceability,
    reason: "test_sync_public_seed",
  });
  syncGovernedMemoryGraph({
    workspaceRoot: tempRoot,
    runtime: secondPassRuntime,
    traceability,
    reason: "test_sync_public_reuse",
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
  assert(!JSON.stringify(workspaceProgress).includes("[object Object]"), "workspace progress public artifact must not contain object stringification artifacts");
  const latestPack = JSON.parse(fs.readFileSync(path.join(outputRoot, "latest_pack_public.json"), "utf8"));
  assert(Array.isArray(latestPack.latestPack.selectedItems), "latest pack public artifact must expose selectedItems");
  assert(latestPack.latestPack.selectedItems.every((entry) => typeof entry.publicRef === "string" && entry.publicRef.startsWith("mem_")), "latest pack public artifact must expose redacted publicRefs");
  assert(latestPack.latestPack.selectedItems.every((entry) => !String(entry.publicRef).includes("episode:")), "latest pack public artifact must not leak raw memory ids");
  assert(latestPack.latestPack.selectedItems.every((entry) => !/\[object Object\]/.test(String(entry.summary))), "latest pack public summaries must not contain object stringification artifacts");
  assert(latestPack.latestPack.selectedItems.every((entry) => !/mock-/.test(String(entry.summary))), "latest pack public summaries must not expose raw mock turn prefixes");
  assert(latestPack.latestPack.selectedItems.every((entry) => !/\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/i.test(String(entry.summary))), "latest pack public summaries must not expose raw opaque UUIDs");
  assert(latestPack.latestPack.reusedSelectedCount >= 1, "latest pack public artifact must show canonical reuse");
  assert.strictEqual(latestPack.latestPack.explicitTaskFamilyMismatchCount, 0, "latest pack public artifact must not expose hard task-family mismatches");
  const evalStatus = JSON.parse(fs.readFileSync(path.join(outputRoot, "memory_eval_public_status.json"), "utf8"));
  assert.strictEqual(evalStatus.status, "PASS", "memory eval public status must pass for the seeded canonical store");
  assert(evalStatus.checks.some((entry) => entry.id === "bounded_memory_pack_reuses_canonical_memory" && entry.status === "PASS"), "memory eval public status must verify canonical pack reuse");
  assert(evalStatus.checks.some((entry) => entry.id === "task_family_isolation_respected" && entry.status === "PASS"), "memory eval public status must verify task-family isolation");
  const openaiLane = JSON.parse(fs.readFileSync(path.join(outputRoot, "openai_primary_lane_projection.json"), "utf8"));
  assert(openaiLane.canonicalCounts.lessonCount >= 1, "openai lane projection must derive lesson counts from canonical graph");
  assert.strictEqual(openaiLane.compatibilityState.gateStatus, "PASS", "openai lane projection must preserve compatibility gate status");
  assert.strictEqual(openaiLane.canonicalCounts.derivedFromCanonicalStore, true, "openai lane projection must declare canonical derivation");
  const anthropicLane = JSON.parse(fs.readFileSync(path.join(outputRoot, "anthropic_secondary_lane_projection.json"), "utf8"));
  assert(anthropicLane.canonicalCounts.lessonCount >= 1, "anthropic lane projection must derive lesson counts from canonical graph");
  assert.strictEqual(anthropicLane.compatibilityState.observationStatus, "disabled", "anthropic lane projection must preserve compatibility observation status");
  assert.strictEqual(anthropicLane.canonicalCounts.derivedFromCanonicalStore, true, "anthropic lane projection must declare canonical derivation");
  assert(exported.exportManifest && exported.exportManifest.outputs, "export manifest must be returned");
  assert.strictEqual(exported.exportManifest.canonicalReuseVerified, true, "export manifest must record canonical reuse verification");

  console.log("governed_memory_public_export_test: ok");
}

main();
