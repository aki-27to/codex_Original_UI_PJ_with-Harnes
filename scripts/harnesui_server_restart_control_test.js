#!/usr/bin/env node
"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");

const { createControlService } = require("../server/services/control_service");

const workspaceRoot = path.resolve(__dirname, "..");

function read(relPath) {
  return fs.readFileSync(path.join(workspaceRoot, relPath), "utf8");
}

function createServiceHarness({ body, restartResult }) {
  const calls = {
    sent: [],
    restart: [],
  };
  const service = createControlService({
    validateControlMutationRequest(_req, options = {}) {
      const action = String(options.action || "");
      if (options.requireAction && !action) {
        return { ok: false, status: 400, error: "action is required" };
      }
      if (action && action !== "restart_harness_server") {
        return { ok: false, status: 400, error: `unsupported action: ${action}` };
      }
      return { ok: true, status: 200, error: "" };
    },
    sendJson(_res, statusCode, payload) {
      calls.sent.push({ statusCode, payload });
    },
    validateJsonMutationContentType() {
      return { ok: true, status: 200, error: "" };
    },
    execApiRequiredContentType: "application/json",
    readRequestBody() {
      return Promise.resolve(JSON.stringify(body || {}));
    },
    defaultRequestBodyLimitBytes: 1024 * 1024,
    safeString(value, max = 80) {
      return String(value || "").slice(0, max);
    },
    updateIntentProfileStore() {
      return {};
    },
    resetIntentProfileStore() {
      return {};
    },
    lockWorkspaceDirectory() {
      return {};
    },
    unlockWorkspaceDirectory() {
      return {};
    },
    requirementGuardMatcherDefaults: { inputKey: "input_value" },
    evaluateRequirementGuardMatch() {
      return {};
    },
    getRequirementGuardMatcherSnapshot() {
      return {};
    },
    requirementGuardExtensionConfig: { id: "test" },
    requirementGuardOriginalRequirement: "test",
    openCmdWindowEnabled: false,
    logOperation() {},
    requestHeaderValue() {
      return "";
    },
    controlApiTokenHeaderName: "x-codex-control-token",
    openCmdWindow() {},
    requestHarnessServerRestart(options) {
      calls.restart.push(options);
      return restartResult;
    },
  });
  return { service, calls };
}

async function callRestart(harness) {
  await harness.service.handleServerRestartRequest({ req: {}, res: {} });
  assert.strictEqual(harness.calls.sent.length, 1, "restart request should send one response");
  return harness.calls.sent[0];
}

