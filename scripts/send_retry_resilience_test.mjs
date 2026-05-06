const assert = await import("node:assert/strict");
const fs = await import("node:fs/promises");
const { createRequire } = await import("node:module");
const path = await import("node:path");
const { fileURLToPath } = await import("node:url");
const vm = await import("node:vm");
const require = createRequire(import.meta.url);
const { resolveServerImplementationPath } = require("./lib/server_source_path.js");

const appPath = new URL("./../web/01.HarnesUI/app.js", import.meta.url);
const indexPath = new URL("./../web/01.HarnesUI/index.html", import.meta.url);
const launcherPath = new URL("./../start_codex_ui.bat", import.meta.url);
const workspaceRoot = fileURLToPath(new URL("./..", import.meta.url));
const { implementationPath: serverPath } = resolveServerImplementationPath(workspaceRoot);
const bootstrapPath = path.join(workspaceRoot, "server", "bootstrap.js");

const [appSource, indexSource, serverSource, bootstrapSource, launcherSource] = await Promise.all([
  fs.readFile(appPath, "utf8"),
  fs.readFile(indexPath, "utf8"),
  fs.readFile(serverPath, "utf8"),
  fs.readFile(bootstrapPath, "utf8"),
  fs.readFile(launcherPath, "utf8"),
]);

