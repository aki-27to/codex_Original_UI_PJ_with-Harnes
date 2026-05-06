"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");

const workspaceRoot = path.resolve(__dirname, "..");
const launcherPath = path.join(workspaceRoot, "start_codex_ui.bat");
const adminBrowserLauncherPath = path.join(workspaceRoot, "start_codex_ui_admin_browser.bat");

function main() {
  const launcher = fs.readFileSync(launcherPath, "utf8");
  const adminBrowserLauncher = fs.readFileSync(adminBrowserLauncherPath, "utf8");

  assert(/^@echo off\r?\nsetlocal\r?\nif "%CODEX_PAUSE_ON_EXIT%"=="" set "CODEX_PAUSE_ON_EXIT=1"/.test(launcher), "launcher must default CODEX_PAUSE_ON_EXIT before early-exit checks");
  assert(/if "%CODEX_REQUIRE_ADMIN%"=="" set "CODEX_REQUIRE_ADMIN=0"/.test(launcher), "launcher must default admin elevation off unless the operator opts in");
  assert(/set "CODEX_LAUNCH_FILE=%~f0"/.test(launcher), "launcher must always expose its own path for reuse/stale-runtime probes");
  assert(/set "CODEX_LAUNCH_DIR=%~dp0"/.test(launcher), "launcher must always expose its working directory for reuse/stale-runtime probes");
  assert(/if \/I "%CODEX_REQUIRE_ADMIN%"=="1" \(/.test(launcher), "launcher must route admin requirements through the self-elevation gate");
  assert(/set "LAUNCHER_AUTO_OPEN_BROWSER=%CODEX_AUTO_OPEN_BROWSER%"/.test(launcher), "launcher must snapshot browser auto-open ownership before starting server.js");
  assert(/if "%CODEX_AUTO_OPEN_BROWSER%"=="" set "CODEX_AUTO_OPEN_BROWSER=0"/.test(launcher), "launcher must default browser auto-open off unless the operator opts in");
  assert(/if "%CODEX_RESTART_EXISTING_HARNESS%"=="" set "CODEX_RESTART_EXISTING_HARNESS=0"/.test(launcher), "launcher must default restart-existing-harness behavior off");
  assert(/-Uri \$runtimeUrl -TimeoutSec 6/.test(launcher), "launcher must give the existing runtime probe enough time to avoid false fallback reuse");
  assert(/if "%CODEX_AUTO_RESTART_STALE_HARNESS%"=="" set "CODEX_AUTO_RESTART_STALE_HARNESS=1"/.test(launcher), "launcher must default stale-harness auto-restart on");
  assert(/if "%CODEX_FORCE_ACTIVE_RESTART%"=="" set "CODEX_FORCE_ACTIVE_RESTART=0"/.test(launcher), "launcher must default forced active restart off");
  assert(/if "%CODEX_FAST_MODE_DEFAULT%"=="" set "CODEX_FAST_MODE_DEFAULT=0"/.test(launcher), "launcher must default fast mode off");
  assert(/if "%CODEX_SERVER_RESTART_MAX_RETRIES%"=="" set "CODEX_SERVER_RESTART_MAX_RETRIES=4"/.test(launcher), "launcher must define a bounded auto-restart budget");
  assert(/if "%CODEX_SERVER_RESTART_DELAY_MS%"=="" set "CODEX_SERVER_RESTART_DELAY_MS=1500"/.test(launcher), "launcher must define a restart backoff");
  assert(/if "%CODEX_SERVER_STABLE_WINDOW_SECONDS%"=="" set "CODEX_SERVER_STABLE_WINDOW_SECONDS=30"/.test(launcher), "launcher must define a stability reset window");
  assert(/\[launcher\] checking for existing harness on port %CODEX_UI_PORT%/.test(launcher), "launcher must check for an existing harness before startup");
  assert(/runtimeUrl='http:\/\/127\.0\.0\.1:'\+\$port\+'\/api\/runtime'/.test(launcher), "launcher must probe the local runtime endpoint before restarting");
  assert(/function Get-HarnessPids/.test(launcher), "launcher must resolve the owning PID when evaluating an existing harness");
  assert(/function Get-LatestHarnessRuntimeWriteTime/.test(launcher), "launcher must compare existing harness age against runtime files");
  assert(/Join-Path \$LaunchDir 'server_impl\.js'/.test(launcher), "launcher must include server_impl.js in stale-runtime detection");
  assert(/Join-Path \$LaunchDir 'server'/.test(launcher), "launcher must include the modular server directory in stale-runtime detection");
  assert(/if\(\$restart -eq '0' -and -not \$staleRuntime\)\{ Write-Output \('\[launcher\] existing harness detected on port '\+\$port\+'; reusing without restart\.'\); exit 10 \}/.test(launcher), "launcher must only reuse when the existing harness is not stale");
  assert(/runtime files are newer than the process; restarting stale harness/.test(launcher), "launcher must restart stale harness processes automatically");
  assert(/if\(\$hasActive -and \$forceActive -ne '1'\)\{[\s\S]*existing harness has active \/api\/exec work; refusing restart while work is in progress\.[\s\S]*exit 11 \}/.test(launcher), "launcher must refuse to restart while active exec work is in progress unless forced");
  assert(/existing harness is stale but has active \/api\/exec work; reusing until work is idle/.test(launcher), "launcher must avoid interrupting active work even when the harness is stale");
  assert(/Stop-Process -Id \$candidatePid -Force -ErrorAction Stop/.test(launcher), "launcher must still stop the existing harness process when an explicit restart is allowed");
  assert(/if "%HARNESS_PROBE_EXIT%"=="10" set "CODEX_EXISTING_HARNESS_REUSED=1"/.test(launcher), "launcher must track the reused-harness state for default reuse exits");
  assert(/if "%HARNESS_PROBE_EXIT%"=="11" set "CODEX_EXISTING_HARNESS_REUSED=1"/.test(launcher), "launcher must track the reused-harness state for active-turn restart refusal exits");
  assert(/if "%CODEX_EXISTING_HARNESS_REUSED%"=="1" \(/.test(launcher), "launcher must short-circuit into reuse mode when the existing harness is kept");
  assert(/echo \[launcher\] existing harness reused; no restart was performed\./.test(launcher), "launcher must report when it reuses the existing harness");
  assert(/set "CODEX_AUTO_OPEN_BROWSER=0"/.test(launcher), "launcher must disable server-side browser auto-open before entering the server loop");
  assert(/:launcher_server_run[\s\S]*node "%~dp0server\.js"/.test(launcher), "launcher must run server.js from a dedicated restart loop label");
  assert(/existing harness is already serving on port .*reusing after startup conflict/.test(launcher), "launcher must retry reuse when server startup collides with an already-running harness");
  assert(/CODEX_SERVER_RESTART_STOP_REASON=reused_existing_harness_after_conflict/.test(launcher), "launcher must record when a late reuse resolves a startup conflict");
  assert(/CODEX_SERVER_RESTART_ATTEMPT\+=1/.test(launcher), "launcher must increment the restart attempt counter");
  assert(/CODEX_SERVER_RESTART_ATTEMPT% GTR %CODEX_SERVER_RESTART_MAX_RETRIES%/.test(launcher), "launcher must stop once the restart budget is exhausted");
  assert(/CODEX_SERVER_UPTIME_SECONDS/.test(launcher), "launcher must measure server uptime for stability resets");
  assert(/CODEX_SERVER_WAS_STABLE/.test(launcher), "launcher must reset the retry budget after a stable run");
  assert(/Start-Sleep -Milliseconds \(\[Math\]::Max\(250,\[int\]\$env:CODEX_SERVER_RESTART_DELAY_MS\)\)/.test(launcher), "launcher must wait before restarting after an unexpected exit");
  assert(/goto launcher_server_run/.test(launcher), "launcher must loop back into the server run label after a crash");
  assert(/if not "%LAUNCHER_AUTO_OPEN_BROWSER%"=="0" \(/.test(launcher), "launcher must use the launcher-owned browser auto-open gate");
  assert(/if "%CODEX_PAUSE_ON_EXIT%"=="1" pause/.test(launcher), "launcher must honor CODEX_PAUSE_ON_EXIT on early dependency failures and elevation failures");
  assert(/set "CODEX_REQUIRE_ADMIN=1"/.test(adminBrowserLauncher), "admin/browser launcher must request UAC self-elevation through start_codex_ui.bat");
  assert(/set "CODEX_AUTO_OPEN_BROWSER=1"/.test(adminBrowserLauncher), "admin/browser launcher must opt into launcher-owned browser auto-open");
  assert(/set "CODEX_RESTART_EXISTING_HARNESS=1"/.test(adminBrowserLauncher), "admin/browser launcher must restart an existing harness so the server runs under the elevated launcher");
  assert(/Verb = 'RunAs'/.test(adminBrowserLauncher), "admin/browser launcher must self-elevate before delegating to the canonical launcher");
  assert(/\$dq = \[char\]34/.test(adminBrowserLauncher), "admin/browser launcher must build cmd.exe quoting without nested shell-quote ambiguity");
  assert(/FilePath = \$cmd/.test(adminBrowserLauncher), "admin/browser launcher must elevate cmd.exe rather than relying on direct .bat ShellExecute behavior");
  assert(/ArgumentList = @\('\/d','\/c',\$invoke\)/.test(adminBrowserLauncher), "admin/browser launcher must run the batch inside the elevated cmd.exe session");
  assert(/call "%~dp0start_codex_ui\.bat" %\*/.test(adminBrowserLauncher), "admin/browser launcher must delegate to the canonical launcher");

  process.stdout.write("PASS start_codex_ui_launcher_policy_test\n");
}

main();
