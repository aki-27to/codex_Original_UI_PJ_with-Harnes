#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright");

const workspaceRoot = path.resolve(__dirname, "..");
const outputDir = path.join(workspaceRoot, "output", "playwright");
const defaultProfileDir = path.join(outputDir, "edge-figma-session");

const profileDir = process.env.PW_PROFILE_DIR || defaultProfileDir;
const headless = process.env.PW_HEADLESS === "1";
const mode = process.argv[2] || process.env.PW_MODE || "inspect";
const cdpUrl = process.env.PW_CDP_URL || "";
const fileUrl =
  process.env.FIGMA_URL ||
  "https://www.figma.com/design/E2e8K9yDRRRpA8qdrenQKo/%E6%9C%89%E9%99%90%E4%BC%9A%E7%A4%BE%E4%B8%89%E9%87%8D%E9%9D%9E%E7%A0%B4%E5%A3%8A%E6%A4%9C%E6%9F%BB?node-id=2-46&p=f&t=2Qxi9zvfxv2Wuk8s-0";
const findText =
  process.env.FIND_TEXT || "\u4e09\u91cd\u975e\u7834\u58ca\u691c\u67fb\u306e\u5f37\u307f";
const replaceText =
  process.env.REPLACE_TEXT ||
  "\u4e09\u91cd\u975e\u7834\u58ca\u691c\u67fb\u304c\u9078\u3070\u308c\u308b\u7406\u7531";
const clickX = Number.parseInt(process.env.PW_CLICK_X || "", 10);
const clickY = Number.parseInt(process.env.PW_CLICK_Y || "", 10);
const stem = `figma-text-${mode}-${Date.now()}`;
const screenshotPath = path.join(outputDir, `${stem}.png`);
const jsonPath = path.join(outputDir, `${stem}.json`);

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeText(value) {
  return String(value || "").replace(/\s+/g, "");
}

function hasLoginPrompt(bodyText) {
  return (
    bodyText.includes("このファイルをチェックアウトしますか") ||
    bodyText.includes("Googleで続行") ||
    bodyText.includes("メールアドレスで続行") ||
    bodyText.includes("ログイン") ||
    bodyText.includes("サインアップ")
  );
}

async function collectTextCandidates(page) {
  return page.evaluate((snippet) => {
    const take = (nodes) =>
      nodes.slice(0, 80).map((node) => ({
        tag: node.tagName,
        type: "type" in node ? node.type || null : null,
        text: "innerText" in node ? (node.innerText || "").trim() : "",
        value: "value" in node ? node.value || "" : "",
        ariaLabel: node.getAttribute("aria-label"),
        role: node.getAttribute("role"),
        contenteditable: node.getAttribute("contenteditable"),
        placeholder: node.getAttribute("placeholder"),
      }));
    return {
      title: document.title,
      url: location.href,
      textareas: take(Array.from(document.querySelectorAll("textarea"))),
      inputs: take(
        Array.from(
          document.querySelectorAll(
            'input[type="text"], input[type="email"], input:not([type]), input[type="search"]'
          )
        )
      ),
      editables: take(
        Array.from(document.querySelectorAll('[contenteditable="true"]'))
      ),
      matchingTextSnippets: Array.from(document.querySelectorAll("body *"))
        .map((node) => ({
          tag: node.tagName,
          text: (node.innerText || "").trim(),
          ariaLabel: node.getAttribute("aria-label"),
          role: node.getAttribute("role"),
        }))
        .filter((entry) => entry.text && entry.text.includes(snippet))
        .slice(0, 50),
    };
  }, "三重非破壊検査");
}

async function readAuthState(page) {
  return page.evaluate(() => {
    const bodyText = (document.body && document.body.innerText) || "";
    const hasAuthInput =
      document.querySelectorAll(
        'input[type="email"], input[name="email"], input[autocomplete="username"]'
      ).length > 0;
    return {
      title: document.title,
      url: location.href,
      hasAuthInput,
      bodyText,
    };
  });
}

async function waitForLogin(page, timeoutMs = 15 * 60 * 1000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const state = await readAuthState(page);
    if (!state.hasAuthInput && !hasLoginPrompt(state.bodyText)) {
      return {
        title: state.title,
        url: state.url,
        hasAuthInput: state.hasAuthInput,
        bodySample: state.bodyText.slice(0, 400),
      };
    }
    await sleep(1000);
  }
  throw new Error("Timed out waiting for the user to finish Figma login.");
}

async function ensureNoLoginPrompt(page) {
  const state = await readAuthState(page);
  if (state.hasAuthInput || hasLoginPrompt(state.bodyText)) {
    throw new Error("Figma login prompt is still visible in the Playwright session.");
  }
}

