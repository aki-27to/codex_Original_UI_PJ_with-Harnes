#!/usr/bin/env node
"use strict";

const fs = require("fs");
const http = require("http");
const net = require("net");
const path = require("path");
const { spawn } = require("child_process");
const { startInProcessHarnessServer } = require("./lib/in_process_harness_server");
const { getLoggingSurfacePaths } = require("./lib/logging_surface");
const { normalizeRequestUserInputPolicy, resolveNonInteractiveUserInput } = require("./lib/request_user_input_policy");

const workspaceRoot = path.resolve(__dirname, "..");
const loggingSurfacePaths = getLoggingSurfacePaths(workspaceRoot);
const defaultWindowsCodexCmd = process.env.APPDATA
  ? path.join(process.env.APPDATA, "npm", "codex.cmd")
  : "codex.cmd";
const smokeRequestUserInputPolicy = normalizeRequestUserInputPolicy(
  process.env.CODEX_SMOKE_REQUEST_USER_INPUT_POLICY,
  "auto-empty"
);
const rbjDemoMode = process.argv.includes("--rbj-demo");

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isSpawnPermissionError(error) {
  const message = error instanceof Error ? error.message : String(error || "");
  return /spawn(?:Sync)?\s+EPERM/i.test(message) || /\bEPERM\b/i.test(message);
}

async function pickAvailablePort(preferredPort) {
  const tryListen = (port) =>
    new Promise((resolve, reject) => {
      const server = net.createServer();
      server.unref();
      server.once("error", (error) => {
        server.close(() => {
          reject(error);
        });
      });
      server.listen(port, "127.0.0.1", () => {
        const address = server.address();
        const resolvedPort = address && typeof address === "object" ? Number(address.port || 0) : 0;
        server.close((closeError) => {
          if (closeError) {
            reject(closeError);
            return;
          }
          resolve(resolvedPort);
        });
      });
    });
  try {
    return await tryListen(preferredPort);
  } catch (error) {
    if (!(error && error.code === "EADDRINUSE")) {
      throw error;
    }
  }
  return tryListen(0);
}

async function stopHarnessHandle(handle) {
  if (!handle || typeof handle.stop !== "function") {
    return;
  }
  try {
    await handle.stop();
  } catch {
    // ignore best effort cleanup
  }
}

function createDeferred(name, timeoutMs) {
  let settled = false;
  let resolveRef;
  let rejectRef;
  const promise = new Promise((resolve, reject) => {
    resolveRef = resolve;
    rejectRef = reject;
  });
  const timeout = setTimeout(() => {
    if (settled) {
      return;
    }
    settled = true;
    rejectRef(new Error(`${name} timed out after ${timeoutMs}ms`));
  }, timeoutMs);
  return {
    promise,
    resolve(value) {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timeout);
      resolveRef(value);
    },
    reject(error) {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timeout);
      rejectRef(error);
    },
  };
}

function resolveAppServerSpawnTarget(cwd) {
  if (process.platform === "win32") {
    const cmdPath = fs.existsSync(defaultWindowsCodexCmd)
      ? defaultWindowsCodexCmd
      : "codex.cmd";
    const commandLine = `"${cmdPath}" app-server`;
    return {
      command: commandLine,
      args: [],
      options: { cwd, windowsHide: true, stdio: ["pipe", "pipe", "pipe"], shell: true },
    };
  }
  return {
    command: "codex",
    args: ["app-server"],
    options: { cwd, windowsHide: true, stdio: ["pipe", "pipe", "pipe"] },
  };
}

class CodexAppServerClient {
  constructor(cwd) {
    this.cwd = cwd;
    this.child = null;
    this.stdoutBuffer = "";
    this.stderrBuffer = "";
    this.requestSeq = 1;
    this.pending = new Map();
    this.notificationHandlers = new Set();
    this.stopping = false;
  }

  async start() {
    let child;
    const spawnTarget = resolveAppServerSpawnTarget(this.cwd);
    try {
      child = spawn(spawnTarget.command, spawnTarget.args, spawnTarget.options);
    } catch (error) {
      throw new Error(`failed to spawn codex app-server: ${error.message}`);
    }
    this.child = child;
    this.stopping = false;

    child.stdout.on("data", (chunk) => {
      this.stdoutBuffer += chunk.toString("utf8");
      this.flushStdout();
    });
    child.stderr.on("data", (chunk) => {
      this.stderrBuffer += chunk.toString("utf8");
      this.flushStderr();
    });
    child.on("error", (error) => {
      this.handleProcessTermination(new Error(`app-server process error: ${error.message}`));
    });
    child.on("close", (code) => {
      const reason = this.stopping
        ? "app-server stopped"
        : `app-server exited unexpectedly (code=${code == null ? "null" : code})`;
      this.handleProcessTermination(new Error(reason));
    });
  }

  stop() {
    this.stopping = true;
    if (this.child && !this.child.killed) {
      try {
        this.child.kill();
      } catch {
        // ignore
      }
    }
    this.child = null;
  }

  onNotification(handler) {
    this.notificationHandlers.add(handler);
    return () => {
      this.notificationHandlers.delete(handler);
    };
  }

  sendRaw(payload) {
    if (!this.child || !this.child.stdin || this.child.stdin.destroyed) {
      throw new Error("app-server is not running");
    }
    this.child.stdin.write(`${JSON.stringify(payload)}\n`);
  }

  notify(method, params) {
    if (params === undefined) {
      this.sendRaw({ method });
      return;
    }
    this.sendRaw({ method, params });
  }

  request(method, params, timeoutMs = 120000) {
    if (!this.child || this.stopping) {
      throw new Error("app-server is not running");
    }
    const id = String(this.requestSeq++);
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`request timed out: ${method}`));
      }, timeoutMs);
      this.pending.set(id, { resolve, reject, timeout, method });
      try {
        this.sendRaw({ method, id, params });
      } catch (error) {
        clearTimeout(timeout);
        this.pending.delete(id);
        reject(error);
      }
    });
  }

  flushStdout() {
    const lines = this.stdoutBuffer.split(/\r?\n/);
    this.stdoutBuffer = lines.pop() || "";
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) {
        continue;
      }
      this.handleMessageLine(trimmed);
    }
  }

  flushStderr() {
    const lines = this.stderrBuffer.split(/\r?\n/);
    this.stderrBuffer = lines.pop() || "";
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("WARNING:")) {
        continue;
      }
      console.error(`[app-server] ${trimmed}`);
    }
  }

  handleProcessTermination(error) {
    const finalError = error instanceof Error ? error : new Error(String(error));
    for (const [id, pending] of this.pending.entries()) {
      clearTimeout(pending.timeout);
      pending.reject(finalError);
      this.pending.delete(id);
    }
    this.child = null;
  }

  parseError(errorPayload) {
    if (!errorPayload) {
      return "unknown app-server error";
    }
    if (typeof errorPayload.message === "string") {
      return errorPayload.message;
    }
    if (typeof errorPayload === "string") {
      return errorPayload;
    }
    try {
      return JSON.stringify(errorPayload);
    } catch {
      return "unknown app-server error";
    }
  }

  handleMessageLine(line) {
    let message;
    try {
      message = JSON.parse(line);
    } catch {
      return;
    }

    const hasId = Object.prototype.hasOwnProperty.call(message, "id");
    const hasResult = Object.prototype.hasOwnProperty.call(message, "result");
    const hasError = Object.prototype.hasOwnProperty.call(message, "error");
    const hasMethod = typeof message.method === "string";

    if (hasId && hasMethod && !hasResult && !hasError) {
      this.handleServerRequest(message);
      return;
    }

    if (hasId && (hasResult || hasError)) {
      const pending = this.pending.get(String(message.id));
      if (!pending) {
        return;
      }
      clearTimeout(pending.timeout);
      this.pending.delete(String(message.id));
      if (hasError) {
        pending.reject(new Error(this.parseError(message.error)));
      } else {
        pending.resolve(message.result);
      }
      return;
    }

    if (hasMethod) {
      for (const handler of this.notificationHandlers) {
        try {
          handler(message);
        } catch (error) {
          console.error(
            `[smoke] notification handler error: ${error instanceof Error ? error.message : String(error)}`
          );
        }
      }
    }
  }

  handleServerRequest(message) {
    const id = message.id;
    const method = message.method;
    try {
      if (method === "item/commandExecution/requestApproval" || method === "commandExecution/requestApproval") {
        this.sendRaw({ id, result: { decision: "accept" } });
        return;
      }
      if (method === "item/fileChange/requestApproval" || method === "fileChange/requestApproval") {
        this.sendRaw({ id, result: { decision: "accept" } });
        return;
      }
      if (method === "item/tool/requestUserInput" || method === "tool/requestUserInput") {
        const userInputResolution = resolveNonInteractiveUserInput({
          policy: smokeRequestUserInputPolicy,
          params: message && typeof message.params === "object" ? message.params : {},
        });
        if (userInputResolution.decision === "blocked") {
          this.sendRaw({ id, error: { code: -32004, message: "interactive user input is disabled in smoke harness" } });
          return;
        }
        this.sendRaw({
          id,
          result: {
            answers:
              userInputResolution.answers && typeof userInputResolution.answers === "object"
                ? userInputResolution.answers
                : {},
          },
        });
        return;
      }
      if (method === "item/tool/call" || method === "tool/call") {
        this.sendRaw({ id, result: { contentItems: [], success: false } });
        return;
      }
      this.sendRaw({ id, error: { code: -32601, message: `unsupported server request: ${method}` } });
    } catch {
      // ignore send failures; termination path handles rejection.
    }
  }
}

