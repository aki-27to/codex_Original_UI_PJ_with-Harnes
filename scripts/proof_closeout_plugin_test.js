#!/usr/bin/env node
"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");

const workspaceRoot = path.resolve(__dirname, "..");
const pluginRoot = path.join(workspaceRoot, "plugins", "proof-closeout");
const manifestPath = path.join(pluginRoot, ".codex-plugin", "plugin.json");
const marketplacePath = path.join(workspaceRoot, ".agents", "plugins", "marketplace.json");

const requiredSkills = [
  "code-change-verification",
  "safe-refactor-with-proof",
  "repo-truth-audit",
  "worker-decision-review",
  "long-run-session-closeout",
  "handoff-artifact-generation"
];

const activeRepoSkillRoot = path.join(workspaceRoot, ".agents", "skills");
const archivedSkillRoot = path.join(workspaceRoot, ".agents", "old-skills");
const catalogPath = path.join(workspaceRoot, "scripts", "config", "repo_local_skill_catalog.json");

const triggerTermsBySkill = {
  "code-change-verification": ["code", "config", "docs", "verification", "changed surface", "closeout"],
  "safe-refactor-with-proof": ["multi-file", "refactor", "small", "reversible", "verified"],
  "repo-truth-audit": ["repository docs", "generated outputs", "logs", "status artifacts", "completion claims"],
  "worker-decision-review": ["stopping work", "adoptable", "revision", "blocked", "failed validation"],
  "long-run-session-closeout": ["long-running task", "complete", "paused", "acceptance criteria", "verification state"],
  "handoff-artifact-generation": ["durable continuation bundle", "next action", "verification state", "changed surface", "open issues"]
};

const requiredSections = [
  "## Purpose",
  "## Procedure",
  "## Output Contract",
  "## Evidence",
  "## Failure Guard"
];

const forbiddenPortableRequirements = [
  "output/governance_public/",
  "output/agi_readiness/",
  "/api/exec",
  "/api/eval/run"
];

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function readText(filePath) {
  return fs.readFileSync(filePath, "utf8");
}

function parseFrontmatter(source) {
  const match = source.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  assert(match, "SKILL.md must start with YAML frontmatter");
  const fields = {};
  for (const line of match[1].split(/\r?\n/)) {
    const pair = line.match(/^([A-Za-z0-9_-]+):\s*"?([^"]*)"?\s*$/);
    if (pair) fields[pair[1]] = pair[2];
  }
  return fields;
}

function assertExists(filePath, label) {
  assert(fs.existsSync(filePath), `${label} is missing at ${filePath}`);
}

function assertImplicitPolicy(skillRoot, skillId) {
  const metadataPath = path.join(skillRoot, "agents", "openai.yaml");
  assertExists(metadataPath, `${skillId} agents/openai.yaml`);
  const source = readText(metadataPath);
  assert(
    source.includes("allow_implicit_invocation: true"),
    `${skillId} must explicitly allow implicit invocation`
  );
  assert(source.includes("short_description:"), `${skillId} needs UI short_description metadata`);
  assert(source.includes("default_prompt:"), `${skillId} needs default_prompt metadata`);
}

function main() {
  assertExists(manifestPath, "plugin manifest");
  assertExists(marketplacePath, "marketplace");

  const manifest = readJson(manifestPath);
  assert.strictEqual(manifest.name, "proof-closeout");
  assert.strictEqual(manifest.version, "0.1.0");
  assert.strictEqual(manifest.skills, "./skills/");
  assert(manifest.interface, "manifest.interface is required");
  assert.strictEqual(manifest.interface.displayName, "Proof / Closeout");
  assert(Array.isArray(manifest.interface.defaultPrompt), "defaultPrompt must be an array");
  assert(manifest.interface.defaultPrompt.length <= 3, "defaultPrompt must contain at most 3 entries");

  const marketplace = readJson(marketplacePath);
  assert.strictEqual(marketplace.name, "harnes-local");
  const entry = (marketplace.plugins || []).find((plugin) => plugin.name === "proof-closeout");
  assert(entry, "marketplace must include proof-closeout");
  assert.deepStrictEqual(entry.source, {
    source: "local",
    path: "./plugins/proof-closeout"
  });
  assert.strictEqual(entry.policy && entry.policy.installation, "AVAILABLE");
  assert.strictEqual(entry.policy && entry.policy.authentication, "ON_INSTALL");
  assert.strictEqual(entry.category, "Productivity");

  const catalog = readJson(catalogPath);
  const catalogById = new Map((catalog.skills || []).map((skill) => [skill.id, skill]));

  for (const skillId of requiredSkills) {
    const skillPath = path.join(pluginRoot, "skills", skillId, "SKILL.md");
    assertExists(skillPath, `${skillId} SKILL.md`);
    const catalogEntry = catalogById.get(skillId);
    assert(catalogEntry, `repo-local catalog must include ${skillId}`);
    assert.strictEqual(
      String(catalogEntry.path || "").replace(/\\/g, "/"),
      `plugins/proof-closeout/skills/${skillId}/SKILL.md`,
      `${skillId} catalog path must point to the proof-closeout plugin skill`
    );
    assert(
      !fs.existsSync(path.join(activeRepoSkillRoot, skillId)),
      `${skillId} must not remain as a duplicate active repo-local skill`
    );
    assertExists(path.join(archivedSkillRoot, skillId, "SKILL.md"), `${skillId} archived repo-local copy`);
    const source = readText(skillPath);
    const frontmatter = parseFrontmatter(source);
    assert.strictEqual(frontmatter.name, skillId, `${skillId} frontmatter name must match directory`);
    assert(frontmatter.description && frontmatter.description.length >= 60, `${skillId} needs a useful trigger description`);
    assert(frontmatter.description.startsWith("Use "), `${skillId} description must front-load the trigger with "Use"`);
    for (const triggerTerm of triggerTermsBySkill[skillId]) {
      assert(
        frontmatter.description.toLowerCase().includes(triggerTerm.toLowerCase()),
        `${skillId} description must include trigger term: ${triggerTerm}`
      );
    }
    assertImplicitPolicy(path.dirname(skillPath), skillId);
    for (const section of requiredSections) {
      assert(source.includes(section), `${skillId} missing section ${section}`);
    }
    for (const forbidden of forbiddenPortableRequirements) {
      assert(
        !source.includes(forbidden),
        `${skillId} must keep Harnes-only evidence out of portable skill requirements: ${forbidden}`
      );
    }
  }

  for (const referenceName of [
    "generic-evidence-surfaces.md",
    "harnes-adapter-notes.md",
    "proof-closeout-output-contract.md"
  ]) {
    assertExists(path.join(pluginRoot, "references", referenceName), `reference ${referenceName}`);
  }

  console.log("PASS proof_closeout_plugin_test");
}

main();
