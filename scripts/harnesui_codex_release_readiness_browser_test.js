"use strict";

const assert = require("assert");
const fs = require("fs");
const http = require("http");
const path = require("path");
const { spawnNodeScript } = require("./lib/process_invocation");

const repoRoot = path.resolve(__dirname, "..");
const mcpServerPath = path.join(repoRoot, "tools", "playwright-mcp-server", "src", "server.js");
const targetPort = Number(process.env.CODEX_HARNESUI_BROWSER_TEST_PORT || 57595);
const baseUrl = `http://127.0.0.1:${targetPort}`;
const targetUrl = `${baseUrl}/01.HarnesUI/index.html`;
const artifactRoot = path.join(repoRoot, "output", "playwright", "harnesui-codex-release-readiness");
const viewports = [
  { name: "desktop-1440x980", width: 1440, height: 980, isMobile: false },
  { name: "mobile-390x844", width: 390, height: 844, isMobile: true },
];

let mcp = null;
let nextId = 1;
let stdoutBuffer = "";
let stderrBuffer = "";
const pending = new Map();

function requestText(url, timeoutMs = 3000) {
  return new Promise((resolve, reject) => {
    const req = http.get(url, (res) => {
      let body = "";
      res.setEncoding("utf8");
      res.on("data", (chunk) => {
        body += chunk;
      });
      res.on("end", () => {
        if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
          resolve(body);
        } else {
          reject(new Error(`GET ${url} returned ${res.statusCode}`));
        }
      });
    });
    req.setTimeout(timeoutMs, () => {
      req.destroy(new Error(`GET ${url} timed out`));
    });
    req.on("error", reject);
  });
}

async function waitForRuntime(timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs;
  let lastError = null;
  while (Date.now() < deadline) {
    try {
      const text = await requestText(`${baseUrl}/api/runtime`);
      return JSON.parse(text);
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 300));
    }
  }
  throw lastError || new Error("runtime did not become ready");
}

function startMcpServer() {
  mcp = spawnNodeScript(mcpServerPath, {
    args: ["--artifact-root", artifactRoot],
    cwd: repoRoot,
    stdio: ["pipe", "pipe", "pipe"],
  });
  mcp.stdout.setEncoding("utf8");
  mcp.stdout.on("data", (chunk) => {
    stdoutBuffer += chunk;
    let newlineIndex = stdoutBuffer.indexOf("\n");
    while (newlineIndex >= 0) {
      const line = stdoutBuffer.slice(0, newlineIndex).trim();
      stdoutBuffer = stdoutBuffer.slice(newlineIndex + 1);
      if (line) {
        const message = JSON.parse(line);
        const waiter = pending.get(message.id);
        if (waiter) {
          pending.delete(message.id);
          waiter.resolve(message);
        }
      }
      newlineIndex = stdoutBuffer.indexOf("\n");
    }
  });
  mcp.stderr.setEncoding("utf8");
  mcp.stderr.on("data", (chunk) => {
    stderrBuffer += chunk;
  });
  mcp.on("exit", (code, signal) => {
    const error = new Error(`Playwright MCP server exited: code=${code} signal=${signal}\n${stderrBuffer}`);
    for (const waiter of pending.values()) waiter.reject(error);
    pending.clear();
  });
}

function send(method, params = {}) {
  const id = nextId++;
  mcp.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id, method, params })}\n`);
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error(`Timed out waiting for ${method}\n${stderrBuffer}`));
    }, 60000);
    pending.set(id, {
      resolve: (message) => {
        clearTimeout(timer);
        if (message.error) reject(new Error(`${method} failed: ${JSON.stringify(message.error)}`));
        else resolve(message);
      },
      reject: (error) => {
        clearTimeout(timer);
        reject(error);
      },
    });
  });
}

function notify(method, params = {}) {
  mcp.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", method, params })}\n`);
}

function parseToolJson(response) {
  assert(response.result, "tools/call response should have a result");
  const textBlock = response.result.content.find((block) => block.type === "text");
  assert(textBlock, "tools/call result should include text content");
  return {
    payload: JSON.parse(textBlock.text),
    isError: response.result.isError === true,
  };
}

function shouldRetryWithChannel(payload) {
  const text = `${payload.message || ""} ${payload.details ? JSON.stringify(payload.details) : ""}`;
  return /PLAYWRIGHT_UNAVAILABLE|Executable doesn't exist|browserType\.launch|install chromium|Host system is missing/i.test(text);
}

function fallbackChannels() {
  return process.platform === "win32" ? ["msedge", "chrome"] : ["chrome"];
}

async function runViewportMatrix(channel) {
  const args = {
    url: targetUrl,
    viewports,
    wait_until: "networkidle",
    screenshot: true,
    snapshot: true,
    max_elements: 240,
  };
  if (channel) args.channel = channel;
  const response = await send("tools/call", {
    name: "playwright_viewport_matrix",
    arguments: args,
  });
  return parseToolJson(response);
}

