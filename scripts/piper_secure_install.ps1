param(
  [string]$Url = "",
  [string]$Sha256 = "",
  [string]$WorkspaceRoot = "",
  [string]$OutputPath = "",
  [switch]$AllowAnyHost,
  [switch]$Help,
  [switch]$Force
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Resolve-WorkspaceRoot {
  param([string]$InputRoot)
  if ($InputRoot -and $InputRoot.Trim()) {
    return (Resolve-Path -LiteralPath $InputRoot).Path
  }
  return (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot "..")).Path
}

function Assert-UrlIsSafe {
  param(
    [uri]$Uri,
    [bool]$AllowAny
  )
  if (-not $Uri.IsAbsoluteUri) {
    throw "Url must be absolute."
  }
  if ($Uri.Scheme -ne "https") {
    throw "Only https is allowed."
  }
  if ($AllowAny) {
    return
  }
  $allowedHosts = @(
    "github.com",
    "objects.githubusercontent.com",
    "release-assets.githubusercontent.com",
    "huggingface.co"
  )
  $targetHost = ($Uri.Host | ForEach-Object { $_.ToLowerInvariant() })
  if (-not ($allowedHosts -contains $targetHost)) {
    throw "Host '$targetHost' is not in allowlist. Use -AllowAnyHost to override intentionally."
  }
}

function Normalize-Hash {
  param([string]$Value)
  $normalized = ($Value -replace "\s", "").ToLowerInvariant()
  if ($normalized.Length -ne 64 -or $normalized -notmatch '^[0-9a-f]{64}$') {
    throw "Sha256 must be a 64-char hex string."
  }
  return $normalized
}

function Ensure-Directory {
  param([string]$PathValue)
  if (-not (Test-Path -LiteralPath $PathValue)) {
    New-Item -ItemType Directory -Path $PathValue | Out-Null
  }
}

function Show-Usage {
  Write-Host "Usage:"
  Write-Host "  powershell -ExecutionPolicy Bypass -File scripts/piper_secure_install.ps1"
  Write-Host "    -Url <https-url-to-piper-.zip/.exe> -Sha256 <64hex> [options]"
  Write-Host ""
  Write-Host "Options:"
  Write-Host "  -WorkspaceRoot <path>   Default: repo root"
  Write-Host "  -OutputPath <path>      Default: tools\piper\piper.exe"
  Write-Host "  -AllowAnyHost           Disable host allowlist"
  Write-Host "  -Force                  Overwrite destination"
}

function Resolve-PiperExeFromArchive {
  param([string]$ExtractDir)
  $candidates = Get-ChildItem -LiteralPath $ExtractDir -Recurse -File -ErrorAction Stop | Where-Object {
    $_.Name -ieq "piper.exe" -or $_.Name -ieq "piper"
  }
  if (-not $candidates -or $candidates.Count -eq 0) {
    throw "Archive did not contain piper.exe or piper."
  }
  # Prefer exact piper.exe on Windows when available
  $exactExe = $candidates | Where-Object { $_.Name -ieq "piper.exe" } | Select-Object -First 1
  if ($exactExe) {
    return $exactExe.FullName
  }
  return ($candidates | Select-Object -First 1).FullName
}

if ($Help.IsPresent) {
  Show-Usage
  exit 0
}
if (-not $Url.Trim() -or -not $Sha256.Trim()) {
  Show-Usage
  throw "Both -Url and -Sha256 are required."
}

$root = Resolve-WorkspaceRoot -InputRoot $WorkspaceRoot
$uri = [uri]$Url
Assert-UrlIsSafe -Uri $uri -AllowAny:$AllowAnyHost.IsPresent
$expectedHash = Normalize-Hash -Value $Sha256

$destPath = $OutputPath
if (-not $destPath -or -not $destPath.Trim()) {
  $destPath = Join-Path $root "tools\piper\piper.exe"
}
$destPath = [System.IO.Path]::GetFullPath($destPath)

if ((Test-Path -LiteralPath $destPath) -and -not $Force.IsPresent) {
  throw "Destination already exists: $destPath (use -Force to overwrite)"
}

$tmpRoot = Join-Path $env:TEMP ("codex_piper_install_" + [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds())
Ensure-Directory -PathValue $tmpRoot
$downloadPath = Join-Path $tmpRoot (Split-Path -Leaf $uri.AbsolutePath)
if (-not $downloadPath.EndsWith(".zip", [System.StringComparison]::OrdinalIgnoreCase) -and
    -not $downloadPath.EndsWith(".exe", [System.StringComparison]::OrdinalIgnoreCase)) {
  # keep deterministic extension for unknown names
  $downloadPath = $downloadPath + ".bin"
}

Write-Host "[piper-install] workspace: $root"
Write-Host "[piper-install] source: $Url"
Write-Host "[piper-install] destination: $destPath"

try {
  Invoke-WebRequest -Uri $uri.AbsoluteUri -OutFile $downloadPath -UseBasicParsing
  $actualHash = (Get-FileHash -LiteralPath $downloadPath -Algorithm SHA256).Hash.ToLowerInvariant()
  if ($actualHash -ne $expectedHash) {
    throw "SHA256 mismatch. expected=$expectedHash actual=$actualHash"
  }

  $resolvedSource = $downloadPath
  if ($downloadPath.EndsWith(".zip", [System.StringComparison]::OrdinalIgnoreCase)) {
    $extractDir = Join-Path $tmpRoot "extract"
    Ensure-Directory -PathValue $extractDir
    Expand-Archive -LiteralPath $downloadPath -DestinationPath $extractDir -Force
    $resolvedSource = Resolve-PiperExeFromArchive -ExtractDir $extractDir
  }

  $destDir = Split-Path -Parent $destPath
  Ensure-Directory -PathValue $destDir
  if (Test-Path -LiteralPath $destPath) {
    Remove-Item -LiteralPath $destPath -Force
  }
  Copy-Item -LiteralPath $resolvedSource -Destination $destPath -Force
  Unblock-File -LiteralPath $destPath -ErrorAction SilentlyContinue

  $finalHash = (Get-FileHash -LiteralPath $destPath -Algorithm SHA256).Hash.ToLowerInvariant()
  Write-Host "[piper-install] installed: $destPath"
  Write-Host "[piper-install] sha256: $finalHash"
  Write-Host "[piper-install] next: node scripts/piper_runtime_doctor.js --model en_US-lessac-high"
  exit 0
} finally {
  try {
    Remove-Item -LiteralPath $tmpRoot -Recurse -Force -ErrorAction SilentlyContinue
  } catch {
    # ignore cleanup failure
  }
}
