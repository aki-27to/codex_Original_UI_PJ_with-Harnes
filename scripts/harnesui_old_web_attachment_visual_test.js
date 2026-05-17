#!/usr/bin/env node
"use strict";

const assert = require("assert");
const fs = require("fs");
const http = require("http");
const net = require("net");
const path = require("path");
const { startInProcessHarnessServer } = require("./lib/in_process_harness_server");

const workspaceRoot = path.resolve(__dirname, "..");
const artifactRoot = path.join(workspaceRoot, "output", "playwright", "harnesui-oldweb-attachment");
const defaultUrl = "http://127.0.0.1:57525/01.HarnesUI/index.html";

function loadPlaywright() {
  const candidates = [
    path.join(workspaceRoot, "node_modules", "playwright"),
    path.join(workspaceRoot, "node_modules", "playwright-core"),
  ];
  const npxRoot = path.join(workspaceRoot, "runtime", "npm-cache", "_npx");
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

function findFreePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = address && typeof address === "object" ? address.port : 0;
      server.close(() => resolve(port));
    });
  });
}

function urlOk(targetUrl) {
  return new Promise((resolve) => {
    const request = http.get(targetUrl, { timeout: 2000 }, (response) => {
      response.resume();
      resolve(response.statusCode >= 200 && response.statusCode < 400);
    });
    request.on("timeout", () => {
      request.destroy();
      resolve(false);
    });
    request.on("error", () => resolve(false));
  });
}

async function resolveTarget() {
  if (process.env.HARNESUI_URL) return { targetUrl: process.env.HARNESUI_URL, server: null };
  if (await urlOk(defaultUrl)) return { targetUrl: defaultUrl, server: null };
  const port = await findFreePort();
  const server = await startInProcessHarnessServer({
    CODEX_APP_SERVER_TRANSPORT: "mock-fixture",
    CODEX_DEFAULT_EXEC_AGENT: "default",
    CODEX_REQUEST_USER_INPUT_POLICY: "blocked",
    CODEX_UI_PORT: String(port),
  });
  return { targetUrl: `http://127.0.0.1:${server.port}/01.HarnesUI/index.html`, server };
}

function tinyPngBuffer() {
  return Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAFgwJ/lrD8WwAAAABJRU5ErkJggg==",
    "base64"
  );
}

