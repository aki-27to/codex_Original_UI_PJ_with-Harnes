param(
  [string]$Url = "http://127.0.0.1:8880",
  [string]$Voice = "af_alloy",
  [string]$Model = "kokoro",
  [string]$Text = "Hello from local Kokoro FastAPI.",
  [string]$LangCode = "",
  [ValidateSet("wav","mp3","flac","opus","aac","pcm")]
  [string]$ResponseFormat = "mp3",
  [string]$OutFile = ".\\sample.mp3"
)

$ErrorActionPreference = "Stop"

$body = @{
  model = $Model
  input = $Text
  voice = $Voice
  response_format = "mp3"
  download_format = $ResponseFormat
  return_download_link = $true
}

if ($LangCode) {
  $body["lang_code"] = $LangCode
}

$body = $body | ConvertTo-Json
$bodyBytes = [System.Text.Encoding]::UTF8.GetBytes($body)

$tempOut = [System.IO.Path]::GetTempFileName()
$resp = Invoke-WebRequest `
  -Method Post `
  -Uri "$Url/v1/audio/speech" `
  -UseBasicParsing `
  -ContentType "application/json; charset=utf-8" `
  -Body $bodyBytes `
  -OutFile $tempOut `
  -PassThru

$downloadPath = $resp.Headers["X-Download-Path"]
if ($downloadPath) {
  $downloadCandidates = @("$Url$downloadPath")
  if ($downloadPath.StartsWith("/download/")) {
    $downloadCandidates += "$Url/v1$downloadPath"
  }

  $downloaded = $false
  foreach ($downloadUrl in $downloadCandidates) {
    try {
      Invoke-WebRequest -Uri $downloadUrl -UseBasicParsing -OutFile $OutFile
      $downloaded = $true
      break
    } catch {
      continue
    }
  }

  if (-not $downloaded) {
    Move-Item -Force $tempOut $OutFile
    $tempOut = $null
    Write-Host "Download link failed; saved streamed response instead."
  }
} else {
  Move-Item -Force $tempOut $OutFile
  $tempOut = $null
}

if ($tempOut -and (Test-Path $tempOut)) {
  Remove-Item -Force $tempOut
}

$item = Get-Item $OutFile
Write-Host "Generated: $($item.FullName) ($($item.Length) bytes)"

$bytes = [System.IO.File]::ReadAllBytes($OutFile)
if ($bytes.Length -ge 3 -and $bytes[0] -eq 0x49 -and $bytes[1] -eq 0x44 -and $bytes[2] -eq 0x33) {
  Write-Host "Detected output format: mp3 (ID3 header)"
}
