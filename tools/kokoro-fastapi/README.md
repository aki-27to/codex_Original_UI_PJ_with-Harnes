# Kokoro FastAPI (Docker)

Local OpenAI-compatible TTS server using:

- `ghcr.io/remsky/kokoro-fastapi-cpu:latest`

## Prerequisites

- Docker Desktop is installed and running.
- Docker daemon is reachable (`docker info` succeeds).

## Setup (Recommended)

```powershell
cd tools/kokoro-fastapi
powershell -ExecutionPolicy Bypass -File .\start.ps1
```

Optional flags:

```powershell
powershell -ExecutionPolicy Bypass -File .\start.ps1 -SkipPull
powershell -ExecutionPolicy Bypass -File .\start.ps1 -Port 8880 -HealthTimeoutSec 180
powershell -ExecutionPolicy Bypass -File .\smoke_test_speech.ps1 -Voice jf_alpha -LangCode j -Text "こんにちは。音声テストです。" -OutFile ".\sample_ja.mp3"
```

## Manual Setup

```powershell
cd tools/kokoro-fastapi
Copy-Item .env.example .env -ErrorAction SilentlyContinue
docker compose pull
docker compose up -d
```

## Verify

```powershell
cd tools/kokoro-fastapi
docker compose ps
Invoke-WebRequest -Uri "http://127.0.0.1:8880/docs" -UseBasicParsing | Select-Object -ExpandProperty StatusCode
Invoke-RestMethod -Uri "http://127.0.0.1:8880/v1/models"
```

OpenAI-compatible speech generation example:

```powershell
$body = @{
  model = "kokoro"
  input = "Hello from local Kokoro FastAPI."
  voice = "af_alloy"
} | ConvertTo-Json

Invoke-RestMethod `
  -Method Post `
  -Uri "http://127.0.0.1:8880/v1/audio/speech" `
  -ContentType "application/json" `
  -Body $body `
  -OutFile ".\\sample.mp3"
```

Shortcut:

```powershell
cd tools/kokoro-fastapi
powershell -ExecutionPolicy Bypass -File .\smoke_test_speech.ps1
```

## Stop / Cleanup

```powershell
cd tools/kokoro-fastapi
powershell -ExecutionPolicy Bypass -File .\stop.ps1
```

Remove cached models:

```powershell
Remove-Item -Recurse -Force .\cache
```
