---
name: "code-change-verification"
description: "Use after code, config, docs, UI, or generated-artifact changes when verification evidence must be matched to the changed surface before closeout."
---

# code-change-verification

## Purpose

Turn local artifact changes into an evidence-backed verification summary. This skill does not replace tests, CI, or reviewer judgment; it records what changed, which checks were run, which checks were skipped, and what risk remains.

## Procedure

1. Capture the changed surface with version-control status, diff summary, and task-owned paths.
2. Separate task-owned work from unrelated dirty work.
3. Match each changed surface to the narrowest relevant deterministic check: unit test, lint, typecheck, contract test, route/service test, browser evidence, visual evidence, or package script.
4. Run targeted verification first. Run broader regression checks when shared behavior, public artifacts, protocol contracts, runtime config, or UI flows changed.
5. Classify each check as `pass`, `fail`, `blocked`, or `not_run`, with exact command, artifact, or skipped-check reason.
6. Treat implementation summaries and self-reported completion as untrusted until command output, artifact inspection, reviewer evidence, or tester evidence supports them.

## Output Contract

Return:

- `verification_status`: each check, command or artifact inspected, result, blocker, and residual risk.
- `changed_surface`: task-owned files, modules, APIs, UI flows, configs, docs, or generated artifacts affected.
- `open_issues`: failed checks, skipped checks, flaky checks, blockers, assumptions, or adoption risk.
- `completion_readiness`: `ready`, `partial`, `failed_validation`, or `blocked`, based only on inspected evidence.

## Evidence

- version-control status and diff summary
- targeted verification command output
- broader regression output when shared behavior changed
- UI/browser/visual evidence when the changed surface is visual
- reviewer or tester findings when available

For portable evidence categories, see `../../references/generic-evidence-surfaces.md`.

## Failure Guard

Do not convert a green narrow check into broad release readiness. Do not hide failed or skipped checks. Do not mark a task complete when evidence only supports partial, failed validation, or blocked.
