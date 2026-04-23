"use strict";

const fs = require("fs");
const path = require("path");

const workspaceRoot = path.resolve(__dirname, "..");

const uiSourcePaths = [
  path.join(workspaceRoot, "APP", "04.godot", "01.TTL", "scripts", "tetris_game.gd"),
  path.join(workspaceRoot, "APP", "04.godot", "01.TTL", "scenes", "main.tscn"),
];

const guiSmokeOutputPath = path.join(workspaceRoot, "output", "godot_mcp_gui_smoke_output.json");
const stagedSequencePath = path.join(workspaceRoot, "output", "godot_mcp_ui_sequence.json");
const reviewerEvidencePath = path.join(workspaceRoot, "output", "godot_mcp_reviewer_evidence.md");
const visualEvidencePaths = [
  guiSmokeOutputPath,
  stagedSequencePath,
  reviewerEvidencePath,
];

function fail(message) {
  throw new Error(message);
}

function assert(condition, message) {
  if (!condition) fail(message);
}

function readJson(filePath, label) {
  assert(fs.existsSync(filePath), `${label} is missing: ${path.relative(workspaceRoot, filePath)}`);
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    fail(`${label} is not valid JSON: ${error.message}`);
  }
}

function stat(filePath, label) {
  assert(fs.existsSync(filePath), `${label} is missing: ${path.relative(workspaceRoot, filePath)}`);
  return fs.statSync(filePath);
}

function latestMtimeMs(filePaths, label) {
  let latest = 0;
  for (const filePath of filePaths) {
    latest = Math.max(latest, stat(filePath, label).mtimeMs);
  }
  return latest;
}

function requireFresh(filePath, newerThanMs, label) {
  const targetStat = stat(filePath, label);
  assert(
    targetStat.mtimeMs >= newerThanMs,
    `${label} is stale for the current Godot/Tetris UI surface: ${path.relative(workspaceRoot, filePath)}`
  );
}

function main() {
  const evidenceExists = visualEvidencePaths.map((filePath) => fs.existsSync(filePath));
  const visualGuardRequired = process.env.GODOT_TETRIS_VISUAL_GUARD_REQUIRED === "1";
  if (!visualGuardRequired && evidenceExists.every((exists) => !exists)) {
    console.log("PASS godot_tetris_visual_guard_test (skipped: local GUI evidence artifacts are absent)");
    return;
  }
  assert(
    visualGuardRequired || evidenceExists.every((exists) => exists),
    "Godot/Tetris visual evidence is partially present; regenerate the full GUI evidence set or remove stale local artifacts"
  );

  const latestUiSourceMtimeMs = latestMtimeMs(uiSourcePaths, "Godot/Tetris UI source");
  const guiSmoke = readJson(guiSmokeOutputPath, "GUI smoke output");
  const stagedSequence = readJson(stagedSequencePath, "Staged UI sequence");
  stat(reviewerEvidencePath, "Reviewer evidence");
  const reviewerEvidence = fs.readFileSync(reviewerEvidencePath, "utf8");

  assert(guiSmoke && guiSmoke.ok === true, "GUI smoke output must report ok=true");
  assert(guiSmoke.guiDebug && typeof guiSmoke.guiDebug.capturePath === "string", "GUI smoke output must include guiDebug.capturePath");
  requireFresh(guiSmokeOutputPath, latestUiSourceMtimeMs, "GUI smoke output");
  requireFresh(guiSmoke.guiDebug.capturePath, latestUiSourceMtimeMs, "GUI debug capture");

  assert(stagedSequence && stagedSequence.ok === true, "Staged UI sequence must report ok=true");
  assert(Array.isArray(stagedSequence.stages), "Staged UI sequence must include stages");
  const stageNames = new Set(stagedSequence.stages.map((stage) => String(stage && stage.name || "").trim()).filter(Boolean));
  for (const requiredStage of ["start", "mid_stack", "pressure", "post_command"]) {
    assert(stageNames.has(requiredStage), `Staged UI sequence is missing required stage: ${requiredStage}`);
  }
  const pressureStage = stagedSequence.stages.find((stage) => stage && stage.name === "pressure");
  assert(pressureStage && pressureStage.state, "Staged UI sequence must include pressure stage state");
  assert(
    Number(pressureStage.state.danger_ratio || 0) >= 0.4,
    "Pressure stage must capture a materially crowded stack to surface overlap risk"
  );
  assert(typeof pressureStage.capturePath === "string" && pressureStage.capturePath, "Pressure stage must include capturePath");
  requireFresh(stagedSequencePath, latestUiSourceMtimeMs, "Staged UI sequence");
  requireFresh(pressureStage.capturePath, latestUiSourceMtimeMs, "Pressure-stage capture");

  requireFresh(reviewerEvidencePath, latestUiSourceMtimeMs, "Reviewer evidence");
  assert(
    reviewerEvidence.includes(path.basename(guiSmoke.guiDebug.capturePath)),
    "Reviewer evidence must mention the latest GUI debug capture artifact"
  );
  assert(
    reviewerEvidence.includes("godot_mcp_ui_sequence.json"),
    "Reviewer evidence must mention the staged UI sequence artifact"
  );

  console.log("PASS godot_tetris_visual_guard_test");
}

main();
