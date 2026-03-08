---
name: feedback-promotion-governor
description: Convert user feedback into durable improvements without overfitting. Use when feedback suggests behavior tuning, answer-style adjustment, retry policy change, or guardrail calibration, and you must decide whether to apply change at turn, session, or global scope.
---

# Feedback Promotion Governor

Prevent local overfitting by promoting changes only with repeatable evidence.

## Core Rule

Never treat a single complaint as global truth.

Apply changes in three scopes:

1. `turn`: one-shot adaptation for this request.
2. `session`: temporary adaptation for this conversation.
3. `global`: persistent baseline change across conversations.

Default is `turn`. Promotion requires evidence.

## Workflow

1. Normalize feedback into a structured issue:
   - `signal_type` (length, delegation, grounding, latency, tone, safety, etc.)
   - `requested_direction` (increase, decrease, stricter, looser)
   - `failure_context`
2. Run anti-overfit checks:
   - Is it a one-time preference?
   - Does it conflict with current task intent?
   - Would global adoption likely hurt unrelated tasks?
3. Choose initial scope:
   - ambiguous feedback -> `turn`
   - repeated same-session pattern -> `session`
   - repeated cross-context pattern with low regression risk -> candidate `global`
4. Define promotion gate:
   - minimum repeated confirmations
   - minimum context diversity
   - maximum allowed regressions
5. Apply smallest safe change first.
6. Track outcome and side effects.
7. Promote only when gate passes; otherwise keep local or rollback.

## Promotion Gate (Recommended Defaults)

Use these defaults unless project policy overrides:

1. `turn -> session`:
   - repeated feedback count >= 2 in same session
   - no severe regression found
2. `session -> global`:
   - repeated feedback count >= 3
   - context diversity >= 2 distinct task contexts
   - regression rate <= 0.1

## Mandatory Evidence

When proposing `global` promotion, include:

1. `repeat_count`
2. `context_count`
3. `regression_checks`
4. `rollback_plan`
5. `ttl_or_review_window`

If any item is missing, do not promote to global.

## Anti-Pattern Guard

Reject these patterns:

1. "User said make answers longer once -> always long answers"
2. "One failure in one domain -> global threshold rewrite"
3. "No regression test -> persistent config change"

## Output Contract

Return:

1. Scope decision (`turn` / `session` / `global`)
2. Why that scope is appropriate
3. Promotion gate status (`pass` / `fail`)
4. Applied change and rollback trigger

## Reference

- `references/promotion-matrix.md`

