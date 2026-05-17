const fs = require("fs");
const path = require("path");
const { _electron: electron } = require("playwright");
const electronBinary = require("electron");

const root = path.resolve(__dirname, "..");
const outDir = path.join(root, "output", "electron-harnesui", "monkey");
const userDataDir = path.join(root, "runtime", `electron-monkey-${Date.now()}`);

function fail(message, detail) {
  console.error(message);
  if (detail) console.error(JSON.stringify(detail, null, 2));
  process.exit(1);
}

function mkdirp(target) {
  fs.mkdirSync(target, { recursive: true });
}

function rel(target) {
  return path.relative(root, target).replace(/\\/g, "/");
}

async function setWindowSize(app, width, height) {
  await app.evaluate(({ BrowserWindow }, bounds) => {
    const win = BrowserWindow.getAllWindows()[0];
    if (!win) throw new Error("No Electron BrowserWindow is available.");
    win.setBounds(bounds);
  }, { x: 30, y: 30, width, height });
}

async function inspectLayout(page) {
  return page.evaluate(() => {
    const doc = document.documentElement;
    const clipped = Array.from(document.querySelectorAll("button, select, textarea, .panel, .chat-row, .message, .status-pill, .old-web-status, .runtime-refresh-note, .work-state-meta span, .metric-grid article, .attachment-panel, .attachment-item, .attachment-copy strong, .attachment-copy span"))
      .map((element) => {
        const rect = element.getBoundingClientRect();
        const style = window.getComputedStyle(element);
        const allowsScroll = ["auto", "scroll"].includes(style.overflowX) || ["auto", "scroll"].includes(style.overflow);
        const clippedX = element.scrollWidth > element.clientWidth + 2 && !allowsScroll;
        return {
          tag: element.tagName.toLowerCase(),
          className: typeof element.className === "string" ? element.className : "",
          text: (element.textContent || "").replace(/\s+/g, " ").trim().slice(0, 90),
          x: Math.round(rect.x),
          y: Math.round(rect.y),
          width: Math.round(rect.width),
          height: Math.round(rect.height),
          scrollWidth: element.scrollWidth,
          clientWidth: element.clientWidth,
          clippedX,
        };
      })
      .filter((item) => item.width > 0 && item.height > 0 && item.clippedX);

    const panels = Array.from(document.querySelectorAll(".panel"))
      .map((element) => {
        const rect = element.getBoundingClientRect();
        return {
          className: typeof element.className === "string" ? element.className : "",
          x: rect.x,
          y: rect.y,
          right: rect.right,
          bottom: rect.bottom,
          width: rect.width,
          height: rect.height,
        };
      })
      .filter((box) => box.width > 0 && box.height > 0);
    const overlaps = [];
    for (let i = 0; i < panels.length; i += 1) {
      for (let j = i + 1; j < panels.length; j += 1) {
        const a = panels[i];
        const b = panels[j];
        const width = Math.min(a.right, b.right) - Math.max(a.x, b.x);
        const height = Math.min(a.bottom, b.bottom) - Math.max(a.y, b.y);
        if (width > 2 && height > 2) {
          overlaps.push({ a: a.className, b: b.className, width: Math.round(width), height: Math.round(height) });
        }
      }
    }

    return {
      viewport: { width: doc.clientWidth, height: doc.clientHeight },
      bodyTextLength: document.body.innerText.length,
      horizontalOverflow: doc.scrollWidth > doc.clientWidth + 2,
      scrollWidth: doc.scrollWidth,
      clientWidth: doc.clientWidth,
      clipped,
      overlaps,
      smoke: window.__harnesElectronSmoke || null,
    };
  });
}

async function assertNormalShell(page) {
  const result = await page.evaluate(() => {
    const visible = (selector) => {
      const element = document.querySelector(selector);
      return Boolean(element && window.getComputedStyle(element).display !== "none" && element.getClientRects().length);
    };
    return {
      sidebar: visible(".sidebar"),
      proposalDock: visible(".proposal-dock"),
      diagnostics: visible(".diagnostics-panel"),
      evidence: visible(".logs-panel"),
      restart: visible(".restart-panel"),
      rightRail: visible(".right-rail"),
      smoke: window.__harnesElectronSmoke || null,
    };
  });
  if (!result.sidebar || !result.proposalDock || result.diagnostics || result.evidence || result.restart || !result.rightRail) {
    fail("electron_harnesui_monkey_test: normal shell visibility failed", result);
  }
}

