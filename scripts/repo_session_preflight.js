#!/usr/bin/env node
"use strict";

const path = require("path");
const { buildPreflightReport, formatReport } = require("./lib/repo_session_guard");

function parseArgs(argv) {
  const options = {
    cwd: process.cwd(),
    json: false,
    allowDirty: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--json") {
      options.json = true;
    } else if (arg === "--allow-dirty") {
      options.allowDirty = true;
    } else if (arg === "--cwd") {
      options.cwd = path.resolve(argv[index + 1] || process.cwd());
      index += 1;
    } else if (arg.startsWith("--cwd=")) {
      options.cwd = path.resolve(arg.slice("--cwd=".length));
    }
  }
  return options;
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const report = buildPreflightReport({ cwd: options.cwd });
  process.stdout.write(options.json ? `${JSON.stringify(report, null, 2)}\n` : formatReport(report));
  if (!options.allowDirty && !report.cleanStartAllowed) {
    process.exit(2);
  }
}

if (require.main === module) {
  main();
}
