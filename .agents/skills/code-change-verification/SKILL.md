# code-change-verification

## いつ使うか
- ローカルのコードまたは設定を変更した後
- `verification_status` と `changed_surface` を handoff に同期したい時
- closeout 前に public regression / verifier の最新結果を反映したい時

## いつ使わないか
- 調査だけで repo を変更していない時
- transcript だけを読み直す用途で continuity artifact を更新しない時

## 期待成果物
- 更新済みの `verification_status`
- 更新済みの `changed_surface`
- 必要なら `open_issues` への未解決検証項目の反映

## 手順
1. 変更ファイル一覧を確定する。
2. 関連する regression / verifier を再実行する。
3. pass / fail / 未検証を `verification_status` に反映する。
4. 変更ファイルと影響面を `changed_surface` に記録する。
