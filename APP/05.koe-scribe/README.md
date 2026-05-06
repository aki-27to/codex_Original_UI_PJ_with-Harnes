# KoeScribe

KoeScribe is a native-static app for high-accuracy video transcription and subtitle generation.

## Overview Design

KoeScribe keeps the browser UI thin and sends real work through the shared harness route:

- UI layer: `index.html`, `styles.css`, `app.js`
- App registry: `app.manifest.json`
- Runtime route: `POST /apps/koe-scribe/api/exec`, rewritten by the harness to `POST /api/exec`
- Execution source: `app_koe_scribe`
- Working directory: `APP/05.koe-scribe`

## Processing Model

The app does not add a custom local orchestration endpoint. A job prompt is built from:

- local video path
- output directory
- transcription engine
- language
- output formats
- glossary
- external API consent

The Codex runtime then decides the concrete tool path inside the standard `/api/exec` contract.

## Engine Boundary

- `OpenAI whisper-1 / SRT`: use when external API upload is allowed and subtitle files are required.
- `OpenAI gpt-4o-transcribe / text`: use when transcript quality is more important than direct SRT output.
- `Local Whisper / whisper.cpp`: use when media must stay local.
- `Plan only`: create a reproducible execution plan without processing the media.

## Safety Boundary

- The app never uploads media from the browser by itself.
- External API processing requires the visible `externalApiConsent` checkbox.
- Missing dependencies are reported as blocked work; the job prompt tells Codex not to install tools silently.
- Original videos must not be overwritten.

## Current Limitation

Browsers do not expose the absolute path of a selected local file. For runtime execution, paste the local path into the `ローカルパス` field.
