#!/usr/bin/env node
"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const appPath = path.join(__dirname, "..", "web", "01.HarnesUI", "app.js");
const indexHtmlPath = path.join(__dirname, "..", "web", "01.HarnesUI", "index.html");
const source = fs.readFileSync(appPath, "utf8");
const indexHtml = fs.readFileSync(indexHtmlPath, "utf8");

function extractConst(name) {
  const match = source.match(new RegExp(`const\\s+${name}\\s*=.+;`));
  assert(match && match[0], `${name} constant not found`);
  return match[0];
}

function extractFunction(name) {
  const asyncSignature = `async function ${name}(`;
  const syncSignature = `function ${name}(`;
  const asyncStart = source.indexOf(asyncSignature);
  const syncStart = source.indexOf(syncSignature);
  const start = asyncStart >= 0 ? asyncStart : syncStart;
  assert(start >= 0, `${name} helper not found`);
  const signature = asyncStart >= 0 ? asyncSignature : syncSignature;
  let parenDepth = 0;
  let bodyStart = -1;
  for (let index = start + signature.length - 1; index < source.length; index += 1) {
    const char = source[index];
    if (char === "(") {
      parenDepth += 1;
      continue;
    }
    if (char === ")") {
      parenDepth -= 1;
      continue;
    }
    if (char === "{" && parenDepth === 0) {
      bodyStart = index;
      break;
    }
  }
  assert(bodyStart >= 0, `${name} helper body not found`);
  let depth = 0;
  for (let index = bodyStart; index < source.length; index += 1) {
    const char = source[index];
    if (char === "{") depth += 1;
    if (char === "}") {
      depth -= 1;
      if (depth === 0) return source.slice(start, index + 1);
    }
  }
  throw new Error(`failed to extract ${name}`);
}

function createHelpersContext(fetchImpl) {
  const context = {
    fetch: fetchImpl,
    console,
    Error,
    JSON,
    Array,
    Object,
    String,
    Number,
    Math,
    Promise,
    setTimeout,
    clearTimeout,
    notices: [],
    delays: [],
    harnessRenders: 0,
    controlApiToken() {
      return "test-control-token";
    },
    controlApiTokenHeader() {
      return "x-codex-control-token";
    },
    async loadRuntime() {
      return { ok: true };
    },
    t1(text, limit) {
      const normalized = String(text || "");
      return normalized.length > limit ? normalized.slice(0, limit) : normalized;
    },
    madd(out, text) {
      out.lines.push(String(text || ""));
    },
    hpush(chatRecord, lane, detail, status) {
      chatRecord.events.push({ lane, detail, status });
    },
    renderHarness() {
      context.harnessRenders += 1;
    },
    async sleepWithSignal(ms) {
      context.delays.push(ms);
    },
  };
  const bootstrap = [
    extractConst("EXEC_STREAM_CONTENT_TYPE"),
    extractConst("EXEC_IDEMPOTENCY_HEADER"),
    extractConst("EXEC_SUBMIT_RETRY_DELAYS_MS"),
    extractFunction("parseJsonSafe"),
    extractFunction("buildExecSubmitHeaders"),
    extractFunction("refreshRuntimeForExecRetry"),
    extractFunction("isExecStreamResponse"),
    extractFunction("buildExecResponseError"),
    extractFunction("isTransientExecSubmitError"),
    extractFunction("formatExecSubmitError"),
    extractFunction("formatExecRetryDelay"),
    extractFunction("pushExecRetryNotice"),
    extractFunction("submitExecRequestWithRetry"),
    extractFunction("formatRunPromptFailureMessage"),
    "this.helpers={submitExecRequestWithRetry,formatRunPromptFailureMessage};",
  ].join("\n\n");
  vm.runInNewContext(bootstrap, context);
  return context;
}

async function testRetriesTransientFetchFailures() {
  let fetchCalls = 0;
  const response = {
    headers: { get: () => "application/x-ndjson; charset=utf-8" },
  };
  const context = createHelpersContext(async () => {
    fetchCalls += 1;
    if (fetchCalls < 3) {
      throw new TypeError("Failed to fetch");
    }
    return response;
  });
  const out = { lines: [] };
  const chatRecord = { events: [] };
  const result = await context.helpers.submitExecRequestWithRetry({
    payload: { prompt: "hello" },
    headers: { "Content-Type": "application/json" },
    signal: null,
    out,
    chatRecord,
  });
  assert.strictEqual(result, response, "retry helper should return the eventual stream response");
  assert.strictEqual(fetchCalls, 3, "retry helper should retry until the stream response succeeds");
  assert.deepStrictEqual(context.delays, [1200, 2400], "retry helper should use the configured backoff delays");
  assert.strictEqual(chatRecord.events.length, 2, "retry helper should emit harness retry events for each transient failure");
  assert.strictEqual(chatRecord.events[0].detail, "submit retry 1/2 in 1.2s (Failed to fetch)", "retry helper should record the first retry detail");
  assert.strictEqual(chatRecord.events[1].detail, "submit retry 2/2 in 2.4s (Failed to fetch)", "retry helper should record the second retry detail");
  assert(out.lines.some((line) => line.includes("[retry]")), "retry helper should surface retry notices to the transcript");
}

