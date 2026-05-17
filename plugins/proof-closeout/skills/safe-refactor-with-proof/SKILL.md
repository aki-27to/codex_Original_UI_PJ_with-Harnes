---
name: "safe-refactor-with-proof"
description: "Use for multi-file or shared-surface refactors that must remain small, reversible, synchronized with docs or artifacts, and verified with proof."
---

# safe-refactor-with-proof

## Purpose

Keep refactors minimal, reversible, and evidence-backed. Use this skill when the risk is not just writing code, but proving the refactor did not silently expand scope or break shared behavior.

## Procedure

1. Capture baseline status and identify unrelated dirty work before editing.
2. State the intended behavior-preserving or explicitly scoped behavior-changing outcome.
3. Make the smallest change that satisfies the task.
4. Update tests, docs, configs, or generated artifacts only when they are part of the changed surface.
5. Run targeted checks first, then broader checks when shared behavior or public surfaces changed.
6. Record rollback notes that identify the touched files and the safest reversal path.

## Output Contract

Return:

- `baseline_status`: initial dirty state and unrelated changes.
- `changed_surface`: files, modules, APIs, configs, docs, tests, or generated artifacts touched.
- `verification_status`: commands or artifacts checked, result, skipped checks, and residual risk.
- `rollback_notes`: practical reversal notes for task-owned changes.
- `open_issues`: missing checks, remaining risks, or follow-up work.

## Evidence

- version-control status and diff summary
- targeted and broader test commands
- docs or artifact sync notes
- reviewer or tester findings when available

## Failure Guard

Do not clean up, revert, or reformat unrelated user changes while proving the refactor. Do not hide scope growth behind a refactor label.
