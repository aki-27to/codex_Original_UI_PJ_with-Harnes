# Externalization Runbooks

## Operator Runbook
- `node scripts/run_externalization_nohitl.js full`
- `node scripts/run_externalization_nohitl.js no-hitl-analyze`
- `node scripts/run_externalization_nohitl.js claim-recompute`
- 主要出力:
  - `output/externalization_nohitl/no_hitl_analysis.json`
  - `output/externalization_nohitl/claim_gap_report.json`
  - `output/externalization_nohitl/missing_evidence_checklist.json`

## Human Evaluator Runbook
- task packet export:
  - `node scripts/run_externalization_nohitl.js human-export`
- observed result import:
  - `node scripts/run_externalization_nohitl.js human-import --file <path> --label observed_batch_01`
- adjudication:
  - `node scripts/run_externalization_nohitl.js human-adjudicate --primary <path> --secondary <path> --tie_break <path>`
- aggregation:
  - `node scripts/run_externalization_nohitl.js human-aggregate`
- 注意:
  - `human_observed` は実測専用
  - `mock_fixture` / `synthetic` は public claim に混ぜない

## External Auditor Runbook
- sealed pack export:
  - `node scripts/run_externalization_nohitl.js audit-export --mode blackbox`
- tamper verify:
  - `node scripts/run_externalization_nohitl.js audit-verify --pack <pack_root>`
- result import:
  - `node scripts/run_externalization_nohitl.js audit-import --file <path> --label external_batch_01`
- summary:
  - `node scripts/run_externalization_nohitl.js audit-summary`
- protected path は fail-closed で `BLOCKED_BY_POLICY` を返す

## Deployment Evidence Runbook
- template export:
  - `node scripts/run_externalization_nohitl.js deployment-export`
- staged/shadow/canary telemetry import:
  - `node scripts/run_externalization_nohitl.js deployment-import --file <path> --label canary_week_01`
- aggregate:
  - `node scripts/run_externalization_nohitl.js deployment-aggregate`
- `production_like_observed` と `lab_internal` / `mock_fixture` / `simulation_fixture` は別扱い

## Claim Committee Runbook
- latest gap recompute:
  - `node scripts/run_externalization_nohitl.js claim-recompute`
- simulation-only branch test:
  - `node scripts/run_externalization_nohitl.js claim-recompute --simulation --sim_humans 12 --sim_audits 3 --sim_blackbox 2 --sim_deployments 3`
- live判定は `PUBLIC_AGI_CLAIM_BLOCKED` か `EXTERNALLY_VALIDATED_NO_PUBLIC_AGI_CLAIM`
- `PUBLIC_CLAIM_READY_SIMULATION_ONLY` はテスト専用で、実測証拠の代替にしない
