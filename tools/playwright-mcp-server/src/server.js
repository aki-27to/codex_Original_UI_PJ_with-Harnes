#!/usr/bin/env node
"use strict";

const crypto = require("crypto");
const fs = require("fs");
const http = require("http");
const https = require("https");
const path = require("path");
const { spawn } = require("child_process");

const SERVER_NAME = "playwright-mcp-server";
const SERVER_VERSION = "0.1.0";
const ROOT_DIR = path.resolve(__dirname, "..", "..", "..");
const DEFAULT_ARTIFACT_ROOT = path.join(ROOT_DIR, "output", "playwright", "mcp");
const DEFAULT_PROTOCOL_VERSION = "2024-11-05";

const options = parseArgs(process.argv.slice(2));
const ARTIFACT_ROOT = path.resolve(ROOT_DIR, options.artifactRoot || DEFAULT_ARTIFACT_ROOT);
fs.mkdirSync(ARTIFACT_ROOT, { recursive: true });

const sessions = new Map();
let sessionCounter = 1;
let playwrightLoad = null;

const TOOL_DEFINITIONS = [
  {
    name: "playwright_status",
    description: "Report Playwright MCP server health, artifact location, browser availability, and active sessions.",
    inputSchema: objectSchema({})
  },
  {
    name: "playwright_navigate",
    description: "Open a browser session, navigate to a URL, then return a DOM snapshot, diagnostics, and optional screenshot metadata.",
    inputSchema: objectSchema({
      url: { type: "string", description: "HTTP or HTTPS URL to open." },
      session_id: { type: "string", description: "Optional stable session id to create or reuse." },
      browser: { type: "string", enum: ["chromium", "firefox", "webkit"], default: "chromium" },
      channel: chromiumChannelSchema(),
      headless: { type: "boolean", default: true },
      viewport: viewportSchema(),
      wait_until: waitUntilSchema(),
      timeout_ms: { type: "number", default: 30000 },
      snapshot: { type: "boolean", default: true },
      screenshot: { type: "boolean", default: false },
      max_elements: { type: "number", default: 120 }
    }, ["url"])
  },
  {
    name: "playwright_observe",
    description: "Return the current page URL, title, DOM snapshot, diagnostics, and optional screenshot metadata for a session.",
    inputSchema: objectSchema({
      session_id: { type: "string" },
      screenshot: { type: "boolean", default: false },
      full_page: { type: "boolean", default: true },
      max_elements: { type: "number", default: 120 }
    }, ["session_id"])
  },
  {
    name: "playwright_click",
    description: "Click a target by DOM snapshot ref, CSS selector, role/name, or visible text.",
    inputSchema: objectSchema({
      session_id: { type: "string" },
      ref: { type: "string", description: "Element ref returned by a prior snapshot, such as e0." },
      selector: { type: "string" },
      text: { type: "string" },
      role: { type: "string" },
      name: { type: "string" },
      exact: { type: "boolean", default: false },
      button: { type: "string", enum: ["left", "right", "middle"], default: "left" },
      click_count: { type: "number", default: 1 },
      force: { type: "boolean", default: false },
      wait_until: waitUntilSchema(),
      timeout_ms: { type: "number", default: 15000 },
      snapshot: { type: "boolean", default: true }
    }, ["session_id"])
  },
  {
    name: "playwright_fill",
    description: "Fill an input target by DOM snapshot ref, CSS selector, role/name, or visible text.",
    inputSchema: objectSchema({
      session_id: { type: "string" },
      ref: { type: "string" },
      selector: { type: "string" },
      text: { type: "string" },
      role: { type: "string" },
      name: { type: "string" },
      exact: { type: "boolean", default: false },
      value: { type: "string" },
      wait_until: waitUntilSchema(),
      timeout_ms: { type: "number", default: 15000 },
      snapshot: { type: "boolean", default: true }
    }, ["session_id", "value"])
  },
  {
    name: "playwright_screenshot",
    description: "Capture a screenshot artifact for a browser session and optionally return image bytes in the MCP response.",
    inputSchema: objectSchema({
      session_id: { type: "string" },
      name: { type: "string", default: "screenshot" },
      full_page: { type: "boolean", default: true },
      emit_image: { type: "boolean", default: false }
    }, ["session_id"])
  },
  {
    name: "playwright_diagnostics",
    description: "Return console messages, page errors, failed requests, and HTTP error responses collected for a session.",
    inputSchema: objectSchema({
      session_id: { type: "string" },
      clear: { type: "boolean", default: false }
    }, ["session_id"])
  },
  {
    name: "playwright_viewport_matrix",
    description: "Visit a URL across mobile, tablet, and desktop viewports, saving screenshot artifacts and layout metrics.",
    inputSchema: objectSchema({
      url: { type: "string" },
      browser: { type: "string", enum: ["chromium", "firefox", "webkit"], default: "chromium" },
      channel: chromiumChannelSchema(),
      headless: { type: "boolean", default: true },
      viewports: {
        type: "array",
        items: {
          type: "object",
          properties: {
            name: { type: "string" },
            width: { type: "number" },
            height: { type: "number" },
            isMobile: { type: "boolean" }
          },
          required: ["name", "width", "height"],
          additionalProperties: false
        }
      },
      wait_until: waitUntilSchema(),
      timeout_ms: { type: "number", default: 30000 },
      screenshot: { type: "boolean", default: true },
      snapshot: { type: "boolean", default: true },
      keep_sessions: { type: "boolean", default: false },
      max_elements: { type: "number", default: 80 }
    }, ["url"])
  },
  {
    name: "playwright_visual_checkpoint",
    description: "Save a named screenshot and metadata file with hash, page URL, title, viewport, and diagnostic counts.",
    inputSchema: objectSchema({
      session_id: { type: "string" },
      name: { type: "string" },
      full_page: { type: "boolean", default: true },
      max_elements: { type: "number", default: 80 }
    }, ["session_id", "name"])
  },
  {
    name: "playwright_local_smoke",
    description: "Optionally start a local dev server, wait for a URL, run browser actions, then return screenshot, snapshot, and diagnostics evidence.",
    inputSchema: objectSchema({
      url: { type: "string" },
      start_command: { type: "string", description: "Executable to spawn without shell, for example npm or node." },
      start_args: { type: "array", items: { type: "string" }, default: [] },
      cwd: { type: "string", default: "." },
      browser: { type: "string", enum: ["chromium", "firefox", "webkit"], default: "chromium" },
      channel: chromiumChannelSchema(),
      headless: { type: "boolean", default: true },
      viewport: viewportSchema(),
      wait_until: waitUntilSchema(),
      wait_timeout_ms: { type: "number", default: 60000 },
      actions: {
        type: "array",
        items: {
          type: "object",
          properties: {
            type: { type: "string", enum: ["click", "fill", "wait"] },
            ref: { type: "string" },
            selector: { type: "string" },
            text: { type: "string" },
            role: { type: "string" },
            name: { type: "string" },
            exact: { type: "boolean" },
            value: { type: "string" },
            timeout_ms: { type: "number" }
          },
          required: ["type"],
          additionalProperties: false
        }
      },
      screenshot: { type: "boolean", default: true },
      snapshot: { type: "boolean", default: true },
      keep_server: { type: "boolean", default: false },
      max_elements: { type: "number", default: 100 }
    }, ["url"])
  },
  {
    name: "playwright_close_session",
    description: "Close one browser session, or all sessions when all=true.",
    inputSchema: objectSchema({
      session_id: { type: "string" },
      all: { type: "boolean", default: false }
    })
  }
];

