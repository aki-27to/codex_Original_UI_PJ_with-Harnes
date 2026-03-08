@echo off
setlocal

cd /d "%~dp0"
set "npm_config_userconfig=%~dp0.npmrc"
set "npm_config_cache=%~dp0.npm-cache"

where node >nul 2>nul
if %errorlevel% neq 0 (
  echo [ERROR] Node.js is not found in PATH.
  echo Install Node.js and retry.
  pause
  exit /b 1
)

where codex >nul 2>nul
if %errorlevel% neq 0 (
  echo [ERROR] codex is not found in PATH.
  echo Install Codex CLI and retry.
  pause
  exit /b 1
)

if "%CODEX_UI_PORT%"=="" set "CODEX_UI_PORT=57525"
set "CODEX_UI_PORT=%CODEX_UI_PORT%"
echo(%CODEX_UI_PORT%| findstr /r "^[0-9][0-9]*$" >nul || set "CODEX_UI_PORT=57525"
if "%CODEX_UI_PORT%"=="" set "CODEX_UI_PORT=57525"
if "%CODEX_AUTO_OPEN_BROWSER%"=="" set "CODEX_AUTO_OPEN_BROWSER=1"
if "%CODEX_PAUSE_ON_EXIT%"=="" set "CODEX_PAUSE_ON_EXIT=1"
if "%CODEX_AUTO_OPEN_PATH%"=="" set "CODEX_AUTO_OPEN_PATH=/01.HarnesUI/index.html"
if "%CODEX_SANDBOX_NETWORK_DISABLED%"=="" set "CODEX_SANDBOX_NETWORK_DISABLED=0"
if "%CODEX_DEFAULT_EXEC_AGENT%"=="" set "CODEX_DEFAULT_EXEC_AGENT=default"
if "%CODEX_REQUEST_USER_INPUT_POLICY%"=="" set "CODEX_REQUEST_USER_INPUT_POLICY=blocked"
if "%CODEX_PARENT_DISPATCH_GUARD_MODE%"=="" set "CODEX_PARENT_DISPATCH_GUARD_MODE=enforce"
if "%CODEX_PARENT_DISPATCH_GUARD_MAX_RETRIES%"=="" set "CODEX_PARENT_DISPATCH_GUARD_MAX_RETRIES=1"
if "%CODEX_ADVERSARIAL_SHADOW_ENABLED%"=="" set "CODEX_ADVERSARIAL_SHADOW_ENABLED=1"
if "%CODEX_ADVERSARIAL_LOOP_ENABLED%"=="" set "CODEX_ADVERSARIAL_LOOP_ENABLED=1"
if "%CODEX_ADVERSARIAL_LOOP_MAX_RETRIES%"=="" set "CODEX_ADVERSARIAL_LOOP_MAX_RETRIES=1"
if "%CODEX_REQUIREMENT_GUARD_ENABLED%"=="" set "CODEX_REQUIREMENT_GUARD_ENABLED=1"
if "%CODEX_REQUIREMENT_RBJ_ENABLED%"=="" set "CODEX_REQUIREMENT_RBJ_ENABLED=1"
if "%CODEX_REQUIREMENT_RBJ_MAX_QUESTIONS%"=="" set "CODEX_REQUIREMENT_RBJ_MAX_QUESTIONS=3"
if "%CODEX_REQUIREMENT_RBJ_MAX_REVISIONS%"=="" set "CODEX_REQUIREMENT_RBJ_MAX_REVISIONS=2"
if "%CODEX_REQUIREMENT_LOCK_ENABLED%"=="" set "CODEX_REQUIREMENT_LOCK_ENABLED=0"
if "%CODEX_EXECUTION_PROFILE%"=="" set "CODEX_EXECUTION_PROFILE=full-runtime"
if "%CODEX_PIPER_BIN%"=="" if exist "%~dp0tools\piper\piper.exe" set "CODEX_PIPER_BIN=%~dp0tools\piper\piper.exe"
if "%CODEX_EDGE_EXE%"=="" if exist "%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe" set "CODEX_EDGE_EXE=%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe"
if "%CODEX_EDGE_EXE%"=="" if exist "%ProgramFiles%\Microsoft\Edge\Application\msedge.exe" set "CODEX_EDGE_EXE=%ProgramFiles%\Microsoft\Edge\Application\msedge.exe"
if "%CODEX_EDGE_EXE%"=="" if exist "%LOCALAPPDATA%\Microsoft\Edge\Application\msedge.exe" set "CODEX_EDGE_EXE=%LOCALAPPDATA%\Microsoft\Edge\Application\msedge.exe"
set "UI_URL=http://127.0.0.1:%CODEX_UI_PORT%%CODEX_AUTO_OPEN_PATH%"

if "%CODEX_AUTO_OPEN_BROWSER%"=="0" (
  echo [launcher] browser auto-open is disabled. Open manually: %UI_URL%
) else (
  if defined CODEX_EDGE_EXE (
    echo [launcher] browser target: Microsoft Edge
  ) else (
    echo [launcher] browser target: system default ^(Edge not found^)
  )
  echo [launcher] browser should open automatically.
  echo [launcher] fallback URL: %UI_URL%
)

echo [launcher] starting UI server...
if not "%CODEX_AUTO_OPEN_BROWSER%"=="0" (
  echo [launcher] waiting for server startup, then opening browser...
  start "" /b powershell -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -Command ^
    "$url='%UI_URL%'; $edge='%CODEX_EDGE_EXE%'; $deadline=(Get-Date).AddSeconds(20); while((Get-Date) -lt $deadline){ try { Invoke-WebRequest -UseBasicParsing -Uri $url -TimeoutSec 2 | Out-Null; break } catch { Start-Sleep -Milliseconds 500 } }; if($edge -and (Test-Path $edge)){ Start-Process -FilePath $edge -ArgumentList $url | Out-Null } else { Start-Process $url | Out-Null }"
)
node "%~dp0server.js"
set "EXIT_CODE=%errorlevel%"

if not "%EXIT_CODE%"=="0" (
  echo [ERROR] server.js exited with code: %EXIT_CODE%
)
if "%EXIT_CODE%"=="0" (
  echo [launcher] server.js exited with code: 0
)
if "%CODEX_PAUSE_ON_EXIT%"=="1" (
  echo [launcher] press any key to close this window...
  pause >nul
)

endlocal & exit /b %EXIT_CODE%
