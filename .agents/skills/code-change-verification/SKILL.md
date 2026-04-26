---
name: "code-change-verification"
description: "Use when a session needs to verify changed code, summarize verification status, and capture changed surface or open issues for closeout and handoff."
---

# code-change-verification

## 目的

ローカルのコード、設定、テスト、ドキュメントを変更したあと、closeout や handoff の前に検証状態を監査可能な形で整理する。

この skill の役割は、何を変えたか、何を検証したか、何が失敗または未実行か、どのリスクが残っているかを明確にすること。

## 必須入力

- `git status`、`git diff --stat`、直近の編集内容、またはユーザー指定スコープから changed surface を特定する。
- 変更面に対応するテスト、手動確認、スクリーンショット、レビュー証跡を特定する。
- ユーザー由来または unrelated な既存変更は保持する。現在タスクの検証対象として必要な場合だけ明示的に扱う。

## 手順

1. changed surface を収集する。
   - 変更されたファイル、モジュール、API、UIパス、設定キー、ドキュメント、生成物を要約する。
   - task-owned changes と既存の unrelated changes を区別できる場合は分けて記録する。

2. リスクに応じて検証を対応づける。
   - 狭い変更では targeted test を優先する。
   - shared behavior、protocol contract、runtime config、user-facing flow に触れた場合は broader regression check を追加する。
   - UI変更では、レイアウトや操作が成果に関わる場合に visual / browser evidence を含める。

3. verification result を記録する。
   - 各チェックを `pass`、`fail`、`blocked`、`not_run` のいずれかで記録する。
   - command 名と意味のある結果を残す。意図だけで完了を主張しない。
   - 実行できなかったチェックは、blocker と残留リスクを明記する。

4. unresolved issues を捕捉する。
   - defect、flaky check、missing evidence、assumption、follow-up work を `open_issues` に記録する。
   - open issue は adoption / release risk に関係する事実に絞る。

## 出力契約

closeout、handoff、または session summary に次を出力または更新する。

- `verification_status`: 実行したチェック、結果、未実行チェック、blocker、残留リスク。
- `changed_surface`: タスクが影響したファイルまたは挙動面。
- `open_issues`: 完了判断に影響する未解決 defect、未取得証拠、前提。

## 完了条件

- 必須検証が失敗、未実行、または正当化なしに省略された場合は `COMPLETED` にしない。
- 実装はあるが検証が不十分な場合は、`PARTIAL` または `FAILED_VALIDATION` として残りの検証を具体化する。
- ユーザー向け最終報告では、内部証跡を圧縮しつつ、commands、outcomes、risks は落とさない。