function parseArgs(argv) {
  const parsed = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--artifact-root") {
      parsed.artifactRoot = argv[index + 1];
      index += 1;
    } else if (arg.startsWith("--artifact-root=")) {
      parsed.artifactRoot = arg.slice("--artifact-root=".length);
    }
  }
  return parsed;
}

function objectSchema(properties, required = []) {
  return {
    type: "object",
    properties,
    required,
    additionalProperties: false
  };
}

function viewportSchema() {
  return {
    type: "object",
    properties: {
      width: { type: "number", default: 1280 },
      height: { type: "number", default: 800 },
      isMobile: { type: "boolean", default: false }
    },
    additionalProperties: false
  };
}

function waitUntilSchema() {
  return {
    type: "string",
    enum: ["load", "domcontentloaded", "networkidle", "commit"],
    default: "domcontentloaded"
  };
}

function chromiumChannelSchema() {
  return {
    type: "string",
    enum: ["chrome", "chrome-beta", "chrome-dev", "chrome-canary", "msedge", "msedge-beta", "msedge-dev", "msedge-canary"],
    description: "Optional installed Chromium-family browser channel. Useful when Playwright-managed browsers are not installed."
  };
}

function writeJsonRpc(message) {
  process.stdout.write(`${JSON.stringify(message)}\n`);
}

function rpcError(id, code, message, data) {
  writeJsonRpc({
    jsonrpc: "2.0",
    id: id === undefined ? null : id,
    error: { code, message, data }
  });
}

function toolTextResult(payload, isError = false) {
  return {
    content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
    isError
  };
}

function serializeError(error) {
  return {
    ok: false,
    code: error.code || "TOOL_ERROR",
    message: error.message || String(error),
    details: error.details || null
  };
}

function createToolError(code, message, details) {
  const error = new Error(message);
  error.code = code;
  error.details = details || null;
  return error;
}

function loadPlaywright() {
  if (playwrightLoad) {
    return playwrightLoad;
  }

  for (const candidate of playwrightCandidates()) {
    try {
      const mod = require(candidate.spec);
      if (mod && mod.chromium) {
        playwrightLoad = {
          available: true,
          packageName: candidate.packageName,
          source: candidate.source,
          resolvedPath: require.resolve(candidate.spec),
          module: mod,
          error: null
        };
        return playwrightLoad;
      }
    } catch (error) {
      playwrightLoad = {
        available: false,
        packageName: candidate.packageName,
        source: candidate.source,
        resolvedPath: null,
        module: null,
        error: error.message
      };
    }
  }

  playwrightLoad = {
    available: false,
    packageName: null,
    module: null,
    error: playwrightLoad && playwrightLoad.error ? playwrightLoad.error : "Playwright package is not installed.",
    installHint: "Run npm install in the repository root, or add Playwright to the runtime used by this MCP server."
  };
  return playwrightLoad;
}

function playwrightCandidates() {
  const candidates = [
    { packageName: "playwright", spec: "playwright", source: "node-resolution" },
    { packageName: "@playwright/test", spec: "@playwright/test", source: "node-resolution" }
  ];
  const npxRoot = path.join(ROOT_DIR, "runtime", "npm-cache", "_npx");
  try {
    for (const entry of fs.readdirSync(npxRoot, { withFileTypes: true })) {
      if (!entry.isDirectory()) {
        continue;
      }
      const nodeModules = path.join(npxRoot, entry.name, "node_modules");
      candidates.push({
        packageName: "playwright",
        spec: path.join(nodeModules, "playwright"),
        source: `repo-npx-cache:${entry.name}`
      });
      candidates.push({
        packageName: "@playwright/test",
        spec: path.join(nodeModules, "@playwright", "test"),
        source: `repo-npx-cache:${entry.name}`
      });
    }
  } catch (error) {
    // Missing cache is expected on clean checkouts.
  }
  return candidates;
}

