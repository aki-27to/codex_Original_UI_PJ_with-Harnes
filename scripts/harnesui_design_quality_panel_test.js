#!/usr/bin/env node
"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");

const workspaceRoot = path.resolve(__dirname, "..");

function read(rel) {
  return fs.readFileSync(path.join(workspaceRoot, rel), "utf8");
}

function main() {
  const index = read("web/01.HarnesUI/index.html");
  const app = read("web/01.HarnesUI/app.js");
  const css = read("web/01.HarnesUI/styles.css");
  const packageJson = JSON.parse(read("package.json"));

  for (const id of [
    "designQualityPanel",
    "designQualityStatus",
    "designQualityMeta",
    "designQualityRecommendation",
    "designQualityDecision",
    "designQualityReasonList",
    "designQualityRiskList",
    "designQualityDetailLink",
    "designQualityEvidenceLink",
  ]) {
    assert(index.includes(`id="${id}"`), `index.html missing ${id}`);
    assert(app.includes(`by("${id}")`), `app.js missing ${id} binding`);
  }

  assert(app.includes("/design-quality/latest/decision.json"), "app.js must read latest design decision");
  assert(app.includes("loadDesignQualityOperatorForUi"), "app.js must define loader");
  assert(app.includes("採択可候補なし"), "app.js must not present failed DQO output as a recommendation");
  assert(app.includes("画像は主表示しません"), "app.js must hide low-confidence images from the primary user-facing panel");
  assert(app.includes("失敗理由を見る"), "app.js must route low-confidence runs to failure reasons, not a design showcase");
  assert(css.includes(".design-quality-panel"), "styles.css must style the panel");
  assert(css.includes(".design-quality-status.pass"), "styles.css must style PASS status");
  assert(packageJson.scripts["design:quality"], "package.json missing design:quality script");
  assert(packageJson.scripts["test:design-quality-operator"], "package.json missing design operator test script");

  console.log("PASS harnesui_design_quality_panel_test");
}

main();