function isExpectedLongRunningCommand(commandText) {
  if (typeof commandText !== "string") {
    return false;
  }
  const normalized = commandText.replace(/\s+/g, " ").trim().toLowerCase();
  return normalized.includes("node -e") && normalized.includes("settimeout(()=>{}, 10000)");
}

function requestHttpJson({ method, path: requestPath, body = null, timeoutMs = 30000, port = 57525, headers = {} }) {
  return new Promise((resolve, reject) => {
    const payload = body == null ? "" : JSON.stringify(body);
    const normalizedHeaders = {
      ...(headers && typeof headers === "object" ? headers : {}),
    };
    if (body != null) {
      normalizedHeaders["Content-Type"] = normalizedHeaders["Content-Type"] || "application/json; charset=utf-8";
      normalizedHeaders["Content-Length"] = Buffer.byteLength(payload);
    }
    const req = http.request(
      {
        hostname: "127.0.0.1",
        port,
        path: requestPath,
        method,
        timeout: timeoutMs,
        headers: normalizedHeaders,
      },
      (res) => {
        let raw = "";
        res.on("data", (chunk) => {
          raw += chunk.toString("utf8");
        });
        res.on("end", () => {
          let parsed = null;
          try {
            parsed = raw ? JSON.parse(raw) : null;
          } catch {
            parsed = null;
          }
          resolve({ statusCode: res.statusCode || 0, raw, json: parsed });
        });
      }
    );
    req.on("timeout", () => {
      req.destroy(new Error(`HTTP timeout: ${method} ${requestPath}`));
    });
    req.on("error", reject);
    if (body != null) {
      req.write(payload);
    }
    req.end();
  });
}

function runExecViaHttp({ prompt, timeoutMs = 180000, port = 57525, idempotencyKey = "", headers = {} }) {
  return new Promise((resolve, reject) => {
    const requestBody = {
      prompt,
      agentName: "intake",
      sandboxMode: "workspace-write",
      approvalPolicy: "never",
      cwd: workspaceRoot,
      executionProfile: "smoke-test",
      executionIntent: "smoke-http-exec",
      executionSource: "smoke_test",
    };
    if (typeof idempotencyKey === "string" && idempotencyKey.trim()) {
      requestBody.idempotencyKey = idempotencyKey.trim();
    }
    const payload = JSON.stringify(requestBody);
    const requestHeaders = {
      ...(headers && typeof headers === "object" ? headers : {}),
      "Content-Type": "application/json; charset=utf-8",
      "Content-Length": Buffer.byteLength(payload),
    };
    if (requestBody.idempotencyKey) {
      requestHeaders["idempotency-key"] = requestBody.idempotencyKey;
    }
    const req = http.request(
      {
        hostname: "127.0.0.1",
        port,
        path: "/api/exec",
        method: "POST",
        timeout: timeoutMs,
        headers: requestHeaders,
      },
      (res) => {
        if ((res.statusCode || 0) !== 200) {
          let errorBody = "";
          res.on("data", (chunk) => {
            errorBody += chunk.toString("utf8");
          });
          res.on("end", () => {
            reject(new Error(`POST /api/exec failed: HTTP ${res.statusCode} ${errorBody}`));
          });
          return;
        }

        let buffer = "";
        const events = [];
        res.on("data", (chunk) => {
          buffer += chunk.toString("utf8");
          const lines = buffer.split(/\r?\n/);
          buffer = lines.pop() || "";
          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed) continue;
            try {
              events.push(JSON.parse(trimmed));
            } catch {
              // ignore malformed stream line
            }
          }
        });
        res.on("end", () => {
          const turnStarted = events.find((event) => event && event.type === "turn" && event.phase === "started") || null;
          const turnCompleted = events.find((event) => event && event.type === "turn" && event.phase === "completed") || null;
          const statusEvent = events.filter((event) => event && event.type === "status").slice(-1)[0] || null;
          resolve({ events, turnStarted, turnCompleted, statusEvent });
        });
      }
    );
    req.on("timeout", () => {
      req.destroy(new Error("POST /api/exec timed out"));
    });
    req.on("error", reject);
    req.write(payload);
    req.end();
  });
}

function isTerminalStatus(status) {
  return status === "completed" || status === "interrupted" || status === "failed";
}

function loadJsonIfExists(filePath) {
  if (!filePath || !fs.existsSync(filePath)) {
    return null;
  }
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return null;
  }
}

function resolveWorkspaceRelativePath(targetPath) {
  if (typeof targetPath !== "string" || !targetPath.trim()) {
    return "";
  }
  return path.isAbsolute(targetPath) ? targetPath : path.resolve(workspaceRoot, targetPath);
}

function findTurnArtifactManifest(turnId, { maxAgeMs = 10 * 60 * 1000, artifactManifestPath = "" } = {}) {
  if (typeof turnId !== "string" || !turnId.trim()) {
    return null;
  }
  const targetTurnId = turnId.trim();
  const hintedManifestPath = resolveWorkspaceRelativePath(artifactManifestPath);
  const hintedManifest = loadJsonIfExists(hintedManifestPath);
  if (hintedManifest && hintedManifest.turn && hintedManifest.turn.turnId === targetTurnId) {
    return { path: hintedManifestPath, manifest: hintedManifest };
  }
  const roots = Array.from(
    new Set(
      [
        loggingSurfacePaths.turnArtifactsRoot,
        process.env.CODEX_TURN_ARTIFACTS_DIR ? resolveWorkspaceRelativePath(process.env.CODEX_TURN_ARTIFACTS_DIR) : "",
        path.join(workspaceRoot, "logs", "turns"),
      ].filter(Boolean)
    )
  ).filter((candidate) => fs.existsSync(candidate));
  if (roots.length === 0) {
    return null;
  }
  const now = Date.now();
  const stack = [...roots];
  while (stack.length > 0) {
    const current = stack.pop();
    let entries = [];
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(fullPath);
        continue;
      }
      if (!entry.isFile() || entry.name !== "manifest.json") {
        continue;
      }
      let stat;
      try {
        stat = fs.statSync(fullPath);
      } catch {
        continue;
      }
      if (!stat || now - stat.mtimeMs > maxAgeMs) {
        continue;
      }
      const parsed = loadJsonIfExists(fullPath);
      if (!parsed || !parsed.turn || parsed.turn.turnId !== targetTurnId) {
        continue;
      }
      return { path: fullPath, manifest: parsed };
    }
  }
  return null;
}

function waitForRuntimeCondition(predicate, { timeoutMs = 120000, pollMs = 1000, port = 57525 } = {}) {
  const startedAt = Date.now();
  return new Promise((resolve, reject) => {
    const tick = async () => {
      if (Date.now() - startedAt > timeoutMs) {
        reject(new Error(`runtime condition timed out after ${timeoutMs}ms`));
        return;
      }
      try {
        const response = await requestHttpJson({ method: "GET", path: "/api/runtime", timeoutMs: 15000, port });
        if (response.statusCode === 200 && response.json && predicate(response.json)) {
          resolve(response.json);
          return;
        }
      } catch {
        // keep polling
      }
      setTimeout(tick, pollMs);
    };
    tick().catch(reject);
  });
}

