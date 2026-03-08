param(
  [switch]$SkipPull,
  [int]$Port = 8880,
  [int]$HealthTimeoutSec = 120
)

$ErrorActionPreference = "Stop"
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Push-Location $scriptDir
try {
  Write-Host "[kokoro-fastapi] checking docker daemon..."
  cmd /c "docker info >nul 2>nul" | Out-Null
  if ($LASTEXITCODE -ne 0) {
    Write-Host "[kokoro-fastapi] Docker daemon is not reachable. Start Docker Desktop first."
    exit 1
  }

  if (-not (Test-Path ".env")) {
    Copy-Item ".env.example" ".env"
  }

  if (-not $SkipPull) {
    Write-Host "[kokoro-fastapi] pulling image..."
    cmd /c "docker compose -f docker-compose.yml pull"
    if ($LASTEXITCODE -ne 0) {
      Write-Host "[kokoro-fastapi] docker compose pull failed."
      exit $LASTEXITCODE
    }
  }

  Write-Host "[kokoro-fastapi] starting container..."
  cmd /c "docker compose -f docker-compose.yml up -d"
  if ($LASTEXITCODE -ne 0) {
    Write-Host "[kokoro-fastapi] docker compose up failed."
    exit $LASTEXITCODE
  }

  $docsUrl = "http://127.0.0.1:$Port/docs"
  $modelsUrl = "http://127.0.0.1:$Port/v1/models"
  $deadline = (Get-Date).AddSeconds($HealthTimeoutSec)
  $healthy = $false

  Write-Host "[kokoro-fastapi] waiting for health endpoint..."
  while ((Get-Date) -lt $deadline) {
    try {
      $resp = Invoke-WebRequest -Uri $docsUrl -UseBasicParsing -TimeoutSec 5
      if ($resp.StatusCode -eq 200) {
        $healthy = $true
        break
      }
    } catch {
      Start-Sleep -Seconds 2
    }
  }

  if (-not $healthy) {
    Write-Host "[kokoro-fastapi] Health check timeout on $docsUrl"
    exit 1
  }

  Write-Host "[kokoro-fastapi] health check: PASS ($docsUrl)"
  Write-Host "[kokoro-fastapi] models endpoint:"
  Invoke-RestMethod -Uri $modelsUrl
} finally {
  Pop-Location
}
