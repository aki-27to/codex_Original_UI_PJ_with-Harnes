#!/usr/bin/env node
"use strict";

const {
  buildPromptAudit,
  defaultPromptCharLimit,
  evaluateImagePayloadBudget,
  formatBytes,
} = require("./lib/exec_payload_policy");

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function testPromptAuditNoTruncation() {
  const audit = buildPromptAudit({
    rawPrompt: "short prompt",
    normalizedPrompt: "short prompt",
    maxChars: defaultPromptCharLimit,
  });
  assert(audit.truncated === false, "short prompt should not be marked truncated");
  assert(audit.inputLength === audit.outputLength, "short prompt lengths should match");
}

function testPromptAuditWithTruncation() {
  const raw = "a".repeat(40);
  const normalized = "a".repeat(12);
  const audit = buildPromptAudit({
    rawPrompt: raw,
    normalizedPrompt: normalized,
    maxChars: 12,
  });
  assert(audit.truncated === true, "long prompt should be marked truncated");
  assert(audit.inputLength === 40, "input length should match original");
  assert(audit.outputLength === 12, "output length should match normalized");
}

function testImageBudgetDecodedExceeded() {
  const result = evaluateImagePayloadBudget(
    [
      { sizeBytes: 80, encodedBytes: 120 },
      { sizeBytes: 50, encodedBytes: 70 },
    ],
    { maxDecodedBytes: 120, maxEncodedBytes: 999 }
  );
  assert(result.ok === false, "decoded limit exceed should fail");
  assert(result.decodedExceeded === true, "decodedExceeded should be true");
  assert(result.encodedExceeded === false, "encodedExceeded should be false");
}

function testImageBudgetEncodedExceeded() {
  const result = evaluateImagePayloadBudget(
    [
      { sizeBytes: 80, encodedBytes: 120 },
      { sizeBytes: 50, encodedBytes: 70 },
    ],
    { maxDecodedBytes: 999, maxEncodedBytes: 150 }
  );
  assert(result.ok === false, "encoded limit exceed should fail");
  assert(result.decodedExceeded === false, "decodedExceeded should be false");
  assert(result.encodedExceeded === true, "encodedExceeded should be true");
}

function testImageBudgetPassAndFormatting() {
  const result = evaluateImagePayloadBudget(
    [
      { sizeBytes: 80, encodedBytes: 120 },
      { sizeBytes: 50, encodedBytes: 70 },
    ],
    { maxDecodedBytes: 200, maxEncodedBytes: 300 }
  );
  assert(result.ok === true, "limits not exceeded should pass");
  assert(formatBytes(1024) === "1.0KB", "formatBytes should format kilobytes");
}

function run() {
  const tests = [
    ["prompt audit no truncation", testPromptAuditNoTruncation],
    ["prompt audit truncation", testPromptAuditWithTruncation],
    ["image decoded budget exceed", testImageBudgetDecodedExceeded],
    ["image encoded budget exceed", testImageBudgetEncodedExceeded],
    ["image budget pass and bytes format", testImageBudgetPassAndFormatting],
  ];
  let passed = 0;
  for (const [name, fn] of tests) {
    fn();
    passed += 1;
    console.log(`[exec-payload-policy-test] PASS ${name}`);
  }
  console.log(`[exec-payload-policy-test] total=${tests.length} pass=${passed} fail=0`);
  console.log("PASS");
}

try {
  run();
} catch (error) {
  console.log(`[exec-payload-policy-test] FAIL ${error instanceof Error ? error.message : String(error)}`);
  console.log("FAIL");
  process.exitCode = 1;
}
