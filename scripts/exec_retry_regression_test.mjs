const assert = (await import("node:assert/strict")).default;
const fs = (await import("node:fs")).default;
const path = (await import("node:path")).default;
const { createRequire } = await import("node:module");
const { fileURLToPath } = await import("node:url");

const workspaceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const { resolveServerImplementationPath } = require("./lib/server_source_path.js");

function read(relPath) {
  return fs.readFileSync(path.join(workspaceRoot, relPath), "utf8");
}

const app = read(path.join("web", "01.HarnesUI", "app.js"));
const html = read(path.join("web", "01.HarnesUI", "index.html"));
const { implementationPath: serverPath } = resolveServerImplementationPath(workspaceRoot);
const server = fs.readFileSync(serverPath, "utf8");
const launcher = read("start_codex_ui.bat");

assert.ok(server.includes('const fastModeDefault=parseBooleanEnv(fastModeDefaultEnvKey,false);'), "server FastMode default should be OFF");
assert.ok(!html.includes('<input id="fastModeEnabled" type="checkbox" checked>'), "FastMode checkbox should default to unchecked");

assert.ok(app.includes('const EXEC_IDEMPOTENCY_HEADER="Idempotency-Key";'), "UI should define the exec idempotency header");
assert.ok(app.includes("function buildExecSubmitHeaders(idempotencyKey){"), "UI should rebuild exec submit headers per attempt");
assert.ok(app.includes("await loadRuntime({reconcilePending:false});"), "UI should refresh runtime before retrying");
assert.ok(app.includes('headers[EXEC_IDEMPOTENCY_HEADER]=idempotencyKey;'), "UI should send idempotency header");
assert.ok(app.includes("requestPayload.idempotencyKey=idempotencyKey;"), "UI should send idempotency key in payload");
assert.ok(app.includes('submitExecRequestWithRetry({payload:requestPayload,signal:ctl.signal,out,chatRecord:c})'), "UI should retry exec submits without reusing stale headers");
assert.ok(app.includes("送信に失敗したため"), "UI should surface retry notices to the operator");

assert.ok(launcher.includes('if "%CODEX_FAST_MODE_DEFAULT%"=="" set "CODEX_FAST_MODE_DEFAULT=0"'), "launcher FastMode default should be OFF");
assert.ok(launcher.includes('if "%CODEX_SERVER_RESTART_MAX_RETRIES%"=="" set "CODEX_SERVER_RESTART_MAX_RETRIES=4"'), "launcher should define restart retry budget");
assert.ok(launcher.includes('if "%CODEX_SERVER_RESTART_DELAY_MS%"=="" set "CODEX_SERVER_RESTART_DELAY_MS=1500"'), "launcher should define restart delay");
assert.ok(launcher.includes(':launcher_server_run'), "launcher should run the server through a restart loop");
assert.ok(launcher.includes('auto-restart budget exhausted'), "launcher should report when restart budget is exhausted");

console.log("PASS exec_retry_regression_test");
