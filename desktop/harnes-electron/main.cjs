const { app, BrowserWindow, ipcMain, Menu, shell } = require("electron");
const { spawn } = require("child_process");
const fs = require("fs");
const http = require("http");
const path = require("path");

const appRoot = path.resolve(__dirname, "..", "..");
const electronUserDataDir = process.env.HARNES_ELECTRON_USER_DATA_DIR || path.join("runtime", "electron-harnes-user-data");
app.setPath("userData", path.isAbsolute(electronUserDataDir)
  ? electronUserDataDir
  : path.join(appRoot, electronUserDataDir));
const rendererDist = path.join(__dirname, "dist", "index.html");
const rendererDevUrl = process.env.HARNES_ELECTRON_RENDERER_URL || "";
const smokeMode = process.env.HARNES_ELECTRON_SMOKE === "1" || process.argv.includes("--smoke");
const smokeShow = process.env.HARNES_ELECTRON_SMOKE_SHOW === "1";
const smokeTimeoutMs = Math.max(5000, Number(process.env.HARNES_ELECTRON_SMOKE_TIMEOUT_MS || 30000));
const port = normalizePort(process.env.CODEX_UI_PORT, 57525);
const backendUrl = `http://127.0.0.1:${port}`;

let mainWindow = null;
let backendProcess = null;
let quitting = false;
const singleInstanceLock = app.requestSingleInstanceLock();
if (!singleInstanceLock) {
  app.exit(0);
}
app.on("second-instance", () => {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.focus();
});
const execControllers = new Map();
let state = {
  status: "starting",
  backendUrl,
  port,
  owned: false,
  pid: 0,
  message: "Electron shell is starting.",
  updatedAt: new Date().toISOString(),
};

function normalizePort(value, fallback) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 && parsed < 65536 ? parsed : fallback;
}

function setState(patch) {
  state = { ...state, ...patch, backendUrl, port, updatedAt: new Date().toISOString() };
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("harnes:backend-status", state);
  }
  return state;
}

function requestJson(method, pathname, body, headers = {}, timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    const data = body ? Buffer.from(JSON.stringify(body)) : null;
    const req = http.request(
      {
        hostname: "127.0.0.1",
        port,
        path: pathname,
        method,
        timeout: timeoutMs,
        headers: {
          accept: "application/json",
          ...(data ? { "content-type": "application/json", "content-length": String(data.length) } : {}),
          ...headers,
        },
      },
      (res) => {
        const chunks = [];
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("end", () => {
          const text = Buffer.concat(chunks).toString("utf8");
          let json = null;
          try {
            json = text ? JSON.parse(text) : null;
          } catch (error) {
            reject(new Error(`Invalid JSON from ${pathname}: ${error.message}`));
            return;
          }
          if (res.statusCode < 200 || res.statusCode >= 300) {
            const detail = json && json.error ? json.error : `HTTP ${res.statusCode}`;
            reject(new Error(detail));
            return;
          }
          resolve(json);
        });
      },
    );
    req.on("timeout", () => req.destroy(new Error(`Timed out requesting ${pathname}`)));
    req.on("error", reject);
    if (data) req.write(data);
    req.end();
  });
}

