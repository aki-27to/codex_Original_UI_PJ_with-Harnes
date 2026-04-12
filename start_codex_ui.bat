@echo off
setlocal
if "%CODEX_PAUSE_ON_EXIT%"=="" set "CODEX_PAUSE_ON_EXIT=1"

set "CODEX_LAUNCH_FILE=%~f0"
set "CODEX_LAUNCH_DIR=%~dp0"
set "CODEX_LAUNCH_ARGS=%*"
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$principal = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent()); if($principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)){ exit 0 }; try { $startArgs = @{ FilePath = $env:CODEX_LAUNCH_FILE; WorkingDirectory = $env:CODEX_LAUNCH_DIR; Verb = 'RunAs' }; if($env:CODEX_LAUNCH_ARGS){ $startArgs.ArgumentList = $env:CODEX_LAUNCH_ARGS }; Start-Process @startArgs | Out-Null; exit 100 } catch { exit 1 }"
set "ELEVATE_EXIT=%errorlevel%"
if "%ELEVATE_EXIT%"=="100" exit /b 0
if not "%ELEVATE_EXIT%"=="0" (
  echo [ERROR] administrator elevation was cancelled or failed.
  if "%CODEX_PAUSE_ON_EXIT%"=="1" pause
  exit /b %ELEVATE_EXIT%
)

cd /d "%~dp0"
set "npm_config_userconfig=%~dp0.npmrc"
set "CODEX_RUNTIME_ROOT=%~dp0runtime"
set "npm_config_cache=%CODEX_RUNTIME_ROOT%\npm-cache"
if "%PLAYWRIGHT_BROWSERS_PATH%"=="" set "PLAYWRIGHT_BROWSERS_PATH=%CODEX_RUNTIME_ROOT%\pw-browsers"

where node >nul 2>nul
if %errorlevel% neq 0 (
  echo [ERROR] Node.js is not found in PATH.
  echo Install Node.js and retry.
  if "%CODEX_PAUSE_ON_EXIT%"=="1" pause
  exit /b 1
)

where codex >nul 2>nul
if %errorlevel% neq 0 (
  echo [ERROR] codex is not found in PATH.
  echo Install Codex CLI and retry.
  if "%CODEX_PAUSE_ON_EXIT%"=="1" pause
  exit /b 1
)

