---
name: "skill-promotion-governance"
description: "Use when adding, cataloging, auditing, promoting, demoting, archiving, or rolling back skills or skill candidates based on usage evidence."
---

# skill-promotion-governance

## Purpose

Prevent "worked once" from becoming permanent agent behavior. Use this skill to decide whether a skill should remain draft, be cataloged, be kept, be promoted, be revised, be archived, or be rolled back.

## Procedure

1. Classify lifecycle state: `draft`, `cataloged`, `used`, `evidence_observed`, `effective`, `neutral`, `harmful`, `promote`, `keep`, `rollback`, or `archive`.
2. Check reproducibility evidence, adoption feedback, guard failures, overlap with existing skills, and evaluation lessons.
3. Require rollback criteria before relying on the skill for future tasks.
4. Choose the smallest action: keep as draft, revise, catalog, promote, demote, archive, or remove.
5. Run catalog, plugin, portfolio, or package checks after changing managed skill surfaces.

## Output Contract

Return:

- `skill_lifecycle_state`: current and recommended state.
- `decision`: `KEEP`, `PROMOTE`, `REVISE`, `DEMOTE`, `ARCHIVE`, `ROLLBACK`, or `BLOCKED`.
- `evidence`: files, commands, logs, user feedback, evals, or artifacts checked.
- `promotion_condition`: evidence required for stronger adoption.
- `rollback_condition`: evidence that should trigger demotion or removal.
- `open_issues`: missing checks, overlap, stale behavior, residual risks, or follow-up work.

## Evidence

- Skill package and trigger description.
- Catalog, plugin manifest, flow, marketplace, or policy surfaces.
- Actual-use outcome logs when available.
- Review, replay, evaluator, or user-feedback evidence.

For Harnes-specific surfaces, see `../../references/harnes-adapter-notes.md`.

## Verification

Before promoting or archiving:

- confirm the managed surface points at the intended skill path;
- confirm stale or archived copies are not still callable;
- confirm real evidence supports the lifecycle decision;
- confirm package checks pass or report `FAILED_VALIDATION`.

## Failure Guard

Do not promote skills that are harmful, unmeasured, stale, duplicated, or in conflict with authority/evidence contracts. Do not hide missing evidence behind a clean lifecycle label.
