#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");

const workspaceRoot = path.resolve(__dirname, "..");
const phaseId = "requirement_foundation_v1";
const phaseName = "Requirement-Driven Foundation V1";
const auditCommand = "node scripts/phase_exit_requirement_foundation_v1.js";
const outputDirDefault = path.join(workspaceRoot, "output");
const jsonReportPathDefault = path.join(outputDirDefault, "phase_exit_requirement_foundation_v1.json");
const markdownReportPathDefault = path.join(outputDirDefault, "phase_exit_requirement_foundation_v1.md");

function readText(relativePath) {
  return fs.readFileSync(path.join(workspaceRoot, relativePath), "utf8");
}

function readJson(relativePath) {
  return JSON.parse(readText(relativePath));
}

function repoRelative(targetPath) {
  return path.relative(workspaceRoot, targetPath).replace(/\\/g, "/");
}

function ensureDir(targetPath) {
  fs.mkdirSync(targetPath, { recursive: true });
}

function writeJson(targetPath, value) {
  ensureDir(path.dirname(targetPath));
  fs.writeFileSync(targetPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function writeText(targetPath, value) {
  ensureDir(path.dirname(targetPath));
  fs.writeFileSync(targetPath, value, "utf8");
}

function lineNumberForIndex(source, index) {
  return source.slice(0, Math.max(0, index)).split(/\r?\n/).length;
}

function snippetForMatch(matchValue) {
  return String(matchValue || "").replace(/\s+/g, " ").trim().slice(0, 240);
}

function findRegexEvidence(relativePath, regex, label) {
  const source = readText(relativePath);
  const expression = new RegExp(regex.source, regex.flags.replace(/g/g, ""));
  const match = expression.exec(source);
  if (!match) {
    return {
      ok: false,
      message: `${label} was not found in ${relativePath}.`,
      evidence: [],
    };
  }
  const line = lineNumberForIndex(source, match.index);
  return {
    ok: true,
    message: `${label} found in ${relativePath}:${line}.`,
    evidence: [
      {
        sourceType: "file",
        path: relativePath,
        line,
        excerpt: snippetForMatch(match[0]),
      },
    ],
  };
}

function pushFailure(failures, text) {
  if (text) {
    failures.push(text);
  }
}

function mergeEvidence(results) {
  return results.flatMap((entry) => Array.isArray(entry && entry.evidence) ? entry.evidence : []);
}

function buildCheckResult({ id, title, failures, evidence, detail }) {
  return {
    id,
    title,
    status: failures.length ? "FAIL" : "PASS",
    detail: detail || (failures.length ? failures.join(" ") : "All required evidence was found."),
    failures,
    evidence,
  };
}

function checkA() {
  const failures = [];
  const docs = findRegexEvidence(
    "docs/CURRENT_ARCHITECTURE.md",
    /Requirement Lock.+single-card.+AIの方針/s,
    "single-card Requirement Lock architecture note"
  );
  const appTitle = findRegexEvidence(
    "web/01.HarnesUI/app.js",
    /title:"AIの方針"/,
    "single-card Requirement Lock title"
  );
  const appRows = findRegexEvidence(
    "web/01.HarnesUI/app.js",
    /label:"進め方"[\s\S]*label:snapshot\.contractStatus==="BLOCKED"\?"止まる理由":"補足"[\s\S]*label:"守る線"/,
    "contract-driven single-card UI rows"
  );
  const test = findRegexEvidence(
    "scripts/harnesui_requirement_summary_test.js",
    /assert\.strictEqual\(progressGroups\[0\]\.title,\s*"AIの方針"[\s\S]*assertRowLabel\(progressGroups\[0\]\.rows,\s*"進め方"[\s\S]*assertRowLabel\(blockedGroups\[0\]\.rows,\s*"止まる理由"[\s\S]*assertRowLabel\(blockedGroups\[0\]\.rows,\s*"守る線"/,
    "single-card Requirement Lock regression"
  );
  pushFailure(failures, docs.ok ? "" : docs.message);
  pushFailure(failures, appTitle.ok ? "" : appTitle.message);
  pushFailure(failures, appRows.ok ? "" : appRows.message);
  pushFailure(failures, test.ok ? "" : test.message);
  return buildCheckResult({
    id: "A",
    title: "Requirement Lock is contract-driven single-card",
    failures,
    evidence: mergeEvidence([docs, appTitle, appRows, test]),
  });
}

function checkB() {
  const schema = readJson("scripts/config/requirement_contract.schema.json");
  const required = Array.isArray(schema.required) ? schema.required : [];
  const properties = schema.properties && typeof schema.properties === "object" ? schema.properties : {};
  const missing = ["lockedGoal", "intentHypotheses", "questionPlan", "delightPlan", "displayContract"].filter((key) => !required.includes(key));
  const failures = [];
  if (properties.schema && properties.schema.const !== "requirement-contract.v5") {
    failures.push("requirement contract schema is not pinned to requirement-contract.v5.");
  }
  if (missing.length) {
    failures.push(`requirement-contract.v5 is missing required fields: ${missing.join(", ")}.`);
  }
  return buildCheckResult({
    id: "B",
    title: "requirement-contract.v5 carries the V1 Step 1 contract fields",
    failures,
    evidence: [
      {
        sourceType: "schema",
        path: "scripts/config/requirement_contract.schema.json",
        excerpt: `schema=${properties.schema && properties.schema.const ? properties.schema.const : "missing"} required=${["lockedGoal", "intentHypotheses", "questionPlan", "delightPlan", "displayContract"].join(", ")}`,
      },
    ],
  });
}

function checkC() {
  const failures = [];
  const schema = readJson("scripts/config/requirement_contract.schema.json");
  const requestCoverage = schema.properties && schema.properties.requestCoverage && schema.properties.requestCoverage.properties
    ? schema.properties.requestCoverage
    : schema.$defs && schema.$defs.requestCoverage
      ? schema.$defs.requestCoverage
      : null;
  const required = requestCoverage && Array.isArray(requestCoverage.required) ? requestCoverage.required : [];
  const missing = ["rawRequestClauses", "coreObligations", "parkedItems", "droppedItems"].filter((key) => !required.includes(key));
  if (missing.length) {
    failures.push(`requestCoverage schema is missing required fields: ${missing.join(", ")}.`);
  }
  const docs = findRegexEvidence(
    "docs/CURRENT_ARCHITECTURE.md",
    /re-parses the sanitized user prompt directly for clause seeding instead of backfilling from the requirement contract/i,
    "prompt-derived requestCoverage architecture note"
  );
  const test = findRegexEvidence(
    "scripts/planning_mode_policy_test.js",
    /requestCoverage\.rawRequestClauses[\s\S]*requestCoverage\.coreObligations[\s\S]*requestCoverage\.mappedRequirements[\s\S]*droppedItems/s,
    "requestCoverage regression coverage"
  );
  pushFailure(failures, docs.ok ? "" : docs.message);
  pushFailure(failures, test.ok ? "" : test.message);
  return buildCheckResult({
    id: "C",
    title: "requestCoverage is prompt-derived and carries core / parked / dropped lanes",
    failures,
    evidence: [
      ...mergeEvidence([docs, test]),
      {
        sourceType: "schema",
        path: "scripts/config/requirement_contract.schema.json",
        excerpt: `requestCoverage.required=${required.join(", ")}`,
      },
    ],
  });
}

function checkD() {
  const failures = [];
  const runtime = findRegexEvidence(
    "scripts/lib/planning_mode_policy.js",
    /"request_coverage_core_mapped"[\s\S]*requestCoverage\.coverageSummary\.coreUnmapped > 0 \? "BLOCK" : "PASS"/,
    "runtime unmapped-core coverage gate"
  );
  const test = findRegexEvidence(
    "scripts/planning_mode_policy_test.js",
    /entry\.id === "request_coverage_core_mapped" && entry\.status === "BLOCK"/,
    "unmapped core clause regression"
  );
  pushFailure(failures, runtime.ok ? "" : runtime.message);
  pushFailure(failures, test.ok ? "" : test.message);
  return buildCheckResult({
    id: "D",
    title: "Unmapped core clauses are blocked",
    failures,
    evidence: mergeEvidence([runtime, test]),
  });
}

function checkE() {
  const failures = [];
  const schema = readJson("scripts/config/dispatch_plan.schema.json");
  const dispatchSchema = schema.properties && schema.properties.dispatches && schema.properties.dispatches.items
    ? schema.properties.dispatches.items
    : null;
  const required = dispatchSchema && Array.isArray(dispatchSchema.required) ? dispatchSchema.required : [];
  const missing = ["requestClauseRefs", "requirementRefs", "acceptanceCheckRefs"].filter((key) => !required.includes(key));
  if (missing.length) {
    failures.push(`dispatch-plan.v2 is missing trace refs: ${missing.join(", ")}.`);
  }
  const planningTest = findRegexEvidence(
    "scripts/planning_mode_policy_test.js",
    /dispatchPlan\.dispatches\[0\]\.requestClauseRefs[\s\S]*dispatchPlan\.dispatches\[0\]\.requirementRefs[\s\S]*dispatchPlan\.dispatches\[0\]\.acceptanceCheckRefs/s,
    "dispatch trace refs regression"
  );
  const surfaceTest = findRegexEvidence(
    "scripts/operator_plan_surface_test.js",
    /requirementRefs[\s\S]*acceptanceCheckRefs[\s\S]*requestClauseRefs/s,
    "operator plan trace refs regression"
  );
  pushFailure(failures, planningTest.ok ? "" : planningTest.message);
  pushFailure(failures, surfaceTest.ok ? "" : surfaceTest.message);
  return buildCheckResult({
    id: "E",
    title: "Plan and dispatch carry requestClauseRefs / requirementRefs / acceptanceCheckRefs",
    failures,
    evidence: [
      {
        sourceType: "schema",
        path: "scripts/config/dispatch_plan.schema.json",
        excerpt: `dispatch.required=${required.join(", ")}`,
      },
      ...mergeEvidence([planningTest, surfaceTest]),
    ],
  });
}

function checkF() {
  const failures = [];
  const suite = readJson("scripts/config/eval_suite_default.json");
  const cases = Array.isArray(suite.cases) ? suite.cases : [];
  const relevantCases = cases.filter((entry) => entry && entry.driver === "post_lock_drift_probe");
  if (relevantCases.length < 2) {
    failures.push("default eval suite does not include the expected post_lock_drift_probe coverage.");
  }
  const policyTest = findRegexEvidence(
    "scripts/eval_harness_policy_test.js",
    /postLockDriftCase[\s\S]*post_lock_drift_probe[\s\S]*driftDetectionCase[\s\S]*post_lock_drift_probe/s,
    "eval policy regression for post-lock drift"
  );
  const smokeTest = findRegexEvidence(
    "scripts/eval_replay_api_smoke_test.js",
    /post_lock_drift_clean_trace[\s\S]*post_lock_drift_detects_missing_downstream_refs/s,
    "eval replay smoke coverage for post-lock drift"
  );
  pushFailure(failures, policyTest.ok ? "" : policyTest.message);
  pushFailure(failures, smokeTest.ok ? "" : smokeTest.message);
  return buildCheckResult({
    id: "F",
    title: "postLockDrift eval is part of the default eval suite",
    failures,
    evidence: [
      {
        sourceType: "schema",
        path: "scripts/config/eval_suite_default.json",
        excerpt: `post_lock_drift_probe cases=${relevantCases.map((entry) => entry.id).join(", ") || "none"}`,
      },
      ...mergeEvidence([policyTest, smokeTest]),
    ],
  });
}

function checkG() {
  const failures = [];
  const runtime = findRegexEvidence(
    "server.js",
    /runtimeRevisionGate\.status==="BLOCK"\|\|runtimeRevisionGate\.status==="RETURN_TO_INTAKE"[\s\S]*runtime_revision_proposal_pending[\s\S]*runtime_revision_gate_block/s,
    "runtime revision gate enforcement"
  );
  const test = findRegexEvidence(
    "scripts/requirement_revision_policy_test.js",
    /silent rewrite attempts should BLOCK[\s\S]*silent_requirement_rewrite[\s\S]*RETURN_TO_INTAKE[\s\S]*return_to_intake_required/s,
    "revision gate regression coverage"
  );
  pushFailure(failures, runtime.ok ? "" : runtime.message);
  pushFailure(failures, test.ok ? "" : test.message);
  return buildCheckResult({
    id: "G",
    title: "runtime revisionGate blocks silent rewrite and can RETURN_TO_INTAKE",
    failures,
    evidence: mergeEvidence([runtime, test]),
  });
}

function checkH() {
  const failures = [];
  const runtime = findRegexEvidence(
    "server.js",
    /finalStatus==="completed"&&clauseCompletionScorecard\.status==="FAIL"[\s\S]*explicitTaskOutcomeReason="release_clause_unsatisfied"/,
    "runtime final-completion clause scorecard gate"
  );
  const test = findRegexEvidence(
    "scripts/requirement_revision_policy_test.js",
    /clauseCompletionScorecard\.status[\s\S]*"FAIL"[\s\S]*release decisions must fail when any core clause remains unsatisfied/s,
    "clause scorecard regression coverage"
  );
  pushFailure(failures, runtime.ok ? "" : runtime.message);
  pushFailure(failures, test.ok ? "" : test.message);
  return buildCheckResult({
    id: "H",
    title: "clauseCompletionScorecard rejects final completion when core clauses are still unmet",
    failures,
    evidence: mergeEvidence([runtime, test]),
  });
}

function buildMarkdownReport(report) {
  const lines = [
    "# Requirement Foundation V1 Exit Audit",
    "",
    `- Status: ${report.status}`,
    `- Score: ${report.summary.passedCount}/${report.summary.totalCount}`,
    `- requirementFoundationV1: ${report.phaseStatus.requirementFoundationV1}`,
    `- completedAt: ${report.phaseStatus.completedAt || "-"}`,
    `- auditReportPath: ${report.phaseStatus.auditReportPath}`,
    `- markdownReportPath: ${report.phaseStatus.markdownReportPath}`,
    `- freezePolicy: ${report.freezePolicy}`,
    "",
    "## Checks",
    "",
  ];
  for (const check of report.checks) {
    lines.push(`- [${check.status}] ${check.id}. ${check.title}`);
    lines.push(`  - Detail: ${check.detail}`);
    if (Array.isArray(check.evidence) && check.evidence.length) {
      for (const evidence of check.evidence.slice(0, 6)) {
        const ref = evidence.line ? `${evidence.path}:${evidence.line}` : evidence.path;
        lines.push(`  - Evidence: ${ref}${evidence.excerpt ? ` :: ${evidence.excerpt}` : ""}`);
      }
    }
  }
  return `${lines.join("\n")}\n`;
}

function runRequirementFoundationV1ExitAudit(options = {}) {
  const outputDir = options.outputDir ? path.resolve(options.outputDir) : outputDirDefault;
  const jsonReportPath = options.jsonReportPath ? path.resolve(options.jsonReportPath) : path.join(outputDir, path.basename(jsonReportPathDefault));
  const markdownReportPath = options.markdownReportPath ? path.resolve(options.markdownReportPath) : path.join(outputDir, path.basename(markdownReportPathDefault));
  const generatedAtMs = Date.now();
  const generatedAt = new Date(generatedAtMs).toISOString();
  const checks = [checkA(), checkB(), checkC(), checkD(), checkE(), checkF(), checkG(), checkH()];
  const passedCount = checks.filter((entry) => entry.status === "PASS").length;
  const failed = checks.filter((entry) => entry.status !== "PASS");
  const status = failed.length === 0 ? "PASS" : "FAIL";
  const phaseStatus = {
    requirementFoundationV1: status === "PASS" ? "done" : "not_done",
    completedAt: status === "PASS" ? generatedAt : "",
    auditReportPath: repoRelative(jsonReportPath),
    markdownReportPath: repoRelative(markdownReportPath),
    failedCheckIds: failed.map((entry) => entry.id),
  };
  const report = {
    schema: "phase-exit-requirement-foundation-v1.v1",
    phaseId,
    phaseName,
    generatedAt,
    auditCommand,
    purpose: "Declare the Requirement-Driven Foundation V1 complete and frozen only when the agreed Step 1/2 foundation checks remain intact.",
    freezePolicy: "bug_fix_only",
    status,
    summary: {
      passedCount,
      failedCount: failed.length,
      totalCount: checks.length,
    },
    phaseStatus,
    checks,
  };
  if (options.writeOutputs !== false) {
    writeJson(jsonReportPath, report);
    writeText(markdownReportPath, buildMarkdownReport(report));
  }
  return report;
}

function main() {
  try {
    const report = runRequirementFoundationV1ExitAudit();
    console.log(`[phase-exit requirement-foundation-v1] status=${report.status} passed=${report.summary.passedCount}/${report.summary.totalCount}`);
    console.log(`[phase-exit requirement-foundation-v1] json=${report.phaseStatus.auditReportPath}`);
    console.log(`[phase-exit requirement-foundation-v1] markdown=${report.phaseStatus.markdownReportPath}`);
    if (report.status !== "PASS") {
      process.exitCode = 1;
    }
  } catch (error) {
    console.error(`[phase-exit requirement-foundation-v1] fatal=${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  auditCommand,
  jsonReportPathDefault,
  markdownReportPathDefault,
  runRequirementFoundationV1ExitAudit,
};
