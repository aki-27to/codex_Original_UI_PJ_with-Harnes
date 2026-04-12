# 現在の技術構成

Updated: 2026-04-12

Authority role: `active design spec`  
Authority registry: `authority-registry.v1`

<!-- machine-readable compatibility markers:
scripts/config/system_coherence_review_contract.json
scripts/config/harness_plane_contract.json
Execution plane
Monitoring plane
.github/copilot-instructions.md
.github/instructions/
.github/agents/
node scripts/github_copilot_governance_surface_test.js
-->

## 1) この文書の位置づけ

この文書は Codex App Server 連携ハーネスの **active design spec** です。  
入口の説明は `README.md`、docs の入口は `docs/README.md`、最上位の固定ルールは `docs/HARNESS_CONSTITUTION.md` が担います。

関連文書:

- `README.md`
- `docs/README.md`
- `docs/BEGINNER_PATH.md`
- `docs/DEMO_FLOWS.md`
- `docs/BUYER_PAIN_MAP.md`
- `docs/COMPARISON_BOUNDARY.md`
- `docs/PRODUCT_POSITIONING.md`
- `docs/WEEKLY_REPORT_COMPANION.md`
- `docs/PROVIDER_AND_PORTABILITY.md`
- `docs/human/AI_AGENT_HARNESS_DETAILED_DESIGN.html`
- `docs/human/legacy/AI_AGENT_HARNESS_TEXTBOOK_JA.html`
- `docs/ARCHITECTURE_CHANGELOG.md`

## 2) いま何を正本として見るか

この repo の現在の正本は、ワーカー中心で役割ごとに分かれています。

- 最上位の公開面: `output/governance_public/worker_decision_surface.json`
  - scope: `worker_decision`
  - その時点の対象範囲に対して、運用者がどう判断すべきかを示す面
- プログラム全体の到達度: `output/agi_readiness/goal_completion_status.json`
  - scope: `program_readiness`
  - repo / program 全体を見る補助面であり、ワーカーの見出し面ではない
- 主観品質の補助面: `output/agi_readiness/subjective_goal_completion_status.json`
  - scope: `subjective_companion`
- 互換層の補助面: `output/agi_readiness/compatibility_completion_status.json`
  - scope: `compatibility_layer`
- 古い互換別名: `output/agi_readiness/sovereign_goal_completion_status.json`
  - 互換用に残すだけで、いまの見出し語彙ではない

## 3) 1 つのハーネスの中にある 4 つの面

この repo は 1 つの統治付きハーネスの中に複数の面を持たせています。  
分かれているのは repo ではなく、**信頼境界と責務**です。

### 実行面

- 主要経路: `POST /api/exec`
- 役割: 依頼理解、計画、ツール利用、専門ワーカーへの委譲、継続状態の保持、成果物と証拠の記録
- 最適化対象: 採択可能な成果物、不要な人手介入の削減、時間 / コスト効率、継続性の品質

### 評価面

- 主要経路: `POST /api/eval/run`
- 役割: 再実行による確認、採点、回帰検知、保護付き評価、到達度確認、fail-closed の検証
- 最適化対象: 比較可能性、再現可能性、漏えい耐性、回帰への感度

### 監視面

- 主要な公開面: `GET /api/runtime`、`GET /api/harness/overview`、`logs/current/`、`output/`、`runtime/`
- 役割: 稼働状態の把握、`logs/current/` の見える化、`output/` の見える化、運用者が確認できる drift / debt の追跡

### 統治面

- 見出しとなる公開面: `output/governance_public/worker_decision_surface.json`
- 支える公開面: `goal_completion_status.json`、`subjective_goal_completion_status.json`、`compatibility_completion_status.json`、最終判定や bundle overview の成果物
- 役割: 最終判定、出荷判断、昇格 / 非昇格、採択 / 保留判断、方針に沿った停止判断

## 4) 信頼境界のルール

- 実行面は hidden grader asset に依存してはいけない
- 実行面は、運用者向けの出荷可否を単独で確定してはいけない
- 統治面は hidden benchmark や protected holdout の結果をまとめてよい
- 統治面は program-facing score と worker-facing decision を混同してはいけない
- 互換面は legacy alias を提供してよいが、primary vocabulary を上書きしてはいけない

## 5) 主要経路と posture

- execution route: `POST /api/exec`
- evaluation / release route: `POST /api/eval/run`
- legacy local orchestration: `/api/batch/*`
- reference architecture default: `portable_local`
- stronger local ownership posture: `owner_local`
- reviewed team posture: `reviewed_team`

`portable_local` は「広く配れる形」を優先する既定姿勢です。  
`owner_local` はローカル所有者の強い権限を含められますが、共通既定ではありません。  
`reviewed_team` はチーム運用を前提に、証拠とレビューを強めた姿勢です。

## 6) 現在の構成

この repo は、1 つのハーネスの中に次を収めています。

- 制御の面
- ワーカーの面
- 評価の面
- 記憶と継続の面
- 公開証拠の面

ただし、これらは別製品ではありません。  
**固定された権限境界の内側で役割を分けているだけ**です。

## 7) 機械可読 contract

主要な機械可読 contract は次です。

- `scripts/config/harness_contract_spec.json`
- `scripts/config/task_outcome_contract.json`
- `scripts/config/user_facing_response_contract.json`
- `scripts/config/design_acceptance_contract.json`
- `scripts/config/iteration_control_contract.json`
- `scripts/config/adoption_readiness_evaluator_contract.json`
- `scripts/config/worker_decision_surface_contract.json`
- `scripts/config/deployment_posture_profiles.json`

## 8) 現在の公開面と最終判定 bundle

現在の公開面として最低限そろっているべきもの:

- `design_conformance_summary.json`
- `latest_run_summary.json`
- `latest_signoff_summary.json`
- `review_load_breakdown.json`
- `operator_summary.json`

最終判定 bundle の最上位構成も固定です。

代表例:

- `bundle_overview.md`
- `worker_decision_surface.json`
- `goal_completion_status.json`
- `subjective_goal_completion_status.json`
- `compatibility_completion_status.json`

## 9) 現在の学習面

この repo は OpenAI developer lane と Anthropic engineering lane を持ちます。  
ただし、実行時の取り込みまで開いている主レーンは OpenAI 側です。Anthropic 側は補助レーンとして、持ち運びやすい原則の抽出と提案生成に寄せています。

現在の学習面で見る主なもの:

- `output/openai_blog_learning_report.md`
- `output/anthropic_engineering_learning_report.md`
- `output/agi_readiness/autonomous_learning_status.json`
- `runtime_snapshot.json`
- `signoff_summary.json`

## 10) この repo をどう呼ぶか

この repo は、対応先の多さや派手さを前面に出す実行環境ではありません。  
正確には、**固定された権限境界の内側で、AI に仕事を進めさせ、その結果を採択可能かどうかまで判断する統治付き高自律ワーカー基盤**です。
## Autonomous Learning Verified-Positive Contract

- `currentVerifiedPositiveCount`: current `exportSessionId` window 内で `remediationEffect = "verified_positive"` になった件数。同じ window の `passed` terminal entry を含む。
- `historicalVerifiedPositiveCount`: prior `exportSessionId` windows から carry された verified-positive 累積。current window 分は含めない。
- `summary.verifiedPositive`: total ではなく `currentVerifiedPositiveCount` と strict equality。
- `countSemantics`: JSON artifact に同梱される machine-readable contract。strict public eval が summary/count equality と合わせて fail-closed で検証する。
