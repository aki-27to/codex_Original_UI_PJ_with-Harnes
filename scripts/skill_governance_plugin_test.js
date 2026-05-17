#!/usr/bin/env node
"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");

const workspaceRoot = path.resolve(__dirname, "..");
const pluginRoot = path.join(workspaceRoot, "plugins", "skill-governance");
const manifestPath = path.join(pluginRoot, ".codex-plugin", "plugin.json");
const marketplacePath = path.join(workspaceRoot, ".agents", "plugins", "marketplace.json");
const catalogPath = path.join(workspaceRoot, "scripts", "config", "repo_local_skill_catalog.json");
const activeRepoSkillRoot = path.join(workspaceRoot, ".agents", "skills");
const archivedSkillRoot = path.join(workspaceRoot, ".agents", "old-skills");

const requiredSkills = [
  "skill-creator-master",
  "skill-design-review-codex",
  "skill-promotion-governance",
  "artifact-improvement-learning",
  "feedback-to-recurrence-patch"
];

const triggerTermsBySkill = {
  "skill-creator-master": ["authoring", "hardening", "Codex skills", "evidence", "rollback"],
  "skill-design-review-codex": ["evaluate", "skill-package design", "activation", "governance", "plugin boundaries"],
  "skill-promotion-governance": ["cataloging", "promoting", "demoting", "archiving", "rolling back"],
  "artifact-improvement-learning": ["artifact", "improved", "reusable pattern", "promotion condition", "rollback condition"],
  "feedback-to-recurrence-patch": ["user corrections", "failed validations", "recurrence patch", "replay plan"]
};

const requiredSections = [
  "## Purpose",
  "## Procedure",
  "## Output Contract",
  "## Evidence",
  "## Verification",
  "## Failure Guard"
];

const requiredReferences = [
  "generic-skill-governance-surfaces.md",
  "harnes-adapter-notes.md",
  "skill-governance-output-contract.md"
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
  assert(source.includes("allow_implicit_invocation: true"), `${skillId} must explicitly allow implicit invocation`);
  assert(source.includes("short_description:"), `${skillId} needs UI short_description metadata`);
  assert(source.includes("default_prompt:"), `${skillId} needs default_prompt metadata`);
}

function main() {
  assertExists(manifestPath, "plugin manifest");
  assertExists(marketplacePath, "marketplace");
  assertExists(catalogPath, "repo-local skill catalog");

  const manifest = readJson(manifestPath);
  assert.strictEqual(manifest.name, "skill-governance");
  assert.strictEqual(manifest.version, "0.1.0");
  assert.strictEqual(manifest.skills, "./skills/");
  assert.strictEqual(manifest.interface && manifest.interface.displayName, "Skill Governance");
  assert(Array.isArray(manifest.interface.defaultPrompt), "defaultPrompt must be an array");
  assert(manifest.interface.defaultPrompt.length <= 3, "defaultPrompt must contain at most 3 entries");

  const marketplace = readJson(marketplacePath);
  const entry = (marketplace.plugins || []).find((plugin) => plugin.name === "skill-governance");
  assert(entry, "marketplace must include skill-governance");
  assert.deepStrictEqual(entry.source, {
    source: "local",
    path: "./plugins/skill-governance"
  });
  assert.strictEqual(entry.policy && entry.policy.installation, "AVAILABLE");
  assert.strictEqual(entry.policy && entry.policy.authentication, "ON_INSTALL");
  assert.strictEqual(entry.category, "Productivity");

  const catalog = readJson(catalogPath);
  const catalogById = new Map((catalog.skills || []).map((skill) => [skill.id, skill]));

  for (const skillId of requiredSkills) {
    const skillRoot = path.join(pluginRoot, "skills", skillId);
    const skillPath = path.join(skillRoot, "SKILL.md");
    assertExists(skillPath, `${skillId} SKILL.md`);
    const catalogEntry = catalogById.get(skillId);
    assert(catalogEntry, `repo-local catalog must include ${skillId}`);
    assert.strictEqual(
      String(catalogEntry.path || "").replace(/\\/g, "/"),
      `plugins/skill-governance/skills/${skillId}/SKILL.md`,
      `${skillId} catalog path must point to the skill-governance plugin skill`
    );
    assert(!fs.existsSync(path.join(activeRepoSkillRoot, skillId)), `${skillId} must not remain as a duplicate active repo-local skill`);
    assertExists(path.join(archivedSkillRoot, skillId, "SKILL.md"), `${skillId} archived repo-local copy`);

    const source = readText(skillPath);
    const frontmatter = parseFrontmatter(source);
    assert.strictEqual(frontmatter.name, skillId, `${skillId} frontmatter name must match directory`);
    assert(frontmatter.description && frontmatter.description.length >= 70, `${skillId} needs a useful trigger description`);
    assert(frontmatter.description.startsWith("Use "), `${skillId} description must front-load the trigger with "Use"`);
    for (const triggerTerm of triggerTermsBySkill[skillId]) {
      assert(
        frontmatter.description.toLowerCase().includes(triggerTerm.toLowerCase()),
        `${skillId} description must include trigger term: ${triggerTerm}`
      );
    }
    assertImplicitPolicy(skillRoot, skillId);
    for (const section of requiredSections) {
      assert(source.includes(section), `${skillId} missing section ${section}`);
    }
  }

  for (const referenceName of requiredReferences) {
    assertExists(path.join(pluginRoot, "references", referenceName), `reference ${referenceName}`);
  }

  assertExists(
    path.join(pluginRoot, "skills", "skill-design-review-codex", "references", "design-rubric.md"),
    "skill-design-review-codex design rubric"
  );
  assertExists(
    path.join(pluginRoot, "skills", "skill-design-review-codex", "scripts", "analyze-skill-design.js"),
    "skill-design-review-codex analyzer"
  );

  console.log("PASS skill_governance_plugin_test");
}

main();
