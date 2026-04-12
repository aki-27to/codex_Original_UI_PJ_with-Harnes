# AGI Operational Completion

- goalStatus: NOT_YET
- subjectiveGoalStatus: NOT_YET
- subjectiveCriteriaMet: false
- subjectiveCriteriaWindow: 0/7
- compatibilityCompletionStatus: NOT_YET
- compatibilityCriteriaMet: false
- compatibilityCriteriaWindow: 0/14
- generatedAt: 2026-04-12T08:44:27.925Z
- completionVersion: 2026-04-11.r1
- decisionBasis: live_truth_strict_operational_criteria

## Current Values
- stableCoverageBreadth: 0.333333
- supportedCoverageBreadth: 1
- failedFamilies: 
- R_robust: 1
- H_horizon: 1
- rawFinalScore: 0.9995
- catastrophicRiskCvar: 0.001
- openDebtCount: 7
- blockedSubtasks: 0
- integrationPendingCount: 0
- ambiguousInstructionStatus: observed
- ambiguousInstructionEvidenceCount: 12
- ambiguousInstructionScore: 1
- missingContextScore: 1
- browserToolFlakinessScore: 0.418367
- adversarialConflictingScore: 1
- degradedToolOutputsScore: 1
- verifiedPositiveRemediations: 4
- verifiedNegativeRemediations: 0
- verifiedHarmfulRemediations: 0
- insufficientEvidenceRemediations: 0
- runningAgendaCount: 1
- harmfulCausalRatio: 1
- likelyContributoryCount: 0
- harmfulTraceCount: 4
- distinctLineageWindowCount: 4
- distinctLineageNonWorsening: true
- primaryLaneObservationCount: 130
- primaryLaneCausalUsageCount: 10
- primaryLaneSelectedInLatestPackCount: 10
- primaryLaneEffectiveContributionCount: 0
- secondaryAdvisoryUsageCount: 4
- secondaryAdvisoryEffectsCount: 0

## Running Agenda Semantics
- mode: fail_closed_gate_subset_with_supporting_broader_surface
- gateScope: non_meta_completion_non_memory_eval_learning_agenda_entries_in_current_export_session
- supportingScope: all_non_memory_eval_learning_agenda_entries_in_current_export_session
- exclusionRule: isMetaCompletionAgendaEntry
- sourceArtifactPath: output/agi_readiness/autonomous_learning_status.json
- sourceArtifactField: gateDecisionCounts.running
- supportingArtifactField: currentRunningCount
- gateRunningAgendaCount: 1
- supportingCurrentRunningCount: 3
- excludedMetaCompletionRunningCount: 2
- gateBlockedAgendaCount: 0
- supportingCurrentBlockedCount: 0
- excludedMetaCompletionBlockedCount: 0
- gateInsufficientEvidenceCount: 0
- supportingCurrentInsufficientEvidenceCount: 0
- excludedMetaCompletionInsufficientEvidenceCount: 0

## Why Not Yet
- stable coverage breadth below threshold (0.333333 < 1)
- continuity debt remains open (7 > 0)
- harmful causal trace ratio above threshold (1 > 0.1)
- autonomous learning agenda still has running items (1)
- browser_tool_flakiness below threshold (0.418367 < 0.8)
- operational completion thresholds have not been maintained across 3 consecutive live exports

## Required Next Actions
- stabilize supported family coverage across recent windows
- running agenda counts differ across artifacts without an explicit gate vs supporting basis
- continuity carries 7 closeout debt item(s) with severity high
- close outstanding continuity debt items
- revoke or supersede harmful lessons/hints
- improve browser/tool degraded-mode handling and retry policy
- maintain all completion thresholds across consecutive live exports

## Failed Criteria
- stableCoverageBreadth: stable coverage breadth 0.333333 >= 1
- openDebtCount: open debt count 7 <= 0
- harmfulCausalRatio: harmful causal ratio 1 <= 0.1
- runningAgendaCount: running agenda count 1 <= 0
- browserToolFlakiness: browser_tool_flakiness 0.418367 >= 0.8
- consecutiveSuccessfulExports: consecutive successful exports 0 >= 3
