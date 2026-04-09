# Codex Governed Harness

この repo の core product は governed harness 自体です。単なる narrow app ではありません。

この repo が守る核:
- 主経路は `POST /api/exec` と `POST /api/eval/run`
- `agi_v1` は既存 eval flow の extension-only profile
- truth source は narrative だけではなく machine-readable contracts、runtime proof、signoff/release decision
- repo root は source-first。transient/local caches は `runtime/`、governed evidence は `logs/`、intentional artifacts は `output/`

## Front Door

最初に見る入口:
- docs entrypoint: `docs/README.md`
- beginner path: `docs/BEGINNER_PATH.md`
- operator map: `HARNESS_MAP.md`
- active architecture: `docs/CURRENT_ARCHITECTURE.md`
- evidence contract: `docs/EVIDENCE_CONTRACT.md`
- AGI extension guide: `docs/AGI_V1_EVAL_FRAMEWORK.md`

## What This Repo Is

- Codex App Server integration の governed harness / agent OS
- local-first runtime with evidence-first release judgment
- autonomy-first by default, but governed, auditable, and fail-closed where contracts require it
- companion apps を抱えられるが、core authority は harness 自体にある repo

## What This Repo Is Not

- parallel harness
- parallel CLI universe
- app companion inventory pretending to be the core architecture
- dump-oriented output tree

## Standard Routes

- interactive execution: `POST /api/exec`
- evaluation / promotion: `POST /api/eval/run`
- replay, runtime, and batch surfaces stay on the existing harness route family

## Golden Path

1. User request enters through HarnesUI or an app surface.
2. Harness executes on `POST /api/exec`.
3. Runtime summaries land in `logs/current/`.
4. Evidence, proof, and signoff bundles land under `logs/bundles/`.
5. Intentional public/operator artifacts land under `output/`.
6. Eval and promotion run through `POST /api/eval/run`.
7. Release judgment is derived from contracts plus fresh runtime proof.

## Source-First Repo Layout

- `server.js`
  - composition root for the governed harness HTTP runtime
- `scripts/lib/`
  - reusable runtime, policy, adapter, and projection modules
- `scripts/config/`
  - machine-readable contracts and policy surfaces
- `web/`
  - operator-facing web surfaces
- `APP/`
  - companion app surfaces that stay adjacent to, not identical with, the core harness authority
- `logs/`
  - governed evidence and runtime proof
- `output/`
  - intentional report and artifact surface
- `runtime/`
  - transient local caches, scratch payloads, and regenerable captures

## Runtime Posture

この repo は low-HITL / autonomy-first を維持します。ただし、強い posture は owner-operated local defaults として扱います。

owner-local defaults の例:
- `danger-full-access`
- `approval_policy = never`
- launcher-owned restart loop
- local auto `commit + push`

重要:
- これは universal guidance ではありません
- wider deployment では、workspace lock、narrower sandbox posture、policy review を先に明示してください

## Script Surface

初見で迷ったら、まずこの 4 つだけ使ってください。

- `npm start`
  - harness server を起動する
- `npm run help:scripts`
  - 推奨コマンドだけをカテゴリ別に表示する
- `npm run regression:public`
  - public regression gate
- `npm run test:repo-quality`
  - repo quality gate

補助:
- `npm run gate:pr`
  - PR 相当の gate をまとめて回す
- `npm run housekeeping:surfaces`
  - root/runtime/output の housekeeping を再適用する
- `npm run artifact:memory-public`
  - governed memory の public projection を再生成する

## Quick Start

- Windows launcher: `start_codex_ui.bat`
- Default local UI: `http://127.0.0.1:57525`
- Static operator guide: `http://127.0.0.1:57525/01.HarnesUI/guide.html`
- Optional standalone English Conversation App compatibility launcher: `http://127.0.0.1:57526`

Owner-local launcher defaults include:
- `CODEX_REQUEST_USER_INPUT_POLICY=auto-default`
- `CODEX_EXECUTION_PROFILE=full-runtime`
- `CODEX_AUTOMATIC_APPROVAL_REVIEW=1`
- `CODEX_FAST_MODE_DEFAULT=0`

## Companion Boundary

The harness owns the shared multi-app surface under `APP/`, but companion surfaces do not redefine the core architecture.

Current companion apps:
- `APP/01.english-conversation-app`
- `APP/02.talkApp`
- `APP/03.プレゼン上達AI`

Core harness authority stays in:
- `README.md`
- `AGENTS.md`
- `HARNESS_MAP.md`
- `docs/CURRENT_ARCHITECTURE.md`

App-specific topology and companion detail belong in dedicated docs such as:
- `docs/HARNESS_APP_PLATFORM.md`
- `docs/WEEKLY_REPORT_COMPANION.md`
