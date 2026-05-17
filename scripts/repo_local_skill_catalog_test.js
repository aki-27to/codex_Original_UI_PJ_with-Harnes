#!/usr/bin/env node
"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");

const workspaceRoot = path.resolve(__dirname, "..");
const catalogPath = path.join(workspaceRoot, "scripts", "config", "repo_local_skill_catalog.json");
const catalog = JSON.parse(fs.readFileSync(catalogPath, "utf8"));

const requiredSkillIds = [
  "worker-decision-review",
  "artifact-improvement-learning",
  "repo-truth-audit",
  "not-yet-root-cause-debugger",
  "web-ui-acceptance-review",
  "browser-flakiness-recovery",
  "safe-refactor-with-proof",
  "skill-promotion-governance",
  "skill-creator-master"
];

const proofCloseoutSkillIds = new Set([
  "code-change-verification",
  "safe-refactor-with-proof",
  "repo-truth-audit",
  "worker-decision-review",
  "long-run-session-closeout",
  "handoff-artifact-generation"
]);

const skillGovernanceSkillIds = new Set([
  "skill-creator-master",
  "skill-design-review-codex",
  "skill-promotion-governance",
  "artifact-improvement-learning",
  "feedback-to-recurrence-patch"
]);

const canonicalRepoRoot = ".agents/skills/";
const archivedRoot = ".agents/old-skills/";

function expectedPluginRoot(skillId) {
  if (proofCloseoutSkillIds.has(skillId)) return "plugins/proof-closeout/skills/";
  if (skillGovernanceSkillIds.has(skillId)) return "plugins/skill-governance/skills/";
  return "";
}

function repoPath(value) {
  return String(value || "").replace(/\\/g, "/");
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

function assertStringArray(entry, key) {
  assert(Array.isArray(entry[key]), `${entry.id} must define ${key}`);
  assert(entry[key].length > 0, `${entry.id}.${key} must not be empty`);
  for (const value of entry[key]) {
    assert.strictEqual(typeof value, "string", `${entry.id}.${key} entries must be strings`);
    assert(value.trim(), `${entry.id}.${key} entries must not be blank`);
  }
}

function main() {
  assert.strictEqual(catalog.schema, "repo-local-skill-catalog.v1");
  assert(Array.isArray(catalog.skills), "catalog.skills must be an array");
  assert.strictEqual(catalog.skillsRoot, ".agents/skills", "catalog.skillsRoot must be the canonical repo skill root");
  assert(!Object.prototype.hasOwnProperty.call(catalog, "additionalSkillsRoots"), "catalog must not depend on fallback skill roots");

  const byId = new Map(catalog.skills.map((entry) => [entry.id, entry]));
  for (const skillId of requiredSkillIds) {
    assert(byId.has(skillId), `missing repo-local skill ${skillId}`);
  }

  for (const entry of catalog.skills) {
    assert(entry.id, "skill id is required");
    const normalizedPath = repoPath(entry.path);
    const pluginRoot = expectedPluginRoot(entry.id);
    if (pluginRoot) {
      assert(
        normalizedPath.startsWith(`${pluginRoot}${entry.id}/`),
        `${entry.id} path must point to the expected plugin skill root`
      );
      const activeDuplicatePath = path.join(workspaceRoot, canonicalRepoRoot, entry.id);
      assert(!fs.existsSync(activeDuplicatePath), `${entry.id} must not remain callable under ${canonicalRepoRoot}`);
      const archivedPath = path.join(workspaceRoot, archivedRoot, entry.id, "SKILL.md");
      assert(fs.existsSync(archivedPath), `${entry.id} archived copy is missing at ${archivedRoot}${entry.id}/SKILL.md`);
    } else {
      assert(normalizedPath.startsWith(canonicalRepoRoot), `${entry.id} path must stay under the canonical repo-local skill root`);
    }
    assert(normalizedPath.endsWith("/SKILL.md"), `${entry.id} path must point to SKILL.md`);
    const absolutePath = path.join(workspaceRoot, entry.path);
    assert(fs.existsSync(absolutePath), `${entry.id} SKILL.md is missing at ${entry.path}`);

    const frontmatter = parseFrontmatter(fs.readFileSync(absolutePath, "utf8"));
    assert.strictEqual(frontmatter.name, entry.id, `${entry.id} frontmatter name must match catalog id`);
    assert(frontmatter.description && frontmatter.description.length >= 40, `${entry.id} needs useful trigger description`);

    assertStringArray(entry, "useWhen");
    assertStringArray(entry, "avoidWhen");
    assertStringArray(entry, "expectedArtifacts");
    assertStringArray(entry, "evidenceSurfaces");
    assertStringArray(entry, "workerDecisionConnection");
    assertStringArray(entry, "promotionCriteria");
    assertStringArray(entry, "rollbackCriteria");
  }

  console.log("PASS repo_local_skill_catalog_test");
}

main();
