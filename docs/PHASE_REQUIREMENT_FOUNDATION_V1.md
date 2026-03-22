# PHASE_REQUIREMENT_FOUNDATION_V1

Updated: 2026-03-22

## 1) 目的

Requirement-Driven Foundation V1 は、Step 1/2 を無限に賢くし続けるためのフェーズではありません。
このフェーズの目的は、要件ロックから downstream traceability、post-lock drift の検出、runtime revision gate、release-time clause completion までを一貫した基盤として成立させることです。

このフェーズで成立しているべき中核は次の 8 項目です。

1. Requirement Lock が contract-driven single-card である
2. `requirement-contract.v5` が `lockedGoal` / `intentHypotheses` / `questionPlan` / `delightPlan` / `displayContract` を持つ
3. `requestCoverage` が prompt-derived であり、`core` / `parked` / `dropped` を持つ
4. unmapped core clause が `BLOCK` される
5. plan / dispatch が `requestClauseRefs` / `requirementRefs` / `acceptanceCheckRefs` を持つ
6. `postLockDrift` eval が default eval suite に含まれる
7. runtime `revisionGate` が silent rewrite を止め、`RETURN_TO_INTAKE` を返せる
8. `clauseCompletionScorecard` が core clause 未達の final completion を拒否する

## 2) 完了条件

このフェーズは、`node scripts/phase_exit_requirement_foundation_v1.js` が 8/8 `PASS` を返したときにのみ完了です。

完了判定の正本は次です。

- JSON: `output/phase_exit_requirement_foundation_v1.json`
- Markdown: `output/phase_exit_requirement_foundation_v1.md`

`/api/runtime` と `/api/harness/overview` は、この audit 結果から `phaseStatus.requirementFoundationV1` を公開します。

## 3) 凍結方針

このフェーズが `PASS` した後、Step 1/2 に対してこのフェーズ名義で許される変更は bug fix のみです。

許可:

- 既存 contract/schema/runtime/test の不整合修正
- exit audit を再び `PASS` に戻すための最小修正
- 明確な regression の修正

禁止:

- 新しい request extraction レーンの追加
- `questionPlan` の新しい賢化や自動化拡張
- delight lane の新しい判定ロジック追加
- Step 1/2 の新しい feature lane 追加
- 次フェーズ相当の機能を「ついで」に混ぜること

## 4) 運用ルール

- このフェーズを `done` と見なしてよいのは exit audit `PASS` のときだけです。
- 1 項目でも欠けた場合は `not_done` です。
- 完了後に Step 1/2 を触る変更は、bug fix であることを明示し、exit audit を再実行して `PASS` を維持しなければなりません。
