#!/usr/bin/env node
"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");

const workspaceRoot = path.resolve(__dirname, "..");
const contractPath = path.join(workspaceRoot, "scripts", "config", "skill_flow_contract.json");
const catalogPath = path.join(workspaceRoot, "scripts", "config", "repo_local_skill_catalog.json");

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function unique(values) {
  return Array.from(new Set(values));
}

function assertStringArray(value, label, { allowEmpty = false } = {}) {
  assert(Array.isArray(value), `${label} must be an array`);
  if (!allowEmpty) assert(value.length > 0, `${label} must not be empty`);
  for (const entry of value) {
    assert.strictEqual(typeof entry, "string", `${label} entries must be strings`);
    assert(entry.trim(), `${label} entries must not be blank`);
  }
}

function collectReferencedSkillIds(contract) {
  const ids = [];
  for (const skillId of Object.keys(contract.skillRoles || {})) ids.push(skillId);
  for (const flow of contract.flows || []) {
    ids.push(...(flow.entrySkills || []));
    ids.push(...(flow.terminalSkills || []));
    for (const transition of flow.transitions || []) {
      ids.push(transition.from, transition.to);
    }
    for (const edge of flow.forbiddenDirectNext || []) {
      ids.push(edge.from, edge.to);
    }
    for (const edge of flow.requiredEvidenceBeforeNext || []) {
      ids.push(edge.from, edge.to);
    }
  }
  for (const entry of contract.standaloneOrSupport || []) ids.push(entry.id);
  for (const edge of contract.globalForbiddenDirectNext || []) {
    ids.push(edge.from, edge.to);
  }
  return unique(ids.filter(Boolean));
}

function transitionKey(edge) {
  return `${edge.from}->${edge.to}`;
}

function assertTransitionPresent(edges, from, to, label) {
  assert(
    edges.has(`${from}->${to}`),
    `${label} must include ${from}->${to}`
  );
}

