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
- `output/agi_readiness/self_directed_probe_status.json`
- `output/agi_readiness/novel_task_acquisition.json`

## 2026-04-06 subjective closure update

- Self-directed probe counts, positive evidence refs, and required thresholds are now exported as public proof.
- Novel task acquisition is tracked as a first-class artifact instead of an implicit local-only signal.
- These surfaces support subjective completion but do not bypass the existing governed loop; there is still no parallel probe harness.

## Guard rails
- unsafe domain は `proposal_only`
- retry budget を超えた item は `blocked`
- harmful / stale evidence は lineage と lesson から切り離します
## 2026-04-06 self-authored closure update

- Self-directed probes and novel task acquisition now feed the sovereign completion gate together with self-authored goal generation and self-authored causal effectiveness.
- The primary supporting surfaces are:
  - `output/agi_readiness/self_directed_probe_status.json`
  - `output/agi_readiness/novel_task_acquisition.json`
  - `output/agi_readiness/novelty_growth_status.json`
  - `output/agi_readiness/self_authored_causal_effects.json`