async function startHarnessServer({ port = 57525, extraEnv = null } = {}) {
  const additionalEnv = extraEnv && typeof extraEnv === "object" ? extraEnv : null;
  const env = {
    CODEX_AUTO_OPEN_BROWSER: "0",
    CODEX_UI_PORT: String(port),
    CODEX_EXECUTION_PROFILE: "smoke-test",
    CODEX_DEFAULT_EXEC_AGENT: "intake",
    CODEX_REQUEST_USER_INPUT_POLICY: "blocked",
    CODEX_ADVERSARIAL_SHADOW_ENABLED: "0",
    CODEX_ADVERSARIAL_LOOP_ENABLED: "0",
    CODEX_APP_SERVER_TRANSPORT: "mock-fixture",
    ...(additionalEnv || {}),
  };
  return startInProcessHarnessServer(env);
}

function extractExecOutput(events) {
  const source = Array.isArray(events) ? events : [];
  let deltaText = "";
  let finalText = "";
  for (const event of source) {
    if (!event || typeof event !== "object") {
      continue;
    }
    if (event.type === "delta" && typeof event.delta === "string") {
      deltaText += event.delta;
      continue;
    }
    if (event.type === "final") {
      if (typeof event.text === "string" && event.text.trim()) {
        finalText = event.text;
        continue;
      }
      if (event.final && typeof event.final.text === "string" && event.final.text.trim()) {
        finalText = event.final.text;
        continue;
      }
      if (typeof event.output === "string" && event.output.trim()) {
        finalText = event.output;
      }
      continue;
    }
    if (event.type === "item" && event.item && typeof event.item === "object") {
      const item = event.item;
      if (typeof item.text === "string" && item.text.trim()) {
        finalText = item.text;
      } else if (typeof item.content === "string" && item.content.trim()) {
        finalText = item.content;
      } else if (Array.isArray(item.contentItems)) {
        for (const contentItem of item.contentItems) {
          if (
            contentItem &&
            typeof contentItem === "object" &&
            typeof contentItem.text === "string" &&
            contentItem.text.trim()
          ) {
            finalText = contentItem.text;
            break;
          }
        }
      }
    }
  }
  const output = finalText && finalText.trim() ? finalText.trim() : deltaText.trim();
  return output;
}

async function runRbjRequirementDemoCase({ label, rbjEnabled, port, prompt }) {
  const extraEnv = {
    CODEX_EXECUTION_PROFILE: "full-runtime",
    CODEX_DEFAULT_EXEC_AGENT: "intake",
    CODEX_REQUEST_USER_INPUT_POLICY: "auto-default",
    CODEX_ADVERSARIAL_SHADOW_ENABLED: "0",
    CODEX_ADVERSARIAL_LOOP_ENABLED: "0",
    CODEX_REQUIREMENT_GUARD_ENABLED: "1",
    CODEX_REQUIREMENT_LOCK_ENABLED: "1",
    CODEX_SCOPE_EXPANSION_ENABLED: "1",
    CODEX_REQUIREMENT_RBJ_ENABLED: rbjEnabled ? "1" : "0",
    CODEX_REQUIREMENT_RBJ_MAX_QUESTIONS: "3",
    CODEX_REQUIREMENT_RBJ_MAX_REVISIONS: "2",
  };
  let harnessProcess = null;
  try {
    harnessProcess = await startHarnessServer({ port, extraEnv });
    const runtimeReady = await waitForRuntimeCondition((runtime) => runtime && runtime.mode === "app-server", {
      timeoutMs: 90000,
      pollMs: 800,
      port,
    });
    const controlApi = runtimeReady && runtimeReady.controlApi && typeof runtimeReady.controlApi === "object" ? runtimeReady.controlApi : null;
    const token =
      controlApi && typeof controlApi.token === "string" ? controlApi.token.trim() : "";
    const tokenHeader =
      controlApi && typeof controlApi.tokenHeader === "string" && controlApi.tokenHeader.trim()
        ? controlApi.tokenHeader.trim()
        : "x-codex-control-token";
    if (!token) {
      throw new Error(`rbj demo (${label}) runtime control token missing`);
    }
    const localOriginHeaders = {
      Origin: `http://127.0.0.1:${port}`,
    };
    const authenticatedExecHeaders = {
      ...localOriginHeaders,
      [tokenHeader]: token,
    };
    const execResult = await runExecViaHttp({
      prompt,
      timeoutMs: 240000,
      port,
      headers: authenticatedExecHeaders,
    });
    const output = extractExecOutput(execResult.events);
    const requirementGuard =
      runtimeReady && runtimeReady.requirementGuard && typeof runtimeReady.requirementGuard === "object"
        ? runtimeReady.requirementGuard
        : null;
    const rbjRuntime =
      requirementGuard && requirementGuard.rbj && typeof requirementGuard.rbj === "object"
        ? requirementGuard.rbj
        : null;
    return {
      label,
      rbjEnabled: rbjEnabled ? 1 : 0,
      rbjRuntimeEnabled: rbjRuntime && rbjRuntime.enabled ? 1 : 0,
      eventCount: Array.isArray(execResult.events) ? execResult.events.length : 0,
      output,
    };
  } finally {
    await stopHarnessHandle(harnessProcess);
  }
}

async function runRbjRequirementDemo() {
  const prompt =
    "WEB開発して！企業向けの！今回は要件定義フェーズだけで止めてください。出力順は 1) Blue 初回案 2) Red監査 3) Red反映後の改善案。実装作業はしないこと。";
  const warmupClient = new CodexAppServerClient(workspaceRoot);
  try {
    await warmupClient.start();
    await warmupClient.request(
      "initialize",
      {
        clientInfo: {
          name: "rbj-demo-warmup",
          title: "RBJ Demo Warmup",
          version: "1.0.0",
        },
        capabilities: { experimentalApi: false },
      },
      20000
    );
    warmupClient.notify("initialized");
  } finally {
    warmupClient.stop();
  }
  const before = await runRbjRequirementDemoCase({
    label: "before",
    rbjEnabled: false,
    port: 57545,
    prompt,
  });
  const after = await runRbjRequirementDemoCase({
    label: "after",
    rbjEnabled: true,
    port: 57546,
    prompt,
  });
  const payload = {
    generatedAt: new Date().toISOString(),
    prompt,
    before,
    after,
  };
  const outPath = path.join(workspaceRoot, "logs", "rbj_requirement_demo.json");
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(payload, null, 2), "utf8");
  console.log(`[rbj-demo] wrote ${outPath}`);
  console.log("PASS");
  return 0;
}

