# EVIDENCE_CONTRACT

Authority role: `proof contract truth`  
Authority registry: `authority-registry.v1`

Updated: 2026-04-12

## 1) 目的

この文書は、タスクを releasable decision state へ進める前に必要な最小 verification / reporting artifact を定義します。

機械可読な正本:
- `scripts/config/evidence_contract.json`
- `scripts/config/task_outcome_contract.json`
- `scripts/config/release_decision_contract.json`
- `scripts/config/iteration_control_contract.json`
- `scripts/config/adoption_readiness_evaluator_contract.json`
- `scripts/config/worker_decision_surface_contract.json`

## 2) Evidence Classes

- Implementation evidence
  - changed file reference
  - created artifact / generated output
- Verification evidence
  - test command
  - lint / check command
  - 自動化できない場合の manual review step
- Runtime evidence
  - API response
  - protocol lifecycle result
  - terminal status / log summary
  - stage timeline / flow trace
- Documentation evidence
  - `docs/CURRENT_ARCHITECTURE.md` 更新
  - `docs/ARCHITECTURE_CHANGELOG.md` の対応 entry
  - baseline / over-delivery sync note
- Risk evidence
  - skipped check
  - failed check
  - residual risk statement

## 3) 変更種別ごとの最小証拠

- docs-only policy change
  - manual consistency review
  - updated policy document への file reference
  - 必要なら architecture/spec sync
- `server.js` / `server_impl.js` / `server/` / `server/services/` または `scripts/` 変更
  - `node scripts/app_server_smoke_test.js`
  - runtime split / route / bootstrap / service-boundary changes under `server/` are treated as server-surface changes and require the same smoke evidence
  - if reviewer-facing server boundary docs change, run a docs consistency check such as `node scripts/system_coherence_review_test.js`
- eval harness / replay / workflow policy change
  - `node scripts/eval_replay_api_smoke_test.js`
- whole-harness consistency に影響し得る core change
  - `node scripts/system_coherence_review_test.js`
- `web/` change
  - UI 起動
  - `GET /api/runtime` が HTTP 200
  - UI 振る舞いが変わるなら browser/manual evidence
  - design-sensitive work では:
    - benchmark / reference comparison
    - desktop screenshot review
    - mobile screenshot review
    - independent reviewer/tester verdict
- skill assignment / skill package change
  - `node scripts/skill_portfolio_audit.js`
- over-delivery で new logic を追加
  - 専用 automated test
  - PASS output を review evidence に含める

## 3.1 Structured Evidence Manifests

各 governed run は次の machine-readable artifact を inspectable にすること。

- `request_frame.json`
- `routing_decision.json`
- `task_outcomes.json`
- `review_bundle.json`
- `adoption_readiness_eval.json`
- `iteration_decision.json`
- `escalation_decision.json`
- `worker_decision_surface.json`
- `release_decision.json`

turn bundle companion file:
- `requirement_contract.json`
- `requirement_validation.json`
- `dispatch_plan.json`
- `evidence_manifest.json`
- `stage_timeline.json`
- `flow_trace_summary.json`
- `review_load_breakdown.json`
- `conformance_report.json`
- `operator_view_summary.json`

signoff bundle orchestration evidence:
- `signoff_resume_state.json`
- `lane_latency_summary.json`

live baseline comparison を要求した場合:
- `raw_direct_baseline_summary.json`
- `raw_direct_fast_task_trace_summary.json`
- `raw_direct_discovery_task_trace_summary.json`
- `raw_direct_signoff_task_trace_summary.json`
- `raw_direct_natural_task_trace_summary.json`

## 4) Reporting Contract

各 release/signoff report は最低でも次を含みます。

- 実行した command または manual check
- result summary
- `PASS` / `FAIL` / `SKIPPED`
- affected scope / file reference
- evidence が足りない場合の residual risk
- task-dependent なときは selected planning depth / assurance depth / flow path

## 5) Failure Semantics

- required evidence が欠けるなら releasable ではない
- required verification fail は、ユーザーが明示的に受け入れない限り `FAILED_VALIDATION`
- 環境制限で check が走らない場合は `BLOCKED` または `PARTIAL`
- runtime-facing task outcome ID は `scripts/config/task_outcome_contract.json` に従う
- top-level release decision は `scripts/config/release_decision_contract.json` に従う

## 6) Evidence Quality Rule

- narrative claim より deterministic command output を優先
- vague description より direct file reference を優先
- skipped check は理由と残る risk を明記
- neat manifest だけで underlying proof がなければ failure
- core system change で whole-system coherence review を skip したら `FAILED_VALIDATION`
- design-sensitive task で visual evidence が欠けたら `FAILED_VALIDATION`

## 6.2 Worker-Centric Completion Semantics Evidence

worker-centric completion semantics are not proven by prose alone.

- `worker_decision_surface.json` remains the headline worker surface.
- `worker_completion_status.json`, when present, must remain supplemental and must not redefine the headline worker verdict carried by `worker_decision_surface.json`.
- `goal_completion_status.json` / `subjective_goal_completion_status.json` must expose the gate-consumed running basis in machine-readable form.
- `autonomous_learning_status.json` must expose both the broader supporting counts and the gate-consumed subset when they differ.
- `self_directed_probe_status.json` and `novel_task_acquisition.json` must expose snapshot values, effective threshold values, threshold decisions, and the threshold basis that explains which values the gate consumed.
- `worker_completion_status.json` must expose same-session trust for its background inputs (`backgroundArtifactSessionConsistency`, `backgroundArtifactInputsTrusted`) so stale sidecars fail closed instead of silently influencing worker semantics.
- If these semantics are only documented in markdown and not exposed in the current-truth artifacts, the evidence is incomplete and the result is not releasable.

## 6.1 Subjective Quality Rule

subjective quality work では「良く見える」は evidence になりません。最低でも screenshot comparison、reviewer verdict、benchmark reasoning が必要です。
