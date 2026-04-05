# Continuity Closeout Policy

## 2026-04-05 update

- Continuity closeout is now tracked as debt with public proof.
- Primary surfaces:
  - `output/continuity_public/latest_continuity.json`
  - `output/continuity_public/continuity_debt.json`
  - `output/continuity_public/continuity_debt_trend.json`
  - `output/continuity_public/continuity_closeout_effects.json`
- Goal completion requires `openDebtCount = 0`, `blockedSubtasks = 0`, and `integrationPendingCount = 0`.

continuity root は単なる履歴ではなく、closeout debt を管理する面として扱います。

## Normalized blocker types
- `missing_evidence`
- `verifier_failed`
- `dependency_unresolved`
- `operator_abandoned`
- `policy_blocked`

## Public surfaces
- `output/continuity_public/latest_continuity.json`
- `output/continuity_public/continuity_debt.json`

## Closeout rule
- `blockedSubtasks` と `integrationPendingCount` は debt として可視化します
- auto-close 可能な debt は remediation agenda に流します
- final release state が受理済みでも open debt は別で保持します
