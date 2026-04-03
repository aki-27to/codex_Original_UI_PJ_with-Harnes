# Repo Closure Export Runbook

## Purpose
- repo 内で完了できる実装を監査する
- external-only 残件を packet として export する
- observed evidence intake の dry-run を行う
- public claim gap を再計算する

## One-Command Entrypoints
- `node scripts/run_repo_closure_export.js full_preflight`
- `node scripts/run_repo_closure_export.js export_all_external_packets`
- `node scripts/run_repo_closure_export.js import_all_observed --mode dry_run`
- `node scripts/run_repo_closure_export.js recompute_public_claim`

## Operator Flow
1. `full_preflight` を実行する
2. `output/repo_closure_export/repo_closure_audit.json` を確認する
3. `output/repo_closure_export/final_structured_status.json` を確認する
4. `export_all_external_packets` で packet を再生成する
5. 外部 observed evidence が届いたら `import_all_observed` で取り込む
6. `recompute_public_claim` で live claimability を更新する

## External-Only Packets
- `human_baseline_packet`
- `external_audit_packet`
- `deployment_evidence_packet`
- `provider_connection_packet`
- `host_config_apply_packet`

## Structured Status Contract
- `repoImplementationStatus`
- `hostConfigStatus`
- `externalEvidenceStatus`
- `publicClaimStatus`
- `blockingReasons[]`
- `requiredPackets[]`
- `nextCommand`

## Status Rules
- repo 側は自然文の判断要求を返さない
- machine status は `AUTO_PASS / AUTO_FAIL / BLOCKED_BY_ENV / BLOCKED_BY_POLICY / EXTERNAL_EVIDENCE_PENDING / BLOCKED_BY_CONFIG`
- final blocking reason は次の固定集合のみを使う
  - `REPO_IMPLEMENTATION_GAP`
  - `HOST_CONFIG_BLOCKED`
  - `OBSERVED_HUMAN_BASELINE_PENDING`
  - `EXTERNAL_AUDIT_PENDING`
  - `PROVIDER_CONNECTION_PENDING`
  - `DEPLOYMENT_EVIDENCE_PENDING`
  - `POLICY_BLOCKED`
  - `PUBLIC_CLAIM_READY`

## Host Config Pack
- packet path: `output/repo_closure_export/host_config_apply_packet/packet.json`
- examples:
  - `output/repo_closure_export/host_config_apply_packet/examples/home_config.toml.example`
  - `output/repo_closure_export/host_config_apply_packet/examples/project_config.toml.example`
  - `output/repo_closure_export/host_config_apply_packet/examples/managed_requirements.toml.example`

## Dry-Run Guarantee
- dry-run observed evidence は `output/repo_closure_export/dry_run_workspace/` 配下だけを使う
- live registry へ observed evidence を混入しない
- simulation-only ready は live observed evidence と混同しない
