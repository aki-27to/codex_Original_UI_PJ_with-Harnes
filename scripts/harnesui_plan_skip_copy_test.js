#!/usr/bin/env node
"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

function extractFunction(source, name) {
  const match = source.match(new RegExp(`function ${name}\\([^]*?\\n\\}`, "m"));
  assert(match && match[0], `${name} helper not found in app.js`);
  return match[0];
}

function loadHelpers() {
  const source = fs.readFileSync(path.join(__dirname, "..", "web", "01.HarnesUI", "app.js"), "utf8");
  const context = {
    t1(value, max = 999) {
      return String(value == null ? "" : value).slice(0, max);
    },
  };
  vm.runInNewContext(
    [
      extractFunction(source, "planSkipReasonLabelForUi"),
      extractFunction(source, "planSkipWorkLabelForUi"),
      "this.__helpers__ = { planSkipReasonLabelForUi, planSkipWorkLabelForUi };",
    ].join("\n"),
    context
  );
  return context.__helpers__;
}

function run() {
  const { planSkipReasonLabelForUi, planSkipWorkLabelForUi } = loadHelpers();
  assert.strictEqual(
    planSkipReasonLabelForUi("direct_response_only"),
    "直接回答または確認のみのため、詳細な実行計画は省略",
    "skip reason should be localized and human-readable"
  );
  assert.strictEqual(
    planSkipWorkLabelForUi({ skipReason: "direct_response_only" }, { text: "PLAN SKIP: ignored" }),
    "直接回答または確認のみのため、詳細な実行計画は省略",
    "work summary should prefer the localized skip reason without repeating the prefix"
  );
  assert.strictEqual(
    planSkipWorkLabelForUi(null, { text: "PLAN SKIP: 多段の実行計画は作らず、そのまま回答または確認を行います。" }),
    "多段の実行計画は作らず、そのまま回答または確認を行います。",
    "fallback skip work text should strip duplicated PLAN SKIP prefixes"
  );
  console.log("[harnesui-plan-skip-copy-test] PASS");
  console.log("PASS");
}

try {
  run();
} catch (error) {
  console.log(`[harnesui-plan-skip-copy-test] FAIL ${error instanceof Error ? error.message : String(error)}`);
  console.log("FAIL");
  process.exitCode = 1;
}
