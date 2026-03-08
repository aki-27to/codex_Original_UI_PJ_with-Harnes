#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");

const workspaceRoot = path.resolve(__dirname, "..");
const fixtureRoot = path.join(workspaceRoot, "output", "test-external-english-conversation-app");
const serverModulePath = path.join(workspaceRoot, "server.js");

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function ensureFixture() {
  fs.rmSync(fixtureRoot, { recursive: true, force: true });
  fs.mkdirSync(path.join(fixtureRoot, "assets"), { recursive: true });
  fs.writeFileSync(path.join(fixtureRoot, "index.html"), "fixture-index", "utf8");
  fs.writeFileSync(path.join(fixtureRoot, "assets", "probe.txt"), "fixture-probe", "utf8");
}

function clearServerModuleCache() {
  delete require.cache[serverModulePath];
}

function run() {
  ensureFixture();
  const previousRoot = process.env.CODEX_ENGLISH_CONVERSATION_APP_ROOT;
  process.env.CODEX_ENGLISH_CONVERSATION_APP_ROOT = fixtureRoot;

  try {
    clearServerModuleCache();
    const { __staticMount } = require(serverModulePath);
    assert(__staticMount, "expected __staticMount export");

    const source = __staticMount.getEnglishConversationAppStaticSource();
    assert(
      String(source.source || "").startsWith("env-override"),
      `expected env-override source, got ${source.source}`
    );
    assert(source.root === fixtureRoot, `expected fixture root, got ${source.root}`);

    const indexTarget = __staticMount.buildStaticRequestTarget("/english-conversation-app/index.html");
    assert(indexTarget.allowed === true, "expected external index target to be allowed");
    assert(indexTarget.absolutePath === path.join(fixtureRoot, "index.html"), "expected external index path");

    const assetTarget = __staticMount.buildStaticRequestTarget("/english-conversation-app/assets/probe.txt");
    assert(assetTarget.allowed === true, "expected external asset target to be allowed");
    assert(
      assetTarget.absolutePath === path.join(fixtureRoot, "assets", "probe.txt"),
      "expected external asset path"
    );

    const harnessTarget = __staticMount.buildStaticRequestTarget("/01.HarnesUI/index.html");
    assert(harnessTarget.allowed === true, "expected harness UI target to be allowed");
    assert(
      harnessTarget.absolutePath === path.join(workspaceRoot, "web", "01.HarnesUI", "index.html"),
      "expected harness UI path"
    );

    const traversalTarget = __staticMount.buildStaticRequestTarget("/english-conversation-app/%2e%2e/01.HarnesUI/index.html");
    assert(traversalTarget.allowed === false, "expected traversal target to be rejected");

    console.log("PASS external english conversation app mount");
  } finally {
    if (previousRoot == null) {
      delete process.env.CODEX_ENGLISH_CONVERSATION_APP_ROOT;
    } else {
      process.env.CODEX_ENGLISH_CONVERSATION_APP_ROOT = previousRoot;
    }
    clearServerModuleCache();
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
}

try {
  run();
} catch (error) {
  console.error(`FAIL ${error && error.message ? error.message : String(error)}`);
  process.exitCode = 1;
}
