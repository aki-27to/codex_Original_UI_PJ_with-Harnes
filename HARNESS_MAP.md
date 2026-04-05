# HARNESS_MAP

Updated: 2026-04-05

## 1) Purpose And Reading Order

This file is the operator map for the harness after the front-door README.
- Front-door identity and quick posture live in `README.md`.
- Policy is human-facing.
- Contracts are machine-readable.
- Proof/signoff artifacts are execution evidence.

Recommended read order:
1. `README.md`
2. `AGENTS.md`
3. `docs/AGENT_OPERATING_RULES.md`
4. `docs/CURRENT_ARCHITECTURE.md`
5. `docs/HARNESS_APP_PLATFORM.md`
6. `docs/EVIDENCE_CONTRACT.md`
7. `scripts/config/harness_contract_spec.json`
8. `scripts/config/task_outcome_contract.json`
9. `scripts/config/planning_mode_contract.json`
10. `scripts/config/assurance_depth_contract.json`
11. `scripts/config/planning_decision_contract.schema.json`
12. `scripts/config/eval_suite_default.json`

## 2) Layer Map

- Tier-0 / constitutional:
  - `AGENTS.md`
- Tier-1 / operating policy:
  - `docs/AGENT_OPERATING_RULES.md`
  - `docs/HARNESS_APP_PLATFORM.md`
  - `docs/APP_SERVER_PROTOCOL_RUNBOOK.md`
  - `docs/CONTEXT_MEMORY_POLICY.md`
  - `docs/EVIDENCE_CONTRACT.md`
  - `docs/SKILL_PORTFOLIO_GOVERNANCE.md`
- Current architecture / change history:
  - `docs/CURRENT_ARCHITECTURE.md`
  - `docs/ARCHITECTURE_CHANGELOG.md`
- Machine-readable contracts:
  - `scripts/config/harness_contract_spec.json`
  - `scripts/config/task_outcome_contract.json`
  - `scripts/config/planning_mode_contract.json`
  - `scripts/config/assurance_depth_contract.json`
  - `scripts/config/planning_decision_contract.schema.json`
  - `scripts/config/requirement_contract.schema.json`
  - `scripts/config/dispatch_plan.schema.json`
  - `scripts/config/agent_governance_contracts.json`
  - `scripts/config/skill_portfolio_policy.json`
  - `scripts/config/skill_catalog.json`
  - `scripts/config/eval_suite_default.json`
- Runtime evidence / proof / signoff:
  - `logs/current/`
  - `logs/bundles/`
  - `logs/archive/`
  - `docs/HARNESS_LOGGING_MAP.md`

## 3) Parent And Child Responsibilities

- Parent-Orchestrator:
  - lock requirements
  - select planning mode
  - fix the dispatch contract
  - review child evidence
  - decide final outcome and report residual risk
- Child specialists:
  - execute on owned paths only
  - produce reproducible evidence
  - keep review/test work separate when assigned
- Boundary rule:
  - Parent does not claim specialist-only work as complete without delegated evidence.
  - See `AGENTS.md` and `docs/AGENT_OPERATING_RULES.md`.

## 4) Flow Modes

- Planning `FAST_PLANNING`
  - small existing-scope change
  - clear owner boundary
  - acceptance checks are already concrete
  - no approval-boundary contact
  - almost no open questions
- Planning `STANDARD_PLANNING`
  - bounded but multi-specialist work
  - reviewer/tester evidence matters
  - assumptions exist, but execution is still safe
- Planning `DISCOVERY_PLANNING`
  - requirements or non-goals are still ambiguous
  - open questions remain
  - approval-boundary contact or explicit user decision exists
  - implementation should stop with `NEEDS_INPUT` instead of guessing

- Assurance `LIGHT_ASSURANCE`
  - docs-only or very small bounded edits
  - no unnecessary reviewer/tester/signoff overhead
- Assurance `STANDARD_ASSURANCE`
  - normal implementation work
  - bounded review/test evidence when risk or workflow requires it
- Assurance `SIGNOFF_ASSURANCE`
  - runtime / protocol / infra / governance sensitive work
  - reviewer/tester/doc-sync/signoff evidence must be ready

