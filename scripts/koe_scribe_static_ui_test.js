"use strict";

const assert = require("assert");
const childProcess = require("child_process");
const fs = require("fs");
const http = require("http");
const path = require("path");

const repoRoot = path.resolve(__dirname, "..");
const appRoot = path.join(repoRoot, "APP", "05.koe-scribe");
const artifactDir = path.join(repoRoot, "output", "playwright");
const screenshotPath = path.join(artifactDir, "koe-scribe-ui.png");
const userDataDir = path.join(artifactDir, `.koe-scribe-edge-profile-${process.pid}`);

function contentType(filePath) {
  if (filePath.endsWith(".html")) return "text/html; charset=utf-8";
  if (filePath.endsWith(".css")) return "text/css; charset=utf-8";
  if (filePath.endsWith(".js")) return "text/javascript; charset=utf-8";
  return "application/octet-stream";
}

function startStaticServer() {
  return new Promise((resolve, reject) => {
    const server = http.createServer((request, response) => {
      const url = new URL(request.url, "http://127.0.0.1");
      const requestedPath = url.pathname === "/" ? "/index.html" : url.pathname;
      const target = path.resolve(appRoot, `.${requestedPath}`);
      if (!target.startsWith(appRoot)) {
        response.writeHead(403);
        response.end("forbidden");
        return;
      }
      fs.readFile(target, (error, data) => {
        if (error) {
          response.writeHead(404);
          response.end("not found");
          return;
        }
        response.writeHead(200, { "content-type": contentType(target) });
        response.end(data);
      });
    });
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      resolve({
        server,
        url: `http://127.0.0.1:${server.address().port}/`,
      });
    });
  });
}

function reservePort() {
  return new Promise((resolve, reject) => {
    const server = http.createServer();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const port = server.address().port;
      server.close(() => resolve(port));
    });
  });
}

function findEdgeExecutable() {
  const candidates = [
    process.env.EDGE_PATH,
    "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  ].filter(Boolean);
  return candidates.find((candidate) => fs.existsSync(candidate)) || "";
}

function removeDirectoryBestEffort(target) {
  try {
    fs.rmSync(target, { recursive: true, force: true });
  } catch {
    setTimeout(() => {
      try {
        fs.rmSync(target, { recursive: true, force: true });
      } catch {
      }
    }, 500);
  }
}

function getJson(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (response) => {
      let body = "";
      response.setEncoding("utf8");
      response.on("data", (chunk) => {
        body += chunk;
      });
      response.on("end", () => {
        if (response.statusCode < 200 || response.statusCode >= 300) {
          reject(new Error(`HTTP ${response.statusCode} ${url}`));
          return;
        }
        try {
          resolve(JSON.parse(body));
        } catch (error) {
          reject(error);
        }
      });
    }).on("error", reject);
  });
}

async function waitForJson(url, timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs;
  let lastError = null;
  while (Date.now() < deadline) {
    try {
      return await getJson(url);
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
  }
  throw lastError || new Error(`Timed out waiting for ${url}`);
}

class CdpClient {
  constructor(wsUrl) {
    this.wsUrl = wsUrl;
    this.ws = null;
    this.nextId = 1;
    this.pending = new Map();
    this.waiters = [];
  }

  connect() {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(this.wsUrl);
      this.ws.addEventListener("open", () => resolve(this));
      this.ws.addEventListener("error", () => reject(new Error(`WebSocket error: ${this.wsUrl}`)));
      this.ws.addEventListener("message", (event) => this.handleMessage(event.data));
    });
  }

  handleMessage(raw) {
    const message = JSON.parse(String(raw));
    if (message.id && this.pending.has(message.id)) {
      const pending = this.pending.get(message.id);
      this.pending.delete(message.id);
      if (message.error) pending.reject(new Error(JSON.stringify(message.error)));
      else pending.resolve(message.result || {});
      return;
    }
    if (message.method) {
      const matched = [];
      this.waiters = this.waiters.filter((waiter) => {
        if (waiter.method === message.method) {
          matched.push(waiter);
          return false;
        }
        return true;
      });
      matched.forEach((waiter) => waiter.resolve(message.params || {}));
    }
  }

  send(method, params = {}) {
    const id = this.nextId++;
    this.ws.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`CDP timeout: ${method}`));
      }, 15000);
      this.pending.set(id, {
        resolve: (result) => {
          clearTimeout(timer);
          resolve(result);
        },
        reject: (error) => {
          clearTimeout(timer);
          reject(error);
        },
      });
    });
  }

  waitForEvent(method, timeoutMs = 15000) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.waiters = this.waiters.filter((waiter) => waiter.resolve !== resolve);
        reject(new Error(`CDP event timeout: ${method}`));
      }, timeoutMs);
      this.waiters.push({
        method,
        resolve: (params) => {
          clearTimeout(timer);
          resolve(params);
        },
      });
    });
  }

  close() {
    if (this.ws) this.ws.close();
  }
}

async function evaluate(page, expression) {
  const result = await page.send("Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true,
  });
  if (result.exceptionDetails) {
    throw new Error(JSON.stringify(result.exceptionDetails));
  }
  return result.result ? result.result.value : undefined;
}

async function waitForFunction(page, expression, timeoutMs = 8000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await evaluate(page, expression)) return;
    await new Promise((resolve) => setTimeout(resolve, 120));
  }
  throw new Error(`Timed out waiting for function: ${expression}`);
}