function createExecIdempotencyKey() {
  return `electron-exec-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function localOriginHeaders() {
  return {
    Origin: backendUrl,
    Referer: `${backendUrl}/`,
  };
}

function controlHeadersFromRuntime(runtime, action = "exec") {
  const control = runtime && (runtime.controlApi || runtime.control_api) || {};
  const token = typeof control.token === "string" ? control.token.trim() : "";
  const tokenHeader = typeof control.tokenHeader === "string" && control.tokenHeader.trim()
    ? control.tokenHeader.trim()
    : "x-codex-control-token";
  if (!token) throw new Error(`Control API token is unavailable for ${action}.`);
  return { ...localOriginHeaders(), [tokenHeader]: token };
}

function sendExecEvent(requestId, event) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.webContents.send("harnes:exec-event", {
    requestId,
    event: event && typeof event === "object" ? event : { type: "error", text: String(event || "unknown event") },
  });
}

function isTerminalExecStatus(status) {
  return ["completed", "failed", "interrupted", "needs_input"].includes(String(status || "").toLowerCase());
}

function normalizeExecPayload(payload) {
  const source = payload && typeof payload === "object" ? payload : {};
  const prompt = typeof source.prompt === "string" ? source.prompt : "";
  if (!prompt.trim()) throw new Error("Mission text is required.");
  const idempotencyKey = typeof source.idempotencyKey === "string" && source.idempotencyKey.trim()
    ? source.idempotencyKey.trim()
    : createExecIdempotencyKey();
  const images = Array.isArray(source.images)
    ? source.images.slice(0, 8).map((image) => {
      const item = image && typeof image === "object" ? image : {};
      const dataUrl = typeof item.dataUrl === "string" ? item.dataUrl : "";
      const mimeType = typeof item.mimeType === "string" ? item.mimeType.toLowerCase() : "";
      if (!dataUrl.startsWith("data:image/") || !mimeType.startsWith("image/")) return null;
      return {
        name: typeof item.name === "string" && item.name.trim() ? item.name.trim().slice(0, 120) : "image",
        mimeType,
        sizeBytes: Number.isFinite(Number(item.sizeBytes)) ? Math.max(0, Math.trunc(Number(item.sizeBytes))) : 0,
        dataUrl,
      };
    }).filter(Boolean)
    : [];
  const normalized = {
    prompt,
    sandboxMode: typeof source.sandboxMode === "string" ? source.sandboxMode : "danger-full-access",
    approvalPolicy: typeof source.approvalPolicy === "string" ? source.approvalPolicy : "on-request",
    fastModeEnabled: Boolean(source.fastModeEnabled),
    automaticApprovalReviewEnabled: Boolean(source.automaticApprovalReviewEnabled),
    webSearch: Boolean(source.webSearch),
    webSearchMode: typeof source.webSearchMode === "string" ? source.webSearchMode : "cached",
    model: typeof source.model === "string" ? source.model : "gpt-5.5",
    modelReasoningEffort: typeof source.modelReasoningEffort === "string" ? source.modelReasoningEffort : "xhigh",
    agentName: typeof source.agentName === "string" ? source.agentName : "default",
    forceNewSession: Boolean(source.forceNewSession),
    cwd: typeof source.cwd === "string" ? source.cwd : appRoot,
    executionProfile: typeof source.executionProfile === "string" ? source.executionProfile : "custom",
    executionIntent: typeof source.executionIntent === "string" ? source.executionIntent : "electron-ui-interactive",
    executionSource: "electron_ui",
    idempotencyKey,
  };
  if (images.length) normalized.images = images;
  return normalized;
}

async function submitExecFromElectron(event, sourcePayload) {
  const runtime = await probeRuntime(120000);
  const payload = normalizeExecPayload({
    ...sourcePayload,
    model: sourcePayload && sourcePayload.model || runtime.execApi && runtime.execApi.defaultModel,
    modelReasoningEffort: sourcePayload && sourcePayload.modelReasoningEffort || runtime.execApi && runtime.execApi.modelReasoningEffort,
    agentName: sourcePayload && sourcePayload.agentName || runtime.activeAgent,
    cwd: sourcePayload && sourcePayload.cwd || runtime.workspaceRoot,
    fastModeEnabled: sourcePayload && Object.prototype.hasOwnProperty.call(sourcePayload, "fastModeEnabled")
      ? sourcePayload.fastModeEnabled
      : runtime.fastModeEnabled,
    automaticApprovalReviewEnabled: sourcePayload && Object.prototype.hasOwnProperty.call(sourcePayload, "automaticApprovalReviewEnabled")
      ? sourcePayload.automaticApprovalReviewEnabled
      : runtime.automaticApprovalReviewEnabled,
  });
  const requestId = typeof sourcePayload.requestId === "string" && sourcePayload.requestId.trim()
    ? sourcePayload.requestId.trim()
    : payload.idempotencyKey;
  if (execControllers.has(requestId)) throw new Error(`Exec request is already active: ${requestId}`);
  const body = Buffer.from(JSON.stringify(payload));
  const headers = {
    accept: "application/x-ndjson, application/json",
    "content-type": "application/json",
    "content-length": String(body.length),
    "Idempotency-Key": payload.idempotencyKey,
    ...controlHeadersFromRuntime(runtime, "exec"),
  };
  const req = http.request(
    {
      hostname: "127.0.0.1",
      port,
      path: "/api/exec",
      method: "POST",
      headers,
    },
    (res) => {
      const statusCode = Number(res.statusCode || 0);
      const contentType = String(res.headers["content-type"] || "").toLowerCase();
      if (statusCode < 200 || statusCode >= 300 || !contentType.includes("application/x-ndjson")) {
        const chunks = [];
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("end", () => {
          const text = Buffer.concat(chunks).toString("utf8");
          sendExecEvent(requestId, { type: "error", text: text || `HTTP ${statusCode}` });
          sendExecEvent(requestId, { type: "status", status: "failed" });
          execControllers.delete(requestId);
        });
        return;
      }
      let buffer = "";
      let terminalStatusEmitted = false;
      let streamErrorSeen = false;
      const forwardExecEvent = (event) => {
        if (event && typeof event === "object") {
          if (event.type === "status" && isTerminalExecStatus(event.status)) terminalStatusEmitted = true;
          if (event.type === "error") streamErrorSeen = true;
        }
        sendExecEvent(requestId, event);
      };
      const flush = (chunk = "", force = false) => {
        if (chunk) buffer += chunk;
        while (true) {
          const index = buffer.indexOf("\n");
          if (index < 0) break;
          const line = buffer.slice(0, index).trim();
          buffer = buffer.slice(index + 1);
          if (!line) continue;
          try {
            forwardExecEvent(JSON.parse(line));
          } catch (_error) {
            forwardExecEvent({ type: "delta", text: `${line}\n` });
          }
        }
        if (force && buffer.trim()) {
          const line = buffer.trim();
          buffer = "";
          try {
            forwardExecEvent(JSON.parse(line));
          } catch (_error) {
            forwardExecEvent({ type: "delta", text: `${line}\n` });
          }
        }
      };
      res.on("data", (chunk) => flush(chunk.toString("utf8")));
      res.on("end", () => {
        flush("", true);
        if (!terminalStatusEmitted) {
          forwardExecEvent({ type: "status", status: streamErrorSeen ? "failed" : "completed" });
        }
        sendExecEvent(requestId, { type: "stream-end" });
        execControllers.delete(requestId);
      });
    },
  );
  execControllers.set(requestId, { req, startedAt: Date.now() });
  req.on("error", (error) => {
    const cancelled = error && error.message === "electron-ui-cancelled";
    sendExecEvent(requestId, { type: "error", text: cancelled ? "user interrupted" : error.message || String(error) });
    sendExecEvent(requestId, { type: "status", status: cancelled ? "interrupted" : "failed" });
    execControllers.delete(requestId);
  });
  req.write(body);
  req.end();
  return { ok: true, requestId, idempotencyKey: payload.idempotencyKey };
}

function cancelExecFromElectron(requestId) {
  const key = String(requestId || "").trim();
  const active = key ? execControllers.get(key) : null;
  if (!active || !active.req) return { ok: false, error: "No active exec request matched." };
  active.req.destroy(new Error("electron-ui-cancelled"));
  execControllers.delete(key);
  return { ok: true, requestId: key };
}

function readCurrentLogs() {
  const names = [
    "operator_summary.json",
    "latest_run_summary.json",
    "review_load_breakdown.json",
    "design_conformance_summary.json",
    "latest_signoff_summary.json",
  ];
  const root = path.join(appRoot, "logs", "current");
  const entries = names.map((name) => {
    const fullPath = path.join(root, name);
    try {
      const text = fs.readFileSync(fullPath, "utf8");
      return {
        name,
        path: path.relative(appRoot, fullPath).replace(/\\/g, "/"),
        ok: true,
        data: JSON.parse(text),
      };
    } catch (error) {
      return {
        name,
        path: path.relative(appRoot, fullPath).replace(/\\/g, "/"),
        ok: false,
        error: error && error.message ? error.message : String(error),
      };
    }
  });
  return {
    ok: true,
    root: path.relative(appRoot, root).replace(/\\/g, "/"),
    generatedAt: new Date().toISOString(),
    entries,
  };
}

function readDiagnostics() {
  return requestJson("GET", "/api/diagnostics", null, {}, 30000);
}

async function lockWorkspaceFromElectron(_event, targetPath) {
  const pathValue = typeof targetPath === "string" ? targetPath.trim() : "";
  if (!pathValue) throw new Error("Workspace path is required.");
  const runtime = await probeRuntime(120000);
  return requestJson(
    "POST",
    "/api/workspace/lock",
    { action: "lock_workspace_directory", path: pathValue },
    controlHeadersFromRuntime(runtime, "lock_workspace_directory"),
    30000,
  );
}

async function unlockWorkspaceFromElectron() {
  const runtime = await probeRuntime(120000);
  return requestJson(
    "POST",
    "/api/workspace/unlock",
    { action: "unlock_workspace_directory" },
    controlHeadersFromRuntime(runtime, "unlock_workspace_directory"),
    30000,
  );
}

async function probeRuntime(timeoutMs = 120000) {
  const runtime = await requestJson("GET", "/api/runtime", null, {}, timeoutMs);
  if (!runtime || runtime.mode !== "app-server") {
    throw new Error("Runtime is not the Harnes app-server.");
  }
  return runtime;
}

async function waitForRuntime(deadlineMs = 20000) {
  const deadline = Date.now() + deadlineMs;
  let lastError = null;
  while (Date.now() < deadline) {
    try {
      return await probeRuntime();
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }
  throw lastError || new Error("Runtime did not become ready.");
}

async function ensureBackend() {
  try {
    const runtime = await waitForRuntime(130000);
    setState({
      status: "running",
      owned: false,
      pid: runtime.serverProcess && runtime.serverProcess.pid ? runtime.serverProcess.pid : 0,
      message: "Using the existing Harnes backend on port 57525.",
    });
    return runtime;
  } catch (_error) {
    return startOwnedBackend();
  }
}

async function startOwnedBackend() {
  if (backendProcess && !backendProcess.killed) {
    return waitForRuntime();
  }
  setState({ status: "starting", owned: true, pid: 0, message: "Starting node server.js." });
  backendProcess = spawn(process.execPath, [path.join(appRoot, "server.js")], {
    cwd: appRoot,
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
    env: {
      ...process.env,
      CODEX_UI_PORT: String(port),
      CODEX_AUTO_OPEN_BROWSER: "0",
      CODEX_REQUIRE_ADMIN: "0",
    },
  });
  setState({ status: "starting", owned: true, pid: backendProcess.pid || 0, message: "Waiting for backend runtime." });
  backendProcess.stdout.on("data", (chunk) => {
    if (smokeMode) process.stdout.write(chunk);
  });
  backendProcess.stderr.on("data", (chunk) => {
    if (smokeMode) process.stderr.write(chunk);
  });
  backendProcess.on("exit", (code, signal) => {
    if (quitting) return;
    setState({
      status: "failed",
      owned: true,
      pid: 0,
      message: `Owned backend exited with ${signal || code || 0}.`,
    });
  });
  const runtime = await waitForRuntime(25000);
  setState({
    status: "running",
    owned: true,
    pid: backendProcess.pid || (runtime.serverProcess && runtime.serverProcess.pid) || 0,
    message: "Owned backend is running.",
  });
  return runtime;
}

function stopOwnedBackend() {
  return new Promise((resolve) => {
    if (!backendProcess || backendProcess.killed) {
      resolve();
      return;
    }
    const child = backendProcess;
    const timeout = setTimeout(() => {
      try {
        child.kill("SIGKILL");
      } catch (_error) {
      }
      resolve();
    }, 6000);
    child.once("exit", () => {
      clearTimeout(timeout);
      resolve();
    });
    try {
      child.kill();
    } catch (_error) {
      clearTimeout(timeout);
      resolve();
    }
  });
}

async function restartExternalBackend() {
  const runtime = await probeRuntime();
  const control = runtime.controlApi || runtime.control_api || {};
  const allowlist = Array.isArray(control.actionAllowlist) ? control.actionAllowlist : [];
  if (!allowlist.includes("restart_harness_server")) {
    throw new Error("Existing backend does not expose restart control to Electron.");
  }
  await requestJson(
    "POST",
    "/api/server/restart",
    { action: "restart_harness_server", reason: "electron_harnesui_restart_button" },
    controlHeadersFromRuntime(runtime, "restart_harness_server"),
    8000,
  );
  return waitForRuntime(30000);
}

async function restartBackend() {
  setState({ status: "restarting", message: "Restart requested. Waiting for backend to return." });
  try {
    let runtime;
    if (backendProcess && state.owned) {
      await stopOwnedBackend();
      backendProcess = null;
      runtime = await startOwnedBackend();
    } else {
      runtime = await restartExternalBackend();
      setState({
        status: "running",
        owned: false,
        pid: runtime.serverProcess && runtime.serverProcess.pid ? runtime.serverProcess.pid : 0,
        message: "Existing backend restart completed.",
      });
    }
    return { ok: true, state, runtime };
  } catch (error) {
    setState({ status: "failed", message: error && error.message ? error.message : "Restart failed." });
    return { ok: false, state, error: state.message };
  }
}

async function createWindow() {
  installApplicationMenu();
  mainWindow = new BrowserWindow({
    width: 1320,
    height: 860,
    minWidth: 1040,
    minHeight: 680,
    show: smokeShow || !smokeMode,
    title: "Harnes Desktop",
    backgroundColor: "#f4f7f4",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });
  if (rendererDevUrl) {
    await mainWindow.loadURL(rendererDevUrl);
  } else if (fs.existsSync(rendererDist)) {
    await mainWindow.loadFile(rendererDist);
  } else {
    await mainWindow.loadURL(`${backendUrl}/01.HarnesUI/index.html`);
  }
  if (smokeMode) {
    runSmokeAndExit().catch((error) => {
      console.error(error);
      app.exit(1);
    });
  }
}

function installApplicationMenu() {
  const menu = Menu.buildFromTemplate([
    {
      label: "ファイル",
      submenu: [
        { label: "終了", role: "quit" },
      ],
    },
    {
      label: "編集",
      submenu: [
        { label: "元に戻す", role: "undo" },
        { label: "やり直す", role: "redo" },
        { type: "separator" },
        { label: "切り取り", role: "cut" },
        { label: "コピー", role: "copy" },
        { label: "貼り付け", role: "paste" },
        { label: "すべて選択", role: "selectAll" },
      ],
    },
    {
      label: "表示",
      submenu: [
        { label: "再読み込み", role: "reload" },
        { label: "強制再読み込み", role: "forceReload" },
        { label: "開発者ツール", role: "toggleDevTools" },
        { type: "separator" },
        { label: "拡大", role: "zoomIn" },
        { label: "縮小", role: "zoomOut" },
        { label: "実際のサイズ", role: "resetZoom" },
        { type: "separator" },
        { label: "全画面表示", role: "togglefullscreen" },
      ],
    },
    {
      label: "ウィンドウ",
      submenu: [
        { label: "最小化", role: "minimize" },
        { label: "閉じる", role: "close" },
      ],
    },
  ]);
  Menu.setApplicationMenu(menu);
}

async function runSmokeAndExit() {
  const deadline = Date.now() + smokeTimeoutMs;
  let result = null;
  while (Date.now() < deadline) {
    result = await Promise.race([
      mainWindow.webContents.executeJavaScript("window.__harnesElectronSmoke || null", true),
      new Promise((resolve) => setTimeout(() => resolve(null), 1500)),
    ]);
    if (
      result
      && result.runtimeOk
      && result.proposalLinkVisible
      && result.logsOk
      && result.execControlsVisible
      && result.settingsVisible
      && result.sidebarVisible
      && result.proposalDockVisible
      && result.operatorPanelsHidden
      && result.commandPaletteVisible
      && result.attachmentsVisible
      && result.missionMetaVisible
      && result.oldWebStatusVisible
      && result.oldWebStatusLabel === "待機中"
      && result.runtimePanelLabel === "接続済み"
      && result.readyStatusSpinnerStopped
      && result.runtimeRefreshExplained
      && result.attachmentRowsReady
      && result.layoutOk
    ) break;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  const ok = Boolean(
    result
    && result.runtimeOk
    && result.proposalLinkVisible
    && result.logsOk
    && result.execControlsVisible
    && result.settingsVisible
    && result.sidebarVisible
    && result.proposalDockVisible
    && result.operatorPanelsHidden
    && result.commandPaletteVisible
    && result.attachmentsVisible
    && result.missionMetaVisible
    && result.oldWebStatusVisible
    && result.oldWebStatusLabel === "待機中"
    && result.runtimePanelLabel === "接続済み"
    && result.readyStatusSpinnerStopped
    && result.runtimeRefreshExplained
    && result.attachmentRowsReady
    && result.layoutOk,
  );
  let screenshotPath = "";
  try {
    const screenshotDir = path.join(appRoot, "output", "electron-harnesui");
    fs.mkdirSync(screenshotDir, { recursive: true });
    const screenshot = await mainWindow.capturePage();
    screenshotPath = path.join(screenshotDir, `smoke-${Date.now()}.png`);
    fs.writeFileSync(screenshotPath, screenshot.toPNG());
  } catch (error) {
    screenshotPath = `capture failed: ${error && error.message ? error.message : "unknown"}`;
  }
  console.log(`HARNES_ELECTRON_SMOKE_RESULT=${JSON.stringify({ ok, result, backend: state, screenshotPath })}`);
  process.exit(ok ? 0 : 1);
}

ipcMain.handle("harnes:get-backend-status", () => state);
ipcMain.handle("harnes:get-runtime", () => requestJson("GET", "/api/runtime", null, {}, 120000));
ipcMain.handle("harnes:get-proposal-manifest", () => requestJson("GET", "/design-proposals/latest/manifest.json", null, {}, 8000));
ipcMain.handle("harnes:get-current-logs", () => readCurrentLogs());
ipcMain.handle("harnes:get-diagnostics", () => readDiagnostics());
ipcMain.handle("harnes:submit-exec", submitExecFromElectron);
ipcMain.handle("harnes:cancel-exec", (_event, requestId) => cancelExecFromElectron(requestId));
ipcMain.handle("harnes:restart-backend", () => restartBackend());
ipcMain.handle("harnes:lock-workspace", lockWorkspaceFromElectron);
ipcMain.handle("harnes:unlock-workspace", unlockWorkspaceFromElectron);
ipcMain.handle("harnes:open-external", async (_event, target) => {
  const url = new URL(String(target || ""), backendUrl);
  if (url.hostname !== "127.0.0.1" && url.hostname !== "localhost") {
    throw new Error("Only local Harnes URLs can be opened from the Electron shell.");
  }
  await shell.openExternal(url.toString());
  return { ok: true, url: url.toString() };
});

app.whenReady().then(async () => {
  await ensureBackend();
  await createWindow();
  setInterval(async () => {
    try {
      const runtime = await probeRuntime();
      setState({
        status: "running",
        pid: runtime.serverProcess && runtime.serverProcess.pid ? runtime.serverProcess.pid : state.pid,
        message: state.owned ? "Owned backend is running." : "Using the existing Harnes backend on port 57525.",
      });
    } catch (error) {
      setState({ status: "failed", pid: 0, message: error && error.message ? error.message : "Runtime probe failed." });
    }
  }, 60000).unref();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", () => {
  quitting = true;
  for (const [requestId, active] of execControllers.entries()) {
    try {
      if (active && active.req) active.req.destroy(new Error("electron-ui-cancelled"));
    } catch (_error) {
    }
    execControllers.delete(requestId);
  }
  if (backendProcess && state.owned) {
    try {
      backendProcess.kill();
    } catch (_error) {
    }
  }
});
