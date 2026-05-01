"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { spawnNodeScript } = require("./lib/process_invocation");

const repoRoot = path.resolve(__dirname, "..");
const serverPath = path.join(repoRoot, "tools", "playwright-mcp-server", "src", "server.js");
const artifactRoot = path.join(repoRoot, "output", "playwright", "harnesui-first-screen-layout-contract");
const targetPort = Number(process.env.CODEX_HARNESUI_TEST_PORT || process.env.CODEX_UI_PORT || 57525);
const targetUrl = `http://127.0.0.1:${targetPort}/01.HarnesUI/index.html`;
const viewportSpecs = [
  { name: "wide-1920x1080", width: 1920, height: 1080, isMobile: false },
  { name: "desktop-1440x980", width: 1440, height: 980, isMobile: false },
  { name: "laptop-1366x768", width: 1366, height: 768, isMobile: false },
  { name: "mobile-390x844", width: 390, height: 844, isMobile: true },
];

let mcp = null;
let nextId = 1;
let stdoutBuffer = "";
let stderrBuffer = "";
const pending = new Map();

function startMcpServer() {
  mcp = spawnNodeScript(serverPath, {
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
  const textBlock = response.result && Array.isArray(response.result.content)
    ? response.result.content.find((block) => block.type === "text")
    : null;
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

function extractElement(snapshot, selector) {
  return snapshot && Array.isArray(snapshot.elements)
    ? snapshot.elements.find((entry) => entry.selector === selector) || null
    : null;
}

function findTextBlock(snapshot, snippet) {
  return snapshot && Array.isArray(snapshot.textBlocks)
    ? snapshot.textBlocks.find((entry) => typeof entry.text === "string" && entry.text.includes(snippet)) || null
    : null;
}

function assertVisibleWithinViewport(box, viewport, label) {
  assert(box, `${label} should exist in the viewport snapshot`);
  assert(box.y >= 0, `${label} should start within the viewport`);
  assert(box.y + box.height <= viewport.height, `${label} should fully fit within the first viewport`);
}

function assertCompactButton(box, label) {
  assert(box.height >= 40, `${label} should remain tappable/clickable`);
  assert(box.height <= 80, `${label} should stay compact instead of stretching vertically`);
}

function assertNoHiddenDetailControls(snapshot, viewportName) {
  const selectors = new Set((snapshot.elements || []).map((entry) => entry.selector));
  assert(!selectors.has("#agentTopographyRefreshBtn"), `${viewportName} should keep deep trace controls collapsed by default`);
  assert(!selectors.has("#harnessCheckMode"), `${viewportName} should keep deep harness controls collapsed by default`);
}

function assertReadableFirstScreenCopy(snapshot, viewportName) {
  const bodyTextSample = snapshot && typeof snapshot.bodyTextSample === "string" ? snapshot.bodyTextSample : "";
  for (const required of ["Codex Harness OS", "Mission", "Conversation", "Workspace", "/goal"]) {
    assert(bodyTextSample.includes(required), `${viewportName} should expose ${required} in visible copy`);
  }
  assert(!/[\uFFFD]/.test(bodyTextSample), `${viewportName} should avoid replacement-character mojibake`);
  assert(!/(?:邵ｺ|郢ｧ|郢掟)/.test(bodyTextSample), `${viewportName} should avoid common mojibake fragments`);
  assert(snapshot && snapshot.metrics && snapshot.metrics.visibleTextLength >= 420, `${viewportName} should expose enough readable copy`);
}

function assertMissionFirstLayout(result, promptBox, sendBox, stopBox) {
  const viewport = result.viewport;
  const conversationHeading = findTextBlock(result.snapshot, "Conversation");
  const missionHeading = findTextBlock(result.snapshot, "Mission");
  assert(missionHeading, `${viewport.name} should expose the mission heading`);
  assert(conversationHeading, `${viewport.name} should expose the conversation heading`);
  assert(promptBox.y > missionHeading.box.y, `${viewport.name} prompt should sit inside the mission area`);
  assert(promptBox.y < conversationHeading.box.y, `${viewport.name} mission input should come before conversation history`);
  assert(sendBox.y > promptBox.y, `${viewport.name} send action should follow the prompt`);
  if (viewport.isMobile) {
    assert(stopBox, `${viewport.name} stop button should exist`);
    assert(Math.abs(stopBox.y - sendBox.y) <= 2, `${viewport.name} stop and send should share one compact row`);
    assert(promptBox.width >= 300, `${viewport.name} prompt should remain wide enough for Japanese copy`);
  } else {
    const minimumPromptWidth = viewport.width < 1400 ? 560 : 620;
    assert(promptBox.width >= minimumPromptWidth, `${viewport.name} should give the composer enough width on desktop`);
    assert(sendBox.x > promptBox.x, `${viewport.name} send action should stay in the right action rail`);
  }
}

async function runViewportMatrix(channel) {
  const response = await send("tools/call", {
    name: "playwright_viewport_matrix",
    arguments: {
      url: targetUrl,
      viewports: viewportSpecs,
      wait_until: "networkidle",
      screenshot: true,
      snapshot: true,
      max_elements: 220,
      channel,
    },
  });
  return parseToolJson(response);
}

async function main() {
  fs.mkdirSync(artifactRoot, { recursive: true });
  startMcpServer();
  await send("initialize", {
    protocolVersion: "2024-11-05",
    clientInfo: { name: "harnesui-first-screen-layout-contract-test", version: "0.2.0" },
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

  const summary = [];
  for (const result of matrix.payload.results) {
    const prompt = extractElement(result.snapshot, "#promptInput");
    const sendBtn = extractElement(result.snapshot, "#sendBtn");
    const stopBtn = extractElement(result.snapshot, "#stopBtn");
    const goalBtn = (result.snapshot.elements || []).find((entry) => entry.text === "/goal") || null;
    const metrics = result.snapshot.metrics || {};
    const diag = result.diagnostics || {};

    assertVisibleWithinViewport(prompt && prompt.box, result.viewport, `${result.viewport.name} prompt input`);
    assertVisibleWithinViewport(sendBtn && sendBtn.box, result.viewport, `${result.viewport.name} send button`);
    assertCompactButton(sendBtn.box, `${result.viewport.name} send button`);
    assert(goalBtn, `${result.viewport.name} should keep the /goal affordance visible`);
    assert.strictEqual(diag.console, 0, `${result.viewport.name} should keep browser console diagnostics at zero`);
    assert.strictEqual(diag.pageErrors, 0, `${result.viewport.name} should keep page errors at zero`);
    assert.strictEqual(diag.failedRequests, 0, `${result.viewport.name} should keep failed requests at zero`);
    assert.strictEqual(diag.httpErrors, 0, `${result.viewport.name} should keep http errors at zero`);
    assert.strictEqual(metrics.horizontalOverflow, false, `${result.viewport.name} should avoid horizontal overflow`);
    assert.deepStrictEqual(metrics.overflowElements, [], `${result.viewport.name} should keep overflow elements empty`);
    assert.deepStrictEqual(metrics.overlapCandidates, [], `${result.viewport.name} should avoid overlapping interactive controls`);
    assertNoHiddenDetailControls(result.snapshot, result.viewport.name);
    assertReadableFirstScreenCopy(result.snapshot, result.viewport.name);
    assertMissionFirstLayout(result, prompt.box, sendBtn.box, stopBtn && stopBtn.box);

    summary.push({
      viewport: result.viewport,
      promptInput: prompt ? prompt.box : null,
      sendBtn: sendBtn ? sendBtn.box : null,
      stopBtn: stopBtn ? stopBtn.box : null,
      diagnostics: diag,
      metrics: {
        scrollHeight: metrics.scrollHeight,
        scrollWidth: metrics.scrollWidth,
        horizontalOverflow: metrics.horizontalOverflow,
        visibleTextLength: metrics.visibleTextLength,
      },
      screenshot: result.screenshot ? result.screenshot.relativePath : null,
    });
  }

  const summaryPath = path.join(artifactRoot, "summary.json");
  fs.writeFileSync(summaryPath, `${JSON.stringify(summary, null, 2)}\n`, "utf8");
  console.log("[harnesui-first-screen-layout-contract-test] PASS");
  console.log(summaryPath);
  console.log("PASS");
}

main()
  .catch((error) => {
    console.log(`[harnesui-first-screen-layout-contract-test] FAIL ${error instanceof Error ? error.message : String(error)}`);
    console.log("FAIL");
    process.exitCode = 1;
  })
  .finally(async () => {
    try {
      if (mcp) {
        await send("tools/call", { name: "playwright_close_session", arguments: { all: true } }).catch(() => {});
        mcp.kill();
      }
    } catch (_) {}
  });