async function captureViewport(browser, targetUrl, viewport) {
  const page = await browser.newPage({ viewport });
  const url = new URL(targetUrl);
  url.searchParams.set("ui_reload", `oldweb_attachment_${viewport.name}_${Date.now()}`);
  await page.goto(url.toString(), { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.evaluate(() => {
    try {
      localStorage.clear();
    } catch {
      // Ignore storage failures in restricted browser contexts.
    }
  });
  await page.reload({ waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForSelector("#imageInput", { state: "attached", timeout: 15000 });
  await page.setInputFiles("#imageInput", {
    name: "image.png",
    mimeType: "image/png",
    buffer: tinyPngBuffer(),
  });
  await page.waitForSelector("#imagePreview:not([hidden]) .image-preview-item", { timeout: 10000 });
  await page.waitForFunction(
    () => {
      const version = document.querySelector("#topVersionChip");
      const codex = document.querySelector("#topCodexChip");
      return Boolean(version && /^Ver\b/.test(version.textContent || "") && codex);
    },
    null,
    { timeout: 10000 }
  );

  const screenshotPath = path.join(artifactRoot, `${viewport.name}.png`);
  await page.screenshot({ path: screenshotPath, fullPage: true });
  const snapshot = await page.evaluate(() => {
    const text = (selector) => (document.querySelector(selector)?.textContent || "").replace(/\s+/g, " ").trim();
    const rect = (selector) => {
      const node = document.querySelector(selector);
      if (!node) return null;
      const box = node.getBoundingClientRect();
      return { x: box.x, y: box.y, width: box.width, height: box.height, right: box.right, bottom: box.bottom };
    };
    const clipped = (selector) => {
      const node = document.querySelector(selector);
      if (!node) return true;
      return node.scrollWidth > node.clientWidth + 1 || node.scrollHeight > node.clientHeight + 1;
    };
    const root = document.documentElement;
    const row = rect(".image-preview-item");
    const remove = rect(".image-preview-item button");
    return {
      viewport: { width: window.innerWidth, height: window.innerHeight },
      horizontalOverflow: root.scrollWidth > root.clientWidth + 1,
      topVersion: text("#topVersionChip"),
      topCodex: text("#topCodexChip"),
      topRuntime: text("#topRuntimeChip"),
      liveStatusVisible: Boolean(document.querySelector("#liveStatus")?.getClientRects().length),
      runtimeHelp: text("#runtimeRefreshHelp"),
      attachmentSummary: text("#imagePreviewSummary"),
      rowCount: document.querySelectorAll(".image-preview-item").length,
      deleteText: text(".image-preview-item button"),
      fileName: text(".image-preview-name"),
      fileMeta: text(".image-preview-meta"),
      row,
      remove,
      preview: rect("#imagePreview"),
      nameClipped: clipped(".image-preview-name"),
      clearAllClipped: clipped("#imageRemoveBtn"),
      deleteFitsRow: Boolean(row && remove && remove.x >= row.x - 1 && remove.right <= row.right + 1),
    };
  });
  await page.close();
  assert.strictEqual(snapshot.horizontalOverflow, false, `${viewport.name} must not overflow horizontally: ${JSON.stringify(snapshot)}`);
  assert.match(snapshot.topVersion, /^Ver\b/, `${viewport.name} must show a visible Ver chip: ${JSON.stringify(snapshot)}`);
  assert.match(`${snapshot.topVersion} ${snapshot.topCodex} ${snapshot.topRuntime}`, /codex-cli/i, `${viewport.name} must show codex-cli identity in the top runtime strip: ${JSON.stringify(snapshot)}`);
  assert.strictEqual(snapshot.liveStatusVisible, false, `${viewport.name} must not show the removed live status banner: ${JSON.stringify(snapshot)}`);
  assert.match(snapshot.runtimeHelp, /\/api\/runtime/, `${viewport.name} must explain Runtime refresh: ${JSON.stringify(snapshot)}`);
  assert.match(snapshot.runtimeHelp, /\/api\/diagnostics/, `${viewport.name} must explain diagnostics refresh: ${JSON.stringify(snapshot)}`);
  assert.strictEqual(snapshot.rowCount, 1, `${viewport.name} must render one attachment row: ${JSON.stringify(snapshot)}`);
  assert.match(snapshot.attachmentSummary, /1/, `${viewport.name} must summarize one attached image: ${JSON.stringify(snapshot)}`);
  assert.strictEqual(snapshot.fileName, "image.png", `${viewport.name} must show the attached file name: ${JSON.stringify(snapshot)}`);
  assert.match(snapshot.fileMeta, /image\/png/, `${viewport.name} must show the image MIME type: ${JSON.stringify(snapshot)}`);
  assert.strictEqual(snapshot.deleteText, "削除", `${viewport.name} must expose per-image delete action: ${JSON.stringify(snapshot)}`);
  assert.strictEqual(snapshot.nameClipped, false, `${viewport.name} attachment filename must not clip: ${JSON.stringify(snapshot)}`);
  assert.strictEqual(snapshot.clearAllClipped, false, `${viewport.name} clear-all button must not clip: ${JSON.stringify(snapshot)}`);
  assert.strictEqual(snapshot.deleteFitsRow, true, `${viewport.name} delete button must remain inside the attachment row: ${JSON.stringify(snapshot)}`);
  return { ...snapshot, screenshot: path.relative(workspaceRoot, screenshotPath).replace(/\\/g, "/") };
}

async function main() {
  fs.mkdirSync(artifactRoot, { recursive: true });
  const { targetUrl, server } = await resolveTarget();
  const playwright = loadPlaywright();
  const browser = await launchChromium(playwright);
  const viewports = [
    { name: "desktop-1365x768", width: 1365, height: 768 },
    { name: "mobile-390x844", width: 390, height: 844 },
  ];
  try {
    const snapshots = [];
    for (const viewport of viewports) {
      snapshots.push(await captureViewport(browser, targetUrl, viewport));
    }
    const report = {
      ok: true,
      targetUrl,
      generatedAt: new Date().toISOString(),
      screenshots: snapshots.map((item) => item.screenshot),
      snapshots,
    };
    fs.writeFileSync(path.join(artifactRoot, "report.json"), JSON.stringify(report, null, 2));
  } finally {
    await browser.close().catch(() => {});
    if (server) await server.stop();
  }
  process.stdout.write("PASS harnesui_old_web_attachment_visual_test\n");
}

main().catch((error) => {
  console.error(`FAIL harnesui_old_web_attachment_visual_test: ${error && error.stack ? error.stack : String(error)}`);
  process.exitCode = 1;
});
