"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");

const workspaceRoot = path.resolve(__dirname, "..");
const launcherPath = path.join(workspaceRoot, "start_codex_ui.bat");

function main() {
  const launcher = fs.readFileSync(launcherPath, "utf8");

  assert(/^@echo off\r?\nsetlocal\r?\nif "%CODEX_PAUSE_ON_EXIT%"=="" set "CODEX_PAUSE_ON_EXIT=1"/.test(launcher), "launcher must default CODEX_PAUSE_ON_EXIT before early-exit checks");
  assert(/set "LAUNCHER_AUTO_OPEN_BROWSER=%CODEX_AUTO_OPEN_BROWSER%"/.test(launcher), "launcher must snapshot browser auto-open ownership before starting server.js");
  assert(/if "%CODEX_RESTART_EXISTING_HARNESS%"=="" set "CODEX_RESTART_EXISTING_HARNESS=1"/.test(launcher), "launcher must default restart-existing-harness behavior on");
  assert(/if "%CODEX_FAST_MODE_DEFAULT%"=="" set "CODEX_FAST_MODE_DEFAULT=0"/.test(launcher), "launcher must default fast mode off");
  assert(/if "%CODEX_SERVER_RESTART_MAX_RETRIES%"=="" set "CODEX_SERVER_RESTART_MAX_RETRIES=4"/.test(launcher), "launcher must define a bounded auto-restart budget");
  assert(/if "%CODEX_SERVER_RESTART_DELAY_MS%"=="" set "CODEX_SERVER_RESTART_DELAY_MS=1500"/.test(launcher), "launcher must define a restart backoff");
  assert(/if "%CODEX_SERVER_STABLE_WINDOW_SECONDS%"=="" set "CODEX_SERVER_STABLE_WINDOW_SECONDS=30"/.test(launcher), "launcher must define a stability reset window");
  assert(/\[launcher\] checking for existing harness on port %CODEX_UI_PORT%/.test(launcher), "launcher must check for an existing harness before startup");
  assert(/runtimeUrl='http:\/\/127\.0\.0\.1:'\+\$port\+'\/api\/runtime'/.test(launcher), "launcher must probe the local runtime endpoint before restarting");
  assert(/Stop-Process -Id \$candidatePid -Force -ErrorAction Stop/.test(launcher), "launcher must stop the existing harness process when it owns the configured port");
  assert(/set "CODEX_AUTO_OPEN_BROWSER=0"/.test(launcher), "launcher must disable server-side browser auto-open before entering the server loop");
  assert(/:launcher_server_run[\s\S]*node "%~dp0server\.js"/.test(launcher), "launcher must run server.js from a dedicated restart loop label");
  assert(/CODEX_SERVER_RESTART_ATTEMPT\+=1/.test(launcher), "launcher must increment the restart attempt counter");
  assert(/CODEX_SERVER_RESTART_ATTEMPT% GTR %CODEX_SERVER_RESTART_MAX_RETRIES%/.test(launcher), "launcher must stop once the restart budget is exhausted");
  assert(/CODEX_SERVER_UPTIME_SECONDS/.test(launcher), "launcher must measure server uptime for stability resets");
  assert(/CODEX_SERVER_WAS_STABLE/.test(launcher), "launcher must reset the retry budget after a stable run");
  assert(/Start-Sleep -Milliseconds \(\[Math\]::Max\(250,\[int\]\$env:CODEX_SERVER_RESTART_DELAY_MS\)\)/.test(launcher), "launcher must wait before restarting after an unexpected exit");
  assert(/goto launcher_server_run/.test(launcher), "launcher must loop back into the server run label after a crash");
  assert(/if not "%LAUNCHER_AUTO_OPEN_BROWSER%"=="0" \(/.test(launcher), "launcher must use the launcher-owned browser auto-open gate");
  assert(/if "%CODEX_PAUSE_ON_EXIT%"=="1" pause/.test(launcher), "launcher must honor CODEX_PAUSE_ON_EXIT on early dependency and elevation failures");

  process.stdout.write("PASS start_codex_ui_launcher_policy_test\n");
}

main();
