# Docs README

このディレクトリの目的は、「何が正典で、何が運用手順で、何が隣接面で、何が研究ノートか」を迷わなくすることです。

最初に読む順番:
1. `../README.md`
2. `../AGENTS.md`
3. `BEGINNER_PATH.md`
4. `../HARNESS_MAP.md`
5. `CURRENT_ARCHITECTURE.md`
6. `EVIDENCE_CONTRACT.md`

## Canonical Authority

repo の核を定義する正典です。repo の identity、governance、current architecture をここで固定します。

- `../AGENTS.md`
- `../HARNESS_MAP.md`
- `CURRENT_ARCHITECTURE.md`
- `EVIDENCE_CONTRACT.md`
- `DESIGN_ACCEPTANCE_CONTRACT.md`
- `HARNESS_CONSTITUTION.md`

読み分け:
- `HARNESS_MAP.md`
  - どこに何があるかを示す operator map
- `CURRENT_ARCHITECTURE.md`
  - いま動いている active architecture spec

## Operational Runbooks

運用手順、phase runbook、特定 surface の手引きです。正典を補助しますが、truth source を上書きしません。

- `AGENT_OPERATING_RULES.md`
- `APP_SERVER_PROTOCOL_RUNBOOK.md`
- `CONTEXT_MEMORY_POLICY.md`
- `OUTPUT_SURFACE_POLICY.md`
- `PHASE1_HARDENING_RUNBOOK.md`
- `PHASE2_LONG_HORIZON_RUNBOOK.md`
- `PHASE3_STRUCTURED_PLANNING_LIFECYCLE_RUNBOOK.md`
- `PHASE4_BOUNDED_MULTI_AGENT_RUNBOOK.md`

## Companion And Adjacent Surfaces

repo の核と混同してはいけない隣接面です。app や workflow companion はここに切り分けます。

- `HARNESS_APP_PLATFORM.md`
- `WEEKLY_REPORT_COMPANION.md`

## Research And Learning Notes

学習ログ、改善メモ、研究ノートです。参考にはなりますが、canonical authority ではありません。

- `OPENAI_DEVELOPER_LEARNINGS.md`
- `ANTHROPIC_ENGINEERING_LEARNINGS.md`
- `GOVERNED_AUTONOMOUS_LEARNING_LOOP.md`
- `GOVERNED_LIVE_CAPABILITY_LOOP_NOTE.md`
- `IMPROVEMENT_LINEAGE.md`
- `ROBUSTNESS_REMEDIATION.md`

## Archive And Compatibility

互換性維持、長文教材、歴史的な説明資産です。active architecture を代表しません。

- `archive/AI_AGENT_HARNESS_TEXTBOOK_JA.html`
- `AI_AGENT_HARNESS_DETAILED_DESIGN.html`
- `SYSTEM_ARCHITECTURE.md`

## Beginner Shortcuts

- 最短導線: `BEGINNER_PATH.md`
- 用語確認: `GLOSSARY.md`
- 実行と証拠の関係: `EVIDENCE_CONTRACT.md`
- 推奨コマンド一覧: `npm run help:scripts`

## Common Commands

初見で触るときの最小セット:
- `npm start`
- `npm run help:scripts`
- `npm run regression:public`
- `npm run test:repo-quality`
