#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const outputDir = path.join(root, "output", "playwright", "harnesui-tui-progress-chat");
const outputPath = path.join(outputDir, "harnesui-tui-progress-chat.png");
const targetUrl = process.env.HARNESUI_URL || "http://127.0.0.1:57525/01.HarnesUI/index.html";

function loadPlaywright() {
  const candidates = [
    path.join(root, "node_modules", "playwright"),
    path.join(root, "node_modules", "playwright-core"),
  ];
  const npxRoot = path.join(root, "runtime", "npm-cache", "_npx");
  if (fs.existsSync(npxRoot)) {
    for (const entry of fs.readdirSync(npxRoot)) {
      candidates.push(path.join(npxRoot, entry, "node_modules", "playwright"));
      candidates.push(path.join(npxRoot, entry, "node_modules", "playwright-core"));
    }
  }
  for (const candidate of candidates) {
    try {
      if (fs.existsSync(candidate)) return require(candidate);
    } catch {
      // Try the next candidate.
    }
  }
  throw new Error("Playwright is not available in node_modules or runtime npm cache");
}

async function launchChromium(playwright) {
  try {
    return await playwright.chromium.launch({ channel: "msedge", headless: true });
  } catch {
    return playwright.chromium.launch({ headless: true });
  }
}

async function run() {
  const playwright = loadPlaywright();
  const browser = await launchChromium(playwright);
  try {
    const page = await browser.newPage({ viewport: { width: 1366, height: 1100 } });
    const now = new Date("2026-05-01T12:00:00Z").toLocaleTimeString();
    const tuiContent = [
      "[harnesui-tui-progress]",
      "codex@harnesui:~$ exec --chat active",
      "status   responding",
      "elapsed  00:07",
      "agent    default",
      "model    gpt-5.5 / xhigh",
      "cwd      C:\\...\\codex_Original_UI_PJ_with-Harnes",
      "prompt   UI thinking display should look like a TUI",
      "request  req-visual-check",
      "",
      "events",
      "  [ok] request captured in chat",
      "  [ok] runtime handoff prepared",
      "  [..] NDJSON stream is open; first answer text is still pending",
      "  [ ] final answer",
    ].join("\n");
    const chatState = {
      v: 1,
      active: "chat-tui-progress",
      nextChat: 2,
      nextMsg: 4,
      chats: [
        {
          id: "chat-tui-progress",
          title: "TUI progress visual check",
          agent: "default",
          forceNewSession: false,
          h: { status: "running", events: [], items: [], flow: [] },
          settings: {},
          draftPrompt: "",
          messages: [
            { id: "m-1-visual", role: "user", title: "You", time: now, content: "Make the assistant response look like terminal output." },
            { id: "m-2-visual", role: "assistant", title: "Codex", time: now, content: tuiContent },
            { id: "m-3-visual", role: "assistant", title: "Codex", time: now, content: "直近の修正内容を端的に整理します。進捗ログは端末風のままですが、この最終回答本文は通常の本文フォントで読ませます。" },
          ],
        },
      ],
    };
    await page.addInitScript((payload) => {
      localStorage.setItem("codex-console-chat-v1", JSON.stringify(payload));
    }, chatState);
    await page.goto(`${targetUrl}?ui_reload=tui_progress_visual_${Date.now()}`, { waitUntil: "domcontentloaded" });
    await page.waitForSelector(".message.assistant.tui-progress .content", { timeout: 10000 });
    await page.waitForSelector(".message.assistant:not(.tui-progress) .content", { timeout: 10000 });
    const result = await page.evaluate(() => {
      const row = document.querySelector(".message.assistant.tui-progress");
      const content = row && row.querySelector(".content");
      const style = content ? window.getComputedStyle(content) : null;
      const rowStyle = row ? window.getComputedStyle(row) : null;
      const answerRow = document.querySelector(".message.assistant:not(.tui-progress)");
      const answerContent = answerRow && answerRow.querySelector(".content");
      const answerStyle = answerContent ? window.getComputedStyle(answerContent) : null;
      const answerRowStyle = answerRow ? window.getComputedStyle(answerRow) : null;
      const answerBeforeStyle = answerContent ? window.getComputedStyle(answerContent, "::before") : null;
      return {
        found: Boolean(row && content),
        text: content ? content.textContent : "",
        fontFamily: style ? style.fontFamily : "",
        color: style ? style.color : "",
        background: rowStyle ? rowStyle.backgroundColor : "",
        answerFound: Boolean(answerRow && answerContent),
        answerText: answerContent ? answerContent.textContent : "",
        answerFontFamily: answerStyle ? answerStyle.fontFamily : "",
        answerLineHeight: answerStyle ? answerStyle.lineHeight : "",
        answerBackground: answerRowStyle ? answerRowStyle.backgroundColor : "",
        answerPrompt: answerBeforeStyle ? answerBeforeStyle.content : "",
        answerPromptFontFamily: answerBeforeStyle ? answerBeforeStyle.fontFamily : "",
      };
    });
    if (!result.found) throw new Error("TUI progress message was not rendered");
    if (!result.text.includes("codex@harnesui:~$ exec --chat active")) throw new Error("TUI prompt line missing");
    if (!result.text.includes("status   responding")) throw new Error("TUI status line missing");
    if (!/mono|consolas|menlo|liberation/i.test(result.fontFamily)) throw new Error(`TUI font is not monospace: ${result.fontFamily}`);
    if (!/rgb\(16,\s*33,\s*29\)/.test(result.background)) throw new Error(`TUI background is not the expected dark terminal color: ${result.background}`);
    if (!result.answerFound) throw new Error("Normal assistant answer was not rendered");
    if (!result.answerText.includes("直近の修正内容を端的に整理します")) throw new Error("Normal assistant answer text missing");
    if (/mono|consolas|menlo|liberation/i.test(result.answerFontFamily)) throw new Error(`Normal assistant answer body should not use monospace: ${result.answerFontFamily}`);
    if (!/normal|[0-9.]+px/i.test(result.answerLineHeight)) throw new Error(`Normal assistant answer line height missing: ${result.answerLineHeight}`);
    if (!/rgb\(16,\s*33,\s*29\)/.test(result.answerBackground)) throw new Error(`Normal assistant answer background is not the expected dark terminal color: ${result.answerBackground}`);
    if (!/codex@harnesui:~\$ cat response\.log/.test(result.answerPrompt)) throw new Error(`Normal assistant answer terminal prompt missing: ${result.answerPrompt}`);
    if (!/mono|consolas|menlo|liberation/i.test(result.answerPromptFontFamily)) throw new Error(`Normal assistant answer prompt should stay monospace: ${result.answerPromptFontFamily}`);
    fs.mkdirSync(outputDir, { recursive: true });
    await page.screenshot({ path: outputPath, fullPage: true });
    console.log(`PASS harnesui_tui_progress_visual_check ${path.relative(root, outputPath)}`);
  } finally {
    await browser.close();
  }
}

run().catch((error) => {
  console.error(`FAIL harnesui_tui_progress_visual_check: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
