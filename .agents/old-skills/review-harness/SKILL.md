---
name: review-harness
description: "Use when diagnosing a Claude Code harness with the bundled 25 anti-pattern rubric. 「ハーネス診断」「診断して」「harness診断」「設定チェック」「ハーネスの健康診断」で発動。"
context: fork
agent: general-purpose
model: opus
---

# review-harness

## Purpose

Claude Codeのハーネス構成（CLAUDE.md、settings.json、Skills、Hooks、Memory等）を25のアンチパターン指標で診断し、文脈を考慮したスコアリングと具体的な改善案を出力する。

**評価基準**: `diagnosis-rubric.md`（本スキル同梱。agent-essenceの原則IDで参照）

## Default Boundary

- Claude Code harness 専用の diagnosis evaluator として扱う。
- Codex App Server repo を診断する場合は、原則として `review-harness-codex` を優先し、このスキルは Claude向け祖先として扱う。
- 既定は read-only。設定変更、skill追加、hook追加、MCP設定変更、外部投稿、clipboard操作は行わない。
- OGP画像表示、レポートファイル生成、シェア文生成は、ユーザーが明示的に求めた場合だけ実行する。
- 読んでいないファイルや存在しない surface は、欠点ではなく `not_found` / `not_checked` として扱う。

## Input / Output

- **Input**: `$ARGUMENTS` = 診断対象プロジェクトのパス（省略時はカレントディレクトリ）
- **Output**: 標準出力に診断レポートを返す。ファイル生成、OGP表示、clipboard操作は明示要求時のみ

## Procedure

### Phase 1. ハーネス構成の収集

対象プロジェクトから以下を読み込み、現状マップを構築する。存在しないものはスキップ。

```
読み込み対象:
  CLAUDE.md（プロジェクトルート）
  ~/.claude/CLAUDE.md（ユーザーレベル、存在すれば）
  .claude/settings.json（permissions, hooks）
  ~/.claude/settings.json（ユーザーレベル、存在すれば）
  .claude/skills/**/*.md（スキル一覧とfrontmatter）
  .claude/agents/**/*.md（カスタムagent、あれば）
  ~/.claude/projects/*/memory/MEMORY.md（Memory構成）
  .mcp.json または .claude/mcp.json（MCP設定、あれば）
  .claude/settings.json の enabledPlugins（プラグイン設定）
  ~/.claude/plugins/（インストール済みプラグイン、あれば）
```

各ファイルについて:
- CLAUDE.md → 全文読み込み（行数、構造把握のため）
- settings.json → 全文読み込み（permissions, hooks構造の把握）
- Skills → 各スキルのSKILL.md frontmatterと冒頭30行（全文不要）
- Memory → MEMORY.md のエントリ一覧
- MCP設定 → 接続先サーバー一覧
- Plugins → enabledPluginsの一覧と、各プラグインが提供するスキル/Hook/スクリプトの概要

**プラグインの評価方針**: プラグインをインストールしているだけでは採点に影響しない。プラグインが提供する機能（Hook、スキル、検証ループ等）が**実際にハーネスの一部として機能している**場合に、該当指標の評価に反映する。

### Phase 2. 成熟度判定 → 分岐

収集結果からプロジェクトの成熟度を判定し、出力モードを分岐する。

| 条件 | モード | 出力内容 |
|------|--------|---------|
| settings.json未存在 AND スキル0個 AND Hook0件 | **スタートアップ** | 25指標診断の代わりに、セットアップガイドを出力 |
| 上記以外 | **通常診断** | 25指標フル診断 |

**スタートアップモード**: `quickstart-guide.md` を読み、初期設定の推奨手順を出力する。スコアリングは行わない（「まだ何もない」にスコアを付けても意味がない）。

### Phase 3. 診断実行（通常モード）

`diagnosis-rubric.md` を読み、25指標それぞれについて:

1. **事実の検出**: 収集データから該当する設定・記述を特定する
2. **文脈の評価**: プロジェクトの規模・性質・技術スタックを考慮して判定する
3. **スコア付与**: ✅(2) / ⚠️(1) / ❌(0) / —(対象外) のいずれかを付ける

**判定の核心**: 各指標は「アンチパターンがあるか」ではなく「そうなっている理由が正当か」を問う。diagnosis-rubric.md の「✅になる文脈」「❌になる文脈」を参照し、機械的な閾値判定ではなく理由ベースで判定する。

### Phase 4. レポート出力

`diagnosis-report-template.md` のフォーマットに従い、標準出力でレポートを返す。ユーザーがファイル成果物を明示的に求めた場合だけ、レポートを `output/harness-diag-{YYYY-MM-DD}.md` に書き出す。