function getPlaywright() {
  const loaded = loadPlaywright();
  if (!loaded.available) {
    throw createToolError("PLAYWRIGHT_UNAVAILABLE", "Playwright is not available in this Node runtime.", {
      error: loaded.error,
      installHint: loaded.installHint || "Install the playwright package."
    });
  }
  return loaded.module;
}

function statusPayload() {
  const loaded = loadPlaywright();
  return {
    ok: true,
    server: {
      name: SERVER_NAME,
      version: SERVER_VERSION,
      rootDir: ROOT_DIR,
      artifactRoot: ARTIFACT_ROOT
    },
    playwrightAvailable: loaded.available,
    playwrightPackage: loaded.packageName,
    playwrightSource: loaded.source || null,
    playwrightResolvedPath: loaded.resolvedPath || null,
    playwrightError: loaded.available ? null : loaded.error,
    installHint: loaded.available ? null : loaded.installHint,
    activeSessions: Array.from(sessions.values()).map((session) => sessionSummary(session)),
    tools: TOOL_DEFINITIONS.map((tool) => tool.name),
    timestamp: new Date().toISOString()
  };
}

function sessionSummary(session) {
  return {
    id: session.id,
    browserName: session.browserName,
    channel: session.channel,
    createdAt: session.createdAt,
    lastActivityAt: session.lastActivityAt,
    url: session.lastUrl,
    artifactDir: session.artifactDir,
    diagnostics: diagnosticCounts(session.diagnostics)
  };
}

function diagnosticCounts(diagnostics) {
  return {
    console: diagnostics.console.length,
    pageErrors: diagnostics.pageErrors.length,
    failedRequests: diagnostics.failedRequests.length,
    httpErrors: diagnostics.httpErrors.length
  };
}

function emptyDiagnostics() {
  return {
    console: [],
    pageErrors: [],
    failedRequests: [],
    httpErrors: []
  };
}

function pushLimited(list, value, max = 200) {
  list.push(value);
  while (list.length > max) {
    list.shift();
  }
}

function nowIso() {
  return new Date().toISOString();
}

function safeName(value, fallback = "artifact") {
  const base = String(value || fallback)
    .replace(/[^a-zA-Z0-9._-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 80);
  return base || fallback;
}

function timestampName() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

function normalizeViewport(viewport) {
  const width = clampInteger(viewport && viewport.width, 1280, 240, 7680);
  const height = clampInteger(viewport && viewport.height, 800, 240, 4320);
  return {
    width,
    height,
    isMobile: Boolean(viewport && viewport.isMobile)
  };
}

function clampInteger(value, fallback, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    return fallback;
  }
  return Math.max(min, Math.min(max, Math.floor(number)));
}

function normalizeWaitUntil(value) {
  const allowed = new Set(["load", "domcontentloaded", "networkidle", "commit"]);
  return allowed.has(value) ? value : "domcontentloaded";
}

function normalizeTimeout(value, fallback) {
  return clampInteger(value, fallback, 100, 300000);
}

function requireHttpUrl(value, fieldName = "url") {
  if (!value || typeof value !== "string") {
    throw createToolError("INVALID_INPUT", `${fieldName} is required.`);
  }
  let parsed;
  try {
    parsed = new URL(value);
  } catch (error) {
    throw createToolError("INVALID_INPUT", `${fieldName} must be a valid URL.`, { value });
  }
  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw createToolError("INVALID_INPUT", `${fieldName} must use http or https.`, { value });
  }
  return parsed.toString();
}

function getSession(id) {
  if (!id || !sessions.has(id)) {
    throw createToolError("SESSION_NOT_FOUND", "Browser session was not found.", {
      sessionId: id,
      activeSessions: Array.from(sessions.keys())
    });
  }
  return sessions.get(id);
}

async function ensureSession(args) {
  if (args.session_id && sessions.has(args.session_id)) {
    const existing = sessions.get(args.session_id);
    existing.lastActivityAt = nowIso();
    return existing;
  }

  const playwright = getPlaywright();
  const browserName = ["chromium", "firefox", "webkit"].includes(args.browser) ? args.browser : "chromium";
  const browserType = playwright[browserName];
  if (!browserType) {
    throw createToolError("BROWSER_NOT_FOUND", `Playwright browser type is missing: ${browserName}`);
  }

  const id = safeName(args.session_id || `pw-${Date.now()}-${sessionCounter++}`, "session");
  const artifactDir = path.join(ARTIFACT_ROOT, id);
  fs.mkdirSync(artifactDir, { recursive: true });

  const launchOptions = { headless: args.headless !== false };
  if (browserName === "chromium" && args.channel) {
    launchOptions.channel = args.channel;
  }
  const browser = await browserType.launch(launchOptions);
  const viewport = normalizeViewport(args.viewport);
  const context = await browser.newContext({
    viewport: { width: viewport.width, height: viewport.height },
    isMobile: viewport.isMobile
  });
  const page = await context.newPage();
  const session = {
    id,
    browser,
    context,
    page,
    browserName,
    channel: launchOptions.channel || null,
    viewport,
    refs: new Map(),
    diagnostics: emptyDiagnostics(),
    artifactDir,
    createdAt: nowIso(),
    lastActivityAt: nowIso(),
    lastUrl: null
  };
  attachDiagnostics(session);
  sessions.set(id, session);
  return session;
}

