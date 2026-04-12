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
    Date: Object.assign(function DateShim(...args) {
      return new Date(...args);
    }, Date, {
      now() {
        return 1712900000000;
      },
    }),
    Math,
    Number,
    Object,
    String,
    s: {
      nextMsg: 7,
      active: "chat-1",
      chats: [
        {
          id: "chat-1",
          messages: [],
        },
      ],
    },
    scheduleSaveChatStateCalls: 0,
    renderTimelineCalls: 0,
    renderChatListCalls: 0,
    scheduleSaveChatState() {
      context.scheduleSaveChatStateCalls += 1;
    },
    renderTimeline() {
      context.renderTimelineCalls += 1;
    },
    renderChatList() {
      context.renderChatListCalls += 1;
    },
    chat(id) {
      return context.s.chats.find((item) => item && item.id === id) || null;
    },
    compactInlineTextForUi(text) {
      return String(text || "").replace(/\s+/g, " ").trim();
    },
    toArr(value) {
      return Array.isArray(value) ? value : [];
    },
  };
  vm.runInNewContext(
    [
      extractFunction("conversationSnapshotForUi"),
      extractFunction("createMessageIdForUi"),
      extractFunction("findMessageRecordForUi"),
      extractFunction("msg"),
      extractFunction("mget"),
      extractFunction("mset"),
      extractFunction("madd"),
      extractFunction("deriveNextMessageCounter"),
      extractFunction("ensureUniqueMessageIdsInChatsForUi"),
      "this.__helpers__={conversationSnapshotForUi,createMessageIdForUi,findMessageRecordForUi,msg,mget,mset,madd,deriveNextMessageCounter,ensureUniqueMessageIdsInChatsForUi};",
    ].join("\n\n"),
    context
  );
  return { context, ...context.__helpers__ };
}

function run() {
  const {
    context,
    conversationSnapshotForUi,
    createMessageIdForUi,
    msg,
    mget,
    mset,
    madd,
    deriveNextMessageCounter,
    ensureUniqueMessageIdsInChatsForUi,
  } = loadHelpers();

  const firstId = createMessageIdForUi();
  assert.match(firstId, /^m-7-[a-z0-9]+$/, "new message ids must keep the numeric counter and add a uniqueness suffix");
  const secondId = createMessageIdForUi();
  assert.match(secondId, /^m-8-[a-z0-9]+$/, "message ids must keep incrementing the numeric counter");

  context.s.nextMsg = 11;
  const out = msg("chat-1", "assistant", "Codex", "");
  assert.ok(out && typeof out.id === "string", "msg must return a handle with the created id");
  assert.match(out.id, /^m-11-[a-z0-9]+$/, "msg must create a collision-resistant id");

  const chatRecord = context.chat("chat-1");
  chatRecord.messages = [
    { id: "m-1", role: "assistant", content: "older reply" },
    { id: "m-1", role: "assistant", content: "latest placeholder" },
  ];
  assert.strictEqual(mget({ cid: "chat-1", id: "m-1" }), "latest placeholder", "mget must read the newest duplicate message id");
  mset({ cid: "chat-1", id: "m-1" }, "latest final");
  assert.strictEqual(chatRecord.messages[0].content, "older reply", "mset must not rewrite an older duplicate message row");
  assert.strictEqual(chatRecord.messages[1].content, "latest final", "mset must rewrite the newest duplicate message row");
  madd({ cid: "chat-1", id: "m-1" }, " + delta");
  assert.strictEqual(chatRecord.messages[1].content, "latest final + delta", "madd must append to the newest duplicate message row");

  const restoredChats = [
    {
      id: "chat-a",
      messages: [
        { id: "m-1", role: "user", content: "first" },
        { id: "m-1", role: "assistant", content: "duplicate" },
        { id: "", role: "assistant", content: "missing" },
      ],
    },
  ];
  const derivedNext = deriveNextMessageCounter(restoredChats);
  assert.strictEqual(derivedNext, 2, "deriveNextMessageCounter must still follow the numeric message prefix");
  const repairedNext = ensureUniqueMessageIdsInChatsForUi(restoredChats, derivedNext);
  const repairedIds = restoredChats[0].messages.map((message) => message.id);
  assert.strictEqual(new Set(repairedIds).size, repairedIds.length, "rehydrated chat state must repair duplicate message ids");
  assert.ok(repairedIds[0] === "m-1", "the first unique id should be preserved");
  assert.ok(repairedIds[1].startsWith("m-2-rehydrate"), "duplicate ids must be reassigned during load");
  assert.ok(repairedIds[2].startsWith("m-3-rehydrate"), "missing ids must be reassigned during load");
  assert.strictEqual(repairedNext, 4, "repair helper must advance the next counter past reassigned ids");

  const snapshot = conversationSnapshotForUi({
    messages: [
      { id: "m-a", role: "user", content: "git の件はどうするよ" },
      { id: "m-b", role: "assistant", content: "" },
      { id: "m-c", role: "system", content: "internal" },
    ],
  });
  assert.strictEqual(snapshot.hasConversation, true, "snapshot must still report a visible conversation");
  assert.deepStrictEqual(
    snapshot.messages.map((item) => item.id),
    ["m-a", "m-c"],
    "blank transcript rows must be omitted from the visible conversation snapshot"
  );

  process.stdout.write("PASS harnesui_transcript_message_identity_test\n");
}

try {
  run();
} catch (error) {
  process.stderr.write(`FAIL harnesui_transcript_message_identity_test: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
}