function main() {
  const contract = readJson(contractPath);
  const catalog = readJson(catalogPath);
  assert.strictEqual(contract.schema, "skill-flow-contract.v1");
  assert.strictEqual(contract.catalogRef, "scripts/config/repo_local_skill_catalog.json");
  assert.strictEqual(contract.principles.skillsDoNotAutoInvokeSkills, true);
  assert.strictEqual(contract.principles.parentSelectsNextSkill, true);
  assert.strictEqual(contract.principles.smallTasksMayUseNoSkill, true);
  assert.strictEqual(contract.principles.standaloneSkillsDoNotNeedForcedFlow, true);

  const catalogIds = (catalog.skills || []).map((entry) => entry.id).sort();
  assert(catalogIds.length > 0, "repo-local skill catalog must not be empty");

  const roleIds = Object.keys(contract.skillRoles || {}).sort();
  assert.deepStrictEqual(roleIds, catalogIds, "skill_flow_contract.skillRoles must cover every active repo-local skill exactly");

  const allowedKinds = new Set([
    "entry_contributor",
    "specialist_reviewer",
    "implementation_guard",
    "verification_contributor",
    "support",
    "adoption_reviewer",
    "learning_contributor",
    "governance_reviewer",
    "authoring_entry",
    "design_reviewer",
    "diagnostic_reviewer",
    "diagnostic_entry",
    "principle_reviewer",
    "blocker_debugger",
    "closeout_reviewer",
    "handoff_contributor"
  ]);
  for (const [skillId, role] of Object.entries(contract.skillRoles)) {
    assert(allowedKinds.has(role.kind), `${skillId} has unsupported flow role kind: ${role.kind}`);
    assert.strictEqual(typeof role.primaryResponsibility, "string", `${skillId} must define primaryResponsibility`);
    assert(role.primaryResponsibility.length >= 40, `${skillId}.primaryResponsibility must be specific`);
    assert.strictEqual(typeof role.canStartFlow, "boolean", `${skillId}.canStartFlow must be boolean`);
    assert.strictEqual(typeof role.canEndFlow, "boolean", `${skillId}.canEndFlow must be boolean`);
  }

  const catalogIdSet = new Set(catalogIds);
  for (const skillId of collectReferencedSkillIds(contract)) {
    assert(catalogIdSet.has(skillId), `skill flow references unknown skill: ${skillId}`);
  }

  const flowIds = new Set();
  const transitionKeys = new Set();
  for (const flow of contract.flows || []) {
    assert(flow.id, "flow.id is required");
    assert(!flowIds.has(flow.id), `duplicate flow id: ${flow.id}`);
    flowIds.add(flow.id);
    assert.strictEqual(flow.parentSelectionRequired, true, `${flow.id} must require parent selection`);
    assert.strictEqual(flow.autoInvokeNext, false, `${flow.id} must not auto-invoke the next skill`);
    assertStringArray(flow.entrySkills, `${flow.id}.entrySkills`);
    assertStringArray(flow.terminalSkills, `${flow.id}.terminalSkills`);
    assert(Array.isArray(flow.transitions), `${flow.id}.transitions must be an array`);
    for (const transition of flow.transitions) {
      assert(transition.from && transition.to, `${flow.id} transition must define from and to`);
      assert.notStrictEqual(transition.from, transition.to, `${flow.id} must not contain self-transition ${transition.from}`);
      assert(transition.condition && String(transition.condition).length >= 20, `${flow.id} transition ${transitionKey(transition)} needs a concrete condition`);
      transitionKeys.add(transitionKey(transition));
    }
    for (const edge of flow.forbiddenDirectNext || []) {
      assert(edge.from && edge.to, `${flow.id}.forbiddenDirectNext entries need from and to`);
      assert(edge.reason && String(edge.reason).length >= 20, `${flow.id} forbidden edge ${transitionKey(edge)} needs a reason`);
      assert(!transitionKeys.has(transitionKey(edge)), `${flow.id} transition violates forbidden edge ${transitionKey(edge)}`);
    }
    for (const edge of flow.requiredEvidenceBeforeNext || []) {
      assert(edge.from && edge.to, `${flow.id}.requiredEvidenceBeforeNext entries need from and to`);
      assertStringArray(edge.evidence, `${flow.id}.requiredEvidenceBeforeNext ${transitionKey(edge)} evidence`);
    }
  }

  assert(flowIds.has("feedback-recurrence-learning"), "feedback recurrence flow must exist");
  assert(flowIds.has("ui-acceptance"), "UI acceptance flow must exist");
  assert(flowIds.has("code-change"), "code change flow must exist");
  assert(flowIds.has("skill-lifecycle"), "skill lifecycle flow must exist");
  assert(flowIds.has("diagnostic-review"), "diagnostic review flow must exist");
  assert(flowIds.has("long-run-closeout"), "long-run closeout flow must exist");

  const globalForbidden = new Set((contract.globalForbiddenDirectNext || []).map(transitionKey));
  assertTransitionPresent(
    globalForbidden,
    "feedback-to-recurrence-patch",
    "skill-promotion-governance",
    "global forbidden direct transitions"
  );
  assertTransitionPresent(
    globalForbidden,
    "skill-creator-master",
    "skill-promotion-governance",
    "global forbidden direct transitions"
  );
  assertTransitionPresent(
    globalForbidden,
    "web-ui-acceptance-review",
    "skill-promotion-governance",
    "global forbidden direct transitions"
  );
  for (const key of globalForbidden) {
    assert(!transitionKeys.has(key), `global forbidden direct edge is present as a transition: ${key}`);
  }

  const standaloneIds = unique((contract.standaloneOrSupport || []).map((entry) => entry.id));
  assert(standaloneIds.includes("browser-flakiness-recovery"), "browser-flakiness-recovery must be modeled as support/standalone");
  assert(standaloneIds.includes("not-yet-root-cause-debugger"), "not-yet-root-cause-debugger must be modeled as support/standalone");

  console.log("PASS skill_flow_contract_test");
}

main();
