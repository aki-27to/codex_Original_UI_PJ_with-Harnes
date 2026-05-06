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

Normal `.bat` startup also opens that URL in Microsoft Edge. To disable browser launch:

```bat
set CODEX_KOE_SCRIBE_OPEN_BROWSER=0
start_koe_scribe.bat
```

To pin a port manually:

```bat
set CODEX_KOE_SCRIBE_PORT=57526
start_koe_scribe.bat
```

Leaving `CODEX_KOE_SCRIBE_PORT` unset is safer when other Codex apps or servers are running.

## Current Engine Boundary

The UI exposes one engine: `Codex App transcription`. KoeScribe does not ask the user to choose between Whisper, local Whisper, and GPT transcription modes.

The isolated `/api/exec` route stays local to the KoeScribe process. With the default provider, KoeScribe first tries the Codex App Server app bridge. If that bridge is unavailable and `OPENAI_API_KEY` exists, KoeScribe falls back to OpenAI Audio Transcriptions. It does not silently treat Windows Speech as a high-accuracy result.

- Default Codex App Server URL: `http://127.0.0.1:57525`
- Readiness probe: `GET /api/runtime`
- Preferred transcription bridge: `POST /api/apps/koe-scribe/structured`
- High-accuracy fallback: OpenAI Audio Transcriptions when `OPENAI_API_KEY` is configured
- Override URL: set `CODEX_KOE_SCRIBE_CODEX_APP_URL`
- Default provider: `codex-app`
- Force local Windows Speech: set `CODEX_KOE_SCRIBE_PROVIDER=windows-speech`
- Allow low-quality Windows Speech fallback from `codex-app`: set `CODEX_KOE_SCRIBE_ALLOW_WINDOWS_SPEECH=1`
- Optional direct OpenAI provider: set `CODEX_KOE_SCRIBE_PROVIDER=direct-openai`

When a media file is selected in the browser and the local path field is empty, the UI prepares local WAV audio in the browser before upload. The server saves that WAV under `.runtime/<instance-id>/uploads/<upload-id>/` and passes the saved local path into the job. This avoids the browser path limitation.

With the default `codex-app` provider, KoeScribe does not require `OPENAI_API_KEY` only when the Codex App Server bridge is available and able to do real transcription. If that bridge is missing or blocked, `OPENAI_API_KEY` is the high-accuracy fallback. Without either path, the app reports a blocked state instead of returning garbage text.

The local Windows Speech fallback depends on the Windows recognizers installed on the machine. It is not the default because long Japanese videos with technical terms can produce unusable text. Use it only for explicit low-quality local experiments.

Direct OpenAI mode is still available for explicit local API-key use:

- Set `CODEX_KOE_SCRIBE_PROVIDER=direct-openai`
- Default internal model: `gpt-4o-transcribe`.
- Override model: set `CODEX_KOE_SCRIBE_OPENAI_MODEL` before starting the app.
- Required API key in this mode only: `OPENAI_API_KEY`.
- Output files are written to the selected output directory, or to the per-run `.runtime/.../jobs/<run-id>/` directory when no output directory is selected.

Those workers should write only into per-run directories under `.runtime/<instance-id>/jobs/<run-id>/` unless the user explicitly chooses an output folder.

## Safety Boundary

- The app never uploads media from the browser by itself.
- The visible run action is the opt-in path for the fixed Codex App transcription route.
- Original videos must not be overwritten.
- Missing dependencies should be reported as blocked work, not installed silently.
- Shared Codex `/api/exec` stays disabled for the standalone route. KoeScribe uses the app bridge route when available and a high-accuracy OpenAI fallback when configured.

## Browser Path Limitation

Browsers do not expose the absolute path of a selected local file. KoeScribe avoids the double entry problem by copying the selected media file into its app-local `.runtime` directory before execution. The local path field is only for advanced cases where you want the worker to read an existing file path directly.
