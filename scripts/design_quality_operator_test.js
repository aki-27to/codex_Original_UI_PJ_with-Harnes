#!/usr/bin/env node
"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const {
  buildBrief,
  buildCandidateData,
  buildDecision,
  buildScorecard,
  runDesignQualityOperator,
} = require("./design/design_quality_operator");

const workspaceRoot = path.resolve(__dirname, "..");
const tmpRoot = path.join(workspaceRoot, "output", ".tmp_design_quality_operator_test");
const targetRoot = path.join(tmpRoot, "target");
const outputRoot = path.join(tmpRoot, "runs");

function clean() {
  fs.rmSync(tmpRoot, { recursive: true, force: true });
}

async function main() {
  clean();
  fs.mkdirSync(path.join(targetRoot, "public"), { recursive: true });
  const result = await runDesignQualityOperator({
    "target-root": targetRoot,
    "run-id": "test",
    "output-root": path.relative(workspaceRoot, outputRoot),
    "skip-screenshots": true,
    "publish-web": false,
    "log": false,
  });
  assert(result.runRoot.startsWith(outputRoot), "test output must stay under tmp root");
  const decisionPath = path.join(result.runRoot, "decision.json");
  const scorecardPath = path.join(result.runRoot, "scorecard.json");
  const indexPath = path.join(result.runRoot, "index.html");
  assert(fs.existsSync(decisionPath), "decision.json must be written");
  assert(fs.existsSync(scorecardPath), "scorecard.json must be written");
  assert(fs.existsSync(indexPath), "detail index.html must be written");
  const decision = JSON.parse(fs.readFileSync(decisionPath, "utf8"));
  const scorecard = JSON.parse(fs.readFileSync(scorecardPath, "utf8"));
  assert.strictEqual(decision.schema, "design-quality-operator-decision.v1");
  assert.strictEqual(scorecard.schema, "design-quality-scorecard.v1");
  assert(scorecard.candidates.length >= 3, "operator must generate multiple candidates");
  assert.strictEqual(scorecard.screenshotEvidence.status, "skipped");
  assert.strictEqual(decision.status, "FAILED_VALIDATION", "missing screenshot evidence must fail closed");
  assert(decision.rejected.length >= 2, "weak candidates must be rejected with reasons");

  const policy = JSON.parse(fs.readFileSync(path.join(workspaceRoot, "scripts", "config", "design_quality_operator_policy.json"), "utf8"));
  const visualGrammar = JSON.parse(fs.readFileSync(path.join(workspaceRoot, "scripts", "config", "visual_grammar.json"), "utf8"));
  const antiTaste = JSON.parse(fs.readFileSync(path.join(workspaceRoot, "scripts", "config", "anti_taste_memory.json"), "utf8"));
  const brief = buildBrief({ targetRoot, policy, visualGrammar, antiTaste });
  const scorecardWithScreenshots = buildScorecard(buildCandidateData(), {
    status: "pass",
    error: "",
    items: [
      { candidateId: "candidate-a", viewport: "desktop", width: 1440, height: 960, path: "screenshots/candidate-a-desktop.png" },
      { candidateId: "candidate-a", viewport: "mobile", width: 390, height: 920, path: "screenshots/candidate-a-mobile.png" },
    ],
  });
  const calibratedDecision = buildDecision({ policy, brief, scorecard: scorecardWithScreenshots });
  assert.strictEqual(calibratedDecision.calibration.reference.url, "https://www.suruga-k.jp/");
  assert.strictEqual(calibratedDecision.calibration.status, "CALIBRATION_NOT_PASSED");
  assert.strictEqual(calibratedDecision.status, "FAILED_VALIDATION", "suruga-calibrated weak design must not auto PASS");
  assert.strictEqual(calibratedDecision.humanDecisionRequired, true);
  assert.strictEqual(calibratedDecision.recommendation.recommended, false);
  assert.strictEqual(calibratedDecision.presentationPolicy.showCandidateImages, false);
  assert.strictEqual(calibratedDecision.presentationPolicy.userFacingLabel, "do_not_show_candidate_images");
  clean();
  console.log("PASS design_quality_operator_test");
}

main().catch((error) => {
  clean();
  console.error(error && error.stack ? error.stack : String(error));
  process.exit(1);
});
