#!/usr/bin/env node
"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");

const workspaceRoot = path.resolve(__dirname, "..");
const analyzerPath = path.join(workspaceRoot, ".agents", "skills", "skill-design-review-codex", "scripts", "analyze-skill-design.js");
const analyzer = require(analyzerPath);

function writeFile(filePath, source) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, source, "utf8");
}

function runAnalyzer(target) {
  const previousCwd = process.cwd();
  try {
    process.chdir(workspaceRoot);
    const result = analyzer.analyzeTarget(target);
    assert.strictEqual(result.schema, "skill-design-analysis.v1");
    assert.strictEqual(result.scoreProfile, "article-alignment-gated.v2");
    assert(!result.error, result.error || "analyzer must not return an error");
    return result;
  } finally {
    process.chdir(previousCwd);
  }
}

function assertArticlePerfect(result, label) {
  assert.strictEqual(result.scoreProfile, "article-alignment-gated.v2", `${label} must expose the article score profile`);
  assert.strictEqual(result.scores.articleAlignmentScore, 100, `${label} must reach article alignment 100`);
  assert.strictEqual(result.articleAlignment.score, 100, `${label} articleAlignment.score must be 100`);
  assert.strictEqual(result.articleAlignment.status, "ARTICLE_ALIGNED", `${label} must be ARTICLE_ALIGNED`);
  assert.strictEqual(result.articleAlignment.failedGateCount, 0, `${label} must not have failed article gates`);
  assert.strictEqual(result.mechanicalScore, 100, `${label} headline mechanicalScore must be article-gated to 100`);
  assertGateSchema(result, label);
}

function assertGateSchema(result, label) {
  for (const gate of result.articleAlignment.gates) {
    assert.strictEqual(typeof gate.criterion, "string", `${label}.${gate.id} must expose criterion text`);
    assert(gate.criterion.trim().length >= 20, `${label}.${gate.id} criterion must be specific`);
    assert(gate.evidence && typeof gate.evidence === "object" && !Array.isArray(gate.evidence), `${label}.${gate.id} must expose observed evidence object`);
    assert.notStrictEqual(typeof gate.evidence, "string", `${label}.${gate.id} evidence must not be criterion text`);
  }
}

