"use strict";

const assert = require("assert");
const http = require("http");
const path = require("path");
const { spawnNodeScript } = require("../../../scripts/lib/process_invocation");

const repoRoot = path.resolve(__dirname, "..", "..", "..");
const serverPath = path.join(repoRoot, "tools", "playwright-mcp-server", "src", "server.js");
const artifactRoot = path.join(repoRoot, "output", "playwright", "mcp-browser-smoke");

let mcp = null;
let webServer = null;
let nextId = 1;
let stdoutBuffer = "";
let stderrBuffer = "";
const pending = new Map();

function startWebServer() {
  return new Promise((resolve, reject) => {
    const server = http.createServer((request, response) => {
      response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      response.end(`<!doctype html>
<html>
  <head><title>Playwright MCP smoke</title></head>
  <body>
    <main>
      <h1>Playwright MCP smoke</h1>
      <button id="smoke-button" onclick="document.getElementById('result').textContent='Clicked'">Click me</button>
      <input id="smoke-input" aria-label="Smoke input" />
      <p id="result">Ready</p>
    </main>
  </body>
</html>`);
    });
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      resolve({
        server,
        url: `http://127.0.0.1:${server.address().port}/`
      });
    });
  });
}

function startMcpServer() {
  try {
    mcp = spawnNodeScript(serverPath, {
      args: ["--artifact-root", artifactRoot],
      cwd: repoRoot,
      stdio: ["pipe", "pipe", "pipe"]
    });
  } catch (error) {
    if (isEnvironmentRestrictionError(error)) {
      console.log(`playwright mcp browser smoke environment-blocked: ${error.message}`);
      return false;
    }
    throw error;
  }
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
    for (const waiter of pending.values()) {
      waiter.reject(error);
    }
    pending.clear();
  });
  return true;
}

function isEnvironmentRestrictionError(error) {
  const message = String(error && error.message ? error.message : error || "").toLowerCase();
  return message.includes("spawn eperm") || message.includes("spawn eacces") || message.includes("operation not permitted");
}

function send(method, params = {}) {
  const id = nextId++;
  mcp.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id, method, params })}\n`);
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error(`Timed out waiting for ${method}\n${stderrBuffer}`));
    }, 30000);
    pending.set(id, {
      resolve: (message) => {
        clearTimeout(timer);
        if (message.error) {
          reject(new Error(`${method} failed: ${JSON.stringify(message.error)}`));
        } else {
          resolve(message);
        }
      },
      reject: (error) => {
        clearTimeout(timer);
        reject(error);
      }
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
    isError: response.result.isError === true
  };
}

function shouldSkipBrowserToolError(payload) {
  const message = `${payload.message || ""} ${payload.details ? JSON.stringify(payload.details) : ""}`;
  return /PLAYWRIGHT_UNAVAILABLE|Executable doesn't exist|browserType\.launch|install chromium|Host system is missing/i.test(message);
}

async function callNavigate(url, channel) {
  const args = {
    url,
    session_id: "browser-smoke",
    viewport: { width: 800, height: 600 },
    screenshot: true,
    max_elements: 40
  };
  if (channel) {
    args.channel = channel;
  }
  const response = await send("tools/call", {
    name: "playwright_navigate",
    arguments: args
  });
  return parseToolJson(response);
}

function fallbackChannels() {
  return process.platform === "win32" ? ["msedge", "chrome"] : ["chrome"];
}

async function main() {
  const started = await startWebServer();
  webServer = started.server;
  if (!startMcpServer()) {
    return;
  }

  await send("initialize", {
    protocolVersion: "2024-11-05",
    clientInfo: { name: "playwright-mcp-browser-smoke", version: "0.1.0" },
    capabilities: {}
  });
  notify("notifications/initialized");

  const statusResponse = await send("tools/call", { name: "playwright_status", arguments: {} });
  const status = parseToolJson(statusResponse).payload;
  if (!status.playwrightAvailable) {
    console.log(`playwright mcp browser smoke skipped: ${status.playwrightError}`);
    return;
  }

  let navigate = await callNavigate(started.url);
  if (navigate.isError && shouldSkipBrowserToolError(navigate.payload)) {
    for (const channel of fallbackChannels()) {
      navigate = await callNavigate(started.url, channel);
      if (!navigate.isError) {
        break;
      }
    }
  }
  if (navigate.isError && shouldSkipBrowserToolError(navigate.payload)) {
    console.log(`playwright mcp browser smoke skipped: ${navigate.payload.message}`);
    return;
  }
  assert.strictEqual(navigate.isError, false, JSON.stringify(navigate.payload, null, 2));
  assert.strictEqual(navigate.payload.ok, true);
  assert(navigate.payload.snapshot.elements.some((element) => element.selector === "#smoke-button"));
  assert(navigate.payload.screenshot.relativePath.includes("output/playwright"));

  const clickRef = navigate.payload.snapshot.elements.find((element) => element.selector === "#smoke-button").ref;
  const clickResponse = await send("tools/call", {
    name: "playwright_click",
    arguments: { session_id: "browser-smoke", ref: clickRef, max_elements: 40 }
  });
  const click = parseToolJson(clickResponse);
  assert.strictEqual(click.isError, false, JSON.stringify(click.payload, null, 2));
  assert(click.payload.snapshot.bodyTextSample.includes("Clicked"));

  const fillRef = navigate.payload.snapshot.elements.find((element) => element.selector === "#smoke-input").ref;
  const fillResponse = await send("tools/call", {
    name: "playwright_fill",
    arguments: { session_id: "browser-smoke", ref: fillRef, value: "typed value", max_elements: 40 }
  });
  const fill = parseToolJson(fillResponse);
  assert.strictEqual(fill.isError, false, JSON.stringify(fill.payload, null, 2));

  const diagnosticsResponse = await send("tools/call", {
    name: "playwright_diagnostics",
    arguments: { session_id: "browser-smoke" }
  });
  const diagnostics = parseToolJson(diagnosticsResponse);
  assert.strictEqual(diagnostics.isError, false, JSON.stringify(diagnostics.payload, null, 2));
  assert.strictEqual(diagnostics.payload.ok, true);

  await send("tools/call", {
    name: "playwright_close_session",
    arguments: { session_id: "browser-smoke" }
  });

  console.log("playwright mcp browser smoke test passed");
}

main()
  .catch((error) => {
    console.error(error.stack || error.message || error);
    process.exitCode = 1;
  })
  .finally(() => {
    if (mcp) {
      mcp.stdin.end();
      mcp.kill();
    }
    if (webServer) {
      webServer.close();
    }
  });
