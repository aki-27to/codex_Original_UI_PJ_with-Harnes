---
name: review-agent-essence-codex
description: "Use when reviewing Codex skills, harnesses, App Server surfaces, AGENTS.md, .codex, .agents, scripts/config, UI, or evidence surfaces against agent-essence principles."
---

# review-agent-essence-codex

## Purpose

Codex向けのスキル、ハーネス設計、App Server実装、設定、証拠面、UI挙動を `reference/agent-essence.md` の原則に照らしてレビューし、設計上の強み、弱み、改善案を返す。

**このスキルは原則として対象を直接修正しない。** ユーザーが明示的に実装を依頼した場合だけ、レビュー結果を別タスクの変更計画へ接続する。

## Default Boundary

- Codex repo 固有面の read-only principle evaluator として扱う。
- `review-harness-codex` の whole-system health diagnosis や `skill-design-review-codex` の SKILL.md 構造評価と混ぜない。
- `HEAD`、dirty working tree、live runtime、generated output を分け、混在している場合は truth scope を明示する。
- 読んでいない面、実行していない検証、外部レビューの意見は根拠ではなく `not_checked` または補助情報として扱う。

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

## Procedure

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

## Output Contract

返す内容には次を含める:

- `verdict`: 原則上の評価（強い / 条件付き / 要修正 / 判断不能）
- `truth_scope`: `HEAD`、dirty tree、live runtime、generated output、unknown のどれを見たか
- `evidence`: 読んだファイル、確認したコマンド、参照した出力面
- `strengths`: Codex面で守るべき本質的な良さ
- `findings`: 原則違反または設計上の弱点を重要度順に並べたもの
- `required_fixes`: 本質を落とさず採択しやすくする最小修正
- `non_claims`: release verdict、runtime挙動、未確認生成物など、検証していないため主張しないこと

## Evidence And Verification

- `reference/agent-essence.md` と対象 surface の両方を根拠にする。
- repo-local skill を対象にする場合、必要に応じて `scripts/config/repo_local_skill_catalog.json` と対象 `SKILL.md` を確認する。
- harness/current-truth を対象にする場合、`git status`、`logs/current`、`output/governance_public`、`output/agi_readiness` のうち確認した面だけを evidence に含める。
- skill package 自体を変更した場合は、構造評価として `node .agents/skills/skill-design-review-codex/scripts/analyze-skill-design.js .agents/skills/<skill-name>`、パッケージ整合として `node scripts/repo_local_skill_catalog_test.js` と `node scripts/skill_portfolio_audit.js` を使う。

## Gotchas

- 対象を直接書き換えない。レビュー依頼を実装タスクにすり替えない
- Codex評価では、Claude Code用ファイルの有無を中心にしない
- `HEAD`、dirty tree、live runtime、generated output を混ぜて1つの真実として扱わない
- 全原則を均等に扱わない。無関係な原則は「-」にする
- 判定「○」にも根拠を書く。良い設計を言語化することもレビュー価値に含める
- 高スコアはrelease verdictではない。採択可否はタスク固有の証拠、fresh review、release gateで別に決める

## Failure Guard

- `review-harness-codex`、`skill-design-review-codex`、`skill-promotion-governance` の責務を奪わない。
- Codex固有の正常な欠落を Claude Code 欠落として減点しない。
- current-truth の範囲が不明なまま、現在動いている挙動として断定しない。
- 原則レビューを、実装完了、release可否、UI品質保証、外部安全性確認の代替にしない。
- 対象の本質的な良さを消す修正を、原則準拠の名目で提案しない。