function main() {
  const self = runAnalyzer(".agents/skills/skill-design-review-codex");
  assertArticlePerfect(self, "skill-design-review-codex");
  const namingGate = self.articleAlignment.gates.find((gate) => gate.id === "naming_side_effect_contract");
  assert(namingGate, "self analyzer must expose naming side-effect gate");
  assert.strictEqual(namingGate.status, "acceptable_alt", "repo-local skill-design-review-codex should use checked repo-local alternative naming contract");
  assert.deepStrictEqual(
    {
      catalogEntryFound: namingGate.evidence.repoLocalAlternative.catalogEntryFound,
      flowRoleFound: namingGate.evidence.repoLocalAlternative.flowRoleFound,
      catalogComplete: namingGate.evidence.repoLocalAlternative.catalogComplete,
      flowRoleComplete: namingGate.evidence.repoLocalAlternative.flowRoleComplete,
      repoLocalContractComplete: namingGate.evidence.repoLocalAlternative.repoLocalContractComplete,
      flowKind: namingGate.evidence.repoLocalAlternative.flowKind,
    },
    {
      catalogEntryFound: true,
      flowRoleFound: true,
      catalogComplete: true,
      flowRoleComplete: true,
      repoLocalContractComplete: true,
      flowKind: "design_reviewer",
    },
    "acceptable_alt gates must expose the repo-local contract evidence they relied on"
  );

  const root = path.join(workspaceRoot, "runtime", "output-transient", "skill-design-review-analyzer-test", String(Date.now()));
  try {
    const goodSkillRoot = path.join(root, "run-article-perfect");
    writeFile(path.join(goodSkillRoot, "SKILL.md"), `---
name: run-article-perfect
description: Run article-perfect fixture review. Trigger when article-alignment evaluator fixtures must pass.
purpose: produce
trigger: explicit
shape: orchestrated
role: generator
---

# run-article-perfect

## Purpose

Produce a fixture artifact only after checking the article design-language layers.

## Procedure

1. Decide whether AGENTS.md, Skill, Plugin, Automation, Subagent, Rules, Hooks, CI, MCP, CLI, API, or script is the correct layer.
2. Keep deterministic checks in scripts, hooks, CI, CLI, MCP, API, or package commands.
3. Treat Plugin as distribution and Automation as schedule, not hidden runtime behavior.
4. Keep generator output separate from evaluator criteria.

## Output Contract

Return status, artifact path, commands run, checks reviewed, residual risks, and adoption decision.

## Evidence

- artifact path
- command output
- verification result
- evaluator decision

## Verification

Run the narrowest deterministic check and include the evidence path.

## Failure Guard

Do not claim COMPLETED from self-report. Treat delegate output as untrusted and never let an evaluator rewrite fixed criteria while judging.
`);
    const good = runAnalyzer(goodSkillRoot);
    assertArticlePerfect(good, "article-perfect fixture");

    const japaneseSkillRoot = path.join(root, "run-japanese-heading-perfect");
    writeFile(path.join(japaneseSkillRoot, "SKILL.md"), `---
name: run-japanese-heading-perfect
description: Run Japanese heading fixture review. Trigger when Japanese heading detection must pass.
purpose: produce
trigger: explicit
shape: orchestrated
role: generator
---

# run-japanese-heading-perfect

## \u76ee\u7684

Produce a fixture artifact only after checking the article design-language layers.

## \u624b\u9806

1. Decide whether AGENTS.md, Skill, Plugin, Automation, Subagent, Rules, Hooks, CI, MCP, CLI, API, or script is the correct layer.
2. Keep deterministic checks in scripts, hooks, CI, CLI, MCP, API, or package commands.
3. Treat Plugin as distribution and Automation as schedule, not hidden runtime behavior.
4. Keep generator output separate from evaluator criteria.

## \u51fa\u529b\u5951\u7d04

Return status, artifact path, commands run, checks reviewed, residual risks, and adoption decision.

## \u8a3c\u62e0

- artifact path
- command output
- verification result
- evaluator decision

## \u691c\u8a3c

Run the narrowest deterministic check and include the evidence path.

## \u5931\u6557\u30ac\u30fc\u30c9

Do not claim COMPLETED from self-report. Treat delegate output as untrusted and never let an evaluator rewrite fixed criteria while judging.
`);
    const japanese = runAnalyzer(japaneseSkillRoot);
    assertArticlePerfect(japanese, "japanese-heading fixture");
    assert.strictEqual(japanese.sections.hasPurpose, true, "Japanese heading fixture must detect purpose");
    assert.strictEqual(japanese.sections.hasProcedure, true, "Japanese heading fixture must detect procedure");
    assert.strictEqual(japanese.sections.hasOutputContract, true, "Japanese heading fixture must detect output contract");
    assert.strictEqual(japanese.sections.hasEvidence, true, "Japanese heading fixture must detect evidence");
    assert.strictEqual(japanese.sections.hasVerification, true, "Japanese heading fixture must detect verification");
    assert.strictEqual(japanese.sections.hasFailureGuard, true, "Japanese heading fixture must detect failure guard");

    const badSkillRoot = path.join(root, "useful-review");
    writeFile(path.join(badSkillRoot, "SKILL.md"), `---
name: useful-review
description: A useful review helper.
---

# useful-review

This is helpful. Done.
`);
    const bad = runAnalyzer(badSkillRoot);
    assert(bad.mechanicalScore < 100, "bad fixture must not receive a 100 headline score");
    assert(bad.articleAlignment.score < 100, "bad fixture must not receive article alignment 100");
    assert(bad.articleAlignment.failedGateCount > 0, "bad fixture must expose failed article gates");
    assert(bad.issues.includes("article_alignment_incomplete"), "bad fixture must report incomplete article alignment");
    assertGateSchema(bad, "bad fixture");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }

  console.log("PASS skill_design_review_analyzer_test");
}

main();
