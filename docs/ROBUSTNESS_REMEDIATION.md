# Robustness Remediation

現行の robustness remediation はカテゴリ別に管理します。

## Supported categories
- `missing_context`
- `browser_tool_flakiness`
- `ambiguous_instruction`
- `adversarial_conflicting_instruction`
- `degraded_tool_outputs`

## Expected behavior
- `missing_context`: clarify / defer / gather_more_context / safe_fallback
- `browser_tool_flakiness`: bounded retry / degraded mode / truthful abort
- `ambiguous_instruction`: ambiguity detection と bounded clarification
- `adversarial_conflicting_instruction`: conflict surfacing と higher-order contract 優先

## Public proof
- `output/agi_readiness/robustness_breakdown.json`
- `output/agi_readiness/robustness_remediation_status.json`
- `output/agi_readiness/robustness_remediation_trend.json`
