---
name: "safe-refactor-with-proof"
description: "Guide safe multi-file refactors with proof. Use when code, docs, configs, tests, or generated artifacts change together and Codex must keep diffs minimal, reversible, verified, and synchronized."
---

# safe-refactor-with-proof

## Purpose

Keep refactors small, reversible, and evidence-backed.

## Procedure

1. Capture baseline status and identify unrelated dirty work.
2. Make the minimal behavior-preserving or explicitly scoped change.
3. Update tests/docs/artifacts only when they are part of the changed surface.
4. Run targeted tests first, then broader checks when shared behavior changes.
5. Report rollback notes and residual risk.

## Output Contract

Return a concise result with:

- `outcome`: the decision, artifact, or behavior change this skill produced.
- `evidence`: files, commands, logs, or artifacts checked.
- `open_issues`: missing checks, residual risks, or follow-up work.

## Evidence

- `git status --short --branch`
- `git diff --stat`
- targeted and broader test commands
- docs/artifact sync notes

## Failure Guard

Do not clean up or revert unrelated user changes while proving the refactor.