async function testDuplicateResponseStopsWithoutRetry() {
  let fetchCalls = 0;
  const context = createHelpersContext(async () => {
    fetchCalls += 1;
    return {
      status: 409,
      headers: { get: () => "application/json" },
      text: async () => JSON.stringify({
        duplicate: true,
        idempotency: {
          lifecycle: {
            resolved: 0,
          },
        },
      }),
    };
  });
  const out = { lines: [] };
  const chatRecord = { events: [] };
  let thrown = null;
  try {
    await context.helpers.submitExecRequestWithRetry({
      payload: { prompt: "hello" },
      headers: { "Content-Type": "application/json" },
      signal: null,
      out,
      chatRecord,
    });
  } catch (error) {
    thrown = error;
  }
  assert(thrown, "duplicate submit should reject");
  assert.strictEqual(fetchCalls, 1, "duplicate submit should not retry automatically");
  assert.strictEqual(Boolean(thrown.isDuplicate), true, "duplicate submit should preserve duplicate metadata");
  assert.strictEqual(Boolean(thrown.isResolvedDuplicate), false, "running duplicate should not be treated as resolved");
}

function testFailureMessageFormatting() {
  const context = createHelpersContext(async () => ({
    headers: { get: () => "application/x-ndjson" },
  }));
  const transient = new Error("submit failed after automatic retry: Failed to fetch");
  transient.isTransientSubmitFailure = true;
  transient.cause = new TypeError("Failed to fetch");
  assert.strictEqual(
    context.helpers.formatRunPromptFailureMessage(transient),
    "自動再試行後も送信できませんでした: Failed to fetch",
    "transient retries should surface the automatic-retry failure message"
  );
  assert.strictEqual(
    context.helpers.formatRunPromptFailureMessage({ isDuplicate: true, status: 409 }),
    "送信を停止しました: 前回の送信がサーバ側でまだ実行中です。",
    "running duplicate should surface the duplicate-running message"
  );
  assert.strictEqual(
    context.helpers.formatRunPromptFailureMessage({ isResolvedDuplicate: true }),
    "送信を停止しました: 前回の送信はサーバ側ですでに完了しています。",
    "resolved duplicate should surface the duplicate-completed message"
  );
}

function testRunPromptWiresIdempotency() {
  assert(/requestPayload\.idempotencyKey=idempotencyKey;/.test(source), "runPrompt should send the idempotency key in the exec payload");
  assert(/if\(idempotencyKey\)headers\[EXEC_IDEMPOTENCY_HEADER\]=idempotencyKey;/.test(source), "exec submit headers should carry the idempotency key");
  assert(/submitExecRequestWithRetry\(\{payload:requestPayload,signal:ctl\.signal,out,chatRecord:c\}\)/.test(source), "runPrompt should route exec submits through the retry helper");
}

function testFastModeDefaultsOffInUi() {
  assert(/function runtimeDefaultFastModeEnabled\(\)\{[\s\S]*operatorDefaults\.fastModeEnabled[\s\S]*false\);[\s\S]*\}/.test(source), "UI fast-mode fallback should default to false");
  assert(/<input id="fastModeEnabled" type="checkbox">/.test(indexHtml), "Fast mode checkbox should render unchecked by default");
  assert(!/<input id="fastModeEnabled" type="checkbox" checked>/.test(indexHtml), "Fast mode checkbox must not be hard-coded checked");
}

async function run() {
  await testRetriesTransientFetchFailures();
  await testDuplicateResponseStopsWithoutRetry();
  testFailureMessageFormatting();
  testRunPromptWiresIdempotency();
  testFastModeDefaultsOffInUi();
  console.log("[harnesui-exec-submit-retry-test] PASS");
  console.log("PASS");
}

run().catch((error) => {
  console.log(`[harnesui-exec-submit-retry-test] FAIL ${error instanceof Error ? error.message : String(error)}`);
  console.log("FAIL");
  process.exitCode = 1;
});
