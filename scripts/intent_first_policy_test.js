#!/usr/bin/env node
"use strict";

const path = require("path");
const {
  buildIntentFirstPrompt,
  evaluateIntentFirstGates,
  isDesignSensitiveRequest,
  loadDesignAcceptanceContract,
  loadUserTasteMemoryStore,
  normalizeUserTasteMemoryStore,
  requiresWorkspaceLockForSource,
  summarizeIntentFirstRuntime,
} = require("./lib/intent_first_policy");

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function testLoadDefaults() {
  const contract = loadDesignAcceptanceContract(path.join(__dirname, "config", "design_acceptance_contract.json"));
  const store = loadUserTasteMemoryStore({
    seedPath: path.join(__dirname, "config", "default_user_taste_memory.json"),
  });
  assert(contract && contract.mode === "intent-first", "contract mode mismatch");
  assert(Array.isArray(contract.workspaceLock.requiredForSources) && contract.workspaceLock.requiredForSources.includes("web_ui"), "workspace lock source mismatch");
  assert(store && store.activeProfileId === "default", "default profile missing");
}

function testDesignSensitivity() {
  const contract = loadDesignAcceptanceContract();
  assert(isDesignSensitiveRequest({ prompt: "Create a better website design", contract }) === true, "design prompt should be sensitive");
  assert(isDesignSensitiveRequest({ prompt: "Summarize this log file", contract }) === false, "non-design prompt should not be sensitive");
}

function testPromptEnvelope() {
  const contract = loadDesignAcceptanceContract();
  const store = normalizeUserTasteMemoryStore({});
  const prompt = buildIntentFirstPrompt({
    prompt: "Make the site feel real.",
    contract,
    activeProfile: store.profiles[store.activeProfileId],
  });
  assert(prompt.includes("Intent-First Brief"), "prompt envelope title missing");
  assert(prompt.includes("Make the site feel real."), "original prompt missing");
}

function testGateEvaluation() {
  const contract = loadDesignAcceptanceContract();
  const store = normalizeUserTasteMemoryStore({});
  const fail = evaluateIntentFirstGates({
    contract,
    store,
    prompt: "Redesign the site UI",
    workspaceLocked: false,
    docSyncComplete: false,
    visualEvidence: { desktopReview: false, mobileReview: false },
    dispatchChildren: ["frontend_worker"],
    sampleMcpTools: [],
    sampleCommands: [],
    commandExecutions: 0,
  });
  assert(fail.applies === true, "gate should apply");
  assert(fail.missingHard.length >= 3, "gate should report multiple missing requirements");
  const pass = evaluateIntentFirstGates({
    contract,
    store,
    prompt: "Redesign the site UI",
    workspaceLocked: true,
    docSyncComplete: true,
    visualEvidence: { desktopReview: true, mobileReview: true },
    dispatchChildren: ["frontend_worker", "reviewer"],
    sampleMcpTools: ["playwright"],
    sampleCommands: ["npm run build", "node scripts/app_server_smoke_test.js"],
    commandExecutions: 2,
  });
  assert(pass.status === "pass", "gate should pass with required evidence");
}

function testGateRequiresDocumentationSync() {
  const contract = loadDesignAcceptanceContract();
  const store = normalizeUserTasteMemoryStore({});
  const verdict = evaluateIntentFirstGates({
    contract,
    store,
    prompt: "Redesign the site UI",
    workspaceLocked: true,
    docSyncComplete: false,
    visualEvidence: { desktopReview: true, mobileReview: true },
    dispatchChildren: ["frontend_worker", "reviewer"],
    sampleMcpTools: ["playwright"],
    sampleCommands: ["npm run build", "node scripts/app_server_smoke_test.js"],
    commandExecutions: 2,
  });
  assert(verdict.status === "failed_validation", "missing documentation sync should block completion");
  assert(verdict.missingHard.some((entry) => entry && entry.reason === "intent_documentation_sync_missing"), "documentation sync reason should be reported");
}

function testRuntimeSummary() {
  const contract = loadDesignAcceptanceContract();
  const store = normalizeUserTasteMemoryStore({});
  const summary = summarizeIntentFirstRuntime({ contract, store });
  assert(summary && summary.tasteMemory && summary.tasteMemory.activeProfile, "runtime summary active profile missing");
}

function testWorkspaceLockSourceCheck() {
  const contract = loadDesignAcceptanceContract();
  assert(requiresWorkspaceLockForSource({ contract, executionSource: "web_ui" }) === true, "web_ui should require workspace lock");
  assert(requiresWorkspaceLockForSource({ contract, executionSource: "api_exec" }) === false, "api_exec should not require workspace lock");
}

function run() {
  const tests = [
    ["load defaults", testLoadDefaults],
    ["design sensitivity", testDesignSensitivity],
    ["prompt envelope", testPromptEnvelope],
    ["gate evaluation", testGateEvaluation],
    ["documentation sync gate", testGateRequiresDocumentationSync],
    ["workspace lock source check", testWorkspaceLockSourceCheck],
    ["runtime summary", testRuntimeSummary],
  ];
  let passed = 0;
  for (const [name, fn] of tests) {
    fn();
    passed += 1;
    console.log(`[intent-first-policy-test] PASS ${name}`);
  }
  console.log(`[intent-first-policy-test] total=${tests.length} pass=${passed} fail=0`);
  console.log("PASS");
}

try {
  run();
} catch (error) {
  console.log(`[intent-first-policy-test] FAIL ${error instanceof Error ? error.message : String(error)}`);
  console.log("FAIL");
  process.exitCode = 1;
}
