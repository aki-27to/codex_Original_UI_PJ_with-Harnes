# HARNESS_LOGGING_MAP

Updated: 2026-04-18

## 1) Scope

この文書は `http://127.0.0.1:57525/01.HarnesUI/index.html` を使う operator 向けの logging map です。
目的は次の 2 つです。

- HarnesUI 利用中に「どのログ面を見ればよいか」を固定する
- 「質問しただけで止まった」時の確認順を固定する

## 2) Current Truth

まず見る面は `logs/current/` です。
ここは current truth であり、見る対象は次の 5 ファイルだけです。

- `design_conformance_summary.json`
- `latest_run_summary.json`
- `latest_signoff_summary.json`
- `operator_summary.json`
- `review_load_breakdown.json`

読み始める順は次です。

1. `operator_summary.json`
2. `latest_signoff_summary.json`
3. `latest_run_summary.json`
4. `design_conformance_summary.json`
5. `review_load_breakdown.json`

役割は次のとおりです。

- `operator_summary.json`: operator が最初に把握する一画面要約
- `latest_signoff_summary.json`: signoff-ready な最新状態
- `latest_run_summary.json`: 直近の governed run の概況
- `design_conformance_summary.json`: design-sensitive task の適合確認
- `review_load_breakdown.json`: reviewer / tester / doc-sync / evidence burden の内訳

## 3) Raw Logs And Turn Artifacts

current truth で不足するときだけ raw 側へ降ります。

主要な raw surface は次です。

- `logs/archive/raw/operation_logs/codex_ops.jsonl`
- `logs/archive/raw/harness_execution_memory.json`
- `logs/archive/raw/eval_runs.jsonl`
- `logs/archive/raw/turns/<date>/<thread>__<turn>/`

用途は次のとおりです。

- `codex_ops.jsonl`: compact operation log。`api.exec`, `api.exec_failed`, `api.exec_stream_failed`, `turn.final`, `turn.client_closed`, `turn.stream_disconnect_retry`, `turn.artifacts.finalized` などの実行イベントを見る
- `harness_execution_memory.json`: governed memory の raw 正本を見る
- `eval_runs.jsonl`: eval history の raw 正本を見る
- `turns/...`: 特定 turn の証跡束を見る

turn artifact では少なくとも次を確認できます。

- `events.ndjson`
- `manifest.json`
- `evidence_manifest.json`
- `stage_timeline.json`
- `flow_trace_summary.json`
- `request_frame.json`
- `routing_decision.json`
- `task_outcomes.json`
- `review_bundle.json`
- `release_decision.json`

## 4) Replay And Eval History

API から確認する面は次です。

- `GET /api/replay/turns`: recent turn 一覧
- `GET /api/replay/turn/:turnId`: 特定 turn の replay baseline
- `POST /api/replay/turn`: replay 実行
- `GET /api/eval/history`: eval history
- `GET /api/exec/idempotency/:key`: idempotency lifecycle と最終状態

`logs/archive/raw/eval_runs.jsonl` と `GET /api/eval/history` は同じ eval history surface の raw / API 面です。
「送信後に UI だけ止まったのか、サーバがまだ継続しているのか」を切るときは `GET /api/exec/idempotency/:key` を使います。

## 5) Live Monitoring

live の補助面は次です。

- `GET /api/runtime`
- `GET /api/harness/overview`
- `GET /api/diagnostics`

役割は次のとおりです。

- `/api/runtime`: runtime 全景と主要 API surface の入口確認
- `/api/harness/overview`: operator 向け overview
- `/api/diagnostics`: runtime health と補助診断

## 6) Browser-Side State

`/api/exec` へ到達していない問題は browser 側の state も確認します。

HarnesUI が主に保持する localStorage key は次です。

- `codex-console-settings-v3`
- `codex-console-chat-v1`
- `codex-harness-check-mode-v2`

見る場所は browser DevTools の次の 2 面です。

- `Console`
- `Network`

## 7) Frozen Triage Order For "It Stopped After Just Asking"

「今って定期的に学習設定あるよね？毎日何時だっけ？」のように、質問しただけで応答が止まったときの確認順は次で固定します。

1. browser DevTools の `Network` で `POST /api/exec` が送信されたか確認する
2. `POST /api/exec` が送信されていれば `logs/archive/raw/operation_logs/codex_ops.jsonl` で `api.exec_failed` / `api.exec_stream_failed` / `turn.final` / `turn.client_closed` / `turn.stream_disconnect_retry` を確認する
3. 該当 turn の `logs/archive/raw/turns/<date>/<thread>__<turn>/` を見て、`events.ndjson`、`stage_timeline.json`、`request_frame.json`、`routing_decision.json`、`task_outcomes.json` を確認する
4. idempotency key が取れているなら `GET /api/exec/idempotency/:key` で server 側の最終状態を確認する
5. `GET /api/runtime`、`GET /api/harness/overview`、`GET /api/diagnostics` を補助面として見て、runtime 全体が落ちていないか確認する
6. `POST /api/exec` 自体が送信されていなければ UI 側の問題として扱い、browser `Console` と localStorage の `codex-console-chat-v1` / `codex-console-settings-v3` / `codex-harness-check-mode-v2` を確認する

## 8) Interpretation Rule

確認結果の解釈は次で固定します。

- `POST /api/exec` なし: UI 側寄りの停止
- `POST /api/exec` あり + `api.exec_failed` / `api.exec_stream_failed`: server 実行または stream 側の失敗
- `POST /api/exec` あり + `turn.final` あり + UI 無反映: UI 描画または stream 消費側の問題
- `turn.client_closed` あり: client close 主導の切断
- `turn.stream_disconnect_retry` あり: stream 断続不安定だが server 継続の可能性あり

## 9) Bundle Dive

current truth と raw turn artifact で不足するときだけ bundle surface を見ます。

- `signoff_summary.json`
- `runtime_snapshot.json`
- `core_harness_workflow_run.json`
- `natural_task_trace_summary.json`
- `boundary_task_trace_summary.json`
- `conformance_report.json`
- `operator_view_summary.json`
- `bundle_surface_map.json`

## 10) Source Anchors

この map を更新するときに見る primary source は次です。

- `docs/HARNESS_LOGGING_SPEC.md`: `logs/current/` の fixed five と current truth の定義
- `scripts/lib/logging_surface.js`: `logs/current/`、`logs/archive/raw/turns/`、`codex_ops.jsonl`、`eval_runs.jsonl` などの保存先定義
- `server/services/exec_service.js`: `api.exec`、`api.exec_failed`、`api.exec_stream_failed`、idempotency の実装
- `server_impl.js`: `turn.final`、`turn.artifacts.finalized`、`turn.stream_disconnect_retry`、`turn.client_closed` の運用イベント
- `server/routes/overview_routes.js`、`server/routes/eval_routes.js`、`server/routes/replay_routes.js`、`server/bootstrap.js`: live monitoring / eval / replay / runtime probe の公開面
