#!/usr/bin/env node
"use strict";

const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const {
  buildOutcomeStats,
  evaluateSkillPortfolio,
  loadSkillCatalog,
  loadSkillPortfolioPolicy,
  parseOutcomeEventsFromJsonl,
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

function testSkillCreationRoutingPrefersMaster() {
  const catalog = loadSkillCatalog();
  const defaultAssignments = Array.isArray(catalog.assignments.default) ? catalog.assignments.default : [];
  const masterIndex = defaultAssignments.indexOf("skill-creator-master");
  const officialIndex = defaultAssignments.indexOf("skill-creator");
  assert.ok(masterIndex >= 0, "default role must include skill-creator-master for skill package create/update requests");
  assert.ok(officialIndex >= 0, "default role must keep official skill-creator available as fallback/reference");
  assert.ok(
    masterIndex < officialIndex,
    "skill-creator-master must be routed before official skill-creator for Harnes repo-local skill creation"
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

function testMissingOutcomeLogKeepsMaturitySeparate() {
  const missingPath = path.join(os.tmpdir(), `missing-skill-outcomes-${Date.now()}.jsonl`);
  const outcomeInfo = parseOutcomeEventsFromJsonl(missingPath);
  assert.strictEqual(outcomeInfo.source, "missing", "missing outcome file should be reported as missing");
  assert.strictEqual(outcomeInfo.events.length, 0, "missing outcome file must not synthesize events");
  const report = evaluateSkillPortfolio({ outcomeEvents: outcomeInfo.events });
  assert.strictEqual(report.status, "PASS", "missing outcome events must not fail structural portfolio audit");
  assert.strictEqual(report.operationalMaturity.scoreProfile, "operational_maturity");
  assert.strictEqual(report.operationalMaturity.summary.loggedSkillCount, 0, "missing logs should produce zero logged skills");
  assert.strictEqual(
    report.operationalMaturity.bySkill["openai-docs"].dimensions.usage_maturity.status,
    "no_data",
    "usage maturity should stay no_data without actual events"
  );
  assert.strictEqual(
    report.operationalMaturity.bySkill["openai-docs"].dimensions.distribution_maturity.status,
    "not_applicable",
    "distribution maturity should be not_applicable unless distribution is required"
  );
}

function testActualOutcomeLogBuildsOperationalMaturity() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "skill-outcomes-"));
  const outcomesPath = path.join(tmpDir, "skill_outcomes.jsonl");
  const events = [1, 2, 3].map((index) => ({
    schema: "skill-outcome-event.v1",
    eventType: "actual_skill_use",
    timestamp: `2026-05-09T00:0${index}:00.000Z`,
    skill: "openai-docs",
    taskRef: `test-task-${index}`,
    selectedBy: "parent",
    trigger: "official OpenAI docs lookup",
    result: "pass",
    primaryScore: 0.92,
    guardPass: true,
    evidence: {
      artifacts: [`reports/openai-docs-${index}.md`],
      commands: ["node scripts/skill_portfolio_policy_test.js"],
      verification: [`verification-${index}`],
      decisions: [`decision-${index}`],
      userFeedback: [],
      rollbackRefs: [],
      promotionRefs: [],
      automationRefs: [],
      distributionRefs: []
    }
  }));
  fs.writeFileSync(outcomesPath, `${events.map((entry) => JSON.stringify(entry)).join("\n")}\n`, "utf8");
  const outcomeInfo = parseOutcomeEventsFromJsonl(outcomesPath);
  assert.strictEqual(outcomeInfo.source, "file", "fixture outcome log should be read from file");
  assert.strictEqual(outcomeInfo.parseErrors.length, 0, "valid actual-use events must parse cleanly");
  assert.strictEqual(outcomeInfo.events.length, 3, "valid actual-use events should not be dropped");
  const report = evaluateSkillPortfolio({ outcomeEvents: outcomeInfo.events });
  const maturity = report.operationalMaturity.bySkill["openai-docs"];
  assert.strictEqual(maturity.dimensions.usage_maturity.status, "practiced", "three successful actual runs should be practiced usage");
  assert.strictEqual(maturity.dimensions.evidence_maturity.status, "evidence_observed", "artifact and verification refs should count as evidence maturity");
  assert.strictEqual(maturity.dimensions.automation_maturity.status, "not_applicable", "automation must not be required by default");
  assert.strictEqual(maturity.dimensions.distribution_maturity.status, "not_applicable", "Plugin/package distribution must not be required by default");
}

function testOutcomeLogRejectsSyntheticRows() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "skill-outcomes-invalid-"));
  const outcomesPath = path.join(tmpDir, "skill_outcomes.jsonl");
  fs.writeFileSync(outcomesPath, `${JSON.stringify({
    schema: "skill-outcome-event.v1",
    eventType: "sample_success",
    timestamp: "2026-05-09T00:00:00.000Z",
    skill: "openai-docs",
    taskRef: "synthetic-example",
    selectedBy: "parent",
    result: "pass",
    primaryScore: 1,
    guardPass: true,
    evidence: {
      artifacts: ["fake.md"],
      verification: ["fake"]
    }
  })}\n`, "utf8");
  const outcomeInfo = parseOutcomeEventsFromJsonl(outcomesPath);
  assert.strictEqual(outcomeInfo.events.length, 0, "synthetic rows must not become maturity evidence");
  assert.ok(
    outcomeInfo.parseErrors.some((entry) => entry.includes("invalid_event_type")),
    "synthetic rows should fail event_type validation"
  );
}

function run() {
  const tests = [
    ["default portfolio pass", testDefaultPortfolioPasses],
    ["stitch skill assigned to parent roles", testStitchSkillAssignedToParentRoles],
    ["skill creation routing prefers master", testSkillCreationRoutingPrefersMaster],
    ["role requirement failure", testRoleRequirementFailure],
    ["promotion scenario to role", testPromotionCandidateScenarioToRole],
    ["guard failure blocks promotion", testGuardFailureBlocksPromotion],
    ["outcome aggregation", testOutcomeAggregation],
    ["missing outcome log maturity separation", testMissingOutcomeLogKeepsMaturitySeparate],
    ["actual outcome log operational maturity", testActualOutcomeLogBuildsOperationalMaturity],
    ["outcome log rejects synthetic rows", testOutcomeLogRejectsSyntheticRows],
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
