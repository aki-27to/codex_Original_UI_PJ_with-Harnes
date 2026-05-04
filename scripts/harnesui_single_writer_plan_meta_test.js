#!/usr/bin/env node
"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const appPath = path.join(__dirname, "..", "web", "01.HarnesUI", "app.js");
const source = fs.readFileSync(appPath, "utf8");

function extractFunction(name) {
  const signature = `function ${name}(`;
  const start = source.indexOf(signature);
  assert(start >= 0, `${name} helper not found`);
  let parenDepth = 0;
  let bodyStart = -1;
  for (let index = start + signature.length - 1; index < source.length; index += 1) {
    const char = source[index];
    if (char === "(") parenDepth += 1;
    if (char === ")") parenDepth -= 1;
    if (char === "{" && parenDepth === 0) {
      bodyStart = index;
      break;
    }
  }
  assert(bodyStart >= 0, `${name} helper body not found`);
  let depth = 0;
  for (let index = bodyStart; index < source.length; index += 1) {
    const char = source[index];
    if (char === "{") depth += 1;
    if (char === "}") {
      depth -= 1;
      if (depth === 0) return source.slice(start, index + 1);
    }
  }
  throw new Error(`failed to extract ${name}`);
}

function loadHelpers() {
  const context = { Array, Boolean, Number, Object, String };
  vm.runInNewContext(
    [
      extractFunction("createHarnessPlanMeta"),
      extractFunction("ensureHarnessPlanMeta"),
      extractFunction("planCoordinationSummaryForUi"),
      "this.helpers={ createHarnessPlanMeta, ensureHarnessPlanMeta, planCoordinationSummaryForUi };",
    ].join("\n\n"),
    context
  );
  return context.helpers;
}

function run() {
  const { createHarnessPlanMeta, ensureHarnessPlanMeta, planCoordinationSummaryForUi } = loadHelpers();
  const blank = createHarnessPlanMeta();
  assert.strictEqual(blank.coordinationMode, "", "blank plan meta should include coordinationMode");
  assert.strictEqual(Array.isArray(blank.advisoryAgents), true, "blank plan meta should include advisoryAgents");
  assert.strictEqual(blank.advisoryAgents.length, 0, "blank advisoryAgents should start empty");

  const holder = {
    planMeta: {
      integrationOwner: "backend_worker",
      advisoryAgents: ["infra_worker", "frontend_worker"],
      freshReviewerRequired: 1,
    },
  };
  const normalized = ensureHarnessPlanMeta(holder);
  assert.strictEqual(normalized.advisoryAgents.join(","), "infra_worker,frontend_worker");
  assert.strictEqual(normalized.freshReviewerRequired, 1);
  assert.strictEqual(
    planCoordinationSummaryForUi(normalized),
    "writer backend_worker / advisors infra_worker, frontend_worker / fresh reviewer"
  );

  console.log("PASS harnesui_single_writer_plan_meta_test");
}

try {
  run();
} catch (error) {
  console.error(`FAIL harnesui_single_writer_plan_meta_test: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}
