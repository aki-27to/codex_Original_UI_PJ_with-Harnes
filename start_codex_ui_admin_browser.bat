@echo off
setlocal
set "CODEX_ADMIN_BROWSER_LAUNCH_FILE=%~f0"
set "CODEX_ADMIN_BROWSER_LAUNCH_DIR=%~dp0"
set "CODEX_ADMIN_BROWSER_LAUNCH_ARGS=%*"
fltmc >nul 2>nul
if "%errorlevel%"=="0" goto admin_browser_elevated
echo [launcher] requesting administrator elevation for admin/browser startup...
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "try { $cmd = if($env:ComSpec){ $env:ComSpec } else { 'cmd.exe' }; $dq = [char]34; $invoke = $dq + $dq + $env:CODEX_ADMIN_BROWSER_LAUNCH_FILE + $dq + $(if($env:CODEX_ADMIN_BROWSER_LAUNCH_ARGS){ ' ' + $env:CODEX_ADMIN_BROWSER_LAUNCH_ARGS } else { '' }) + $dq; $startArgs = @{ FilePath = $cmd; WorkingDirectory = $env:CODEX_ADMIN_BROWSER_LAUNCH_DIR; Verb = 'RunAs'; ArgumentList = @('/d','/c',$invoke) }; Start-Process @startArgs | Out-Null; exit 100 } catch { Write-Error $_; exit 1 }"
set "ELEVATE_EXIT=%errorlevel%"
if "%ELEVATE_EXIT%"=="100" exit /b 0
if not "%ELEVATE_EXIT%"=="0" (
  echo [ERROR] administrator elevation was cancelled or failed.
  pause
  exit /b %ELEVATE_EXIT%
)

:admin_browser_elevated
fltmc >nul 2>nul
if not "%errorlevel%"=="0" (
  echo [ERROR] administrator elevation did not complete; refusing to stop or restart the harness.
  pause
  exit /b 1
)
set "CODEX_REQUIRE_ADMIN=1"
set "CODEX_AUTO_OPEN_BROWSER=1"
if "%CODEX_RESTART_EXISTING_HARNESS%"=="" set "CODEX_RESTART_EXISTING_HARNESS=1"
echo [launcher] admin/browser launcher is elevated; delegating to start_codex_ui.bat...
call "%~dp0start_codex_ui.bat" %*
set "EXIT_CODE=%ERRORLEVEL%"
endlocal & exit /b %EXIT_CODE%
