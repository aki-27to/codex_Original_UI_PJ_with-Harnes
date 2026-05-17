---
name: "feedback-to-recurrence-patch"
description: "Use when user corrections, failed validations, PASS/FAIL contradictions, repeated misses, or subjective adoption failures must become a scoped recurrence patch and replay plan."
---

# feedback-to-recurrence-patch

## Purpose

Turn feedback into the smallest next-run behavior change that prevents recurrence. The output is not an apology or generic reflection; it is a scoped correction event, patch target, replay plan, and lifecycle recommendation.

## Procedure

1. Lock the miss: original request, actual artifact or surface, expected outcome, dissatisfaction reason, and failed phase.
2. Separate task truth from internal status: identify the primary oracle and compare it with validation or completion claims.
3. Classify failure type: `intent_mismatch`, `acceptance_gap`, `execution_error`, `validation_false_negative`, `validation_false_positive`, `evidence_gap`, `completion_claim_error`, or `subjective_quality_failure`.
4. Choose the smallest learning scope: `conversation_only`, `project`, `harness`, `plugin`, or `global`.
5. Choose patch target: `preflight_question`, `checklist`, `skill`, `test`, `code`, `config`, `policy`, `docs`, or `no_change`.
6. Generalize carefully: state transferable principle, one-off context, and forbidden overgeneralization.
7. Draft one next-turn question and one checklist sentence that would have caught the miss.
8. Define replay verification: original failing case plus at least one adjacent inverse case.
9. Assign lifecycle: `proposal_only`, `shadow_candidate`, `gated_candidate`, `auto_apply_candidate`, or `blocked`.

## Output Contract

Return:

- `correction_event`: observed miss, expected outcome, artifact or surface, dissatisfaction reason, failed phase.
- `task_truth_vs_internal_truth`: primary oracle, internal status, contradiction if any.
- `failure_type`: one classification with short rationale.
- `generalization_boundary`: transferable principle, one-off context, and forbidden overgeneralization.
- `next_turn_recurrence_patch`: preflight question and checklist sentence.
- `patch_target_decision`: target layer and why it is the smallest adequate scope.
- `replay_verification`: original replay case, adjacent inverse case, expected pass/fail signals.
- `lifecycle_recommendation`: lifecycle state, promotion condition, rollback condition.
- `open_issues`: missing evidence, authority questions, or adoption risk.

## Evidence

- User correction or acceptance feedback.
- Actual artifact, diff, screenshot, response, or file contents.
- Validation reason, worker decision surface, eval output, or status artifact when available.
- Replay or regression command output when a patch is implemented.

For Harnes-specific contracts, see `../../references/harnes-adapter-notes.md`.

## Verification

Before calling a recurrence patch adoption-ready:

- prove the original case now passes;
- prove the adjacent inverse case still fails when it should;
- confirm the chosen target layer is smaller than a policy or runtime change unless those layers are truly required;
- report `FAILED_VALIDATION` when replay or inverse coverage is missing.

## Failure Guard

Do not mutate runtime policy, authority contracts, external systems, or validation thresholds through this skill alone. Do not turn one user's one-off preference into a global rule without scope, replay, and rollback evidence.
