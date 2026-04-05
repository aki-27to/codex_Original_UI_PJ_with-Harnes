# Self-Directed Capability Closure

## 2026-04-05 update

- Self-directed closure consumes:
  - `output/agi_readiness/next_bottlenecks.json`
  - `output/agi_readiness/robustness_breakdown.json`
  - `output/continuity_public/continuity_debt.json`
- The planner remains fail-closed: missing evidence blocks promotion, harmful effects can trigger rollback or revoke, and repeated failures are bounded by retry and cooldown policy.

このハーネスは、operator が毎回手で改善課題を列挙しなくても、current bottleneck から次の改善課題を起票できるように設計されています。

## Inputs
- `output/agi_readiness/next_bottlenecks.json`
- `output/agi_readiness/robustness_breakdown.json`
- continuity debt projection
- learning lane observation state

## Outputs
- `output/agi_readiness/autonomous_learning_status.json`
- canonical learning agenda projection

## Guard rails
- unsafe domain は `proposal_only`
- retry budget を超えた item は `blocked`
- harmful / stale evidence は lineage と lesson から切り離します