**改善の優先順位**: ❌が複数検出された場合、以下の順で優先度を判定する（爆発半径が大きいものから）:

1. **C（権限と信頼境界）** — 設定ミスの影響が不可逆。最優先
2. **B（検証の堅牢性）** — 品質の構造的担保。次に重要
3. **A（帯域効率）** — 日常的な出力品質に直結
4. **D（知識と記憶）** — セッション跨ぎの効率
5. **E（環境設計）** — 長期的な安定性

Quick Wins はこの優先順位に従い、かつコスト（所要時間）の低いものから提案する。

### Phase 5. OGP画像表示 & シェア提案

ユーザーがOGP表示やシェア文作成を明示的に求めた場合だけ、以下を順番に実行する。

1. **グレード判定**: Phase 3で算出した総合%からグレードを決定（S:90%+ / A:75-89% / B:60-74% / C:40-59% / D:20-39% / E:<20%）

2. **レポートとOGP画像を開く**:
   ```bash
   open output/harness-diag-{YYYY-MM-DD}.md
   open .claude/skills/review-harness/ogp/rank-{grade}.webp
   ```
   ※ `{grade}` は s/a/b/c/d/e の小文字

3. **シェア提案**: ユーザーに「診断結果をXでシェアしませんか？」と問いかける。
   ユーザーが「する」「yes」等の肯定的な返答をした場合、以下の手順を実行する:

   **Step A. シェア文章を作成する**:
   レポートの「総評」セクションを元に、短評（40文字以内の1文）を生成する。
   - 最も印象的な強み or 最優先の改善点を抜粋
   - 例: 「Hook設計が光る構成！」「権限境界の整備が次の一手」「スキル活用が秀逸」

   以下のテンプレートに短評を埋め込み、完成したシェア文章を組み立てる:
   ```
   診断結果は{グレード}ランク({総合%}%)でした
   {短評}
   https://harness-diag.vercel.app/{grade}.html
   #まさおエージェントハーネス診断
   ```
   ※ ポスト全体がX（140文字制限）に収まるよう簡潔にする

   **Step B. クリップボードにコピーする**:
   組み立てた文章を `echo '...' | pbcopy` で実行する。
   コピー後「クリップボードにコピーしました。Xに貼り付けてポストしてください！」と伝える。
   ※ URLを含めることでXのタイムラインにOGPカード画像が自動表示される（リンククリック時はnote記事にリダイレクト）

## Gotchas

- 行数やファイル数の多寡だけで判定しない。200行のCLAUDE.mdでも全てが自作ハーネスの文書化なら正当
- 個人実験プロジェクトにエンタープライズ級の権限設計を求めない。プロジェクトの規模・影響範囲に応じて「対象外(—)」を適切に使う
- 診断はあくまで方向の確認。「スコアが低い＝悪い設定」ではなく「ここに改善余地がある」という読み方を促す
- スタートアップモードでは診断スコアを出さない。「まだ何もない」は当たり前なので、代わりに「最初にやるべきこと」を具体的に提案する

## Output Contract

返す内容には次を含める:

- `mode`: `startup` または `diagnosis`
- `truth_scope`: 読んだ Claude Code surface、存在しなかった surface、未確認 surface
- `score`: 通常診断時の総合%とランク。スタートアップモードでは出さない
- `evidence`: 指標ごとの根拠ファイル、設定、または `not_found`
- `findings`: 25指標の主要な問題と文脈評価
- `quick_wins`: 爆発半径と実装コストで並べた改善案
- `non_claims`: Codex App Server readiness、release可否、外部運用安全性など、このスキルでは主張しないこと

## Evidence And Verification

- `diagnosis-rubric.md`、必要に応じて `diagnosis-report-template.md` と `quickstart-guide.md` を読む。
- 診断対象の Claude Code surface は、読んだものだけ evidence に含める。
- プラグイン、hook、MCPは「存在」ではなく「ハーネスの実行経路で機能している根拠」がある場合だけ肯定評価する。
- このスキル自体を変更した場合は `node .agents/skills/skill-design-review-codex/scripts/analyze-skill-design.js .agents/skills/review-harness` と repo-local skill package checks を実行する。

## Failure Guard

- Claude Code向けの欠落を Codex App Server repo の欠陥として扱わない。
- 低スコアを失敗、高スコアを release-ready として扱わない。
- ファイル生成、ブラウザ起動、clipboard操作、外部投稿を既定動作にしない。
- インストール済みプラグインや存在する設定を、実際に使われている能力として過大評価しない。
- 文脈上正当な単純さを、アンチパターンとして機械的に減点しない。
