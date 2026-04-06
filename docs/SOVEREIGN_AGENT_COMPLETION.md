# Sovereign Agent Completion

This document defines the highest internal completion gate for this repo.

## Scope

- This is not a public AGI claim.
- This is a current-main, file-backed, fail-closed gate for safe sovereign completion inside the governed harness.

## Decision stack

1. `output/agi_readiness/goal_completion_status.json`
2. `output/agi_readiness/subjective_goal_completion_status.json`
3. `output/agi_readiness/sovereign_goal_completion_status.json`

`SUBJECTIVE_AGI_COMPLETE` is allowed only when the sovereign artifact reports `status = "SUBJECTIVE_AGI_COMPLETE"` and the supporting artifacts are present on current `main`.

## Required supporting artifacts

- `output/agi_readiness/self_authored_goal_status.json`
- `output/agi_readiness/self_authored_goal_history.json`
- `output/agi_readiness/self_authored_goal_market.json`
- `output/agi_readiness/open_unknowns_register.json`
- `output/agi_readiness/workspace_world_model.json`
- `output/agi_readiness/continuous_improvement_status.json`
- `output/agi_readiness/novelty_growth_status.json`
- `output/agi_readiness/security_constitution_status.json`
- `output/agi_readiness/rollback_readiness.json`
- `output/agi_readiness/autonomy_budget_status.json`
- `output/agi_readiness/self_authored_causal_effects.json`
- `output/agi_readiness/self_authored_remediation_trend.json`
