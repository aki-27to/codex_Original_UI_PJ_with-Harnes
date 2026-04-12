# SYSTEM_COHERENCE_REVIEW

Updated: 2026-04-12

## Purpose

local file correctness だけでは検出できない whole-system drift を止める review gate です。

## When It Applies

次の core surface change で必須です。

- `server.js`
- `scripts/`
- `web/`
- `.codex/`
- `package.json`
- `start_codex_ui.bat`
- core governance / architecture doc

## Required Command

- `node scripts/system_coherence_review_test.js`

## Review Planes

- execution path
- governance rule
- machine-readable contract
- server/runtime enforcement
- eval/memory/lifecycle alignment
- artifact surface taxonomy

## Routes That Must Stay True

- `POST /api/exec`
- `POST /api/eval/run`

## Contract Source

- `scripts/config/system_coherence_review_contract.json`
- `scripts/config/harness_plane_contract.json`
- `docs/SINGLE_HARNESS_MULTI_PLANE.md`

<!-- compatibility markers:
POST /api/exec
-->
