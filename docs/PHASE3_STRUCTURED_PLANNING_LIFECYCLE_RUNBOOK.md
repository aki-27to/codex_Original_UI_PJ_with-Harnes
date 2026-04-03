# PHASE3_STRUCTURED_PLANNING_LIFECYCLE_RUNBOOK

Updated: 2026-03-30

## 1) Purpose

Phase 3 turns Phase 2 continuity into a task operating system with explicit planning artifacts, lifecycle state transitions, acceptance-driven closeout, archive/prune controls, and HTTP inspection.

## 2) Lifecycle States

- `initialized`
- `planned`
- `running`
- `blocked`
- `awaiting_approval`
- `verifier_failed`
- `completed`
- `abandoned`
- `archived`

`completed` requires verifier pass plus acceptance green. Executor self-claim alone is insufficient.

## 3) Planner Artifacts

- `task_spec.json`
- `plan.json`
- `acceptance_contract.json`
- `closeout_summary.json`
- `replan.json` when verifier fails or plan drift is detected

## 4) Commands

- Initialize
  - `node scripts/long_horizon_task.js initialize_task --task-id=<id> --session-id=<session> --title=<title> --objective=<objective> --family=<family> --acceptance=item1|item2`
- Resume
  - `node scripts/long_horizon_task.js resume_task --task-id=<id> --session-id=<session> --skills=handoff-artifact-generation|long-run-session-closeout`
- Update
  - `node scripts/long_horizon_task.js update_task --task-id=<id> --session-id=<session> --phase=<phase> --progress-percent=60 --progress-summary=<summary>`
- Close
  - `node scripts/long_horizon_task.js close_session --task-id=<id> --session-id=<session> --completion-claim=completed --verifier-report=<path>`
- Abandon
  - `node scripts/long_horizon_task.js abandon_task --task-id=<id> --session-id=<session> --reason=<text>`
- Archive
  - `node scripts/long_horizon_task.js archive_task --task-id=<id> --session-id=<session> --reason=<text>`
- Prune stale durable memory
  - `node scripts/long_horizon_task.js prune_durable_memory --task-id=<id> --age-days=30`
- Inspect
  - `node scripts/long_horizon_task.js show_operating_summary --task-id=<id>`
  - `node scripts/long_horizon_task.js show_task_spec --task-id=<id>`
  - `node scripts/long_horizon_task.js show_acceptance_contract --task-id=<id>`
  - `node scripts/long_horizon_task.js show_closeout_summary --task-id=<id>`
  - `node scripts/long_horizon_task.js show_replan --task-id=<id>`
  - `node scripts/long_horizon_task.js active_tasks`
  - `node scripts/long_horizon_task.js blocked_tasks`
  - `node scripts/long_horizon_task.js verifier_failed_tasks`
  - `node scripts/long_horizon_task.js archived_tasks`

## 5) HTTP Inspect API

- Single task
  - `GET /api/continuity/task?task_id=<id>&mode=operating_summary`
  - Other modes: `task_state`, `plan_state`, `task_spec`, `acceptance_contract`, `closeout_summary`, `replan`, `handoff_artifacts`, `global_memory`, `session_memory`, `verifier_unresolved`, `lifecycle_log`
- Task lists
  - `GET /api/continuity/tasks?state=active`
  - `GET /api/continuity/tasks?state=blocked`
  - `GET /api/continuity/tasks?state=verifier_failed`
  - `GET /api/continuity/tasks?state=archived`

## 6) Storage Layout

- Root
  - `logs/archive/raw/runtime_state/continuity/`
- Per-task state
  - `task_state.json`
  - `plan_state.json`
  - `task_spec.json`
  - `plan.json`
  - `acceptance_contract.json`
  - `closeout_summary.json`
  - `replan.json`
  - `global_memory.json`
  - `verifier_state.json`
  - `artifact_index.json`
  - `lifecycle_events.jsonl`
  - `archive/`
- Per-session
  - `sessions/<session_id>/session_memory.json`
  - `sessions/<session_id>/resume_context.json`
  - `sessions/<session_id>/sprint_contract.json`
  - `sessions/<session_id>/handoff/*.json`
  - `sessions/<session_id>/handoff/*.md`

## 7) Recovery Rules

- `verifier_failed`
  - inspect `replan.json`, `closeout_summary.json`, and unresolved verifier items
  - resume the task, update remaining acceptance items, then close again
- `blocked`
  - inspect blockers and current step, then resume when blockers are removed
- `archived`
  - archived tasks are excluded from normal resume
- stale durable memory
  - pruning archives stale entries into `archive/durable_memory_archive.jsonl`
  - active/resumable tasks are skipped unless pruning is forced
