#!/usr/bin/env node
"use strict";

const assert = require("assert");
const path = require("path");
const {
  resolveStaticPath,
  staticRoot,
} = require("../APP/01.english-conversation-app/standalone_server");

function main() {
  const indexPath = resolveStaticPath("/");
  assert.strictEqual(indexPath, path.join(staticRoot, "index.html"), "root request must resolve to app index");

  const siblingTraversal = resolveStaticPath("/../01.english-conversation-app2/secret.txt");
  assert.strictEqual(siblingTraversal, null, "same-prefix sibling path must not be served");

  const malformedPercent = resolveStaticPath("/%E0%A4%A");
  assert.strictEqual(malformedPercent, null, "malformed percent encoding must fail closed");

  const parentTraversal = resolveStaticPath("/../../README.md");
  assert.strictEqual(parentTraversal, null, "parent traversal must not be served");

  console.log("PASS english_conversation_standalone_static_security_test");
}

main();
