# Improvement Lineage

## 2026-04-05 update

- Improvement history is strict about comparison mode:
  - `self_snapshot`
  - `cold_start`
  - `distinct_comparison`
- Only distinct comparisons count toward operational completion history.
- Public surfaces:
  - `output/agi_readiness/distinct_improvement_lineage.json`
  - `output/agi_readiness/distinct_improvement_summary.json`
  - `output/agi_readiness/promotion_trend.json`

## 2026-04-06 subjective history rule

- Operational completion still uses distinct-comparison lineage only.
- Subjective completion additionally consumes history-aware aggregates from the tracked live export window.
- `distinctImprovementCount`, `distinctRegressionCount`, and non-worsening state must not be reset by a thinner current snapshot when valid recent export history is present.

改善履歴は self snapshot と distinct comparison を分けて扱います。

## Modes
- `self_snapshot`
- `cold_start`
- `distinct_comparison`

## Public proof
- `output/agi_readiness/distinct_improvement_lineage.json`
- `output/agi_readiness/promotion_trend.json`

## Rule
- self snapshot を distinct victory として表示しません
- distinct comparison だけが、前世代に対する改善証拠になります
- regression や hold も lineage に残します
## 2026-04-06 lineage extension

- Distinct lineage now covers self-authored change sets in addition to incumbent/challenger comparisons.
- Self-authored history is linked to causal evidence through:
  - `output/agi_readiness/self_authored_goal_history.json`
  - `output/agi_readiness/self_authored_causal_effects.json`
  - `output/agi_readiness/continuous_improvement_status.json`
- Harmful self-authored outcomes must remain zero for sovereign completion.
