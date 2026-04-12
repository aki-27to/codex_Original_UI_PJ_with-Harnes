# APP Registry

This directory is the harness-side app registry.

It is intentionally metadata-first.
The presence of `APP/` does not mean all app code has been physically moved
into this repo.

Current role:
- define which product surfaces belong to the shared harness
- define how each app is mounted under `/apps/*`
- define whether the app is `native-static` or `reverse-proxy`
- define which working directory the shared harness should use for app-scoped AI

Current apps:
- `01.english-conversation-app`
- `02.talkApp`

Each app contains one `app.manifest.json`.

The goal is:
- macro intelligence stays shared in the harness
- micro behavior stays inside each app
- migration risk stays low by avoiding destructive repo moves up front
