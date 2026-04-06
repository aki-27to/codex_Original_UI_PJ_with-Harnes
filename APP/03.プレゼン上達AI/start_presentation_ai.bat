@echo off
setlocal EnableExtensions

cd /d "%~dp0"

if "%CODEX_PAUSE_ON_EXIT%"=="" set "CODEX_PAUSE_ON_EXIT=1"
if "%PRESENTATION_AI_HOST%"=="" set "PRESENTATION_AI_HOST=127.0.0.1"
if "%PRESENTATION_AI_PORT%"=="" set "PRESENTATION_AI_PORT=57536"
if "%CODEX_AUTO_OPEN_BROWSER%"=="" set "CODEX_AUTO_OPEN_BROWSER=1"
if "%PRESENTATION_AI_HARNESS_BASE_URL%"=="" set "PRESENTATION_AI_HARNESS_BASE_URL=http://127.0.0.1:57525"
if "%PRESENTATION_AI_USE_HARNESS%"=="" set "PRESENTATION_AI_USE_HARNESS=1"

set "APP_URL=http://%PRESENTATION_AI_HOST%:%PRESENTATION_AI_PORT%/index.html"
set "HEALTH_URL=http://%PRESENTATION_AI_HOST%:%PRESENTATION_AI_PORT%/healthz"
set "RUNTIME_URL=http://%PRESENTATION_AI_HOST%:%PRESENTATION_AI_PORT%/api/runtime"
set "OUT_LOG=%~dp0server.out.log"
set "ERR_LOG=%~dp0server.err.log"

set "NODE_EXE="
for /f "delims=" %%I in ('where node 2^>nul') do if not defined NODE_EXE set "NODE_EXE=%%~fI"
if not defined NODE_EXE (
  echo [ERROR] node was not found in PATH.
  goto :error_exit
)

call :probe_health
if not errorlevel 1 goto :ready

echo [INFO] Starting presentation coach app on %APP_URL%
powershell -NoProfile -ExecutionPolicy Bypass -Command "$node = '%NODE_EXE%'; $wd = '%~dp0'; $out = '%OUT_LOG%'; $err = '%ERR_LOG%'; Start-Process -FilePath $node -ArgumentList @('server.js') -WorkingDirectory $wd -WindowStyle Hidden -RedirectStandardOutput $out -RedirectStandardError $err" >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Failed to launch server.js.
  goto :error_exit
)

for /l %%N in (1,1,20) do (
  call :probe_health
  if not errorlevel 1 goto :ready
  >nul timeout /t 1 /nobreak
)

echo [ERROR] The presentation coach server did not become ready.
echo Output log: %OUT_LOG%
echo Error log : %ERR_LOG%
goto :error_exit

:ready
call :probe_runtime
if errorlevel 2 goto :ready_warn_kokoro
if errorlevel 1 goto :runtime_error
echo [INFO] Presentation coach app is ready at %APP_URL%
echo [INFO] Kokoro is expected at http://127.0.0.1:8880 by default.
echo [INFO] If Kokoro is stopped, open C:\Users\akima\dev\codex_Original_UI_PJ_with-Harnes\tools\kokoro-fastapi and run start.ps1
if "%CODEX_AUTO_OPEN_BROWSER%"=="1" start "" "%APP_URL%"
endlocal & exit /b 0

:ready_warn_kokoro
echo [INFO] Presentation coach app is ready at %APP_URL%
echo [WARN] AI is available, but Kokoro is not reachable at http://127.0.0.1:8880
echo [WARN] Browser TTS will be used as fallback unless Kokoro is started.
echo [INFO] To start Kokoro, open C:\Users\akima\dev\codex_Original_UI_PJ_with-Harnes\tools\kokoro-fastapi and run start.ps1
if "%CODEX_AUTO_OPEN_BROWSER%"=="1" start "" "%APP_URL%"
endlocal & exit /b 0

:probe_health
powershell -NoProfile -ExecutionPolicy Bypass -Command "try { $response = Invoke-WebRequest -UseBasicParsing -Uri '%HEALTH_URL%' -TimeoutSec 2; if ($response.StatusCode -eq 200) { exit 0 } } catch { } exit 1" >nul 2>nul
exit /b %errorlevel%

:probe_runtime
powershell -NoProfile -ExecutionPolicy Bypass -Command "try { $response = Invoke-RestMethod -Uri '%RUNTIME_URL%' -TimeoutSec 4; if (-not $response.ok -or -not $response.ai.ready) { exit 1 }; if ($response.kokoro.reachable) { exit 0 } else { exit 2 } } catch { exit 1 }" >nul 2>nul
exit /b %errorlevel%

:runtime_error
echo [ERROR] The HTTP server started, but the AI runtime is not ready.
echo [ERROR] Check Codex CLI availability and %ERR_LOG%
goto :error_exit

:error_exit
if "%CODEX_PAUSE_ON_EXIT%"=="1" pause
endlocal & exit /b 1
