---
name: parent-dispatch-guard
description: Enforce reliable parent-to-child delegation using native collab tools. Use when parent agents must dispatch specialists and avoid silent direct-execution fallbacks or stalled handoff loops.
---

# Parent Dispatch Guard

Prevent parent orchestration from completing without successful child dispatch.

## Mandatory Sequence

1. Dispatch at least one child with `spawn_agent`.
2. Wait for completion using `wait`.
3. If child output is incomplete, use `send_input` and `wait` again.
4. Only then run parent review and final report.

## Failure Recovery

If child dispatch fails or does not start:

1. Emit a short failure reason with evidence.
2. Retry delegation with explicit role, acceptance checks, and file scope.
3. If no specialist route is available, stop with a bounded blocker or missing-capability report; do not invent a fallback agent.
4. Do not mark task complete until one child dispatch succeeds.

## Evidence Contract

Report these fields:

1. `dispatch_attempts`
2. `dispatch_successes`
3. `dispatch_failures`
4. `children` (agent names or ids)
5. `used_tools` (`spawn_agent`, `wait`, `send_input`)

## Quick Prompt Snippet

Use this when parent behavior drifts:

```text
Apply $parent-dispatch-guard: execute spawn_agent -> wait -> (send_input if needed) -> wait.
Do not complete review/final report until at least one child dispatch succeeds.
```

## Reference

- `references/dispatch-recovery-checklist.md`
