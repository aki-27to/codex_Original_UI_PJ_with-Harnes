# KoeScribe

KoeScribe is a standalone local app shell for high-accuracy video transcription and subtitle generation planning.

## Isolation Design

The default launcher no longer uses the shared Codex App Server preview route.

- Static UI: `index.html`, `styles.css`, `app.js`
- Dedicated runtime: `standalone_server.js`
- Launcher: `start_koe_scribe.bat`
- Local route: `POST /api/exec` served by the KoeScribe process itself
- Shared harness dispatch: disabled
- Default port: `0`, which asks Windows to choose a free port
- Runtime state: `.runtime/<instance-id>/` under this app folder

This prevents the normal app-level conflicts:

- no fixed-port collision by default
- no `/apps/koe-scribe` mount or app-registry dependency for `.bat` launch
- no proxy to the shared harness `POST /api/exec`
- no shared output path for internal job state; each request gets its own job directory
- no need to paste a local path when a browser-selected media file is available

The only remaining contention is physical machine capacity such as CPU, disk, memory, and network bandwidth. A local app can avoid route, port, and runtime-dispatch conflicts, but it cannot make the operating system resources infinite.

## Startup

Double-click:

```bat
start_koe_scribe.bat
```

The command window prints the actual URL after startup, for example:

```text
[koe-scribe] URL: http://127.0.0.1:51234/
```

To pin a port manually:

```bat
set CODEX_KOE_SCRIBE_PORT=57526
start_koe_scribe.bat
```

Leaving `CODEX_KOE_SCRIBE_PORT` unset is safer when other Codex apps or servers are running.

## Current Engine Boundary

The UI exposes one engine: `Codex / OpenAI transcription`. KoeScribe does not ask the user to choose between Whisper, local Whisper, and GPT transcription modes.

The isolated `/api/exec` route deliberately does not call the shared Codex runtime. It currently accepts the request, records isolated job metadata, and returns a structured result explaining the missing transcription engine.

When a media file is selected in the browser and the local path field is empty, the UI first uploads that file to the standalone server. The server saves it under `.runtime/<instance-id>/uploads/<upload-id>/` and passes that saved local path into the job.

Actual speech-to-text execution should be added as the dedicated Codex/OpenAI transcription worker behind this standalone server:

- ffmpeg extraction and chunking worker
- OpenAI transcription worker
- subtitle/Markdown post-processing worker

Those workers should write only into per-run directories under `.runtime/<instance-id>/jobs/<run-id>/` unless the user explicitly chooses an output folder.

## Safety Boundary

- The app never uploads media from the browser by itself.
- The visible run action is the opt-in path for the fixed Codex/OpenAI transcription route.
- Original videos must not be overwritten.
- Missing dependencies should be reported as blocked work, not installed silently.
- Shared Codex `/api/exec` must stay disabled in standalone mode.

## Browser Path Limitation

Browsers do not expose the absolute path of a selected local file. KoeScribe avoids the double entry problem by copying the selected media file into its app-local `.runtime` directory before execution. The local path field is only for advanced cases where you want the worker to read an existing file path directly.
