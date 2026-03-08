# Audit Matrix

Use PASS only when all checks are true.

## Core Turn Integrity

1. Turn id exists and is stable across events.
2. Exactly one terminal `turn/completed` exists per turn.
3. Terminal status is valid.

## Approval and Risk Evidence

1. Approval records exist when command or file changes are present.
2. `riskRulesVersion` exists when risk classification is enabled.
3. `riskRuleIds` and `riskInputSummary` are present for audited decisions.

## Prompt and Stream Evidence

1. Prompt truncation records are consistent between activity and logs.
2. Final answer or error state is represented in artifact events.
3. Token and plan events do not contradict terminal state.

## Documentation Linkage

1. Test commands cited in release notes are present in evidence.
2. `docs/CURRENT_ARCHITECTURE.md` and `docs/ARCHITECTURE_CHANGELOG.md` include matching baseline and over-delivery evidence references.
