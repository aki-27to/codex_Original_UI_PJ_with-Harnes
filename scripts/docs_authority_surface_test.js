#!/usr/bin/env node
"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");

const workspaceRoot = path.resolve(__dirname, "..");
const packageJson = require(path.join(workspaceRoot, "package.json"));

function assertOk(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function read(relativePath) {
  return fs.readFileSync(path.join(workspaceRoot, relativePath), "utf8");
}

function readJson(relativePath) {
  return JSON.parse(read(relativePath));
}

function run() {
  const requiredDocs = [
    "docs/README.md",
    "docs/BEGINNER_PATH.md",
    "docs/GLOSSARY.md",
    "docs/DOCUMENT_TOOLING_GUIDE.md",
    "docs/HARNESS_CONSTITUTION.md",
    "docs/CURRENT_ARCHITECTURE.md",
    "docs/EVIDENCE_CONTRACT.md",
    "docs/archive/AI_AGENT_HARNESS_TEXTBOOK_JA.html",
  ];
  for (const relativePath of requiredDocs) {
    assertOk(fs.existsSync(path.join(workspaceRoot, relativePath)), `${relativePath} must exist`);
  }

  const readme = read("README.md");
  const docsIndex = read("docs/README.md");
  const beginnerPath = read("docs/BEGINNER_PATH.md");
  const glossary = read("docs/GLOSSARY.md");
  const documentToolingGuide = read("docs/DOCUMENT_TOOLING_GUIDE.md");
  const harnessMap = read("HARNESS_MAP.md");
  const architecture = read("docs/CURRENT_ARCHITECTURE.md");
  const agents = read("AGENTS.md");
  const constitution = read("docs/HARNESS_CONSTITUTION.md");
  const evidenceContract = read("docs/EVIDENCE_CONTRACT.md");
  const authorityRegistry = readJson("scripts/config/authority_registry.json");
  const postureProfiles = readJson("scripts/config/deployment_posture_profiles.json");
  const qualityWorkflow = read(".github/workflows/quality-gates.yml");

  assertOk(readme.includes("docs/README.md"), "README.md must point to docs/README.md as the docs entrypoint");
  assertOk(readme.includes("docs/BEGINNER_PATH.md"), "README.md must point to docs/BEGINNER_PATH.md for beginners");
  assertOk(readme.includes("npm run help:scripts"), "README.md must point operators to npm run help:scripts");
  assertOk(readme.includes("authority-registry.v1"), "README.md must mention authority-registry.v1");
  assertOk(readme.includes("navigation / entrypoint only"), "README.md must declare its authority role");
  assertOk(harnessMap.includes("docs/README.md"), "HARNESS_MAP.md must reference docs/README.md");
  assertOk(harnessMap.includes("authority-registry.v1"), "HARNESS_MAP.md must mention authority-registry.v1");
  assertOk(harnessMap.includes("navigation / entrypoint only"), "HARNESS_MAP.md must declare its authority role");
  assertOk(architecture.includes("docs/README.md"), "CURRENT_ARCHITECTURE.md must reference docs/README.md");
  assertOk(architecture.includes("authority-registry.v1"), "CURRENT_ARCHITECTURE.md must mention authority-registry.v1");
  assertOk(architecture.includes("active design spec"), "CURRENT_ARCHITECTURE.md must declare its authority role");
  assertOk(beginnerPath.includes("npm run help:scripts"), "BEGINNER_PATH.md must mention npm run help:scripts");
  assertOk(Object.prototype.hasOwnProperty.call(packageJson.scripts, "help:scripts"), "package.json must expose help:scripts");
  assertOk(Object.prototype.hasOwnProperty.call(packageJson.scripts, "tooling:document:bootstrap"), "package.json must expose tooling:document:bootstrap");
  assertOk(Object.prototype.hasOwnProperty.call(packageJson.scripts, "tooling:document:status"), "package.json must expose tooling:document:status");
  assertOk(fs.existsSync(path.join(workspaceRoot, "scripts", "script_surface_help.js")), "scripts/script_surface_help.js must exist");
  assertOk(fs.existsSync(path.join(workspaceRoot, "scripts", "document_tooling.js")), "scripts/document_tooling.js must exist");
  assertOk(qualityWorkflow.includes("npm run test:repo-quality"), "quality-gates workflow must run npm run test:repo-quality");
  assertOk(
    qualityWorkflow.includes("npm run test:windows-launcher-policy"),
    "quality-gates workflow must run npm run test:windows-launcher-policy"
  );
  assertOk(agents.includes("operational constitution / runtime behavior constraints"), "AGENTS.md must declare its operational authority role");
  assertOk(agents.includes("authority-registry.v1"), "AGENTS.md must mention authority-registry.v1");
  assertOk(constitution.includes("single supreme frozen constitution"), "HARNESS_CONSTITUTION.md must declare the supreme authority role");
  assertOk(constitution.includes("authority-registry.v1"), "HARNESS_CONSTITUTION.md must mention authority-registry.v1");
  assertOk(evidenceContract.includes("proof contract truth"), "EVIDENCE_CONTRACT.md must declare its authority role");
  assertOk(evidenceContract.includes("authority-registry.v1"), "EVIDENCE_CONTRACT.md must mention authority-registry.v1");
  assert.strictEqual(authorityRegistry.schema, "authority-registry.v1", "authority registry schema mismatch");
  assert.strictEqual(postureProfiles.defaultProfile, "portable_local", "deployment posture default must remain portable_local");

  for (const sectionLabel of [
    "Canonical Authority",
    "Operational Runbooks",
    "Companion And Adjacent Surfaces",
    "Research And Learning Notes",
    "Archive And Compatibility",
  ]) {
    assertOk(docsIndex.includes(sectionLabel), `docs/README.md must define the ${sectionLabel} section`);
  }

  for (const marker of [
    "POST /api/exec",
    "POST /api/eval/run",
    "logs/current/",
    "output/",
  ]) {
    assertOk(beginnerPath.includes(marker), `BEGINNER_PATH.md must mention ${marker}`);
  }

  for (const term of [
    "governed harness",
    "companion surface",
    "current surface",
    "signoff bundle",
    "runtime/",
    "output/",
  ]) {
    assertOk(glossary.toLowerCase().includes(term.toLowerCase()), `GLOSSARY.md must define ${term}`);
  }

  for (const marker of [
    "MarkItDown",
    "OpenDataLoader PDF",
    "SkillNet",
    "node scripts/document_tooling.js bootstrap",
    "node scripts/document_tooling.js status",
  ]) {
    assertOk(documentToolingGuide.includes(marker), `DOCUMENT_TOOLING_GUIDE.md must mention ${marker}`);
  }

  for (const profileId of ["owner_local", "portable_local", "reviewed_team"]) {
    assertOk(Object.prototype.hasOwnProperty.call(postureProfiles.profiles, profileId), `deployment posture profiles must include ${profileId}`);
  }

  process.stdout.write("PASS docs_authority_surface_test\n");
}

run();
