"use strict";

function requestHeaderValue(req, name) {
  if (!req || !req.headers) {
    return "";
  }
  const raw = req.headers[name];
  if (Array.isArray(raw)) {
    return String(raw[0] || "");
  }
  return typeof raw === "string" ? raw : "";
}

function normalizeMimeTypeHeader(value) {
  const raw = String(value || "").trim().toLowerCase();
  if (!raw) {
    return "";
  }
  const semicolon = raw.indexOf(";");
  return (semicolon >= 0 ? raw.slice(0, semicolon) : raw).trim();
}

function validateJsonMutationContentType(req, { required = true, expectedMime = "application/json" } = {}) {
  const normalizedExpected = normalizeMimeTypeHeader(expectedMime) || "application/json";
  const normalizedProvided = normalizeMimeTypeHeader(requestHeaderValue(req, "content-type"));
  if (!normalizedProvided) {
    if (required) {
      return { ok: false, status: 415, error: `content-type must be ${normalizedExpected}` };
    }
    return { ok: true, status: 200, error: "" };
  }
  if (normalizedProvided !== normalizedExpected) {
    return {
      ok: false,
      status: 415,
      error: `unsupported content-type: ${normalizedProvided} (requires ${normalizedExpected})`,
    };
  }
  return { ok: true, status: 200, error: "" };
}

function extractExecIdempotencyKey(req, body, { normalizeIdempotencyKey } = {}) {
  if (typeof normalizeIdempotencyKey !== "function") {
    throw new TypeError("normalizeIdempotencyKey is required");
  }
  const headerValue = normalizeIdempotencyKey(requestHeaderValue(req, "idempotency-key"));
  const bodyValue = normalizeIdempotencyKey(body && typeof body.idempotencyKey === "string" ? body.idempotencyKey : "");
  if (headerValue && bodyValue && headerValue !== bodyValue) {
    throw new Error("idempotency key mismatch between header and body");
  }
  return headerValue || bodyValue;
}

function extractGovernanceOverride(body, { normalizeOverrideRequest } = {}) {
  if (typeof normalizeOverrideRequest !== "function") {
    throw new TypeError("normalizeOverrideRequest is required");
  }
  const payload = body && typeof body === "object" ? body : {};
  if (!Object.prototype.hasOwnProperty.call(payload, "governanceOverride")) {
    return null;
  }
  const normalized = normalizeOverrideRequest(payload.governanceOverride);
  if (!normalized) {
    throw new Error("invalid governanceOverride (requestedBy/by and reason are required)");
  }
  return normalized;
}

module.exports = {
  requestHeaderValue,
  normalizeMimeTypeHeader,
  validateJsonMutationContentType,
  extractExecIdempotencyKey,
  extractGovernanceOverride,
};
