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
      "Updated Plan",
      "  └ ✔ 残り dirty の内容を再確認して分類する",
      "    ✔ 学習ログ/生成物を別 commit にまとめる",
      "    □ ローカル設定ノイズと不要ファイルを解消する",
      "    □ 検証と最終 git status 確認",
      "",
      "・現在 回答待ち: 接続できました。最初の回答本文を待っています",
      "・経過 00:07",
      "・担当 default",
      "・モデル gpt-5.5 / xhigh",
      "・作業場所 C:\\...\\codex_Original_UI_PJ_with-Harnes",
      "・依頼 Updated Plan をチャット返却内容として表示してほしい",
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
            { id: "m-3-visual", role: "assistant", title: "Codex", time: now, content: "直近の修正内容を端的に整理します。Plan は返却内容として表示し、最終回答本文は通常の本文フォントで読ませます。" },
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
        planSteps: [
          { step: "残り dirty の内容を再確認して分類する", status: "completed" },
          { step: "学習ログ/生成物を別 commit にまとめる", status: "completed" },
          { step: "ローカル設定ノイズと不要ファイルを解消する", status: "pending" },
          { step: "検証と最終 git status 確認", status: "pending" },
        ],
        startedAt: Date.now() - 7000,
        now: Date.now(),
      });
    });
    if (!generatedProgress.includes("Updated Plan")) throw new Error("Generated Updated Plan heading missing");
    if (!generatedProgress.includes("└ ✔ 残り dirty の内容を再確認して分類する")) throw new Error("Generated completed plan line missing");
    if (!generatedProgress.includes("□ 検証と最終 git status 確認")) throw new Error("Generated pending plan line missing");
    if (/NDJSON|local request|\/api\/exec|runtime handoff/i.test(generatedProgress)) {
      throw new Error(`Generated progress leaked internal runtime text: ${generatedProgress}`);
    }
    await page.evaluate((progressText) => {
      const content = document.querySelector(".message.assistant.tui-progress .content");
      if (!content) throw new Error("TUI progress content node was not found");
      content.textContent = progressText.replace(/^\[harnesui-tui-progress\]\n?/, "");
    }, generatedProgress);
    const streamedPlanText = await page.evaluate(async () => {
      if (typeof runPrompt !== "function") throw new Error("runPrompt is not available in the page");
      const originalFetch = window.fetch.bind(window);
      const encoder = new TextEncoder();
      window.fetch = (input, init) => {
        const url = String(typeof input === "string" ? input : input && input.url || "");
        if (url.includes("/api/exec")) {
          const stream = new ReadableStream({
            start(controller) {
              controller.enqueue(encoder.encode(`${JSON.stringify({
                type: "plan",
                explanation: "streamed plan event for chat return verification",
                steps: [
                  { step: "残り dirty の内容を再確認して分類する", status: "completed" },
                  { step: "学習ログ/生成物を別 commit にまとめる", status: "completed" },
                  { step: "ローカル設定ノイズと不要ファイルを解消する", status: "pending" },
                  { step: "検証と最終 git status 確認", status: "pending" },
                ],
              })}\n`));
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
        await runPrompt("Updated Plan をチャット返却内容として確認する", "chat-tui-progress");
      } finally {
        window.fetch = originalFetch;
      }
      const renderedPlans = Array.from(document.querySelectorAll(".message.assistant.tui-progress .content"))
        .map((node) => node.textContent || "")
        .filter((text) => text.includes("Updated Plan"));
      return renderedPlans[renderedPlans.length - 1] || "";
    });
    if (!streamedPlanText.includes("Updated Plan")) throw new Error("Streamed plan event did not render Updated Plan in chat return");
    if (!streamedPlanText.includes("└ ✔ 残り dirty の内容を再確認して分類する")) throw new Error("Streamed completed plan row missing from chat return");
    if (!streamedPlanText.includes("□ 検証と最終 git status 確認")) throw new Error("Streamed pending plan row missing from chat return");
    if (/codex@harnesui|NDJSON|runtime handoff/i.test(streamedPlanText)) {
      throw new Error(`Streamed plan return leaked terminal/runtime text: ${streamedPlanText}`);
    }
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
    if (!result.text.includes("Updated Plan")) throw new Error("Updated Plan heading missing");
    if (!result.text.includes("└ ✔ 残り dirty の内容を再確認して分類する")) throw new Error("Updated Plan completed row missing");
    if (!result.text.includes("□ 検証と最終 git status 確認")) throw new Error("Updated Plan pending row missing");
    if (result.text.includes("codex@harnesui")) throw new Error("Fake terminal prompt should not be shown");
    if (/mono|consolas|menlo|liberation/i.test(result.fontFamily)) throw new Error(`TUI content should not use monospace: ${result.fontFamily}`);
    if (/rgb\(16,\s*33,\s*29\)/.test(result.background)) throw new Error(`TUI background should not use dark terminal color: ${result.background}`);
    if (!result.answerFound) throw new Error("Normal assistant answer was not rendered");
    if (!result.answerText.includes("Plan は返却内容として表示し")) throw new Error("Normal assistant answer text missing");
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