assert.match(appSource, /const EXEC_IDEMPOTENCY_HEADER="Idempotency-Key";/, "UI should declare idempotency header constant");
assert.match(appSource, /requestPayload\.idempotencyKey=idempotencyKey;/, "UI should send idempotency key in request body");
assert.match(appSource, /function buildExecSubmitHeaders\(idempotencyKey\)/, "UI should centralize submit headers");
assert.match(appSource, /if\(idempotencyKey\)headers\[EXEC_IDEMPOTENCY_HEADER\]=idempotencyKey;/, "UI should send idempotency key in header");
assert.match(appSource, /function recoverExecStreamAfterDisconnect\(\{idempotencyKey,signal,out,chatRecord\}=\{\}\)/, "UI should define a stream recovery helper");
assert.match(appSource, /let streamOpened=false;/, "UI should track whether the stream opened before a disconnect");
assert.match(appSource, /if\(streamOpened&&idempotencyKey&&isTransientExecStreamError\(surfacedError\)\)/, "UI should attempt idempotency-backed recovery after a live stream disconnect");
assert.match(appSource, /function runtimeDefaultFastModeEnabled\(\)\{[\s\S]*fastModeEnabled:false/, "UI fallback fast-mode default should be off");
assert.match(indexSource, /<input id="fastModeEnabled" type="checkbox">/, "Fast mode checkbox should default to unchecked");

assert.match(serverSource, /const fastModeDefault=parseBooleanEnv\(fastModeDefaultEnvKey,false\);/, "server fast-mode default should be off");
assert.match(serverSource, /activeExecRequests:getActiveExecRequestCount\(\)/, "runtime should expose active exec request counts");
assert.match(bootstrapSource, /function isBrokenPipeLikeError\(error\)\s*\{/, "server bootstrap should define a broken-pipe classifier");
assert.match(bootstrapSource, /logOperation\("server\.broken_pipe_ignored"/, "server bootstrap should ignore broken-pipe fatal events");

assert.match(launcherSource, /if "%CODEX_FAST_MODE_DEFAULT%"=="" set "CODEX_FAST_MODE_DEFAULT=0"/, "launcher fast-mode default should be off");
assert.match(launcherSource, /if "%CODEX_RESTART_EXISTING_HARNESS%"=="" set "CODEX_RESTART_EXISTING_HARNESS=1"/, "launcher should restart an existing harness by default so elevation takes effect");
assert.match(launcherSource, /if "%CODEX_AUTO_RESTART_STALE_HARNESS%"=="" set "CODEX_AUTO_RESTART_STALE_HARNESS=1"/, "launcher should auto-restart stale harness instances by default");
assert.match(launcherSource, /if "%CODEX_FORCE_ACTIVE_RESTART%"=="" set "CODEX_FORCE_ACTIVE_RESTART=0"/, "launcher should default forced active restart off");
assert.match(launcherSource, /existing harness detected on port .*reusing without restart/, "launcher should retain the explicit no-restart reuse path");
assert.match(launcherSource, /runtime files are newer than the process; restarting stale harness/, "launcher should auto-restart stale harness processes");
assert.match(launcherSource, /existing harness has active \/api\/exec work; refusing restart while work is in progress/, "launcher should refuse active-turn restarts unless forced");
assert.match(launcherSource, /existing harness is stale but has active \/api\/exec work; reusing until work is idle/, "launcher should not interrupt active work even when the harness is stale");
assert.ok(launcherSource.includes("CODEX_SERVER_RESTART_MAX_RETRIES"), "launcher should define a restart budget");
assert.ok(launcherSource.includes("CODEX_SERVER_RESTART_DELAY_MS"), "launcher should define a restart delay");
assert.ok(launcherSource.includes(":launcher_server_run"), "launcher should label the restart loop");
assert.ok(launcherSource.includes('node "%~dp0server.js"'), "launcher should still boot server.js directly");
assert.ok(launcherSource.includes("goto launcher_server_run"), "launcher should re-enter the restart loop after non-zero exit");

const helperStart = appSource.indexOf("function parseJsonSafe(text)");
const helperEnd = appSource.indexOf("function sleepWithSignal(ms,signal){");
assert.ok(helperStart >= 0 && helperEnd > helperStart, "helper block boundaries should exist");
const helperBlock = appSource.slice(helperStart, helperEnd);

function createHarness(fetchImpl) {
  const notices = [];
  const events = [];
  const context = {
    EXEC_STREAM_CONTENT_TYPE: "application/x-ndjson",
    EXEC_IDEMPOTENCY_HEADER: "Idempotency-Key",
    EXEC_SUBMIT_RETRY_DELAYS_MS: Object.freeze([1200, 2400]),
    fetch: fetchImpl,
    controlApiToken: () => "token-123",
    controlApiTokenHeader: () => "x-control-token",
    workspaceGuardErrorInfoForUi: () => ({ handled: false }),
    loadRuntime: async () => true,
    t1: (value, cap) => String(value).slice(0, cap),
    madd: (_out, text) => notices.push(String(text)),
    hpush: (_chat, step, detail, status) => events.push({ step, detail, status }),
    renderHarness: () => {},
    sleepWithSignal: async () => {},
    console,
  };
  vm.createContext(context);
  vm.runInContext(
    `${helperBlock}\nthis.__exports={buildExecSubmitHeaders,buildExecResponseError,isTransientExecSubmitError,submitExecRequestWithRetry,formatRunPromptFailureMessage};`,
    context
  );
  return { notices, events, api: context.__exports };
}

function streamResponse() {
  return {
    headers: { get: (name) => String(name).toLowerCase() === "content-type" ? "application/x-ndjson; charset=utf-8" : "" },
  };
}

function jsonResponse(status, payload) {
  return {
    status,
    headers: { get: (name) => String(name).toLowerCase() === "content-type" ? "application/json; charset=utf-8" : "" },
    text: async () => JSON.stringify(payload),
  };
}

{
  let callCount = 0;
  const harness = createHarness(async () => {
    callCount += 1;
    if (callCount === 1) {
      throw new TypeError("Failed to fetch");
    }
    return streamResponse();
  });
  const response = await harness.api.submitExecRequestWithRetry({
    payload: { prompt: "hello" },
    signal: undefined,
    out: {},
    chatRecord: {},
  });
  assert.equal(callCount, 2, "transient fetch failure should retry once and then succeed");
  assert.equal(response.headers.get("content-type"), "application/x-ndjson; charset=utf-8");
  assert.equal(harness.notices.length, 1, "retry notice should be recorded");
  assert.equal(harness.events.length, 1, "retry should emit a harness event");
}

{
  let callCount = 0;
  const harness = createHarness(async () => {
    callCount += 1;
    return jsonResponse(409, {
      duplicate: true,
      error: "duplicate idempotency key",
      idempotency: { lifecycle: { resolved: 0 } },
    });
  });
  let thrown = null;
  try {
    await harness.api.submitExecRequestWithRetry({
      payload: { prompt: "hello" },
      signal: undefined,
      out: {},
      chatRecord: {},
    });
  } catch (error) {
    thrown = error;
  }
  assert.ok(thrown, "duplicate non-stream response should throw");
  assert.equal(callCount, 1, "duplicate response should not retry");
  assert.equal(thrown.isDuplicate, true, "duplicate error should be tagged");
  assert.equal(thrown.status, 409, "duplicate error should retain status");
  assert.equal(harness.notices.length, 0, "duplicate response should not append retry notices");
  assert.match(harness.api.formatRunPromptFailureMessage(thrown), /duplicate|running|409|実行中/i, "duplicate response should report the active prior submit");
}

{
  let callCount = 0;
  const harness = createHarness(async () => {
    callCount += 1;
    throw new TypeError("Failed to fetch");
  });
  let thrown = null;
  try {
    await harness.api.submitExecRequestWithRetry({
      payload: { prompt: "hello" },
      signal: undefined,
      out: {},
      chatRecord: {},
    });
  } catch (error) {
    thrown = error;
  }
  assert.ok(thrown, "persistent transient failure should throw");
  assert.equal(callCount, 3, "persistent transient failure should use initial attempt plus two retries");
  assert.equal(thrown.isTransientSubmitFailure, true, "persistent transient failure should be wrapped");
  assert.match(harness.api.formatRunPromptFailureMessage(thrown), /Failed to fetch/, "persistent retry failures should surface the underlying fetch error");
}

console.log("PASS send_retry_resilience_test");
