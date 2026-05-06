@echo off
setlocal EnableExtensions

set "APP_DIR=%~dp0"
for %%I in ("%APP_DIR%..\..") do set "REPO_ROOT=%%~fI"
cd /d "%REPO_ROOT%"

if "%CODEX_KOE_SCRIBE_PREVIEW_PORT%"=="" set "CODEX_KOE_SCRIBE_PREVIEW_PORT=57526"
if "%CODEX_KOE_SCRIBE_HOST%"=="" set "CODEX_KOE_SCRIBE_HOST=127.0.0.1"
if "%CODEX_KOE_SCRIBE_AUTO_OPEN_BROWSER%"=="" set "CODEX_KOE_SCRIBE_AUTO_OPEN_BROWSER=0"
if "%CODEX_KOE_SCRIBE_PAUSE_ON_EXIT%"=="" set "CODEX_KOE_SCRIBE_PAUSE_ON_EXIT=1"

set "APP_URL=http://%CODEX_KOE_SCRIBE_HOST%:%CODEX_KOE_SCRIBE_PREVIEW_PORT%/apps/koe-scribe/"

set "NODE_EXE="
for /f "delims=" %%I in ('where node 2^>nul') do if not defined NODE_EXE set "NODE_EXE=%%~fI"
if not defined NODE_EXE (
  echo [ERROR] node was not found in PATH.
  echo Install Node.js or add it to PATH before launching KoeScribe.
  goto :error_exit
)

echo [INFO] Starting KoeScribe preview server.
echo [INFO] URL: %APP_URL%
echo [INFO] Press Ctrl+C in this window to stop the server.

if "%CODEX_KOE_SCRIBE_AUTO_OPEN_BROWSER%"=="1" start "" "%APP_URL%"

"%NODE_EXE%" scripts\start_koe_scribe_preview_server.js
set "EXIT_CODE=%ERRORLEVEL%"
echo.
echo [INFO] KoeScribe server stopped. exit=%EXIT_CODE%
if "%CODEX_KOE_SCRIBE_PAUSE_ON_EXIT%"=="1" pause
endlocal & exit /b %EXIT_CODE%

:error_exit
if "%CODEX_KOE_SCRIBE_PAUSE_ON_EXIT%"=="1" pause
endlocal & exit /b 1
