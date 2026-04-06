---
name: "long-run-session-closeout"
description: "Use when closing a long-running session so verifier state, acceptance criteria, unresolved issues, and the next-session brief are captured without false completion."
---

# long-run-session-closeout

## いつ使うか
- 長時間タスクのセッション終了前
- 完了主張を出す前
- verifier / acceptance criteria / unresolved issues を照合したい時

## いつ使わないか
- 初回セットアップだけを行う時
- handoff を作らず短時間で同一セッション内に完了する時

## 期待成果物
- `sprint_contract`
- `verification_status`
- `next_session_brief`
- false completion を防いだ `task_state.status`

## 手順
1. verifier の最新結果を確認する。
2. acceptance criteria の未達を数える。
3. unresolved issue が残るなら `COMPLETED` にしない。
4. closeout 後に handoff bundle を生成する。
