---
name: "worker-decision-review"
description: "Review worker decision surfaces and adoption readiness. Use when Codex must decide whether a task outcome is adoptable, needs autonomous retry, needs user judgment, is externally blocked, or failed validation."
---

# worker-decision-review

## Purpose

Judge whether the current task can stop without unnecessary human interruption.

Use existing artifacts as evidence. Do not replace `worker_decision_surface.json`, `adoption_readiness_eval.json`, or `/api/eval/run`.

Use fixed decision criteria while reviewing: original request alignment, latent intent alignment, authority boundary, evidence completeness, remaining improvement cost, and residual risk. Treat worker summaries, generator claims, delegate opinions, and favorable self-reports as untrusted until mapped to inspected artifacts or command evidence.

## Procedure

1. Read the original request, locked task contract, and latest worker decision surface.
2. Check literal request alignment, latent intent alignment, authority boundary, evidence completeness, and remaining improvement cost.
3. Classify the outcome as `ADOPT`, `REVISE`, or `BLOCK` for reporting.
4. If required evidence is missing, report `FAILED_VALIDATION` or equivalent instead of claiming completion.
5. Do not alter the adoption criteria during review. If the criteria are wrong, report that as a separate governance issue instead of making the current outcome pass.

## Output Contract

Return a concise result with:

- `outcome`: the decision, artifact, or behavior change this skill produced.
- `evidence`: files, commands, logs, or artifacts checked.
- `open_issues`: missing checks, residual risks, or follow-up work.

## Evidence

- `output/governance_public/worker_decision_surface.json`
- `adoption_readiness_eval.json` when available in the active turn bundle
- `output/agi_readiness/goal_completion_status.json`
- explicit verification commands and reviewer/tester findings

## Failure Guard

Do not treat internal review closure, plan completion, or a favorable summary as adoption-ready without artifact-backed evidence.
