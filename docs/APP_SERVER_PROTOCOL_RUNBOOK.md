# APP_SERVER_PROTOCOL_RUNBOOK

Updated: 2026-05-02

## Plane Separation and Protected Inputs

This protocol serves one governed harness with multiple internal planes.

- Execution plane stays on `POST /api/exec`
- Evaluation plane stays on `POST /api/eval/run`
- Monitoring plane observes runtime health and evidence surfaces
- Governance plane consumes evaluation/signoff outputs and does not promote from execution self-claim alone

Protected eval assets remain evaluation-only.

- protected roots: `protected/holdout`, `protected/blackbox`
- hidden holdout metadata must not be required by the execution path
- grader internals and protected manifests must not be mixed into the execution plane
- protected eval lanes are fail-closed and require the evaluation-side access policy

## 1) 目的

この文書は Codex App Server protocol behavior と verification の runbook です。最上位統治は `docs/HARNESS_CONSTITUTION.md` と `AGENTS.md` に残り、この文書は実装・検証手順だけを扱います。

## 2) Protocol Contract

この repo の primary route は次の 2 本です。

- interactive execution: `POST /api/exec`
- eval / release judgment: `POST /api/eval/run`
- local maintenance control: `POST /api/server/restart` launches a hidden local restart helper that stops the current server PID and relaunches the existing Web/browser launcher; it is not an execution orchestration branch

既存 local workflow として `/api/batch/*` は許容しますが、独自 orchestration branch を増やす場所にはしません。

## 3) 実装スコープ

server 側では次を壊さないこと。

- local-first
- default port `57525`
- standard Codex route の維持
- eval / release の primary route 維持
- invalid `CODEX_UI_PORT` は `57525` fallback

## 4) 最小検証

protocol-facing change では最低でも次を確認します。

- `GET /api/runtime` が HTTP 200
- `POST /api/exec` の standard path が生きている
- `POST /api/eval/run` の primary route が生きている
- 必要なら `node scripts/app_server_smoke_test.js`
- eval/replay change なら `node scripts/eval_replay_api_smoke_test.js`

## 5) Runtime Troubleshooting Checklist

- UI が壊れて見える場合
  - `GET /api/runtime` を先に確認
  - `server.js` と `web/01.HarnesUI/app.js` の contract drift を疑う
- port 問題
  - `CODEX_UI_PORT` が不正な値なら `57525` fallback
- route 問題
  - `/api/exec` と `/api/eval/run` を最優先で確認
- approval / sandbox 問題
  - posture summary と runtime snapshot を見る

## 6) この文書の使い方

この文書は protocol incident の runbook です。release 可否の証拠契約は `docs/EVIDENCE_CONTRACT.md` を、current implementation shape は `docs/CURRENT_ARCHITECTURE.md` を見てください。
