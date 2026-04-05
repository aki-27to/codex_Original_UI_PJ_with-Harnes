# Improvement Lineage

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
