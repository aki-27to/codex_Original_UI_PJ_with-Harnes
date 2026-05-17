---
name: "handoff-artifact-generation"
description: "Use when a task must produce a durable continuation bundle with summary, next action, verification state, changed surface, and open issues."
---

# handoff-artifact-generation

## Purpose

Produce a durable handoff that lets a future Codex session resume without relying on the full transcript. The handoff must separate completed work, verification state, changed surface, open issues, next action, and durable learnings.

## Procedure

1. Lock the task contract: user goal, scope, constraints, non-goals, acceptance criteria, confirmed requirements, and assumptions.
2. Summarize completed work with concrete file paths, artifact paths, decisions, and evidence.
3. Capture `verification_status`: checks run, outputs or artifacts inspected, results, skipped checks, and blockers.
4. Capture `changed_surface`: files, modules, APIs, UI flows, configs, docs, output artifacts, or generated artifacts touched.
5. Write `next_session_brief`: exact next action, blockers, prerequisites, user-owned decisions, and verification path.
6. Capture durable learnings only when they are reusable and evidence-backed.
7. Treat narrative-only summaries as insufficient unless they are mapped to files, artifacts, command output, or reviewer evidence.

## Output Contract

Return:

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

## Failure Guard

Do not use handoff generation to make a task look finished. Do not hide missing verification, unresolved risks, unrelated user changes, or the next required user-owned decision.
