# PHASE2_LONG_HORIZON_RUNBOOK

Updated: 2026-03-30

## 1) Purpose

Phase 2 adds single-agent continuity for long-running tasks without relying on the full transcript or introducing multi-agent orchestration.

## 2) Commands

- Initialize a task
  - `node scripts/long_horizon_task.js initialize_task --task-id=<id> --session-id=<session> --title=<title> --objective=<objective> --family=<family> --acceptance=item1|item2`
- Resume a task
  - `node scripts/long_horizon_task.js resume_task --task-id=<id> --session-id=<session> --skills=handoff-artifact-generation|long-run-session-closeout`
- Update task/session state
  - `node scripts/long_horizon_task.js update_task --task-id=<id> --session-id=<session> --phase=<phase> --progress-percent=60 --progress-summary=<summary> --note=<text> --note-kind=session_note`
- Close a session
  - `node scripts/long_horizon_task.js close_session --task-id=<id> --session-id=<session> --completion-claim=completed --verifier-report=output/public_regression_latest.json`
- Inspect task state
  - `node scripts/long_horizon_task.js task_state --task-id=<id>`
  - `node scripts/long_horizon_task.js show_plan --task-id=<id>`
  - `node scripts/long_horizon_task.js list_handoff --task-id=<id>`
  - `node scripts/long_horizon_task.js list_durable_memory --task-id=<id>`
  - `node scripts/long_horizon_task.js list_session_memory --task-id=<id> --session-id=<session>`
  - `node scripts/long_horizon_task.js list_unresolved_verifier --task-id=<id>`
- Phase 2 E2E
  - `node scripts/long_horizon_continuity_e2e_test.js`

## 3) Storage Layout

- Continuity root
  - `logs/archive/raw/runtime_state/continuity/`
- Per-task files
  - `task_state.json`
  - `plan_state.json`
  - `global_memory.json`
  - `verifier_state.json`
  - `artifact_index.json`
- Per-session files
  - `sessions/<session_id>/session_memory.json`
  - `sessions/<session_id>/resume_context.json`
  - `sessions/<session_id>/sprint_contract.json`
  - `sessions/<session_id>/handoff/*.json`
  - `sessions/<session_id>/handoff/*.md`

## 4) Durable vs Ephemeral

- `session_memory`
  - ephemeral
  - session-local notes, temporary hypotheses, recent changes
- `global_memory`
  - durable
  - only source-backed reusable learnings and operator cautions
- Do not promote `session_note`, `temporary_hypothesis`, `unverified_claim`, or `transient_failure` into durable memory.

## 5) Planner / Executor / Verifier Boundaries

- Planner responsibilities
  - initialize `plan_state`
  - maintain milestones, steps, sprint contract, acceptance criteria
- Executor responsibilities
  - update progress, changed surface, and session-local notes
- Verifier responsibilities
  - produce independent pass/fail findings
  - block false completion when acceptance or verifier findings remain unresolved

## 6) Context Injection Order

Resume uses this priority order:
1. task contract and stop conditions
2. latest verified plan state
3. `next_session_brief`
4. unresolved verifier findings
5. relevant slice of `global_memory`
6. repo-local skills metadata

The carry-forward bundle is intentionally smaller than a full transcript.

## 7) Repo-local Skills

- Skill catalog
  - `scripts/config/repo_local_skill_catalog.json`
- Skill bodies
  - `.agents/skills/code-change-verification/SKILL.md`
  - `.agents/skills/handoff-artifact-generation/SKILL.md`
  - `.agents/skills/long-run-session-closeout/SKILL.md`

## 8) Recovery Notes

- If a session ends before verification, close it as partial and rely on `next_session_brief` + `open_issues` for resume.
- If completion is claimed while verifier findings remain, the task status becomes `FAILED_VALIDATION`.
- Keep Phase 1 public regression green before closing a task as completed.
