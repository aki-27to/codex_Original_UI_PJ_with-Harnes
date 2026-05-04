#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const { spawn, spawnSync } = require("child_process");

function positiveInt(value, fallback = 0) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  const truncated = Math.trunc(parsed);
  return truncated > 0 ? truncated : fallback;
}

function safeString(value, max = 240) {
  return String(value || "").slice(0, max);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, Math.max(0, Number(ms) || 0)));
}

function isProcessAlive(pid) {
  if (!positiveInt(pid)) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error && error.code === "EPERM";
  }
}

function appendHelperLog(event, fields = {}) {
  const logPath = safeString(process.env.CODEX_RESTART_HELPER_LOG_PATH, 1000).trim();
  if (!logPath) return;
  try {
    fs.mkdirSync(path.dirname(logPath), { recursive: true });
    fs.appendFileSync(
      logPath,
      `${JSON.stringify({ ts: Date.now(), ev: event, ...fields })}\n`,
      "utf8"
    );
  } catch {
    // The restart helper must not fail only because diagnostic logging failed.
  }
}

function writeRestartResult(fields = {}) {
  const resultPath = safeString(process.env.CODEX_RESTART_RESULT_PATH, 1000).trim();
  if (!resultPath) return;
  try {
    fs.mkdirSync(path.dirname(resultPath), { recursive: true });
    fs.writeFileSync(
      resultPath,
      `${JSON.stringify({
        schema: "harnesui-server-restart-result.v1",
        updatedAt: Date.now(),
        ...fields,
      })}\n`,
      "utf8"
    );
  } catch {
  }
}

async function stopTargetProcess(pid) {
  if (!positiveInt(pid) || !isProcessAlive(pid)) {
    appendHelperLog("server.restart_helper_target_absent", { pid: positiveInt(pid) });
    return true;
  }
  appendHelperLog("server.restart_helper_stop_requested", { pid });
  try {
    process.kill(pid, "SIGTERM");
  } catch (error) {
    appendHelperLog("server.restart_helper_sigterm_failed", {
      pid,
      err: safeString(error && error.message ? error.message : error, 220),
    });
  }
  const deadline = Date.now() + 3500;
  while (Date.now() < deadline) {
    if (!isProcessAlive(pid)) return true;
    await sleep(150);
  }
  const killed = spawnSync("taskkill.exe", ["/PID", String(pid), "/F"], {
    encoding: "utf8",
    stdio: ["ignore", "ignore", "pipe"],
    windowsHide: true,
  });
  appendHelperLog("server.restart_helper_taskkill", {
    pid,
    status: Number.isFinite(Number(killed.status)) ? Number(killed.status) : -1,
    err: safeString(killed.stderr, 220),
  });
  const forceDeadline = Date.now() + 3500;
  while (Date.now() < forceDeadline) {
    if (!isProcessAlive(pid)) return true;
    await sleep(150);
  }
  return !isProcessAlive(pid);
}

function cmdQuote(value) {
  return `"${String(value || "").replace(/"/g, '""')}"`;
}

function launchHarness({ launcherPath, workspaceRoot, port, forceActive }) {
  const env = {
    ...process.env,
    CODEX_UI_PORT: String(port),
    CODEX_RESTART_EXISTING_HARNESS: "0",
    CODEX_FORCE_ACTIVE_RESTART: forceActive ? "1" : "0",
    CODEX_AUTO_RESTART_STALE_HARNESS: "1",
    CODEX_AUTO_OPEN_BROWSER: "0",
    CODEX_REQUIRE_ADMIN: "0",
    CODEX_PAUSE_ON_EXIT: "0",
  };
  const child = spawn("cmd.exe", ["/d", "/s", "/c", `call ${cmdQuote(launcherPath)}`], {
    cwd: workspaceRoot,
    env,
    detached: true,
    stdio: "ignore",
    windowsHide: true,
  });
  child.unref();
  appendHelperLog("server.restart_helper_launcher_spawned", {
    launcher: launcherPath,
    childPid: child.pid || 0,
    port,
  });
  return child.pid || 0;
}

async function main() {
  const targetPid = positiveInt(process.env.CODEX_RESTART_TARGET_PID);
  const port = positiveInt(process.env.CODEX_RESTART_UI_PORT, 57525);
  const workspaceRoot = path.resolve(
    safeString(process.env.CODEX_RESTART_WORKSPACE_ROOT, 1000) || path.resolve(__dirname, "..")
  );
  const launcherPath = path.resolve(
    safeString(process.env.CODEX_RESTART_LAUNCHER, 1000) ||
      path.join(workspaceRoot, "start_codex_ui.bat")
  );
  const delayMs = positiveInt(process.env.CODEX_RESTART_HELPER_DELAY_MS, 750);
  const forceActive = safeString(process.env.CODEX_RESTART_FORCE_ACTIVE, 8) === "1";

  appendHelperLog("server.restart_helper_started", {
    targetPid,
    port,
    launcher: launcherPath,
    workspaceRoot,
    delayMs,
  });
  writeRestartResult({
    status: "requested",
    requestedAt: Date.now(),
    previousPid: targetPid,
    port,
    launcher: launcherPath,
  });

  if (!fs.existsSync(launcherPath)) {
    appendHelperLog("server.restart_helper_failed", {
      reason: "missing_launcher",
      launcher: launcherPath,
    });
    writeRestartResult({
      status: "failed",
      reason: "missing_launcher",
      requestedAt: Date.now(),
      previousPid: targetPid,
      port,
      launcher: launcherPath,
    });
    process.exitCode = 2;
    return;
  }

  await sleep(delayMs);
  const stopped = await stopTargetProcess(targetPid);
  if (!stopped) {
    appendHelperLog("server.restart_helper_failed", {
      reason: "target_stop_timeout",
      targetPid,
    });
    writeRestartResult({
      status: "failed",
      reason: "target_stop_timeout",
      requestedAt: Date.now(),
      previousPid: targetPid,
      port,
      launcher: launcherPath,
    });
    process.exitCode = 3;
    return;
  }

  const launcherPid = launchHarness({ launcherPath, workspaceRoot, port, forceActive });
  writeRestartResult({
    status: "relaunch_spawned",
    requestedAt: Date.now(),
    previousPid: targetPid,
    launcherPid,
    port,
    launcher: launcherPath,
  });
}

main().catch((error) => {
  appendHelperLog("server.restart_helper_failed", {
    reason: "exception",
    err: safeString(error && error.stack ? error.stack : error, 500),
  });
  process.exitCode = 1;
});
