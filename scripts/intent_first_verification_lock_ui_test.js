#!/usr/bin/env node
"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

function extractBlock(source, pattern, label) {
  const match = source.match(pattern);
  assert(match && match[0], `${label} not found in app.js`);
  return match[0];
}

function extractFunction(source, name) {
  return extractBlock(source, new RegExp(`function ${name}\\([^]*?\\n\\}`, "m"), name);
}

function loadIntentFirstHelpers() {
  const source = fs.readFileSync(path.join(__dirname, "..", "web", "01.HarnesUI", "app.js"), "utf8");
  const context = {
    Array,
    Boolean,
    JSON,
    Object,
    Set,
    String,
    s: { runtime: { intentFirst: {} } },
    active() {
      return { mockMissionText: "" };
    },
    missionDraftSourceForUi(chatRecord) {
      return {
        text: chatRecord && typeof chatRecord === "object" ? String(chatRecord.mockMissionText || "") : "",
      };
    },
  };
  vm.runInNewContext(
    [
      extractFunction(source, "intentFirstRuntimeForUi"),
      extractFunction(source, "normalizeIntentFirstSourceListForUi"),
      extractFunction(source, "intentFirstPromptKeywordsForUi"),
      extractFunction(source, "isIntentFirstDesignSensitiveForUi"),
      extractFunction(source, "intentFirstVerificationLockForUi"),
      "this.__intentHelpers__ = { intentFirstPromptKeywordsForUi, isIntentFirstDesignSensitiveForUi, intentFirstVerificationLockForUi };",
    ].join("\n"),
    context
  );
  return { helper: context.__intentHelpers__, context };
}

function run() {
  const { helper, context } = loadIntentFirstHelpers();

  context.s.runtime.intentFirst = {
    contract: {
      technicalVerificationRequired: true,
    },
    creativeSignals: {
      promptKeywords: ["ui", "visual", "design"],
    },
    verificationLock: {
      enabled: true,
      mode: "fail_closed",
      detail: "Do not claim completion until technical verification evidence exists.",
      requiredForSources: [],
    },
  };

  const fromCreativeSignals = helper.intentFirstPromptKeywordsForUi();
  assert(fromCreativeSignals.includes("ui"), "prompt keywords should fall back to creativeSignals");
  assert(helper.isIntentFirstDesignSensitiveForUi("Please improve the UI hierarchy."), "UI prompt should be treated as design-sensitive");

  const locked = helper.intentFirstVerificationLockForUi({
    mockMissionText: "Execution request: lock live verification for the UI flow.",
  });
  assert.strictEqual(locked.enabled, true, "verification lock should stay enabled");
  assert.strictEqual(locked.active, true, "design-sensitive UI prompt should activate the verification lock");
  assert.strictEqual(locked.mode, "fail_closed", "verification lock should stay fail-closed");

  const optional = helper.intentFirstVerificationLockForUi({
    mockMissionText: "Summarize the log rotation policy.",
  });
  assert.strictEqual(optional.active, false, "non-design prompt should not activate the verification lock");

  console.log("PASS intent_first_verification_lock_ui_test");
}

try {
  run();
} catch (error) {
  console.error(`FAIL intent_first_verification_lock_ui_test :: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}