if "%CODEX_UI_PORT%"=="" set "CODEX_UI_PORT=57525"
set "CODEX_UI_PORT=%CODEX_UI_PORT%"
echo(%CODEX_UI_PORT%| findstr /r "^[0-9][0-9]*$" >nul || set "CODEX_UI_PORT=57525"
if "%CODEX_UI_PORT%"=="" set "CODEX_UI_PORT=57525"
if "%CODEX_AUTO_OPEN_BROWSER%"=="" set "CODEX_AUTO_OPEN_BROWSER=1"
set "LAUNCHER_AUTO_OPEN_BROWSER=%CODEX_AUTO_OPEN_BROWSER%"
if "%CODEX_AUTO_OPEN_PATH%"=="" set "CODEX_AUTO_OPEN_PATH=/01.HarnesUI/index.html"
if "%CODEX_RESTART_EXISTING_HARNESS%"=="" set "CODEX_RESTART_EXISTING_HARNESS=0"
if "%CODEX_AUTO_RESTART_STALE_HARNESS%"=="" set "CODEX_AUTO_RESTART_STALE_HARNESS=1"
if "%CODEX_FORCE_ACTIVE_RESTART%"=="" set "CODEX_FORCE_ACTIVE_RESTART=0"
if "%CODEX_SANDBOX_NETWORK_DISABLED%"=="" set "CODEX_SANDBOX_NETWORK_DISABLED=0"
if "%CODEX_DEFAULT_EXEC_AGENT%"=="" set "CODEX_DEFAULT_EXEC_AGENT=default"
if "%CODEX_REQUEST_USER_INPUT_POLICY%"=="" set "CODEX_REQUEST_USER_INPUT_POLICY=auto-default"
if "%CODEX_AUTOMATIC_APPROVAL_REVIEW%"=="" set "CODEX_AUTOMATIC_APPROVAL_REVIEW=1"
if "%CODEX_FAST_MODE_DEFAULT%"=="" set "CODEX_FAST_MODE_DEFAULT=0"
if "%CODEX_SERVER_RESTART_MAX_RETRIES%"=="" set "CODEX_SERVER_RESTART_MAX_RETRIES=4"
if "%CODEX_SERVER_RESTART_DELAY_MS%"=="" set "CODEX_SERVER_RESTART_DELAY_MS=1500"
if "%CODEX_SERVER_STABLE_WINDOW_SECONDS%"=="" set "CODEX_SERVER_STABLE_WINDOW_SECONDS=30"
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
if "%CODEX_GIT_AUTOCOMMIT_ENABLED%"=="" set "CODEX_GIT_AUTOCOMMIT_ENABLED=1"
if "%CODEX_GIT_AUTOPUSH_ENABLED%"=="" set "CODEX_GIT_AUTOPUSH_ENABLED=1"
if "%CODEX_GIT_ALLOW_DIRTY_BASELINE%"=="" set "CODEX_GIT_ALLOW_DIRTY_BASELINE=0"
if "%CODEX_GIT_REMOTE%"=="" set "CODEX_GIT_REMOTE=origin"
if "%CODEX_PIPER_BIN%"=="" if exist "%~dp0tools\piper\piper.exe" set "CODEX_PIPER_BIN=%~dp0tools\piper\piper.exe"
if "%CODEX_EDGE_EXE%"=="" if exist "%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe" set "CODEX_EDGE_EXE=%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe"
if "%CODEX_EDGE_EXE%"=="" if exist "%ProgramFiles%\Microsoft\Edge\Application\msedge.exe" set "CODEX_EDGE_EXE=%ProgramFiles%\Microsoft\Edge\Application\msedge.exe"
if "%CODEX_EDGE_EXE%"=="" if exist "%LOCALAPPDATA%\Microsoft\Edge\Application\msedge.exe" set "CODEX_EDGE_EXE=%LOCALAPPDATA%\Microsoft\Edge\Application\msedge.exe"
set "UI_URL=http://127.0.0.1:%CODEX_UI_PORT%%CODEX_AUTO_OPEN_PATH%"
set "CODEX_EXISTING_HARNESS_REUSED=0"

echo [launcher] checking for existing harness on port %CODEX_UI_PORT%...
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "function Get-HarnessPids { param([int]$Port) $pids=@(); try { if(Get-Command Get-NetTCPConnection -ErrorAction SilentlyContinue){ $pids=@(Get-NetTCPConnection -LocalAddress '127.0.0.1' -LocalPort $Port -State Listen -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique) } } catch {}; if(-not $pids -or $pids.Count -eq 0){ $pattern=':'+$Port+'\s+.*LISTENING\s+(\d+)$'; $rows=@(netstat -ano -p tcp | Select-String -Pattern $pattern); foreach($row in $rows){ if($row.Matches.Count -gt 0){ $pids+=[int]$row.Matches[0].Groups[1].Value } } }; return @($pids | Select-Object -Unique) }; function Get-LatestHarnessRuntimeWriteTime { param([string]$LaunchFile,[string]$LaunchDir) $latest=$null; $candidates=@($LaunchFile,(Join-Path $LaunchDir 'server.js'),(Join-Path $LaunchDir 'scripts\lib'),(Join-Path $LaunchDir 'scripts\config'),(Join-Path $LaunchDir 'web\01.HarnesUI')); foreach($candidate in $candidates){ if(-not $candidate){ continue }; if(Test-Path $candidate -PathType Leaf){ $item=Get-Item $candidate -ErrorAction SilentlyContinue; if($item -and (-not $latest -or $item.LastWriteTimeUtc -gt $latest)){ $latest=$item.LastWriteTimeUtc } } elseif(Test-Path $candidate -PathType Container){ $item=Get-ChildItem $candidate -Recurse -File -ErrorAction SilentlyContinue | Sort-Object LastWriteTimeUtc -Descending | Select-Object -First 1; if($item -and (-not $latest -or $item.LastWriteTimeUtc -gt $latest)){ $latest=$item.LastWriteTimeUtc } } }; return $latest }; $port=[int]$env:CODEX_UI_PORT; $restart=$env:CODEX_RESTART_EXISTING_HARNESS; $forceActive=$env:CODEX_FORCE_ACTIVE_RESTART; $autoRestartStale=$env:CODEX_AUTO_RESTART_STALE_HARNESS; $runtimeUrl='http://127.0.0.1:'+$port+'/api/runtime'; $runtime=$null; try { $response=Invoke-WebRequest -UseBasicParsing -Uri $runtimeUrl -TimeoutSec 2; if($response.StatusCode -eq 200){ $runtime=$response.Content | ConvertFrom-Json } } catch {}; if(-not $runtime -or $runtime.mode -ne 'app-server'){ exit 0 }; $activeExec=0; try { $activeExec=[int]($runtime.activeExecRequests) } catch {}; $latestStatus=''; try { $latestStatus=''+$runtime.latestTurn.status } catch {}; $hasActive=($activeExec -gt 0) -or ($latestStatus -eq 'in_progress'); $pids=Get-HarnessPids -Port $port; $staleRuntime=$false; if($autoRestartStale -eq '1' -and $pids -and $pids.Count -gt 0){ $processStarts=@(); foreach($candidatePid in $pids){ try { $process=Get-Process -Id $candidatePid -ErrorAction Stop; if($process.StartTime){ $processStarts+=$process.StartTime.ToUniversalTime() } } catch {} }; if($processStarts.Count -gt 0){ $latestRuntimeWrite=Get-LatestHarnessRuntimeWriteTime -LaunchFile $env:CODEX_LAUNCH_FILE -LaunchDir $env:CODEX_LAUNCH_DIR; if($latestRuntimeWrite){ $oldestProcessStart=$processStarts | Sort-Object | Select-Object -First 1; if($latestRuntimeWrite -gt $oldestProcessStart){ $staleRuntime=$true } } } }; if($restart -eq '0' -and -not $staleRuntime){ Write-Output ('[launcher] existing harness detected on port '+$port+'; reusing without restart.'); exit 10 }; if($staleRuntime){ Write-Output ('[launcher] existing harness detected on port '+$port+' but runtime files are newer than the process; restarting stale harness.'); } elseif($restart -ne '0'){ Write-Output ('[launcher] existing harness restart requested on port '+$port+'.'); }; if($hasActive -and $forceActive -ne '1'){ if($staleRuntime){ Write-Output ('[launcher] existing harness is stale but has active /api/exec work; reusing until work is idle.'); } else { Write-Output ('[launcher] existing harness has active /api/exec work; refusing restart while work is in progress.'); }; exit 11 }; if(-not $pids -or $pids.Count -eq 0){ Write-Output ('[launcher] existing harness detected on port '+$port+', but owning PID was not resolved.'); exit 2 }; Write-Output ('[launcher] stopping existing harness on port '+$port+' (PID '+(($pids -join ', '))+')...'); foreach($candidatePid in $pids){ try { Stop-Process -Id $candidatePid -Force -ErrorAction Stop } catch { Write-Output ('[launcher] failed to stop PID '+$candidatePid+': '+$_.Exception.Message); exit 2 } }; $deadline=(Get-Date).AddSeconds(10); while((Get-Date) -lt $deadline){ Start-Sleep -Milliseconds 250; $stillRunning=$false; foreach($candidatePid in $pids){ if(Get-Process -Id $candidatePid -ErrorAction SilentlyContinue){ $stillRunning=$true; break } }; if(-not $stillRunning){ Write-Output ('[launcher] existing harness stopped.'); exit 0 } }; Write-Output ('[launcher] existing harness did not stop within timeout.'); exit 2"
set "HARNESS_PROBE_EXIT=%errorlevel%"
if "%HARNESS_PROBE_EXIT%"=="10" set "CODEX_EXISTING_HARNESS_REUSED=1"
if "%HARNESS_PROBE_EXIT%"=="11" set "CODEX_EXISTING_HARNESS_REUSED=1"
if not "%HARNESS_PROBE_EXIT%"=="0" if not "%HARNESS_PROBE_EXIT%"=="10" if not "%HARNESS_PROBE_EXIT%"=="11" (
  echo [ERROR] failed to reconcile the existing harness on port %CODEX_UI_PORT%.
  if "%CODEX_PAUSE_ON_EXIT%"=="1" (
    echo [launcher] press any key to close this window...
    pause >nul
  )
  exit /b 1
)

if "%LAUNCHER_AUTO_OPEN_BROWSER%"=="0" (
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

if "%CODEX_EXISTING_HARNESS_REUSED%"=="1" (
  if not "%LAUNCHER_AUTO_OPEN_BROWSER%"=="0" (
    echo [launcher] opening browser against the existing harness...
    start "" /b powershell -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -Command ^
      "$url='%UI_URL%'; $edge='%CODEX_EDGE_EXE%'; if($edge -and (Test-Path $edge)){ Start-Process -FilePath $edge -ArgumentList $url | Out-Null } else { Start-Process $url | Out-Null }"
  )
  echo [launcher] existing harness reused; no restart was performed.
  endlocal & exit /b 0
)

echo [launcher] starting UI server...
if not "%LAUNCHER_AUTO_OPEN_BROWSER%"=="0" (
  echo [launcher] waiting for server startup, then opening browser...
  start "" /b powershell -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -Command ^
    "$url='%UI_URL%'; $edge='%CODEX_EDGE_EXE%'; $deadline=(Get-Date).AddSeconds(20); while((Get-Date) -lt $deadline){ try { Invoke-WebRequest -UseBasicParsing -Uri $url -TimeoutSec 2 | Out-Null; break } catch { Start-Sleep -Milliseconds 500 } }; if($edge -and (Test-Path $edge)){ Start-Process -FilePath $edge -ArgumentList $url | Out-Null } else { Start-Process $url | Out-Null }"
)
set "CODEX_AUTO_OPEN_BROWSER=0"
set /a "CODEX_SERVER_RESTART_ATTEMPT=0"
set "EXIT_CODE=0"
set "CODEX_SERVER_RESTART_STOP_REASON="
set "CODEX_SERVER_UPTIME_SECONDS=0"

:launcher_server_run
for /f %%I in ('powershell -NoProfile -ExecutionPolicy Bypass -Command "[DateTimeOffset]::UtcNow.ToUnixTimeSeconds()"') do set "CODEX_SERVER_LAST_START_TS=%%I"
node "%~dp0server.js"
set "EXIT_CODE=%errorlevel%"
for /f %%I in ('powershell -NoProfile -ExecutionPolicy Bypass -Command "$start=[int64]$env:CODEX_SERVER_LAST_START_TS; $now=[DateTimeOffset]::UtcNow.ToUnixTimeSeconds(); [Math]::Max(0,($now-$start))"') do set "CODEX_SERVER_UPTIME_SECONDS=%%I"
for /f %%I in ('powershell -NoProfile -ExecutionPolicy Bypass -Command "$uptime=[int64]$env:CODEX_SERVER_UPTIME_SECONDS; $stable=[int64]$env:CODEX_SERVER_STABLE_WINDOW_SECONDS; if($uptime -ge $stable){ 1 } else { 0 }"') do set "CODEX_SERVER_WAS_STABLE=%%I"
if "%EXIT_CODE%"=="0" (
  set "CODEX_SERVER_RESTART_STOP_REASON=clean_exit"
  goto server_done
)
if "%CODEX_SERVER_WAS_STABLE%"=="1" set /a "CODEX_SERVER_RESTART_ATTEMPT=0"
set /a "CODEX_SERVER_RESTART_ATTEMPT+=1"
if %CODEX_SERVER_RESTART_ATTEMPT% GTR %CODEX_SERVER_RESTART_MAX_RETRIES% (
  set "CODEX_SERVER_RESTART_STOP_REASON=budget_exhausted"
  goto server_done
)
echo [launcher] server.js exited with code %EXIT_CODE%; restarting in %CODEX_SERVER_RESTART_DELAY_MS%ms (attempt %CODEX_SERVER_RESTART_ATTEMPT%/%CODEX_SERVER_RESTART_MAX_RETRIES%, uptime %CODEX_SERVER_UPTIME_SECONDS%s)...
powershell -NoProfile -ExecutionPolicy Bypass -Command "Start-Sleep -Milliseconds ([Math]::Max(250,[int]$env:CODEX_SERVER_RESTART_DELAY_MS))"
goto launcher_server_run

:server_done
if not "%EXIT_CODE%"=="0" (
  echo [ERROR] server.js exited with code: %EXIT_CODE%
  if "%CODEX_SERVER_RESTART_STOP_REASON%"=="budget_exhausted" echo [launcher] auto-restart budget exhausted ^(%CODEX_SERVER_RESTART_ATTEMPT%/%CODEX_SERVER_RESTART_MAX_RETRIES%^).
)
if "%EXIT_CODE%"=="0" (
  echo [launcher] server.js exited with code: 0
)
if "%CODEX_PAUSE_ON_EXIT%"=="1" (
  echo [launcher] press any key to close this window...
  pause >nul
)

endlocal & exit /b %EXIT_CODE%
