@echo off
setlocal EnableExtensions

cd /d "%~dp0"

if "%TALKAPP_HOST%"=="" set "TALKAPP_HOST=127.0.0.1"
if "%TALKAPP_PORT%"=="" set "TALKAPP_PORT=3000"
if "%TALKAPP_AUTO_OPEN_BROWSER%"=="" set "TALKAPP_AUTO_OPEN_BROWSER=1"
if "%TALKAPP_PAUSE_ON_ERROR%"=="" set "TALKAPP_PAUSE_ON_ERROR=1"
if "%TALKAPP_HARNESS_BASE_URL%"=="" set "TALKAPP_HARNESS_BASE_URL=http://127.0.0.1:57525"
if "%AI_PROVIDER%"=="" set "AI_PROVIDER=harness"
if "%HOST%"=="" set "HOST=%TALKAPP_HOST%"
if "%PORT%"=="" set "PORT=%TALKAPP_PORT%"

if not exist ".env" if exist ".env.example" (
  copy /y ".env.example" ".env" >nul
  echo [INFO] Created .env from .env.example
)

set "APP_URL=http://%TALKAPP_HOST%:%TALKAPP_PORT%/"
set "HEALTH_URL=http://%TALKAPP_HOST%:%TALKAPP_PORT%/healthz"
set "RUNTIME_URL=http://%TALKAPP_HOST%:%TALKAPP_PORT%/api/runtime"
set "OUT_LOG=%~dp0talkapp.out.log"
set "ERR_LOG=%~dp0talkapp.err.log"

call :probe_health
if not errorlevel 1 goto :probe_runtime

echo [INFO] Starting talkApp on %APP_URL%
powershell -NoProfile -ExecutionPolicy Bypass -Command "$wd = '%~dp0'; $out = '%OUT_LOG%'; $err = '%ERR_LOG%'; Start-Process -FilePath 'cmd.exe' -ArgumentList @('/c','npm start') -WorkingDirectory $wd -WindowStyle Hidden -RedirectStandardOutput $out -RedirectStandardError $err" >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Failed to launch npm start.
  goto :error_exit
)

for /l %%N in (1,1,40) do (
  call :probe_health
  if not errorlevel 1 goto :probe_runtime
  >nul timeout /t 1 /nobreak
)

echo [ERROR] talkApp did not become ready in time.
echo [ERROR] Output log: %OUT_LOG%
echo [ERROR] Error log : %ERR_LOG%
goto :error_exit

:probe_runtime
call :check_runtime
if errorlevel 1 goto :runtime_error

echo [INFO] talkApp is ready at %APP_URL%
echo [INFO] Active runtime is available.
echo [INFO] Logs: %OUT_LOG% / %ERR_LOG%
if "%TALKAPP_AUTO_OPEN_BROWSER%"=="1" start "" "%APP_URL%"
endlocal & exit /b 0

:probe_health
powershell -NoProfile -ExecutionPolicy Bypass -Command "try { $response = Invoke-WebRequest -UseBasicParsing -Uri '%HEALTH_URL%' -TimeoutSec 2; if ($response.StatusCode -eq 200) { exit 0 } } catch { } exit 1" >nul 2>nul
exit /b %errorlevel%

:check_runtime
powershell -NoProfile -ExecutionPolicy Bypass -Command "try { $runtime = Invoke-RestMethod -Uri '%RUNTIME_URL%' -TimeoutSec 4; if ($runtime.ready) { exit 0 } else { exit 1 } } catch { exit 1 }" >nul 2>nul
exit /b %errorlevel%

:runtime_error
echo [ERROR] HTTP server is up, but no AI runtime is ready.
echo [ERROR] Either sign in to Codex CLI or set OPENAI_API_KEY in .env.
echo [ERROR] Output log: %OUT_LOG%
echo [ERROR] Error log : %ERR_LOG%
goto :error_exit

:error_exit
if "%TALKAPP_PAUSE_ON_ERROR%"=="1" pause
endlocal & exit /b 1
