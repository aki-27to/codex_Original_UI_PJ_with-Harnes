# HARNESS_APP_PLATFORM

Updated: 2026-04-05

## 1) Purpose

This document defines how multiple product UIs can share one macro AGI/harness
without collapsing into one monolithic app.

The harness remains the shared execution/governance layer.
Each product keeps its own UI, local workflows, and app-specific prompt shape.

Current target apps:
- `english-conversation-app`
- `talkapp`
- `presentation-coach`

## 2) Safety Posture

The architectural consolidation is now complete, but compatibility remains
preserved.

- The harness owns the app registry under `APP/`.
- The current primary app code now also lives under `APP/`.
- App-specific env overrides still exist where they are useful.
- Legacy external clones can still be mounted as fallback when explicitly kept.

This means the default layout is consolidated, while the escape hatches remain
available.

## 3) Registry Shape

`APP/` is a registry, not an app-code dump.

Each app has one manifest:
- `APP/01.english-conversation-app/app.manifest.json`
- `APP/02.talkApp/app.manifest.json`
- `APP/03.プレゼン上達AI/app.manifest.json`

Each manifest defines:
- stable app id
- operator title/description
- mount path under `/apps/*`
- integration mode
- working directory for harness-side AI execution
- static-root or proxy settings

Integration modes:
- `native-static`
  - harness serves the app UI directly
  - app API calls can be rewritten into harness-native routes
- `reverse-proxy`
  - harness exposes the app under `/apps/*`
  - browser traffic is forwarded to the app's own local server

## 4) Current Runtime Topology

### `english-conversation-app`

- mount: `/apps/english-conversation-app`
- legacy mount kept: `/english-conversation-app`
- mode: `native-static`
- UI source priority:
  - `CODEX_ENGLISH_CONVERSATION_APP_ROOT`
  - in-repo app root `APP/01.english-conversation-app`
  - optional legacy external clone `../english-conversation-app`
  - bundled fallback `web/english-conversation-app`
- API behavior:
  - `/apps/english-conversation-app/api/*` is rewritten into harness-native `/api/*`

### `talkapp`

- mount: `/apps/talkapp`
- mode: `reverse-proxy`
- default upstream: `http://127.0.0.1:3000`
- optional upstream override: `CODEX_TALKAPP_BASE_URL`
- AI behavior:
  - talkApp keeps its own backend/UI
  - harness-backed generation is available as a shared provider from the talkApp runtime

### `presentation-coach`

- mount: `/apps/presentation-coach`
- mode: `reverse-proxy`
- default upstream: `http://127.0.0.1:57536`
- optional upstream override: `CODEX_PRESENTATION_AI_BASE_URL`
- AI behavior:
  - the app keeps its own UX
  - evaluation/chat can delegate structured AI execution to the harness when available

## 5) Shared App APIs

The harness now exposes app-oriented discovery/runtime APIs:

- `GET /api/apps`
  - returns the registry catalog
- `GET /api/apps/:appId/runtime`
  - returns the app summary plus harness AI readiness
- `POST /api/apps/:appId/reply`
  - app-scoped plain-text harness execution
- `POST /api/apps/:appId/structured`
  - app-scoped structured harness execution with `outputSchema`

These endpoints are for local same-machine usage only.
They are guarded by the existing local-origin/loopback rules.

## 6) Architectural Rule

The division of responsibility is explicit:

- Macro intelligence:
  - owned by the harness
  - shared execution, governance, and local Codex runtime
- Micro behavior:
  - owned by each app
  - UI, UX tone, prompt framing, and domain-specific flow

This is the intended operating model for adding more apps without cloning the
entire AGI stack for each one.
