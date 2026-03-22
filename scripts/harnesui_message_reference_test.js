#!/usr/bin/env node
"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

function extractFunction(source, name) {
  const match = source.match(new RegExp(`function\\s+${name}\\s*\\([^)]*\\)\\s*\\{[\\s\\S]*?\\n\\}`, "m"));
  assert(match && match[0], `${name} helper not found in app.js`);
  return match[0];
}

function makeElement(tagName) {
  const node = {
    tagName: String(tagName || "").toUpperCase(),
    className: "",
    title: "",
    href: "",
    target: "",
    rel: "",
    children: [],
    _textContent: "",
    appendChild(child) {
      this.children.push(child);
      return child;
    },
  };
  Object.defineProperty(node, "textContent", {
    get() {
      return this._textContent;
    },
    set(value) {
      this._textContent = String(value || "");
      this.children = [];
    },
  });
  return node;
}

function loadHelpers() {
  const source = fs.readFileSync(path.join(__dirname, "..", "web", "01.HarnesUI", "app.js"), "utf8");
  const context = {
    document: {
      createElement(tagName) {
        return makeElement(tagName);
      },
      createTextNode(text) {
        return { nodeType: 3, textContent: String(text || "") };
      },
    },
  };
  vm.runInNewContext(
    [
      extractFunction(source, "decodeMessageHrefForUi"),
      extractFunction(source, "messageReferenceLocationForUi"),
      extractFunction(source, "messageReferenceFileNameForUi"),
      extractFunction(source, "messageReferenceDisplayPathForUi"),
      extractFunction(source, "parseMessageReferenceForUi"),
      extractFunction(source, "normalizeMessageReferencesForUi"),
      extractFunction(source, "compactInlineTextForUi"),
      extractFunction(source, "extractStitchPromptContextForUi"),
      extractFunction(source, "renderStitchPromptContextForUi"),
      extractFunction(source, "renderMessageContentForUi"),
      "this.__helpers__={parseMessageReferenceForUi,normalizeMessageReferencesForUi,compactInlineTextForUi,extractStitchPromptContextForUi,renderStitchPromptContextForUi,renderMessageContentForUi};",
    ].join("\n"),
    context
  );
  return context.__helpers__;
}

