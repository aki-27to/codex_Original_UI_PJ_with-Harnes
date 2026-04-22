# AGI Operational Completion

- goalStatus: OPERATIONALLY_COMPLETE
- subjectiveGoalStatus: SUBJECTIVE_AGI_NEAR_COMPLETE
- subjectiveCriteriaMet: true
- subjectiveCriteriaWindow: 13/7
- compatibilityCompletionStatus: COMPATIBILITY_COMPLETE
- compatibilityCriteriaMet: true
- compatibilityCriteriaWindow: 14/14
- generatedAt: 2026-04-22T00:42:01.379Z
- completionVersion: 2026-04-11.r1
- decisionBasis: live_truth_strict_operational_criteria

## Current Values
- stableCoverageBreadth: 1
- supportedCoverageBreadth: 1
- failedFamilies: 
- R_robust: 1
- H_horizon: 1
- rawFinalScore: 0.99225
- catastrophicRiskCvar: 0.005
- openDebtCount: 0
- blockedSubtasks: 0
- integrationPendingCount: 0
- ambiguousInstructionStatus: observed
- ambiguousInstructionEvidenceCount: 10
- ambiguousInstructionScore: 1
- missingContextScore: 1
- browserToolFlakinessScore: 1
- adversarialConflictingScore: 1
- degradedToolOutputsScore: 1
- verifiedPositiveRemediations: 5
- verifiedNegativeRemediations: 0
- verifiedHarmfulRemediations: 0
- insufficientEvidenceRemediations: 0
- runningAgendaCount: 0
- harmfulCausalRatio: 0
- likelyContributoryCount: 4
- harmfulTraceCount: 0
- distinctLineageWindowCount: 5
- distinctLineageNonWorsening: true
- primaryLaneObservationCount: 88
- primaryLaneCausalUsageCount: 9
- primaryLaneSelectedInLatestPackCount: 4
- primaryLaneEffectiveContributionCount: 4
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
- gateRunningAgendaCount: 0
- supportingCurrentRunningCount: 0
- excludedMetaCompletionRunningCount: 0
- gateBlockedAgendaCount: 0
- supportingCurrentBlockedCount: 0
- excludedMetaCompletionBlockedCount: 0
- gateInsufficientEvidenceCount: 0
- supportingCurrentInsufficientEvidenceCount: 0
- excludedMetaCompletionInsufficientEvidenceCount: 0

## Why Not Yet

## Required Next Actions

## Failed Criteria
