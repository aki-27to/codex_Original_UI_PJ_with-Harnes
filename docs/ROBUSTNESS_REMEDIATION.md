# Robustness Remediation

## 2026-04-05 update

- Current public remediation surfaces:
  - `output/agi_readiness/robustness_breakdown.json`
  - `output/agi_readiness/robustness_remediation_status.json`
  - `output/agi_readiness/robustness_remediation_trend.json`
  - `output/agi_readiness/robustness_remediation_backlog.json`
  - `output/agi_readiness/robustness_remediation_effects.json`
- Goal completion treats `missing_context`, `browser_tool_flakiness`, `ambiguous_instruction`, `adversarial_conflicting_instruction`, and `degraded_tool_outputs` as strict live categories.

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
