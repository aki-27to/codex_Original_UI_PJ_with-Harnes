#!/usr/bin/env node
"use strict";

const assert = require("assert");
const {
  buildOutcomeStats,
  evaluateSkillPortfolio,
  loadSkillCatalog,
  loadSkillPortfolioPolicy,
} = require("./lib/skill_portfolio_policy");

function deepClone(value) {
  return JSON.parse(JSON.stringify(value));
}

function testDefaultPortfolioPasses() {
  const report = evaluateSkillPortfolio();
  assert.strictEqual(report.status, "PASS", "default portfolio should pass");
  assert.ok(report.portfolio.activeClassCount >= 3, "default portfolio should keep class diversity >= 3");
}

function testStitchSkillAssignedToParentRoles() {
  const catalog = loadSkillCatalog();
  assert.ok(
    Array.isArray(catalog.assignments.default) && catalog.assignments.default.includes("web-designer-master"),
    "default should carry web-designer-master so parent intake can answer Stitch-first UI requests"
  );
  assert.ok(
    Array.isArray(catalog.assignments.intake) && catalog.assignments.intake.includes("web-designer-master"),
    "intake should carry web-designer-master so Step 1 can inspect Stitch-backed UI requests"
  );
}

function testRoleRequirementFailure() {
  const policy = deepClone(loadSkillPortfolioPolicy());
  const catalog = deepClone(loadSkillCatalog());
  catalog.assignments.release_manager = ["openai-docs", "release-evidence-gate"];
  const report = evaluateSkillPortfolio({ policy, catalog });
  const hasRoleRequirementIssue = report.issues.some(
    (issue) => issue.type === "role_requirement" && issue.role === "release_manager"
  );
  assert.strictEqual(hasRoleRequirementIssue, true, "release_manager should fail role requirement when scenario class is missing");
}

function testPromotionCandidateScenarioToRole() {
  const outcomeEvents = [
    { skill: "ui-regression-diff", success: true, primaryScore: 0.89, guardPass: true },
    { skill: "ui-regression-diff", success: true, primaryScore: 0.90, guardPass: true },
    { skill: "ui-regression-diff", success: true, primaryScore: 0.88, guardPass: true },
    { skill: "ui-regression-diff", success: true, primaryScore: 0.87, guardPass: true },
    { skill: "ui-regression-diff", success: true, primaryScore: 0.91, guardPass: true },
    { skill: "ui-regression-diff", success: true, primaryScore: 0.90, guardPass: true },
  ];
  const report = evaluateSkillPortfolio({ outcomeEvents });
  const candidate = report.promotionCandidates.find(
    (entry) => entry.skill === "ui-regression-diff" && entry.fromClass === "scenario" && entry.toClass === "role"
  );
  assert.ok(candidate, "ui-regression-diff should be eligible for scenario->role promotion");
}

function testGuardFailureBlocksPromotion() {
  const outcomeEvents = [
    { skill: "spec-sync-assistant", success: true, primaryScore: 0.95, guardPass: false },
    { skill: "spec-sync-assistant", success: true, primaryScore: 0.94, guardPass: true },
    { skill: "spec-sync-assistant", success: true, primaryScore: 0.95, guardPass: true },
    { skill: "spec-sync-assistant", success: true, primaryScore: 0.94, guardPass: true },
    { skill: "spec-sync-assistant", success: true, primaryScore: 0.95, guardPass: true },
    { skill: "spec-sync-assistant", success: true, primaryScore: 0.94, guardPass: true },
    { skill: "spec-sync-assistant", success: true, primaryScore: 0.95, guardPass: true },
    { skill: "spec-sync-assistant", success: true, primaryScore: 0.94, guardPass: true },
    { skill: "spec-sync-assistant", success: true, primaryScore: 0.95, guardPass: true },
    { skill: "spec-sync-assistant", success: true, primaryScore: 0.94, guardPass: true },
    { skill: "spec-sync-assistant", success: true, primaryScore: 0.95, guardPass: true },
    { skill: "spec-sync-assistant", success: true, primaryScore: 0.94, guardPass: true },
  ];
  const report = evaluateSkillPortfolio({ outcomeEvents });
  const candidate = report.promotionCandidates.find(
    (entry) => entry.skill === "spec-sync-assistant" && entry.fromClass === "role" && entry.toClass === "global"
  );
  assert.strictEqual(Boolean(candidate), false, "guard failure should block promotion candidate");
}

function testOutcomeAggregation() {
  const stats = buildOutcomeStats([
    { skill: "a", success: true, primaryScore: 1, guardPass: true },
    { skill: "a", success: false, primaryScore: 0.2, guardPass: false },
  ]);
  assert.ok(stats.a, "stats should include skill bucket");
  assert.strictEqual(stats.a.runs, 2, "runs should be aggregated");
  assert.strictEqual(stats.a.successes, 1, "successes should be aggregated");
  assert.strictEqual(stats.a.guardFailures, 1, "guard failures should be aggregated");
}

function run() {
  const tests = [
    ["default portfolio pass", testDefaultPortfolioPasses],
    ["stitch skill assigned to parent roles", testStitchSkillAssignedToParentRoles],
    ["role requirement failure", testRoleRequirementFailure],
    ["promotion scenario to role", testPromotionCandidateScenarioToRole],
    ["guard failure blocks promotion", testGuardFailureBlocksPromotion],
    ["outcome aggregation", testOutcomeAggregation],
  ];

  let pass = 0;
  for (const [name, testFn] of tests) {
    testFn();
    pass += 1;
    console.log(`[skill-portfolio-policy-test] PASS ${name}`);
  }
  console.log(`[skill-portfolio-policy-test] total=${tests.length} pass=${pass} fail=0`);
  console.log("PASS");
}

try {
  run();
} catch (error) {
  console.log(`[skill-portfolio-policy-test] FAIL ${error instanceof Error ? error.message : String(error)}`);
  console.log("FAIL");
  process.exitCode = 1;
}
