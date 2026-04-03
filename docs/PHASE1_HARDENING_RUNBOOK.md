# Phase 1 Hardening Runbook

## 目的
- public regression と hidden holdout を分離し、release / promotion 判定でだけ protected lane を使う。
- self-improvement の auto-apply 前後に checkpoint / rollback / audit log を残す。
- executor の自己申告ではなく independent verifier の verdict で gate する。

## 主要ファイル
- Task contract: `scripts/config/task_contract_manifest.json`
- Eval lane policy: `scripts/config/eval_lane_policy.json`
- Public overlay: `scripts/config/public_regression_overlay.json`
- Hidden holdout suite: `protected/holdout/eval_suite_holdout.json`
- Independent verifier: `scripts/lib/independent_verifier.js`
- Checkpoint / rollback: `scripts/lib/improvement_checkpoint.js`

## 実行コマンド
- public regression:
  - `node scripts/run_public_regression.js`
  - `npm test`
- hidden holdout:
  - PowerShell: `$env:CODEX_HOLDOUT_EVAL_UNLOCK='1'; node scripts/run_holdout_eval.js`
- lane aggregate:
  - `node scripts/aggregate_eval_lanes.js`
- improvement dry-run:
  - `node scripts/self_improvement_dry_run.js`
- improvement apply:
  - `node scripts/self_improvement_apply.js --lane=openai_blog`
- rollback latest:
  - `node scripts/self_improvement_rollback_latest.js`
- audit log:
  - `node scripts/self_improvement_audit_log.js`
- Phase 1 E2E:
  - `node scripts/phase1_hardening_e2e_test.js`

## 出力物
- public regression report:
  - `output/public_regression_latest.json`
  - `output/public_regression_summary.json`
  - `logs/archive/raw/public_regression_runs.jsonl`
- holdout redacted summary:
  - `output/holdout_eval_summary.json`
- holdout detailed report:
  - `protected/holdout/output/holdout_regression_latest.json`
- aggregate:
  - `output/eval_lane_aggregate.json`
- rollback audit:
  - `logs/archive/raw/improvement_audit.jsonl`
- checkpoints:
  - `logs/archive/raw/improvement_checkpoints/`

## Visibility / 保護境界
- optimizer / runtime / public CI が見てよいのは public lane のみ。
- hidden holdout は `protected/holdout/**` 配下に隔離し、`scripts/lib/eval_lane_policy.js` で actor と env guard を強制する。
- `hidden_holdout` lane は `developer`、`release`、`protected_ci` だけが実行できる。
- `CODEX_HOLDOUT_EVAL_UNLOCK` が無い状態では holdout lane をロードできない。
- checkpoint 対象は protected roots を除外し、holdout suite と holdout outputs は auto-apply / rollback 対象に含めない。

## Release / Promotion フロー
1. 開発中は public regression を回す。
2. auto-apply 前に checkpoint を保存する。
3. apply 後に public regression を再実行する。
4. verifier が FAIL、guardrail breach、または apply error の場合は rollback する。
5. release / promotion 前に protected holdout を実行する。
6. `node scripts/aggregate_eval_lanes.js` で public + holdout の総合判定を確認する。

## CI
- public regression:
  - `.github/workflows/public-regression.yml`
  - `pull_request` と `main` push で実行する。
- protected holdout:
  - `.github/workflows/holdout-protected.yml`
  - `workflow_dispatch` と nightly schedule で実行する。
  - `CODEX_HOLDOUT_EVAL_UNLOCK` secret が必要。

## 運用メモ
- public regression overlay は `scripts/phase1_hardening_e2e_test.js` が baseline に戻してから使う。
- `self_improvement_apply.js --simulate-break=public_overlay` は rollback の E2E 実証用。通常運用では使わない。
- Phase 1 regression harness は isolated in-process env で parent-dispatch guard と adversarial retry/shadow を抑制し、gate 信号を public regression に集中させる。
