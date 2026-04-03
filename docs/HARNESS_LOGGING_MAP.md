# HARNESS_LOGGING_MAP

Updated: 2026-03-08

## 1) First Look Files

- `logs/current/operator_summary.json`
  - first file for: "Human-first overview. What do I need to know right now?"
  - read: `topLineDecision`, outcome, signoff status, design-conformance status, dominant bottleneck, current posture, selected flow, `whyThisIsSafe`, `whyThisMayNeedAttention`, and `openOnlyIfNeeded`
  - do not use `logs/current/index.json` as the normal human entrypoint
- `logs/current/design_conformance_summary.json`
  - second-level file for: "Is this build still wired the way the original design intended?"
  - read: each named check carries `status`, `reason`, and `evidenceRef`
- `logs/current/latest_run_summary.json`
  - second-level file for: "What happened on the latest run?"
  - read: planning/assurance depth, used agents/contracts/policies/skills, dispatch counts, outcome, changed paths, evidence refs, and the distinction between `residualRisks` vs `informationalNotes` / `assumptions` / `operatorCaveats`
  - source of truth: the latest passing signoff bundle's selected run summary, not an unrelated probe or later auxiliary turn
  - completed runs should not leave unresolved-blocker or waiting-for-user wording inside `residualRisks`
- `logs/current/review_load_breakdown.json`
  - second-level file for: "Is Step 4 too heavy?"
  - read: evidence collection, reviewer/tester/doc-sync timing, retry count, outcome-conversion time, total Step 4 duration, dominant bottleneck, plus the timing-model guide that explains overlapping estimates
- `logs/current/latest_signoff_summary.json`
  - second-level file for: "Can I trust the latest signoff bundle?"
  - appears only when a signoff bundle exists

## 2) Surface Roles

- `logs/current/`
  - operator-first summaries only
  - normal review should start at `operator_summary.json` and usually end there
- `logs/bundles/signoff/`
  - signoff-grade evidence bundles
  - top-level summaries include `conformance_report.json` and `operator_view_summary.json` so bundle-local release judgment remains inspectable without opening raw turn folders
  - deep dive only when a summary shows a failure or ambiguity
- `logs/bundles/proof/`
  - proof/runtime-validation bundles
- `logs/bundles/replay/`
  - replay-oriented bundles when present
- `logs/archive/raw/`
  - raw turn artifacts, raw operation logs, and runtime state
  - not part of the default operator surface
- `logs/archive/legacy/`
  - legacy or compatibility-only retained material
- `logs/archive/admin/`
  - migration inventories and deletion reports
  - admin-only evidence, not part of the normal operator surface

## 3) Reading Order

- Human-first question:
  - open `logs/current/operator_summary.json`
  - only follow `openOnlyIfNeeded` / `whereToLookNext` if the top-line summary is not enough
  - do not detour through `logs/current/index.json` unless a machine-oriented directory map is specifically needed
- Design conformance question:
  - open `logs/current/design_conformance_summary.json`
  - if a check fails, open the listed `evidenceRef`
- Latest task question:
  - open `logs/current/latest_run_summary.json`
  - use `evidenceRefs` and `signoffRef` only if the summary is not enough
  - expect it to stay anchored to the same passing signoff bundle named by `latest_signoff_summary.json`
- Step 4 load question:
  - open `logs/current/review_load_breakdown.json`
  - compare `dominantBottleneck` and `totalStep4DurationMs`
- Signoff question:
  - open `logs/current/latest_signoff_summary.json`
  - if it is missing or not sufficient, follow the bundle summary path under `logs/bundles/signoff/`

## 4) Design Conformance Guide

- `defaultExecAgentIsDefault`
  - confirms the canonical parent entrypoint is still `default`
- `runtimeRequestUserInputPolicyAutonomyFirst`
  - confirms the live runtime default remains autonomy-first (`auto-default` / `auto-empty`)
- `requestUserInputPolicyBlocked`
  - confirms the strict signoff/proof lane still pins non-interactive request-user-input posture to `blocked`
- `parentDispatchGuardEnforced`
  - confirms parent completion still requires expected specialist dispatch
- `retiredWorkerNotRoutable`
  - confirms legacy `worker` targets remain rejected
- `planningDepthSelectorWorking`
  - confirms FAST and DISCOVERY planning probes still pass
- `assuranceDepthSelectorWorking`
  - confirms SIGNOFF escalation still occurs when reviewer/tester/dedicated tests are required
- `specialistDispatchObservedWhenImplementationOccurred`
  - confirms implementation-bearing work still shows delegated specialist execution
- `reviewerObservedWhenRequired`
  - confirms reviewer evidence appears on runs that require it
- `testerObservedWhenRequired`
  - confirms tester evidence appears on runs that require it
- `taskOutcomeSemanticsValid`
  - confirms task outcome bridge semantics still match the runtime contract
- `docSyncEvidencePresentWhenRequired`
  - confirms doc-sync evidence is present when the workflow requires it
- `signoffCriteriaSatisfied`
  - confirms the latest signoff bundle passed its own assertions

## 5) When Raw Logs Matter

- Use `logs/bundles/**` when a summary points at a specific failed bundle.
- Use `logs/archive/raw/turns/**` when replay or exact artifact reconstruction is required.
- Use `logs/archive/raw/operation_logs/**` only for protocol/debug/forensic traces that the summaries cannot explain.
- Use `logs/archive/raw/harness_execution_memory.json` and `logs/archive/raw/eval_runs.jsonl` when execution memory or eval history needs direct inspection.
- Use `logs/archive/raw/runtime_state/**` for persona-memory-only runtime state.
- Use `logs/archive/admin/**` when you need proof of what was moved, deleted, or retained during the log-surface migration.

## 6) Submission Export

- Default submission export is generated by `node scripts/export_submission_artifacts.js`.
- Default mode exports only:
  - `logs/current` operator summaries
  - latest signoff bundle top-level summaries, including bundle `conformance_report.json` and `operator_view_summary.json`
  - required repo source and docs
- `runtime_snapshot.json` is bundle-only and should be opened only when deeper posture detail is needed.
- Optional bundle-detail/raw/admin add-ons use `node scripts/export_submission_artifacts.js --with-raw`.
- `submission_manifest.json` must describe the chosen export mode accurately, including a `fileCount` and `notes` that match the actual exported file set.