function attachDiagnostics(session) {
  const page = session.page;
  page.on("console", (message) => {
    pushLimited(session.diagnostics.console, {
      time: nowIso(),
      type: message.type(),
      text: message.text(),
      location: message.location()
    });
  });
  page.on("pageerror", (error) => {
    pushLimited(session.diagnostics.pageErrors, {
      time: nowIso(),
      message: error.message,
      stack: error.stack || null
    });
  });
  page.on("requestfailed", (request) => {
    const failure = request.failure();
    pushLimited(session.diagnostics.failedRequests, {
      time: nowIso(),
      method: request.method(),
      url: request.url(),
      resourceType: request.resourceType(),
      errorText: failure ? failure.errorText : null
    });
  });
  page.on("response", (response) => {
    const status = response.status();
    if (status >= 400) {
      pushLimited(session.diagnostics.httpErrors, {
        time: nowIso(),
        status,
        statusText: response.statusText(),
        url: response.url(),
        requestMethod: response.request().method()
      });
    }
  });
}

async function closeSession(session) {
  sessions.delete(session.id);
  try {
    await session.context.close();
  } catch (error) {
    // Browser close below covers already-closed contexts.
  }
  try {
    await session.browser.close();
  } catch (error) {
    // Closing is best-effort during MCP shutdown.
  }
}

async function closeAllSessions() {
  const openSessions = Array.from(sessions.values());
  await Promise.all(openSessions.map((session) => closeSession(session)));
}

async function toolNavigate(args) {
  const url = requireHttpUrl(args.url);
  const session = await ensureSession(args);
  const timeout = normalizeTimeout(args.timeout_ms, 30000);
  await session.page.goto(url, { waitUntil: normalizeWaitUntil(args.wait_until), timeout });
  session.lastActivityAt = nowIso();
  session.lastUrl = session.page.url();

  const payload = {
    ok: true,
    session: sessionSummary(session),
    page: await pageSummary(session.page),
    diagnostics: diagnosticCounts(session.diagnostics)
  };
  if (args.snapshot !== false) {
    payload.snapshot = await createSnapshot(session, args.max_elements);
  }
  if (args.screenshot === true) {
    payload.screenshot = await saveScreenshot(session, { name: "navigate", full_page: true });
  }
  return payload;
}

async function toolObserve(args) {
  const session = getSession(args.session_id);
  session.lastActivityAt = nowIso();
  const payload = {
    ok: true,
    session: sessionSummary(session),
    page: await pageSummary(session.page),
    snapshot: await createSnapshot(session, args.max_elements),
    diagnostics: {
      counts: diagnosticCounts(session.diagnostics),
      recent: recentDiagnostics(session.diagnostics)
    }
  };
  if (args.screenshot === true) {
    payload.screenshot = await saveScreenshot(session, {
      name: "observe",
      full_page: args.full_page !== false
    });
  }
  return payload;
}

async function toolClick(args) {
  const session = getSession(args.session_id);
  const target = await resolveTarget(session, args);
  await target.locator.click({
    button: args.button || "left",
    clickCount: clampInteger(args.click_count, 1, 1, 5),
    force: args.force === true,
    timeout: normalizeTimeout(args.timeout_ms, 15000)
  });
  await waitForOptionalLoad(session.page, args.wait_until, args.timeout_ms);
  session.lastActivityAt = nowIso();
  session.lastUrl = session.page.url();
  const payload = {
    ok: true,
    session: sessionSummary(session),
    target: target.description,
    page: await pageSummary(session.page),
    diagnostics: diagnosticCounts(session.diagnostics)
  };
  if (args.snapshot !== false) {
    payload.snapshot = await createSnapshot(session, args.max_elements);
  }
  return payload;
}

async function toolFill(args) {
  const session = getSession(args.session_id);
  const target = await resolveTarget(session, args);
  await target.locator.fill(String(args.value), {
    timeout: normalizeTimeout(args.timeout_ms, 15000)
  });
  await waitForOptionalLoad(session.page, args.wait_until, args.timeout_ms);
  session.lastActivityAt = nowIso();
  session.lastUrl = session.page.url();
  const payload = {
    ok: true,
    session: sessionSummary(session),
    target: target.description,
    page: await pageSummary(session.page),
    diagnostics: diagnosticCounts(session.diagnostics)
  };
  if (args.snapshot !== false) {
    payload.snapshot = await createSnapshot(session, args.max_elements);
  }
  return payload;
}

async function waitForOptionalLoad(page, waitUntil, timeoutMs) {
  if (!waitUntil) {
    return;
  }
  try {
    await page.waitForLoadState(normalizeWaitUntil(waitUntil), {
      timeout: normalizeTimeout(timeoutMs, 15000)
    });
  } catch (error) {
    // Some interactions do not trigger a navigation; diagnostics still capture page errors.
  }
}

async function resolveTarget(session, args) {
  const page = session.page;
  if (args.ref) {
    const selector = session.refs.get(args.ref);
    if (!selector) {
      throw createToolError("REF_NOT_FOUND", "Snapshot ref was not found in this session.", {
        ref: args.ref,
        knownRefs: Array.from(session.refs.keys()).slice(0, 50)
      });
    }
    return {
      locator: page.locator(selector).first(),
      description: { type: "ref", ref: args.ref, selector }
    };
  }
  if (args.selector) {
    return {
      locator: page.locator(args.selector).first(),
      description: { type: "selector", selector: args.selector }
    };
  }
  if (args.role && args.name && typeof page.getByRole === "function") {
    return {
      locator: page.getByRole(args.role, { name: args.name, exact: args.exact === true }).first(),
      description: { type: "role", role: args.role, name: args.name }
    };
  }
  if (args.text && typeof page.getByText === "function") {
    return {
      locator: page.getByText(args.text, { exact: args.exact === true }).first(),
      description: { type: "text", text: args.text, exact: args.exact === true }
    };
  }
  throw createToolError("TARGET_REQUIRED", "Provide one target: ref, selector, role+name, or text.");
}

