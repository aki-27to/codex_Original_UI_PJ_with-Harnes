#!/usr/bin/env node
"use strict";

const path = require("path");
const { runAutoClose } = require("./lib/repo_session_guard");

function parseArgs(argv) {
  const options = {
    cwd: process.cwd(),
    dryRun: false,
    json: false,
    push: true,
    quarantinePrivate: true,
    includePrivate: false,
    includeUnknown: false,
    message: "",
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--dry-run") {
      options.dryRun = true;
    } else if (arg === "--json") {
      options.json = true;
    } else if (arg === "--no-push") {
      options.push = false;
    } else if (arg === "--no-private-quarantine") {
      options.quarantinePrivate = false;
    } else if (arg === "--include-private") {
      options.includePrivate = true;
    } else if (arg === "--include-unknown") {
      options.includeUnknown = true;
    } else if (arg === "--message" || arg === "-m") {
      options.message = argv[index + 1] || "";
      index += 1;
    } else if (arg.startsWith("--message=")) {
      options.message = arg.slice("--message=".length);
    } else if (arg === "--cwd") {
      options.cwd = path.resolve(argv[index + 1] || process.cwd());
      index += 1;
    } else if (arg.startsWith("--cwd=")) {
      options.cwd = path.resolve(arg.slice("--cwd=".length));
    }
  }
  return options;
}

function formatAutoCloseResult(result) {
  const plan = result.plan || {};
  const lines = [];
  lines.push(`[repo-session] autoclose status=${result.status}`);
  lines.push(`[repo-session] dry_run=${result.dryRun ? 1 : 0}`);
  if (plan.branch && plan.branch.name) {
    lines.push(`[repo-session] branch=${plan.branch.name} upstream=${plan.branch.upstream || "none"} ahead=${plan.branch.ahead || 0} behind=${plan.branch.behind || 0}`);
  }
  lines.push(`[repo-session] stage=${plan.stageCount || 0} quarantine=${plan.quarantineCount || 0} blockers=${plan.blockerCount || 0}`);
  for (const blocker of (plan.blockers || []).slice(0, 20)) {
    lines.push(` - BLOCK ${blocker.path} :: ${blocker.reason}`);
  }
  for (const entry of (plan.quarantineEntries || []).slice(0, 20)) {
    lines.push(` - QUARANTINE ${entry.path} :: private/local untracked -> .git/info/exclude`);
  }
  for (const entry of (plan.stageEntries || []).slice(0, 40)) {
    lines.push(` - STAGE ${entry.code} ${entry.path} :: ${entry.classification}`);
  }
  if ((plan.stageEntries || []).length > 40) {
    lines.push(` - ... ${(plan.stageEntries || []).length - 40} more staged candidates`);
  }
  if (result.commit && result.commit.status !== "not_run") {
    lines.push(`[repo-session] commit=${result.commit.status}${result.commit.hash ? ` ${result.commit.hash.slice(0, 12)}` : ""}`);
  }
  if (result.push && result.push.status !== "not_run") {
    lines.push(`[repo-session] push=${result.push.status}`);
  }
  if (result.finalReport) {
    lines.push(`[repo-session] final=${result.finalReport.status}`);
  }
  return `${lines.join("\n")}\n`;
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const result = runAutoClose(options);
  process.stdout.write(options.json ? `${JSON.stringify(result, null, 2)}\n` : formatAutoCloseResult(result));
  if (result.status !== "CLEAN_READY" && result.status !== "DRY_RUN_READY" && result.status !== "DRY_RUN_ALREADY_CLEAN") {
    process.exit(2);
  }
}

if (require.main === module) {
  main();
}
