---
name: api-contract-testgen
description: Generate or tighten API contract tests from route definitions, request validation, and status-schema behavior. Use when backend_worker or tester must add focused coverage for /api routes, auth rules, idempotency semantics, or task-outcome contract behavior with executable evidence.
---

# API Contract Testgen

Turn route behavior into narrow, repeatable contract tests.

## Workflow

1. Inventory the contract surface:
   - route and method
   - auth and required fields
   - status codes and response shape
   - negative and edge cases
2. Derive a compact case matrix from implementation, not assumptions.
3. Add or update isolated tests in `scripts/` for the covered contract.
4. Verify with targeted commands before widening to broader smoke coverage.

## Commands

```powershell
rg -n "/api/|createServer|sendJson|validate|idempotency|taskOutcome|requestUserInput" server.js scripts
rg -n "assert\\(|statusCode|code:|taskOutcomeStatus|idempotency" scripts
node --check server.js
```

## Output Contract

1. Covered routes and contract cases.
2. Generated or updated test file paths.
3. Exact verification commands and outcomes.
4. Residual uncovered cases that still need manual or broader smoke validation.

## Reference

- `references/contract-case-checklist.md`
