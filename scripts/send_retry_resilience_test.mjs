const assert = await import('node:assert/strict');
const fs = await import('node:fs/promises');
const vm = await import('node:vm');

const repoRoot = new URL('../', import.meta.url);
const appPath = new URL('./../web/01.HarnesUI/app.js', import.meta.url);
const indexPath = new URL('./../web/01.HarnesUI/index.html', import.meta.url);
const serverPath = new URL('./../server.js', import.meta.url);
const launcherPath = new URL('./../start_codex_ui.bat', import.meta.url);

const [appSource, indexSource, serverSource, launcherSource] = await Promise.all([
  fs.readFile(appPath, 'utf8'),
  fs.readFile(indexPath, 'utf8'),
  fs.readFile(serverPath, 'utf8'),
  fs.readFile(launcherPath, 'utf8'),
]);

assert.match(appSource, /const EXEC_IDEMPOTENCY_HEADER="Idempotency-Key";/, 'UI should declare idempotency header constant');
assert.match(appSource, /requestPayload\.idempotencyKey=idempotencyKey;/, 'UI should send idempotency key in request body');
assert.match(appSource, /function buildExecSubmitHeaders\(idempotencyKey\)/, 'UI should centralize submit headers');
assert.match(appSource, /if\(idempotencyKey\)headers\[EXEC_IDEMPOTENCY_HEADER\]=idempotencyKey;/, 'UI should send idempotency key in header');
assert.match(appSource, /function runtimeDefaultFastModeEnabled\(\)\{[\s\S]*fastModeEnabled:false/, 'UI fallback fast-mode default should be off');
assert.match(indexSource, /<input id="fastModeEnabled" type="checkbox">/, 'FastMode checkbox should default to unchecked');
assert.match(serverSource, /const fastModeDefault=parseBooleanEnv\(fastModeDefaultEnvKey,false\);/, 'server fast-mode default should be off');
assert.match(launcherSource, /if "%CODEX_FAST_MODE_DEFAULT%"=="" set "CODEX_FAST_MODE_DEFAULT=0"/, 'launcher fast-mode default should be off');
assert.ok(launcherSource.includes('CODEX_SERVER_RESTART_MAX_RETRIES'), 'launcher should define a restart budget');
assert.ok(launcherSource.includes('CODEX_SERVER_RESTART_DELAY_MS'), 'launcher should define a restart delay');
assert.ok(launcherSource.includes(':launcher_server_run'), 'launcher should label the restart loop');
assert.ok(launcherSource.includes('node "%~dp0server.js"'), 'launcher should still boot server.js directly');
assert.ok(launcherSource.includes('goto launcher_server_run'), 'launcher should re-enter the restart loop after non-zero exit');

const helperStart = appSource.indexOf('function parseJsonSafe(text)');
const helperEnd = appSource.indexOf('function sleepWithSignal(ms,signal){');
assert.ok(helperStart >= 0 && helperEnd > helperStart, 'helper block boundaries should exist');
const helperBlock = appSource.slice(helperStart, helperEnd);

function createHarness(fetchImpl) {
  const notices = [];
  const events = [];
  const context = {
    EXEC_STREAM_CONTENT_TYPE: 'application/x-ndjson',
    EXEC_IDEMPOTENCY_HEADER: 'Idempotency-Key',
    EXEC_SUBMIT_RETRY_DELAYS_MS: Object.freeze([1200, 2400]),
    fetch: fetchImpl,
    controlApiToken: () => 'token-123',
    controlApiTokenHeader: () => 'x-control-token',
    loadRuntime: async () => true,
    t1: (value, cap) => String(value).slice(0, cap),
    madd: (_out, text) => notices.push(String(text)),
    hpush: (_chat, step, detail, status) => events.push({ step, detail, status }),
    renderHarness: () => {},
    sleepWithSignal: async () => {},
    console,
  };
  vm.createContext(context);
  vm.runInContext(`${helperBlock}\nthis.__exports={parseJsonSafe,toArr,createExecIdempotencyKey,buildExecSubmitHeaders,refreshRuntimeForExecRetry,isExecStreamResponse,buildExecResponseError,isTransientExecSubmitError,formatExecSubmitError,submitExecRequestWithRetry,formatRunPromptFailureMessage};`, context);
  return { context, notices, events, api: context.__exports };
}

function streamResponse() {
  return {
    headers: { get: (name) => String(name).toLowerCase() === 'content-type' ? 'application/x-ndjson; charset=utf-8' : '' },
  };
}

function jsonResponse(status, payload) {
  return {
    status,
    headers: { get: (name) => String(name).toLowerCase() === 'content-type' ? 'application/json; charset=utf-8' : '' },
    text: async () => JSON.stringify(payload),
  };
}

{
  let callCount = 0;
  const harness = createHarness(async () => {
    callCount += 1;
    if (callCount === 1) {
      throw new TypeError('Failed to fetch');
    }
    return streamResponse();
  });
  const response = await harness.api.submitExecRequestWithRetry({
    payload: { prompt: 'hello' },
    headers: undefined,
    signal: undefined,
    out: {},
    chatRecord: {},
  });
  assert.equal(callCount, 2, 'transient fetch failure should retry once and then succeed');
  assert.equal(response.headers.get('content-type'), 'application/x-ndjson; charset=utf-8');
  assert.equal(harness.notices.length, 1, 'retry notice should be recorded');
  assert.match(harness.notices[0], /再試行します \(1\/2\)/, 'retry notice should show bounded attempt count');
  assert.equal(harness.events.length, 1, 'retry should emit a harness event');
}

{
  let callCount = 0;
  const harness = createHarness(async () => {
    callCount += 1;
    return jsonResponse(409, {
      duplicate: true,
      error: 'duplicate idempotency key',
      idempotency: { lifecycle: { resolved: 0 } },
    });
  });
  let thrown = null;
  try {
    await harness.api.submitExecRequestWithRetry({
      payload: { prompt: 'hello' },
      headers: undefined,
      signal: undefined,
      out: {},
      chatRecord: {},
    });
  } catch (error) {
    thrown = error;
  }
  assert.ok(thrown, 'duplicate non-stream response should throw');
  assert.equal(callCount, 1, 'duplicate response should not retry');
  assert.equal(thrown.isDuplicate, true, 'duplicate error should be tagged');
  assert.equal(thrown.status, 409, 'duplicate error should retain status');
  assert.equal(harness.notices.length, 0, 'duplicate response should not append retry notices');
  assert.equal(
    harness.api.formatRunPromptFailureMessage(thrown),
    '送信を停止しました: 前回の送信がサーバ側でまだ実行中です。'
  );
}

{
  let callCount = 0;
  const harness = createHarness(async () => {
    callCount += 1;
    throw new TypeError('Failed to fetch');
  });
  let thrown = null;
  try {
    await harness.api.submitExecRequestWithRetry({
      payload: { prompt: 'hello' },
      headers: undefined,
      signal: undefined,
      out: {},
      chatRecord: {},
    });
  } catch (error) {
    thrown = error;
  }
  assert.ok(thrown, 'persistent transient failure should throw');
  assert.equal(callCount, 3, 'persistent transient failure should use initial attempt plus two retries');
  assert.equal(thrown.isTransientSubmitFailure, true, 'persistent transient failure should be wrapped');
  assert.equal(
    harness.api.formatRunPromptFailureMessage(thrown),
    '自動再試行後も送信できませんでした: Failed to fetch'
  );
}

console.log('PASS send_retry_resilience_test');
