#!/usr/bin/env node
"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { spawn, spawnSync } = require("child_process");

const workspaceRoot = path.resolve(__dirname, "..");
const helperPath = path.join(workspaceRoot, "scripts", "restart_harness_from_ui.js");
const artifactRoot = path.join(workspaceRoot, "output", "harnesui-restart-helper");

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, Math.max(0, Number(ms) || 0)));
}

function isProcessAlive(pid) {
  if (!pid) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error && error.code === "EPERM";
  }
}

async function waitFor(predicate, { timeoutMs = 10000, intervalMs = 100, label = "condition" } = {}) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await predicate()) return true;
    await sleep(intervalMs);
  }
  throw new Error(`Timed out waiting for ${label}`);
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function readLogEvents(filePath) {
  if (!fs.existsSync(filePath)) return [];
  return fs.readFileSync(filePath, "utf8")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

function killIfAlive(child) {
  if (!child || !child.pid || !isProcessAlive(child.pid)) return;
  if (process.platform === "win32") {
    spawnSync("taskkill.exe", ["/PID", String(child.pid), "/F"], {
      stdio: "ignore",
      windowsHide: true,
    });
    return;
  }
  try {
    child.kill("SIGKILL");
  } catch {
  }
}

async function main() {
  fs.mkdirSync(artifactRoot, { recursive: true });
  const tempRoot = path.join(workspaceRoot, "runtime", `restart-helper-test-${Date.now()}-${process.pid}`);
  fs.mkdirSync(tempRoot, { recursive: true });

  const readyPath = path.join(tempRoot, "target-ready.txt");
  const targetScript = path.join(tempRoot, "target.js");
  const launcherPath = path.join(tempRoot, "start_codex_ui_test.bat");
  const markerPath = path.join(tempRoot, "launcher-marker.txt");
  const helperLogPath = path.join(tempRoot, "helper.jsonl");
  const resultPath = path.join(tempRoot, "server_restart_result.json");
  const reportPath = path.join(artifactRoot, "report.json");
  const targetPort = 58997;
  let target = null;

  try {
    fs.writeFileSync(
      targetScript,
      [
        '"use strict";',
        'const fs = require("fs");',
        'fs.writeFileSync(process.env.TARGET_READY_PATH, `${process.pid}\\n`, "utf8");',
        'setInterval(() => {}, 1000);',
        "",
      ].join("\n"),
      "utf8"
    );

    fs.writeFileSync(
      launcherPath,
      [
        "@echo off",
        "setlocal",
        "(",
        "echo CODEX_UI_PORT=%CODEX_UI_PORT%",
        "echo CODEX_RESTART_EXISTING_HARNESS=%CODEX_RESTART_EXISTING_HARNESS%",
        "echo CODEX_AUTO_OPEN_BROWSER=%CODEX_AUTO_OPEN_BROWSER%",
        "echo CODEX_REQUIRE_ADMIN=%CODEX_REQUIRE_ADMIN%",
        `) > "${markerPath}"`,
        "exit /b 0",
        "",
      ].join("\r\n"),
      "utf8"
    );

    target = spawn(process.execPath, [targetScript], {
      cwd: workspaceRoot,
      env: { ...process.env, TARGET_READY_PATH: readyPath },
      stdio: "ignore",
      windowsHide: true,
    });
    assert(target.pid, "target process should start");
    await waitFor(() => fs.existsSync(readyPath), { label: "target ready marker" });
    assert.strictEqual(isProcessAlive(target.pid), true, "target process should be alive before restart helper runs");

    const helper = spawn(process.execPath, [helperPath], {
      cwd: workspaceRoot,
      env: {
        ...process.env,
        CODEX_RESTART_TARGET_PID: String(target.pid),
        CODEX_RESTART_UI_PORT: String(targetPort),
        CODEX_RESTART_WORKSPACE_ROOT: workspaceRoot,
        CODEX_RESTART_LAUNCHER: launcherPath,
        CODEX_RESTART_HELPER_DELAY_MS: "25",
        CODEX_RESTART_FORCE_ACTIVE: "1",
        CODEX_RESTART_HELPER_LOG_PATH: helperLogPath,
        CODEX_RESTART_RESULT_PATH: resultPath,
      },
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });

    const stderrChunks = [];
    helper.stderr.on("data", (chunk) => stderrChunks.push(String(chunk)));
    const exitCode = await new Promise((resolve) => helper.on("exit", (code) => resolve(code)));
    assert.strictEqual(exitCode, 0, `restart helper should exit cleanly: ${stderrChunks.join("")}`);

    await waitFor(() => !isProcessAlive(target.pid), { label: "target process to stop" });
    assert(fs.existsSync(resultPath), "restart helper must write a runtime-visible result file");

    const result = readJson(resultPath);
    const events = readLogEvents(helperLogPath).map((entry) => entry.ev);
    const helperSource = fs.readFileSync(helperPath, "utf8");
    const marker = fs.existsSync(markerPath) ? fs.readFileSync(markerPath, "utf8") : "";

    assert.strictEqual(result.schema, "harnesui-server-restart-result.v1", "result schema mismatch");
    assert.strictEqual(result.status, "relaunch_spawned", "helper should report a relaunched harness");
    assert.strictEqual(result.previousPid, target.pid, "result should name the stopped target pid");
    assert.strictEqual(result.port, targetPort, "result should preserve the requested port");
    assert(Number(result.launcherPid) > 0, "result should include the detached launcher pid");
    assert(events.includes("server.restart_helper_stop_requested"), "helper log should prove stop was requested");
    assert(events.includes("server.restart_helper_launcher_spawned"), "helper log should prove relaunch was spawned");
    assert(helperSource.includes('CODEX_RESTART_EXISTING_HARNESS: "0"'), "launcher must not re-stop the already stopped harness");
    assert(helperSource.includes('CODEX_AUTO_OPEN_BROWSER: "0"'), "UI restart helper must not open a browser");
    assert(helperSource.includes('CODEX_REQUIRE_ADMIN: "0"'), "UI restart helper must not request elevation");
    if (marker) {
      assert(marker.includes(`CODEX_UI_PORT=${targetPort}`), "launcher should receive the requested UI port");
      assert(marker.includes("CODEX_RESTART_EXISTING_HARNESS=0"), "launcher marker should keep no-restop env");
      assert(marker.includes("CODEX_AUTO_OPEN_BROWSER=0"), "launcher marker should keep no-browser env");
      assert(marker.includes("CODEX_REQUIRE_ADMIN=0"), "launcher marker should keep no-admin env");
    }

    fs.writeFileSync(
      reportPath,
      `${JSON.stringify({
        ok: true,
        targetPid: target.pid,
        result,
        events,
        launcherMarkerObserved: Boolean(marker),
        markerPath,
        resultPath,
      }, null, 2)}\n`,
      "utf8"
    );

    process.stdout.write(`PASS restart_harness_from_ui_helper_test report=${path.relative(workspaceRoot, reportPath).replace(/\\/g, "/")}\n`);
  } finally {
    killIfAlive(target);
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(`FAIL restart_harness_from_ui_helper_test: ${error && error.stack ? error.stack : String(error)}`);
  process.exit(1);
});
