#!/usr/bin/env node
"use strict";

const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

const { organizeRuntimeSurface } = require("./organize_runtime_surface");

function ensureDir(targetPath) {
  fs.mkdirSync(targetPath, { recursive: true });
}

function writeFile(targetPath, content) {
  ensureDir(path.dirname(targetPath));
  fs.writeFileSync(targetPath, content);
}

function readJson(targetPath) {
  return JSON.parse(fs.readFileSync(targetPath, "utf8"));
}

function main() {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "codex-runtime-surface-"));
  const workspaceRoot = path.join(tempRoot, "workspace");
  ensureDir(workspaceRoot);

  writeFile(path.join(workspaceRoot, ".npm-cache", "_logs", "debug.log"), "debug");
  writeFile(path.join(workspaceRoot, ".playwright-cli", "session.json"), "{}");
  writeFile(path.join(workspaceRoot, "tmp_probe.json"), "{\"ok\":true}");
  writeFile(path.join(workspaceRoot, "share_demo.html"), "<html></html>");

  const manifestPath = path.join(workspaceRoot, "runtime", "runtime-surface-manifest.json");
  const manifest = organizeRuntimeSurface({ workspaceRoot, manifestPath });

  assert.strictEqual(fs.existsSync(path.join(workspaceRoot, ".npm-cache")), false, ".npm-cache should move out of repo root");
  assert.strictEqual(fs.existsSync(path.join(workspaceRoot, ".playwright-cli")), false, ".playwright-cli should move out of repo root");
  assert.strictEqual(fs.existsSync(path.join(workspaceRoot, "tmp_probe.json")), false, "tmp files should move out of repo root");
  assert.strictEqual(fs.existsSync(path.join(workspaceRoot, "share_demo.html")), false, "shared-page captures should move out of repo root");

  assert.strictEqual(fs.existsSync(path.join(workspaceRoot, "runtime", "npm-cache", "_logs", "debug.log")), true, ".npm-cache should land under runtime/npm-cache");
  assert.strictEqual(fs.existsSync(path.join(workspaceRoot, "runtime", "playwright-cli", "session.json")), true, ".playwright-cli should land under runtime/playwright-cli");
  assert.strictEqual(fs.existsSync(path.join(workspaceRoot, "runtime", "tmp", "tmp_probe.json")), true, "tmp files should land under runtime/tmp");
  assert.strictEqual(fs.existsSync(path.join(workspaceRoot, "runtime", "shared-pages", "share_demo.html")), true, "shared-page captures should land under runtime/shared-pages");

  assert.strictEqual(fs.existsSync(manifestPath), true, "runtime surface cleanup should write a manifest");
  const persistedManifest = readJson(manifestPath);
  assert.strictEqual(persistedManifest.movedCount, manifest.moves.length, "manifest movedCount should match in-memory result");
  assert(Array.isArray(persistedManifest.moves) && persistedManifest.moves.length >= 4, "manifest should record root cleanup moves");

  fs.rmSync(tempRoot, { recursive: true, force: true });
  process.stdout.write("PASS organize_runtime_surface_test\n");
}

main();
