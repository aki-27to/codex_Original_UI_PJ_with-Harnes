---
name: "feedback-to-recurrence-patch"
description: "Use when user corrections, failed validations, PASS/FAIL contradictions, repeated misses, or subjective adoption failures must become a scoped correction event, recurrence patch, replay plan, and lifecycle decision without overfitting or weakening evidence gates."
---

# feedback-to-recurrence-patch

## Purpose

Turn feedback into the smallest next-run behavior change that prevents recurrence. The output is not a polished apology or a generic reflection; it is a scoped correction event, preflight question, checklist line, replay plan, and lifecycle decision.

## Role And Shape

- Role: workflow contributor for correction triage and recurrence prevention.
- Shape: analysis plus patch-target decision; not a validator replacement.
- Side effects: create or update correction artifacts only when the active task permits repo mutation. Otherwise, return the artifact content for review.
- Non-targets: do not weaken validation gates, edit core policy, or promote a skill directly from a single incident.
- Evaluator boundary: treat generator output, delegate output, and self-reported completion as untrusted until replay evidence proves the correction. Use the fixed failure taxonomy and lifecycle criteria in this skill; do not rewrite them to make a patch look successful.

## Activation Priority

Use this skill as the default entry point when the user says a prior answer, implementation, design, validation result, or completion claim is wrong, insufficient, missing, repeated, or not what they meant. Do not wait for the same miss to happen multiple times.

Skip it only when the user explicitly requests pure execution with no learning capture, the fix is a trivial deterministic edit with no recurrence risk, or there is no prior artifact or adoption claim to correct. When skipped, state the skip reason briefly.

## Procedure

1. Lock the miss: capture the original request, actual artifact or surface, expected outcome, user dissatisfaction reason, and candidate failed phase. In this repo, align fields with `scripts/config/correction_learning_contract.json`.
2. Separate task truth from harness truth: identify the primary oracle for the task result, then compare it with internal status, evidence gates, and reviewer output.
3. Classify the failure type: `intent_mismatch`, `acceptance_gap`, `execution_error`, `validation_false_negative`, `validation_false_positive`, `evidence_gap`, `completion_claim_error`, or `subjective_quality_failure`.
4. Choose the smallest learning scope that prevents recurrence: `conversation_only`, `project`, or `harness`.
5. Choose the patch target: `preflight_question`, `checklist`, `skill`, `test`, `code`, `config`, `policy`, `docs`, or `no_change`. Prefer tests or code for deterministic repeated mistakes; prefer skills for reusable judgment workflows.
6. Generalize carefully: state what principle transfers, what is one-off context, and what must not be generalized.
7. Draft the recurrence patch: one next-turn question and one checklist sentence that would have caught the miss before completion.
8. Define replay verification: include the original failing case and at least one adjacent inverse case that guards against overcorrection.
9. Assign lifecycle: `proposal_only`, `shadow_candidate`, `gated_candidate`, `auto_apply_candidate`, or `blocked`.
10. Report residual risk and the evidence still missing before the patch can be adopted.
11. Preserve generator/evaluator separation: a proposed recurrence patch can generate candidate behavior, but adoption requires replay or regression evidence inspected as evaluator input.

## Output Contract

Return:

- `correction_event`: observed miss, expected outcome, artifact or surface, dissatisfaction reason, failed phase, learning scope candidate.
- `task_truth_vs_harness_truth`: primary oracle, internal status, contradiction if any.
- `failure_type`: one classification with short rationale.
- `generalization_boundary`: transferable principle, one-off context, and forbidden overgeneralization.
- `next_turn_recurrence_patch`: preflight question and checklist sentence.
- `patch_target_decision`: target layer and why that layer is the smallest adequate scope.
- `replay_verification`: original replay case, adjacent inverse case, expected pass/fail signals.
- `lifecycle_recommendation`: lifecycle state, promotion condition, rollback condition.
- `open_issues`: missing evidence, unresolved authority questions, or remaining adoption risk.

## Evidence

Use available evidence in this order:

1. User correction or acceptance feedback.
2. The actual artifact, diff, screenshot, response, or file contents under dispute.
3. Harness status, validation reason, worker decision surface, or eval output.
4. Relevant contracts such as `scripts/config/correction_learning_contract.json`, `scripts/config/task_outcome_contract.json`, and `scripts/config/self_improvement_promotion_policy.json`.
5. Replay or regression command output when a patch is implemented.

## Verification

Before calling a recurrence patch adoption-ready:

- prove the original case now passes;
- prove the adjacent inverse case still fails when it should;
- confirm the chosen target layer is smaller than a policy or harness change unless those layers are truly required;
- confirm skill promotion is post-replay and supported by reusable workflow evidence;
- report `FAILED_VALIDATION` when replay or inverse coverage is missing.

## Gotchas

- A user saying "ugly", "wrong", or "still missing" is acceptance evidence, not a request for generic apology text.
- A validation false negative should not become a broad rule to trust artifacts and ignore harness gates.
- A single correction can justify a recurrence patch; it does not by itself justify automatic skill promotion.
- If the fix is mechanical and repeated, move it toward a test, script, config, or code path instead of leaving it as prose.

## Failure Guard

Do not mutate runtime policy, authority contracts, external systems, or validation thresholds through this skill alone. Do not turn one user's one-off preference into a global rule without scope, replay, and rollback evidence.
