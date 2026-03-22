#!/usr/bin/env node
"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const appPath = path.join(__dirname, "..", "web", "01.HarnesUI", "app.js");
const source = fs.readFileSync(appPath, "utf8");

function extractFunction(name) {
  const asyncSignature = `async function ${name}(`;
  const syncSignature = `function ${name}(`;
  const asyncStart = source.indexOf(asyncSignature);
  const syncStart = source.indexOf(syncSignature);
  const start = asyncStart >= 0 ? asyncStart : syncStart;
  assert(start >= 0, `${name} helper not found`);
  const signature = asyncStart >= 0 ? asyncSignature : syncSignature;
  let parenDepth = 0;
  let bodyStart = -1;
  for (let index = start + signature.length - 1; index < source.length; index += 1) {
    const char = source[index];
    if (char === "(") {
      parenDepth += 1;
      continue;
    }
    if (char === ")") {
      parenDepth -= 1;
      continue;
    }
    if (char === "{" && parenDepth === 0) {
      bodyStart = index;
      break;
    }
  }
  assert(bodyStart >= 0, `${name} helper body not found`);
  let depth = 0;
  for (let index = bodyStart; index < source.length; index += 1) {
    const char = source[index];
    if (char === "{") depth += 1;
    if (char === "}") {
      depth -= 1;
      if (depth === 0) return source.slice(start, index + 1);
    }
  }
  throw new Error(`failed to extract ${name}`);
}

function createPromptInputMock() {
  return {
    value: "",
    style: { height: "" },
    getBoundingClientRect() {
      if (!this.style.height) return { height: 86 };
      if (this.style.height) return { height: parseFloat(this.style.height) || 0 };
      return { height: this.scrollHeight };
    },
    get scrollHeight() {
      if (!this.value) return 86;
      const lines = this.value.split("\n").length;
      return 86 + Math.max(0, lines - 3) * 24;
    },
  };
}

function loadHelpers(promptInput) {
  const context = {
    Math,
    Number,
    String,
    parseFloat,
    composerViewportSyncCalls: 0,
    composerLayoutState: { promptInputBaseHeight: 0 },
    e: { promptInput },
    scheduleComposerViewportSyncForUi() {
      context.composerViewportSyncCalls += 1;
    },
    window: {
      getComputedStyle() {
        return { minHeight: "86px" };
      },
    },
  };
  const bootstrap = [
    extractFunction("measurePromptInputBaseHeight"),
    extractFunction("syncPromptInputHeight"),
    "this.helpers = { measurePromptInputBaseHeight, syncPromptInputHeight };",
  ].join("\n\n");
  vm.runInNewContext(bootstrap, context);
  return context;
}

function run() {
  assert(
    source.includes('e.promptInput.onkeydown=ev=>{if(ev.key==="Enter"&&!ev.shiftKey){ev.preventDefault();e.sendBtn.click()}};'),
    "Enter-to-send handler changed unexpectedly"
  );
  const promptInput = createPromptInputMock();
  const context = loadHelpers(promptInput);
  const { measurePromptInputBaseHeight, syncPromptInputHeight } = context.helpers;

  const initialBaseHeight = measurePromptInputBaseHeight();
  assert.strictEqual(initialBaseHeight, 86, "base height should come from the empty default control state");

  promptInput.value = Array.from({ length: 8 }, (_, index) => `line ${index + 1}`).join("\n");
  syncPromptInputHeight();
  assert.strictEqual(promptInput.style.height, "206px", "expanded content should grow the textarea");
  assert.strictEqual(context.composerViewportSyncCalls, 1, "growing the textarea should resync composer spacing");

  syncPromptInputHeight({ remeasureBase: true });
  assert.strictEqual(context.composerLayoutState.promptInputBaseHeight, 86, "remeasure must keep the original empty-state base height");
  assert.strictEqual(promptInput.style.height, "206px", "remeasure while expanded should not collapse the live textarea");
  assert.strictEqual(context.composerViewportSyncCalls, 2, "remeasure should resync composer spacing");

  promptInput.value = "";
  syncPromptInputHeight({ resetToBase: true });
  assert.strictEqual(promptInput.style.height, "86px", "clearing content should return to the original base height");
  assert.strictEqual(context.composerViewportSyncCalls, 3, "resetting to base height should resync composer spacing");

  console.log("[harnesui-prompt-autogrow-test] PASS");
  console.log("PASS");
}

try {
  run();
} catch (error) {
  console.log(`[harnesui-prompt-autogrow-test] FAIL ${error instanceof Error ? error.message : String(error)}`);
  console.log("FAIL");
  process.exitCode = 1;
}
