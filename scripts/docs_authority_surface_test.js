#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");

const workspaceRoot = path.resolve(__dirname, "..");
const packageJson = require(path.join(workspaceRoot, "package.json"));

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function read(relativePath) {
  return fs.readFileSync(path.join(workspaceRoot, relativePath), "utf8");
}

function run() {
  const requiredDocs = [
    "docs/README.md",
    "docs/BEGINNER_PATH.md",
    "docs/GLOSSARY.md",
    "docs/archive/AI_AGENT_HARNESS_TEXTBOOK_JA.html",
  ];
  for (const relativePath of requiredDocs) {
    assert(fs.existsSync(path.join(workspaceRoot, relativePath)), `${relativePath} must exist`);
  }

  const readme = read("README.md");
  const docsIndex = read("docs/README.md");
  const beginnerPath = read("docs/BEGINNER_PATH.md");
  const glossary = read("docs/GLOSSARY.md");
  const harnessMap = read("HARNESS_MAP.md");
  const architecture = read("docs/CURRENT_ARCHITECTURE.md");
  const qualityWorkflow = read(".github/workflows/quality-gates.yml");

  assert(readme.includes("docs/README.md"), "README.md must point to docs/README.md as the docs entrypoint");
  assert(readme.includes("docs/BEGINNER_PATH.md"), "README.md must point to docs/BEGINNER_PATH.md for beginners");
  assert(readme.includes("npm run help:scripts"), "README.md must point operators to npm run help:scripts");
  assert(harnessMap.includes("docs/README.md"), "HARNESS_MAP.md must reference docs/README.md");
  assert(architecture.includes("docs/README.md"), "CURRENT_ARCHITECTURE.md must reference docs/README.md");
  assert(beginnerPath.includes("npm run help:scripts"), "BEGINNER_PATH.md must mention npm run help:scripts");
  assert(Object.prototype.hasOwnProperty.call(packageJson.scripts, "help:scripts"), "package.json must expose help:scripts");
  assert(fs.existsSync(path.join(workspaceRoot, "scripts", "script_surface_help.js")), "scripts/script_surface_help.js must exist");
  assert(qualityWorkflow.includes("npm run test:repo-quality"), "quality-gates workflow must run npm run test:repo-quality");
  assert(
    qualityWorkflow.includes("npm run test:windows-launcher-policy"),
    "quality-gates workflow must run npm run test:windows-launcher-policy"
  );

  for (const sectionLabel of [
    "Canonical Authority",
    "Operational Runbooks",
    "Companion And Adjacent Surfaces",
    "Research And Learning Notes",
    "Archive And Compatibility",
  ]) {
    assert(docsIndex.includes(sectionLabel), `docs/README.md must define the ${sectionLabel} section`);
  }

  for (const marker of [
    "POST /api/exec",
    "POST /api/eval/run",
    "logs/current/",
    "output/",
  ]) {
    assert(beginnerPath.includes(marker), `BEGINNER_PATH.md must mention ${marker}`);
  }

  for (const term of [
    "governed harness",
    "companion surface",
    "current surface",
    "signoff bundle",
    "runtime/",
    "output/",
  ]) {
    assert(glossary.toLowerCase().includes(term.toLowerCase()), `GLOSSARY.md must define ${term}`);
  }

  process.stdout.write("PASS docs_authority_surface_test\n");
}

run();
