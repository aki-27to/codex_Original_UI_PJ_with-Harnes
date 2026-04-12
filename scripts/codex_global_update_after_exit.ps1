param(
  [string]$PackageSpec = "@openai/codex",
  [int]$RetrySeconds = 5,
  [switch]$DryRun
)

$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$logDir = Join-Path $repoRoot "logs"
$timeStamp = Get-Date -Format "yyyyMMdd_HHmmss"
$logPath = Join-Path $logDir ("codex_global_update_after_exit_{0}.log" -f $timeStamp)
$statusPath = Join-Path $logDir "codex_global_update_after_exit.status.txt"
$npmRoot = Join-Path $env:APPDATA "npm"
$openAiRoot = Join-Path $npmRoot "node_modules\\@openai"
$installRoot = Join-Path $openAiRoot "codex"
$binaryPath = Join-Path $installRoot "node_modules\\@openai\\codex-win32-x64\\vendor\\x86_64-pc-windows-msvc\\codex\\codex.exe"
$npmCmd = Join-Path $env:ProgramFiles "nodejs\\npm.cmd"
$codexCmd = Join-Path $npmRoot "codex.cmd"

if (-not (Test-Path -LiteralPath $logDir)) {
  New-Item -ItemType Directory -Path $logDir | Out-Null
}

function Write-Status {
  param([string]$Message)

  $line = "[{0}] {1}" -f (Get-Date -Format "yyyy-MM-dd HH:mm:ss"), $Message
  $line | Tee-Object -FilePath $logPath -Append | Out-Null
  Set-Content -LiteralPath $statusPath -Value $line -Encoding UTF8
}

function Test-BinaryUnlocked {
  param([string]$Path)

  if (-not (Test-Path -LiteralPath $Path)) {
    return $true
  }

  $stream = $null
  try {
    $stream = [System.IO.File]::Open($Path, [System.IO.FileMode]::Open, [System.IO.FileAccess]::Read, [System.IO.FileShare]::None)
    return $true
  } catch [System.Exception] {
    return $false
  } finally {
    if ($null -ne $stream) {
      $stream.Dispose()
    }
  }
}

function Remove-StaleArtifacts {
  $cleanupRoots = @($npmRoot, $openAiRoot)
  foreach ($root in $cleanupRoots) {
    if (-not (Test-Path -LiteralPath $root)) {
      continue
    }

    Get-ChildItem -LiteralPath $root -Force | Where-Object { $_.Name -like ".codex*" } | ForEach-Object {
      Write-Status ("Removing stale retired artifact: {0}" -f $_.FullName)
      try {
        Remove-Item -LiteralPath $_.FullName -Recurse -Force -ErrorAction Stop
      } catch {
        Write-Status ("Cleanup skipped for now: {0}" -f $_.Exception.Message)
      }
    }
  }
}

function Invoke-AndLog {
  param(
    [string]$FilePath,
    [string[]]$ArgumentList
  )

  Write-Status ("Running: {0} {1}" -f $FilePath, ($ArgumentList -join " "))
  $output = & $FilePath @ArgumentList 2>&1
  $outputText = @()
  if ($null -ne $output) {
    foreach ($line in $output) {
      $outputText += [string]$line
      Tee-Object -FilePath $logPath -Append -InputObject $line | Out-Null
    }
  }

  if ($LASTEXITCODE -ne 0) {
    throw ("Command failed with exit code {0}: {1} {2} :: {3}" -f $LASTEXITCODE, $FilePath, ($ArgumentList -join " "), ($outputText -join " | "))
  }
}

try {
  Write-Status ("Watcher started. DryRun={0}" -f [bool]$DryRun)
  Write-Status ("Codex binary path: {0}" -f $binaryPath)

  if ($DryRun) {
    Write-Status ("Binary unlocked now: {0}" -f (Test-BinaryUnlocked -Path $binaryPath))
    Write-Status ("Dry run complete.")
    exit 0
  }

  if (-not (Test-Path -LiteralPath $npmCmd)) {
    $npmCmd = "npm.cmd"
  }

  $attempt = 0
  while ($true) {
    $attempt += 1
    Write-Status ("Update attempt #{0}. Binary unlocked now: {1}" -f $attempt, (Test-BinaryUnlocked -Path $binaryPath))
    Remove-StaleArtifacts

    try {
      Invoke-AndLog -FilePath $npmCmd -ArgumentList @("install", "-g", $PackageSpec)
      break
    } catch {
      $message = $_.Exception.Message
      if ($message -notmatch "EBUSY|EPERM|resource busy|locked") {
        throw
      }

      Write-Status ("Retryable update failure. Waiting {0}s before retry. {1}" -f $RetrySeconds, $message)
      Start-Sleep -Seconds $RetrySeconds
    }
  }

  if (Test-Path -LiteralPath $codexCmd) {
    Invoke-AndLog -FilePath $codexCmd -ArgumentList @("--version")
  } else {
    Write-Status ("Version check skipped because {0} was not found." -f $codexCmd)
  }

  Write-Status "Codex global update completed successfully."
  exit 0
} catch {
  Write-Status ("FAILED: {0}" -f $_.Exception.Message)
  throw
}
