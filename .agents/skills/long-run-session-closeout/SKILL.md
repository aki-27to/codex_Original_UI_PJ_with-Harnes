---
name: "long-run-session-closeout"
description: "Use when closing a long-running session so verifier state, acceptance criteria, unresolved issues, and the next-session brief are captured without false completion."
---

# long-run-session-closeout

## 目的

複数フェーズにまたがる長時間セッションを閉じる前に、完了判定、検証状態、受け入れ条件、未解決事項、次回ブリーフを固定する。

最大のリスクは false completion。つまり、verifier state、acceptance criteria、unresolved issues が未完了を示しているのに、手続き上閉じたことだけで完了扱いにすること。

## 必須入力

- 原初のユーザー依頼と、その後の scope change。
- 現在の `sprint_contract` または同等の acceptance criteria。
- failed、blocked、skipped checks を含む最新の `verification_status`。
- 現在の `task_state.status` と unresolved issues。
- 次回に引き継ぐべき changed surface と durable artifacts。

## 手順

1. task contract を再ロックする。
   - user goal、non-goals、constraints、acceptance criteria を再記録する。
   - confirmed requirements と assumptions を分ける。

2. 作業結果を acceptance criteria と照合する。
   - 各 criterion を satisfied、unsatisfied、blocked、not_verified のいずれかに分類する。
   - internal plan completion を user-adoptable outcome の代替にしない。

3. verifier state を確認する。
   - 必須チェックが実行され、合格したかを確認する。
   - failed、blocked、flaky、skipped checks は影響とともに記録する。
   - 必須証拠の欠落は `COMPLETED` ではなく `FAILED_VALIDATION` として扱う。

4. final task state を決める。
   - criteria、verification、documentation sync、risk reporting がすべて満たされた場合だけ `COMPLETED` を使う。
   - 有用な作業は進んだが acceptance が未達なら `PARTIAL` を使う。
   - 実装はあるが evidence gate を通過していないなら `FAILED_VALIDATION` を使う。
   - 外部依存や能力不足で進めないなら `BLOCKED` を使う。
   - 本当にユーザー判断が不可欠な場合だけ `NEEDS_INPUT` を使う。

5. continuation record を出力する。
   - 完了時でも、将来の保守や検証に必要な文脈があるなら `next_session_brief` を含める。
   - 未完了の場合は、次の action を具体的かつ検証可能にする。

## 出力契約

closeout には次を含める。

- `sprint_contract`: goal、constraints、acceptance criteria、non-goals。
- `verification_status`: checks、outcomes、blockers、residual risk。
- `next_session_brief`: resume instructions と最初の next action。
- `task_state.status`: `COMPLETED`、`PARTIAL`、`FAILED_VALIDATION`、`BLOCKED`、`NEEDS_INPUT` のいずれか。

## 完了条件

- process closure、plan exhaustion、review closure だけで `COMPLETED` を主張しない。
- unresolved issues を本文に残しながら `task_state.status` を `COMPLETED` にしない。
- ユーザー向け closeout は短く保つ。ただし adoption decision に必要な verification evidence と residual risk は必ず含める。
