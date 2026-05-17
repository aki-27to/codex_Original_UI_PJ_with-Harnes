---
name: "artifact-improvement-learning"
description: "Use when an artifact such as README, docs, UI, code, tests, prompts, or instructions improved and the reusable pattern, anti-pattern, trigger, promotion condition, or rollback condition must be captured."
---

# artifact-improvement-learning

## Purpose

Turn an artifact improvement into reusable learning only when evidence shows it should affect future behavior.

## Procedure

1. Identify the artifact kind and the before-problem.
2. Describe the after-improvement in behavior terms, not just file terms.
3. Link user feedback, verification, review, or evaluation evidence that supports the improvement.
4. Extract one reusable pattern and one anti-pattern.
5. Define retrieval triggers, promotion criteria, and rollback criteria.
6. Decide whether the learning belongs in conversation notes, project guidance, a skill, a test, docs, config, or policy.

## Output Contract

Return:

- `learning_event`: artifact, before-problem, after-improvement, and evidence.
- `reusable_pattern`: transferable behavior with trigger.
- `anti_pattern`: behavior to avoid and detection cue.
- `target_surface`: note, doc, skill, test, config, policy, or no-change.
- `promotion_condition`: evidence required before durable adoption.
- `rollback_condition`: condition requiring removal or downgrade.
- `open_issues`: missing checks, scope limits, or overgeneralization risk.

## Evidence

- Changed artifact paths.
- Verifier, reviewer, or user feedback.
- Eval or replay evidence when available.
- Learning ledger or proposal output when used.

## Verification

Before treating learning as durable:

- confirm the improvement is reusable beyond the single artifact;
- confirm the trigger is narrow enough to avoid over-application;
- confirm promotion and rollback conditions are explicit;
- confirm deterministic repeated mistakes are routed toward tests, scripts, config, or code when possible.

## Failure Guard

Do not promote one-off observations, preference guesses, or unverified fixes into durable guidance. Do not create a skill when a smaller note, test, or doc update is enough.
