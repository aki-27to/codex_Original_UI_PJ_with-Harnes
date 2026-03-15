#!/usr/bin/env node
"use strict";

const assert = require("assert");
const {
  evaluateFamilyCompletion,
  inferWorkspaceLocked,
  normalizeCompletionContract,
} = require("./lib/family_completion_policy");
const {
  loadDesignAcceptanceContract,
  normalizeUserTasteMemoryStore,
} = require("./lib/intent_first_policy");

function testNormalizeCompletionContract() {
  const normalized = normalizeCompletionContract({
    planningContext: {
      selection: {
        taskFamily: "web_creative",
        familyProfileId: "web_creative",
        familyProfile: {
          completionContract: "design_acceptance",
        },
      },
    },
  });
  assert.strictEqual(normalized.taskFamily, "web_creative", "task family mismatch");
  assert.strictEqual(normalized.familyProfileId, "web_creative", "family profile id mismatch");
  assert.strictEqual(normalized.completionContract, "design_acceptance", "completion contract mismatch");
}

function testInferWorkspaceLocked() {
  assert.strictEqual(
    inferWorkspaceLocked({
      executionSource: "web_ui",
      cwd: "C:\\repo",
      workspaceRoot: "C:\\repo",
    }),
    true,
    "matching web_ui workspace should count as locked"
  );
  assert.strictEqual(
    inferWorkspaceLocked({
      executionSource: "web_ui",
      cwd: "",
      workspaceRoot: "C:\\repo",
    }),
    false,
    "missing web_ui cwd should count as unlocked"
  );
  assert.strictEqual(
    inferWorkspaceLocked({
      executionSource: "api_exec",
      cwd: "",
      workspaceRoot: "C:\\repo",
    }),
    true,
    "non-web_ui sources should not require a workspace lock"
  );
}

function testDesignAcceptanceFailure() {
  const verdict = evaluateFamilyCompletion({
    planningContext: {
      selection: {
        taskFamily: "web_creative",
        familyProfileId: "web_creative",
        familyProfile: {
          completionContract: "design_acceptance",
        },
      },
    },
    prompt: "Create a better recruitment website design and improve the UI quality.",
    executionSource: "web_ui",
    cwd: "",
    workspaceRoot: "C:\\repo",
    docSyncComplete: false,
    visualEvidence: { desktopReview: false, mobileReview: false },
    dispatchChildren: ["frontend_worker"],
    sampleMcpTools: [],
    sampleCommands: [],
    commandExecutions: 0,
    designAcceptanceContract: loadDesignAcceptanceContract(),
    tasteMemoryStore: normalizeUserTasteMemoryStore({}),
  });
  assert.strictEqual(verdict.applies, true, "design acceptance gate should apply");
  assert.strictEqual(verdict.status, "failed_validation", "missing hard requirements should fail validation");
  assert.ok(
    verdict.missingHard.some((entry) => entry && entry.reason === "intent_workspace_lock_missing"),
    "workspace lock should be required for web_ui"
  );
}

function testDesignAcceptancePass() {
  const verdict = evaluateFamilyCompletion({
    planningContext: {
      selection: {
        taskFamily: "web_creative",
        familyProfileId: "web_creative",
        familyProfile: {
          completionContract: "design_acceptance",
        },
      },
    },
    prompt: "Create a better recruitment website design and improve the UI quality.",
    executionSource: "web_ui",
    cwd: "C:\\repo",
    workspaceRoot: "C:\\repo",
    docSyncComplete: true,
    visualEvidence: { desktopReview: true, mobileReview: true },
    dispatchChildren: ["frontend_worker", "reviewer"],
    sampleMcpTools: ["playwright"],
    sampleCommands: ["npm run build", "node scripts/app_server_smoke_test.js"],
    commandExecutions: 2,
    designAcceptanceContract: loadDesignAcceptanceContract(),
    tasteMemoryStore: normalizeUserTasteMemoryStore({}),
  });
  assert.strictEqual(verdict.status, "pass", "complete evidence should satisfy design acceptance");
}

function testDefaultContractIsSkipped() {
  const verdict = evaluateFamilyCompletion({
    planningContext: {
      selection: {
        taskFamily: "deterministic_code",
        familyProfileId: "deterministic_code",
        familyProfile: {
          completionContract: "task_outcome_default",
        },
      },
    },
    prompt: "Implement a login endpoint.",
  });
  assert.strictEqual(verdict.applies, false, "default completion contract should not apply extra family gate");
  assert.strictEqual(verdict.status, "not_applicable", "default completion contract should be skipped");
}

function run() {
  const tests = [
    ["normalize completion contract", testNormalizeCompletionContract],
    ["infer workspace lock", testInferWorkspaceLocked],
    ["design acceptance failure", testDesignAcceptanceFailure],
    ["design acceptance pass", testDesignAcceptancePass],
    ["default completion skipped", testDefaultContractIsSkipped],
  ];
  let passed = 0;
  for (const [name, fn] of tests) {
    fn();
    passed += 1;
    console.log(`[family-completion-policy-test] PASS ${name}`);
  }
  console.log(`[family-completion-policy-test] total=${tests.length} pass=${passed} fail=0`);
  console.log("PASS");
}

try {
  run();
} catch (error) {
  console.log(`[family-completion-policy-test] FAIL ${error instanceof Error ? error.message : String(error)}`);
  console.log("FAIL");
  process.exitCode = 1;
}