async function toolScreenshot(args) {
  const session = getSession(args.session_id);
  const screenshot = await saveScreenshot(session, {
    name: args.name || "screenshot",
    full_page: args.full_page !== false
  });
  const payload = {
    ok: true,
    session: sessionSummary(session),
    page: await pageSummary(session.page),
    screenshot
  };
  if (args.emit_image === true) {
    return {
      content: [
        { type: "text", text: JSON.stringify(payload, null, 2) },
        {
          type: "image",
          mimeType: "image/png",
          data: fs.readFileSync(screenshot.path).toString("base64")
        }
      ]
    };
  }
  return toolTextResult(payload);
}

async function toolDiagnostics(args) {
  const session = getSession(args.session_id);
  const payload = {
    ok: true,
    session: sessionSummary(session),
    diagnostics: session.diagnostics
  };
  if (args.clear === true) {
    session.diagnostics = emptyDiagnostics();
    payload.cleared = true;
  }
  return payload;
}

async function toolViewportMatrix(args) {
  const url = requireHttpUrl(args.url);
  const viewports = normalizeViewports(args.viewports);
  const results = [];
  for (const viewport of viewports) {
    const session = await ensureSession({
      session_id: `matrix-${safeName(viewport.name)}-${Date.now()}`,
      browser: args.browser,
      channel: args.channel,
      headless: args.headless,
      viewport
    });
    try {
      await session.page.goto(url, {
        waitUntil: normalizeWaitUntil(args.wait_until),
        timeout: normalizeTimeout(args.timeout_ms, 30000)
      });
      session.lastActivityAt = nowIso();
      session.lastUrl = session.page.url();
      const result = {
        viewport,
        session: sessionSummary(session),
        page: await pageSummary(session.page),
        diagnostics: diagnosticCounts(session.diagnostics)
      };
      if (args.snapshot !== false) {
        result.snapshot = await createSnapshot(session, args.max_elements);
      }
      if (args.screenshot !== false) {
        result.screenshot = await saveScreenshot(session, {
          name: `viewport-${viewport.name}`,
          full_page: true
        });
      }
      results.push(result);
    } finally {
      if (args.keep_sessions !== true && sessions.has(session.id)) {
        await closeSession(session);
      }
    }
  }
  return {
    ok: true,
    url,
    artifactRoot: ARTIFACT_ROOT,
    results
  };
}

function normalizeViewports(viewports) {
  const defaults = [
    { name: "mobile", width: 390, height: 844, isMobile: true },
    { name: "tablet", width: 820, height: 1180, isMobile: true },
    { name: "desktop", width: 1440, height: 900, isMobile: false }
  ];
  const source = Array.isArray(viewports) && viewports.length > 0 ? viewports : defaults;
  return source.map((viewport, index) => ({
    name: safeName(viewport.name || `viewport-${index + 1}`),
    width: clampInteger(viewport.width, defaults[Math.min(index, defaults.length - 1)].width, 240, 7680),
    height: clampInteger(viewport.height, defaults[Math.min(index, defaults.length - 1)].height, 240, 4320),
    isMobile: Boolean(viewport.isMobile)
  }));
}

async function toolVisualCheckpoint(args) {
  const session = getSession(args.session_id);
  const screenshot = await saveScreenshot(session, {
    name: `checkpoint-${args.name}`,
    full_page: args.full_page !== false
  });
  const snapshot = await createSnapshot(session, args.max_elements);
  const metadata = {
    ok: true,
    name: args.name,
    session: sessionSummary(session),
    page: await pageSummary(session.page),
    screenshot,
    snapshotMetrics: snapshot.metrics,
    diagnostics: diagnosticCounts(session.diagnostics),
    createdAt: nowIso()
  };
  const metadataPath = path.join(session.artifactDir, `${path.basename(screenshot.path, ".png")}.metadata.json`);
  fs.writeFileSync(metadataPath, `${JSON.stringify(metadata, null, 2)}\n`, "utf8");
  metadata.metadata = artifactMetadata(metadataPath, "application/json");
  return metadata;
}