async function main() {
  const indexSource = read("web/01.HarnesUI/index.html");
  const styleSource = read("web/01.HarnesUI/styles.css");
  const appSource = read("web/01.HarnesUI/app.js");
  const appSourceLf = appSource.replace(/\r\n/g, "\n");
  const routeSource = read("server/routes/control_routes.js");
  const serverSource = read("server_impl.js");
  const helperSource = read("scripts/restart_harness_from_ui.js");

  assert(indexSource.includes('id="serverRestartBtn"'), "HarnesUI must expose a restart button");
  assert(styleSource.includes(".topbar-actions"), "restart button must have topbar placement styles");
  assert(appSource.includes('APP_BUNDLE_VERSION="2026-05-17-connection-ready-v1"'), "connection-ready change must bump the app bundle version");
  assert(appSource.includes('e.connectionState.textContent="接続済み"'), "runtime load success must present a stable connected state");
  assert(!appSource.includes('e.connectionState.textContent="接続中"'), "runtime load success must not leave the connection chip looking in-progress");
  assert(appSource.includes('fetch("/api/server/restart"'), "UI must call the restart API");
  assert(appSource.includes('action:"restart_harness_server"'), "UI must send the restart action");
  assert(appSource.includes("timeoutMs=180000"), "UI restart verification must allow slow server startup");
  assert(appSource.includes("fetchTextWithTimeout(\"/api/runtime\""), "UI restart verification must bound each runtime poll");
  assert(appSource.includes("SERVER_RESTART_RESULT_KEY"), "UI must persist restart result across reload");
  assert(appSource.includes("SERVER_RESTART_RESULT_SEEN_KEY"), "UI must dedupe runtime restart results");
  assert(appSource.includes('SERVER_RESTART_RESULT_SEEN_KEY="codex-server-restart-result-seen-v2"'), "restart seen marker must reset after hidden-message rendering fixes");
  assert(appSource.includes("window.localStorage"), "UI restart result must fall back to localStorage");
  assert(appSource.includes('persistServerRestartResultForUi({status:"pending",ok:false,previous,current:null})'), "UI must store pending restart before the server goes away");
  assert(appSource.includes('const result={status:"completed",ok:true,previous,current:restarted}'), "UI must build a completed restart result");
  assert(appSource.includes("addServerRestartResultMessageForUi(result,{force:true})"), "UI must write success to conversation before reload");
  assert(appSource.includes("flushSaveChatState();"), "UI must persist the completion message before reload");
  assert(appSource.includes("persistServerRestartResultForUi(result)"), "UI must keep a reload fallback result");
  assert(appSource.includes("serverRestartResultFromRuntimeForUi"), "UI must recover completion from runtime restart marker");
  assert(appSource.includes("renderServerRestartResultForUi();"), "UI must render restart completion after runtime reconnects");
  assert(appSourceLf.includes("refresh();\n  renderServerRestartResultForUi();"), "runtime load must render restart completion immediately after refresh");
  assert(appSource.includes("isConversationVisibleSystemMessageForUi"), "restart system notifications must be visible in an otherwise empty conversation");
  assert(appSource.includes("Web再起動が完了しました。"), "UI must show a restart completion message");
  assert(appSource.includes("restoreTimelineViewportForUi(s.active,e.timeline)"), "restart completion message must be scrolled into view");
  assert(routeSource.includes('pathname) => pathname === "/api/server/restart"'), "control routes must expose the restart endpoint");
  assert(serverSource.includes('const controlApiActionAllowlist=new Set(["restart_harness_server"])'), "control API must allow restart action");
  assert(serverSource.includes("restart_harness_from_ui.js"), "restart API must use the detached restart helper");
  assert(serverSource.includes("CODEX_RESTART_TARGET_PID"), "restart helper must target the current server pid");
  assert(serverSource.includes("CODEX_RESTART_HELPER_LOG_PATH"), "restart helper must receive a diagnostic log path");
  assert(serverSource.includes("CODEX_RESTART_RESULT_PATH"), "restart helper must receive a runtime-visible result path");
  assert(helperSource.includes("harnesui-server-restart-result.v1"), "helper must write a restart result marker");
  assert(helperSource.includes('status: "relaunch_spawned"'), "helper must record successful relaunch spawn");
  assert(serverSource.includes('path.join(workspaceRoot,"runtime","server_restart_result.json")'), "helper result marker must stay out of logs/current and remain runtime-readable");
  assert(helperSource.includes('CODEX_RESTART_EXISTING_HARNESS: "0"'), "helper relaunch must not re-stop an already stopped server");
  assert(helperSource.includes('CODEX_AUTO_OPEN_BROWSER: "0"'), "UI restart must not open a browser");
  assert(helperSource.includes('CODEX_REQUIRE_ADMIN: "0"'), "UI restart must not trigger elevation");
  assert(helperSource.includes("taskkill.exe"), "helper must force-stop the old pid if graceful stop stalls");
  assert(serverSource.includes("windowsHide:true"), "UI restart launcher must stay hidden");
  assert(serverSource.includes('CODEX_RESTART_FORCE_ACTIVE:restartForce?"1":"0"'), "active work restart must remain opt-in");

  let harness = createServiceHarness({
    body: { action: "restart_harness_server", reason: "test" },
    restartResult: { ok: true, status: "scheduled", code: "scheduled" },
  });
  let response = await callRestart(harness);
  assert.strictEqual(response.statusCode, 202, "scheduled restart should return HTTP 202");
  assert.strictEqual(harness.calls.restart.length, 1, "scheduled restart should call restart handler");
  assert.deepStrictEqual(harness.calls.restart[0], { force: false, reason: "test" });

  harness = createServiceHarness({
    body: { action: "restart_harness_server" },
    restartResult: { ok: false, code: "active_exec", error: "active /api/exec work is in progress" },
  });
  response = await callRestart(harness);
  assert.strictEqual(response.statusCode, 409, "active exec restart should return HTTP 409");
  assert.strictEqual(response.payload.code, "active_exec");

  harness = createServiceHarness({
    body: { action: "delete_everything" },
    restartResult: { ok: true, status: "scheduled" },
  });
  response = await callRestart(harness);
  assert.strictEqual(response.statusCode, 400, "unsupported restart action should be rejected");
  assert.strictEqual(harness.calls.restart.length, 0, "unsupported action must not call restart handler");

  process.stdout.write("PASS harnesui_server_restart_control_test\n");
}

main().catch((error) => {
  console.error(`FAIL harnesui_server_restart_control_test: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
