# OUTPUT_SURFACE_POLICY

Updated: 2026-04-12

## Purpose

`output/` を dump 置き場ではなく、intentional artifact surface として管理します。

## Intentional Artifacts

`output/` には次のような named report / proof artifact を置きます。

- agi_readiness
- governance_public
- memory_public
- continuity_public
- manual_self_improvement
- curated learning report

## Git Tracking Split

repo には public-safe / intentional な artifact だけを残し、local-only or sensitive or regenerable artifact は Git に載せません。

## Regenerable Transient

次は `runtime/output-transient/` へ送ります。

- Playwright profile tree
- ad hoc screenshot
- scratch export
- timestamped probe file
- temporary note article draft

## Current Truth Surface

`logs/current/` は固定 5 ファイルだけを current truth とします。

- `design_conformance_summary.json`
- `latest_run_summary.json`
- `latest_signoff_summary.json`
- `operator_summary.json`
- `review_load_breakdown.json`

`runtime_snapshot.json` や `conformance_report.json` は bundle 内に残し、current root へは出しません。

## Public Governance Proof

`output/governance_public/` は redacted golden trace です。request -> routing -> execution -> review -> release の public-safe chain を出し、raw `logs/` を公開面の正本にしてはいけません。