function run() {
  const {
    parseMessageReferenceForUi,
    normalizeMessageReferencesForUi,
    compactInlineTextForUi,
    extractStitchPromptContextForUi,
    renderMessageContentForUi,
  } = loadHelpers();

  const fileRef = parseMessageReferenceForUi(
    "planning_mode_policy.js#L1323",
    "/C:/Users/akima/dev/codex_Original_UI_PJ_with-Harnes/scripts/lib/planning_mode_policy.js#L1323"
  );
  assert.strictEqual(fileRef.kind, "local_file", "absolute workspace paths should be treated as local file references");
  assert.strictEqual(fileRef.fileName, "planning_mode_policy.js", "file references should keep only the basename in the visible label");
  assert.strictEqual(fileRef.visibleLabel, "planning_mode_policy.js", "visible labels should drop line markers in the final UI");
  assert.strictEqual(fileRef.shortLabel, "planning_mode_policy.js:1323", "internal compact labels should still keep the line number");
  assert.strictEqual(fileRef.displayPath, "scripts/lib/planning_mode_policy.js", "hover details should collapse to a short repo-relative path");
  assert.ok(fileRef.title.includes("scripts/lib/planning_mode_policy.js"), "hover details should avoid the full absolute path");
  assert.ok(fileRef.title.includes("L1323"), "hover details should keep the line marker in hover text");

  const normalized = normalizeMessageReferencesForUi(
    "See [planning_mode_policy.js#L1323](/C:/Users/akima/dev/codex_Original_UI_PJ_with-Harnes/scripts/lib/planning_mode_policy.js#L1323) for the rule."
  );
  assert.ok(!normalized.includes("/C:/Users/akima/dev/"), "normalized transcript text should not leak the absolute path");
  assert.ok(normalized.includes("planning_mode_policy.js"), "normalized transcript text should keep a compact file reference");
  assert.ok(!normalized.includes(":1323"), "normalized transcript text should not keep the line marker in final UI text");

  const compact = compactInlineTextForUi(
    "  check [CURRENT_ARCHITECTURE.md](/C:/Users/akima/dev/codex_Original_UI_PJ_with-Harnes/docs/CURRENT_ARCHITECTURE.md) \n first  "
  );
  assert.strictEqual(compact, "check CURRENT_ARCHITECTURE.md first", "chat previews should collapse file references to the short label");

  const content = makeElement("pre");
  renderMessageContentForUi(
    content,
    "Rule: [planning_mode_policy.js#L1323](/C:/Users/akima/dev/codex_Original_UI_PJ_with-Harnes/scripts/lib/planning_mode_policy.js#L1323) and [OpenAI](https://openai.com)"
  );
  assert.strictEqual(content.children.length, 4, "rendered transcript should keep text plus two structured references");
  assert.strictEqual(content.children[1].className, "message-ref-chip file", "local file references should render as chips");
  assert.strictEqual(content.children[1].children[0].textContent, "planning_mode_policy.js", "file chip should foreground only the basename");
  assert.strictEqual(content.children[1].children.length, 1, "file chip should not render a separate line marker chip");
  assert.strictEqual(content.children[3].tagName, "A", "external references should stay links");
  assert.strictEqual(content.children[3].textContent, "OpenAI", "external reference label should stay readable");

  const stitchPrompt = [
    "以下に従ってWEB UIを刷新してください。",
    "",
    "## Stitch Instructions",
    "Get the images and code for the following Stitch project's screens:",
    "",
    "## Project",
    "Title: Home - SURUGA-K",
    "ID: 10142073172180669410",
    "",
    "## Screens:",
    "1. TOP - 三重非破壊検査 (画像サンプル反映版)",
    "   ID: 6be8048471f94faaad7a7d18601c6d2f",
    "",
    "Use a utility like `curl -L` to download the hosted URLs.",
  ].join("\n");
  const stitchContext = extractStitchPromptContextForUi(stitchPrompt);
  assert.ok(stitchContext, "structured Stitch prompts should be parsed in the UI layer");
  assert.strictEqual(stitchContext.projectTitle, "Home - SURUGA-K", "Stitch prompt parsing should keep the project title");
  assert.strictEqual(stitchContext.projectId, "10142073172180669410", "Stitch prompt parsing should keep the project id");
  assert.strictEqual(stitchContext.screens[0].id, "6be8048471f94faaad7a7d18601c6d2f", "Stitch prompt parsing should keep the screen id");

  const stitchContent = makeElement("pre");
  renderMessageContentForUi(stitchContent, stitchPrompt);
  const stitchCard = stitchContent.children.find((child) => child && child.className === "message-stitch-card");
  assert.ok(stitchCard, "rendered transcript should append a Stitch summary card");
  assert.strictEqual(stitchCard.children[0].children[0].textContent, "Stitch参照", "Stitch summary cards should have a readable title");
  assert.ok(
    stitchCard.children.some((child) => child && child.className === "message-stitch-row" && /Home - SURUGA-K/.test(child.children[1].textContent)),
    "Stitch summary cards should expose the referenced project"
  );
  assert.ok(
    stitchCard.children.some((child) => child && child.className === "message-stitch-row" && /6be8048471f94faaad7a7d18601c6d2f/.test(child.children[1].textContent)),
    "Stitch summary cards should expose the referenced screen id"
  );

  process.stdout.write("PASS harnesui_message_reference_test\n");
}

try {
  run();
} catch (error) {
  process.stderr.write(`FAIL harnesui_message_reference_test: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
}
