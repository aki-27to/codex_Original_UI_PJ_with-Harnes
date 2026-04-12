# DESIGN_ACCEPTANCE_CONTRACT

Updated: 2026-04-12

## 1) 目的

design-sensitive work の completion gate を固定します。build/test/200 は十分条件ではなく、visual intent と benchmark superiority を別に判定します。

## 2) Hard Requirements

以下が欠けたら `COMPLETED` にしてはいけません。

- active taste memory または同等の intent contract
- benchmark / reference target の明示
- desktop screenshot review
- mobile screenshot review
- independent reviewer / tester verdict

## 3) Failure Rule

次のいずれかが欠けるなら `FAILED_VALIDATION` です。

- visual evidence
- benchmark reasoning
- independent review
- benchmark superiority を問うタスクで PASS/FAIL を明示していない

## 4) Default Taste Signals for This Harness

既定では次を好みます。

- intent first
- benchmark-aware
- no empty polish
- no false-complete visual claim

詳細は current taste memory と task-specific contract を優先します。
