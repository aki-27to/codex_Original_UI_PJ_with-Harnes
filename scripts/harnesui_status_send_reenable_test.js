#!/usr/bin/env node
"use strict";

const assert = require("assert");
const fs = require("fs");
const net = require("net");
const path = require("path");

const workspaceRoot = path.resolve(__dirname, "..");
const { startInProcessHarnessServer } = require("./lib/in_process_harness_server");
const artifactRoot = process.env.HARNESUI_STATUS_ARTIFACT_DIR
  || path.join(workspaceRoot, "output", "harnesui-status-reenable");

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

async function waitForRuntime(page) {
  await page.waitForFunction(
    () => {
      const state = typeof s !== "undefined" ? s : null;
      return Boolean(state && state.runtime && state.runtime.controlApi && state.runtime.controlApi.token);
    },
    null,
    { timeout: 30000 }
  );
}

async function waitForSendEnabled(page) {
  await page.waitForFunction(
    () => {
      const btn = document.querySelector("#sendBtn");
      return Boolean(btn) && btn.disabled === false;
    },
    null,
    { timeout: 10000 }
  );
}

async function composerSnapshot(page) {
  return page.evaluate(() => {
    const state = typeof s !== "undefined" ? s : null;
    const sendBtn = document.querySelector("#sendBtn");
    const pendingState = document.querySelector("#pendingState");
    const agentState = document.querySelector("#agentState");
    const liveStatus = document.querySelector("#liveStatusLabel");
    const root = document.documentElement;
    const messages = Array.from(document.querySelectorAll("#timeline .message .content"))
      .map((node) => node.textContent || "")
      .slice(-8);
    return {
      sendDisabled: sendBtn ? sendBtn.disabled : null,
      sendButtonClipped: sendBtn ? sendBtn.scrollWidth > sendBtn.clientWidth + 1 || sendBtn.scrollHeight > sendBtn.clientHeight + 1 : null,
      horizontalOverflow: root ? root.scrollWidth > window.innerWidth + 1 : null,
      viewportWidth: window.innerWidth,
      scrollWidth: root ? root.scrollWidth : null,
      pendingText: pendingState ? pendingState.textContent || "" : "",
      agentText: agentState ? agentState.textContent || "" : "",
      liveStatusText: liveStatus ? liveStatus.textContent || "" : "",
      localPendingSize: state && state.req ? state.req.size : null,
      runtimeActiveExecRequests: Number(state && state.runtime && state.runtime.activeExecRequests || 0),
      promptValue: document.querySelector("#promptInput")?.value || "",
      messages,
    };
  });
}

async function submitSlash(page, command, expectedText) {
  await page.fill("#promptInput", command);
  await waitForSendEnabled(page);
  await page.click("#sendBtn");
  await page.waitForFunction(
    (text) => Array.from(document.querySelectorAll("#timeline .message .content"))
      .some((node) => (node.textContent || "").includes(text)),
    expectedText,
    { timeout: 30000 }
  );
  await waitForSendEnabled(page);
}

async function captureEvidence(page, name, snapshot) {
  fs.mkdirSync(artifactRoot, { recursive: true });
  const base = path.join(artifactRoot, name);
  fs.writeFileSync(`${base}.json`, JSON.stringify(snapshot, null, 2));
  await page.screenshot({ path: `${base}.png`, fullPage: true });
}

async function main() {
  const useExisting = process.env.HARNESUI_USE_EXISTING === "1";
  const testPort = useExisting ? null : await findFreePort();
  const server = useExisting
    ? null
    : await startInProcessHarnessServer({
        CODEX_APP_SERVER_TRANSPORT: "mock-fixture",
        CODEX_DEFAULT_EXEC_AGENT: "default",
        CODEX_REQUEST_USER_INPUT_POLICY: "blocked",
        CODEX_UI_PORT: String(testPort),
      });
  const targetUrl = process.env.HARNESUI_URL
    || `http://127.0.0.1:${server.port}/01.HarnesUI/index.html`;
  const playwright = loadPlaywright();
  const browser = await launchChromium(playwright);
  try {
    const page = await browser.newPage({ viewport: { width: 1366, height: 920 } });
    const url = new URL(targetUrl);
    url.searchParams.set("ui_reload", `status_reenable_${Date.now()}`);
    await page.goto(url.toString(), {
      waitUntil: "domcontentloaded",
      timeout: 30000,
    });
    await page.evaluate(() => {
      try {
        localStorage.clear();
      } catch {
        // Ignore storage failures in restricted browser contexts.
      }
    });
    await page.reload({ waitUntil: "domcontentloaded", timeout: 30000 });
    await waitForRuntime(page);
    await waitForSendEnabled(page);

    await page.click('[data-slash-command="/status"]');
    assert.strictEqual(await page.$eval("#promptInput", (el) => el.value), "/status", "shortcut must populate /status");
    await page.click("#sendBtn");
    await page.waitForFunction(
      () => Array.from(document.querySelectorAll("#timeline .message .content"))
        .some((node) => (node.textContent || "").includes(">_ OpenAI Codex")),
      null,
      { timeout: 30000 }
    );
    await waitForSendEnabled(page);
    const statusSnapshot = await composerSnapshot(page);
    assert.strictEqual(statusSnapshot.sendDisabled, false, `/status must re-enable send: ${JSON.stringify(statusSnapshot)}`);
    assert.strictEqual(statusSnapshot.sendButtonClipped, false, `/status send button copy must not be clipped: ${JSON.stringify(statusSnapshot)}`);
    assert.strictEqual(statusSnapshot.horizontalOverflow, false, `/status returned state must not overflow horizontally: ${JSON.stringify(statusSnapshot)}`);
    assert.strictEqual(statusSnapshot.localPendingSize, 0, `/status must clear local pending rows: ${JSON.stringify(statusSnapshot)}`);
    if (!useExisting) {
      assert.strictEqual(statusSnapshot.runtimeActiveExecRequests, 0, `/status must clear runtime active exec requests: ${JSON.stringify(statusSnapshot)}`);
    }
    await captureEvidence(page, "web-status-returned", statusSnapshot);

    await submitSlash(page, "/fast status", "Fast mode:");
    const secondSnapshot = await composerSnapshot(page);
    assert.strictEqual(secondSnapshot.sendDisabled, false, `second slash command must leave send enabled: ${JSON.stringify(secondSnapshot)}`);
    assert.strictEqual(secondSnapshot.sendButtonClipped, false, `second slash command send button copy must not be clipped: ${JSON.stringify(secondSnapshot)}`);
    assert.strictEqual(secondSnapshot.horizontalOverflow, false, `second slash command state must not overflow horizontally: ${JSON.stringify(secondSnapshot)}`);
    assert.strictEqual(secondSnapshot.localPendingSize, 0, `second slash command must clear local pending rows: ${JSON.stringify(secondSnapshot)}`);
    if (!useExisting) {
      assert.strictEqual(secondSnapshot.runtimeActiveExecRequests, 0, `second slash command must clear runtime active exec requests: ${JSON.stringify(secondSnapshot)}`);
    }
    await captureEvidence(page, "web-fast-status-returned", secondSnapshot);
  } finally {
    await browser.close().catch(() => {});
    if (server) await server.stop();
  }
  process.stdout.write("PASS harnesui_status_send_reenable_test\n");
}

main().catch((error) => {
  console.error(`FAIL harnesui_status_send_reenable_test: ${error && error.stack ? error.stack : String(error)}`);
  process.exitCode = 1;
});