async function toolLocalSmoke(args) {
  const url = requireHttpUrl(args.url);
  let child = null;
  const serverLog = { stdout: [], stderr: [] };
  const smokeId = `smoke-${Date.now()}-${sessionCounter++}`;
  const startedAt = nowIso();

  try {
    if (args.start_command) {
      const cwd = resolveContainedPath(args.cwd || ".");
      const spawnCommand = normalizeSpawnCommand(args.start_command);
      const spawnArgs = Array.isArray(args.start_args) ? args.start_args.map(String) : [];
      child = spawn(spawnCommand, spawnArgs, {
        cwd,
        shell: false,
        stdio: ["ignore", "pipe", "pipe"],
        windowsHide: true
      });
      collectChildOutput(child.stdout, serverLog.stdout);
      collectChildOutput(child.stderr, serverLog.stderr);
      child.on("error", (error) => {
        pushLimited(serverLog.stderr, `${nowIso()} spawn error: ${error.message}`, 50);
      });
    }

    const waitResult = await waitForUrl(url, normalizeTimeout(args.wait_timeout_ms, 60000));
    const session = await ensureSession({
      session_id: smokeId,
      browser: args.browser,
      channel: args.channel,
      headless: args.headless,
      viewport: args.viewport
    });

    try {
      await session.page.goto(url, {
        waitUntil: normalizeWaitUntil(args.wait_until),
        timeout: normalizeTimeout(args.wait_timeout_ms, 60000)
      });
      session.lastActivityAt = nowIso();
      session.lastUrl = session.page.url();

      const actionResults = [];
      if (Array.isArray(args.actions)) {
        for (const action of args.actions) {
          actionResults.push(await runSmokeAction(session, action));
        }
      }

      const payload = {
        ok: true,
        url,
        startedAt,
        waitResult,
        actionResults,
        session: sessionSummary(session),
        page: await pageSummary(session.page),
        diagnostics: {
          counts: diagnosticCounts(session.diagnostics),
          recent: recentDiagnostics(session.diagnostics)
        },
        serverProcess: child
          ? {
              pid: child.pid,
              command: args.start_command,
              args: Array.isArray(args.start_args) ? args.start_args : [],
              cwd: args.cwd || ".",
              stdoutTail: serverLog.stdout,
              stderrTail: serverLog.stderr
            }
          : null
      };
      if (args.snapshot !== false) {
        payload.snapshot = await createSnapshot(session, args.max_elements);
      }
      if (args.screenshot !== false) {
        payload.screenshot = await saveScreenshot(session, {
          name: "local-smoke",
          full_page: true
        });
      }
      await closeSession(session);
      return payload;
    } catch (error) {
      if (sessions.has(session.id)) {
        await closeSession(session);
      }
      throw error;
    }
  } finally {
    if (child && args.keep_server !== true) {
      try {
        child.kill();
      } catch (error) {
        // Best-effort cleanup.
      }
    }
  }
}

async function runSmokeAction(session, action) {
  const startedAt = nowIso();
  if (action.type === "wait") {
    const timeout = normalizeTimeout(action.timeout_ms, 1000);
    await new Promise((resolve) => setTimeout(resolve, timeout));
    return { ok: true, type: "wait", timeout_ms: timeout, startedAt, finishedAt: nowIso() };
  }
  if (action.type === "click") {
    const target = await resolveTarget(session, action);
    await target.locator.click({ timeout: normalizeTimeout(action.timeout_ms, 15000) });
    return { ok: true, type: "click", target: target.description, startedAt, finishedAt: nowIso() };
  }
  if (action.type === "fill") {
    const target = await resolveTarget(session, action);
    await target.locator.fill(String(action.value || ""), {
      timeout: normalizeTimeout(action.timeout_ms, 15000)
    });
    return { ok: true, type: "fill", target: target.description, startedAt, finishedAt: nowIso() };
  }
  throw createToolError("UNSUPPORTED_ACTION", "Unsupported smoke action.", { action });
}

function collectChildOutput(stream, target) {
  if (!stream) {
    return;
  }
  stream.setEncoding("utf8");
  stream.on("data", (chunk) => {
    for (const line of String(chunk).split(/\r?\n/)) {
      if (line.trim()) {
        pushLimited(target, `${nowIso()} ${line.slice(0, 1000)}`, 50);
      }
    }
  });
}

function normalizeSpawnCommand(command) {
  if (process.platform === "win32" && command === "npm") {
    return "npm.cmd";
  }
  if (process.platform === "win32" && command === "npx") {
    return "npx.cmd";
  }
  return command;
}

function resolveContainedPath(candidate) {
  const resolved = path.resolve(ROOT_DIR, candidate);
  const relative = path.relative(ROOT_DIR, resolved);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw createToolError("CWD_OUTSIDE_REPO", "local_smoke cwd must stay inside the repository.", {
      cwd: candidate,
      rootDir: ROOT_DIR
    });
  }
  return resolved;
}

async function waitForUrl(url, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  let lastError = null;
  while (Date.now() < deadline) {
    try {
      const probe = await probeUrl(url);
      return {
        ok: true,
        url,
        statusCode: probe.statusCode,
        elapsedMs: timeoutMs - Math.max(0, deadline - Date.now())
      };
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }
  throw createToolError("URL_WAIT_TIMEOUT", "Timed out waiting for local smoke URL.", {
    url,
    timeoutMs,
    lastError: lastError ? lastError.message : null
  });
}

function probeUrl(url) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const client = parsed.protocol === "https:" ? https : http;
    const request = client.get(parsed, { timeout: 2000 }, (response) => {
      response.resume();
      resolve({ statusCode: response.statusCode });
    });
    request.on("timeout", () => {
      request.destroy(new Error("Probe timed out."));
    });
    request.on("error", reject);
  });
}

async function pageSummary(page) {
  return {
    url: page.url(),
    title: await page.title().catch(() => ""),
    viewport: page.viewportSize()
  };
}

