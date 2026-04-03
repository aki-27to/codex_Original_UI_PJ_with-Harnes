# handoff-artifact-generation

## いつ使うか
- セッションを終了または一時停止する時
- 次セッションに full transcript ではなく軽量 bundle を渡したい時
- `task_summary` / `next_session_brief` / `open_issues` をまとめて生成したい時

## いつ使わないか
- turn-local の一時メモだけを残せば十分な時
- handoff を作らず同一セッション内で継続する時

## 期待成果物
- `task_summary`
- `next_session_brief`
- `open_issues`
- `verification_status`
- `changed_surface`
- 必要なら `durable_learnings`

## 手順
1. 最新の `task_state` / `plan_state` / `verifier_state` を読む。
2. 未解決事項と次アクションを抽出する。
3. durable に昇格してよい学びだけを選別する。
4. human-readable と machine-readable の両方で artifact を出力する。
