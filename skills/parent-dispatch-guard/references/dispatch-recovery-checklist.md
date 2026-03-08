# Dispatch Recovery Checklist

## A. Pre-Dispatch

1. Confirm parent role (`default`, `intake`, `release_manager`).
2. Confirm specialist routing target (`frontend_worker`, `backend_worker`, `infra_worker`, `tester`, `reviewer`, `explorer`).
3. Include acceptance checks in the child prompt.

## B. Dispatch Execution

1. Call `spawn_agent`.
2. Call `wait`.
3. Validate child result against acceptance checks.

## C. If Dispatch Fails

1. Capture failure mode (`spawn failed`, `timeout`, `empty output`, `wrong scope`).
2. Re-dispatch with corrected role and tighter constraints.
3. If specialist is unavailable, stop and record the blocker or missing-capability gap; do not route to retired fallback roles.

## D. Completion Gate

1. At least one child dispatch must succeed.
2. Parent review must cite child evidence.
3. Final report must include dispatch counts and children used.
