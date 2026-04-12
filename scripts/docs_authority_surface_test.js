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

const expectedAgentsBoundaryLine =
  "\u3053\u306e\u30d5\u30a1\u30a4\u30eb\u306f\u6700\u4e0a\u4f4d\u61b2\u6cd5\u3067\u306f\u306a\u304f\u3001runtime behavior constraints \u3092\u5b9a\u3081\u308b operational constitution \u3067\u3059\u3002";

const deprecatedSupremeClaim =
  "\u3053\u306e\u30d5\u30a1\u30a4\u30eb\u306f\u6700\u4e0a\u4f4d\u306e\u61b2\u6cd5";

function run() {
  const requiredDocs = [
    "docs/README.md",
    "docs/BEGINNER_PATH.md",
    "docs/DEMO_FLOWS.md",
    "docs/CAPABILITY_SURFACE.md",
    "docs/BUYER_PAIN_MAP.md",
    "docs/PRODUCT_POSITIONING.md",
    "docs/COMPARISON_BOUNDARY.md",
    "docs/PROVIDER_AND_PORTABILITY.md",
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
  const demoFlows = read("docs/DEMO_FLOWS.md");
  const capabilitySurface = read("docs/CAPABILITY_SURFACE.md");
  const buyerPainMap = read("docs/BUYER_PAIN_MAP.md");
  const productPositioning = read("docs/PRODUCT_POSITIONING.md");
  const comparisonBoundary = read("docs/COMPARISON_BOUNDARY.md");
  const providerPortability = read("docs/PROVIDER_AND_PORTABILITY.md");
  const glossary = read("docs/GLOSSARY.md");
  const documentToolingGuide = read("docs/DOCUMENT_TOOLING_GUIDE.md");
  const harnessMap = read("HARNESS_MAP.md");
  const architecture = read("docs/CURRENT_ARCHITECTURE.md");
  const agents = read("AGENTS.md");
  const constitution = read("docs/HARNESS_CONSTITUTION.md");
  const evidenceContract = read("docs/EVIDENCE_CONTRACT.md");
  const copilotInstructions = read(".github/copilot-instructions.md");
  const authorityRegistry = readJson("scripts/config/authority_registry.json");
  const postureProfiles = readJson("scripts/config/deployment_posture_profiles.json");
  const qualityWorkflow = read(".github/workflows/quality-gates.yml");

  assertOk(readme.includes("docs/README.md"), "README.md must point to docs/README.md as the docs entrypoint");
  assertOk(readme.includes("docs/BEGINNER_PATH.md"), "README.md must point to docs/BEGINNER_PATH.md for beginners");
  assertOk(readme.includes("docs/DEMO_FLOWS.md"), "README.md must point to docs/DEMO_FLOWS.md");
  assertOk(readme.includes("## What You Can Hand To It Today"), "README.md must expose visible product jobs");
  assertOk(readme.includes("## Fastest 3-Minute Trial"), "README.md must expose a fast trial path");
  assertOk(readme.includes("## What Pain It Removes"), "README.md must translate mechanisms into buyer pain");
  assertOk(readme.includes("## Compare It On The Right Axis"), "README.md must guard the comparison axis");
  assertOk(readme.includes("docs/BUYER_PAIN_MAP.md"), "README.md must point to docs/BUYER_PAIN_MAP.md");
  assertOk(readme.includes("docs/COMPARISON_BOUNDARY.md"), "README.md must point to docs/COMPARISON_BOUNDARY.md");
  assertOk(readme.includes("npm run help:scripts"), "README.md must point operators to npm run help:scripts");
  assertOk(readme.includes("authority-registry.v1"), "README.md must mention authority-registry.v1");
  assertOk(readme.includes("navigation / entrypoint only"), "README.md must declare its authority role");
  assertOk(harnessMap.includes("docs/README.md"), "HARNESS_MAP.md must reference docs/README.md");
  assertOk(harnessMap.includes("docs/DEMO_FLOWS.md"), "HARNESS_MAP.md must reference docs/DEMO_FLOWS.md");
  assertOk(harnessMap.includes("docs/BUYER_PAIN_MAP.md"), "HARNESS_MAP.md must reference docs/BUYER_PAIN_MAP.md");
  assertOk(harnessMap.includes("docs/COMPARISON_BOUNDARY.md"), "HARNESS_MAP.md must reference docs/COMPARISON_BOUNDARY.md");
  assertOk(harnessMap.includes("authority-registry.v1"), "HARNESS_MAP.md must mention authority-registry.v1");
  assertOk(harnessMap.includes("navigation / entrypoint only"), "HARNESS_MAP.md must declare its authority role");
  assertOk(architecture.includes("docs/README.md"), "CURRENT_ARCHITECTURE.md must reference docs/README.md");
  assertOk(architecture.includes("docs/DEMO_FLOWS.md"), "CURRENT_ARCHITECTURE.md must reference docs/DEMO_FLOWS.md");
  assertOk(architecture.includes("docs/BUYER_PAIN_MAP.md"), "CURRENT_ARCHITECTURE.md must reference docs/BUYER_PAIN_MAP.md");
  assertOk(architecture.includes("docs/COMPARISON_BOUNDARY.md"), "CURRENT_ARCHITECTURE.md must reference docs/COMPARISON_BOUNDARY.md");
  assertOk(architecture.includes("authority-registry.v1"), "CURRENT_ARCHITECTURE.md must mention authority-registry.v1");
  assertOk(architecture.includes("active design spec"), "CURRENT_ARCHITECTURE.md must declare its authority role");
  assertOk(beginnerPath.includes("npm run help:scripts"), "BEGINNER_PATH.md must mention npm run help:scripts");
  assertOk(beginnerPath.includes("DEMO_FLOWS.md"), "BEGINNER_PATH.md must point to DEMO_FLOWS.md");
  assertOk(beginnerPath.includes("BUYER_PAIN_MAP.md"), "BEGINNER_PATH.md must point to BUYER_PAIN_MAP.md");
  assertOk(beginnerPath.includes("COMPARISON_BOUNDARY.md"), "BEGINNER_PATH.md must point to COMPARISON_BOUNDARY.md");
  assertOk(beginnerPath.includes("What To Click First"), "BEGINNER_PATH.md must give a UI-first click path");
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
  assertOk(
    agents.includes(expectedAgentsBoundaryLine),
    "AGENTS.md must preserve the Japanese operational constitution boundary"
  );
  assertOk(!agents.includes(deprecatedSupremeClaim), "AGENTS.md must not claim supreme authority");
  assertOk(constitution.includes("single supreme frozen constitution"), "HARNESS_CONSTITUTION.md must declare the supreme authority role");
  assertOk(constitution.includes("authority-registry.v1"), "HARNESS_CONSTITUTION.md must mention authority-registry.v1");
  assertOk(evidenceContract.includes("proof contract truth"), "EVIDENCE_CONTRACT.md must declare its authority role");
  assertOk(evidenceContract.includes("authority-registry.v1"), "EVIDENCE_CONTRACT.md must mention authority-registry.v1");
  assertOk(copilotInstructions.includes("docs/HARNESS_CONSTITUTION.md"), "GitHub governance mirror must reference HARNESS_CONSTITUTION.md");
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

  for (const marker of [
    "DEMO_FLOWS.md",
    "BUYER_PAIN_MAP.md",
    "COMPARISON_BOUNDARY.md",
    "PRODUCT_POSITIONING.md",
    "PROVIDER_AND_PORTABILITY.md",
  ]) {
    assertOk(docsIndex.includes(marker), `docs/README.md must reference ${marker}`);
  }

  assertOk(demoFlows.includes("Authority role: `navigation / demo surface only`"), "DEMO_FLOWS.md must declare its authority role");
  assertOk(demoFlows.includes("## The Three Fixed Demo Jobs"), "DEMO_FLOWS.md must define the fixed demo jobs");
  assertOk(demoFlows.includes("## One-Line Rule"), "DEMO_FLOWS.md must define the one-line demo rule");

  assertOk(capabilitySurface.includes("## Touch It Now"), "CAPABILITY_SURFACE.md must expose a touchable breadth section");
  assertOk(capabilitySurface.includes("## Three Visible Jobs"), "CAPABILITY_SURFACE.md must expose the job-first breadth view");
  assertOk(capabilitySurface.includes("Overview"), "CAPABILITY_SURFACE.md must mention the Overview entrypoint");
  assertOk(capabilitySurface.includes("Capabilities"), "CAPABILITY_SURFACE.md must mention the Capabilities entrypoint");
  assertOk(capabilitySurface.includes("Demo Flow"), "CAPABILITY_SURFACE.md must mention the Demo Flow entrypoint");
  assertOk(capabilitySurface.includes("DEMO_FLOWS.md"), "CAPABILITY_SURFACE.md must link to DEMO_FLOWS.md");
  assertOk(capabilitySurface.includes("BUYER_PAIN_MAP.md"), "CAPABILITY_SURFACE.md must link to BUYER_PAIN_MAP.md");
  assertOk(capabilitySurface.includes("COMPARISON_BOUNDARY.md"), "CAPABILITY_SURFACE.md must link to COMPARISON_BOUNDARY.md");

  assertOk(buyerPainMap.includes("Authority role: `navigation / value translation only`"), "BUYER_PAIN_MAP.md must declare its authority role");
  assertOk(buyerPainMap.includes("Pain -> What This Repo Does"), "BUYER_PAIN_MAP.md must translate buyer pain into repo value");
  assertOk(buyerPainMap.includes("How To Pitch It In One Sentence"), "BUYER_PAIN_MAP.md must include one-sentence value translation");
  assertOk(buyerPainMap.includes("What Responsibility Gets Lighter"), "BUYER_PAIN_MAP.md must expose lighter buyer responsibility");

  assertOk(productPositioning.includes("## Buyer Language First"), "PRODUCT_POSITIONING.md must include buyer-language guidance");
  assertOk(productPositioning.includes("## Front-Door Copy"), "PRODUCT_POSITIONING.md must define front-door wording");
  assertOk(productPositioning.includes("## Anti-Drift Rule"), "PRODUCT_POSITIONING.md must include anti-drift guidance");
  assertOk(productPositioning.includes("DEMO_FLOWS.md"), "PRODUCT_POSITIONING.md must link to DEMO_FLOWS.md");
  assertOk(productPositioning.includes("BUYER_PAIN_MAP.md"), "PRODUCT_POSITIONING.md must link to BUYER_PAIN_MAP.md");
  assertOk(productPositioning.includes("COMPARISON_BOUNDARY.md"), "PRODUCT_POSITIONING.md must link to COMPARISON_BOUNDARY.md");

  assertOk(comparisonBoundary.includes("Authority role: `navigation / comparison guard only`"), "COMPARISON_BOUNDARY.md must declare its authority role");
  assertOk(comparisonBoundary.includes("## Wrong First Question"), "COMPARISON_BOUNDARY.md must define the wrong first question");
  assertOk(comparisonBoundary.includes("## Right First Question"), "COMPARISON_BOUNDARY.md must define the right first question");
  assertOk(comparisonBoundary.includes("## One-Line Rule"), "COMPARISON_BOUNDARY.md must define the one-line comparison rule");

  assertOk(providerPortability.includes("authority-registry.v1"), "PROVIDER_AND_PORTABILITY.md must mention authority-registry.v1");

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
