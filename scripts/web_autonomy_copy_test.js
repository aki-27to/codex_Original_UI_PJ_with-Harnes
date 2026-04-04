#!/usr/bin/env node
"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");

const workspaceRoot = path.resolve(__dirname, "..");
const guideHtml = fs.readFileSync(path.join(workspaceRoot, "web", "01.HarnesUI", "guide.html"), "utf8");
const appJs = fs.readFileSync(path.join(workspaceRoot, "web", "01.HarnesUI", "app.js"), "utf8");
const readme = fs.readFileSync(path.join(workspaceRoot, "README.md"), "utf8");
const harnessMap = fs.readFileSync(path.join(workspaceRoot, "HARNESS_MAP.md"), "utf8");

assert.ok(
  /live runtime[^<]*<code>request-user-input<\/code>[^<]*<code>auto-default<\/code>/.test(guideHtml),
  "guide must describe the live request-user-input default as auto-default"
);
assert.ok(
  /strict lane[^<]*<code>blocked<\/code>/.test(guideHtml),
  "guide must distinguish strict blocked lanes from the live default"
);
assert.ok(
  guideHtml.includes("127.0.0.1:57526"),
  "guide must mention the standalone English conversation launcher port"
);
assert.ok(
  /CODEX_REQUEST_USER_INPUT_POLICY=auto-default/.test(readme),
  "README must document the launcher default as auto-default"
);
assert.ok(
  /127\.0\.0\.1:57526/.test(readme),
  "README must mention the optional standalone English conversation app"
);
assert.ok(
  /live runtime `requestUserInputPolicy=auto-default`/.test(harnessMap),
  "HARNESS_MAP must describe the live runtime request-user-input default"
);
assert.ok(
  /strict `proof` \/ `repro` \/ `conversation-app-server` lanes pin `requestUserInputPolicy=blocked`/.test(harnessMap),
  "HARNESS_MAP must describe the strict blocked lanes"
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
