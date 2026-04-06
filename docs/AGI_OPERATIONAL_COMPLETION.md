# AGI Operational Completion

## 2026-04-05 update

- This document defines operational completion for this harness, not a public AGI claim.
- The top-level decision artifact is `output/agi_readiness/goal_completion_status.json`.
- `goalStatus = "OPERATIONALLY_COMPLETE"` is allowed only when strict live criteria pass, including stable coverage, robustness, horizon, continuity debt closeout, causal safety, distinct lineage quality, and three consecutive passing live exports.
- Supporting public artifacts include:
  - `output/agi_readiness/stable_coverage_matrix.json`
  - `output/agi_readiness/stable_coverage_trend.json`
  - `output/agi_readiness/robustness_breakdown.json`
  - `output/agi_readiness/causal_regression_alerts.json`
  - `output/agi_readiness/distinct_improvement_summary.json`
  - `output/continuity_public/continuity_debt.json`
  - `output/continuity_public/continuity_debt_trend.json`
  - `output/memory_public/causal_effectiveness_summary.json`

## 2026-04-06 subjective completion update

- `output/agi_readiness/subjective_goal_completion_status.json` is now the tracked companion artifact for subjective completion.
- `goal_completion_status.json` stays focused on operational completion, but now carries a summarized subjective status, failed criteria, why-not-yet reasons, and the enforced subjective window counts.
- Subjective completion is fail-closed and stricter than operational completion.
- Current main truth for the subjective decision requires the checked-in supporting artifacts:
  - `output/agi_readiness/learning_adoption_status.json`
  - `output/agi_readiness/self_directed_probe_status.json`
  - `output/agi_readiness/novel_task_acquisition.json`
- A local export does not become main truth until the tracked artifacts exist on `main`.

この文書は、この repo における「AGI を公開証明した」状態ではなく、**運用上の到達判定**を定義します。

## これは何か

- public claim ではなく、repo 内の live truth と public proof が十分に閉じた状態を判定するための基準です。
- governed memory、autonomous learning、continuity closeout、readiness、causal trace をまとめて見たときに、
  - bottleneck を検出できる
  - remediation agenda を自律生成できる
  - effect を evidence-backed に検証できる
  - harmful lesson を revoke できる
  - distinct lineage で improvement / regression を追える
  - continuity debt を閉じられる
  状態を「operational completion」と呼びます。

## これは何ではないか

- 公開の場で AGI を証明するものではありません。
- unsupported / not evaluated / missing evidence を PASS 扱いするものではありません。
- self snapshot を distinct victory と見なすものではありません。

## Truth source と public proof

- live truth:
  - `logs/archive/raw/runtime_state/memory/`
  - readiness / continuity / causal trace / autonomous learning の canonical projection
- public proof:
  - `output/memory_public/*`
  - `output/agi_readiness/*`
  - `output/continuity_public/*`

public proof は redacted projection であり、live truth をそのまま dump しません。

## Goal completion criteria

`output/agi_readiness/goal_completion_status.json` は次を判定します。

- `stableCoverageBreadth = 1`
- `R_robust >= 0.93`
- `H_horizon >= 0.97`
- `rawFinalScore >= 0.90`
- `openDebtCount = 0`
- `blockedSubtasks = 0`
- `integrationPendingCount = 0`
- `ambiguous_instruction.status != "no_evidence"`
- `missing_context.score >= 0.80`
- `browser_tool_flakiness.score >= 0.75`
- verified positive remediation が最小件数以上
- distinct lineage が最小件数以上で non-worsening
- harmful causal trace 比率が閾値以下

これらをすべて満たしたときだけ、`goalStatus = "OPERATIONALLY_COMPLETE"` にできます。
1 つでも落ちていれば `goalStatus = "NOT_YET"` です。

## `goal_completion_status.json` の意味

最低限、次を含みます。

- `goalStatus`
- `whyNotYet`
- `completionCriteria`
- `currentValues`
- `lastPositiveClosureAt`
- `requiredNextActions`

見方:

- `goalStatus`
  - 現時点の到達判定
- `whyNotYet`
  - どの条件がまだ足りないか
- `currentValues`
  - readiness / debt / remediation / causal trace の現在値
- `requiredNextActions`
  - 次に閉じるべき改善項目

## まだ未達のときに見る場所

優先的に確認する場所は次です。

- `output/agi_readiness/latest_readiness.json`
  - breadth / robustness / horizon / score
- `output/agi_readiness/robustness_breakdown.json`
  - robustness category ごとの弱点
- `output/agi_readiness/autonomous_learning_status.json`
  - agenda と remediation effect
- `output/agi_readiness/causal_learning_trace.json`
  - lesson / hint が runtime にどう効いたか
- `output/agi_readiness/distinct_improvement_lineage.json`
  - distinct improvement history
- `output/continuity_public/continuity_debt.json`
  - closeout されていない debt

## 運用上「AGI に非常に近い」とみなす条件

この repo では、次を満たしたときに「運用上、AGI に非常に近い」と判断します。

- learning loop が自律的に回る
- effect verification が fail-closed
- harmful lesson が revoke される
- beneficial lesson が reinforce される
- distinct lineage が継続的 improvement を示す
- continuity debt が閉じている
- public proof から bottleneck / remediation / effect / debt closeout が読める

ただし、これは operational completion であり、public AGI claim とは別です。
## 2026-04-06 sovereign completion update

- `OPERATIONALLY_COMPLETE` remains the lower gate.
- `SUBJECTIVE_AGI_NEAR_COMPLETE` remains the intermediate fail-closed gate.
- `SUBJECTIVE_AGI_COMPLETE` is allowed only when `output/agi_readiness/sovereign_goal_completion_status.json` passes on current `main`.
- This is an internal current-main truth gate, not a public claim about AGI in the general sense.
