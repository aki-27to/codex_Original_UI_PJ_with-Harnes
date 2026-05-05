# SINGLE_HARNESS_MULTI_PLANE

Updated: 2026-05-05

## 1) 何を説明する文書か

この文書は、この repo が **1 つの governed harness** として動くことを説明します。  
実行用ハーネスと評価用ハーネスを別製品として並べるのではなく、1 つのハーネスの中で trust boundary と responsibility を分けています。

## 2) 4 つの面

### 実行面

- 主要 route: `POST /api/exec`
- 役割: request interpretation、planning、tool use、child dispatch、continuity、artifact capture
- 最適化対象: 採択可能な成果物、不要な人手介入の削減、時間とコスト、継続性の品質

### 評価面

- 主要 route: `POST /api/eval/run`
- 役割: replay、採点、回帰検知、保護付き評価、benchmark / readiness checks、fail-closed validation
- 最適化対象: comparability、reproducibility、leakage resistance、regression sensitivity

### 監視面

- 主要 surface: `GET /api/runtime`、`GET /api/harness/overview`、`logs/current/`、`logs/archive/`、`output/`、`runtime/`
- 役割: runtime health、logs/current visibility、output bundle visibility、post-run operator review、drift / debt / unresolved evidence tracking

### 統治面

- 見出し surface: `output/governance_public/worker_decision_surface.json`
- 支援 surface:
  - `output/agi_readiness/goal_completion_status.json`
  - `output/agi_readiness/subjective_goal_completion_status.json`
  - `output/agi_readiness/compatibility_completion_status.json`
  - `output/governance_public/bundle_overview.json`
  - `output/governance_public/signoff_summary.json`
- 役割: signoff、release judgment、promotion / no-promotion、adoption / block decision、policy-aligned stop decision

## 3) trust boundary

分割点は repo の境界ではなく、protected input と executor visibility の境界です。

- 実行面は hidden grader asset に依存してはいけない
- 実行面は holdout metadata を読んではいけない
- 実行面は protected eval manifest を直接読み込んではいけない
- 実行面は grader internals に依存してはいけない
- 評価面は execution trace と output artifact を読んでよい
- protected eval asset は `protected/holdout` と `protected/blackbox` に残す

### Claim provenance boundary

- readiness evidence classes are kept separate: `live_exec`, `policy_probe`, `artifact_simulator`, `repo_tracked_protected_eval`, and `true_hidden_eval`
- repo-tracked protected eval is not true hidden eval
- `protected/holdout` and `protected/blackbox` are policy-protected lanes in this checkout, not physically hidden grader assets
- a true-hidden readiness claim requires an externally hidden grader outside the execution workspace
- `bounded_multi_agent_orchestrator` is `artifact_simulator_until_native_child_dispatch_evidence`; it must not be described as independent child-agent execution until native child-dispatch proof exists

## 4) 見出しになる current truth

この多面構造の中でも、現在の見出し面は `worker_decision_surface` です。

- headline: `output/governance_public/worker_decision_surface.json`
- 補助面: `goal_completion_status.json`、`subjective_goal_completion_status.json`、`compatibility_completion_status.json`
- `sovereign_goal_completion_status.json` は legacy compatibility alias only

## 5) 一言でいうと

<!-- compatibility markers:
split point is trust boundary
repo-tracked protected eval is not true hidden
single governed harness
sovereign
POST /api/exec
POST /api/eval/run
-->

この repo は、実行・評価・監視・統治を 1 つのハーネスに束ねたまま、面ごとに責任だけを切り分けている設計です。
