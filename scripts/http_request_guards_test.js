"use strict";

const assert = require("assert");

const {
  requestHeaderValue,
  normalizeMimeTypeHeader,
  validateJsonMutationContentType,
  extractExecIdempotencyKey,
  extractGovernanceOverride,
} = require("./lib/http_request_guards");

function expectThrow(fn, pattern) {
  let threw = false;
  try {
    fn();
  } catch (error) {
    threw = true;
    if (pattern) {
      assert(pattern.test(String(error && error.message ? error.message : error)), `expected error matching ${pattern}`);
    }
  }
  assert(threw, "expected function to throw");
}

function main() {
  assert.strictEqual(requestHeaderValue({ headers: { host: "127.0.0.1" } }, "host"), "127.0.0.1");
  assert.strictEqual(requestHeaderValue({ headers: { host: ["a", "b"] } }, "host"), "a");
  assert.strictEqual(requestHeaderValue(null, "host"), "");

  assert.strictEqual(normalizeMimeTypeHeader("application/json; charset=utf-8"), "application/json");
  assert.strictEqual(normalizeMimeTypeHeader("  TEXT/PLAIN  "), "text/plain");
  assert.strictEqual(normalizeMimeTypeHeader(""), "");

  assert.deepStrictEqual(
    validateJsonMutationContentType({ headers: { "content-type": "application/json; charset=utf-8" } }),
    { ok: true, status: 200, error: "" }
  );
  assert.deepStrictEqual(
    validateJsonMutationContentType({ headers: {} }),
    { ok: false, status: 415, error: "content-type must be application/json" }
  );
  assert.deepStrictEqual(
    validateJsonMutationContentType({ headers: {} }, { required: false }),
    { ok: true, status: 200, error: "" }
  );

  const normalizeIdempotencyKey = (value) => {
    const trimmed = String(value || "").trim();
    if (!trimmed) {
      return "";
    }
    if (!/^[A-Za-z0-9._:-]+$/.test(trimmed)) {
      throw new Error("invalid idempotency key");
    }
    return trimmed;
  };
  assert.strictEqual(
    extractExecIdempotencyKey(
      { headers: { "idempotency-key": "abc-123" } },
      { idempotencyKey: "abc-123" },
      { normalizeIdempotencyKey }
    ),
    "abc-123"
  );
  expectThrow(
    () =>
      extractExecIdempotencyKey(
        { headers: { "idempotency-key": "abc-123" } },
        { idempotencyKey: "xyz-789" },
        { normalizeIdempotencyKey }
      ),
    /mismatch/
  );

  const normalizeOverrideRequest = (value) => {
    if (!value || typeof value !== "object" || !value.requestedBy || !value.reason) {
      return null;
    }
    return { requestedBy: value.requestedBy, reason: value.reason, ticket: value.ticket || "" };
  };
  assert.deepStrictEqual(
    extractGovernanceOverride(
      { governanceOverride: { requestedBy: "default", reason: "audit", ticket: "T-1" } },
      { normalizeOverrideRequest }
    ),
    { requestedBy: "default", reason: "audit", ticket: "T-1" }
  );
  assert.strictEqual(extractGovernanceOverride({}, { normalizeOverrideRequest }), null);
  expectThrow(
    () => extractGovernanceOverride({ governanceOverride: { requestedBy: "default" } }, { normalizeOverrideRequest }),
    /invalid governanceOverride/
  );

  process.stdout.write("PASS http_request_guards_test\n");
}

main();
