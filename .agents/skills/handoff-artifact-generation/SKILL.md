---
name: "handoff-artifact-generation"
description: "Use when a session needs to produce a durable handoff artifact with task summary, next-session brief, verification status, changed surface, and open issues."
---

# handoff-artifact-generation

## 目的

セッションの終了または一時停止時に、full transcript に依存せず次の Codex セッションや人間の運用者が再開できる durable handoff artifact を作る。

この skill の役割は、タスク状態、検証状態、変更面、未解決事項、次の一手を短く再利用可能な形で固定すること。

## 必須入力

- 現在のユーザー依頼と accepted scope。
- 完了済み作業、部分完了作業、明示的な non-goals を含む current task state。
- 最新の `verification_status`、`changed_surface`、`open_issues`。
- 次回作業で保持すべき durable files、logs、screenshots、reports、config contracts。

## 手順

1. task contract を再構成する。
   - user goal、scope、constraints、acceptance criteria を記録する。
   - confirmed requirements と assumptions を分ける。

2. completed work を要約する。
   - 重要な変更、判断、成果物を記録する。
   - continuation に役立つ場合だけ file path や artifact path を含める。
   - full transcript を handoff に貼り付けない。

3. verification state を保存する。
   - `verification_status` に checks / commands と outcomes を含める。
   - `changed_surface` に、次回セッションが誤って戻してはいけない変更面を残す。
   - failed、blocked、skipped checks は明示的な risk として引き継ぐ。

4. next-session brief を作る。
   - 最初に実行すべき exact next action から書く。
   - blocker、prerequisite、最小で安全な verification path を含める。
   - 触れてはいけない user-owned / unrelated changes が見えている場合は明記する。

5. durable learnings を必要な場合だけ残す。
   - 再利用可能で、今回の evidence に根拠がある learning だけを昇格する。
   - 一時的な推測、好み、単発の debug note を durable guidance にしない。

## 出力契約

handoff bundle には次を含める。

- `task_summary`: タスクの目的、範囲、実施済み内容。
- `next_session_brief`: 再開地点、最初の次アクション、必要な検証。
- `open_issues`: blocker、missing evidence、adoption risk。
- `verification_status`: checks、results、skipped checks、blockers。
- `changed_surface`: 変更された files、modules、APIs、UI flows、configs、artifacts。
- `durable_learnings`: 任意。証拠参照を持つ再利用可能な教訓。

## 完了条件

- 広い説明より、evidence-backed な短い箇条書きを優先する。
- handoff を完了済みに見せるために failed / missing verification を隠さない。
- タスクの completion rules と required evidence が満たされない限り、`COMPLETED` と書かない。
- paused task は状況に応じて `PARTIAL`、`FAILED_VALIDATION`、`BLOCKED`、`NEEDS_INPUT` のいずれかで明示する。
