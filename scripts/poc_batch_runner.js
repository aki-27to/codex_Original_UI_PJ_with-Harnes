"use strict";

const path = require("path");

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function safeText(value, max = 24000) {
  if (typeof value !== "string") return "";
  const trimmed = value.trim();
  if (!trimmed) return "";
  return trimmed.slice(0, max);
}

function normalizeMode(value) {
  const raw = typeof value === "string" ? value.trim().toLowerCase() : "";
  return raw === "sdk" ? "sdk" : "mock";
}

function createRunId() {
  const stamp = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 8);
  return `poc-${stamp}-${rand}`;
}

function getRunnerCapabilities() {
  return {
    mock: true,
    sdk: false,
    sdkReason: "SDK adapter is not configured in this harness yet.",
  };
}

async function runMockJob({ runId, prompt, cwd }) {
  await sleep(120);
  const summary = `mock batch completed: ${prompt.slice(0, 60)}${prompt.length > 60 ? "..." : ""}`;
  return {
    ok: true,
    runId,
    mode: "mock",
    status: "completed",
    summary,
    output: {
      cwd: cwd || process.cwd(),
      sharedHarness: "policy + logging + retry",
    },
  };
}

async function runSdkJob({ runId, prompt, cwd }) {
  const reason = getRunnerCapabilities().sdkReason;
  return {
    ok: false,
    runId,
    mode: "sdk",
    status: "failed",
    summary: `sdk batch unavailable: ${reason}`,
    error: reason,
    output: {
      cwd: cwd || process.cwd(),
      adapter: "not-installed",
      promptSample: prompt.slice(0, 120),
    },
  };
}

async function runBatchJob(input = {}) {
  const mode = normalizeMode(input.mode);
  const prompt = safeText(input.prompt || "");
  const cwd = typeof input.cwd === "string" && input.cwd.trim()
    ? path.resolve(input.cwd.trim())
    : process.cwd();
  if (!prompt) {
    return {
      ok: false,
      runId: createRunId(),
      mode,
      status: "failed",
      summary: "batch prompt is empty",
      error: "prompt is required",
      output: { cwd },
    };
  }
  const runId = createRunId();
  if (mode === "sdk") {
    return runSdkJob({ runId, prompt, cwd });
  }
  return runMockJob({ runId, prompt, cwd });
}

module.exports = {
  runBatchJob,
  getRunnerCapabilities,
};
