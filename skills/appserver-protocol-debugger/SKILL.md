---
name: appserver-protocol-debugger
description: Diagnose Codex app-server protocol issues for JSONL or JSON-RPC turn execution. Use when debugging initialize or initialized order, thread or turn lifecycle problems, terminal status handling, stream event mismatches, unknown thread recovery, or interrupt and completion anomalies in server.js and scripts.
---

# Appserver Protocol Debugger

Debug protocol behavior with repeatable checks and evidence.

## Workflow

1. Confirm handshake order:
   - `initialize` request must occur before `initialized` notification.
2. Confirm transport contract:
   - protocol messages are JSONL and JSON-RPC style (`id`, `method`, `params`).
3. Confirm turn lifecycle:
   - every started turn must end with `turn/completed`.
   - terminal status must be one of `completed`, `interrupted`, `failed`.
4. Inspect failure surfaces:
   - unknown thread or turn id
   - stuck pending RPC
   - missing terminal event
   - duplicate terminal emission
5. Verify fix with executable checks:
   - run smoke and targeted tests.

## Commands

Use these commands as a default sequence:

```bash
node --check server.js
node scripts/app_server_smoke_test.js
rg -n "initialize|initialized|turn/completed|thread/start|turn/start|turn/interrupt" server.js scripts
```

## Evidence Contract

Report:

1. Symptom and reproduction.
2. Exact protocol rule violated.
3. Fix summary with owned files.
4. Verification command output summary.

## Reference

- `references/anomaly-signatures.md`
