# ハーネス セットアップガイド

このガイドは、Claude Codeを導入したばかりのプロジェクト（settings.json未設定、スキル0個、Hook0件）向けの初期設定推奨手順です。

通常の25指標診断はハーネスがある程度構築された後に実行するものです。まだ何もない状態にスコアを付けても意味がないので、代わりにこのガイドで最初の5ステップを踏みましょう。

---

## Step 1. CLAUDE.md を作る（5分）

プロジェクトルートに CLAUDE.md を作成し、最低限のスタック宣言を書く。

```markdown
## Stack
- 言語: {TypeScript / Python / Go / ...}
- テストFW: {Vitest / pytest / ...}（{Jest / unittest / ...}ではない）
- パッケージマネージャ: {pnpm / uv / ...}

## Testing
`{npm test / pytest / go test}` で実行

## Architecture
{1-2文でディレクトリ構造の概要}
```

**なぜ最初にやるか**: Claudeは技術スタックを明示しないと訓練データの頻度で推測する（TypeScriptプロジェクトなのにJavaScriptで書く等）。最初に宣言することで、全てのセッションでの出力品質が底上げされる。

## Step 2. 評価基準を保護する（5分）

`.claude/settings.json` を作成し、テスト・lint設定をエージェントが改変できないようにする。

```jsonc
// .claude/settings.json
{
  "permissions": {
    "deny": [
      "Edit(.eslintrc*)",
      "Edit(biome.json)",
      "Edit(**/*.test.*)",
      "Edit(**/*.spec.*)",
      "Edit(tsconfig.json)",
      "Edit(.claude/settings*)"
    ]
  }
}
```

**なぜ早い段階でやるか**: エージェントは「テストを通す」最短経路を選ぶ。テスト自体の書き換えが最短経路になりうるので、それを物理的に閉じておく。設定ファイル自体の保護（最後の行）も忘れない。

## Step 3. 不可逆操作を制限する（5分）

Step 2で作成した settings.json の deny リストに追加する。

```jsonc
// permissions.deny に追加
"Bash(git push --force*)",
"Bash(git reset --hard*)",
"Bash(rm -rf *)"
```

**なぜ必要か**: エージェントは間違ったコマンドを確信を持って実行する。不可逆操作は取り返しがつかないので、deny で物理的にブロックする。

## Step 4. 最初の Hook を設定する（10分）

Write/Edit 後に自動でフォーマッターを実行する Hook を設定する。

```jsonc
// .claude/settings.json に hooks セクションを追加
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Write|Edit",
        "command": "npx biome check --write \"$TOOL_INPUT_FILE_PATH\" 2>/dev/null || true"
      }
    ]
  }
}
```

使用しているフォーマッターに合わせてコマンドを変更する（`prettier --write`, `black`, `gofmt` 等）。

**なぜ Hook か**: プロンプトで「フォーマットして」と書いても忘れる。Hook ならツール実行直後に自動で走るので、忘れようがない。

## Step 5. 方向を確認する（次回セッション）

ここまでの設定が完了したら、次回のセッションで `/review-harness` を実行して25指標の診断を受ける。初期設定だけでもいくつかの指標が✅になっているはず。残りの⚠️❌を見て、次に何をすべきか判断する。

---

## この後に検討すること

上記5ステップの後、以下を順次検討する:

- **Memory の設定**: セッション間で記憶を引き継ぎたい場合
- **Skill の作成**: 繰り返すワークフローがある場合
- **MCP の接続**: 外部サービスとの連携が必要な場合（CLIで代替できないか先に確認）
