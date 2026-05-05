---
name: continuity-verification-closeout
description: Consolidate changed surface, verification state, and next-session brief after a successful long-horizon execution. Use when closeout must preserve verifier state and continuity evidence.
---

# Continuity Verification Closeout

Use after a successful long-horizon execution to combine changed surface, verification state, and next-session brief.

## Trigger
when closeout must preserve verifier and continuity state

## Deterministic Steps
- load latest verifier state
- refresh closeout summary
- emit next_session_brief

## Contextual Reasoning
- prefer verified artifacts
- do not promote session-only notes

## Output Contract

Return a concise result with:

- `outcome`: the decision, artifact, or behavior change this skill produced.
- `evidence`: files, commands, logs, or artifacts checked.
- `open_issues`: missing checks, residual risks, or follow-up work.

## Tests
- closeout_summary exists
- verification_status exists

Source Trace: output/agi_readiness/phase5/agi_readiness_public_latest.json
