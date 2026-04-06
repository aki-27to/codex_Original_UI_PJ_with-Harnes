@echo off
setlocal EnableExtensions

cd /d "%~dp0"

if "%CODEX_PAUSE_ON_EXIT%"=="" set "CODEX_PAUSE_ON_EXIT=1"
if "%CODEX_ENGLISH_CONVERSATION_HOST%"=="" set "CODEX_ENGLISH_CONVERSATION_HOST=127.0.0.1"
if "%CODEX_ENGLISH_CONVERSATION_PORT%"=="" set "CODEX_ENGLISH_CONVERSATION_PORT=57526"
if "%CODEX_HARNESS_API_BASE_URL%"=="" set "CODEX_HARNESS_API_BASE_URL=http://127.0.0.1:57525"
if "%CODEX_AUTO_OPEN_BROWSER%"=="" set "CODEX_AUTO_OPEN_BROWSER=1"

set "APP_URL=http://%CODEX_ENGLISH_CONVERSATION_HOST%:%CODEX_ENGLISH_CONVERSATION_PORT%/index.html"
set "HEALTH_URL=http://%CODEX_ENGLISH_CONVERSATION_HOST%:%CODEX_ENGLISH_CONVERSATION_PORT%/healthz"
set "OUT_LOG=%~dp0standalone_server.out.log"
set "ERR_LOG=%~dp0standalone_server.err.log"

set "NODE_EXE="
for /f "delims=" %%I in ('where node 2^>nul') do if not defined NODE_EXE set "NODE_EXE=%%~fI"
if not defined NODE_EXE (
  echo [ERROR] node was not found in PATH.
  echo Install Node.js or add it to PATH before launching the standalone English conversation app.
  goto :error_exit
)

call :probe_health
if not errorlevel 1 goto :ready

echo [INFO] Starting standalone English conversation app on %APP_URL%
powershell -NoProfile -ExecutionPolicy Bypass -Command "$node = '%NODE_EXE%'; $wd = '%~dp0'; $out = '%OUT_LOG%'; $err = '%ERR_LOG%'; Start-Process -FilePath $node -ArgumentList @('standalone_server.js') -WorkingDirectory $wd -WindowStyle Hidden -RedirectStandardOutput $out -RedirectStandardError $err" >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Failed to launch standalone_server.js.
  echo Check Node.js installation and file permissions.
  goto :error_exit
)

for /l %%N in (1,1,20) do (
  call :probe_health
  if not errorlevel 1 goto :ready
  >nul timeout /t 1 /nobreak
)

echo [ERROR] The standalone English conversation server did not become ready.
echo Output log: %OUT_LOG%
echo Error log : %ERR_LOG%
goto :error_exit

:ready
echo [INFO] English conversation app is ready at %APP_URL%
if "%CODEX_AUTO_OPEN_BROWSER%"=="1" start "" "%APP_URL%"
endlocal & exit /b 0

:probe_health
powershell -NoProfile -ExecutionPolicy Bypass -Command "try { $response = Invoke-WebRequest -UseBasicParsing -Uri '%HEALTH_URL%' -TimeoutSec 2; if ($response.StatusCode -eq 200) { exit 0 } } catch { } exit 1" >nul 2>nul
exit /b %errorlevel%

:error_exit
if "%CODEX_PAUSE_ON_EXIT%"=="1" pause
endlocal & exit /b 1
