#!/usr/bin/env node
"use strict";

const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

const workspaceRoot = path.resolve(__dirname, "..");
const fixturePath = path.join(workspaceRoot, "scripts", "lib", "mock_app_server_fixture.js");
const fixtureSource = fs.readFileSync(fixturePath, "utf8");
const { buildMockFixtureScenario } = require(fixturePath);

const architectureSeed = "# Current\n\n## 6) 現在の構成\n- seed\n";

function makeTempWorkspace() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "mock-fixture-"));
  fs.mkdirSync(path.join(root, "docs"), { recursive: true });
  fs.mkdirSync(path.join(root, "scripts", "config"), { recursive: true });
  fs.writeFileSync(path.join(root, "docs", "CURRENT_ARCHITECTURE.md"), architectureSeed, "utf8");
  fs.writeFileSync(path.join(root, "docs", "CURRENT_ARCHITECTURE_SIGNOFF.md"), architectureSeed, "utf8");
  fs.writeFileSync(path.join(root, "docs", "EVIDENCE_CONTRACT.md"), "# Evidence\n", "utf8");
  fs.writeFileSync(path.join(root, "docs", "ARCHITECTURE_CHANGELOG.md"), "# Changelog\n", "utf8");
  fs.writeFileSync(path.join(root, "docs", "RUNTIME_BOUNDARY_MAP.md"), "# Runtime Boundary Map\n\n## Runtime Truth\n- historical note only\n", "utf8");
  fs.writeFileSync(path.join(root, "scripts", "config", "signoff_sample_target.txt"), "gate: pending\n", "utf8");
  return root;
}

function buildSignoffPrompt() {
  return [
    "[FIXTURE_SCENARIO] SIGNOFF_SAMPLE",
    "# Goal",
    "Complete one signoff-assurance maintenance task now.",
    "# Implementation Requirements",
    "- Change scripts/config/signoff_sample_target.txt, docs/EVIDENCE_CONTRACT.md, docs/CURRENT_ARCHITECTURE.md, and docs/ARCHITECTURE_CHANGELOG.md.",
    "- In docs/EVIDENCE_CONTRACT.md, add this exact bullet if it is not already present: - evidence bullet",
    "- In docs/CURRENT_ARCHITECTURE.md, add this exact architecture bullet if it is not already present: - architecture bullet",
    "- In docs/ARCHITECTURE_CHANGELOG.md, add this exact changelog line if it is not already present: - changelog line",
    "# Acceptance Criteria",
    "- Final reply must be exactly: SIGNOFF_TASK_OK scripts/config/signoff_sample_target.txt",
  ].join("\n");
}

function buildMeasuredBaselineSignoffPrompt() {
  return [
    "[FIXTURE_SCENARIO] SIGNOFF_SAMPLE",
    "[BASELINE_PROFILE] measured",
    "#requirement-locked",
    "# Goal",
    "Perform one measured-baseline evidence maintenance task.",
    "# Implementation Requirements",
    "Implementation is explicitly requested now. Requirements are fixed. Do not switch to proposal-only mode and do not ask follow-up questions.",
    "- If you need to change the meaning of the locked requirement contract, do not rewrite it silently.",
    "- Signoff baseline target: scripts/config/signoff_sample_target.txt",
    "- Signoff baseline support targets: docs/EVIDENCE_CONTRACT.md | docs/CURRENT_ARCHITECTURE_SIGNOFF.md | docs/ARCHITECTURE_CHANGELOG.md",
    "- Change only scripts/config/signoff_sample_target.txt.",
    "- In docs/EVIDENCE_CONTRACT.md, add this exact bullet if it is not already present: - evidence bullet",
    "- In docs/CURRENT_ARCHITECTURE_SIGNOFF.md, add this exact architecture bullet if it is not already present: - architecture bullet",
    "- In docs/ARCHITECTURE_CHANGELOG.md, add this exact changelog line if it is not already present: - changelog line",
    "# Acceptance Criteria",
    "- Final reply must be exactly: SIGNOFF_TASK_OK scripts/config/signoff_sample_target.txt",
  ].join("\n");
}

function buildBoundaryPrompt() {
  return [
    "[FIXTURE_SCENARIO] BOUNDARY_SAMPLE",
    "# Goal",
    "Perform one state documentation maintenance task.",
    "# Implementation Requirements",
    "- Change only docs/RUNTIME_BOUNDARY_MAP.md.",
    "- Insert this exact bullet if it is not already present: - boundary bullet",
    "# Acceptance Criteria",
    "- Final reply must be exactly: BOUNDARY_TASK_OK docs/RUNTIME_BOUNDARY_MAP.md",
  ].join("\n");
}