async function run() {
  if (rbjDemoMode) {
    return runRbjRequirementDemo();
  }
  const client = new CodexAppServerClient(workspaceRoot);
  const testStartAt = Date.now();
  let unsubscribeNotification = null;
  let harnessProcess = null;
  try {
    try {
      console.log("[smoke] 1/7 start codex app-server");
      await client.start();

      console.log("[smoke] 2/7 initialize + initialized");
      await client.request(
        "initialize",
        {
          clientInfo: {
            name: "codex-app-server-smoke",
            title: "Codex App Server Smoke Test",
            version: "1.0.0",
          },
          capabilities: { experimentalApi: false },
        },
        20000
      );
      client.notify("initialized");

      console.log("[smoke] 3/7 thread/start");
      const threadStart = await client.request(
        "thread/start",
        {
          cwd: workspaceRoot,
          approvalPolicy: "never",
          sandbox: "workspace-write",
          config: { web_search: "disabled" },
        },
        45000
      );
      const threadId =
        threadStart && threadStart.thread && typeof threadStart.thread.id === "string"
          ? threadStart.thread.id
          : null;
      if (!threadId) {
        throw new Error("thread/start did not return thread id");
      }

      console.log("[smoke] 4/7 turn/start");
      const commandStartDeferred = createDeferred("commandExecution start", 120000);
      const turnCompletedDeferred = createDeferred("turn/completed notification", 180000);
      let turnId = null;
      let interruptSent = false;
      let interruptRequestPromise = null;

      unsubscribeNotification = client.onNotification((message) => {
        const params = message && typeof message.params === "object" ? message.params : {};
        if (params.threadId !== threadId) {
          return;
        }

        if (message.method === "item/started") {
          const item = params.item;
          if (!item || item.type !== "commandExecution") {
            return;
          }
          const eventTurnId = typeof params.turnId === "string" ? params.turnId : null;
          if (turnId && eventTurnId && eventTurnId !== turnId) {
            return;
          }
          if (!turnId && eventTurnId) {
            turnId = eventTurnId;
          }
          commandStartDeferred.resolve(item);
        }

        if (message.method === "turn/completed") {
          const turn = params.turn;
          const completedTurnId = turn && typeof turn.id === "string" ? turn.id : null;
          if (turnId && completedTurnId && completedTurnId !== turnId) {
            return;
          }
          if (!turnId && completedTurnId) {
            turnId = completedTurnId;
          }
          if (!interruptSent && (!interruptRequestPromise || typeof turnId !== "string")) {
            commandStartDeferred.reject(
              new Error("turn completed before commandExecution start was observed")
            );
          }
          turnCompletedDeferred.resolve(turn);
        }
      });

      const longRunningCommand = 'node -e "setTimeout(()=>{}, 10000)"';
      const prompt = [
        "Run the following command as your very first command and do not run any other command before it:",
        longRunningCommand,
        "Once started, do not stop it yourself. Wait for interruption.",
        "After interruption, briefly confirm that it was interrupted.",
      ].join("\n");

      const turnStart = await client.request(
        "turn/start",
        {
          threadId,
          approvalPolicy: "never",
          cwd: workspaceRoot,
          input: [{ type: "text", text: prompt, text_elements: [] }],
        },
        120000
      );
      const responseTurnId =
        turnStart && turnStart.turn && typeof turnStart.turn.id === "string" ? turnStart.turn.id : null;
      if (!responseTurnId) {
        throw new Error("turn/start did not return turn id");
      }
      turnId = responseTurnId;

      const commandItem = await commandStartDeferred.promise;
      const commandText = typeof commandItem.command === "string" ? commandItem.command : "(unknown)";
      console.log(`[smoke] 5/7 command started: ${commandText}`);
      if (!isExpectedLongRunningCommand(commandText)) {
        throw new Error(`unexpected first command: ${commandText}`);
      }

      await sleep(1000);
      console.log("[smoke] 6/7 send turn/interrupt");
      interruptRequestPromise = client.request("turn/interrupt", { threadId, turnId }, 15000);
      await interruptRequestPromise;
      interruptSent = true;

      const completedTurn = await turnCompletedDeferred.promise;
      const status = completedTurn && typeof completedTurn.status === "string" ? completedTurn.status : null;
      console.log(`[smoke] 7/7 turn/completed status=${status || "unknown"}`);

      if (status !== "interrupted") {
        throw new Error(`expected turn.status to be "interrupted", got "${status || "unknown"}"`);
      }
    } catch (error) {
      if (!isSpawnPermissionError(error)) {
        throw error;
      }
      console.log("[smoke] sandbox blocks direct codex app-server spawn; skipping steps 1/7-7/7");
    }

    const harnessPort = await pickAvailablePort(57535);
    console.log(`[smoke] 8/25 start local harness server (/api/runtime) port=${harnessPort}`);
    harnessProcess = await startHarnessServer({
      port: harnessPort,
      extraEnv: {
        CODEX_REQUIREMENT_GUARD_ENABLED: "0",
        CODEX_OPENAI_BLOG_LEARNING_ENABLED: "0",
        CODEX_ANTHROPIC_ENGINEERING_LEARNING_ENABLED: "0",
      },
    });
    const runtimeReady = await waitForRuntimeCondition((runtime) => runtime && runtime.mode === "app-server", {
      timeoutMs: 90000,
      pollMs: 1000,
      port: harnessPort,
    });
    if (!Object.prototype.hasOwnProperty.call(runtimeReady, "latest_turn")) {
      throw new Error("runtime did not expose latest_turn field");
    }
    if (!runtimeReady.requirementGuard || typeof runtimeReady.requirementGuard !== "object") {
      throw new Error("runtime did not expose requirementGuard snapshot");
    }
    if (runtimeReady.requirementGuard.defaultEnabled !== false) {
      throw new Error("runtime requirementGuard.defaultEnabled was not false");
    }
    if (runtimeReady.requirementGuard.enabled !== false) {
      throw new Error("runtime requirementGuard.enabled was not false");
    }
    if (!runtimeReady.phase_status || typeof runtimeReady.phase_status !== "object") {
      throw new Error("runtime did not expose phase_status");
    }
    if (typeof runtimeReady.phase_status.requirementFoundationV1 !== "string" || !runtimeReady.phase_status.requirementFoundationV1) {
      throw new Error("runtime phase_status did not expose requirementFoundationV1");
    }
    if (typeof runtimeReady.phase_status.auditReportPath !== "string" || !runtimeReady.phase_status.auditReportPath) {
      throw new Error("runtime phase_status did not expose auditReportPath");
    }
    if (!runtimeReady.external_learning || typeof runtimeReady.external_learning !== "object") {
      throw new Error("runtime did not expose external_learning");
    }
    if (runtimeReady.external_learning.enabled !== false) {
      throw new Error("runtime external_learning.enabled was not false when disabled by env");
    }
    if (typeof runtimeReady.external_learning.ledgerPath !== "string" || !runtimeReady.external_learning.ledgerPath) {
      throw new Error("runtime external_learning did not expose ledgerPath");
    }
    if (!runtimeReady.external_learning.runtimeRetrieval || typeof runtimeReady.external_learning.runtimeRetrieval !== "object") {
      throw new Error("runtime external_learning did not expose runtimeRetrieval");
    }
    if (runtimeReady.external_learning.runtimeRetrieval.enabled !== false) {
      throw new Error("runtime external_learning.runtimeRetrieval.enabled was not false when global learning was disabled");
    }
    if (!runtimeReady.external_learning.selfImprovement || typeof runtimeReady.external_learning.selfImprovement !== "object") {
      throw new Error("runtime external_learning did not expose selfImprovement");
    }
    if (runtimeReady.external_learning.selfImprovement.enabled !== false) {
      throw new Error("runtime external_learning.selfImprovement.enabled was not false when global learning was disabled");
    }
    if (!runtimeReady.secondary_learning || typeof runtimeReady.secondary_learning !== "object") {
      throw new Error("runtime did not expose secondary_learning");
    }
    if (!runtimeReady.secondary_learning.anthropic_engineering || typeof runtimeReady.secondary_learning.anthropic_engineering !== "object") {
      throw new Error("runtime secondary_learning did not expose anthropic_engineering");
    }
    if (runtimeReady.secondary_learning.anthropic_engineering.enabled !== false) {
      throw new Error("runtime secondary_learning.anthropic_engineering.enabled was not false when disabled by env");
    }
    if (typeof runtimeReady.secondary_learning.anthropic_engineering.curatedDocPath !== "string" || !runtimeReady.secondary_learning.anthropic_engineering.curatedDocPath) {
      throw new Error("runtime secondary_learning.anthropic_engineering did not expose curatedDocPath");
    }
    if (!runtimeReady.secondary_learning.anthropic_engineering.selfImprovement || typeof runtimeReady.secondary_learning.anthropic_engineering.selfImprovement !== "object") {
      throw new Error("runtime secondary_learning.anthropic_engineering did not expose selfImprovement");
    }
    if (runtimeReady.secondary_learning.anthropic_engineering.selfImprovement.enabled !== false) {
      throw new Error("runtime secondary_learning.anthropic_engineering.selfImprovement.enabled was not false when disabled by env");
    }
    if (!runtimeReady.adversarialShadow || typeof runtimeReady.adversarialShadow !== "object") {
      throw new Error("runtime did not expose adversarialShadow snapshot");
    }
    const adversarialShadow = runtimeReady.adversarialShadow;
    if (!adversarialShadow.loop || typeof adversarialShadow.loop !== "object") {
      throw new Error("runtime adversarialShadow did not expose loop config");
    }
    if (!Object.prototype.hasOwnProperty.call(adversarialShadow.loop, "maxRetries")) {
      throw new Error("runtime adversarialShadow.loop missing maxRetries");
    }
    const controlApi = runtimeReady && runtimeReady.controlApi && typeof runtimeReady.controlApi === "object" ? runtimeReady.controlApi : null;
    const controlToken =
      controlApi && typeof controlApi.token === "string" ? controlApi.token.trim() : "";
    const controlHeaderName =
      controlApi && typeof controlApi.tokenHeader === "string" && controlApi.tokenHeader.trim()
        ? controlApi.tokenHeader.trim()
        : "x-codex-control-token";
    if (!controlToken) {
      throw new Error("runtime did not expose controlApi.token");
    }
    const localOriginHeaders = {
      Origin: `http://127.0.0.1:${harnessPort}`,
    };
    const authenticatedExecHeaders = {
      ...localOriginHeaders,
      [controlHeaderName]: controlToken,
    };
    const intentProfileRes = await requestHttpJson({
      method: "GET",
      path: "/api/intent/profile",
      timeoutMs: 15000,
      port: harnessPort,
      headers: localOriginHeaders,
    });
    if (!intentProfileRes.json || intentProfileRes.json.ok !== true || !intentProfileRes.json.intentFirst) {
      throw new Error("GET /api/intent/profile did not return intentFirst");
    }
    const intentPatchRes = await requestHttpJson({
      method: "POST",
      path: "/api/intent/profile",
      timeoutMs: 15000,
      port: harnessPort,
      headers: {
        ...authenticatedExecHeaders,
        "Content-Type": "application/json",
      },
      body: {
        action: "update_intent_profile",
        profile: {
          label: "smoke-profile",
          northStar: ["ship a deliberate result"],
          benchmarkSites: ["https://example.com"],
          prefers: ["realness"],
          rejects: ["template UI"],
          requiredProof: ["desktop screenshot"],
        },
      },
    });
    if (!intentPatchRes.json || intentPatchRes.json.ok !== true || !intentPatchRes.json.intentFirst) {
      throw new Error("POST /api/intent/profile did not return updated intentFirst");
    }
    const intentResetRes = await requestHttpJson({
      method: "POST",
      path: "/api/intent/profile/reset",
      timeoutMs: 15000,
      port: harnessPort,
      headers: {
        ...authenticatedExecHeaders,
        "Content-Type": "application/json",
      },
      body: {
        action: "reset_intent_profile",
      },
    });
    if (!intentResetRes.json || intentResetRes.json.ok !== true || !intentResetRes.json.intentFirst) {
      throw new Error("POST /api/intent/profile/reset did not return intentFirst");
    }
    const evidenceArtifacts =
      runtimeReady && runtimeReady.evidenceArtifacts && typeof runtimeReady.evidenceArtifacts === "object"
        ? runtimeReady.evidenceArtifacts
        : null;
    if (!evidenceArtifacts) {
      throw new Error("runtime did not expose evidenceArtifacts");
    }
    if (!Number.isFinite(Number(evidenceArtifacts.maxBytes)) || Number(evidenceArtifacts.maxBytes) <= 0) {
      throw new Error("runtime evidenceArtifacts.maxBytes was not positive");
    }
    if (!Number.isFinite(Number(evidenceArtifacts.maxDays)) || Number(evidenceArtifacts.maxDays) <= 0) {
      throw new Error("runtime evidenceArtifacts.maxDays was not positive");
    }
    const idempotencyRuntime =
      runtimeReady && runtimeReady.idempotency && typeof runtimeReady.idempotency === "object"
        ? runtimeReady.idempotency
        : null;
    if (
      !idempotencyRuntime ||
      !idempotencyRuntime.statusApi ||
      idempotencyRuntime.statusApi.path !== "/api/exec/idempotency/:key"
    ) {
      throw new Error("runtime did not expose idempotency status API capability");
    }
    const executionVisibility =
      runtimeReady && runtimeReady.executionVisibility && typeof runtimeReady.executionVisibility === "object"
        ? runtimeReady.executionVisibility
        : null;
    if (!executionVisibility) {
      throw new Error("runtime did not expose executionVisibility");
    }
    if (executionVisibility.profile !== "smoke-test") {
      throw new Error(`runtime executionVisibility.profile mismatch: ${String(executionVisibility.profile || "unknown")}`);
    }
    if (
      !executionVisibility.fullUtilization ||
      typeof executionVisibility.fullUtilization !== "object" ||
      !Object.prototype.hasOwnProperty.call(executionVisibility.fullUtilization, "ready")
    ) {
      throw new Error("runtime executionVisibility.fullUtilization did not expose readiness");
    }
    const runtimeParentDispatchGuard =
      runtimeReady && runtimeReady.parentDispatchGuard && typeof runtimeReady.parentDispatchGuard === "object"
        ? runtimeReady.parentDispatchGuard
        : null;
    if (!runtimeParentDispatchGuard || typeof runtimeParentDispatchGuard.mode !== "string") {
      throw new Error("runtime did not expose parentDispatchGuard policy snapshot");
    }
    if (
      !executionVisibility.parentDispatchGuard ||
      typeof executionVisibility.parentDispatchGuard !== "object" ||
      typeof executionVisibility.parentDispatchGuard.mode !== "string"
    ) {
      throw new Error("runtime executionVisibility.parentDispatchGuard did not expose policy snapshot");
    }
    if (!runtimeReady.taskOutcomeContract || typeof runtimeReady.taskOutcomeContract !== "object") {
      throw new Error("runtime did not expose taskOutcomeContract");
    }
    if (!Array.isArray(runtimeReady.taskOutcomeContract.statuses) || !runtimeReady.taskOutcomeContract.statuses.includes("NEEDS_INPUT")) {
      throw new Error("runtime taskOutcomeContract did not expose task outcome statuses");
    }
    if (
      !runtimeReady.userFacingResponseContract
      || typeof runtimeReady.userFacingResponseContract !== "object"
      || typeof runtimeReady.userFacingResponseContract.schema !== "string"
      || typeof runtimeReady.userFacingResponseContract.path !== "string"
      || runtimeReady.userFacingResponseContract.closeInPlaceEnabled !== true
    ) {
      throw new Error("runtime did not expose user-facing response contract summary");
    }
    if (
      !Array.isArray(runtimeReady.taskOutcomeContract.reasonMapKeys)
      || !runtimeReady.taskOutcomeContract.reasonMapKeys.includes("intent_*")
      || !runtimeReady.taskOutcomeContract.reasonMapKeys.includes("family_completion_gate_failed")
    ) {
      throw new Error("runtime taskOutcomeContract did not expose family completion failure reasons");
    }
    if (
      !runtimeReady.planningContracts ||
      typeof runtimeReady.planningContracts.familyProfileSchema !== "string" ||
      !Array.isArray(runtimeReady.planningContracts.families) ||
      !runtimeReady.planningContracts.families.includes("web_creative")
    ) {
      throw new Error("runtime did not expose family profile planning contracts");
    }
    if (
      !runtimeReady.intentFirst ||
      typeof runtimeReady.intentFirst !== "object" ||
      !runtimeReady.intentFirst.contract ||
      typeof runtimeReady.intentFirst.contract.schema !== "string" ||
      typeof runtimeReady.intentFirst.contractPath !== "string" ||
      !runtimeReady.intentFirst.tasteMemory ||
      typeof runtimeReady.intentFirst.tasteMemory.activeProfileId !== "string"
    ) {
      throw new Error("runtime did not expose intent-first runtime summary");
    }
    if (
      !runtimeReady.contractSpec ||
      typeof runtimeReady.contractSpec !== "object" ||
      !runtimeReady.contractSpec.taskOutcomeBridge ||
      typeof runtimeReady.contractSpec.taskOutcomeBridge !== "object"
    ) {
      throw new Error("runtime did not expose taskOutcomeBridge on contractSpec");
    }
    if (!runtimeReady.intentFirst || typeof runtimeReady.intentFirst !== "object") {
      throw new Error("runtime did not expose intentFirst");
    }
    if (
      !runtimeReady.intentFirst.tasteMemory ||
      typeof runtimeReady.intentFirst.tasteMemory !== "object" ||
      !runtimeReady.intentFirst.tasteMemory.activeProfile
    ) {
      throw new Error("runtime intentFirst did not expose activeProfile");
    }
    if (
      !runtimeReady.intentFirst.workspaceLock ||
      typeof runtimeReady.intentFirst.workspaceLock !== "object" ||
      runtimeReady.intentFirst.workspaceLock.autoLockRecommended !== true
    ) {
      throw new Error("runtime intentFirst did not expose workspaceLock recommendation");
    }
    const governancePolicy =
      runtimeReady && runtimeReady.governancePolicy && typeof runtimeReady.governancePolicy === "object"
        ? runtimeReady.governancePolicy
        : null;
    if (!governancePolicy || !governancePolicy.contracts || !governancePolicy.contracts.worker) {
      throw new Error("runtime did not expose governancePolicy worker contract");
    }
    if (governancePolicy.contracts.worker.legacyOnly !== true) {
      throw new Error("runtime governancePolicy worker.legacyOnly was not true");
    }
    if (governancePolicy.contracts.worker.requiresParentOverride !== true) {
      throw new Error("runtime governancePolicy worker.requiresParentOverride was not true");
    }
    console.log("[smoke] 9/25 runtime reports latest_turn and artifact/idempotency capability");

    console.log("[smoke] 10/25 check /api/agent-topography excludes retired worker from configured agents");
    const topography = await requestHttpJson({
      method: "GET",
      path: "/api/agent-topography",
      timeoutMs: 30000,
      port: harnessPort,
    });
    if (topography.statusCode !== 200 || !topography.json || !Array.isArray(topography.json.agents)) {
      throw new Error(`expected /api/agent-topography to return configured agents, got HTTP ${topography.statusCode} ${topography.raw || "(empty)"}`);
    }
    const configuredWorker = topography.json.agents.find(
      (agent) => agent && agent.name === "worker" && agent.source === "configured"
    );
    if (configuredWorker) {
      throw new Error("retired worker should not appear as configured runtime agent");
    }

    console.log("[smoke] 11/25 check /api/conversation/runtime app-server metadata");
    const conversationRuntime = await requestHttpJson({
      method: "GET",
      path: "/api/conversation/runtime",
      timeoutMs: 30000,
      port: harnessPort,
    });
    if (conversationRuntime.statusCode !== 200 || !conversationRuntime.json) {
      throw new Error(`expected /api/conversation/runtime to return 200, got HTTP ${conversationRuntime.statusCode} ${conversationRuntime.raw || "(empty)"}`);
    }
    if (conversationRuntime.json.mode !== "app-server") {
      throw new Error(`unexpected conversation runtime mode: ${String(conversationRuntime.json.mode || "unknown")}`);
    }
    if (conversationRuntime.json.provider !== "app-server") {
      throw new Error(`unexpected conversation provider: ${String(conversationRuntime.json.provider || "unknown")}`);
    }
    if (conversationRuntime.json.endpoint !== "POST /api/conversation/direct") {
      throw new Error(`unexpected conversation endpoint: ${String(conversationRuntime.json.endpoint || "unknown")}`);
    }
    if (conversationRuntime.json.configured !== true) {
      throw new Error("expected /api/conversation/runtime configured=true in app-server mode");
    }

    console.log("[smoke] 12/25 check /api/conversation/direct rejects non-json content-type");
    const conversationInvalidContentType = await requestHttpJson({
      method: "POST",
      path: "/api/conversation/direct",
      timeoutMs: 30000,
      port: harnessPort,
      headers: {
        ...localOriginHeaders,
        "Content-Type": "text/plain",
      },
      body: {
        message: "hello",
      },
    });
    if (conversationInvalidContentType.statusCode !== 415 || !conversationInvalidContentType.json) {
      throw new Error(`expected non-json /api/conversation/direct to return 415, got HTTP ${conversationInvalidContentType.statusCode} ${conversationInvalidContentType.raw || "(empty)"}`);
    }

    console.log("[smoke] 13/25 check /api/conversation/direct rejects forbidden origin");
    const conversationForbiddenOrigin = await requestHttpJson({
      method: "POST",
      path: "/api/conversation/direct",
      timeoutMs: 30000,
      port: harnessPort,
      body: {
        message: "hello",
      },
    });
    if (conversationForbiddenOrigin.statusCode !== 403 || !conversationForbiddenOrigin.json) {
      throw new Error(`expected forbidden-origin /api/conversation/direct to return 403, got HTTP ${conversationForbiddenOrigin.statusCode} ${conversationForbiddenOrigin.raw || "(empty)"}`);
    }

    console.log("[smoke] 14/25 check /api/batch/status");
    const pocStatus = await requestHttpJson({
      method: "GET",
      path: "/api/batch/status",
      timeoutMs: 30000,
      port: harnessPort,
    });
    if (pocStatus.statusCode !== 200 || !pocStatus.json || pocStatus.json.ok !== true) {
      throw new Error(`expected /api/batch/status to return ok=true, got HTTP ${pocStatus.statusCode} ${pocStatus.raw || "(empty)"}`);
    }
    if (pocStatus.json.interactivePath !== "POST /api/exec") {
      throw new Error(`unexpected interactivePath: ${String(pocStatus.json.interactivePath || "unknown")}`);
    }
    if (String(pocStatus.json.batchPath || "") !== "POST /api/batch/run") {
      throw new Error(`unexpected batchPath: ${String(pocStatus.json.batchPath || "unknown")}`);
    }
    if (!Array.isArray(pocStatus.json.lastBatchRuns)) {
      throw new Error("poc status did not expose lastBatchRuns");
    }

    console.log("[smoke] 15/25 run mock batch via /api/batch/run");
    const pocBatchRun = await requestHttpJson({
      method: "POST",
      path: "/api/batch/run",
      timeoutMs: 60000,
      port: harnessPort,
      body: {
        prompt: "smoke mock batch run",
        mode: "mock",
        cwd: workspaceRoot,
      },
    });
    if (pocBatchRun.statusCode !== 200 || !pocBatchRun.json || pocBatchRun.json.ok !== true) {
      throw new Error(`expected /api/batch/run to succeed, got HTTP ${pocBatchRun.statusCode} ${pocBatchRun.raw || "(empty)"}`);
    }

    console.log("[smoke] 16/25 check /api/exec guard rejects unauthenticated request");
    const execBlocked = await requestHttpJson({
      method: "POST",
      path: "/api/exec",
      timeoutMs: 30000,
      port: harnessPort,
      headers: localOriginHeaders,
      body: {
        prompt: "Reply with: auth required",
        agentName: "intake",
        sandboxMode: "workspace-write",
        approvalPolicy: "never",
        cwd: workspaceRoot,
        executionProfile: "smoke-test",
        executionIntent: "smoke-http-exec",
        executionSource: "smoke_test",
      },
    });
    if (execBlocked.statusCode !== 403 || !execBlocked.json) {
      throw new Error(`expected unauthenticated /api/exec to return 403, got HTTP ${execBlocked.statusCode} ${execBlocked.raw || "(empty)"}`);
    }

    console.log("[smoke] 17/25 check /api/exec guard rejects non-json content-type");
    const execInvalidContentType = await requestHttpJson({
      method: "POST",
      path: "/api/exec",
      timeoutMs: 30000,
      port: harnessPort,
      headers: {
        ...authenticatedExecHeaders,
        "Content-Type": "text/plain",
      },
      body: {
        prompt: "Reply with: content type required",
        agentName: "intake",
        sandboxMode: "workspace-write",
        approvalPolicy: "never",
        cwd: workspaceRoot,
        executionProfile: "smoke-test",
        executionIntent: "smoke-http-exec",
        executionSource: "smoke_test",
      },
    });
    if (execInvalidContentType.statusCode !== 415 || !execInvalidContentType.json) {
      throw new Error(`expected non-json /api/exec to return 415, got HTTP ${execInvalidContentType.statusCode} ${execInvalidContentType.raw || "(empty)"}`);
    }

    console.log("[smoke] 18/25 check retired worker agent and scoped alias are rejected at /api/exec");
    const retiredWorkerExec = await requestHttpJson({
      method: "POST",
      path: "/api/exec",
      timeoutMs: 30000,
      port: harnessPort,
      headers: authenticatedExecHeaders,
      body: {
        prompt: "Reply with: retired worker route should be rejected.",
        agentName: "worker",
        sandboxMode: "workspace-write",
        approvalPolicy: "never",
        cwd: workspaceRoot,
        executionProfile: "smoke-test",
        executionIntent: "smoke-http-exec",
        executionSource: "smoke_test",
      },
    });
    if (retiredWorkerExec.statusCode !== 400 || !retiredWorkerExec.json || retiredWorkerExec.json.code !== "agent_not_configured") {
      throw new Error(`expected retired worker /api/exec to return 400 agent_not_configured, got HTTP ${retiredWorkerExec.statusCode} ${retiredWorkerExec.raw || "(empty)"}`);
    }
    const retiredWorkerScopedExec = await requestHttpJson({
      method: "POST",
      path: "/api/exec",
      timeoutMs: 30000,
      port: harnessPort,
      headers: authenticatedExecHeaders,
      body: {
        prompt: "Reply with: retired worker scoped route should be rejected.",
        agentName: "worker@chat-legacy",
        sandboxMode: "workspace-write",
        approvalPolicy: "never",
        cwd: workspaceRoot,
        executionProfile: "smoke-test",
        executionIntent: "smoke-http-exec",
        executionSource: "smoke_test",
      },
    });
    if (
      retiredWorkerScopedExec.statusCode !== 400 ||
      !retiredWorkerScopedExec.json ||
      retiredWorkerScopedExec.json.code !== "agent_not_configured"
    ) {
      throw new Error(
        `expected scoped retired worker /api/exec to return 400 agent_not_configured, got HTTP ${retiredWorkerScopedExec.statusCode} ${retiredWorkerScopedExec.raw || "(empty)"}`
      );
    }

    console.log("[smoke] 19/25 single-agent turn record via /api/exec");
    const singleExecResult = await runExecViaHttp({
      prompt: "Reply with: smoke standard exec path.",
      timeoutMs: 180000,
      port: harnessPort,
      headers: authenticatedExecHeaders,
    });
    const singleExecTurnId =
      (singleExecResult.turnStarted && singleExecResult.turnStarted.turnId) ||
      (singleExecResult.turnCompleted && singleExecResult.turnCompleted.turnId) ||
      null;
    const singleExecStatus =
      (singleExecResult.turnCompleted && singleExecResult.turnCompleted.status) ||
      (singleExecResult.statusEvent && singleExecResult.statusEvent.status) ||
      null;
    if (!singleExecTurnId) {
      throw new Error("exec scenario did not report turn id");
    }
    if (!isTerminalStatus(singleExecStatus)) {
      throw new Error(`exec scenario did not end in terminal status: ${singleExecStatus || "unknown"}`);
    }

    const singleExecRuntime = await waitForRuntimeCondition(
      (runtime) => {
        const latest = runtime && runtime.latest_turn;
        return (
          latest &&
          latest.turn_id === singleExecTurnId &&
          latest.terminal_event === "turn/completed" &&
          isTerminalStatus(latest.terminal_status || latest.status)
        );
      },
      { timeoutMs: 120000, pollMs: 1000, port: harnessPort }
    );
    const singleExecLatest = singleExecRuntime.latest_turn;
    console.log(`[smoke] latest_turn status=${singleExecLatest.terminal_status || singleExecLatest.status}`);
    if (
      !singleExecLatest ||
      !singleExecLatest.parent_dispatch_guard ||
      typeof singleExecLatest.parent_dispatch_guard !== "object" ||
      typeof singleExecLatest.parent_dispatch_guard.mode !== "string"
    ) {
      throw new Error("latest_turn did not expose parent_dispatch_guard snapshot");
    }
    if (typeof singleExecLatest.task_outcome_status !== "string" || !singleExecLatest.task_outcome_status) {
      throw new Error("latest_turn did not expose task_outcome_status");
    }
    if (!singleExecLatest.post_lock_drift || typeof singleExecLatest.post_lock_drift !== "object") {
      throw new Error("latest_turn did not expose post_lock_drift");
    }
    if (!singleExecLatest.clause_completion_scorecard || typeof singleExecLatest.clause_completion_scorecard !== "object") {
      throw new Error("latest_turn did not expose clause_completion_scorecard");
    }

    console.log("[smoke] 20/25 verify full turn artifact manifest exists");
    const artifactRecord = findTurnArtifactManifest(singleExecTurnId, {
      maxAgeMs: 15 * 60 * 1000,
      artifactManifestPath:
        singleExecLatest && typeof singleExecLatest.artifact_manifest_path === "string"
          ? singleExecLatest.artifact_manifest_path
          : "",
    });
    if (!artifactRecord || !artifactRecord.manifest) {
      throw new Error(`turn artifact manifest not found for turnId=${singleExecTurnId}`);
    }
    const artifactManifest = artifactRecord.manifest;
    if (!Array.isArray(artifactManifest.artifacts) || artifactManifest.artifacts.length === 0) {
      throw new Error(`turn artifact manifest has no artifacts: ${artifactRecord.path}`);
    }
    const hasEventsArtifact = artifactManifest.artifacts.some((item) => item && item.file === "events.ndjson");
    if (!hasEventsArtifact) {
      throw new Error(`turn artifact manifest missing events.ndjson: ${artifactRecord.path}`);
    }
    if (!artifactManifest.redaction || typeof artifactManifest.redaction !== "object") {
      throw new Error(`turn artifact manifest missing redaction section: ${artifactRecord.path}`);
    }
    if (!Number.isFinite(Number(artifactManifest.redaction.replacements))) {
      throw new Error(`turn artifact manifest redaction.replacements missing: ${artifactRecord.path}`);
    }
    if (
      !artifactManifest.retentionPolicy ||
      !Number.isFinite(Number(artifactManifest.retentionPolicy.maxBytes)) ||
      !Number.isFinite(Number(artifactManifest.retentionPolicy.maxDays))
    ) {
      throw new Error(`turn artifact manifest retention policy missing: ${artifactRecord.path}`);
    }
    if (
      !artifactManifest.terminal ||
      typeof artifactManifest.terminal.taskOutcomeStatus !== "string" ||
      !artifactManifest.terminal.taskOutcomeStatus
    ) {
      throw new Error(`turn artifact manifest missing terminal.taskOutcomeStatus: ${artifactRecord.path}`);
    }
    if (!artifactManifest.execution || typeof artifactManifest.execution !== "object") {
      throw new Error(`turn artifact manifest missing execution section: ${artifactRecord.path}`);
    }
    const artifactExecutionMeta =
      artifactManifest.execution && artifactManifest.execution.meta && typeof artifactManifest.execution.meta === "object"
        ? artifactManifest.execution.meta
        : null;
    if (!artifactExecutionMeta) {
      throw new Error(`turn artifact manifest missing execution.meta: ${artifactRecord.path}`);
    }
    const artifactExecutionProfile =
      artifactExecutionMeta.profile && typeof artifactExecutionMeta.profile === "object"
        ? artifactExecutionMeta.profile.effective
        : "";
    if (artifactExecutionProfile !== "smoke-test") {
      throw new Error(`turn artifact manifest execution profile mismatch: ${String(artifactExecutionProfile || "unknown")}`);
    }
    const artifactObserved =
      artifactManifest.execution && artifactManifest.execution.observed && typeof artifactManifest.execution.observed === "object"
        ? artifactManifest.execution.observed
        : null;
    if (!artifactObserved || !Number.isFinite(Number(artifactObserved.collabCalls))) {
      throw new Error(`turn artifact manifest missing execution.observed counters: ${artifactRecord.path}`);
    }
    if (
      !Number.isFinite(Number(artifactObserved.dispatchSuccessCount)) ||
      !Number.isFinite(Number(artifactObserved.dispatchFailureCount))
    ) {
      throw new Error(`turn artifact manifest missing dispatch success or failure counters: ${artifactRecord.path}`);
    }

    console.log("[smoke] 21/25 check /api/exec idempotency duplicate completed returns 200");
    const idempotencyKey = `smoke-idem-${Date.now()}`;
    const initialIdempotentRun = await runExecViaHttp({
      prompt: "Reply with: idempotency baseline completed.",
      timeoutMs: 180000,
      port: harnessPort,
      idempotencyKey,
      headers: authenticatedExecHeaders,
    });
    const duplicateExec = await requestHttpJson({
      method: "POST",
      path: "/api/exec",
      timeoutMs: 30000,
      port: harnessPort,
      headers: {
        ...authenticatedExecHeaders,
        "idempotency-key": idempotencyKey,
      },
      body: {
        prompt: "Reply with: idempotency baseline completed.",
        agentName: "intake",
        sandboxMode: "workspace-write",
        approvalPolicy: "never",
        cwd: workspaceRoot,
        executionProfile: "smoke-test",
        executionIntent: "smoke-http-exec",
      executionSource: "smoke_test",
      },
    });
    if (duplicateExec.statusCode !== 200 || !duplicateExec.json) {
      throw new Error(`expected duplicate terminal idempotency request to return 200, got HTTP ${duplicateExec.statusCode} ${duplicateExec.raw || "(empty)"}`);
    }
    const duplicateResolvedStatus =
      duplicateExec.json &&
      duplicateExec.json.idempotency &&
      typeof duplicateExec.json.idempotency.lifecycleState === "string" &&
      duplicateExec.json.idempotency.lifecycleState.trim()
        ? duplicateExec.json.idempotency.lifecycleState.trim()
        : "";
    if (!isTerminalStatus(duplicateResolvedStatus)) {
      throw new Error(`duplicate idempotency replay did not expose a terminal lifecycle state: ${duplicateResolvedStatus || "unknown"}`);
    }
    if (
      !duplicateExec.json.idempotency ||
      duplicateExec.json.idempotency.state !== duplicateResolvedStatus ||
      duplicateExec.json.duplicate !== true
    ) {
      throw new Error("duplicate idempotency payload did not preserve its resolved terminal state");
    }
    if (
      duplicateExec.json.idempotency.lifecycleState !== duplicateResolvedStatus ||
      !duplicateExec.json.idempotency.lifecycle ||
      duplicateExec.json.idempotency.lifecycle.state !== duplicateResolvedStatus ||
      duplicateExec.json.idempotency.lifecycle.terminal !== 1 ||
      duplicateExec.json.idempotency.lifecycle.responseClosed !== 1 ||
      duplicateExec.json.idempotency.lifecycle.responseCloseDisposition !== "post_terminal" ||
      duplicateExec.json.idempotency.terminalStatus !== duplicateResolvedStatus
    ) {
      throw new Error("duplicate completed idempotency payload did not expose separated lifecycle and resolved terminal status");
    }
    if (!Object.prototype.hasOwnProperty.call(duplicateExec.json, "ok")) {
      throw new Error("duplicate idempotency payload did not expose ok");
    }
    if (duplicateResolvedStatus === "completed" && duplicateExec.json.ok !== true) {
      throw new Error("duplicate idempotency replay lost ok=true for completed status");
    }
    if (duplicateResolvedStatus !== "completed" && duplicateExec.json.ok !== false) {
      throw new Error("duplicate idempotency replay should expose ok=false for non-completed terminal status");
    }
    const mismatchedDuplicateExec = await requestHttpJson({
      method: "POST",
      path: "/api/exec",
      timeoutMs: 30000,
      port: harnessPort,
      headers: {
        ...authenticatedExecHeaders,
        "idempotency-key": idempotencyKey,
      },
      body: {
        prompt: "Reply with: idempotency changed payload.",
        agentName: "intake",
        sandboxMode: "workspace-write",
        approvalPolicy: "never",
        cwd: workspaceRoot,
        executionProfile: "smoke-test",
        executionIntent: "smoke-http-exec",
        executionSource: "smoke_test",
      },
    });
    if (mismatchedDuplicateExec.statusCode !== 409 || !mismatchedDuplicateExec.json || mismatchedDuplicateExec.json.ok !== false) {
      throw new Error(`expected mismatched idempotency request to return 409, got HTTP ${mismatchedDuplicateExec.statusCode} ${mismatchedDuplicateExec.raw || "(empty)"}`);
    }
    if (
      mismatchedDuplicateExec.json.code !== "idempotency_request_hash_mismatch" ||
      mismatchedDuplicateExec.json.reason !== "request_hash_mismatch" ||
      mismatchedDuplicateExec.json.error !== "idempotency request hash mismatch" ||
      mismatchedDuplicateExec.json.duplicate !== true
    ) {
      throw new Error("mismatched idempotency request did not return machine-readable conflict details");
    }
    if (
      !mismatchedDuplicateExec.json.idempotency ||
      mismatchedDuplicateExec.json.idempotency.lifecycleState !== duplicateResolvedStatus ||
      !mismatchedDuplicateExec.json.idempotency.lifecycle ||
      mismatchedDuplicateExec.json.idempotency.lifecycle.state !== duplicateResolvedStatus ||
      mismatchedDuplicateExec.json.idempotency.terminalStatus !== duplicateResolvedStatus
    ) {
      throw new Error("mismatched idempotency request did not preserve separated lifecycle and outcome snapshot");
    }
    if (
      typeof mismatchedDuplicateExec.json.requestHash !== "string" ||
      !mismatchedDuplicateExec.json.requestHash ||
      typeof mismatchedDuplicateExec.json.existingRequestHash !== "string" ||
      !mismatchedDuplicateExec.json.existingRequestHash ||
      mismatchedDuplicateExec.json.requestHash === mismatchedDuplicateExec.json.existingRequestHash
    ) {
      throw new Error("mismatched idempotency request did not expose differing request hashes");
    }

    console.log("[smoke] 22/25 check /api/exec/idempotency/:key lookup");
    const idempotencyLookup = await requestHttpJson({
      method: "GET",
      path: `/api/exec/idempotency/${encodeURIComponent(idempotencyKey)}?wait_ms=1000`,
      timeoutMs: 30000,
      port: harnessPort,
      headers: authenticatedExecHeaders,
    });
    if (idempotencyLookup.statusCode !== 200 || !idempotencyLookup.json || idempotencyLookup.json.ok !== true) {
      throw new Error(`expected idempotency status lookup to return 200, got HTTP ${idempotencyLookup.statusCode} ${idempotencyLookup.raw || "(empty)"}`);
    }
    if (
      !idempotencyLookup.json.idempotency ||
      idempotencyLookup.json.idempotency.key !== idempotencyKey ||
      idempotencyLookup.json.idempotency.state !== duplicateResolvedStatus
    ) {
      throw new Error("idempotency status lookup did not return the resolved snapshot");
    }
    if (
      idempotencyLookup.json.idempotency.lifecycleState !== duplicateResolvedStatus ||
      !idempotencyLookup.json.idempotency.lifecycle ||
      idempotencyLookup.json.idempotency.lifecycle.state !== duplicateResolvedStatus ||
      idempotencyLookup.json.idempotency.lifecycle.terminal !== 1 ||
      !idempotencyLookup.json.idempotency.outcome ||
      idempotencyLookup.json.idempotency.outcome.status !== duplicateResolvedStatus ||
      idempotencyLookup.json.idempotency.terminalStatus !== duplicateResolvedStatus
    ) {
      throw new Error("idempotency lookup did not preserve separated terminal lifecycle and resolved outcome status");
    }
    const initialTurnId =
      (initialIdempotentRun.turnCompleted && initialIdempotentRun.turnCompleted.turnId) ||
      (initialIdempotentRun.turnStarted && initialIdempotentRun.turnStarted.turnId) ||
      "";
    if (
      idempotencyLookup.json.idempotency.outcome &&
      initialTurnId &&
      idempotencyLookup.json.idempotency.outcome.turnId &&
      idempotencyLookup.json.idempotency.outcome.turnId !== initialTurnId
    ) {
      throw new Error("idempotency lookup returned unexpected turnId");
    }

    console.log("[smoke] 23/25 check /api/open-cmd guard rejects unauthenticated request");
    const openCmdBlocked = await requestHttpJson({
      method: "POST",
      path: "/api/open-cmd",
      timeoutMs: 30000,
      port: harnessPort,
      headers: localOriginHeaders,
      body: {
        action: "open_workspace_shell",
      },
    });
    if (openCmdBlocked.statusCode !== 403 || !openCmdBlocked.json) {
      throw new Error(`expected unauthenticated /api/open-cmd to return 403, got HTTP ${openCmdBlocked.statusCode} ${openCmdBlocked.raw || "(empty)"}`);
    }

    console.log("[smoke] 24/25 check unauthenticated idempotency lookup is blocked");
    const blockedLookup = await requestHttpJson({
      method: "GET",
      path: `/api/exec/idempotency/${encodeURIComponent(idempotencyKey)}`,
      timeoutMs: 30000,
      port: harnessPort,
      headers: localOriginHeaders,
    });
    if (blockedLookup.statusCode !== 403 || !blockedLookup.json) {
      throw new Error(`expected unauthenticated idempotency lookup to return 403, got HTTP ${blockedLookup.statusCode} ${blockedLookup.raw || "(empty)"}`);
    }

    console.log("[smoke] 25/25 check unknown API route returns 404");
    const unknownApi = await requestHttpJson({
      method: "POST",
      path: "/api/not-implemented",
      timeoutMs: 30000,
      port: harnessPort,
      body: {},
    });
    if (unknownApi.statusCode !== 404 || !unknownApi.json) {
      throw new Error(`expected unknown API to return 404, got HTTP ${unknownApi.statusCode} ${unknownApi.raw || "(empty)"}`);
    }
    const elapsedMs = Date.now() - testStartAt;
    console.log(`[smoke] elapsed=${elapsedMs}ms`);
    console.log("PASS");
    return 0;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.log(`[smoke] error: ${message}`);
    console.log("FAIL");
    return 1;
  } finally {
    if (typeof unsubscribeNotification === "function") {
      unsubscribeNotification();
    }
    client.stop();
    await stopHarnessHandle(harnessProcess);
  }
}

run()
  .then((code) => {
    process.exitCode = code;
  })
  .catch((error) => {
    console.log(`[smoke] fatal: ${error instanceof Error ? error.message : String(error)}`);
    console.log("FAIL");
    process.exitCode = 1;
  });


