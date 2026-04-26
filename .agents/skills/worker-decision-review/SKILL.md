---
name: "worker-decision-review"
description: "Review worker decision surfaces and adoption readiness. Use when Codex must decide whether a task outcome is adoptable, needs autonomous retry, needs user judgment, is externally blocked, or failed validation."
---

# worker-decision-review

## Purpose

Judge whether the current task can stop without unnecessary human interruption.

Use existing artifacts as evidence. Do not replace `worker_decision_surface.json`, `adoption_readiness_eval.json`, or `/api/eval/run`.

## Procedure

1. Read the original request, locked task contract, and latest worker decision surface.
2. Check literal request alignment, latent intent alignment, authority boundary, evidence completeness, and remaining improvement cost.
3. Classify the outcome as `ADOPT`, `REVISE`, or `BLOCK` for reporting.
4. If required evidence is missing, report `FAILED_VALIDATION` or equivalent instead of claiming completion.

## Evidence

- `output/governance_public/worker_decision_surface.json`
- `adoption_readiness_eval.json` when available in the active turn bundle
- `output/agi_readiness/goal_completion_status.json`
- explicit verification commands and reviewer/tester findings

## Failure Guard

Do not treat internal review closure, plan completion, or a favorable summary as adoption-ready without artifact-backed evidence.
