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
  const requiredFiles = [
    ".github/copilot-instructions.md",
    ".github/instructions/runtime-governance.instructions.md",
    ".github/instructions/docs-authority.instructions.md",
    ".github/instructions/frontend-harness.instructions.md",
    ".github/instructions/eval-governance.instructions.md",
    ".github/agents/researcher.agent.md",
    ".github/agents/implementer.agent.md",
    ".github/agents/evaluator.agent.md",
    ".github/agents/release-gate.agent.md",
  ];

  for (const relativePath of requiredFiles) {
    assert(fs.existsSync(path.join(workspaceRoot, relativePath)), `${relativePath} must exist`);
  }

  const copilotInstructions = read(".github/copilot-instructions.md");
  assert(copilotInstructions.includes("AGENTS.md"), "copilot instructions must reference AGENTS.md");
  assert(copilotInstructions.includes("POST /api/exec"), "copilot instructions must preserve POST /api/exec");
  assert(copilotInstructions.includes(".github/instructions/"), "copilot instructions must point to .github/instructions/");
  assert(copilotInstructions.includes(".github/agents/"), "copilot instructions must point to .github/agents/");

  const runtimeInstructions = read(".github/instructions/runtime-governance.instructions.md");
  assert(runtimeInstructions.includes('applyTo: "server.js'), "runtime instructions must target runtime files");
  assert(runtimeInstructions.includes("/api/batch/*"), "runtime instructions must mention /api/batch/* boundary");
  assert(
    runtimeInstructions.includes("node scripts/system_coherence_review_test.js"),
    "runtime instructions must mention system_coherence_review_test.js"
  );
  assert(
    runtimeInstructions.includes("node scripts/github_copilot_governance_surface_test.js"),
    "runtime instructions must mention github_copilot_governance_surface_test.js"
  );

  const docsInstructions = read(".github/instructions/docs-authority.instructions.md");
  assert(docsInstructions.includes("AGENTS.md"), "docs instructions must reference AGENTS.md");
  assert(
    docsInstructions.includes("scripts/config/"),
    "docs instructions must reference machine-readable contracts under scripts/config/"
  );
  assert(
    docsInstructions.includes("docs/CURRENT_ARCHITECTURE.md"),
    "docs instructions must reference CURRENT_ARCHITECTURE.md"
  );
  assert(
    docsInstructions.includes("docs/ARCHITECTURE_CHANGELOG.md"),
    "docs instructions must reference ARCHITECTURE_CHANGELOG.md"
  );

  const frontendInstructions = read(".github/instructions/frontend-harness.instructions.md");
  assert(frontendInstructions.includes("assistant-like"), "frontend instructions must preserve assistant-like operator UI");
  assert(frontendInstructions.includes("GET /api/runtime"), "frontend instructions must mention GET /api/runtime");
  assert(
    frontendInstructions.includes("GET /01.HarnesUI/index.html"),
    "frontend instructions must mention GET /01.HarnesUI/index.html"
  );

  const evalInstructions = read(".github/instructions/eval-governance.instructions.md");
  assert(evalInstructions.includes("/api/eval/run"), "eval instructions must preserve /api/eval/run");
  assert(evalInstructions.includes("task rubrics may evolve"), "eval instructions must define mutable task rubrics");
  assert(
    evalInstructions.includes("release gates, approval boundaries, and requirement contracts remain fixed authority"),
    "eval instructions must keep constitutional gates fixed"
  );

  const researcherAgent = read(".github/agents/researcher.agent.md");
  assert(researcherAgent.includes('tools: ["read", "search"]'), "researcher agent must stay read-only");
  assert(researcherAgent.includes("do not edit files"), "researcher agent must forbid edits");

  const implementerAgent = read(".github/agents/implementer.agent.md");
  assert(
    implementerAgent.includes('tools: ["read", "search", "edit", "execute"]'),
    "implementer agent must allow read/search/edit/execute"
  );
  assert(
    implementerAgent.includes("docs/CURRENT_ARCHITECTURE.md"),
    "implementer agent must require CURRENT_ARCHITECTURE.md sync"
  );
  assert(implementerAgent.includes("POST /api/exec"), "implementer agent must preserve POST /api/exec");

  const evaluatorAgent = read(".github/agents/evaluator.agent.md");
  assert(evaluatorAgent.includes("npm run test:repo-quality"), "evaluator agent must mention repo-quality");
  assert(
    evaluatorAgent.includes("node scripts/github_copilot_governance_surface_test.js"),
    "evaluator agent must mention github_copilot_governance_surface_test.js"
  );

  const releaseGateAgent = read(".github/agents/release-gate.agent.md");
  assert(releaseGateAgent.includes("RELEASE_APPROVED"), "release gate agent must mention RELEASE_APPROVED");
  assert(
    releaseGateAgent.includes("docs/ARCHITECTURE_CHANGELOG.md"),
    "release gate agent must require changelog sync"
  );

  const architecture = read("docs/CURRENT_ARCHITECTURE.md");
  assert(
    architecture.includes(".github/copilot-instructions.md"),
    "CURRENT_ARCHITECTURE.md must mention .github/copilot-instructions.md"
  );
  assert(
    architecture.includes(".github/instructions/"),
    "CURRENT_ARCHITECTURE.md must mention .github/instructions/"
  );
  assert(architecture.includes(".github/agents/"), "CURRENT_ARCHITECTURE.md must mention .github/agents/");
  assert(
    architecture.includes("node scripts/github_copilot_governance_surface_test.js"),
    "CURRENT_ARCHITECTURE.md must mention github_copilot_governance_surface_test.js"
  );

  const changelog = read("docs/ARCHITECTURE_CHANGELOG.md");
  assert(
    changelog.includes("GitHub-native Copilot governance surface"),
    "ARCHITECTURE_CHANGELOG.md must record the GitHub-native Copilot governance surface change"
  );

  assert(
    Object.prototype.hasOwnProperty.call(packageJson.scripts, "test:github-governance-surface"),
    "package.json must expose test:github-governance-surface"
  );
  assert(
    packageJson.scripts["test:repo-quality"].includes("npm run test:github-governance-surface"),
    "test:repo-quality must include test:github-governance-surface"
  );

  process.stdout.write("PASS github_copilot_governance_surface_test\n");
}

run();
