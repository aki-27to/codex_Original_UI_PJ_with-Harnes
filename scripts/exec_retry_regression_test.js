#!/usr/bin/env node
"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { resolveServerImplementationPath } = require("./lib/server_source_path");

const workspaceRoot = path.resolve(__dirname, "..");

function read(relPath) {
  return fs.readFileSync(path.join(workspaceRoot, relPath), "utf8");
}

const app = read(path.join("web", "01.HarnesUI", "app.js"));
const html = read(path.join("web", "01.HarnesUI", "index.html"));
const { implementationPath: serverPath } = resolveServerImplementationPath(workspaceRoot);
const server = fs.readFileSync(serverPath, "utf8");
const launcher = read("start_codex_ui.bat");

assert(server.includes('const fastModeDefault=parseBooleanEnv(fastModeDefaultEnvKey,false);'), "server FastMode default should be OFF");
assert(!html.includes('<input id="fastModeEnabled" type="checkbox" checked>'), "FastMode checkbox should default to unchecked");

assert(app.includes('const EXEC_IDEMPOTENCY_HEADER="Idempotency-Key";'), "UI should define the exec idempotency header");
assert(app.includes("function buildExecSubmitHeaders(idempotencyKey){"), "UI should rebuild exec submit headers per attempt");
assert(app.includes("await loadRuntime({reconcilePending:false});"), "UI should refresh runtime before retrying");
assert(app.includes('headers[EXEC_IDEMPOTENCY_HEADER]=idempotencyKey;'), "UI should send idempotency header");
assert(app.includes("requestPayload.idempotencyKey=idempotencyKey;"), "UI should send idempotency key in payload");
assert(app.includes('submitExecRequestWithRetry({payload:requestPayload,signal:ctl.signal,out,chatRecord:c})'), "UI should retry exec submits without reusing stale headers");
assert(app.includes("送信に失敗したため"), "UI should surface retry notices to the operator");

assert(launcher.includes('if "%CODEX_FAST_MODE_DEFAULT%"=="" set "CODEX_FAST_MODE_DEFAULT=0"'), "launcher FastMode default should be OFF");
assert(launcher.includes('if "%CODEX_SERVER_RESTART_MAX_RETRIES%"=="" set "CODEX_SERVER_RESTART_MAX_RETRIES=4"'), "launcher should define restart retry budget");
assert(launcher.includes('if "%CODEX_SERVER_RESTART_DELAY_MS%"=="" set "CODEX_SERVER_RESTART_DELAY_MS=1500"'), "launcher should define restart delay");
assert(launcher.includes(':launcher_server_run'), "launcher should run the server through a restart loop");
assert(launcher.includes('auto-restart budget exhausted'), "launcher should report when restart budget is exhausted");

console.log("PASS exec_retry_regression_test");
