# Electron HarnesUI Foundation

This is the desktop UI lane for HarnesUI. It adds an Electron shell and a React/Vite renderer while preserving the existing Harnes backend and the current web UI as the compatibility fallback.

## What Stays Unchanged

- `server.js` / `server_impl.js` remain the backend entrypoint.
- `POST /api/exec` remains the execution route.
- `POST /api/eval/run` remains the evaluation route.
- `/api/runtime` remains the runtime status route.
- `web/01.HarnesUI/index.html` remains available as the compatibility UI.
- Port `57525` remains the default local Harnes port.

## Added Surfaces

- `desktop/harnes-electron/main.cjs`: Electron main process. It reuses a running Harnes backend when one exists, or starts `server.js` with browser auto-open disabled.
- `desktop/harnes-electron/preload.cjs`: safe bridge for backend status, `/api/runtime`, proposal manifest reads, current logs, diagnostics, workspace lock/unlock, `/api/exec` submission, cancellation, restart, and local URL opening.
- `desktop/harnes-electron/src/`: React/Vite renderer.
- `scripts/electron_harnesui_static_test.js`: static contract check.
- `scripts/electron_harnesui_smoke_test.js`: Electron startup smoke test.
- `scripts/electron_harnesui_monkey_test.js`: Electron renderer monkey and visual-layout check across wide, 1100px, and minimum-width windows.

## Commands

When the user says "Harnes APP", "ハーネスAPP", "desktop app", or "デスクトップアプリ", launch this Electron lane. Do not substitute the web/HTML compatibility UI unless the user explicitly asks for Web, HTML, browser, or backend-only startup.

```powershell
npm run harnes:app
```

Or on Windows:

```powershell
.\start_harnes_desktop_app.bat
```

Both routes build the renderer and open the Electron desktop UI.

```powershell
npm run electron:harnes
```

Build the renderer and open the Electron desktop UI.

For the Web compatibility lane, use `npm run harnes:web`, `start_codex_ui.bat`, or `/01.HarnesUI/index.html` only when Web/HTML/browser startup is explicitly requested.

```powershell
npm run electron:harnes:build
npm run test:electron-harnesui
npm run electron:harnes:smoke
npm run electron:harnes:monkey
```

Verify the React/Vite renderer, static route-preservation contract, Electron startup path, and worst-state renderer layout.

## Current Scope

The Electron UI is now the primary app lane for daily operation. It shows:

- Runtime status from `/api/runtime`
- Workspace and model/reasoning details
- Model, reasoning, approval, sandbox, web-search, FAST mode, and automatic approval-review settings before submission
- Workspace lock/unlock controls through the existing Harnes control API
- Mission submission through the existing `POST /api/exec` route
- Conversation list, local conversation history, active stream output, stop, clear, and delete operations
- Slash-command presets including `/goal`, `/status`, `/diff`, `/resume`, `/fork`, `/fast`, and `/agent`
- The UI-improvement proposal prompt preset
- Image attachments, including paste or file picker paths, forwarded as `/api/exec` image payloads
- Design Proposal Studio details and links from `/design-proposals/latest/manifest.json`
- Diagnostics from `/api/diagnostics`
- Logs / evidence summaries from `logs/current/*.json`
- Backend restart state with distinct running, restarting, and failed states

The renderer does not receive the control API token. Electron main reads `/api/runtime`, adds the existing control header internally, submits to `POST /api/exec`, and streams NDJSON events back to the renderer over IPC.

## Next Phase

- Add richer replay/idempotency recovery controls.
- Port remaining agent topography and advanced harness timeline panels from `web/01.HarnesUI`.
- Keep the old web UI until Electron proves parity in daily use.

## Visual Regression Evidence

`npm run electron:harnes:monkey` writes screenshots and a JSON report under:

```text
output/electron-harnesui/monkey/
```

The check fails when the Electron renderer has horizontal overflow, clipped key controls, overlapping panels, console errors, page errors, or failed browser requests.
