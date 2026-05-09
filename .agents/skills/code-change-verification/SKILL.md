---
name: "code-change-verification"
description: "Use when a session needs to verify changed code, summarize verification status, and capture changed surface or open issues for closeout and handoff."
---

# code-change-verification

## Purpose

Turn local code, config, docs, or artifact changes into an evidence-backed verification summary for closeout and handoff. This skill does not replace tests, CI, scripts, or reviewer judgment; it records which checks were run, which were skipped, and what risk remains.

## Procedure

1. Capture the changed surface with `git status`, `git diff --stat`, and task-owned file paths. Keep unrelated user changes separate.
2. Match each changed surface to the narrowest relevant deterministic check: unit test, lint, typecheck, route/service contract test, UI/browser evidence, or package script.
3. Run targeted verification first. Run broader regression checks when shared behavior, protocol contracts, runtime config, UI flows, or public artifacts changed.
4. Classify every check as `pass`, `fail`, `blocked`, or `not_run`, with the exact command or evidence surface.
5. Treat generator output, implementation summaries, and self-reported completion as untrusted until command output, artifact inspection, or reviewer evidence supports them.
6. Report unresolved defects, flaky checks, missing evidence, assumptions, and follow-up work as `open_issues`.

## Output Contract

Return:

- `verification_status`: each check, command or artifact inspected, result, blocker, and residual risk.
- `changed_surface`: task-owned files, modules, APIs, UI flows, configs, docs, or generated artifacts affected.
- `open_issues`: missing checks, failed checks, flaky checks, assumptions, adoption risk, or follow-up work.
- `completion_readiness`: `ready`, `partial`, `failed_validation`, or `blocked`, based only on inspected evidence.

## Evidence

- `git status --short --branch`
- `git diff --stat`
- targeted verification command output
- broader regression command output when shared behavior changed
- UI/browser evidence when the changed surface is visual
- reviewer/tester findings when available

## Verification

Before reporting code-change verification as complete:

- confirm every task-owned changed surface has a matching check or an explicit `not_run` reason;
- confirm failed, blocked, or skipped checks are listed as adoption risk;
- confirm unrelated dirty work is not claimed as verified task output;
- confirm `COMPLETED` is not claimed from implementation intent alone.

## Failure Guard

Do not convert a green narrow check into broad release readiness. Do not hide failed or skipped checks. Do not mark a task `COMPLETED` when the evidence only supports `PARTIAL`, `FAILED_VALIDATION`, or `BLOCKED`.
