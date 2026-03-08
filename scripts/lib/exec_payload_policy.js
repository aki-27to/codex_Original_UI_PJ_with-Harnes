"use strict";

const defaultPromptCharLimit = 24000;

function safeTrimmedString(value, max = 12000) {
  if (typeof value !== "string") {
    return "";
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return "";
  }
  return trimmed.slice(0, max);
}

function toNonNegativeInt(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return 0;
  }
  return Math.max(0, Math.trunc(parsed));
}

function formatBytes(value) {
  const bytes = toNonNegativeInt(value);
  if (bytes < 1024) {
    return `${bytes}B`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)}KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(2)}MB`;
}

function buildPromptAudit({ rawPrompt, normalizedPrompt, maxChars = defaultPromptCharLimit }) {
  const input = typeof rawPrompt === "string" ? rawPrompt.trim() : "";
  const output = safeTrimmedString(normalizedPrompt, maxChars);
  const inputLength = input.length;
  const outputLength = output.length;
  return {
    limit: toNonNegativeInt(maxChars),
    inputLength,
    outputLength,
    truncated: inputLength > outputLength,
  };
}

function evaluateImagePayloadBudget(images, { maxDecodedBytes = 0, maxEncodedBytes = 0 } = {}) {
  const list = Array.isArray(images) ? images : [];
  let decodedBytes = 0;
  let encodedBytes = 0;
  for (const item of list) {
    decodedBytes += toNonNegativeInt(item && item.sizeBytes);
    encodedBytes += toNonNegativeInt(item && item.encodedBytes);
  }
  const decodedExceeded = toNonNegativeInt(maxDecodedBytes) > 0 && decodedBytes > toNonNegativeInt(maxDecodedBytes);
  const encodedExceeded = toNonNegativeInt(maxEncodedBytes) > 0 && encodedBytes > toNonNegativeInt(maxEncodedBytes);
  return {
    count: list.length,
    decodedBytes,
    encodedBytes,
    decodedExceeded,
    encodedExceeded,
    ok: !decodedExceeded && !encodedExceeded,
  };
}

module.exports = {
  buildPromptAudit,
  defaultPromptCharLimit,
  evaluateImagePayloadBudget,
  formatBytes,
};