function main() {
  assert(
    fixtureSource.includes('const architectureEvidenceHeaders = ['),
    "mock fixture must centralize architecture heading compatibility"
  );
  assert(
    fixtureSource.includes('if (lower.includes("[fixture_scenario] boundary_sample")) {'),
    "mock fixture must route boundary samples explicitly"
  );

  const tempRoot = makeTempWorkspace();

  const signoffScenario = buildMockFixtureScenario({
    workspaceRoot: tempRoot,
    cwd: tempRoot,
    input: buildSignoffPrompt(),
    threadId: "thread-signoff",
    turnId: "turn-signoff",
  });

  assert.strictEqual(
    signoffScenario.finalText,
    "SIGNOFF_TASK_OK scripts/config/signoff_sample_target.txt",
    "signoff scenario must preserve the exact final reply contract"
  );
  assert.ok(
    signoffScenario.items.some((item) => item && item.agentType === "reviewer"),
    "signoff scenario must emit reviewer evidence"
  );
  assert.ok(
    signoffScenario.items.some((item) => item && item.agentType === "tester"),
    "signoff scenario must emit tester evidence"
  );
  assert.ok(
    signoffScenario.items.some((item) => item && item.type === "commandExecution" && item.command === "node scripts/system_coherence_review_test.js"),
    "signoff scenario must emit system coherence review command evidence"
  );
  assert.ok(
    fs.readFileSync(path.join(tempRoot, "docs", "CURRENT_ARCHITECTURE.md"), "utf8").includes("- architecture bullet"),
    "signoff scenario must insert the architecture bullet under the current architecture heading"
  );

  const measuredBaselineScenario = buildMockFixtureScenario({
    workspaceRoot: tempRoot,
    cwd: tempRoot,
    input: buildMeasuredBaselineSignoffPrompt(),
    threadId: "thread-signoff-baseline",
    turnId: "turn-signoff-baseline",
  });

  assert.strictEqual(
    measuredBaselineScenario.finalText,
    "SIGNOFF_TASK_OK scripts/config/signoff_sample_target.txt",
    "measured baseline signoff scenario must preserve the exact final reply contract"
  );
  assert.ok(
    !measuredBaselineScenario.items.some((item) => item && item.agentType === "reviewer"),
    "measured baseline signoff scenario must not emit reviewer evidence"
  );
  assert.ok(
    !measuredBaselineScenario.items.some((item) => item && item.agentType === "tester"),
    "measured baseline signoff scenario must not emit tester evidence"
  );
  assert.ok(
    fs.readFileSync(path.join(tempRoot, "scripts", "config", "signoff_sample_target.txt"), "utf8").includes("gate: signed"),
    "measured baseline signoff scenario must update the signoff target even when requirement-lock guidance contains change wording"
  );
  assert.ok(
    fs.readFileSync(path.join(tempRoot, "docs", "CURRENT_ARCHITECTURE_SIGNOFF.md"), "utf8").includes("- architecture bullet"),
    "measured baseline signoff scenario must update the signoff architecture support file"
  );

  const boundaryScenario = buildMockFixtureScenario({
    workspaceRoot: tempRoot,
    cwd: tempRoot,
    input: buildBoundaryPrompt(),
    threadId: "thread-boundary",
    turnId: "turn-boundary",
  });

  assert.strictEqual(
    boundaryScenario.finalText,
    "BOUNDARY_TASK_OK docs/RUNTIME_BOUNDARY_MAP.md",
    "boundary scenario must preserve the exact final reply contract"
  );
  assert.ok(
    boundaryScenario.items.some((item) => item && item.agentType === "reviewer"),
    "boundary scenario must emit reviewer evidence"
  );
  assert.ok(
    boundaryScenario.items.some((item) => item && item.agentType === "tester"),
    "boundary scenario must emit tester evidence"
  );
  assert.ok(
    boundaryScenario.items.some((item) => item && item.type === "commandExecution" && item.command === "node scripts/system_coherence_review_test.js"),
    "boundary scenario must emit system coherence review command evidence"
  );
  assert.ok(
    fs.readFileSync(path.join(tempRoot, "docs", "RUNTIME_BOUNDARY_MAP.md"), "utf8").includes("- boundary bullet"),
    "boundary scenario must update the runtime boundary map"
  );

  console.log("PASS mock_app_server_fixture_test");
}

main();