Selector inputs are explicit:
- open question count
- acceptance-check clarity
- specialist-boundary count
- approval-boundary contact
- over-delivery risk
- user-decision requirement
- assumption dependence
- existing-spec clarity
- change-scope clarity

Assurance selector inputs are explicit:
- touched change kinds (`docs`, `web`, `server.js`, `scripts`, governance)
- runtime / protocol / infra contact
- reviewer/tester need
- user-facing impact
- irreversible risk
- new-logic / over-delivery risk
- signoff importance

Contract files:
- `scripts/config/planning_mode_contract.json`
- `scripts/config/assurance_depth_contract.json`
- `scripts/config/planning_decision_contract.schema.json`
- `scripts/config/requirement_contract.schema.json`
- `scripts/config/dispatch_plan.schema.json`

## 5) How A Normal Run Moves

- Step 1 `Requirement Structuring`
  - Look at `planning_decision_contract.json`, `requirement_contract.json`, and `scripts/config/requirement_contract.schema.json`.
- Step 2 `Dispatch Planning`
  - Look at `dispatch_plan.json` and `scripts/config/dispatch_plan.schema.json`.
- Step 3 `Specialist Execution`
  - Start with `logs/current/operator_summary.json`, then move to `logs/current/latest_run_summary.json` only when the top-line summary is insufficient.
- Step 4 `Quality Gate`
  - Look at `evidence_manifest.json`, `review_load_breakdown.json`, reviewer/tester evidence, and `docs/EVIDENCE_CONTRACT.md`.
- Step 5 `Final Outcome`
  - Look at `flow_trace_summary.json`, `stage_timeline.json`, `scripts/config/task_outcome_contract.json`, and signoff/proof bundles.

Runtime invariants to keep in mind:
- live runtime `requestUserInputPolicy=auto-default`
- strict `proof` / `repro` / `conversation-app-server` lanes pin `requestUserInputPolicy=blocked`
- `parentDispatchGuard=enforce`
- retired `worker` is not a normal fallback
- turn contract and task outcome contract stay separate

## 6) Where To Inspect Current State

- Current architecture / policy:
  - `docs/CURRENT_ARCHITECTURE.md`
  - `docs/ARCHITECTURE_CHANGELOG.md`
- Per-run execution trace:
  - `logs/current/operator_summary.json`
  - `logs/current/latest_run_summary.json`
- Aggregated execution memory:
  - `logs/archive/raw/runtime_state/harness_execution_memory.json`
- Eval history:
  - `logs/archive/raw/runtime_state/eval_runs.jsonl`
- Proof artifacts:
  - `logs/bundles/proof/`
- Signoff bundles:
  - `logs/bundles/signoff/`

Most useful per-run files after the planning-mode upgrade:
- `planning_decision_contract.json`
- `requirement_contract.json`
- `dispatch_plan.json`
- `evidence_manifest.json`
- `stage_timeline.json`
- `flow_trace_summary.json`
- `review_load_breakdown.json`
- `signoff_summary.json`

Comparison artifacts:
- `logs/archive/legacy/baseline_comparison/`
- `baseline_comparison_report.json`
- `speed_vs_assurance_report.md`
- New bundles also include `measured_baseline_summary.json` plus `baseline_*_task_trace_summary.json` so speed/dispatch/review/evidence comparisons are based on measured runs instead of a prose-only approximation.

## 2026-04-05 Operational Goal Map

- Live truth:
  - `logs/archive/raw/runtime_state/memory/`
- Public readiness:
  - `output/agi_readiness/latest_readiness.json`
  - `output/agi_readiness/goal_completion_status.json`
  - `output/agi_readiness/stable_coverage_matrix.json`
  - `output/agi_readiness/robustness_breakdown.json`
  - `output/agi_readiness/distinct_improvement_lineage.json`
- Public continuity:
  - `output/continuity_public/latest_continuity.json`
  - `output/continuity_public/continuity_debt.json`
  - `output/continuity_public/continuity_debt_trend.json`
- Public memory:
  - `output/memory_public/latest_overview.json`
  - `output/memory_public/latest_pack_public.json`
  - `output/memory_public/causal_effectiveness_summary.json`

Use `goal_completion_status.json` as the top-level operational status file. It remains `NOT_YET` unless all strict live criteria are met.