async function tryDirectSidebarReplace(page) {
  const candidates = page.locator(
    "textarea, input[type='text'], input:not([type]), [contenteditable='true']"
  );
  const count = await candidates.count();
  const expected = normalizeText(findText);
  for (let index = 0; index < count; index += 1) {
    const node = candidates.nth(index);
    const text = ((await node.textContent()) || "").trim();
    const value = await node.evaluate((element) =>
      "value" in element ? element.value || "" : element.textContent || ""
    );
    const normalizedText = normalizeText(text);
    const normalizedValue = normalizeText(value);
    if (
      normalizedText.includes(expected) ||
      normalizedValue.includes(expected)
    ) {
      await node.click({ timeout: 5000 });
      const tagName = await node.evaluate((element) => element.tagName);
      if (tagName === "TEXTAREA" || tagName === "INPUT") {
        await node.fill(replaceText);
        await node.press("Tab").catch(() => {});
      } else {
        await page.keyboard.press("Control+A");
        await page.keyboard.type(replaceText, { delay: 25 });
        await page.keyboard.press("Tab").catch(() => {});
      }
      const viewport = page.viewportSize() || { width: 1600, height: 1200 };
      await page.mouse.click(Math.round(viewport.width / 2), 190);
      await sleep(1200);
      return { strategy: "sidebar-direct" };
    }
  }
  return null;
}

async function tryCanvasReplace(page) {
  const viewport = page.viewportSize() || { width: 1600, height: 1200 };
  await page.mouse.click(Math.round(viewport.width / 2), 190);
  await sleep(500);
  await page.keyboard.press("Enter");
  await sleep(1000);
  await page.keyboard.press("Control+A");
  await page.keyboard.type(replaceText, { delay: 25 });
  await page.keyboard.press("Escape");
  return { strategy: "canvas-enter-edit-mode" };
}

async function tryCoordinateReplace(page) {
  if (!Number.isFinite(clickX) || !Number.isFinite(clickY)) {
    return null;
  }
  await page.mouse.click(clickX, clickY, { clickCount: 2 });
  await sleep(800);
  await page.keyboard.press("Control+A");
  await page.keyboard.type(replaceText, { delay: 25 });
  await page.keyboard.press("Escape");
  await sleep(1200);
  return {
    strategy: "coordinate-double-click",
    point: { x: clickX, y: clickY },
  };
}

async function tryReplace(page) {
  await ensureNoLoginPrompt(page);
  const direct = await tryDirectSidebarReplace(page);
  if (direct) {
    return direct;
  }
  const coordinate = await tryCoordinateReplace(page);
  if (coordinate) {
    return coordinate;
  }
  return tryCanvasReplace(page);
}

async function capturePageScreenshot(page) {
  try {
    await page.screenshot({
      path: screenshotPath,
      timeout: 60000,
    });
    return { ok: true, path: screenshotPath };
  } catch (error) {
    return {
      ok: false,
      path: screenshotPath,
      message: error && error.message ? error.message : String(error),
    };
  }
}

async function main() {
  fs.mkdirSync(outputDir, { recursive: true });
  let browser = null;
  let context = null;
  let page = null;

  try {
    if (cdpUrl) {
      browser = await chromium.connectOverCDP(cdpUrl);
      context = browser.contexts()[0] || (await browser.newContext());
      page =
        context
          .pages()
          .find((candidate) => candidate.url().includes("figma.com/design")) ||
        context.pages()[0] ||
        (await context.newPage());
    } else {
      context = await chromium.launchPersistentContext(profileDir, {
        channel: "msedge",
        headless,
        viewport: { width: 1600, height: 1200 },
        ignoreHTTPSErrors: true,
      });
      page = context.pages()[0] || (await context.newPage());
    }

    await page.goto(fileUrl, { waitUntil: "domcontentloaded", timeout: 120000 });
    await page.waitForLoadState("networkidle", { timeout: 120000 }).catch(() => {});
    await sleep(4000);

    if (mode === "assist-login") {
      const loginState = await waitForLogin(page);
      const screenshot = await capturePageScreenshot(page);
      fs.writeFileSync(
        jsonPath,
        JSON.stringify(
          {
            mode,
            profileDir,
            fileUrl,
            loginState,
            screenshot,
          },
          null,
          2
        ),
        "utf8"
      );
      console.log(
        JSON.stringify({
          ok: true,
          mode,
          screenshotPath,
          jsonPath,
          screenshot,
          title: loginState.title,
          url: loginState.url,
        })
      );
      return;
    }

    const before = await collectTextCandidates(page);
    let replaceResult = null;
    if (mode === "replace") {
      replaceResult = await tryReplace(page);
      await sleep(3000);
    }
    const after = await collectTextCandidates(page);

    const screenshot = await capturePageScreenshot(page);
    fs.writeFileSync(
      jsonPath,
      JSON.stringify(
        {
          mode,
          profileDir,
          fileUrl,
          findText,
          replaceText,
          replaceResult,
          before,
          after,
          screenshot,
        },
        null,
        2
      ),
      "utf8"
    );

    console.log(
      JSON.stringify({
        ok: true,
          mode,
          screenshotPath,
          jsonPath,
          screenshot,
          replaceResult,
          title: after.title,
          url: after.url,
        })
      );
  } finally {
    if (!cdpUrl && context) {
      await context.close();
    }
    if (cdpUrl && browser) {
      await browser.close().catch(() => {});
    }
  }
}

main().catch((error) => {
  console.error(
    JSON.stringify({
      ok: false,
      mode,
      message: error && error.message ? error.message : String(error),
      stack: error && error.stack ? error.stack : null,
    })
  );
  process.exit(1);
});
