# APP_SERVER_PROTOCOL_RUNBOOK

Updated: 2026-03-07

## 1) Purpose
Protocol/runtime guardrails for Codex App Server integration in this repository.
- This is a runbook for protocol behavior and verification, not a replacement for tier-0 governance in `AGENTS.md`.
- Route, port, and execution-path defaults here must stay aligned with the repository overlay in `AGENTS.md`.

## 2) Protocol Contract
- Handshake order is strict:
  1. `initialize` request
  2. `initialized` notification
- Message transport:
  - JSONL over stdio
  - JSON-RPC style envelope (`method` / `params` / `id`)
- Turn terminal contract:
  - `turn/completed` is terminal for each turn
  - terminal status must be one of: `completed`, `interrupted`, `failed`
- Machine-readable sources:
  - turn lifecycle: `scripts/config/harness_contract_spec.json`
  - task outcome taxonomy: `scripts/config/task_outcome_contract.json`
  - runtime agent governance: `scripts/config/agent_governance_contracts.json`

## 3) Implementation Scope
- Keep execution path on standard Codex via `POST /api/exec`.
- Avoid local custom orchestration, role fan-out endpoints, and legacy alternate flows.

## 4) Verification Minimum
- If `server.js` or `scripts/` changed:
  - run `node scripts/app_server_smoke_test.js`
- If `web/` changed:
  - launch UI and verify `GET /api/runtime` returns HTTP 200

## 5) Runtime Troubleshooting Checklist
1. Confirm runtime probe:
   - `GET /api/runtime` returns expected `apiVersion`, `mode`, `contractSpec`, and `taskOutcomeContract`.
   - `GET /api/agent-topography` does not list retired `worker` as a configured runtime agent.
2. Confirm app-server lifecycle logs:
   - initialize sent
   - initialized notification sent
   - `thread/start` and turn lifecycle events appear as expected.
3. Confirm turn termination:
   - each turn ends with `turn/completed` and valid terminal status.
   - each terminal turn exposes `taskOutcomeStatus` / `taskOutcomeReason` consistent with the task outcome contract.
   - turn status and task outcome status satisfy the bridge rules in `scripts/config/harness_contract_spec.json`.
4. Confirm no protocol drift:
   - envelope fields and JSONL framing are preserved.
5. Confirm runtime agent guard:
   - `POST /api/exec` rejects unconfigured or retired agents such as `worker`.

## 6) Evidence Expectations
- Include command, result summary, and PASS/FAIL in final report.
- If checks are skipped, state reason and residual risk explicitly.
