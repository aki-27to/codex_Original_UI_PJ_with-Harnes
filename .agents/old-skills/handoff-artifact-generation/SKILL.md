---
name: "handoff-artifact-generation"
description: "Use when a session needs to produce a durable handoff artifact with task summary, next-session brief, verification status, changed surface, and open issues."
---

# handoff-artifact-generation

## Purpose

Produce a durable handoff artifact that lets a future Codex session resume without relying on the full transcript. The handoff must separate completed work, verification state, changed surface, open issues, next action, and durable learnings.

## Procedure

1. Lock the task contract: user goal, scope, constraints, non-goals, acceptance criteria, confirmed requirements, and assumptions.
2. Summarize completed work with concrete file paths, artifact paths, decisions, and evidence. Do not require the next session to infer from the transcript.
3. Capture `verification_status`: checks run, command output or artifact inspected, results, skipped checks, and blockers.
4. Capture `changed_surface`: files, modules, APIs, UI flows, configs, docs, output artifacts, or generated artifacts touched.
5. Write the `next_session_brief`: exact next action, blockers, prerequisites, user-owned decisions, and verification path.
6. Capture durable learnings only when they are reusable and evidence-backed. One-off debug notes stay out of durable guidance.
7. Treat generator summaries and self-reported completion as untrusted until mapped to files, artifacts, command output, or reviewer evidence.

## Output Contract

Return a handoff bundle with:

- `task_summary`: goal, scope, status, important decisions, and non-goals.
- `next_session_brief`: resume instructions, exact next action, blockers, and verification path.
- `open_issues`: blockers, missing evidence, adoption risk, or follow-up work.
- `verification_status`: checks, results, skipped checks, blockers, and residual risk.
- `changed_surface`: files, modules, APIs, UI flows, configs, docs, or artifacts.
- `durable_learnings`: reusable guidance with evidence and rollback boundary.

## Evidence

- accepted scope or task contract
- changed files and artifact paths
- verification command output or explicit skipped-check reason
- current task status and unresolved issues
- relevant logs, screenshots, reports, or config contracts

## Verification

Before treating a handoff artifact as ready:

- confirm the handoff is evidence-backed and not a narrative-only summary;
- confirm failed, blocked, missing, or skipped verification is visible;
- confirm completion rules and required evidence are not blurred into `COMPLETED`;
- confirm paused work is labeled `PARTIAL`, `FAILED_VALIDATION`, `BLOCKED`, or `NEEDS_INPUT` when appropriate.

## Failure Guard

Do not use handoff generation to make a task look finished. Do not hide missing verification, unresolved risks, unrelated user changes, or the next required user-owned decision.
