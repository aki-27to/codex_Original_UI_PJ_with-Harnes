#!/usr/bin/env node
"use strict";

const assert = require("assert");
const path = require("path");
const {
  loadTaskFamilyProfilesContract,
  selectTaskFamilyProfile,
} = require("./lib/task_family_profile_policy");

function run() {
  const contract = loadTaskFamilyProfilesContract(path.join(__dirname, "config", "task_family_profiles.json"));
  assert.strictEqual(contract.schema, "task-family-profiles.v1", "task family contract schema mismatch");

  const webCreative = selectTaskFamilyProfile({
    prompt: "WEB開発を圧倒的クオリティで実装してください。高級感のあるランディングページとして、AIっぽい安い見た目は避けてください。",
    options: { executionSource: "web_ui" },
    contract,
  });
  assert.strictEqual(webCreative.taskFamily, "web_creative", "web request should classify as web_creative");
  assert.strictEqual(webCreative.minimumPlanningMode, "NORMAL", "web creative should require at least NORMAL planning");
  assert.strictEqual(webCreative.completionContract, "design_acceptance", "web creative should route to design acceptance");

  const deterministic = selectTaskFamilyProfile({
    prompt: "Fix a regression in server.js and add a targeted test for the API response.",
    options: { executionSource: "api_exec" },
    contract,
  });
  assert.strictEqual(deterministic.taskFamily, "deterministic_code", "bug-fix prompt should stay deterministic_code");

  const research = selectTaskFamilyProfile({
    prompt: "Research three competitors, compare their strengths, and summarize benchmark findings with sources.",
    contract,
  });
  assert.strictEqual(research.taskFamily, "research_analysis", "research prompt should select research_analysis");

  const planning = selectTaskFamilyProfile({
    prompt: "Create an architecture plan and product roadmap for the next release.",
    contract,
  });
  assert.strictEqual(planning.taskFamily, "planning_design", "planning prompt should select planning_design");
}

try {
  run();
  console.log("PASS task_family_profile_policy_test");
} catch (error) {
  console.error(`FAIL task_family_profile_policy_test: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}
