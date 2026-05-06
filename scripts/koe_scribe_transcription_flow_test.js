"use strict";

const assert = require("assert");
const childProcess = require("child_process");
const fs = require("fs");
const http = require("http");
const path = require("path");
const { once } = require("events");

const { startServer } = require("../APP/05.koe-scribe/standalone_server");

const repoRoot = path.resolve(__dirname, "..");
const artifactDir = path.join(repoRoot, "output", "playwright");
const fixturePath = path.join(artifactDir, "koe-scribe-flow-fixture.wav");
const screenshotPath = path.join(artifactDir, "koe-scribe-transcription-flow.png");
const userDataDir = path.join(artifactDir, `.koe-scribe-flow-edge-profile-${process.pid}`);

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

function writeSilentWav(filePath, seconds = 0.25, sampleRate = 16000) {
  const sampleCount = Math.max(1, Math.floor(seconds * sampleRate));
  const bytesPerSample = 2;
  const buffer = Buffer.alloc(44 + sampleCount * bytesPerSample);
  buffer.write("RIFF", 0, "ascii");
  buffer.writeUInt32LE(36 + sampleCount * bytesPerSample, 4);
  buffer.write("WAVE", 8, "ascii");
  buffer.write("fmt ", 12, "ascii");
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * bytesPerSample, 28);
  buffer.writeUInt16LE(bytesPerSample, 32);
  buffer.writeUInt16LE(8 * bytesPerSample, 34);
  buffer.write("data", 36, "ascii");
  buffer.writeUInt32LE(sampleCount * bytesPerSample, 40);
  fs.writeFileSync(filePath, buffer);
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

async function waitForFunction(page, expression, timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await evaluate(page, expression)) return;
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new Error(`Timed out waiting for function: ${expression}`);
}

async function launchEdge(port) {
  const executable = findEdgeExecutable();
  if (!executable) {
    console.log("koe-scribe transcription flow test skipped: Microsoft Edge executable not found");
    return null;
  }
  removeDirectoryBestEffort(userDataDir);
  fs.mkdirSync(userDataDir, { recursive: true });
  try {
    return childProcess.spawn(executable, [
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
      console.log(`koe-scribe transcription flow test environment-blocked: ${message}`);
      return null;
    }
    throw error;
  }
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
  await page.send("DOM.enable");
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

async function setFileInput(page, selector, filePath) {
  const document = await page.send("DOM.getDocument", { depth: 1 });
  const queried = await page.send("DOM.querySelector", {
    nodeId: document.root.nodeId,
    selector,
  });
  assert(queried.nodeId, `selector not found: ${selector}`);
  await page.send("DOM.setFileInputFiles", {
    nodeId: queried.nodeId,
    files: [filePath],
  });
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
  writeSilentWav(fixturePath);

  const server = startServer({
    hostOverride: "127.0.0.1",
    portOverride: 0,
    quiet: true,
    transcriptionClient: async ({ mediaPath, mediaType }) => {
      assert.strictEqual(path.extname(mediaPath).toLowerCase(), ".wav");
      assert(String(mediaType).toLowerCase().includes("wav"));
      return {
        text: "これはKoeScribeの全文文字起こし結果です。右側に表示されます。",
        segments: [
          { start: 0, end: 2, text: "これはKoeScribeの全文文字起こし結果です。" },
          { start: 2, end: 4, text: "右側に表示されます。" },
        ],
        model: "flow-test-transcriber",
      };
    },
  });
  await once(server, "listening");

  const devtoolsPort = await reservePort();
  const edge = await launchEdge(devtoolsPort);
  if (!edge) {
    await new Promise((resolve) => server.close(resolve));
    return;
  }
  let browser = null;
  let page = null;
  try {
    const port = server.address().port;
    const opened = await openPage(devtoolsPort, `http://127.0.0.1:${port}/`);
    browser = opened.browser;
    page = opened.page;
    await waitForFunction(page, "Boolean(document.querySelector('#runBtn')) && !document.querySelector('#runBtn').disabled");
    await setFileInput(page, "#videoFile", fixturePath);
    await evaluate(page, "document.querySelector('#runBtn').click(); true;");
    await waitForFunction(
      page,
      "document.querySelector('#transcriptOutput') && document.querySelector('#transcriptOutput').textContent.includes('これはKoeScribeの全文文字起こし結果です')",
      30000
    );
    const transcriptText = await evaluate(page, "document.querySelector('#transcriptOutput').textContent");
    const copyDisabled = await evaluate(page, "document.querySelector('#copyBtn').disabled");
    assert(transcriptText.includes("右側に表示されます。"));
    assert.strictEqual(copyDisabled, false, "copy button should be enabled after transcription result");
    await captureFullPage(page, screenshotPath);
    console.log(`koe-scribe transcription flow test passed: ${path.relative(repoRoot, screenshotPath)}`);
  } finally {
    if (page) page.close();
    if (browser) browser.close();
    if (edge && !edge.killed) edge.kill();
    await new Promise((resolve) => server.close(resolve));
    removeDirectoryBestEffort(userDataDir);
  }
}

main().catch((error) => {
  console.error(error.stack || error.message || error);
  process.exitCode = 1;
});
