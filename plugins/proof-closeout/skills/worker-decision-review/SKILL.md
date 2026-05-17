---
name: "worker-decision-review"
description: "Use before stopping work when Codex must decide whether an outcome is adoptable, needs revision, is blocked, or failed validation."
---

# worker-decision-review

## Purpose

Judge whether the current task can stop without unnecessary human interruption. The review must be grounded in the original request, changed surface, verification evidence, authority boundaries, and residual risk.

## Procedure

1. Re-read the original request, constraints, non-goals, assumptions, and acceptance criteria.
2. Inspect changed surface, verification status, skipped checks, failed checks, blockers, and reviewer or tester findings.
3. Check literal request alignment, latent intent alignment, authority boundary, evidence completeness, and remaining improvement cost.
4. Classify the outcome as `ADOPT`, `REVISE`, `BLOCK`, or `FAILED_VALIDATION`.
5. If evidence is missing, downgrade the state instead of claiming completion.
6. Do not alter adoption criteria mid-review. If the criteria are wrong, report that as a separate issue.

## Output Contract

Return:

- `decision`: `ADOPT`, `REVISE`, `BLOCK`, or `FAILED_VALIDATION`.
- `evidence`: artifacts, commands, diffs, logs, screenshots, or reviewer/tester findings used.
- `reasoning`: concise mapping from acceptance criteria to the decision.
- `open_issues`: missing evidence, residual risk, user-owned decisions, or follow-up work.

## Evidence

- original request and acceptance criteria
- changed surface and verification status
- task-specific decision artifacts when available
- reviewer, tester, CI, or external-tool findings when available

For a structured closeout result, see `../../references/proof-closeout-output-contract.md`.

## Failure Guard

Do not treat internal plan completion, implementation intent, or favorable self-reporting as adoption-ready without artifact-backed evidence.
