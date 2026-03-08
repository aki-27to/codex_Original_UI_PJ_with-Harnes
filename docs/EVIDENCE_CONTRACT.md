# EVIDENCE_CONTRACT

Updated: 2026-03-07

## 1) Purpose

Define the minimum verification and reporting artifacts required before a task can move to `COMPLETED`.
- Machine-readable outcome taxonomy source: `scripts/config/task_outcome_contract.json`.

## 2) Evidence Classes

- Implementation evidence:
  - changed file references
  - created artifacts or generated outputs
- Verification evidence:
  - test commands
  - lint/check commands
  - manual review steps when automated checks do not apply
- Runtime evidence:
  - API responses
  - protocol lifecycle results
  - terminal status or log summaries
- Documentation evidence:
  - updated `docs/CURRENT_ARCHITECTURE.md`
  - matching entry in `docs/ARCHITECTURE_CHANGELOG.md`
  - traceable sync note for baseline and over-delivery behavior
- Risk evidence:
  - skipped checks
  - failed checks
  - residual risk statements and reasons

## 3) Minimum Evidence by Change Type

- Docs-only policy changes:
  - manual consistency review
  - file references to the updated policy documents
  - architecture/spec sync when the repo completion gate requires it
- `server.js` or `scripts/` changes:
  - `node scripts/app_server_smoke_test.js`
- Eval harness / replay / workflow policy changes:
  - `node scripts/eval_replay_api_smoke_test.js`
- `web/` changes:
  - launch the UI
  - verify `GET /api/runtime` returns HTTP 200
  - include browser/manual evidence when UI behavior changed materially
- Skill assignment or skill package changes:
  - `node scripts/skill_portfolio_audit.js`
- Over-delivery that adds new logic:
  - dedicated automated tests for the added logic
  - PASS output must be included in review evidence

## 4) Reporting Contract

Every completion report should make the evidence legible by including:

- the command or manual check performed
- the result summary
- status as `PASS`, `FAIL`, or `SKIPPED`
- the affected scope or file references
- residual risk when evidence is missing or incomplete

## 5) Failure Semantics

- Missing required evidence means the task is not `COMPLETED`.
- Failing required verification means the task should be reported as `FAILED_VALIDATION` unless the user explicitly accepts the risk.
- If a check cannot run because of environment limits or missing dependencies, report `BLOCKED` or `PARTIAL` instead of claiming completion.
- Runtime-facing task outcome IDs should use the machine-readable taxonomy from `scripts/config/task_outcome_contract.json`, not ad hoc labels.
- Turn terminal status and task outcome status should remain compatible with the bridge rules in `scripts/config/harness_contract_spec.json`.

## 6) Evidence Quality Rule

- Prefer deterministic command output over narrative claims.
- Prefer direct file references over vague descriptions.
- If a check is skipped, say exactly why it was skipped and what risk remains.
