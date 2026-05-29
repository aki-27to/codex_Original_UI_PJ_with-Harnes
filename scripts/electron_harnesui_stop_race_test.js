#!/usr/bin/env node
"use strict";

const fs = require("fs");
const http = require("http");
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

function sendJson(res, statusCode, payload) {
  const body = Buffer.from(`${JSON.stringify(payload)}\n`);
  res.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
    "content-length": String(body.length),
    "cache-control": "no-store",
  });
  res.end(body);
}

function runtimePayload(port, state) {
  return {
    mode: "app-server",
    workspaceRoot: root,
    activeAgent: "default",
    approvalPolicy: "on-request",
    sandboxMode: "workspace-write",
    fastModeEnabled: true,
    automaticApprovalReviewEnabled: false,
    activeExecRequests: state.activeExecRequests,
    execApi: {
      defaultModel: "gpt-5.5",
      modelReasoningEffort: "xhigh",
    },
    controlApi: {
      token: "mock-control-token",
      tokenHeader: "x-codex-control-token",
    },
    serverProcess: {
      pid: process.pid,
      startedAt: state.startedAt,
      activeExecRequests: state.activeExecRequests,
      restartProtection: {
        activeExecRequests: state.activeExecRequests,
        restartBlocked: state.activeExecRequests > 0 ? 1 : 0,
      },
    },
    turnRuntime: {
      activeExecRequests: state.activeExecRequests,
      activeTurns: state.activeExecRequests > 0 ? [{ agentName: "default", threadId: "mock-thread", turnId: "mock-turn" }] : [],
      latestTurn: state.activeExecRequests > 0 ? { status: "in_progress", threadId: "mock-thread", turnId: "mock-turn" } : null,
    },
    diagnostics: { ok: true },
    backendUrl: `http://127.0.0.1:${port}`,
  };
}

async function startMockBackend() {
  const state = {
    startedAt: Date.now(),
    activeExecRequests: 0,
    execStarted: 0,
    execClosed: 0,
    lastExecBody: "",
  };
  const server = http.createServer((req, res) => {
    const url = new URL(req.url || "/", "http://127.0.0.1");
    if (req.method === "GET" && url.pathname === "/api/runtime") {
      sendJson(res, 200, runtimePayload(server.address().port, state));
      return;
    }
    if (req.method === "GET" && url.pathname === "/api/diagnostics") {
      sendJson(res, 200, { ok: true, summary: "mock diagnostics", generatedAt: new Date().toISOString() });
      return;
    }
    if (req.method === "GET" && url.pathname === "/design-proposals/latest/manifest.json") {
      sendJson(res, 200, { target: "mock", proposalTitle: "Mock proposal", publicPath: "/design-proposals/latest/index.html" });
      return;
    }
    if (req.method === "POST" && url.pathname === "/api/exec") {
      const chunks = [];
      req.on("data", (chunk) => chunks.push(chunk));
      req.on("end", () => {
        state.lastExecBody = Buffer.concat(chunks).toString("utf8");
      });
      state.execStarted += 1;
      state.activeExecRequests += 1;
      let closed = false;
      let timer = null;
      const closeOnce = () => {
        if (closed) return;
        closed = true;
        if (timer) clearInterval(timer);
        state.execClosed += 1;
        state.activeExecRequests = Math.max(0, state.activeExecRequests - 1);
      };
      res.writeHead(200, {
        "content-type": "application/x-ndjson; charset=utf-8",
        "cache-control": "no-store",
        "transfer-encoding": "chunked",
      });
      res.write(`${JSON.stringify({ type: "turn", phase: "started", threadId: "mock-thread", turnId: "mock-turn" })}\n`);
      timer = setInterval(() => {
        if (!res.destroyed) {
          res.write(`${JSON.stringify({ type: "activity", label: "mock_stream", detail: new Date().toISOString() })}\n`);
        }
      }, 50);
      res.on("close", closeOnce);
      res.on("error", closeOnce);
      return;
    }
    sendJson(res, 404, { ok: false, error: `not found: ${url.pathname}` });
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve());
  });
  return {
    port: server.address().port,
    state,
    close: () => new Promise((resolve) => server.close(() => resolve())),
  };
}

async function waitForCondition(predicate, label, timeoutMs = 10000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`Timed out waiting for ${label}`);
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
  const mockBackend = await startMockBackend();
  const app = await electron.launch({
    executablePath: electronBinary,
    args: [path.join(root, "desktop", "harnes-electron", "main.cjs")],
    cwd: root,
    env: {
      ...process.env,
      CODEX_AUTO_OPEN_BROWSER: "0",
      CODEX_UI_PORT: String(mockBackend.port),
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

    const activeRequestId = `electron-active-stop-${Date.now()}`;
    const submitActive = await page.evaluate(async (requestId) => window.harnesDesktop.submitExec({
      requestId,
      prompt: "Active Stop response abort probe.",
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
    }), activeRequestId);
    await waitForCondition(() => mockBackend.state.activeExecRequests === 1 && mockBackend.state.execStarted === 1, "mock active exec registration");
    const cancelActive = await page.evaluate(async (requestId) => window.harnesDesktop.cancelExec(requestId), activeRequestId);
    await waitForCondition(() => mockBackend.state.execClosed === 1 && mockBackend.state.activeExecRequests === 0, "mock active exec response close");
    const activeArtifact = {
      requestId: activeRequestId,
      submit: submitActive,
      cancel: cancelActive,
      mock: {
        execStarted: mockBackend.state.execStarted,
        execClosed: mockBackend.state.execClosed,
        activeExecRequests: mockBackend.state.activeExecRequests,
      },
    };
    if (!cancelActive || cancelActive.ok !== true || cancelActive.pending) {
      fail("active Stop must cancel an owned streaming request", activeArtifact);
    }
    if (activeArtifact.mock.activeExecRequests !== 0 || activeArtifact.mock.execClosed !== 1) {
      fail("active Stop must close the backend streaming response and release active exec", activeArtifact);
    }
    const activeArtifactPath = path.join(artifactRoot, "active-response-stop.json");
    fs.writeFileSync(activeArtifactPath, `${JSON.stringify(activeArtifact, null, 2)}\n`, "utf8");
    console.log(`PASS electron_harnesui_stop_race_test artifact=${path.relative(root, artifactPath).replace(/\\/g, "/")} activeArtifact=${path.relative(root, activeArtifactPath).replace(/\\/g, "/")}`);
  } finally {
    await app.close().catch(() => {});
    await mockBackend.close().catch(() => {});
  }
}

main().catch((error) => fail("electron_harnesui_stop_race_test: failed", { error: error && error.stack ? error.stack : String(error) }));