async function createSnapshot(session, maxElements) {
  const limit = clampInteger(maxElements, 120, 1, 500);
  const snapshot = await session.page.evaluate((elementLimit) => {
    const compact = (value, max = 180) => String(value || "").replace(/\s+/g, " ").trim().slice(0, max);
    const visible = (element) => {
      const style = window.getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.visibility !== "hidden" && style.display !== "none" && rect.width > 0 && rect.height > 0;
    };
    const implicitRole = (element) => {
      const tag = element.tagName.toLowerCase();
      if (tag === "button") return "button";
      if (tag === "a" && element.href) return "link";
      if (tag === "input") return element.type === "checkbox" ? "checkbox" : "textbox";
      if (tag === "textarea") return "textbox";
      if (tag === "select") return "combobox";
      return null;
    };
    const cssEscape = (value) => {
      if (window.CSS && typeof window.CSS.escape === "function") {
        return window.CSS.escape(value);
      }
      return String(value).replace(/[^a-zA-Z0-9_-]/g, "\\$&");
    };
    const selectorFor = (element) => {
      if (element.id) {
        return `#${cssEscape(element.id)}`;
      }
      const testId = element.getAttribute("data-testid") || element.getAttribute("data-test");
      if (testId) {
        return `[data-testid="${testId.replace(/"/g, '\\"')}"], [data-test="${testId.replace(/"/g, '\\"')}"]`;
      }
      const parts = [];
      let current = element;
      while (current && current.nodeType === Node.ELEMENT_NODE && parts.length < 5) {
        const tag = current.tagName.toLowerCase();
        const parent = current.parentElement;
        if (!parent) {
          parts.unshift(tag);
          break;
        }
        const sameTag = Array.from(parent.children).filter((child) => child.tagName === current.tagName);
        const index = sameTag.indexOf(current) + 1;
        parts.unshift(sameTag.length > 1 ? `${tag}:nth-of-type(${index})` : tag);
        current = parent;
      }
      return parts.join(" > ");
    };
    const rectPayload = (element) => {
      const rect = element.getBoundingClientRect();
      return {
        x: Math.round(rect.x),
        y: Math.round(rect.y),
        width: Math.round(rect.width),
        height: Math.round(rect.height)
      };
    };
    const interactiveSelector = [
      "a[href]",
      "button",
      "input",
      "textarea",
      "select",
      "summary",
      "[role='button']",
      "[role='link']",
      "[role='checkbox']",
      "[role='textbox']",
      "[contenteditable='true']",
      "[tabindex]:not([tabindex='-1'])"
    ].join(",");
    const interactive = Array.from(document.querySelectorAll(interactiveSelector))
      .filter(visible)
      .slice(0, elementLimit)
      .map((element, index) => {
        const tag = element.tagName.toLowerCase();
        const type = element.getAttribute("type");
        const safeValue = type === "password" ? "" : compact(element.value, 80);
        return {
          ref: `e${index}`,
          selector: selectorFor(element),
          tag,
          role: element.getAttribute("role") || implicitRole(element),
          type,
          name: compact(
            element.getAttribute("aria-label") ||
              element.getAttribute("title") ||
              element.getAttribute("placeholder") ||
              element.innerText ||
              safeValue
          ),
          text: compact(element.innerText || element.textContent, 120),
          value: safeValue,
          disabled: Boolean(element.disabled || element.getAttribute("aria-disabled") === "true"),
          checked: typeof element.checked === "boolean" ? element.checked : null,
          href: element.href || null,
          box: rectPayload(element)
        };
      });
    const textBlocks = Array.from(document.querySelectorAll("h1,h2,h3,h4,p,li,label"))
      .filter(visible)
      .slice(0, 80)
      .map((element) => ({
        tag: element.tagName.toLowerCase(),
        text: compact(element.innerText || element.textContent, 220),
        box: rectPayload(element)
      }))
      .filter((entry) => entry.text);
    const overflowElements = Array.from(document.body ? document.body.querySelectorAll("*") : [])
      .filter((element) => {
        const rect = element.getBoundingClientRect();
        return rect.right > window.innerWidth + 1 || rect.left < -1;
      })
      .slice(0, 20)
      .map((element) => ({
        tag: element.tagName.toLowerCase(),
        selector: selectorFor(element),
        box: rectPayload(element),
        text: compact(element.innerText || element.textContent, 80)
      }));
    const overlapCandidates = [];
    const boxes = interactive.slice(0, 40).map((entry) => ({ label: entry.ref, box: entry.box }));
    for (let outer = 0; outer < boxes.length; outer += 1) {
      for (let inner = outer + 1; inner < boxes.length; inner += 1) {
        const a = boxes[outer].box;
        const b = boxes[inner].box;
        const overlapWidth = Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x));
        const overlapHeight = Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));
        const overlapArea = overlapWidth * overlapHeight;
        const minArea = Math.max(1, Math.min(a.width * a.height, b.width * b.height));
        if (overlapArea / minArea > 0.35) {
          overlapCandidates.push({ refs: [boxes[outer].label, boxes[inner].label], overlapRatio: Number((overlapArea / minArea).toFixed(2)) });
        }
      }
    }
    return {
      url: location.href,
      title: document.title,
      viewport: {
        width: window.innerWidth,
        height: window.innerHeight,
        devicePixelRatio: window.devicePixelRatio
      },
      bodyTextSample: compact(document.body ? document.body.innerText : "", 1200),
      elements: interactive,
      textBlocks,
      metrics: {
        elementCount: document.querySelectorAll("*").length,
        interactiveCount: interactive.length,
        visibleTextLength: document.body ? compact(document.body.innerText, 100000).length : 0,
        scrollWidth: document.documentElement.scrollWidth,
        scrollHeight: document.documentElement.scrollHeight,
        horizontalOverflow: document.documentElement.scrollWidth > window.innerWidth + 1,
        overflowElements,
        overlapCandidates
      }
    };
  }, limit);

  session.refs.clear();
  for (const element of snapshot.elements || []) {
    session.refs.set(element.ref, element.selector);
  }
  return snapshot;
}

async function saveScreenshot(session, args) {
  const fileBase = `${timestampName()}_${safeName(args.name || "screenshot")}`;
  const absolutePath = path.join(session.artifactDir, `${fileBase}.png`);
  await session.page.screenshot({
    path: absolutePath,
    fullPage: args.full_page !== false
  });
  return artifactMetadata(absolutePath, "image/png");
}

function artifactMetadata(absolutePath, mimeType) {
  const bytes = fs.readFileSync(absolutePath);
  return {
    path: absolutePath,
    relativePath: path.relative(ROOT_DIR, absolutePath).replace(/\\/g, "/"),
    mimeType,
    sizeBytes: bytes.length,
    sha256: crypto.createHash("sha256").update(bytes).digest("hex")
  };
}

