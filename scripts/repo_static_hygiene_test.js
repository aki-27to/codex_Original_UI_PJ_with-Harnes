"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");

const workspaceRoot = path.resolve(__dirname, "..");

function read(relativePath) {
  return fs.readFileSync(path.join(workspaceRoot, relativePath), "utf8");
}

function main() {
  const gitignore = read(".gitignore");
  const architecture = read(path.join("docs", "CURRENT_ARCHITECTURE.md"));

  assert(/(?:^|\r?\n)node_modules\/(?:\r?\n|$)/.test(gitignore), ".gitignore must keep node_modules/ out of repo root");
  assert(/(?:^|\r?\n)\.npm-cache\/(?:\r?\n|$)/.test(gitignore), ".gitignore must keep .npm-cache/ out of repo root");
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

  process.stdout.write("PASS repo_static_hygiene_test\n");
}

main();
