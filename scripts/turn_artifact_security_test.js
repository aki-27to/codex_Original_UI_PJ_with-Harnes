#!/usr/bin/env node
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const { __riskAudit } = require("../server");

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function testRedactionMasksSecrets() {
  const stats = { replacements: 0, byRule: {} };
  const source =
    "authorization: Bearer abcdefghijklmnopqrstuvwxyz123456 sk-proj-1234567890abcdefghij dev@example.com";
  const redacted = __riskAudit.applyTurnArtifactRedactionToText(source, stats);
  assert(!redacted.includes("abcdefghijklmnopqrstuvwxyz123456"), "bearer token should be redacted");
  assert(!redacted.includes("sk-proj-1234567890abcdefghij"), "openai key should be redacted");
  assert(!redacted.includes("dev@example.com"), "email should be redacted");
  assert(redacted.includes("[REDACTED]"), "redacted marker should exist");
  assert(Number(stats.replacements) >= 3, "redaction replacement count should increase");
}

function testNestedValueRedaction() {
  const stats = { replacements: 0, byRule: {} };
  const payload = {
    event: "sample",
    nested: {
      token: "token=abcd1234abcd1234abcd1234",
      arr: ["normal", "secret: very-secret-value-12345"],
    },
  };
  const redacted = __riskAudit.redactTurnArtifactValue(payload, stats);
  const serialized = JSON.stringify(redacted);
  assert(!serialized.includes("very-secret-value-12345"), "nested secret should be redacted");
  assert(!serialized.includes("abcd1234abcd1234abcd1234"), "token value should be redacted");
  assert(Number(stats.replacements) >= 2, "nested redaction should increment stats");
}

function createTurnDir(rootDir, dayStamp, turnName, byteSize, ageDays) {
  const dayDir = path.join(rootDir, dayStamp);
  const turnDir = path.join(dayDir, turnName);
  fs.mkdirSync(turnDir, { recursive: true });
  fs.writeFileSync(path.join(turnDir, "events.ndjson"), "x".repeat(byteSize), "utf8");
  const oldTs = Date.now() - ageDays * 24 * 60 * 60 * 1000;
  fs.utimesSync(turnDir, oldTs / 1000, oldTs / 1000);
  return turnDir;
}

function testPruneByAgeAndSize() {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "codex-turn-artifacts-"));
  try {
    createTurnDir(tempRoot, "2026-02-01", "old-turn", 240, 10);
    createTurnDir(tempRoot, "2026-02-22", "new-turn-a", 180, 0);
    createTurnDir(tempRoot, "2026-02-22", "new-turn-b", 180, 0);

    const summary = __riskAudit.pruneTurnArtifactsStorage({
      rootDir: tempRoot,
      maxBytes: 200,
      maxDays: 2,
      now: Date.now(),
    });
    assert(summary && typeof summary === "object", "prune should return summary object");
    assert(summary.checkedDirs >= 3, "prune should inspect all seeded directories");
    assert(summary.remainingBytes <= 200, "remaining bytes should respect maxBytes");
    const remainingTurnDirs = fs
      .readdirSync(tempRoot, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .flatMap((dayEntry) =>
        fs
          .readdirSync(path.join(tempRoot, dayEntry.name), { withFileTypes: true })
          .filter((entry) => entry.isDirectory())
      ).length;
    assert(remainingTurnDirs <= 1, "prune should keep at most one turn directory under this budget");
  } finally {
    try {
      fs.rmSync(tempRoot, { recursive: true, force: true });
    } catch {
      // ignore
    }
  }
}

function testIdempotencySnapshotHelpers() {
  const waitMs = __riskAudit.normalizeExecIdempotencyWaitMs(999999);
  assert(waitMs <= 180000, "wait max clamp should apply");
  const snapshot = __riskAudit.buildExecIdempotencySnapshot("smoke-key", {
    key: "smoke-key",
    state: "completed",
    createdAt: 1,
    updatedAt: 2,
    expiresAt: 3,
    metadata: { method: "POST", path: "/api/exec", requestHash: "abc" },
    outcome: { status: "completed", turnId: "t1", threadId: "th1", completedAt: 10 },
  });
  assert(snapshot && snapshot.key === "smoke-key", "snapshot should preserve key");
  assert(snapshot.statusApiPath === "/api/exec/idempotency/smoke-key", "status API path should be generated");
}

function run() {
  const tests = [
    ["redaction masks secrets", testRedactionMasksSecrets],
    ["redaction on nested payload", testNestedValueRedaction],
    ["artifact prune by age and size", testPruneByAgeAndSize],
    ["idempotency helper snapshot", testIdempotencySnapshotHelpers],
  ];
  let passed = 0;
  for (const [name, testFn] of tests) {
    testFn();
    passed += 1;
    console.log(`[turn-artifact-security-test] PASS ${name}`);
  }
  console.log(`[turn-artifact-security-test] total=${tests.length} pass=${passed} fail=0`);
  console.log("PASS");
}

try {
  run();
} catch (error) {
  console.log(`[turn-artifact-security-test] FAIL ${error instanceof Error ? error.message : String(error)}`);
  console.log("FAIL");
  process.exitCode = 1;
}
