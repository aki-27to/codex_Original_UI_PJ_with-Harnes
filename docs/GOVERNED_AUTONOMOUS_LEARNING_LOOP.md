# GOVERNED_AUTONOMOUS_LEARNING_LOOP

Updated: 2026-04-12

## Current Window Rule

`output/agi_readiness/autonomous_learning_status.json` is a supporting learning surface for the current export session.

- `currentQueuedCount`
- `currentRunningCount`
- `currentBlockedCount`
- `currentInsufficientEvidenceCount`
- `currentVerifiedPositiveCount`

These current counts are the only learning-agenda counts allowed to block or clear fail-closed completion decisions.

- `currentVerifiedPositiveCount` counts `verified_positive` entries inside the current `exportSessionId` window.
- Current verified-positive counts include same-window `passed` terminal entries.
- `summary.verifiedPositive` must equal `currentVerifiedPositiveCount`.
- The JSON artifact exposes this as a machine-readable `countSemantics` contract, and strict public eval must reject ambiguity.

## Gate-consumed subset

`autonomous_learning_status.json` now distinguishes the broader supporting surface from the completion-gate subset.

- `currentRunningCount` is the broader supporting count for all current-session non-`memory_eval` learning agenda entries.
- `gateDecisionCounts.running` is the fail-closed running count consumed by `goal_completion_status.json` and `subjective_goal_completion_status.json`.
- `gateDecisionCounts` uses `isMetaCompletionAgendaEntry` exclusion semantics and exposes the excluded delta through `excludedMetaCompletionCounts`.
- `goal_completion_status.json` and `subjective_goal_completion_status.json` expose the same interpretation through `runningAgendaDecisionBasis`.

## Threshold basis closure

The supporting threshold artifacts must also expose the exact values consumed by the gate.

- `self_directed_probe_status.json` distinguishes `currentSnapshot` from `effectiveHistoryAware`.
- `self_directed_probe_status.json.thresholdDecisionBasis.mode = "history_aware_effective_counts"` means the subjective / compatibility consumer reads the effective counts, not the raw snapshot.
- `novel_task_acquisition.json` exposes the same threshold-basis fields, but `thresholdDecisionBasis.mode = "current_snapshot_no_history_uplift"` means there is no hidden historical carry.
- Docs-only explanation is not sufficient; the current-truth JSON artifacts themselves must expose these fields in a machine-readable way.

## Historical Trend Rule

The same artifact also preserves trend-only history.

- `historicalQueuedCount`
- `historicalRunningCount`
- `historicalBlockedCount`
- `historicalInsufficientEvidenceCount`
- `historicalVerifiedPositiveCount`

Historical counts are for learning trend review, not for silently changing the current completion gate.

- `historicalVerifiedPositiveCount` is the cumulative carry from prior `exportSessionId` windows only.
- When a new export session starts, the previous session's `currentVerifiedPositiveCount` rolls into `historicalVerifiedPositiveCount`.
- Same-session rerenders must not move current verified-positive counts into history.

## Same Semantic Window

The following supporting artifacts must share the same `exportSessionId`:

- `output/governance_public/worker_decision_surface.json`
- `output/governance_public/worker_completion_status.json`
- `output/governance_public/adoption_readiness_eval.json`
- `output/governance_public/iteration_decision.json`
- `output/externalization_nohitl/no_hitl_analysis.json`
- `output/agi_readiness/goal_completion_status.json`
- `output/agi_readiness/subjective_goal_completion_status.json`
- `output/agi_readiness/compatibility_completion_status.json`
- `output/agi_readiness/autonomous_learning_status.json`
- `output/agi_readiness/learning_adoption_status.json`
- `output/agi_readiness/self_directed_probe_status.json`
- `output/agi_readiness/novel_task_acquisition.json`

If the semantic window mismatches, strict public eval must fail.

## Headline Relationship

The learning loop is not the headline current truth.

- Headline: `output/governance_public/worker_decision_surface.json`
- Supplemental companion: `output/governance_public/worker_completion_status.json`
- Supporting program readiness: `output/agi_readiness/goal_completion_status.json`
- Supporting subjective companion: `output/agi_readiness/subjective_goal_completion_status.json`
- Supporting compatibility layer: `output/agi_readiness/compatibility_completion_status.json`
