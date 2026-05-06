param(
  [Parameter(Mandatory = $true)]
  [string]$AudioPath,

  [string]$Culture = "ja-JP"
)

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)

if (-not (Test-Path -LiteralPath $AudioPath)) {
  throw "Audio file not found: $AudioPath"
}

Add-Type -AssemblyName System.Speech

$recognizerInfo = [System.Speech.Recognition.SpeechRecognitionEngine]::InstalledRecognizers() |
  Where-Object { $_.Culture.Name -eq $Culture } |
  Select-Object -First 1

if ($null -eq $recognizerInfo) {
  $recognizerInfo = [System.Speech.Recognition.SpeechRecognitionEngine]::InstalledRecognizers() |
    Select-Object -First 1
}

if ($null -eq $recognizerInfo) {
  throw "No Windows Speech recognizer is installed."
}

function New-KoeSpeechRecognitionEngine {
  param(
    [Parameter(Mandatory = $true)]
    [System.Speech.Recognition.RecognizerInfo]$RecognizerInfo
  )

  $attempts = @(
    { New-Object -TypeName System.Speech.Recognition.SpeechRecognitionEngine -ArgumentList $RecognizerInfo.Id },
    { New-Object -TypeName System.Speech.Recognition.SpeechRecognitionEngine -ArgumentList $RecognizerInfo },
    { New-Object -TypeName System.Speech.Recognition.SpeechRecognitionEngine -ArgumentList $RecognizerInfo.Culture },
    { New-Object -TypeName System.Speech.Recognition.SpeechRecognitionEngine }
  )

  $lastError = $null
  foreach ($attempt in $attempts) {
    try {
      return & $attempt
    }
    catch {
      $lastError = $_
    }
  }

  throw "Failed to create Windows Speech recognizer: $($lastError.Exception.Message)"
}

$engine = New-KoeSpeechRecognitionEngine -RecognizerInfo $recognizerInfo
$segments = New-Object System.Collections.Generic.List[object]

try {
  $dictation = New-Object System.Speech.Recognition.DictationGrammar
  $engine.LoadGrammar($dictation)
  $engine.SetInputToWaveFile($AudioPath)

  while ($true) {
    $result = $engine.Recognize()
    if ($null -eq $result) {
      break
    }
    $text = [string]$result.Text
    if (-not [string]::IsNullOrWhiteSpace($text)) {
      $start = 0.0
      $end = 0.0
      if ($null -ne $result.Audio) {
        $audioPosition = [double]$result.Audio.AudioPosition.TotalSeconds
        $audioDuration = [double]$result.Audio.Duration.TotalSeconds
        $start = [Math]::Max([double]0, $audioPosition)
        $end = [Math]::Max($start, $start + $audioDuration)
      }
      $segments.Add([pscustomobject]@{
        start = $start
        end = $end
        text = $text
        confidence = [double]$result.Confidence
      })
    }
  }
}
finally {
  $engine.Dispose()
}

$segmentArray = @()
foreach ($segment in $segments) {
  $segmentArray += $segment
}

$fullText = ($segmentArray | ForEach-Object { $_.text }) -join "`n"
$payload = [ordered]@{
  ok = [bool]$true
  recognizer = [string]$recognizerInfo.Description
  culture = [string]$recognizerInfo.Culture.Name
  text = [string]$fullText
  segments = $segmentArray
}

$payload | ConvertTo-Json -Depth 6 -Compress
