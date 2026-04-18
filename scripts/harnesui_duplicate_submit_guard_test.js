#!/usr/bin/env node
"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const appPath = path.join(__dirname, "..", "web", "01.HarnesUI", "app.js");
const source = fs.readFileSync(appPath, "utf8");

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

function buildContext({ attachmentFailure = false, blockAtPreflight = true } = {}) {
  const messages = [];
  let pendingCalls = 0;
  let liveCalls = 0;
  let runtimeSyncCalls = 0;
  let neverResolve = null;
  const context = {
    AbortController,
    Array,
    Boolean,
    Date,
    JSON,
    Map,
    Math,
    Number,
    Object,
    Promise,
    String,
    composerAttachment: {
      items: [],
      error: "",
    },
    s: {
      active: "chat-1",
      chats: [
        {
          id: "chat-1",
          title: "Chat 1",
          agent: "default",
          settings: {},
          h: {},
          messages: [],
        },
      ],
      req: new Map(),
    },
    e: {
      promptInput: { value: "same prompt" },
    },
    PROFILES: {
      "full-access": {
        approvalPolicy: "never",
        sandboxMode: "danger-full-access",
      },
    },
    DEFAULT_PROFILE_ID: "full-access",
    active() {
      return context.s.chats[0];
    },
    chat(id) {
      return context.s.chats.find((chatRecord) => chatRecord && chatRecord.id === id) || null;
    },
    ensureNotificationAudioReady() {},
    pendingCountForChat(chatId) {
      let count = 0;
      context.s.req.forEach((row) => {
        if (row && row.cid === chatId) count += 1;
      });
      return count;
    },
    msg(cid, role, author, text) {
      const entry = { cid, role, author, text };
      messages.push(entry);
      if (role === "assistant") return { id: "assistant-1", text: "" };
      return entry;
    },
    ensureChatAgent(chatRecord) {
      return chatRecord && chatRecord.agent ? chatRecord.agent : "default";
    },
    async buildAttachmentPayload() {
      if (!attachmentFailure) return { mimeType: "image/png", data: "stub" };
      throw new Error("attachment decode failed");
    },
    clearAttachmentError() {},
    renderAttachmentUi() {},
    clearWorkspaceGuardNotice() {},
    syncActiveChatScopedStateFromUi() {},
    syncWorkspaceGuardForChat() {
      if (!blockAtPreflight) return Promise.resolve(true);
      if (!neverResolve) {
        neverResolve = new Promise(() => {});
      }
      return neverResolve;
    },
    pending() {
      pendingCalls += 1;
    },
    live() {
      liveCalls += 1;
    },
    syncRuntimePendingMonitor() {
      runtimeSyncCalls += 1;
    },
    refresh() {},
  };
  vm.runInNewContext(
    [
      extractFunction("setAttachmentError"),
      extractFunction("runPrompt"),
      "this.helpers={ runPrompt };",
    ].join("\n\n"),
    context
  );
  return {
    context,
    messages,
    getPendingCalls: () => pendingCalls,
    getLiveCalls: () => liveCalls,
    getRuntimeSyncCalls: () => runtimeSyncCalls,
    runPrompt: context.helpers.runPrompt,
  };
}

async function main() {
  const { context, messages, getPendingCalls, getLiveCalls, getRuntimeSyncCalls, runPrompt } = buildContext();

  const firstRun = runPrompt("same prompt", "chat-1", {});
  assert(firstRun && typeof firstRun.then === "function", "first submit should return a promise");
  assert.strictEqual(context.s.req.size, 1, "first submit should register a local pending row before awaiting preflight");
  const localRow = [...context.s.req.values()][0];
  assert(localRow && localRow.phase === "preparing", "local pending row should be marked as preparing");
  assert.strictEqual(getPendingCalls(), 1, "first submit should update pending UI immediately");
  assert.strictEqual(getLiveCalls(), 1, "first submit should update live UI immediately");
  assert.strictEqual(getRuntimeSyncCalls(), 1, "first submit should start runtime sync immediately");

  await runPrompt("same prompt", "chat-1", {});
  const systemMessages = messages.filter((entry) => entry && entry.role === "system");
  assert.strictEqual(systemMessages.length, 1, "second submit should be rejected as duplicate while first preflight is still pending");
  assert.strictEqual(context.s.req.size, 1, "duplicate submit must not create a second pending row");
  assert.strictEqual(getPendingCalls(), 1, "duplicate submit should not advance pending state again");

  const attachmentCase = buildContext({ attachmentFailure: true, blockAtPreflight: false });
  await attachmentCase.runPrompt("", "chat-1", { attachments: [{ name: "bad.png" }] });
  assert.strictEqual(attachmentCase.context.s.req.size, 0, "attachment preflight failures must clear the preparing pending row");
  assert.strictEqual(attachmentCase.context.composerAttachment.error, "attachment decode failed", "attachment preflight failures should surface an error message");
}

main()
  .then(() => {
    console.log("PASS harnesui_duplicate_submit_guard_test");
  })
  .catch((error) => {
    console.error(`FAIL harnesui_duplicate_submit_guard_test: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  });
