---
name: "long-run-session-closeout"
description: "Use before declaring a long-running task complete or paused so acceptance criteria, verification state, and unresolved issues are checked."
---

# long-run-session-closeout

## Purpose

Prevent false completion at the end of a long-running session. Closeout must compare the task contract, acceptance criteria, verifier state, unresolved issues, and next-session needs before deciding the final state.

## Procedure

1. Re-read the task contract: goal, scope, constraints, non-goals, acceptance criteria, confirmed requirements, and assumptions.
2. Map every acceptance criterion to `satisfied`, `unsatisfied`, `blocked`, or `not_verified`.
3. Inspect verifier state: command output, artifacts, reviewer/tester findings, skipped checks, flaky checks, and blockers.
4. Decide final task state:
   - `COMPLETED` only when criteria, verification, required sync, and risk reporting are all satisfied.
   - `PARTIAL` when useful work exists but acceptance is incomplete.
   - `FAILED_VALIDATION` when implementation exists but required evidence is missing or failed.
   - `BLOCKED` when an external dependency or missing capability prevents progress.
   - `NEEDS_INPUT` only when a user-owned judgment is truly required.
5. Produce a continuation record when the task is not complete.
6. Treat process closure, generated summaries, and self-reported completion as untrusted until mapped to evidence.

## Output Contract

Return:

- `sprint_contract`: goal, constraints, non-goals, and acceptance criteria.
- `verification_status`: checks, outcomes, blockers, skipped checks, and residual risk.
- `task_state.status`: `COMPLETED`, `PARTIAL`, `FAILED_VALIDATION`, `BLOCKED`, or `NEEDS_INPUT`.
- `next_session_brief`: resume instructions and exact next action when work remains.
- `open_issues`: unresolved requirements, missing evidence, or adoption risks.

## Evidence

- original user request and locked task contract
- acceptance criteria mapping
- verifier command output, artifacts, reviewer/tester findings, or skipped-check reasons
- changed surface and durable artifacts
- current status or decision surface when available

## Failure Guard

Do not end a long-running task with a success claim unless adoption-ready outcome and evidence are present. If evidence is incomplete, report the strongest truthful non-complete state.
