#!/usr/bin/env node
"use strict";

const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

const {
  buildDocumentToolingRuntimeSnapshot,
  getDocumentToolingPaths,
  formatDocumentToolingStatus,
  recommendDocumentTool,
} = require("./lib/document_tooling_runtime");

function main() {
  const snapshot = buildDocumentToolingRuntimeSnapshot({
    workspaceRoot: "C:/repo",
    now: 1234567890,
    resolveCommand(command) {
      if (command === "markitdown") {
        return "C:/Python/Scripts/markitdown.exe";
      }
      if (command === "skillnet") {
        return "C:/Python/Scripts/skillnet.exe";
      }
      return "";
    },
    probeVersion(command) {
      if (command === "markitdown") {
        return "markitdown 0.1.5";
      }
      if (command === "skillnet") {
        return "skillnet 0.0.18";
      }
      return "";
    },
  });

  assert.strictEqual(snapshot.status, "ready", "snapshot must be ready");
  assert.strictEqual(snapshot.availableCount, 2, "two tools should be marked available");
  assert.strictEqual(snapshot.missingCount, 1, "one tool should be marked missing");
  assert.strictEqual(snapshot.guidePath, "docs/DOCUMENT_TOOLING_GUIDE.md", "guide path should be repo relative");
  assert.strictEqual(snapshot.hubScriptPath, "scripts/document_tooling.js", "hub script path should be repo relative");
  assert.strictEqual(snapshot.bootstrapCommand, "node scripts/document_tooling.js bootstrap", "bootstrap command should be exposed");
  assert.strictEqual(snapshot.localInstallMode, "workspace-local", "snapshot should expose local install mode");
  assert(Array.isArray(snapshot.tools) && snapshot.tools.length === 3, "snapshot should include all tool definitions");

  const markItDown = snapshot.tools.find((entry) => entry.id === "markitdown");
  assert(markItDown && markItDown.installed, "markitdown should be available");
  assert.strictEqual(markItDown.version, "markitdown 0.1.5", "markitdown version should be preserved");

  const openDataLoader = snapshot.tools.find((entry) => entry.id === "opendataloader-pdf");
  assert(openDataLoader && !openDataLoader.installed, "OpenDataLoader PDF should be missing in this fixture");

  const markdownRoute = recommendDocumentTool("convert a DOCX and PPTX bundle into markdown");
  assert.strictEqual(markdownRoute.toolId, "markitdown", "office markdown tasks should choose MarkItDown");

  const structuredPdfRoute = recommendDocumentTool("extract structured tables with bounding boxes from a scanned PDF");
  assert.strictEqual(structuredPdfRoute.toolId, "opendataloader-pdf", "layout-heavy PDF tasks should choose OpenDataLoader PDF");

  const skillRoute = recommendDocumentTool("evaluate and analyze the relationships across local skills");
  assert.strictEqual(skillRoute.toolId, "skillnet", "skill lifecycle tasks should choose SkillNet");

  const formatted = formatDocumentToolingStatus(snapshot);
  assert(formatted.includes("Microsoft MarkItDown"), "formatted status should include MarkItDown");
  assert(formatted.includes("OpenDataLoader PDF"), "formatted status should include OpenDataLoader PDF");
  assert(formatted.includes("SkillNet"), "formatted status should include SkillNet");
  assert(formatted.includes("Mixed office documents to Markdown"), "formatted status should include route guidance");
  assert(formatted.includes("Bootstrap: node scripts/document_tooling.js bootstrap"), "formatted status should include bootstrap guidance");

  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "document-tooling-runtime-"));
  const localPaths = getDocumentToolingPaths(tempRoot);
  const localWrapper = path.join(localPaths.binDir, "markitdown.cmd");
  fs.mkdirSync(localPaths.binDir, { recursive: true });
  fs.writeFileSync(localWrapper, "@echo off\r\n", "utf8");
  const localSnapshot = buildDocumentToolingRuntimeSnapshot({
    workspaceRoot: tempRoot,
    resolveCommand(command) {
      return fs.existsSync(command) ? command : "";
    },
    probeVersion(command) {
      return command === localWrapper ? "markitdown local-wrapper" : "";
    },
  });
  const localMarkItDown = localSnapshot.tools.find((entry) => entry.id === "markitdown");
  assert(localMarkItDown && localMarkItDown.installed, "workspace-local wrapper should mark tool available");
  assert.strictEqual(localMarkItDown.command, localWrapper, "workspace-local wrapper should be preferred over PATH lookup");

  process.stdout.write("PASS document_tooling_runtime_test\n");
}

main();