async function stopChild(child) {
  if (!child || child.killed) return;
  const closed = new Promise((resolve) => child.once("exit", resolve));
  child.kill();
  const timeout = new Promise((resolve) => setTimeout(resolve, 3000, "timeout"));
  if (await Promise.race([closed, timeout]) === "timeout") {
    child.kill("SIGKILL");
    await closed.catch(() => {});
  }
}

function snapshotHasText(snapshot, snippet) {
  const bodyText = snapshot && typeof snapshot.bodyTextSample === "string" ? snapshot.bodyTextSample : "";
  if (bodyText.includes(snippet)) return true;
  return Boolean(snapshot && Array.isArray(snapshot.textBlocks) && snapshot.textBlocks.some((entry) => {
    return typeof entry.text === "string" && entry.text.includes(snippet);
  }));
}

function assertViewportResult(result) {
  const diag = result.diagnostics || {};
  const metrics = result.snapshot && result.snapshot.metrics ? result.snapshot.metrics : {};
  assert(snapshotHasText(result.snapshot, "Codex release readiness"), `${result.viewport.name} should render the release readiness panel`);
  assert(snapshotHasText(result.snapshot, "v0.128"), `${result.viewport.name} should show the target release version`);
  assert(snapshotHasText(result.snapshot, "対応済み") || snapshotHasText(result.snapshot, "一部対応"), `${result.viewport.name} should show readiness statuses`);
  assert.strictEqual(diag.console, 0, `${result.viewport.name} should keep browser console diagnostics at zero`);
  assert.strictEqual(diag.pageErrors, 0, `${result.viewport.name} should keep page errors at zero`);
  assert.strictEqual(diag.failedRequests, 0, `${result.viewport.name} should keep failed requests at zero`);
  assert.strictEqual(diag.httpErrors, 0, `${result.viewport.name} should keep HTTP errors at zero`);
  assert.strictEqual(metrics.horizontalOverflow, false, `${result.viewport.name} should avoid horizontal overflow`);
}

async function main() {
  fs.mkdirSync(artifactRoot, { recursive: true });
  const server = spawnNodeScript(path.join(repoRoot, "server.js"), {
    cwd: repoRoot,
    env: {
      ...process.env,
      CODEX_UI_PORT: String(targetPort),
      CODEX_AUTO_OPEN_BROWSER: "0",
      CODEX_PAUSE_ON_EXIT: "0",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let serverStderr = "";
  server.stderr.setEncoding("utf8");
  server.stderr.on("data", (chunk) => {
    serverStderr += chunk;
  });

  try {
    const runtime = await waitForRuntime();
    const readiness = runtime.codexReleaseReadiness || runtime.codex_release_readiness;
    assert(readiness && readiness.schema === "codex-release-readiness.v1", "runtime must expose codex release readiness");
    assert(Array.isArray(readiness.groups) && readiness.groups.length >= 6, "readiness must include release change groups");

    startMcpServer();
    await send("initialize", {
      protocolVersion: "2024-11-05",
      clientInfo: { name: "harnesui-codex-release-readiness-browser-test", version: "0.1.0" },
      capabilities: {},
    });
    notify("notifications/initialized");

    const statusResponse = await send("tools/call", { name: "playwright_status", arguments: {} });
    const status = parseToolJson(statusResponse).payload;
    assert.strictEqual(status.playwrightAvailable, true, `playwright should be available: ${status.playwrightError || "unknown error"}`);

    let matrix = await runViewportMatrix();
    if (matrix.isError && shouldRetryWithChannel(matrix.payload)) {
      for (const channel of fallbackChannels()) {
        matrix = await runViewportMatrix(channel);
        if (!matrix.isError) break;
      }
    }
    assert.strictEqual(matrix.isError, false, JSON.stringify(matrix.payload, null, 2));
    assert.strictEqual(matrix.payload.ok, true, "viewport matrix should succeed");
    matrix.payload.results.forEach(assertViewportResult);

    const screenshots = matrix.payload.results
      .map((result) => result.screenshot && result.screenshot.relativePath)
      .filter(Boolean);
    assert(screenshots.length >= viewports.length, "viewport matrix should save screenshots");
    await send("tools/call", { name: "playwright_close_session", arguments: { all: true } }).catch(() => {});
    process.stdout.write(`PASS harnesui_codex_release_readiness_browser_test screenshots=${screenshots.join(",")}\n`);
  } catch (error) {
    error.message = `${error.message}\nserver stderr:\n${serverStderr}\nplaywright stderr:\n${stderrBuffer}`;
    throw error;
  } finally {
    if (mcp) await stopChild(mcp);
    await stopChild(server);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