async function main() {
  mkdirp(outDir);
  mkdirp(userDataDir);

  const consoleErrors = [];
  const pageErrors = [];
  const requestFailures = [];
  const report = {
    generatedAt: new Date().toISOString(),
    screenshots: [],
    inspections: [],
    consoleErrors,
    pageErrors,
    requestFailures,
  };

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
    page.on("console", (message) => {
      if (message.type() === "error") consoleErrors.push(message.text());
    });
    page.on("pageerror", (error) => pageErrors.push(error.message));
    page.on("requestfailed", (request) => {
      requestFailures.push({ url: request.url(), failure: request.failure()?.errorText || "failed" });
    });

    await page.waitForFunction(() => {
      const smoke = window.__harnesElectronSmoke;
      return Boolean(
        smoke
        && smoke.runtimeOk
        && smoke.runtimePanelVisible
        && smoke.settingsVisible
        && smoke.commandPaletteVisible
        && smoke.attachmentsVisible
        && smoke.missionMetaVisible
        && smoke.oldWebStatusVisible
        && smoke.runtimeRefreshExplained
        && smoke.attachmentRowsReady
        && smoke.sidebarVisible
        && smoke.proposalDockVisible
        && smoke.operatorPanelsHidden
      );
    }, null, { timeout: 180000 });

    await assertNormalShell(page);

    const requiredLabels = [
      "Harnes Desktop",
      "Design proposal",
      "Chats",
      "Runtime",
      "Execution settings",
      "Conversation",
      "状態",
      "待機中",
      "/commands",
      "Web再起動",
      "Runtime更新",
      "Ver",
      "codex-cli",
    ];
    await page.waitForTimeout(1000);
    const labelCheck = await page.evaluate((labels) => {
      const text = document.body.innerText;
      return {
        missing: labels.filter((label) => !text.includes(label)),
        sample: text.replace(/\s+/g, " ").slice(0, 1200),
      };
    }, requiredLabels);
    if (labelCheck.missing.length) {
      fail("electron_harnesui_monkey_test: required labels are missing", labelCheck);
    }
    const removedConversationPillCount = await page.locator(".work-state-pill").count();
    if (removedConversationPillCount !== 0) {
      fail("electron_harnesui_monkey_test: removed duplicate conversation work-state pill must not render", { removedConversationPillCount });
    }
    const workStateText = await page.locator(".work-state-meta").innerText();
    if (!workStateText.includes("状態") || !/(作業中|完了|待機中|返信で続行|中断|要確認|状態確認中)/.test(workStateText)) {
      fail("electron_harnesui_monkey_test: composer metadata must expose a user-facing status", { workStateText });
    }
    if (/入力待ち|追加指示を送ると続行できます/.test(workStateText)) {
      fail("electron_harnesui_monkey_test: composer metadata must not show the old needs_input wording", { workStateText });
    }
    if (/\b(running|stream ended|completed|idle|failed|interrupted|needs_input)\b/i.test(workStateText)) {
      fail("electron_harnesui_monkey_test: composer metadata must not expose raw runtime status", { workStateText });
    }

    await page.evaluate(() => {
      const now = new Date().toISOString();
      window.localStorage.setItem("harnes-desktop-chats-v1", JSON.stringify([
        {
          id: "monkey-needs-input",
          title: "Needs input worst state",
          messages: [],
          status: "needs_input",
          activity: "status=needs_input",
          forceNewSession: true,
          updatedAt: now,
        },
      ]));
    });
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => {
      const smoke = window.__harnesElectronSmoke;
      return Boolean(smoke?.runtimeOk && smoke?.runtimePanelVisible && smoke?.missionMetaVisible);
    }, null, { timeout: 180000 });
    const needsInputWorkStateText = await page.locator(".work-state-meta").innerText();
    if (!needsInputWorkStateText.includes("状態") || !needsInputWorkStateText.includes("返信で続行")) {
      fail("electron_harnesui_monkey_test: needs_input worst-state metadata must show reply-to-continue wording", { needsInputWorkStateText });
    }
    if (/入力待ち|追加指示を送ると続行できます/.test(needsInputWorkStateText)) {
      fail("electron_harnesui_monkey_test: needs_input worst-state metadata must not show the old wording", { needsInputWorkStateText });
    }
    const needsInputScreenshot = path.join(outDir, "needs-input-resend-ready.png");
    await page.screenshot({ path: needsInputScreenshot, fullPage: true });
    report.screenshots.push(rel(needsInputScreenshot));
    report.inspections.push({
      name: "needs-input-resend-ready",
      ...(await inspectLayout(page)),
      workStateText: needsInputWorkStateText,
    });

    await page.locator("textarea").first().fill("Electron renderer smoke input. ".repeat(24));
    const idleComposerState = await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll("button"));
      const stop = buttons.find((button) => button.textContent && button.textContent.trim() === "停止");
      const send = buttons.find((button) => button.textContent && button.textContent.trim() === "送信");
      const stateText = document.querySelector(".work-state-meta")?.textContent || "";
      return {
        stopDisabled: stop ? stop.disabled : null,
        sendDisabled: send ? send.disabled : null,
        stateText,
      };
    });
    if (idleComposerState.stopDisabled !== true || idleComposerState.sendDisabled !== false) {
      fail("electron_harnesui_monkey_test: idle active chat with draft must allow send and keep stop disabled", idleComposerState);
    }
    const fixturePath = path.join(outDir, "attachment-fixture.png");
    fs.writeFileSync(fixturePath, Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=", "base64"));
    await page.locator("input[type='file']").setInputFiles(fixturePath);
    await page.waitForSelector(".attachment-item", { state: "visible" });
    const attachmentState = await page.evaluate(() => ({
      summary: document.querySelector(".attachment-panel-head")?.textContent?.replace(/\s+/g, " ").trim() || "",
      itemText: document.querySelector(".attachment-item")?.textContent?.replace(/\s+/g, " ").trim() || "",
      thumbnailVisible: Boolean(document.querySelector(".attachment-thumb")?.getClientRects().length),
      removeVisible: Boolean(document.querySelector(".attachment-remove")?.getClientRects().length),
    }));
    if (!attachmentState.summary.includes("1件の画像を添付中") || !attachmentState.thumbnailVisible || !attachmentState.removeVisible) {
      fail("electron_harnesui_monkey_test: attachment preview row failed", attachmentState);
    }
    await page.evaluate(() => document.querySelector(".attachment-panel")?.scrollIntoView({ block: "center" }));
    const attachmentScreenshot = path.join(outDir, "attachment-preview.png");
    await page.screenshot({ path: attachmentScreenshot, fullPage: true });
    const attachmentInspection = await inspectLayout(page);
    report.screenshots.push(rel(attachmentScreenshot));
    report.inspections.push({ name: "attachment-preview", ...attachmentInspection, attachmentState });
    if (attachmentInspection.horizontalOverflow || attachmentInspection.clipped.length || attachmentInspection.overlaps.length) {
      fail("electron_harnesui_monkey_test: attachment preview layout failed", attachmentInspection);
    }
    await page.locator(".sidebar-edge-toggle").click();
    await page.waitForFunction(() => {
      const rail = document.querySelector(".sidebar-rail");
      const sidebar = document.querySelector(".sidebar");
      return Boolean(rail && rail.getClientRects().length && (!sidebar || !sidebar.getClientRects().length));
    }, null, { timeout: 10000 });
    await page.evaluate(() => window.scrollTo(0, 0));
    const collapsedScreenshot = path.join(outDir, "collapsed-rail.png");
    await page.screenshot({ path: collapsedScreenshot, fullPage: true });
    const collapsedInspection = await inspectLayout(page);
    report.screenshots.push(rel(collapsedScreenshot));
    report.inspections.push({ name: "collapsed-rail", ...collapsedInspection });
    if (collapsedInspection.horizontalOverflow || collapsedInspection.clipped.length || collapsedInspection.overlaps.length) {
      fail("electron_harnesui_monkey_test: collapsed rail layout failed", collapsedInspection);
    }
    await page.locator(".sidebar-edge-toggle").click();
    await page.waitForFunction(() => {
      const sidebar = document.querySelector(".sidebar");
      const dock = document.querySelector(".proposal-dock");
      return Boolean(sidebar && sidebar.getClientRects().length && dock && dock.getClientRects().length);
    }, null, { timeout: 10000 });
    await page.locator(".command-menu-trigger").click();
    await page.waitForSelector(".command-menu");
    const commandMenuGeometry = await page.evaluate(() => {
      const trigger = document.querySelector(".command-menu-trigger");
      const menu = document.querySelector(".command-menu");
      if (!trigger || !menu) return null;
      const triggerRect = trigger.getBoundingClientRect();
      const menuRect = menu.getBoundingClientRect();
      return {
        triggerTop: Math.round(triggerRect.top),
        triggerBottom: Math.round(triggerRect.bottom),
        menuTop: Math.round(menuRect.top),
        menuBottom: Math.round(menuRect.bottom),
      };
    });
    if (!commandMenuGeometry || commandMenuGeometry.menuBottom > commandMenuGeometry.triggerTop - 4) {
      fail("electron_harnesui_monkey_test: command menu must open above the /commands button", commandMenuGeometry);
    }
    const commandMenuText = await page.locator(".command-menu").innerText();
    if (commandMenuText.includes("/help")) {
      fail("electron_harnesui_monkey_test: command menu must not expose removed /help route", { commandMenuText });
    }
    for (const requiredCommand of ["/goal", "/status", "/diff", "/resume --last", "/fast status", "/agent list"]) {
      if (!commandMenuText.includes(requiredCommand)) {
        fail("electron_harnesui_monkey_test: command menu lost a required command", { requiredCommand, commandMenuText });
      }
    }
    await page.evaluate(() => window.scrollTo(0, 0));
    const commandMenuScreenshot = path.join(outDir, "command-menu-open.png");
    await page.screenshot({ path: commandMenuScreenshot, fullPage: true });
    const commandMenuInspection = await inspectLayout(page);
    report.screenshots.push(rel(commandMenuScreenshot));
    report.inspections.push({ name: "command-menu-open", ...commandMenuInspection });
    if (commandMenuInspection.horizontalOverflow || commandMenuInspection.clipped.length || commandMenuInspection.overlaps.length) {
      fail("electron_harnesui_monkey_test: command menu layout failed", commandMenuInspection);
    }
    await page.locator(".command-menu-item").first().click();
    await page.locator(".command-menu-trigger").click();
    await page.getByRole("menuitem", { name: "/goal", exact: true }).click();
    await page.locator(".command-menu-trigger").click();
    await page.getByRole("menuitem", { name: "/status", exact: true }).click();
    await page.evaluate(() => document.querySelector(".settings-panel")?.scrollIntoView({ block: "center" }));
    await page.locator(".settings-disclosure-button").click();
    await page.waitForSelector(".settings-detail-body", { state: "visible" });
    await page.waitForSelector(".settings-panel select", { state: "visible" });
    const visibleSettingsSelect = page.locator(".settings-panel select");
    await visibleSettingsSelect.nth(0).selectOption("gpt-5.5");
    await visibleSettingsSelect.nth(1).selectOption("high");
    await visibleSettingsSelect.nth(2).selectOption("on-request");
    await visibleSettingsSelect.nth(3).selectOption("workspace-write");
    await visibleSettingsSelect.nth(4).selectOption("cached");
    await page.locator(".settings-panel input[type='checkbox']").first().setChecked(true);
    await page.locator(".settings-disclosure-button").click();
    await page.waitForSelector(".settings-detail-body", { state: "detached" });
    await page.getByRole("button", { name: "New" }).click();
    await page.locator("textarea").first().fill("New chat input after sidebar interaction.");
    await page.getByRole("button", { name: "Clear", exact: true }).click();

    const sizes = [
      { name: "wide-1365", width: 1365, height: 900 },
      { name: "request-1214", width: 1214, height: 768 },
      { name: "desktop-1100", width: 1100, height: 810 },
      { name: "minimum-1040", width: 1040, height: 760 },
    ];
    for (const size of sizes) {
      await setWindowSize(app, size.width, size.height);
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.waitForTimeout(600);
      const screenshot = path.join(outDir, `${size.name}.png`);
      await page.screenshot({ path: screenshot, fullPage: true });
      const inspection = await inspectLayout(page);
      report.screenshots.push(rel(screenshot));
      report.inspections.push({ name: size.name, ...inspection });
      if (inspection.horizontalOverflow || inspection.clipped.length || inspection.overlaps.length) {
        fail(`electron_harnesui_monkey_test: layout failed at ${size.name}`, inspection);
      }
    }

    if (consoleErrors.length || pageErrors.length || requestFailures.length) {
      fail("electron_harnesui_monkey_test: browser diagnostics failed", { consoleErrors, pageErrors, requestFailures });
    }

    const reportPath = path.join(outDir, "report.json");
    fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
    console.log(`electron_harnesui_monkey_test: PASS report=${rel(reportPath)}`);
  } finally {
    await app.close().catch(() => {});
  }
}

main().catch((error) => fail("electron_harnesui_monkey_test: failed", { error: error && error.stack ? error.stack : String(error) }));
