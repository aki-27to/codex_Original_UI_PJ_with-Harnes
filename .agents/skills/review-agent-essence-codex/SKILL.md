---
name: review-agent-essence-codex
description: Codexのスキル、ハーネス、App Server、AGENTS.md、.codex、.agents、scripts/config、UI/証拠面をagent-essence原則に照らしてレビューする。「Codexエッセンスレビュー」「Codex原則チェック」「Codex設計レビュー」で発動。
---

# review-agent-essence-codex

Codex向けのスキル、ハーネス設計、App Server実装、設定、証拠面、UI挙動を `reference/agent-essence.md` の原則に照らしてレビューし、設計上の強み、弱み、改善案を返す。

**このスキルは原則として対象を直接修正しない。** ユーザーが明示的に実装を依頼した場合だけ、レビュー結果を別タスクの変更計画へ接続する。

## Input / Output

- **Input**: ユーザーが指定した対象パス、または現在のCodex repo / skill / config / UI surface
- **Output**: 日本語の原則レビュー。必要ならファイルパス、行番号、証拠コマンドを添える
- **評価基準**: `reference/agent-essence.md`

## Codex Surface Map

対象に応じて、必要な面だけ読む。全探索しない。

- Authority: `AGENTS.md`, `docs/HARNESS_CONSTITUTION.md`, `scripts/config/authority_registry.json`
- Runtime posture: `.codex/config.toml`, `.codex/agents/*.toml`, `scripts/config/deployment_posture_profiles.json`
- Skill surface: `.agents/skills/**/SKILL.md`, `scripts/config/repo_local_skill_catalog.json`
- Execution and protocol: `POST /api/exec`, `POST /api/eval/run`, `/api/batch/*`, `server/**`, `server_impl.js`
- Evidence and outcome: `docs/EVIDENCE_CONTRACT.md`, `scripts/config/task_outcome_contract.json`, package scripts, verifier outputs
- Current truth: `git status`, `logs/current`, `output/governance_public`, `output/agi_readiness`, generated output freshness
- UI behavior: HarnesUI labels, `NEEDS_INPUT`, resend-ready states, visual evidence, focus-stealing defaults

## 手順

### 1. 対象と真実面を固定する

1. `reference/agent-essence.md` を読む
2. 対象が `HEAD`、dirty working tree、live runtime、generated output のどれに属するかを分ける
3. Claude固有面ではなく、Codex固有面で評価する。`CLAUDE.md` や `.claude/settings.json` が無いこと自体を減点しない

### 2. 関連原則を選定する

対象の性質に応じて、関連する原則だけを選ぶ。全原則を機械的に当てはめない。

選定基準:
- その原則がCodexの設計判断に実際に影響するか
- 違反した場合に実害が出るか
- 適用すると具体的な改善、証拠、失敗防止につながるか

特にCodexでは次を優先して見る:
- **T**: 親子分離、single writer、統合判断、dispatch plan
- **K**: repo内の発見可能な記憶、skill catalog、current-truth artifact
- **V**: 完了条件、テスト、fresh reviewer、release gate、UI/証拠の鮮度
- **S**: sandbox、approval、自己設定変更、外部書き込み、fail-closed
- **E**: 追加依存、portability、制約による品質安定

### 3. 評価を出す

以下の形式を標準にする。短答依頼なら圧縮してよいが、強み、改善案、見落としリスクは残す。

```markdown
# Codex Essence Review: {対象名}

> 評価基準: [agent-essence](reference/agent-essence.md)
> Truth scope: {HEAD / dirty tree / live runtime / generated output / unknown}

## 対象の要約

{対象が何をするものか、1-2文で}

## 原則適用マトリクス

| # | 原則 | 関連度 | 判定 | Codex上の根拠 |
|---|------|--------|------|------|
| C-1 | コンテキスト帯域は有限でゼロサム | {高/中/低/-} | {○/△/×/-} | {1文で} |
| T-1 | 関心ごとの分離 | ... | ... | ... |
| K-2 | エージェントからの可読性を最適化する | ... | ... | ... |
| V-2 | フィードバックループを閉じる | ... | ... | ... |
| S-1 | 信頼境界を明示的に設計する | ... | ... | ... |
| E-1 | 制約が品質を生む | ... | ... | ... |

※ 関連度「-」= 対象に無関係、判定も「-」にする

## 主要な指摘

### 強み
{原則に沿った良い設計判断を、Codex surfaceの根拠つきで挙げる}

### 改善提案
{関連度「高」で判定「△」「×」のものについて、具体的な改善案を提示}

- **原則 #N.M {原則名}**: {現状の問題} -> {具体的な改善案}

### 見落としリスク
{暗黙の前提、current-truthのズレ、未検証runtime、自己設定変更、外部書き込みの危険があれば指摘}

## 総評

{2-3文で、設計成熟度と最優先の改善点を述べる}
```

## Gotchas

- 対象を直接書き換えない。レビュー依頼を実装タスクにすり替えない
- Codex評価では、Claude Code用ファイルの有無を中心にしない
- `HEAD`、dirty tree、live runtime、generated output を混ぜて1つの真実として扱わない
- 全原則を均等に扱わない。無関係な原則は「-」にする
- 判定「○」にも根拠を書く。良い設計を言語化することもレビュー価値に含める
- 高スコアはrelease verdictではない。採択可否はタスク固有の証拠、fresh review、release gateで別に決める
