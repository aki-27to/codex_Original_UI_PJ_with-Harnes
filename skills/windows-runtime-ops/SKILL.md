---
name: windows-runtime-ops
description: Diagnose and recover Windows-local runtime issues for launcher, process, port, path, service, and permission failures. Use when infra_worker must debug Codex harness startup, blocked listeners, log anomalies, missing binaries, or environment drift without introducing new dependencies.
---

# Windows Runtime Ops

Use Windows-native diagnostics first and keep recovery bounded.

## Workflow

1. Capture runtime posture:
   - launcher env defaults
   - active process and listener state
   - recent harness logs
2. Isolate the failure class:
   - process crash or hang
   - port bind conflict
   - missing path or binary
   - permission or execution-policy block
   - stale env override
3. Apply the least-destructive recovery:
   - prefer local restart, env correction, or path fix
   - do not install software or change security boundaries without explicit approval
4. Re-run the failing check and report exact evidence.

## Commands

```powershell
Get-Process | Sort-Object CPU -Descending | Select-Object -First 15
Get-NetTCPConnection -State Listen | Sort-Object LocalPort
Get-CimInstance Win32_Service | Where-Object { $_.StartMode -eq 'Auto' -and $_.State -ne 'Running' }
whoami /priv
rg -n "ERROR|WARN|blocked|EACCES|EPERM|timeout|listen|port" logs server.js scripts
```

## Output Contract

1. Failure class and exact Windows evidence.
2. Files, ports, processes, or env vars touched.
3. Recovery action taken and why it was safe.
4. Verification command and outcome.

## Reference

- `references/windows-diagnostics-matrix.md`
