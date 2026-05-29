#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const { _electron: electron } = require("playwright");
const electronBinary = require("electron");

const root = path.resolve(__dirname, "..");
const userDataDir = path.join(root, "runtime", `electron-stop-race-${Date.now()}`);
const artifactRoot = path.join(root, "output", "electron-harnesui", "stop-race");

function fail(message, detail) {
  console.error(message);
  if (detail) console.error(JSON.stringify(detail, null, 2));
  process.exit(1);
}

async function waitForSmoke(page) {
  await page.waitForFunction(() => {
    const smoke = window.__harnesElectronSmoke;
    return Boolean(smoke && smoke.runtimeOk && smoke.execControlsVisible);
  }, null, { timeout: 180000 });
}

async function main() {
  fs.mkdirSync(userDataDir, { recursive: true });
  fs.mkdirSync(artifactRoot, { recursive: true });
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
    const result = await page.evaluate(async () => {
      const requestId = `electron-stop-race-${Date.now()}`;
      const cancel = await window.harnesDesktop.cancelExec(requestId);
      const submit = await window.harnesDesktop.submitExec({
        requestId,
        prompt: "Stop race pre-registration probe.",
        sandboxMode: "workspace-write",
        approvalPolicy: "on-request",
        fastModeEnabled: true,
        automaticApprovalReviewEnabled: false,
        webSearch: false,
        webSearchMode: "disabled",
        model: "gpt-5.5",
        modelReasoningEffort: "xhigh",
        forceNewSession: true,
        executionProfile: "custom",
        executionIntent: "electron-ui-stop-race",
      });
      return { requestId, cancel, submit };
    });
    if (!result.cancel || result.cancel.ok !== true || result.cancel.pending !== true) {
      fail("pre-registration Stop must be accepted as pending", result);
    }
    if (!result.submit || result.submit.ok !== true || result.submit.cancelledBeforeStart !== true) {
      fail("submit must settle pre-registration Stop without sending /api/exec", result);
    }
    const artifactPath = path.join(artifactRoot, "pre-registration-stop.json");
    fs.writeFileSync(artifactPath, `${JSON.stringify(result, null, 2)}\n`, "utf8");
    console.log(`PASS electron_harnesui_stop_race_test artifact=${path.relative(root, artifactPath).replace(/\\/g, "/")}`);
  } finally {
    await app.close().catch(() => {});
  }
}

main().catch((error) => fail("electron_harnesui_stop_race_test: failed", { error: error && error.stack ? error.stack : String(error) }));
