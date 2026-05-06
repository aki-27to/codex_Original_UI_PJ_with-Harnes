@echo off
setlocal EnableExtensions

set "APP_DIR=%~dp0"
cd /d "%APP_DIR%"

if "%CODEX_KOE_SCRIBE_PORT%"=="" set "CODEX_KOE_SCRIBE_PORT=0"
if "%CODEX_KOE_SCRIBE_HOST%"=="" set "CODEX_KOE_SCRIBE_HOST=127.0.0.1"
if "%CODEX_KOE_SCRIBE_CODEX_APP_URL%"=="" set "CODEX_KOE_SCRIBE_CODEX_APP_URL=http://127.0.0.1:57525"
if "%CODEX_KOE_SCRIBE_PAUSE_ON_EXIT%"=="" set "CODEX_KOE_SCRIBE_PAUSE_ON_EXIT=1"

set "NODE_EXE="
for /f "delims=" %%I in ('where node 2^>nul') do if not defined NODE_EXE set "NODE_EXE=%%~fI"
if not defined NODE_EXE (
  echo [ERROR] node was not found in PATH.
  echo Install Node.js or add it to PATH before launching KoeScribe.
  goto :error_exit
)

echo [INFO] Starting isolated KoeScribe server.
echo [INFO] Host: %CODEX_KOE_SCRIBE_HOST%
echo [INFO] Codex App Server: %CODEX_KOE_SCRIBE_CODEX_APP_URL%
if "%CODEX_KOE_SCRIBE_PORT%"=="0" (
  echo [INFO] Port: auto ^(free port selected by Windows^)
) else (
  echo [INFO] Port: %CODEX_KOE_SCRIBE_PORT%
)
echo [INFO] The actual URL is printed after startup.
echo [INFO] Press Ctrl+C in this window to stop the server.

"%NODE_EXE%" standalone_server.js
set "EXIT_CODE=%ERRORLEVEL%"
echo.
echo [INFO] KoeScribe server stopped. exit=%EXIT_CODE%
if "%CODEX_KOE_SCRIBE_PAUSE_ON_EXIT%"=="1" pause
endlocal & exit /b %EXIT_CODE%

:error_exit
if "%CODEX_KOE_SCRIBE_PAUSE_ON_EXIT%"=="1" pause
endlocal & exit /b 1
