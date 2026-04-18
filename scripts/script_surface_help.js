#!/usr/bin/env node
"use strict";

const path = require("path");

const packageJson = require(path.join(__dirname, "..", "package.json"));

const sections = [
  {
    title: "Front door",
    scripts: ["start", "help:scripts"],
  },
  {
    title: "Document tooling",
    scripts: ["tooling:document:bootstrap", "tooling:document:status"],
  },
  {
    title: "Quality gates",
    scripts: [
      "test:repo-quality",
      "test:repo-quality:governance",
      "test:repo-quality:runtime",
      "test:repo-quality:surfaces",
      "reviewer:baseline-comparison",
      "regression:public",
      "gate:pr",
      "eval:holdout",
    ],
  },
  {
    title: "Housekeeping",
    scripts: ["housekeeping:surfaces", "housekeeping:runtime-surface", "housekeeping:output-surface"],
  },
  {
    title: "Artifacts and memory",
    scripts: ["artifact:memory-public", "test:memory-public"],
  },
  {
    title: "Programs",
    scripts: ["program:externalization", "program:claim-closure", "program:repo-closure:preflight"],
  },
  {
    title: "Learning",
    scripts: ["learn:openai-blog", "learn:anthropic-engineering", "learn:self-improvement-gate"],
  },
];

function printSection(section) {
  const available = section.scripts.filter((name) => Object.prototype.hasOwnProperty.call(packageJson.scripts, name));
  if (!available.length) {
    return;
  }
  process.stdout.write(`\n${section.title}\n`);
  for (const name of available) {
    process.stdout.write(`- npm run ${name}\n`);
  }
}

function main() {
  process.stdout.write("Recommended script surface for this repo\n");
  process.stdout.write("Use these entrypoints first; the rest of package.json is broader program surface.\n");
  for (const section of sections) {
    printSection(section);
  }
}

main();
