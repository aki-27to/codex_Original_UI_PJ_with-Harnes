# Governed Autonomous Learning Loop

このハーネスでは、改善は単なる提案管理ではなく、次の閉ループとして扱います。

1. readiness / continuity / memory projection から bottleneck を検出する  
2. bottleneck を `learning agenda` に変換する  
3. governed remediation task として実行または保留する  
4. outcome を observation と causal trace に記録する  
5. lesson / hint / lineage / readiness を再計算する  

## Truth source
- live truth: `logs/archive/raw/runtime_state/memory`
- public proof:
  - `output/agi_readiness/autonomous_learning_status.json`
  - `output/agi_readiness/causal_learning_trace.json`
  - `output/agi_readiness/distinct_improvement_lineage.json`
  - `output/continuity_public/continuity_debt.json`

## Safety posture
- fail-open は許可しません。
- evidence 不足の remediation は `proposal_only` または `blocked` に落ちます。
- primary / secondary learning lane の序列は維持します。

## Current meaning
- `queued`: 起票済みで未着手
- `running`: 自律実行または自律計測の対象
- `passed`: 改善効果が確認済み
- `failed`: 実行したが改善効果なし
- `blocked`: evidence / policy / dependency により停止
- `revoked`: harmful / stale / unsafe のため撤回
