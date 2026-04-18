# REVIEWER_START_HERE

Generated: 2026-04-18T06:42:29.265Z

## Read Order
- `output/governance_public/reviewer_start_here.json`
- `output/governance_public/worker_decision_surface.json`
- `output/governance_public/worker_completion_status.json`
- `output/governance_public/bundle_overview.json`
- `docs/SERVER_ARCHITECTURE_MAP.md`

## Decision Faces
- `task_verdict` / Task verdict / primary_task_verdict -> `ADOPTABLE_COMPLETE` via `output/governance_public/worker_decision_surface.json`
- `program_readiness` / Background program readiness / secondary_non_blocking_context -> `NOT_YET` via `output/agi_readiness/goal_completion_status.json`

## Route Truth
- execution: `POST /api/exec`
- evaluation: `POST /api/eval/run`
- monitoring: `GET /api/harness/overview`

## External Comparison
- matched samples: 5
- target reviewer sample count: 5
- coverage gap count: 0
- refresh command: `npm run reviewer:baseline-comparison`
- report artifact: `raw/relocated_top_level/baseline_comparison_report.json`
- harness success rate: 1
- baseline success rate: 0.2
- harness extra HITL count: 1
- baseline extra HITL count: 1
- harness repair count: 0
- baseline repair count: 0
