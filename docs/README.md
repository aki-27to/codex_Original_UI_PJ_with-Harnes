# 文書案内

Authority role: `navigation / entrypoint only`  
Authority registry: `authority-registry.v1`

このページは docs 全体の入口です。  
「どこから読めばよいか」「何が正本か」を迷わないように、読む順番を固定します。

## 最初に読む順番

新しく入る人は、まず次の順で読んでください。

1. `../README.md`
2. `BEGINNER_PATH.md`
3. `DEMO_FLOWS.md`
4. `CAPABILITY_SURFACE.md`
5. `BUYER_PAIN_MAP.md`
6. `PRODUCT_POSITIONING.md`
7. `COMPARISON_BOUNDARY.md`
8. `PROVIDER_AND_PORTABILITY.md`
9. `HARNESS_CONSTITUTION.md`
10. `../AGENTS.md`
11. `CURRENT_ARCHITECTURE.md`

この順で分かること:

1. この repo が何を目指しているか
2. どこを触れば全体像がつかめるか
3. 代表的な仕事は何か
4. 何ができるか
5. 何の痛みを減らすのか
6. どういう製品カテゴリで見るべきか
7. 何と比べてはいけないか
8. 持ち運びや対応範囲の境界をどう置いているか
9. 何が固定ルールか
10. 実行時に何を守るか
11. いまの技術構成がどうなっているか

<!-- Single-Harness Plane Doc -->
## 1 つのハーネスの中で役割を分ける考え方

- `SINGLE_HARNESS_MULTI_PLANE.md`
  - 1 つのハーネスの中で、実行・評価・監視・統治がどう分かれているかを説明する

<!-- Canonical Authority -->
## 正本の権威文書

- `HARNESS_CONSTITUTION.md`
  - single supreme frozen constitution
- `../AGENTS.md`
  - operational constitution / runtime behavior constraints
- `CURRENT_ARCHITECTURE.md`
  - active design spec
- `EVIDENCE_CONTRACT.md`
  - proof contract truth
- `../scripts/config/authority_registry.json`
  - authority precedence and drift markers

次の問いに答えるときは、まずここを見ます。

- 何が固定か
- 何が動いてよいか
- どの文書が最終的な判断基準か

<!-- Operational Runbooks -->
## 運用の手順書

- `AGENT_OPERATING_RULES.md`
- `APP_SERVER_PROTOCOL_RUNBOOK.md`
- `CONTEXT_MEMORY_POLICY.md`
- `SELF_IMPROVEMENT_POLICY.md`
- `SKILL_PORTFOLIO_GOVERNANCE.md`

運用の流れや、継続・記憶・改善の扱いを知りたいときに読みます。

## 全体像をつかむ資料

- `human/AI_AGENT_HARNESS_DETAILED_DESIGN.html`
  - 現役の overview-first ガイド
- `human/legacy/AI_AGENT_HARNESS_TEXTBOOK_JA.html`
  - 古い長文教材。思想理解には使えるが、正本ではない

<!-- Companion And Adjacent Surfaces -->
## 付随資料と周辺資料

- `HARNESS_APP_PLATFORM.md`
- `WEEKLY_REPORT_COMPANION.md`
- `DOCUMENT_TOOLING_GUIDE.md`
- `integrations/copilot-studio/weekly-report-agent-design.md`
- `integrations/godot/godot_mcp_outer_ocean_design.md`
- `integrations/godot/godot_mcp_implementation_status.md`
- `samples/agi_v1/agi_v1_report.md`

正本ではありませんが、運用や周辺機能を理解するのに役立つ資料です。

<!-- Research And Learning Notes -->
## 学習メモと研究ノート

- `OPENAI_DEVELOPER_LEARNINGS.md`
- `ANTHROPIC_ENGINEERING_LEARNINGS.md`
- `AGI_OPERATIONAL_COMPLETION.md`
- `SECONDARY_LEARNING_SOURCES.md`
- `FRONTEND_QUALITY_PLAYBOOK.md`

外部記事から何を取り込んでいるか、到達度や改善方針をどう考えているかを追うときに読みます。

<!-- Archive And Compatibility -->
## 互換用・履歴用の資料

- `SYSTEM_ARCHITECTURE.md`

現行の説明ではなく、互換や履歴のために残している資料です。

## 迷ったら戻る場所

- repo の入口: `../README.md`
- 最短の読み順: `BEGINNER_PATH.md`
- 代表的な仕事: `DEMO_FLOWS.md`
- できること: `CAPABILITY_SURFACE.md`
- 何の痛みを減らすか: `BUYER_PAIN_MAP.md`
- 比較の境界: `COMPARISON_BOUNDARY.md`
- 製品としての見せ方: `PRODUCT_POSITIONING.md`
- 対応範囲の考え方: `PROVIDER_AND_PORTABILITY.md`
