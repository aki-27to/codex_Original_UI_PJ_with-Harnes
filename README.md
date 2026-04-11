# Codex Governed Harness

Authority role: `navigation / entrypoint only`  
Authority registry: `authority-registry.v1`

この repo の core product は narrow app ではなく、固定された憲法と machine-readable contracts の内側で動く local-first governed harness です。README は front door であり、憲法そのものではありません。

## Front Door

- docs entrypoint: `docs/README.md`
- beginner path: `docs/BEGINNER_PATH.md`
- operator map: `HARNESS_MAP.md`
- active design spec: `docs/CURRENT_ARCHITECTURE.md`
- operational constitution: `AGENTS.md`
- single supreme frozen constitution: `docs/HARNESS_CONSTITUTION.md`
- proof contract truth: `docs/EVIDENCE_CONTRACT.md`

## Core Identity

- main primary routes stay fixed:
  - `POST /api/exec`
  - `POST /api/eval/run`
- local-first / evidence-first / fail-closed remain non-negotiable
- narrative docs are subordinate to machine-readable contracts and runtime proof
- success is judged by governed release judgment, not by prose-only completion claims

This repo is:

- a governed harness / governed autonomous worker runtime
- a local Codex App Server integration that keeps delegated execution and release judgment inside fixed authority boundaries
- a contract-backed system where success can be promoted into reusable skill surfaces and failure can be converted into governed self-improvement

This repo is not:

- a parallel harness
- a parallel CLI universe
- a role-specific primary endpoint architecture
- a second orchestration stack that bypasses `POST /api/exec`

## Authority Order

The single machine-readable authority order lives in:

- `scripts/config/authority_registry.json`

Recommended reading order:

1. `docs/HARNESS_CONSTITUTION.md`
2. `AGENTS.md`
3. `docs/CURRENT_ARCHITECTURE.md`
4. `docs/EVIDENCE_CONTRACT.md`
5. `scripts/config/*.json`
6. `HARNESS_MAP.md`
7. `docs/README.md`

## Runtime And Posture

Deployment posture is profile-backed:

- `owner_local`
- `portable_local`
- `reviewed_team`

The reference architecture default is `portable_local`. Owner-operated defaults such as `danger-full-access`, `approval_policy = never`, and local auto `commit + push` are allowed only as the `owner_local` posture, not as universal architecture truth.

Launcher/runtime note:

- live runtime `requestUserInputPolicy=auto-default`
- launcher default: `CODEX_REQUEST_USER_INPUT_POLICY=auto-default`
- strict `proof` / `repro` / `conversation-app-server` lanes pin `requestUserInputPolicy=blocked`

## Source-First Layout

- `server.js`
  - composition root and route registration
- `scripts/lib/`
  - policy, orchestration, evaluation, memory, and runtime modules
- `scripts/config/`
  - machine-readable contract and policy truth
- `web/`
  - operator-facing UI surfaces
- `logs/`
  - governed runtime proof and evidence bundles
- `output/`
  - intentional public/operator artifacts
- `runtime/`
  - transient local-only caches and regenerable material

## Script Surface

Primary commands:

- `npm start`
- `npm run help:scripts`
- `npm run test:repo-quality`
- `npm run regression:public`

Document tooling commands:

- `npm run tooling:document:bootstrap`
- `npm run tooling:document:status`

## Quick Start

- Windows launcher: `start_codex_ui.bat`
- local UI: `http://127.0.0.1:57525`
- static guide: `http://127.0.0.1:57525/01.HarnesUI/guide.html`
- optional standalone English conversation launcher: `http://127.0.0.1:57526`

## Companion Boundary

Companion apps may live beside the harness, but they do not redefine the core authority. Companion details belong in dedicated docs such as `docs/HARNESS_APP_PLATFORM.md` and `docs/WEEKLY_REPORT_COMPANION.md`.
