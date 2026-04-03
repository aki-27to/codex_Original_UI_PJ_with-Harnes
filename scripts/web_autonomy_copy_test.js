#!/usr/bin/env node
"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");

const workspaceRoot = path.resolve(__dirname, "..");
const guideHtml = fs.readFileSync(path.join(workspaceRoot, "web", "01.HarnesUI", "guide.html"), "utf8");
const appJs = fs.readFileSync(path.join(workspaceRoot, "web", "01.HarnesUI", "app.js"), "utf8");

assert.ok(
  /<code>request-user-input<\/code>\s*は既定で\s*<code>auto-default<\/code>/.test(guideHtml),
  "guide must describe request-user-input default as auto-default"
);
assert.ok(
  !/<code>request-user-input<\/code>\s*は既定で\s*<code>blocked<\/code>/.test(guideHtml),
  "guide must not describe request-user-input default as blocked"
);
assert.ok(
  appJs.includes('approvalBoundaryItems:"境界メモ"'),
  "UI label must describe approvalBoundaryItems as boundary notes"
);
assert.ok(
  !appJs.includes("Approval required before:"),
  "UI must not fabricate approval-required copy from approvalBoundaryItems"
);

console.log("PASS web_autonomy_copy_test");
