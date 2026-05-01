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
      "☑ 依頼を受け取りました",
      "☑ 実行設定を確認しています",
      "☐ 回答待ち: 接続できました。最初の回答本文を待っています",
      "☐ 最終回答を作成します",
      "",
      "・経過 00:07",
      "・担当 default",
      "・モデル gpt-5.5 / xhigh",
      "・作業場所 C:\\...\\codex_Original_UI_PJ_with-Harnes",
      "・依頼 TUI風は見た目ではなく内容の構造",
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
            { id: "m-1-visual", role: "user", title: "You", time: now, content: "TUI風は見た目ではなく、TODO形式の出力内容にしてほしい。" },
            { id: "m-2-visual", role: "assistant", title: "Codex", time: now, content: tuiContent },
            { id: "m-3-visual", role: "assistant", title: "Codex", time: now, content: "直近の修正内容を端的に整理します。進捗はTODO形式の内容で見せ、最終回答本文は通常の本文フォントで読ませます。" },
          ],
        },
        {
          id: "chat-needs-input-1",
          title: "今って定期的な改善を続けているの？",
          agent: "default",
          forceNewSession: false,
          h: { status: "needs_input", events: [], items: [], flow: [] },
          settings: {},
          draftPrompt: "",
          messages: [
            { id: "m-4-visual", role: "user", title: "You", time: now, content: "君と進めるべきなのは、いいニュース論ではなく採択品..." },
          ],
        },
        {
          id: "chat-needs-input-2",
          title: "面白い話しして",
          agent: "default",
          forceNewSession: false,
          h: { status: "needs_input", events: [], items: [], flow: [] },
          settings: {},
          draftPrompt: "",
          messages: [
            { id: "m-5-visual", role: "user", title: "You", time: now, content: "上司にはこう返すのがいいです。このPJでのAI活用は..." },
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
    const generatedProgress = await page.evaluate(() => {
      if (typeof buildAssistantTuiProgressForUi !== "function") {
        throw new Error("buildAssistantTuiProgressForUi is not available in the page");
      }
      return buildAssistantTuiProgressForUi({
        phase: "streaming",
        event: "NDJSON stream connected; waiting for first answer text",
        prompt: "TUI風は見た目ではなく内容の構造",
        imageCount: 0,
        agent: "default",
        model: "gpt-5.5",
        reasoning: "xhigh",
        cwd: "C:\\Users\\akima\\dev\\codex_Original_UI_PJ_with-Harnes",
        startedAt: Date.now() - 7000,
        now: Date.now(),
      });
    });
    if (!generatedProgress.includes("☑ 依頼を受け取りました")) throw new Error("Generated checklist progress line missing");
    if (!generatedProgress.includes("☐ 最終回答を作成します")) throw new Error("Generated checklist final-answer line missing");
    if (/NDJSON|local request|\/api\/exec|runtime handoff/i.test(generatedProgress)) {
      throw new Error(`Generated progress leaked internal runtime text: ${generatedProgress}`);
    }
    await page.evaluate((progressText) => {
      const content = document.querySelector(".message.assistant.tui-progress .content");
      if (!content) throw new Error("TUI progress content node was not found");
      content.textContent = progressText.replace(/^\[harnesui-tui-progress\]\n?/, "");
    }, generatedProgress);
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
      const sidePanel = document.querySelector(".side-panel");
      const sideStyle = sidePanel ? window.getComputedStyle(sidePanel) : null;
      const chatStatuses = Array.from(document.querySelectorAll(".chat-item-status")).map((node) => {
        const box = node.getBoundingClientRect();
        const style = window.getComputedStyle(node);
        return {
          text: node.textContent || "",
          width: box.width,
          height: box.height,
          whiteSpace: style.whiteSpace,
        };
      });
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
        sideBackground: sideStyle ? sideStyle.backgroundColor : "",
        chatStatuses,
      };
    });
    if (!result.found) throw new Error("TUI progress message was not rendered");
    if (!result.text.includes("☑ 依頼を受け取りました")) throw new Error("Checklist progress line missing");
    if (!result.text.includes("☐ 最終回答を作成します")) throw new Error("Checklist final-answer line missing");
    if (result.text.includes("codex@harnesui")) throw new Error("Fake terminal prompt should not be shown");
    if (/mono|consolas|menlo|liberation/i.test(result.fontFamily)) throw new Error(`TUI content should not use monospace: ${result.fontFamily}`);
    if (/rgb\(16,\s*33,\s*29\)/.test(result.background)) throw new Error(`TUI background should not use dark terminal color: ${result.background}`);
    if (!result.answerFound) throw new Error("Normal assistant answer was not rendered");
    if (!result.answerText.includes("直近の修正内容を端的に整理します")) throw new Error("Normal assistant answer text missing");
    if (/mono|consolas|menlo|liberation/i.test(result.answerFontFamily)) throw new Error(`Normal assistant answer body should not use monospace: ${result.answerFontFamily}`);
    if (!/normal|[0-9.]+px/i.test(result.answerLineHeight)) throw new Error(`Normal assistant answer line height missing: ${result.answerLineHeight}`);
    if (/rgb\(16,\s*33,\s*29\)/.test(result.answerBackground)) throw new Error(`Normal assistant answer should not use dark terminal color: ${result.answerBackground}`);
    if (result.answerPrompt && result.answerPrompt !== "none") throw new Error(`Normal assistant answer terminal prompt should be absent: ${result.answerPrompt}`);
    if (/rgb\(30,\s*43,\s*41\)|rgb\(38,\s*53,\s*49\)/.test(result.sideBackground)) throw new Error(`Side panel should not use dark terminal color: ${result.sideBackground}`);
    for (const status of result.chatStatuses) {
      if (status.text && status.whiteSpace !== "nowrap") throw new Error(`Chat status should stay nowrap: ${status.text}`);
      if (status.text && status.height > 28) throw new Error(`Chat status looks vertically wrapped: ${status.text} (${status.width}x${status.height})`);
    }
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
