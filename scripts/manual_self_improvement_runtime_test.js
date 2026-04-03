#!/usr/bin/env node
"use strict";

const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");
const {
  buildManualSelfImprovementRuntimeSummary,
  resolveArtifactPath,
  validateManualSelfImprovementCapture,
} = require("./lib/manual_self_improvement_runtime");

function makeTempWorkspace() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "manual-self-improvement-"));
  fs.mkdirSync(path.join(root, "output", "manual_self_improvement"), { recursive: true });
  return root;
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function sampleCapture() {
  return {
    schema: "manual-self-improvement-capture.v1",
    generatedAt: "2026-04-03T00:00:00+09:00",
    source: {
      kind: "manual_turn_capture",
      request: "Process the request and self-improve at the same time.",
    },
    entries: [
      {
        lessonSummary: "Lock the lesson contract before deciding promotion or storage.",
        classification: "runtime hint",
        appliesTo: {
          agent: ["default", "intake"],
          taskFamily: ["manual_self_improvement"],
          triggers: ["self-improve", "promotion decision"],
        },
        evidence: {
          summary: "Policy-backed promotion exists elsewhere, so this lane stays bounded.",
          supportingArtifacts: ["AGENTS.md", "docs/SELF_IMPROVEMENT_POLICY.md"],
        },
        promotionDecision: "proposal-only",
      },
      {
        lessonSummary: "Block design note promotion without visual evidence.",
        classification: "quality note",
        appliesTo: {
          agent: ["frontend_worker"],
          taskFamily: ["web_creative"],
          triggers: ["design quality"],
        },
        evidence: {
          summary: "Design-sensitive completion requires visual review.",
          supportingArtifacts: ["docs/EVIDENCE_CONTRACT.md"],
        },
        promotionDecision: "blocked",
      },
    ],
  };
}

function runCheck(name, fn) {
  try {
    fn();
    console.log(`PASS ${name}`);
    return true;
  } catch (error) {
    console.error(`FAIL ${name} :: ${error instanceof Error ? error.message : String(error)}`);
    return false;
  }
}

function testValidationAcceptsValidCapture() {
  const result = validateManualSelfImprovementCapture(sampleCapture());
  assert.strictEqual(result.ok, true, "valid capture must pass validation");
  assert.strictEqual(result.normalized.entries.length, 2, "validator must retain entries");
}

function testValidationRejectsInvalidClassification() {
  const invalid = sampleCapture();
  invalid.entries[0].classification = "unknown";
  const result = validateManualSelfImprovementCapture(invalid);
  assert.strictEqual(result.ok, false, "invalid classification must fail validation");
  assert(result.errors.some((entry) => entry.includes("classification")), "validation must report classification failure");
}

function testRuntimeSummaryAggregatesCounts() {
  const workspaceRoot = makeTempWorkspace();
  const artifactPath = resolveArtifactPath(workspaceRoot);
  writeJson(artifactPath, sampleCapture());
  const summary = buildManualSelfImprovementRuntimeSummary({ workspaceRoot });
  assert.strictEqual(summary.status, "ready", "summary must report ready");
  assert.strictEqual(summary.entryCount, 2, "summary must count entries");
  assert.strictEqual(summary.classificationCounts["runtime hint"], 1, "summary must count runtime hints");
  assert.strictEqual(summary.classificationCounts["quality note"], 1, "summary must count quality notes");
  assert.strictEqual(summary.promotionDecisionCounts["proposal-only"], 1, "summary must count proposal-only entries");
  assert.strictEqual(summary.promotionDecisionCounts.blocked, 1, "summary must count blocked entries");
  assert.strictEqual(summary.proposalOnlyCount, 1, "summary must expose proposal-only alias count");
  assert.strictEqual(summary.blockedCount, 1, "summary must expose blocked alias count");
  assert.strictEqual(summary.runtimeHintCount, 1, "summary must expose runtime hint alias count");
  assert.strictEqual(summary.qualityNoteCount, 1, "summary must expose quality note alias count");
  assert.strictEqual(summary.source.kind, "manual_turn_capture", "summary must expose source.kind");
  assert.strictEqual(summary.request, sampleCapture().source.request, "summary must expose request alias");
  assert.strictEqual(summary.entries.length, 2, "summary must expose entries for overview rendering");
  assert.strictEqual(summary.entries[0].lessonSummary, sampleCapture().entries[0].lessonSummary, "summary entries must retain lesson summaries");
  assert(summary.agents.includes("default"), "summary must expose appliesTo agents");
  assert(summary.triggers.includes("design quality"), "summary must expose triggers");
}

function testRuntimeSummaryHandlesMissingArtifact() {
  const workspaceRoot = makeTempWorkspace();
  const summary = buildManualSelfImprovementRuntimeSummary({ workspaceRoot });
  assert.strictEqual(summary.status, "missing", "missing artifact must be reported");
  assert.strictEqual(summary.entryCount, 0, "missing artifact must expose zero entries");
}

function testValidatorScriptReportsSuccess() {
  const workspaceRoot = makeTempWorkspace();
  const artifactPath = resolveArtifactPath(workspaceRoot);
  writeJson(artifactPath, sampleCapture());
  const scriptPath = path.join(__dirname, "manual_self_improvement_validate.js");
  const result = spawnSync(process.execPath, [scriptPath, artifactPath], {
    cwd: workspaceRoot,
    encoding: "utf8",
    windowsHide: true,
  });
  assert.strictEqual(result.status, 0, `validator must exit 0 :: ${result.stderr || result.stdout}`);
  const parsed = JSON.parse(String(result.stdout || "").trim());
  assert.strictEqual(parsed.ok, true, "validator output must report success");
  assert.strictEqual(parsed.entryCount, 2, "validator output must include entry count");
}

function testValidatorScriptFailsOnInvalidArtifact() {
  const workspaceRoot = makeTempWorkspace();
  const artifactPath = resolveArtifactPath(workspaceRoot);
  const invalid = sampleCapture();
  delete invalid.entries[0].lessonSummary;
  writeJson(artifactPath, invalid);
  const scriptPath = path.join(__dirname, "manual_self_improvement_validate.js");
  const result = spawnSync(process.execPath, [scriptPath, artifactPath], {
    cwd: workspaceRoot,
    encoding: "utf8",
    windowsHide: true,
  });
  assert.notStrictEqual(result.status, 0, "validator must fail invalid artifacts");
  const parsed = JSON.parse(String(result.stderr || "").trim());
  assert.strictEqual(parsed.ok, false, "validator output must report failure");
  assert(parsed.errors.some((entry) => String(entry).includes("lessonSummary")), "validator output must explain the failing field");
}

function main() {
  const checks = [
    ["validation accepts valid capture", testValidationAcceptsValidCapture],
    ["validation rejects invalid classification", testValidationRejectsInvalidClassification],
    ["runtime summary aggregates counts", testRuntimeSummaryAggregatesCounts],
    ["runtime summary handles missing artifact", testRuntimeSummaryHandlesMissingArtifact],
    ["validator script reports success", testValidatorScriptReportsSuccess],
    ["validator script fails on invalid artifact", testValidatorScriptFailsOnInvalidArtifact],
  ];
  let failed = 0;
  for (const [name, fn] of checks) {
    if (!runCheck(name, fn)) {
      failed += 1;
    }
  }
  if (failed) {
    process.exitCode = 1;
    return;
  }
  console.log("PASS manual self improvement runtime tests");
}

main();
