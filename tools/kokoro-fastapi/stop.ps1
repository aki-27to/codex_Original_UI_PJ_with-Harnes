$ErrorActionPreference = "Stop"
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Push-Location $scriptDir
try {
  cmd /c "docker compose -f docker-compose.yml down"
} finally {
  Pop-Location
}
