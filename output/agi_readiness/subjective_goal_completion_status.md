# Subjective AGI Completion

- operationalGoalStatus: OPERATIONALLY_COMPLETE
- subjectiveGoalStatus: SUBJECTIVE_AGI_NEAR_COMPLETE
- generatedAt: 2026-04-22T00:42:01.406Z
- subjectiveDecisionBasis: worker_centric_subjective_companion_gate

## Current Values
- operationalGoalStatus: OPERATIONALLY_COMPLETE
- stableCoverageBreadth: 1
- supportedCoverageBreadth: 1
- rawFinalScore: 0.99225
- R_robust: 1
- H_horizon: 1
- catastrophicRiskCvar: 0.005
- openDebtCount: 0
- blockedSubtasks: 0
- integrationPendingCount: 0
- runningAgendaCount: 0
- blockedAgendaCount: 0
- insufficientEvidenceCount: 0
- verifiedPositiveRemediations: 5
- verifiedPositiveSelfDirectedRemediations: 10
- distinctImprovementCount: 5
- distinctRegressionCount: 0
- recentNonWorsening: true
- primaryLaneSelectedInLatestPackCount: 4
- primaryLaneEffectiveContributionCount: 4
- primaryLaneCausalUsageCount: 9
- likelyContributoryCount: 9
- harmfulCausalRatio: 0
- missingContext: 1
- browserToolFlakiness: 1
- ambiguousInstructionStatus: observed
- ambiguousInstructionEvidenceCount: 245
- ambiguousInstruction: 1
- adversarialConflictingInstruction: 1
- degradedToolOutputs: 1
- noEvidenceRobustnessCategories: 
- novelProbePositiveCount: 5

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
