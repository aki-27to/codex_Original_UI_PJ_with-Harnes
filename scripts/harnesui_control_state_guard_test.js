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
    Math,
    Number,
    String,
    JSON,
    Object,
    Array,
    DEFAULT_AGENT_NAME: "default",
    s: {
      active: "chat-1",
      chats: [],
      runtime: null,
      req: new Map(),
      trace: [],
      last: null,
    },
    e: {
      sendBtn: {
        disabled: false,
        clicked: 0,
        click() {
          this.clicked += 1;
        },
      },
    },
    window: {
      confirm(message) {
        context.confirmMessage = String(message || "");
        return false;
      },
    },
    confirmMessage: "",
    saved: 0,
    refreshed: 0,
    setActiveChatCalls: 0,
    droppedTargets: [],
    systemMessages: [],
    pendingProjectionByChat: new Map(),
    pendingByChat: new Map(),
    chat(id) {
      return context.s.chats.find((item) => item && item.id === id) || null;
    },
    active() {
      return context.chat(context.s.active);
    },
    pendingCountForChat(chatId) {
      return context.pendingByChat.get(chatId) || 0;
    },
    localPendingCountForChat(chatId) {
      return context.pendingByChat.get(chatId) || 0;
    },
    pendingProjectionForChatForUi(chatRecord) {
      return context.pendingProjectionByChat.get(chatRecord.id) || { count: 0, source: "idle" };
    },
    dropChatDraftAttachmentsForUi(target) {
      context.droppedTargets.push(target && target.id ? target.id : "");
    },
    mkChat({ title, agent }) {
      const created = { id: "chat-new", title, agent, messages: [], h: {} };
      context.s.chats.push(created);
      return created;
    },
    scheduleSaveChatState() {
      context.saved += 1;
    },
    setActiveChatForUi() {
      context.setActiveChatCalls += 1;
      return Promise.resolve(true);
    },
    refresh() {
      context.refreshed += 1;
    },
    msg(cid, role, who, text) {
      context.systemMessages.push({ cid, role, who, text: String(text || "") });
    },
  };
  vm.runInNewContext(
    [
      extractFunction("pendingProjectionBlocksSendForUi"),
      extractFunction("stopAvailabilityForChatForUi"),
      extractFunction("deleteChat"),
      extractFunction("stop"),
      extractFunction("handlePromptInputKeydownForUi"),
      "this.helpers = { pendingProjectionBlocksSendForUi, stopAvailabilityForChatForUi, deleteChat, stop, handlePromptInputKeydownForUi };",
    ].join("\n\n"),
    context
  );
  return { context, ...context.helpers };
}

function run() {
  const { context, stopAvailabilityForChatForUi, deleteChat, stop, handlePromptInputKeydownForUi } = loadHelpers();

  const chatRecord = { id: "chat-1", title: "Chat 1", agent: "default", messages: [], h: {} };
  context.s.chats = [chatRecord];

  context.pendingByChat.set("chat-1", 1);
  context.pendingProjectionByChat.set("chat-1", { count: 1, source: "local" });
  let availability = stopAvailabilityForChatForUi(chatRecord);
  assert.strictEqual(availability.enabled, true, "local pending should keep stop enabled");
  assert.strictEqual(availability.mode, "local", "local pending should use local stop mode");

  context.pendingByChat.set("chat-1", 0);
  context.pendingProjectionByChat.set("chat-1", { count: 1, source: "server" });
  availability = stopAvailabilityForChatForUi(chatRecord);
  assert.strictEqual(availability.enabled, true, "runtime-only pending should still surface a stop affordance");
  assert.strictEqual(availability.mode, "runtime_only", "runtime-only pending should be distinguished from local pending");

  stop();
  assert.strictEqual(context.systemMessages.length, 1, "runtime-only stop should explain why the run cannot be aborted locally");
  assert.match(context.systemMessages[0].text, /server runtime/i, "runtime-only stop notice should mention server runtime");

  const plainEnterEvent = {
    key: "Enter",
    shiftKey: false,
    repeat: false,
    isComposing: false,
    defaultPrevented: false,
    preventDefaultCalled: 0,
    preventDefault() {
      this.preventDefaultCalled += 1;
      this.defaultPrevented = true;
    },
  };
  handlePromptInputKeydownForUi(plainEnterEvent);
  assert.strictEqual(context.e.sendBtn.clicked, 1, "plain Enter should submit once");
  assert.strictEqual(plainEnterEvent.preventDefaultCalled, 1, "plain Enter should prevent the newline");

  const composingEvent = {
    key: "Enter",
    shiftKey: false,
    repeat: false,
    isComposing: true,
    defaultPrevented: false,
    preventDefaultCalled: 0,
    preventDefault() {
      this.preventDefaultCalled += 1;
      this.defaultPrevented = true;
    },
  };
  handlePromptInputKeydownForUi(composingEvent);
  assert.strictEqual(context.e.sendBtn.clicked, 1, "IME composition should not trigger submit");
  assert.strictEqual(composingEvent.preventDefaultCalled, 0, "IME composition should keep Enter untouched");

  const repeatEvent = {
    key: "Enter",
    shiftKey: false,
    repeat: true,
    isComposing: false,
    defaultPrevented: false,
    preventDefaultCalled: 0,
    preventDefault() {
      this.preventDefaultCalled += 1;
      this.defaultPrevented = true;
    },
  };
  handlePromptInputKeydownForUi(repeatEvent);
  assert.strictEqual(context.e.sendBtn.clicked, 1, "key repeat should not spam submit");
  assert.strictEqual(repeatEvent.preventDefaultCalled, 0, "key repeat should not intercept the key");

  context.e.sendBtn.disabled = true;
  const disabledEvent = {
    key: "Enter",
    shiftKey: false,
    repeat: false,
    isComposing: false,
    defaultPrevented: false,
    preventDefaultCalled: 0,
    preventDefault() {
      this.preventDefaultCalled += 1;
      this.defaultPrevented = true;
    },
  };
  handlePromptInputKeydownForUi(disabledEvent);
  assert.strictEqual(context.e.sendBtn.clicked, 1, "disabled send button should not be clicked from keydown");
  assert.strictEqual(disabledEvent.preventDefaultCalled, 0, "disabled send button should leave Enter untouched");

  context.e.sendBtn.disabled = false;
  context.confirmMessage = "";
  context.pendingProjectionByChat.set("chat-1", { count: 2, source: "server" });
  deleteChat("chat-1");
  assert.match(context.confirmMessage, /server runtime/i, "runtime-only delete confirmation should warn about server-owned active work");

  console.log("[harnesui-control-state-guard-test] PASS");
  console.log("PASS");
}

try {
  run();
} catch (error) {
  console.log(`[harnesui-control-state-guard-test] FAIL ${error instanceof Error ? error.message : String(error)}`);
  console.log("FAIL");
  process.exitCode = 1;
}
