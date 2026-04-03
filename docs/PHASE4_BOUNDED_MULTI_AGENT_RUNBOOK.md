# Phase 4 Bounded Multi-Agent Orchestration Runbook

Updated: 2026-03-30

## 1) 目的

Phase 4 は、Phase 1〜3 の verifier / rollback / continuity / lifecycle を壊さずに、bounded な specialized-agent handoff を実際に動かすための運用層です。

- 新しい独自実行経路は追加しません。
- 親タスクは既存 continuity/lifecycle 上に残ります。
- 子タスクは continuity 配下の child task として記録されます。
- hidden holdout と最上位 acceptance / policy は child から書き換えできません。

## 2) Role 一覧

- `coordinator`
  - 親タスク管理、handoff、integration、fallback 管理
- `planner`
  - `task_spec` / `plan` / `acceptance_contract` / `replan` の生成更新
- `researcher`
  - 情報収集、比較、要点抽出
- `executor`
  - 実行、ツール操作、成果物生成
- `verifier`
  - acceptance checklist、verdict、closeout 判定

実行時契約は [agent_role_contract_manifest.json](C:/Users/akima/dev/codex_Original_UI_PJ_with-Harnes/scripts/config/agent_role_contract_manifest.json) を参照します。

## 3) Handoff 起動条件

- 複雑な task family、または plan step に `planner` / `researcher` / `executor` / `verifier` 分離が必要なとき
- verifier を executor から分離したいとき
- task が小さい場合は single-agent fallback を優先

baseline ケース定義は [multi_agent_public_baseline.json](C:/Users/akima/dev/codex_Original_UI_PJ_with-Harnes/scripts/config/multi_agent_public_baseline.json) にあります。

## 4) 実行コマンド

- public regression
  - `node scripts/run_public_regression.js`
- hidden holdout
  - `CODEX_HOLDOUT_EVAL_UNLOCK=1 node scripts/run_holdout_eval.js`
- multi-agent public baseline
  - `node scripts/run_multi_agent_public_baseline.js`
- Phase 4 E2E
  - `node scripts/phase4_bounded_multi_agent_e2e_test.js`
- orchestrator case 実行
  - `node scripts/bounded_multi_agent_orchestrator.js run_case --case-id=coding_multi_agent`

## 5) Parent-Child Inspect

CLI:

- `node scripts/long_horizon_task.js show_agent_graph --task-id=<parentTaskId>`
- `node scripts/long_horizon_task.js show_active_agent_tree --task-id=<parentTaskId>`
- `node scripts/long_horizon_task.js list_handoff_history --task-id=<parentTaskId>`
- `node scripts/long_horizon_task.js show_integration_summary --task-id=<parentTaskId>`
- `node scripts/long_horizon_task.js list_child_tasks --task-id=<parentTaskId>`
- `node scripts/long_horizon_task.js list_blocked_subtasks --task-id=<parentTaskId>`
- `node scripts/long_horizon_task.js list_verifier_failed_subtasks --task-id=<parentTaskId>`
- `node scripts/long_horizon_task.js list_pending_integrations --task-id=<parentTaskId>`
- `node scripts/long_horizon_task.js list_orphan_subtasks --task-id=<parentTaskId>`

HTTP:

- `GET /api/continuity/task?task_id=<parentTaskId>&mode=agent_graph`
- `GET /api/continuity/task?task_id=<parentTaskId>&mode=active_agent_tree`
- `GET /api/continuity/task?task_id=<parentTaskId>&mode=handoff_history`
- `GET /api/continuity/task?task_id=<parentTaskId>&mode=integration_summary`
- `GET /api/continuity/tasks?state=blocked`
- `GET /api/continuity/tasks?state=verifier_failed`
- `GET /api/continuity/tasks?state=abandoned`
- `GET /api/continuity/tasks?state=archived`

## 6) verifier failure 時の運用

- child verifier failure は parent を `completed` にしません。
- parent は `verifier_failed` または `blocked` になり、`replan.json` を更新します。
- 再開時は次を順に確認します:
  1. `closeout_summary.json`
  2. `replan.json`
  3. `integration_summary.json`
  4. `blocked_subtasks` / `verifier_failed_subtasks`

## 7) blocked / abandoned / archived の意味

- `blocked`
  - 子失敗、denied action、budget overflow、未解決 blocker がある
- `verifier_failed`
  - acceptance / verifier 未達。再計画が必要
- `abandoned`
  - オペレータまたは親判断で task を中止
- `archived`
  - active resume 対象外。通常運用では参照専用

## 8) Single-Agent Fallback

次の条件では single-agent fallback を優先します。

- task が小さい
- role 分離コストがメリットを上回る
- baseline case が `fallbackToSingleAgent=true`

fallback 実行でも verifier / acceptance / closeout semantics は維持されます。

## 9) 主要証拠ファイル

- public regression summary:
  - [public_regression_summary.json](C:/Users/akima/dev/codex_Original_UI_PJ_with-Harnes/output/public_regression_summary.json)
- holdout summary:
  - [holdout_eval_summary.json](C:/Users/akima/dev/codex_Original_UI_PJ_with-Harnes/output/holdout_eval_summary.json)
- multi-agent baseline summary:
  - [multi_agent_public_baseline_summary.json](C:/Users/akima/dev/codex_Original_UI_PJ_with-Harnes/output/multi_agent_public_baseline_summary.json)
- normal parent graph:
  - [agent_graph.json](C:/Users/akima/dev/codex_Original_UI_PJ_with-Harnes/logs/archive/raw/runtime_state/continuity/tasks/phase4-normal-1774879407236/agent_graph.json)
- failure/replan sample:
  - [replan.json](C:/Users/akima/dev/codex_Original_UI_PJ_with-Harnes/logs/archive/raw/runtime_state/continuity/tasks/phase4-failure-1774879407631/replan.json)
