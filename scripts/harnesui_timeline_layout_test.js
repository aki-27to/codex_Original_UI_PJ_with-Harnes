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

function createClassList(element) {
  return {
    add(...tokens) {
      const current = String(element.className || "").split(/\s+/).filter(Boolean);
      tokens.forEach((token) => {
        if (!current.includes(token)) current.push(token);
      });
      element.className = current.join(" ");
    },
  };
}

function createElement(tagName) {
  const element = {
    tagName: String(tagName || "").toUpperCase(),
    className: "",
    children: [],
    _innerHTML: "",
    _textContent: "",
    scrollTop: 0,
    scrollHeight: 640,
    appendChild(child) {
      if (child && child.nodeType === 11 && Array.isArray(child.children)) {
        child.children.forEach((nested) => this.appendChild(nested));
        return child;
      }
      this.children.push(child);
      return child;
    },
  };
  Object.defineProperty(element, "innerHTML", {
    get() {
      return element._innerHTML;
    },
    set(value) {
      element._innerHTML = String(value || "");
      element.children = [];
      element._textContent = "";
    },
  });
  Object.defineProperty(element, "textContent", {
    get() {
      return element._textContent;
    },
    set(value) {
      element._textContent = String(value || "");
      element.children = [];
      element._innerHTML = "";
    },
  });
  element.classList = createClassList(element);
  return element;
}

function createMessageFragment() {
  const article = createElement("article");
  article.className = "message";
  const meta = createElement("div");
  meta.className = "meta";
  const content = createElement("pre");
  content.className = "content";
  article.appendChild(meta);
  article.appendChild(content);
  return {
    nodeType: 11,
    children: [article],
    cloneNode() {
      return createMessageFragment();
    },
    querySelector(selector) {
      if (selector === ".message") return article;
      if (selector === ".meta") return meta;
      if (selector === ".content") return content;
      return null;
    },
  };
}

function loadRenderTimeline(context) {
  vm.runInNewContext(
    [
      extractFunction("renderTimeline"),
      "this.__renderTimeline__ = renderTimeline;",
    ].join("\n\n"),
    context
  );
  return context.__renderTimeline__;
}

function runConversationCase() {
  const timeline = createElement("section");
  const conversationSummary = createElement("p");
  const currentChat = { id: "chat-1" };
  const context = {
    document: {
      createElement,
    },
    e: {
      timeline,
      conversationSummary,
      messageTemplate: {
        content: {
          cloneNode() {
            return createMessageFragment();
          },
        },
      },
    },
    active() {
      return currentChat;
    },
    pendingCountForChat() {
      return 0;
    },
    conversationSnapshotForUi() {
      return {
        hasConversation: true,
        messages: [
          { role: "assistant", title: "Codex", time: "10:03:37", content: "first" },
          { role: "user", title: "You", time: "10:03:40", content: "second" },
        ],
      };
    },
    renderMessageContentForUi(element, text) {
      element.textContent = String(text || "");
    },
  };
  const renderTimeline = loadRenderTimeline(context);
  renderTimeline();

  assert.strictEqual(
    conversationSummary.textContent,
    "このチャットのメッセージ 2 件を表示しています。",
    "conversation summary should describe the rendered message count"
  );
  assert.strictEqual(timeline.children.length, 1, "timeline should render a single stack wrapper for message transcripts");
  assert.strictEqual(timeline.children[0].className, "timeline-stack", "message transcripts should use the bottom-align stack wrapper");
  assert.strictEqual(timeline.children[0].children.length, 2, "stack wrapper should contain every rendered transcript message");
  assert.strictEqual(timeline.children[0].children[0].className, "message assistant", "assistant messages should keep their role styling");
  assert.strictEqual(timeline.children[0].children[1].className, "message user", "user messages should keep their role styling");
  assert.strictEqual(timeline.scrollTop, timeline.scrollHeight, "timeline should still auto-scroll to the newest content");
}

function runEmptyStateCase() {
  const timeline = createElement("section");
  const conversationSummary = createElement("p");
  const context = {
    document: {
      createElement,
    },
    e: {
      timeline,
      conversationSummary,
      messageTemplate: {
        content: {
          cloneNode() {
            return createMessageFragment();
          },
        },
      },
    },
    active() {
      return { id: "chat-2" };
    },
    pendingCountForChat() {
      return 0;
    },
    conversationSnapshotForUi() {
      return {
        hasConversation: false,
        messages: [],
      };
    },
    renderMessageContentForUi() {},
  };
  const renderTimeline = loadRenderTimeline(context);
  renderTimeline();

  assert.strictEqual(
    conversationSummary.textContent,
    "まだ依頼は始まっていません。下の入力欄から始めます。",
    "empty conversations should keep the onboarding summary"
  );
  assert.strictEqual(timeline.children.length, 1, "empty timeline should render a single onboarding card");
  assert.strictEqual(timeline.children[0].className, "timeline-empty-state", "empty timeline should not wrap onboarding in the stack container");
}

try {
  runConversationCase();
  runEmptyStateCase();
  console.log("[harnesui-timeline-layout-test] PASS");
  console.log("PASS");
} catch (error) {
  console.log(`[harnesui-timeline-layout-test] FAIL ${error instanceof Error ? error.message : String(error)}`);
  console.log("FAIL");
  process.exitCode = 1;
}
