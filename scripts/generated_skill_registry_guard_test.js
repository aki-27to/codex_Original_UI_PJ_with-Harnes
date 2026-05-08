#!/usr/bin/env node
"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");

const { loadGeneratedSkillRegistry } = require("./lib/agi_candidate_runtime");
const { loadRepoLocalSkillCatalog } = require("./lib/long_horizon_continuity");

const workspaceRoot = path.resolve(__dirname, "..");

function writeJson(filePath, payload) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

function writeFile(filePath, source) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, source, "utf8");
}

function makeKnowledgePolicy() {
  return {
    schema: "knowledge-system-policy.v1",
    version: "test",
    rootPath: "logs/archive/raw/knowledge_store",
    indexPath: "logs/archive/raw/knowledge_store/knowledge_index.json",
    archivePath: "logs/archive/raw/knowledge_store/archive/knowledge_archive.jsonl",
    journalPath: "logs/archive/raw/knowledge_store/knowledge_journal.jsonl",
    retrievalEvalHistoryPath: "logs/archive/raw/knowledge_store/retrieval_eval_history.jsonl",
    generatedSkillRegistryPath: "scripts/config/generated_skill_registry.json",
    generatedSkillsRoot: ".agents/skills/generated",
    generatedSkillArchivePath: "logs/archive/raw/knowledge_store/archive/generated_skill_archive.jsonl",
  };
}

function makeRegistryFixture(root) {
  writeJson(path.join(root, "scripts/config/knowledge_system_policy.json"), makeKnowledgePolicy());
  writeJson(path.join(root, "scripts/config/repo_local_skill_catalog.json"), {
    schema: "repo-local-skill-catalog.v1",
    version: "test",
    skillsRoot: ".agents/skills",
    skills: [],
  });

  writeFile(path.join(root, ".agents/skills/generated/active-generated/SKILL.md"), "# active\n");
  writeFile(path.join(root, ".agents/skills/generated/stale-generated/SKILL.md"), "# stale\n");
  writeFile(path.join(root, ".agents/old-skills/generated/archived-old/SKILL.md"), "# archived\n");
  writeFile(path.join(root, ".agents/skills/not-generated/outside/SKILL.md"), "# outside\n");

  writeJson(path.join(root, "scripts/config/generated_skill_registry.json"), {
    schema: "generated-skill-registry.v1",
    generatedAt: "2026-05-07T00:00:00.000Z",
    skills: [
      {
        id: "active-generated",
        title: "Active Generated",
        description: "Callable generated skill.",
        trigger: "active trigger",
        path: ".agents/skills/generated/active-generated/SKILL.md",
        tests: ["active test"],
        stale: 0,
      },
      {
        id: "stale-generated",
        title: "Stale Generated",
        description: "Stale generated skill.",
        trigger: "stale trigger",
        path: ".agents/skills/generated/stale-generated/SKILL.md",
        tests: ["stale test"],
        stale: 1,
      },
      {
        id: "archived-old",
        title: "Archived Old",
        description: "Archived old skill.",
        trigger: "archive trigger",
        path: ".agents/old-skills/generated/archived-old/SKILL.md",
        tests: ["archive test"],
        stale: 0,
      },
      {
        id: "missing-generated",
        title: "Missing Generated",
        description: "Missing generated skill.",
        trigger: "missing trigger",
        path: ".agents/skills/generated/missing-generated/SKILL.md",
        tests: ["missing test"],
        stale: 0,
      },
      {
        id: "outside-generated-root",
        title: "Outside Generated Root",
        description: "Outside generated root.",
        trigger: "outside trigger",
        path: ".agents/skills/not-generated/outside/SKILL.md",
        tests: ["outside test"],
        stale: 0,
      },
    ],
  });
}

function assertNoInactiveGeneratedSkill(entries, context) {
  for (const entry of entries) {
    const entryPath = String(entry && entry.path || "").replace(/\\/g, "/");
    assert(!entryPath.includes(".agents/old-skills/"), `${context} must not expose archived old-skills entry: ${entryPath}`);
    assert.notStrictEqual(Number(entry && entry.stale), 1, `${context} must not expose stale generated skill: ${entry && entry.id}`);
  }
}

function testCurrentRepoRegistryIsFiltered() {
  const registry = loadGeneratedSkillRegistry({ workspaceRoot });
  assertNoInactiveGeneratedSkill(registry.skills, "current generated registry");
}

function testGeneratedRegistryFiltersInactiveEntries() {
  const root = path.join(workspaceRoot, "runtime/output-transient/generated-skill-registry-guard-test", String(Date.now()));
  makeRegistryFixture(root);
  try {
    const activeRegistry = loadGeneratedSkillRegistry({ workspaceRoot: root });
    assert.deepStrictEqual(activeRegistry.skills.map((entry) => entry.id), ["active-generated"]);
    assertNoInactiveGeneratedSkill(activeRegistry.skills, "fixture generated registry");

    const rawRegistry = loadGeneratedSkillRegistry({ workspaceRoot: root }, { includeInactive: true });
    assert.strictEqual(rawRegistry.skills.length, 5, "maintenance callers must still be able to inspect inactive registry entries");

    const mergedCatalog = loadRepoLocalSkillCatalog(path.join(root, "scripts/config/repo_local_skill_catalog.json"), { workspaceRoot: root });
    assert.deepStrictEqual(mergedCatalog.skills.map((entry) => entry.id), ["active-generated"]);
    assertNoInactiveGeneratedSkill(mergedCatalog.skills, "merged repo-local skill catalog");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

function main() {
  testCurrentRepoRegistryIsFiltered();
  testGeneratedRegistryFiltersInactiveEntries();
  console.log("PASS generated_skill_registry_guard_test");
}

main();
