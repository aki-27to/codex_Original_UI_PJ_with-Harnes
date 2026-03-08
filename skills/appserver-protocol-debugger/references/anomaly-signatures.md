# Anomaly Signatures

## Handshake Violations

1. `initialized` emitted before `initialize` response.
2. Missing `id` in request or response objects.
3. JSONL framing errors (multiple objects on one line or broken line termination).

## Turn Lifecycle Violations

1. `turn/start` with no matching `turn/completed`.
2. `turn/completed` emitted more than once for same turn.
3. Terminal status outside allowed set (`completed`, `interrupted`, `failed`).
4. `turn/interrupt` called after terminal completion.

## Thread State Violations

1. Unknown thread id without retry path.
2. Resume path silently falling back without logging intent.
3. Pending RPC map not cleaned after fatal or completion.
