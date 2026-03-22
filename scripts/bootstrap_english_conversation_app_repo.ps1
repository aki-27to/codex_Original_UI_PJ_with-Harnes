param(
  [string]$TargetRoot,
  [switch]$Force
)

$ErrorActionPreference = "Stop"

$workspaceRoot = Split-Path $PSScriptRoot -Parent
$defaultTargetRoot = Join-Path (Split-Path $workspaceRoot -Parent) "english-conversation-app"
$sourceRoot = Join-Path $workspaceRoot "web\\english-conversation-app"
$resolvedTargetRoot = if ($TargetRoot) { $TargetRoot } else { $defaultTargetRoot }

if (-not (Test-Path -LiteralPath $sourceRoot)) {
  throw "Source app directory was not found: $sourceRoot"
}

if (Test-Path -LiteralPath $resolvedTargetRoot) {
  $targetItem = Get-Item -LiteralPath $resolvedTargetRoot
  if (-not $targetItem.PSIsContainer) {
    throw "Target path exists and is not a directory: $resolvedTargetRoot"
  }
  $hasExistingContent = (Get-ChildItem -LiteralPath $resolvedTargetRoot -Force | Measure-Object).Count -gt 0
  if ($hasExistingContent -and -not $Force) {
    throw "Target directory already exists and is not empty. Re-run with -Force to overwrite: $resolvedTargetRoot"
  }
} else {
  New-Item -ItemType Directory -Path $resolvedTargetRoot | Out-Null
}

Copy-Item -Path (Join-Path $sourceRoot "*") -Destination $resolvedTargetRoot -Recurse -Force

Write-Output "[bootstrap] source: $sourceRoot"
Write-Output "[bootstrap] target: $resolvedTargetRoot"
Write-Output "[bootstrap] complete"
Write-Output ("[bootstrap] start the main harness with: {0}" -f (Join-Path $workspaceRoot "start_codex_ui.bat"))
Write-Output "[bootstrap] then open: http://127.0.0.1:57525/english-conversation-app/index.html"