function recentDiagnostics(diagnostics) {
  return {
    console: diagnostics.console.slice(-25),
    pageErrors: diagnostics.pageErrors.slice(-25),
    failedRequests: diagnostics.failedRequests.slice(-25),
    httpErrors: diagnostics.httpErrors.slice(-25)
  };
}

async function callTool(name, args) {
  try {
    switch (name) {
      case "playwright_status":
        return toolTextResult(statusPayload());
      case "playwright_navigate":
        return toolTextResult(await toolNavigate(args || {}));
      case "playwright_observe":
        return toolTextResult(await toolObserve(args || {}));
      case "playwright_click":
        return toolTextResult(await toolClick(args || {}));
      case "playwright_fill":
        return toolTextResult(await toolFill(args || {}));
      case "playwright_screenshot":
        return await toolScreenshot(args || {});
      case "playwright_diagnostics":
        return toolTextResult(await toolDiagnostics(args || {}));
      case "playwright_viewport_matrix":
        return toolTextResult(await toolViewportMatrix(args || {}));
      case "playwright_visual_checkpoint":
        return toolTextResult(await toolVisualCheckpoint(args || {}));
      case "playwright_local_smoke":
        return toolTextResult(await toolLocalSmoke(args || {}));
      case "playwright_close_session":
        return toolTextResult(await toolCloseSession(args || {}));
      default:
        return toolTextResult(serializeError(createToolError("UNKNOWN_TOOL", `Unknown tool: ${name}`)), true);
    }
  } catch (error) {
    return toolTextResult(serializeError(error), true);
  }
}

async function toolCloseSession(args) {
  if (args.all === true) {
    const ids = Array.from(sessions.keys());
    await closeAllSessions();
    return { ok: true, closedSessions: ids };
  }
  const session = getSession(args.session_id);
  await closeSession(session);
  return { ok: true, closedSessions: [session.id] };
}

function listResources() {
  return {
    resources: [
      {
        uri: "playwright://status",
        name: "Playwright MCP status",
        description: "Server status, artifact root, Playwright availability, and active sessions.",
        mimeType: "application/json"
      },
      {
        uri: "playwright://sessions",
        name: "Active Playwright sessions",
        description: "Currently open browser sessions managed by this MCP server.",
        mimeType: "application/json"
      }
    ]
  };
}

function readResource(uri) {
  if (uri === "playwright://status") {
    return {
      contents: [{ uri, mimeType: "application/json", text: JSON.stringify(statusPayload(), null, 2) }]
    };
  }
  if (uri === "playwright://sessions") {
    return {
      contents: [
        {
          uri,
          mimeType: "application/json",
          text: JSON.stringify(Array.from(sessions.values()).map((session) => sessionSummary(session)), null, 2)
        }
      ]
    };
  }
  throw createToolError("RESOURCE_NOT_FOUND", `Unknown resource: ${uri}`);
}

async function handleMessage(line) {
  let message;
  try {
    message = JSON.parse(line);
  } catch (error) {
    rpcError(null, -32700, "Parse error", error.message);
    return;
  }

  if (!message || message.jsonrpc !== "2.0" || typeof message.method !== "string") {
    rpcError(message && message.id, -32600, "Invalid Request");
    return;
  }

  const isNotification = message.id === undefined || message.id === null;
  if (isNotification && message.method.startsWith("notifications/")) {
    return;
  }

  try {
    let result;
    switch (message.method) {
      case "initialize":
        result = {
          protocolVersion: message.params && message.params.protocolVersion ? message.params.protocolVersion : DEFAULT_PROTOCOL_VERSION,
          capabilities: { tools: {}, resources: {} },
          serverInfo: { name: SERVER_NAME, version: SERVER_VERSION }
        };
        break;
      case "ping":
        result = {};
        break;
      case "tools/list":
        result = { tools: TOOL_DEFINITIONS };
        break;
      case "tools/call":
        if (!message.params || typeof message.params.name !== "string") {
          throw createToolError("INVALID_REQUEST", "tools/call requires params.name.");
        }
        result = await callTool(message.params.name, message.params.arguments || {});
        break;
      case "resources/list":
        result = listResources();
        break;
      case "resources/read":
        if (!message.params || typeof message.params.uri !== "string") {
          throw createToolError("INVALID_REQUEST", "resources/read requires params.uri.");
        }
        result = readResource(message.params.uri);
        break;
      case "prompts/list":
        result = { prompts: [] };
        break;
      default:
        rpcError(message.id, -32601, "Method not found", { method: message.method });
        return;
    }

    if (!isNotification) {
      writeJsonRpc({ jsonrpc: "2.0", id: message.id, result });
    }
  } catch (error) {
    if (!isNotification) {
      rpcError(message.id, -32603, error.message || "Internal error", serializeError(error));
    }
  }
}

let stdinBuffer = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => {
  stdinBuffer += chunk;
  let newlineIndex = stdinBuffer.indexOf("\n");
  while (newlineIndex >= 0) {
    const line = stdinBuffer.slice(0, newlineIndex).trim();
    stdinBuffer = stdinBuffer.slice(newlineIndex + 1);
    if (line) {
      handleMessage(line);
    }
    newlineIndex = stdinBuffer.indexOf("\n");
  }
});

process.stdin.on("end", () => {
  closeAllSessions().finally(() => process.exit(0));
});

process.on("SIGINT", () => {
  closeAllSessions().finally(() => process.exit(0));
});

process.on("SIGTERM", () => {
  closeAllSessions().finally(() => process.exit(0));
});
