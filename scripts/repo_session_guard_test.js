#!/usr/bin/env node
"use strict";

const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

const {
  buildAutoClosePlan,
  buildCloseoutReport,
  buildPreflightReport,
  classifySessionEntry,
  runAutoClose,
} = require("./lib/repo_session_guard");

function runGit(args, cwd) {
  const result = spawnSync("git", args, {
    cwd,
    windowsHide: true,
    encoding: "utf8",
    timeout: 30000,
  });
  if (result.error || result.status !== 0) {
    throw new Error(`git ${args.join(" ")} failed: ${result.stderr || result.stdout || result.error.message}`);
  }
  return String(result.stdout || "").trim();
}

function writeText(filePath, text) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, text, "utf8");
}

function createRepo(label) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), `repo-session-${label}-`));
  const remote = path.join(root, "remote.git");
  const work = path.join(root, "work");
  fs.mkdirSync(work, { recursive: true });
  runGit(["init", "--bare", remote], root);
  runGit(["init"], work);
  runGit(["config", "user.name", "Repo Session Test"], work);
  runGit(["config", "user.email", "repo-session@example.invalid"], work);
  writeText(path.join(work, "README.md"), "# repo session test\n");
  runGit(["add", "README.md"], work);
  runGit(["commit", "-m", "initial"], work);
  runGit(["branch", "-M", "main"], work);
  runGit(["remote", "add", "origin", remote], work);
  runGit(["push", "-u", "origin", "main"], work);
  return { root, remote, work };
}

function assertClassification(repoPath, expected) {
  const actual = classifySessionEntry({ path: repoPath, code: "??", record: "untracked" });
  assert.strictEqual(actual.classification, expected, `${repoPath} classification`);
}

function main() {
  assertClassification("scripts/example.js", "intended_change_candidate");
  assertClassification("plugins/example/skills/test/SKILL.md", "intended_change_candidate");
  assertClassification("output/report.json", "generated_or_runtime");
  assertClassification("logs/current/operator_summary.json", "generated_or_runtime");
  assertClassification("passport_photo_35x45mm_300dpi.jpg", "private_or_local_artifact");
  assertClassification("local-archive.zip", "private_or_local_artifact");
  assertClassification("scratch/unknown.txt", "unknown_dirty");

  const cleanRepo = createRepo("clean");
  const cleanPreflight = buildPreflightReport({ cwd: cleanRepo.work });
  assert.strictEqual(cleanPreflight.status, "CLEAN");
  assert.strictEqual(cleanPreflight.cleanStartAllowed, true);
  const cleanCloseout = buildCloseoutReport({ cwd: cleanRepo.work });
  assert.strictEqual(cleanCloseout.status, "CLEAN_READY");
  assert.strictEqual(cleanCloseout.cleanStartForNextSession, true);

  const sourceRepo = createRepo("source");
  writeText(path.join(sourceRepo.work, "scripts", "new_tool.js"), "\"use strict\";\n");
  const sourceReport = buildPreflightReport({ cwd: sourceRepo.work });
  assert.strictEqual(sourceReport.status, "DIRTY_BASELINE");
  assert.strictEqual(sourceReport.cleanStartAllowed, false);
  assert.strictEqual(sourceReport.counts.byClassification.intended_change_candidate, 1);

  const outputRepo = createRepo("output");
  writeText(path.join(outputRepo.work, "output", "report.json"), "{}\n");
  const outputReport = buildPreflightReport({ cwd: outputRepo.work });
  assert.strictEqual(outputReport.status, "DIRTY_BASELINE");
  assert.strictEqual(outputReport.counts.byClassification.generated_or_runtime, 1);

  const privateRepo = createRepo("private");
  writeText(path.join(privateRepo.work, "passport_photo_35x45mm_300dpi.jpg"), "not really an image\n");
  const privateReport = buildPreflightReport({ cwd: privateRepo.work });
  assert.strictEqual(privateReport.status, "DIRTY_BASELINE");
  assert.strictEqual(privateReport.counts.byClassification.private_or_local_artifact, 1);

  const aheadRepo = createRepo("ahead");
  writeText(path.join(aheadRepo.work, "README.md"), "# repo session test\n\nlocal commit\n");
  runGit(["add", "README.md"], aheadRepo.work);
  runGit(["commit", "-m", "local change"], aheadRepo.work);
  const aheadCloseout = buildCloseoutReport({ cwd: aheadRepo.work });
  assert.strictEqual(aheadCloseout.status, "PUSH_REQUIRED");
  assert.strictEqual(aheadCloseout.cleanStartForNextSession, false);
  runGit(["push"], aheadRepo.work);
  const pushedCloseout = buildCloseoutReport({ cwd: aheadRepo.work });
  assert.strictEqual(pushedCloseout.status, "CLEAN_READY");
  assert.strictEqual(pushedCloseout.cleanStartForNextSession, true);

  const autoCloseRepo = createRepo("autoclose");
  writeText(path.join(autoCloseRepo.work, "scripts", "session_guard_fixture.js"), "\"use strict\";\n");
  writeText(path.join(autoCloseRepo.work, "passport_source.jpg"), "private fixture\n");
  const autoCloseResult = runAutoClose({ cwd: autoCloseRepo.work, message: "chore(codex): test autoclose" });
  assert.strictEqual(autoCloseResult.status, "CLEAN_READY");
  assert.strictEqual(autoCloseResult.commit.status, "created");
  assert.strictEqual(autoCloseResult.push.status, "pushed");
  assert(autoCloseResult.quarantined.includes("passport_source.jpg"), "private fixture should be quarantined in .git/info/exclude");
  assert.strictEqual(buildCloseoutReport({ cwd: autoCloseRepo.work }).status, "CLEAN_READY");

  const unknownRepo = createRepo("unknown");
  writeText(path.join(unknownRepo.work, "scratch", "unknown.txt"), "unknown\n");
  const unknownPlan = buildAutoClosePlan({ cwd: unknownRepo.work });
  assert.strictEqual(unknownPlan.canRun, false);
  assert.strictEqual(unknownPlan.blockers[0].reason, "unknown_dirty_requires_manual_classification_or_explicit_include");

  console.log("PASS repo_session_guard_test");
}

main();