async function launchEdge(port) {
  const executable = findEdgeExecutable();
  if (!executable) {
    console.log("koe-scribe static ui test skipped: Microsoft Edge executable not found");
    return null;
  }
  removeDirectoryBestEffort(userDataDir);
  fs.mkdirSync(userDataDir, { recursive: true });
  let edge = null;
  try {
    edge = childProcess.spawn(executable, [
      "--headless",
      `--remote-debugging-port=${port}`,
      "--remote-allow-origins=*",
      `--user-data-dir=${userDataDir}`,
      "--no-first-run",
      "--disable-gpu",
      "--disable-background-networking",
      "--disable-sync",
      "about:blank",
    ], {
      stdio: ["ignore", "ignore", "pipe"],
      windowsHide: true,
    });
  } catch (error) {
    const message = String(error && error.message ? error.message : error || "");
    if (/spawn EPERM|spawn EACCES|operation not permitted/i.test(message)) {
      console.log(`koe-scribe static ui test environment-blocked: ${message}`);
      return null;
    }
    throw error;
  }
  edge.stderr.setEncoding("utf8");
  let stderr = "";
  edge.stderr.on("data", (chunk) => {
    stderr += chunk;
  });
  edge.getCapturedStderr = () => stderr.trim();
  return edge;
}

async function openPage(devtoolsPort, url) {
  const version = await waitForJson(`http://127.0.0.1:${devtoolsPort}/json/version`);
  const browser = await new CdpClient(version.webSocketDebuggerUrl).connect();
  const target = await browser.send("Target.createTarget", { url: "about:blank" });
  const targets = await waitForJson(`http://127.0.0.1:${devtoolsPort}/json/list`);
  const pageInfo = targets.find((entry) => entry.id === target.targetId) || targets.find((entry) => entry.type === "page");
  assert(pageInfo && pageInfo.webSocketDebuggerUrl, "DevTools page target should be available");
  const page = await new CdpClient(pageInfo.webSocketDebuggerUrl).connect();
  await page.send("Page.enable");
  await page.send("Runtime.enable");
  await page.send("Emulation.setDeviceMetricsOverride", {
    width: 1440,
    height: 980,
    deviceScaleFactor: 1,
    mobile: false,
  });
  const loaded = page.waitForEvent("Page.loadEventFired").catch(() => null);
  await page.send("Page.navigate", { url });
  await loaded;
  return { browser, page };
}

async function captureFullPage(page, targetPath) {
  const metrics = await page.send("Page.getLayoutMetrics");
  const width = Math.ceil(metrics.contentSize.width || 1440);
  const height = Math.ceil(metrics.contentSize.height || 980);
  await page.send("Emulation.setDeviceMetricsOverride", {
    width,
    height,
    deviceScaleFactor: 1,
    mobile: false,
  });
  const screenshot = await page.send("Page.captureScreenshot", {
    format: "png",
    fromSurface: true,
    captureBeyondViewport: true,
  });
  fs.writeFileSync(targetPath, Buffer.from(screenshot.data, "base64"));
}

async function main() {
  fs.mkdirSync(artifactDir, { recursive: true });
  const { server, url } = await startStaticServer();
  const devtoolsPort = await reservePort();
  const edge = await launchEdge(devtoolsPort);
  if (!edge) {
    server.close();
    return;
  }
  let browser = null;
  let page = null;
  try {
    edge.on("exit", (code, signal) => {
      if (code !== null || signal) {
        const details = typeof edge.getCapturedStderr === "function" ? edge.getCapturedStderr() : "";
        if (details) console.error(`edge exited early: code=${code} signal=${signal}\n${details}`);
      }
    });
    const opened = await openPage(devtoolsPort, url);
    browser = opened.browser;
    page = opened.page;
    await waitForFunction(page, "Boolean(document.querySelector('#runBtn')) && Boolean(document.querySelector('#copyBtn'))");

    await evaluate(page, "document.querySelector('#videoPath').value='C:\\\\Users\\\\akima\\\\Videos\\\\sample.mp4'; document.querySelector('#videoPath').dispatchEvent(new Event('input', { bubbles: true })); true;");

    const title = await evaluate(page, "document.querySelector('h1').textContent");
    const runText = await evaluate(page, "document.querySelector('#runBtn').textContent");
    const outputTitle = await evaluate(page, "document.querySelector('#outputTitle').textContent");
    const copyText = await evaluate(page, "document.querySelector('#copyBtn').textContent");
    const hasPlanButton = await evaluate(page, "Boolean(document.querySelector('#planBtn'))");
    const hasPromptPanel = await evaluate(page, "Boolean(document.querySelector('#promptPanel'))");
    const copyDisabled = await evaluate(page, "document.querySelector('#copyBtn').disabled");
    const overflow = await evaluate(page, "document.documentElement.scrollWidth > document.documentElement.clientWidth + 1");

    assert.strictEqual(title, "KoeScribe");
    assert.strictEqual(runText, "文字起こし開始");
    assert.strictEqual(outputTitle, "文字起こし結果");
    assert.strictEqual(copyText, "全文コピー");
    assert.strictEqual(hasPlanButton, false, "plan button should not be visible");
    assert.strictEqual(hasPromptPanel, false, "prompt panel should not be visible");
    assert.strictEqual(copyDisabled, true, "copy should stay disabled until a result exists");
    assert.strictEqual(overflow, false, "layout should not horizontally overflow desktop viewport");

    await captureFullPage(page, screenshotPath);
    console.log(`koe-scribe static ui test passed: ${path.relative(repoRoot, screenshotPath)}`);
  } finally {
    if (page) page.close();
    if (browser) browser.close();
    if (edge && !edge.killed) edge.kill();
    server.close();
    removeDirectoryBestEffort(userDataDir);
  }
}

main().catch((error) => {
  console.error(error.stack || error.message || error);
  process.exitCode = 1;
});
