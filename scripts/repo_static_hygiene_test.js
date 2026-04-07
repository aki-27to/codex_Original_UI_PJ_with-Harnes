"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");

const workspaceRoot = path.resolve(__dirname, "..");

function read(relativePath) {
  return fs.readFileSync(path.join(workspaceRoot, relativePath), "utf8");
}

function readJson(relativePath) {
  return JSON.parse(read(relativePath));
}

function globToRegExp(globPattern) {
  const escaped = String(globPattern || "")
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*/g, ".*")
    .replace(/\?/g, ".");
  return new RegExp(`^${escaped}$`, "i");
}

function main() {
  const gitignore = read(".gitignore");
  const architecture = read(path.join("docs", "CURRENT_ARCHITECTURE.md"));
  const outputSurfacePolicy = readJson(path.join("scripts", "config", "output_surface_policy.json"));

  assert(/(?:^|\r?\n)node_modules\/(?:\r?\n|$)/.test(gitignore), ".gitignore must keep node_modules/ out of repo root");
  assert(/(?:^|\r?\n)\.npm-cache\/(?:\r?\n|$)/.test(gitignore), ".gitignore must keep .npm-cache/ out of repo root");
  assert(/(?:^|\r?\n)share_\*\.html(?:\r?\n|$)/.test(gitignore), ".gitignore must treat shared-page root captures as transient runtime files");
  assert(/(?:^|\r?\n)output\/note_article_\*\.md(?:\r?\n|$)/.test(gitignore), ".gitignore must treat transient note article drafts as non-source output noise");
  assert(
    architecture.includes("docs/WEEKLY_REPORT_COMPANION.md"),
    "CURRENT_ARCHITECTURE.md must point companion details to the dedicated companion doc"
  );

  const crossProjectMarkers = [
    "WR_TEAMS_CHANNEL_TO_EVIDENCE_V1",
    "WR_OUTLOOK_SENT_TO_EVIDENCE_V1",
    "WR_ADD_WORK_MEMO_TO_EVIDENCE_V1",
    "WR_GET_WEEKLY_EVIDENCE_PACKET_V1",
    "WR_WEEKLY_DRAFT_REMINDER_V1",
    "週報下書きアシスタント",
    "Weekly Evidence",
  ];
  for (const marker of crossProjectMarkers) {
    assert(!architecture.includes(marker), `CURRENT_ARCHITECTURE.md must not inline cross-project companion detail: ${marker}`);
  }

  for (const dirName of [".npm-cache", "node_modules"]) {
    const target = path.join(workspaceRoot, dirName);
    assert(!fs.existsSync(target), `repo root should stay source-first; remove ${dirName} from the workspace root`);
  }

  const disallowedRootFilePatterns = [/^share_.*\.html$/i];
  const rootEntries = fs.readdirSync(workspaceRoot, { withFileTypes: true });
  for (const entry of rootEntries) {
    if (!entry.isFile()) {
      continue;
    }
    const matchedPattern = disallowedRootFilePatterns.find((pattern) => pattern.test(entry.name));
    assert(!matchedPattern, `repo root should stay source-first; move ${entry.name} under runtime/`);
  }

  for (const item of outputSurfacePolicy.transientRoots || []) {
    const target = path.join(workspaceRoot, item.source);
    assert(!fs.existsSync(target), `transient output root must not remain under output/: ${item.source}`);
  }

  const outputRoot = path.join(workspaceRoot, "output");
  if (fs.existsSync(outputRoot)) {
    const outputFiles = fs.readdirSync(outputRoot, { withFileTypes: true })
      .filter((entry) => entry.isFile())
      .map((entry) => entry.name);
    for (const item of outputSurfacePolicy.transientOutputFiles || []) {
      const matcher = globToRegExp(item.pattern);
      const matchedFile = outputFiles.find((fileName) => matcher.test(fileName));
      assert(!matchedFile, `transient output file must move under runtime/: output/${matchedFile}`);
    }
  }

  process.stdout.write("PASS repo_static_hygiene_test\n");
}

main();
