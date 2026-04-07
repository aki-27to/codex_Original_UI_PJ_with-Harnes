"use strict";

const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

const { organizeOutputSurface } = require("./organize_output_surface");

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function writeFile(filePath, content) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, content);
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function main() {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "codex-output-surface-"));
  const workspaceRoot = path.join(tempRoot, "workspace");
  ensureDir(workspaceRoot);
  ensureDir(path.join(workspaceRoot, "output", "playwright", "session-a"));
  ensureDir(path.join(workspaceRoot, "output", "playwright", "session-b"));
  ensureDir(path.join(workspaceRoot, "output", "agi_v1"));
  writeFile(path.join(workspaceRoot, "output", "playwright", "session-a", "capture-a.png"), "a");
  writeFile(path.join(workspaceRoot, "output", "playwright", "session-b", "capture-b.png"), "b");
  writeFile(path.join(workspaceRoot, "output", "phase2-long-horizon-123.json"), "{}");
  writeFile(path.join(workspaceRoot, "output", "phase3-lifecycle-456.json"), "{}");
  writeFile(path.join(workspaceRoot, "output", "tmp_harnesui_retry_bootstrap.js"), "console.log('tmp');");
  writeFile(path.join(workspaceRoot, "output", "note_article_2026-04-07.md"), "# scratch note");
  writeFile(path.join(workspaceRoot, "output", "agi_v1", "bundle.json"), "{\"ok\":true}");

  const oldDate = new Date("2026-01-01T00:00:00.000Z");
  fs.utimesSync(path.join(workspaceRoot, "output", "playwright", "session-a"), oldDate, oldDate);
  fs.utimesSync(path.join(workspaceRoot, "output", "playwright", "session-a", "capture-a.png"), oldDate, oldDate);

  const policyPath = path.join(workspaceRoot, "policy.json");
  writeFile(policyPath, JSON.stringify({
    version: 1,
    intentionalOutputRoots: ["output/agi_v1"],
    transientRoots: [
      {
        source: "output/playwright",
        target: "runtime/output-transient/playwright",
        retention: {
          maxDays: 14,
          maxEntries: 10,
          maxBytes: 1024 * 1024
        }
      }
    ],
    transientOutputFiles: [
      {
        pattern: "phase2-long-horizon-*.json",
        targetDir: "runtime/output-transient/phase-probes",
        retention: {
          maxDays: 14,
          maxEntries: 10,
          maxBytes: 1024 * 1024
        }
      },
      {
        pattern: "phase3-lifecycle-*.json",
        targetDir: "runtime/output-transient/phase-probes",
        retention: {
          maxDays: 14,
          maxEntries: 10,
          maxBytes: 1024 * 1024
        }
      },
      {
        pattern: "tmp_harnesui_retry_bootstrap.js",
        targetDir: "runtime/output-transient/bootstrap",
        retention: {
          maxDays: 14,
          maxEntries: 10,
          maxBytes: 1024 * 1024
        }
      },
      {
        pattern: "note_article_*.md",
        targetDir: "runtime/output-transient/note-articles",
        retention: {
          maxDays: 14,
          maxEntries: 10,
          maxBytes: 1024 * 1024
        }
      }
    ]
  }, null, 2));

  const manifestPath = path.join(workspaceRoot, "runtime", "manifest.json");
  const manifest = organizeOutputSurface({ workspaceRoot, policyPath, manifestPath });

  assert.strictEqual(fs.existsSync(path.join(workspaceRoot, "output", "playwright")), false, "playwright output should move out of output/");
  assert.strictEqual(fs.existsSync(path.join(workspaceRoot, "runtime", "output-transient", "playwright")), true, "playwright output should land under runtime/output-transient");
  assert.strictEqual(fs.existsSync(path.join(workspaceRoot, "runtime", "output-transient", "phase-probes", "phase2-long-horizon-123.json")), true, "phase2 probe should move to transient phase probes");
  assert.strictEqual(fs.existsSync(path.join(workspaceRoot, "runtime", "output-transient", "phase-probes", "phase3-lifecycle-456.json")), true, "phase3 probe should move to transient phase probes");
  assert.strictEqual(fs.existsSync(path.join(workspaceRoot, "runtime", "output-transient", "bootstrap", "tmp_harnesui_retry_bootstrap.js")), true, "bootstrap scratch should move to transient bootstrap root");
  assert.strictEqual(fs.existsSync(path.join(workspaceRoot, "runtime", "output-transient", "note-articles", "note_article_2026-04-07.md")), true, "note article draft should move to transient note-articles root");
  assert.strictEqual(fs.existsSync(path.join(workspaceRoot, "output", "agi_v1", "bundle.json")), true, "intentional output should remain under output/");
  assert(manifest.moves.length >= 4, "manifest should record moved transient output");
  assert(fs.existsSync(manifestPath), "manifest file should be written");

  const persistedManifest = readJson(manifestPath);
  assert.strictEqual(persistedManifest.policyPath, "policy.json", "manifest should store relative policy path");
  assert(Array.isArray(persistedManifest.intentionalOutputRoots), "manifest should preserve intentional output roots");
  assert.strictEqual(persistedManifest.intentionalOutputRoots.includes("output/agi_v1"), true, "intentional output roots should include agi_v1");

  fs.rmSync(tempRoot, { recursive: true, force: true });
  process.stdout.write("PASS organize_output_surface_test\n");
}

main();
