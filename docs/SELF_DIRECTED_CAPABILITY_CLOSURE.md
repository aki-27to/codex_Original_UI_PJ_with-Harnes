# Self-Directed Capability Closure

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
