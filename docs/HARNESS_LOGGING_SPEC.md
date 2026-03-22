# HARNESS_LOGGING_SPEC

## Goal
This logging design exists to answer three operator questions without reading raw logs:

1. Is the harness aligned with the intended design?
2. What happened in the latest run?
3. Is it safe to sign off?

## Fixed Principles

- One question, one file.
- Human-first summary, machine-first detail.
- No duplicate operator-facing surface.
- Three layers only: `current`, `bundles`, `archive`.
- Operator-first daily review uses at most five files.
- Delete, merge, or relocate before adding new surfaces.

## Required Directory Layout

The root `logs/` directory may contain only:

- `logs/current/`
- `logs/bundles/`
- `logs/archive/`

The following are not allowed at `logs/` root:

- `logs/*.json`
- `logs/*.jsonl`
- `logs/*.ndjson`
- root-exposed inventory or deletion reports
- root-exposed raw or admin artifacts

## Current Surface

`logs/current/` is the operator-facing surface. It may contain only:

1. `operator_summary.json`
2. `design_conformance_summary.json`
3. `latest_run_summary.json`
4. `review_load_breakdown.json`
5. `latest_signoff_summary.json`

The following are explicitly forbidden in `logs/current/`:

- `index.json`
- `runtime_snapshot.json`
- raw logs
- `jsonl` or `ndjson`
- per-turn artifacts
- inventory or deletion reports

`runtime_snapshot.json` detail belongs in the signoff bundle. Its operator-facing posture summary must be embedded into `operator_summary.json`.

## Bundle Surface

`logs/bundles/` is for signoff, proof, and replay evidence. Operators open it only when summaries are insufficient.

Allowed signoff bundle top-level files:

- `signoff_summary.json`
- `runtime_snapshot.json`
- `core_harness_workflow_run.json`
- `natural_task_trace_summary.json`
- `latest_run_summary.json`
- `review_load_breakdown.json`
- `conformance_report.json`
- `operator_view_summary.json`
- `bundle_surface_map.json`

Raw material must live below deeper paths such as:

- `raw/events.ndjson`
- `raw/items.ndjson`
- `raw/turns/**`
- `raw/codex_ops_*.jsonl`
- `raw/eval_runs.jsonl`
- `raw/harness_execution_memory.json`

The following are not allowed at signoff bundle top level:

- `dispatch_plan.json`
- `requirement_contract.json`
- `requirement_validation.json`
- `manifest.json`
- `stage_timeline.json`
- `flow_trace_summary.json`
- duplicate `review_load_breakdown` variants
- raw `ndjson` or `jsonl`
- per-turn artifacts

`bundle_surface_map.json` contracts:

- `topLevelSummaries` must list only the fixed signoff bundle top-level summaries.
- `openFirst` may extend `topLevelSummaries` with relocated operator-facing aids such as:
  - `raw/relocated_top_level/lane_latency_summary.json`
  - `raw/relocated_top_level/signoff_resume_state.json`
  - relocated comparison summaries

## Archive Surface

`logs/archive/` is reserved for raw, legacy, and admin material.

Required subdirectories:

- `logs/archive/admin/`
- `logs/archive/raw/`
- `logs/archive/legacy/`

`logs/archive/admin/` contains:

- `log_inventory_before.json`
- `log_inventory_after.json`
- `log_deletion_report.json`

`logs/archive/raw/` contains:

- `codex_ops_*.jsonl`
- `turns/**`
- `harness_execution_memory.json`
- `eval_runs.jsonl`
- other forensic or replay-only raw artifacts

## Current File Contracts

### `operator_summary.json`

This is the only first-look entrypoint.

Required fields:

- `topLineDecision`
- `designConformanceStatus`
- `latestRunStatus`
- `signoffStatus`
- `reviewLoadStatus`
- `whyThisIsSafe`
- `whyThisMayNeedAttention`
- `openOnlyIfNeeded`
- `postureSummary`
- `refs`

`refs` must contain:

- `designConformanceSummary`
- `latestRunSummary`
- `reviewLoadBreakdown`
- `latestSignoffSummary`
- `bundlePath` when bundle follow-up is needed

### `design_conformance_summary.json`

This file answers whether the harness matches the intended design.

Required checks:

- `defaultExecAgentIsDefault`
- `requestUserInputPolicyBlocked`
- `parentDispatchGuardEnforced`
- `retiredWorkerNotRoutable`
- `planningDepthSelectorWorking`
- `assuranceDepthSelectorWorking`
- `specialistDispatchObservedWhenImplementationOccurred`
- `reviewerObservedWhenRequired`
- `testerObservedWhenRequired`
- `taskOutcomeSemanticsValid`
- `docSyncEvidencePresentWhenRequired`
- `signoffCriteriaSatisfied`
- `overallDesignConformance`

Each check must contain:

- `status` with `pass` or `fail`
- `reason`
- `evidenceRef`

### `latest_run_summary.json`

This file answers what happened in the latest run.

It must be derived from the latest passing signoff bundle truth rather than from an unrelated probe, replay, or later auxiliary turn.

Required fields:

- run id, thread id, turn id
- selected planning depth
- selected assurance depth
- final outcome
- used agents
- used policies
- used contracts
- used skills
- `dispatchCount`
- `dispatchSuccessCount`
- `implementationObserved`
- `reviewerObserved`
- `testerObserved`
- changed paths
- doc sync summary
- evidence refs
- residual risks
- signoff ref

`COMPLETED` may not coexist with unresolved blockers. Use `residualRisks`, `informationalNotes`, and `operatorCaveats` to keep semantics clear.

### `review_load_breakdown.json`

This file answers how heavy Step 4 was.

Required fields:

- `totalStep4DurationMs`
- `evidenceCollectionTimeMs`
- `reviewerTimeMs`
- `testerTimeMs`
- `docSyncVerificationTimeMs`
- `retryLoopCount`
- `dominantBottleneck`
- `timingModel`
- `componentTimesMayOverlap`
- `interpretationGuide`

If component times overlap, that fact must be explicit in the file.

### `latest_signoff_summary.json`

This file answers whether signoff is safe.

Required fields:

- `allPassed`
- `runtimePostureSafe`
- `coreHarnessWorkflowPassed`
- `naturalTaskTracePassed`
- `signoffReady`
- `bundleRef`
- `finalDecision`

## Deletion And Relocation Rules

These may not remain at `logs/` root:

- `log_inventory_before.json`
- `log_inventory_after.json`
- `log_deletion_report.json`
- `codex_ops_*.jsonl`
- `eval_runs.jsonl`
- `harness_execution_memory.json`
- `turns/`
- other raw or admin artifacts

Cleanup order is fixed:

1. Remove raw artifacts from `current`.
2. Move admin artifacts off `logs/` root.
3. Move per-turn artifacts off signoff bundle top level.
4. Merge duplicate summaries.
5. Delete or archive legacy leftovers.

## Default Submission Export

Default export is a flat operator-first review bundle.

It includes only:

- current operator summaries
- signoff bundle top-level summaries
- required repo source files
- required repo docs

Raw and admin artifacts are included only when `--with-raw` is requested.

## Acceptance Criteria

The implementation is complete only when:

- `logs/` root contains only `current`, `bundles`, and `archive`
- daily human review requires only five current files
- `operator_summary.json` is the only first-look entrypoint
- raw, admin, and forensic artifacts are hidden from `current`
- signoff bundle top level stays summary-first
- `design_conformance_summary.json` answers design alignment alone
- `latest_run_summary.json` answers what happened alone
- `review_load_breakdown.json` answers Step 4 load alone
