# EVIDENCE_CONTRACT

Updated: 2026-04-07

## 1) Purpose

Define the minimum verification and reporting artifacts required before a task can move to a releasable decision state.
- Machine-readable evidence source of truth: `scripts/config/evidence_contract.json`.
- Machine-readable outcome taxonomy source: `scripts/config/task_outcome_contract.json`.
- Machine-readable business decision source: `scripts/config/release_decision_contract.json`.

## 2) Evidence Classes

- Implementation evidence:
  - changed file references
  - created artifacts or generated outputs
- Verification evidence:
  - test commands
  - lint/check commands
  - manual review steps when automated checks do not apply
- Runtime evidence:
  - API responses
  - protocol lifecycle results
  - terminal status or log summaries
  - stage timeline and flow trace for the executed run
- Documentation evidence:
  - updated `docs/CURRENT_ARCHITECTURE.md`
  - matching entry in `docs/ARCHITECTURE_CHANGELOG.md`
  - traceable sync note for baseline and over-delivery behavior
- Risk evidence:
  - skipped checks
  - failed checks
  - residual risk statements and reasons

## 3) Minimum Evidence by Change Type

- Docs-only policy changes:
  - manual consistency review
  - file references to the updated policy documents
  - architecture/spec sync when the repo completion gate requires it
- `server.js` or `scripts/` changes:
  - `node scripts/app_server_smoke_test.js`
- Eval harness / replay / workflow policy changes:
  - `node scripts/eval_replay_api_smoke_test.js`
- Core system changes that can affect whole-harness consistency:
  - `node scripts/system_coherence_review_test.js`
- `web/` changes:
  - launch the UI
  - verify `GET /api/runtime` returns HTTP 200
  - include browser/manual evidence when UI behavior changed materially
  - for design-sensitive work, also include:
    - benchmark or reference comparison note
    - desktop screenshot review
    - mobile screenshot review
    - independent reviewer/tester verdict
- Skill assignment or skill package changes:
  - `node scripts/skill_portfolio_audit.js`
- Over-delivery that adds new logic:
  - dedicated automated tests for the added logic
  - PASS output must be included in review evidence

## 3.1) Structured Evidence Manifests

- Each governed run must make the constitution artifacts inspectable as machine-readable files:
  - `request_frame.json`
  - `routing_decision.json`
  - `task_outcomes.json`
  - `review_bundle.json`
  - `release_decision.json`
- Each turn artifact bundle should also aggregate execution evidence into companion files:
  - `requirement_contract.json`
  - `requirement_validation.json`
  - `dispatch_plan.json`
  - `evidence_manifest.json`
  - `stage_timeline.json`
  - `flow_trace_summary.json`
  - `review_load_breakdown.json`
  - `conformance_report.json`
  - `operator_view_summary.json`
- Each signoff bundle should also preserve bundle-level orchestration evidence:
  - `signoff_resume_state.json`
  - `lane_latency_summary.json`
- When live baseline comparison is requested, signoff bundles should preserve direct baseline evidence separately from governed harness traces:
  - `raw_direct_baseline_summary.json`
  - `raw_direct_fast_task_trace_summary.json`
  - `raw_direct_discovery_task_trace_summary.json`
  - `raw_direct_signoff_task_trace_summary.json`
  - `raw_direct_natural_task_trace_summary.json`
- `evidence_manifest.json` should summarize:
  - requirement validator verdict and key blocking/warning checks
  - acceptance check pass/fail status
  - doc sync evidence
  - child evidence ledger
  - residual risks
- `review_load_breakdown.json` should summarize:
  - reviewer finding summary
  - tester result summary
  - doc sync status
  - quality-gate duration hotspots
  - evidence-collection time
  - reviewer/tester/doc-sync timing estimates
  - retry-loop count
  - outcome-conversion time
  - total Step 4 duration
  - dominant bottleneck
  - explicit timing-model note that component estimates may overlap and `dominantBottleneck` is the largest estimated bucket rather than an additive share of `totalStep4DurationMs`
- `stage_timeline.json` should make Step 1/2/3/4/5 timing legible enough for operator review.
- `flow_trace_summary.json` should show which planning depth, assurance depth, agents, contracts, skills, and evidence sources were actually involved in the run.
- `conformance_report.json` should evaluate the frozen invariants and expose any violated invariants explicitly.
- `operator_view_summary.json` should provide the operator one-screen state:
  - `current_phase`
  - `current_lane`
  - `planning_depth`
  - `assurance_depth`
  - `dispatch_graph`
  - `current_blockers`
  - `evidence_completeness`
  - `residual_risk`
  - `release_state`
  - `violated_invariants`
  - `remaining_conditions_to_release`
- `lane_latency_summary.json` should identify:
  - per-stage wall-clock duration
  - dominant stage bottlenecks
  - measured baseline sample breakdown
  - raw direct baseline sample breakdown when direct comparison is available

## 4) Reporting Contract

Every release/signoff report should make the evidence legible by including:

- the command or manual check performed
- the result summary
- status as `PASS`, `FAIL`, or `SKIPPED`
- the affected scope or file references
- residual risk when evidence is missing or incomplete
- the selected planning depth, assurance depth, and flow path when execution is task-dependent

## 5) Failure Semantics

- Missing required evidence means the task is not releasable.
- Failing required verification means the task should be reported as `FAILED_VALIDATION` unless the user explicitly accepts the risk.
- If a check cannot run because of environment limits or missing dependencies, report `BLOCKED` or `PARTIAL` instead of claiming completion.
- Runtime-facing task outcome IDs should use the machine-readable taxonomy from `scripts/config/task_outcome_contract.json`, not ad hoc labels.
- Turn terminal status and task outcome status should remain compatible with the bridge rules in `scripts/config/harness_contract_spec.json`.
- Top-level release decisions must use the business decision states from `scripts/config/release_decision_contract.json`; docs or summaries alone do not satisfy this gate.

## 6) Evidence Quality Rule

- Prefer deterministic command output over narrative claims.
- Prefer direct file references over vague descriptions.
- If a check is skipped, say exactly why it was skipped and what risk remains.
- Evidence aggregation should reduce reviewer load, not hide missing checks. A neat manifest without the underlying proof is still a failure.
- `SIGNOFF_ASSURANCE` runs should surface reviewer/tester/doc-sync status in `review_load_breakdown.json` for operator signoff.
- If a core system change skips the whole-system coherence review, the result is `FAILED_VALIDATION`, not `COMPLETED`.
- If a task is design-sensitive and visual evidence is missing, the correct outcome is `FAILED_VALIDATION`, not `COMPLETED`.

## 6.1) Subjective Quality Rule

- For subjective quality work, "it looks better" is not evidence by itself.
- Screenshot comparison, reviewer verdict, and benchmark reasoning are the minimum acceptable proof.
