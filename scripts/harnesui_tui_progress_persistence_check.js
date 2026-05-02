#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const outputDir = path.join(root, "output", "playwright", "harnesui-tui-progress-persistence");
const outputPath = path.join(outputDir, "harnesui-tui-progress-persistence.png");
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
    const page = await browser.newPage({ viewport: { width: 1280, height: 1250 } });
    const now = new Date("2026-05-02T10:30:00+09:00").toLocaleTimeString();
    await page.addInitScript((payload) => {
      localStorage.setItem("codex-console-chat-v1", JSON.stringify(payload));
    }, {
      v: 1,
      active: "chat-progress-persistence",
      nextChat: 2,
      nextMsg: 1,
      chats: [{
        id: "chat-progress-persistence",
        title: "Progress persistence check",
        agent: "default",
        forceNewSession: false,
        h: { status: "idle", events: [], items: [], flow: [] },
        settings: {},
        draftPrompt: "",
        messages: [],
      }],
    });
    await page.goto(`${targetUrl}?ui_reload=progress_persistence_${Date.now()}`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => typeof window.runPrompt === "function", { timeout: 10000 });
    const result = await page.evaluate(async () => {
      const originalFetch = window.fetch.bind(window);
      const encoder = new TextEncoder();
      window.fetch = (input, init) => {
        const url = String(typeof input === "string" ? input : input && input.url || "");
        if (url.includes("/api/exec")) {
          const stream = new ReadableStream({
            start(controller) {
              const events = [
                {
                  type: "plan",
                  steps: [
                    { step: "Inspect current progress lifecycle", status: "completed" },
                    { step: "Keep thought progress visible", status: "completed" },
                    { step: "Render final answer separately", status: "pending" },
                  ],
                },
                {
                  type: "activity",
                  label: "answer",
                  detail: "answer text is about to stream",
                },
                {
                  type: "delta",
                  text: "Draft answer text should not replace the progress area.",
                },
                {
                  type: "final",
                  text: "Final answer is rendered in a separate assistant area while the progress area remains visible.",
                },
              ];
              for (const event of events) controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
              controller.close();
            },
          });
          return Promise.resolve(new Response(stream, {
            status: 200,
            headers: { "Content-Type": "application/x-ndjson" },
          }));
        }
        return originalFetch(input, init);
      };
      try {
        await window.runPrompt("Keep progress visible and render final answer separately", "chat-progress-persistence");
      } finally {
        window.fetch = originalFetch;
      }
      const progressRows = Array.from(document.querySelectorAll(".message.assistant.tui-progress"));
      const answerRows = Array.from(document.querySelectorAll(".message.assistant:not(.tui-progress)"));
      const progressRow = progressRows[progressRows.length - 1] || null;
      const answerRow = answerRows[answerRows.length - 1] || null;
      const progressContent = progressRow ? progressRow.querySelector(".content") : null;
      const answerContent = answerRow ? answerRow.querySelector(".content") : null;
      const progressStyle = progressContent ? window.getComputedStyle(progressContent) : null;
      const answerStyle = answerContent ? window.getComputedStyle(answerContent) : null;
      const progressRowStyle = progressRow ? window.getComputedStyle(progressRow) : null;
      const answerRowStyle = answerRow ? window.getComputedStyle(answerRow) : null;
      const progressBox = progressRow ? progressRow.getBoundingClientRect() : null;
      const answerBox = answerRow ? answerRow.getBoundingClientRect() : null;
      return {
        progressCount: progressRows.length,
        answerCount: answerRows.length,
        progressText: progressContent ? progressContent.textContent || "" : "",
        answerText: answerContent ? answerContent.textContent || "" : "",
        progressFontFamily: progressStyle ? progressStyle.fontFamily : "",
        answerFontFamily: answerStyle ? answerStyle.fontFamily : "",
        progressBackground: progressRowStyle ? progressRowStyle.backgroundColor : "",
        answerBackground: answerRowStyle ? answerRowStyle.backgroundColor : "",
        separated: Boolean(progressBox && answerBox && progressBox.bottom <= answerBox.top),
        progressBox: progressBox ? { top: progressBox.top, bottom: progressBox.bottom, height: progressBox.height } : null,
        answerBox: answerBox ? { top: answerBox.top, bottom: answerBox.bottom, height: answerBox.height } : null,
      };
    });
    if (result.progressCount < 1) throw new Error("Progress area was not rendered");
    if (result.answerCount < 1) throw new Error("Final answer area was not rendered");
    if (!result.progressText.includes("Updated Plan")) throw new Error("Updated Plan did not remain visible");
    if (!result.progressText.includes("Keep thought progress visible")) throw new Error("Progress rows did not retain streamed plan state");
    if (!result.answerText.includes("Final answer is rendered in a separate assistant area")) throw new Error("Final answer text missing from separate answer area");
    if (result.progressText.includes("Final answer is rendered")) throw new Error("Final answer leaked into progress area");
    if (result.answerText.includes("Updated Plan")) throw new Error("Progress content leaked into final answer area");
    if (!result.separated) throw new Error(`Progress and answer areas overlap or are not vertically separated: ${JSON.stringify({ progress: result.progressBox, answer: result.answerBox })}`);
    if (/mono|consolas|menlo|liberation/i.test(result.progressFontFamily)) throw new Error(`Progress area should not use monospace: ${result.progressFontFamily}`);
    if (/mono|consolas|menlo|liberation/i.test(result.answerFontFamily)) throw new Error(`Answer area should not use monospace: ${result.answerFontFamily}`);
    if (/rgb\(16,\s*33,\s*29\)/.test(result.progressBackground)) throw new Error(`Progress area should not use dark terminal background: ${result.progressBackground}`);
    if (/rgb\(16,\s*33,\s*29\)/.test(result.answerBackground)) throw new Error(`Answer area should not use dark terminal background: ${result.answerBackground}`);
    fs.mkdirSync(outputDir, { recursive: true });
    await page.screenshot({ path: outputPath, fullPage: true });
    console.log(`PASS harnesui_tui_progress_persistence_check ${path.relative(root, outputPath)}`);
  } finally {
    await browser.close();
  }
}

run().catch((error) => {
  console.error(`FAIL harnesui_tui_progress_persistence_check: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
