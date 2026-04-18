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
  assert(contract.layoutIntegrityRequired === true, "layout integrity gate should default to required");
  assert(contract.worstStateReviewRequired === true, "worst-state gate should default to required");
  assert(contract.copyFitRequired === true, "copy-fit gate should default to required");
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
  assert(prompt.includes("Primary objective:"), "primary objective directive missing");
  assert(prompt.includes("Intervention policy:"), "intervention policy directive missing");
  assert(prompt.includes("Intent lock:"), "intent lock directive missing");
  assert(prompt.includes("Acceptance lock:"), "acceptance lock directive missing");
  assert(prompt.includes("Correction loop:"), "correction loop directive missing");
  assert(prompt.includes("Layout gates:"), "layout gate directive missing");
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
    visualEvidence: {
      desktopReview: true,
      mobileReview: true,
      layoutIntegrityReview: true,
      worstStateReview: true,
      copyFitReview: true,
    },
    dispatchChildren: ["frontend_worker", "reviewer"],
    sampleMcpTools: ["playwright"],
    sampleCommands: ["npm run build", "node scripts/app_server_smoke_test.js"],
    commandExecutions: 2,
  });
  assert(pass.status === "pass", "gate should pass with required evidence");
}

function testGateRequiresLayoutAndWorstStateReview() {
  const contract = loadDesignAcceptanceContract();
  const store = normalizeUserTasteMemoryStore({});
  const verdict = evaluateIntentFirstGates({
    contract,
    store,
    prompt: "Redesign the site UI",
    workspaceLocked: true,
    docSyncComplete: true,
    visualEvidence: { desktopReview: true, mobileReview: true },
    dispatchChildren: ["frontend_worker", "reviewer"],
    sampleMcpTools: ["playwright"],
    sampleCommands: ["npm run build"],
    commandExecutions: 1,
  });
  assert(verdict.status === "failed_validation", "missing layout integrity or worst-state review should block completion");
  assert(verdict.missingHard.some((entry) => entry && entry.reason === "intent_layout_integrity_review_missing"), "layout integrity reason should be reported");
  assert(verdict.missingHard.some((entry) => entry && entry.reason === "intent_worst_state_review_missing"), "worst-state reason should be reported");
}

function testGateRequiresCopyFitReview() {
  const contract = loadDesignAcceptanceContract();
  const store = normalizeUserTasteMemoryStore({});
  const verdict = evaluateIntentFirstGates({
    contract,
    store,
    prompt: "Redesign the site UI",
    workspaceLocked: true,
    docSyncComplete: true,
    visualEvidence: {
      desktopReview: true,
      mobileReview: true,
      layoutIntegrityReview: true,
      worstStateReview: true,
    },
    dispatchChildren: ["frontend_worker", "reviewer"],
    sampleMcpTools: ["playwright"],
    sampleCommands: ["npm run build"],
    commandExecutions: 1,
  });
  assert(verdict.status === "failed_validation", "missing copy-fit review should block completion");
  assert(verdict.missingHard.some((entry) => entry && entry.reason === "intent_copy_fit_review_missing"), "copy-fit reason should be reported");
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
    visualEvidence: {
      desktopReview: true,
      mobileReview: true,
      layoutIntegrityReview: true,
      worstStateReview: true,
      copyFitReview: true,
    },
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
  assert(summary.verificationLock && summary.verificationLock.enabled === true, "runtime summary verification lock missing");
  assert(summary.verificationLock.mode === "fail_closed", "runtime summary verification lock mode mismatch");
  assert(summary.verificationLock.scope === "all_design_sensitive_requests", "runtime summary verification lock scope mismatch");
  assert(summary.requiredGates.some((entry) => entry && entry.id === "layout_integrity"), "runtime summary should surface layout integrity gate");
  assert(summary.requiredGates.some((entry) => entry && entry.id === "worst_state_review"), "runtime summary should surface worst-state gate");
  assert(summary.requiredGates.some((entry) => entry && entry.id === "copy_fit_review"), "runtime summary should surface copy-fit gate");
  assert(Array.isArray(summary.contract.layoutFailureModes) && summary.contract.layoutFailureModes.length >= 1, "runtime summary should expose layout failure modes");
  assert(Array.isArray(summary.contract.keywords) && summary.contract.keywords.includes("ui"), "runtime summary contract keywords missing");
  assert(summary.correctionLearning && summary.correctionLearning.contract, "runtime summary should expose correction learning contract");
  assert(summary.correctionLearning.summary && summary.correctionLearning.summary.correctionEventRequired === true, "correction learning should require correction events");
  assert(Array.isArray(summary.correctionLearning.contract.eventFields) && summary.correctionLearning.contract.eventFields.includes("observed_miss"), "correction learning event fields missing");
  assert(
    summary.tasteMemory.activeProfile.autonomy
      && summary.tasteMemory.activeProfile.autonomy.interventionPreference === "minimize_user_intervention",
    "runtime summary autonomy preference missing"
  );
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
    ["layout and worst-state gate", testGateRequiresLayoutAndWorstStateReview],
    ["copy-fit gate", testGateRequiresCopyFitReview],
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
