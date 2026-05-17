#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const { _electron: electron } = require("playwright");
const electronBinary = require("electron");

const root = path.resolve(__dirname, "..");
const userDataDir = path.join(root, "runtime", `electron-status-reenable-${Date.now()}`);
const artifactRoot = process.env.HARNESUI_ELECTRON_STATUS_ARTIFACT_DIR
  || path.join(root, "output", "electron-harnesui", "status-reenable");

function fail(message, detail) {
  console.error(message);
  if (detail) console.error(JSON.stringify(detail, null, 2));
  process.exit(1);
}

async function getSendButtonState(page) {
  return page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll("button"));
    const send = buttons.find((button) => (button.textContent || "").trim() === "送信");
    const stop = buttons.find((button) => (button.textContent || "").trim() === "停止");
    const textarea = document.querySelector("textarea");
    const workState = document.querySelector(".work-state-pill");
    const root = document.documentElement;
    const activeText = document.body.innerText;
    return {
      sendFound: Boolean(send),
      sendDisabled: send ? send.disabled : null,
      sendButtonClipped: send ? send.scrollWidth > send.clientWidth + 1 || send.scrollHeight > send.clientHeight + 1 : null,
      horizontalOverflow: root ? root.scrollWidth > window.innerWidth + 1 : null,
      viewportWidth: window.innerWidth,
      scrollWidth: root ? root.scrollWidth : null,
      stopDisabled: stop ? stop.disabled : null,
      textareaValue: textarea ? textarea.value : "",
      workStateText: workState ? workState.textContent || "" : "",
      hasCodexStatus: activeText.includes(">_ OpenAI Codex"),
      hasFastStatus: activeText.includes("Fast mode:"),
    };
  });
}

async function waitForSmoke(page) {
  await page.waitForFunction(() => {
    const smoke = window.__harnesElectronSmoke;
    return Boolean(smoke && smoke.runtimeOk && smoke.execControlsVisible && smoke.commandPaletteVisible);
  }, null, { timeout: 180000 });
}

async function fillAndSubmit(page, text, expectedText) {
  await page.locator("textarea").first().fill(text);
  await page.waitForFunction(() => {
    const buttons = Array.from(document.querySelectorAll("button"));
    const send = buttons.find((button) => (button.textContent || "").trim() === "送信");
    return Boolean(send && !send.disabled);
  }, null, { timeout: 10000 });
  await page.getByRole("button", { name: "送信", exact: true }).click();
  await page.waitForFunction(
    (expected) => document.body.innerText.includes(expected),
    expectedText,
    { timeout: 45000 }
  );
}

async function captureEvidence(page, name, state) {
  fs.mkdirSync(artifactRoot, { recursive: true });
  const base = path.join(artifactRoot, name);
  fs.writeFileSync(`${base}.json`, JSON.stringify(state, null, 2));
  await page.screenshot({ path: `${base}.png`, fullPage: true });
}

async function main() {
  fs.mkdirSync(userDataDir, { recursive: true });
  const app = await electron.launch({
    executablePath: electronBinary,
    args: [path.join(root, "desktop", "harnes-electron", "main.cjs")],
    cwd: root,
    env: {
      ...process.env,
      CODEX_AUTO_OPEN_BROWSER: "0",
      HARNES_ELECTRON_USER_DATA_DIR: userDataDir,
    },
    timeout: 180000,
  });
  try {
    const page = await app.firstWindow();
    await waitForSmoke(page);

    await fillAndSubmit(page, "/status", ">_ OpenAI Codex");
    await page.waitForFunction(() => {
      const buttons = Array.from(document.querySelectorAll("button"));
      const send = buttons.find((button) => (button.textContent || "").trim() === "送信");
      const textarea = document.querySelector("textarea");
      return Boolean(send && textarea && textarea.value === "" && !send.disabled);
    }, null, { timeout: 10000 });
    let state = await getSendButtonState(page);
    if (state.sendDisabled !== false) fail("Electron send button must remain pressable after /status returns", state);
    if (state.sendButtonClipped !== false) fail("Electron send button copy is clipped after /status returns", state);
    if (state.horizontalOverflow !== false) fail("Electron /status returned state has horizontal overflow", state);
    await captureEvidence(page, "electron-status-returned", state);

    await page.locator("textarea").first().fill("/fast status");
    await page.waitForFunction(() => {
      const buttons = Array.from(document.querySelectorAll("button"));
      const send = buttons.find((button) => (button.textContent || "").trim() === "送信");
      return Boolean(send && !send.disabled);
    }, null, { timeout: 10000 });
    state = await getSendButtonState(page);
    if (state.sendDisabled !== false) fail("Electron send button did not re-enable after /status when a new command was entered", state);

    await page.getByRole("button", { name: "送信", exact: true }).click();
    await page.waitForFunction(() => document.body.innerText.includes("Fast mode:"), null, { timeout: 45000 });
    state = await getSendButtonState(page);
    if (!state.hasCodexStatus || !state.hasFastStatus) fail("Electron slash command transcript did not include both command outputs", state);
    if (state.sendDisabled !== false) fail("Electron send button must remain pressable after /fast status returns", state);
    if (state.sendButtonClipped !== false) fail("Electron send button copy is clipped after /fast status returns", state);
    if (state.horizontalOverflow !== false) fail("Electron /fast status returned state has horizontal overflow", state);
    await captureEvidence(page, "electron-fast-status-returned", state);
  } finally {
    await app.close().catch(() => {});
  }
  console.log("PASS electron_harnesui_status_send_reenable_test");
}

main().catch((error) => fail("electron_harnesui_status_send_reenable_test: failed", { error: error && error.stack ? error.stack : String(error) }));
