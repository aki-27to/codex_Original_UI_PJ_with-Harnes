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

function loadHelpers() {
  const context = {
    Array,
    Boolean,
    JSON,
    Math,
    Number,
    Object,
    String,
    s: { chats: [] },
    __pendingByChat: new Map(),
    normalizeAgentNameForUi(name) {
      return typeof name === "string" ? name.trim().toLowerCase() : "";
    },
    toPerfInt(value) {
      return Number.isFinite(Number(value)) ? Math.max(0, Math.trunc(Number(value))) : 0;
    },
  };
  vm.runInNewContext(
    [
      "function pendingCountForChat(chatId){ return __pendingByChat.get(chatId) || 0; }",
      "function localPendingCountForChat(chatId){ return __pendingByChat.get(chatId) || 0; }",
      extractFunction("runtimeTurnRuntimeSnapshotForUi"),
      extractFunction("latestRuntimeTurn"),
      extractFunction("storedTurnSnapshotForUi"),
      extractFunction("storedChatTurnIdForUi"),
      extractFunction("storedChatThreadIdForUi"),
      extractFunction("runtimeTurnStatusForUi"),
      extractFunction("runtimeTurnThreadIdForUi"),
      extractFunction("runtimeTurnIdForUi"),
      extractFunction("runtimeTurnAgentForUi"),
      extractFunction("runtimeTurnCompletedAtForUi"),
      extractFunction("chatCanAdoptUnboundLatestTurnForUi"),
      extractFunction("runtimeTurnMatchesChat"),
      extractFunction("latestRuntimeTurnForChat"),
      "this.helpers = { chatCanAdoptUnboundLatestTurnForUi, runtimeTurnMatchesChat, latestRuntimeTurnForChat };",
    ].join("\n\n"),
    context
  );
  return { context, ...context.helpers };
}

function run() {
  const { context, chatCanAdoptUnboundLatestTurnForUi, latestRuntimeTurnForChat, runtimeTurnMatchesChat } = loadHelpers();

  const staleTurn = {
    terminal_status: "completed",
    agent_name: "default",
    thread_id: "thread-old",
    turn_id: "turn-old",
    completed_at: 1700000000000,
  };

  const freshFallbackChat = {
    id: "chat-new",
    agent: "default",
    messages: [],
    forceNewSession: true,
    h: { thread: "", turn: "" },
  };
  context.s.chats = [freshFallbackChat];
  context.__pendingByChat.clear();
  assert.strictEqual(
    chatCanAdoptUnboundLatestTurnForUi(freshFallbackChat),
    false,
    "fresh replacement chats must not adopt an unbound latest turn"
  );
  assert.strictEqual(
    latestRuntimeTurnForChat(freshFallbackChat, { latestTurn: staleTurn }),
    null,
    "deleting the last chat and auto-creating a new one must clear stale progress"
  );

  const establishedSingleChat = {
    id: "chat-existing",
    agent: "default",
    messages: [{ id: "m-1", role: "user", content: "status?" }],
    forceNewSession: false,
    h: { thread: "", turn: "" },
  };
  context.s.chats = [establishedSingleChat];
  context.__pendingByChat.clear();
  assert.strictEqual(
    chatCanAdoptUnboundLatestTurnForUi(establishedSingleChat),
    true,
    "an established single chat may adopt the runtime latest turn when identity is otherwise unbound"
  );
  assert.strictEqual(
    latestRuntimeTurnForChat(establishedSingleChat, { latestTurn: staleTurn }),
    staleTurn,
    "single established chats should still reconcile with the runtime latest turn"
  );

  const threadMatchedChat = {
    id: "chat-thread",
    agent: "default",
    messages: [],
    forceNewSession: true,
    h: { thread: "thread-old", turn: "" },
  };
  context.s.chats = [threadMatchedChat];
  context.__pendingByChat.clear();
  assert.strictEqual(
    runtimeTurnMatchesChat(staleTurn, threadMatchedChat),
    true,
    "explicit thread identity must keep matching even when a chat will force a new session next time"
  );

  console.log("[harnesui-chat-delete-progress-reset-test] PASS");
  console.log("PASS");
}

try {
  run();
} catch (error) {
  console.log(`[harnesui-chat-delete-progress-reset-test] FAIL ${error instanceof Error ? error.message : String(error)}`);
  console.log("FAIL");
  process.exitCode = 1;
}
