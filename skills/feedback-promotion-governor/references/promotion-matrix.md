# Promotion Matrix

## Decision Matrix

| Condition | Scope | Reason |
|---|---|---|
| Single feedback event, low confidence | `turn` | Avoid premature global drift |
| Repeated same-session feedback, stable intent | `session` | Improve continuity without long-term lock-in |
| Repeated cross-context feedback + low regressions | `global` | Evidence supports baseline update |

## Required Counters

1. `repeat_count`: how many times same issue was observed.
2. `context_count`: number of distinct contexts where issue repeats.
3. `regression_count`: side effects observed after applying change.

## Example Guard Thresholds

1. `turn -> session`: `repeat_count >= 2`, `regression_count == 0`.
2. `session -> global`: `repeat_count >= 3`, `context_count >= 2`, `regression_count <= 1`.

## Rollback Rules

Rollback immediately when any condition holds:

1. Safety degradation.
2. Task success drop in unrelated workflows.
3. User explicitly requests rollback.

## Review Window

Global promotions should carry a review window and TTL marker.

Recommended:

1. Review window: 7 to 14 days.
2. TTL: auto-revert if no confirming evidence during window.

