# Windows Diagnostics Matrix

## Launcher and Env

1. Confirm `start_codex_ui.bat` defaults only fill unset variables.
2. Check effective `CODEX_*` overrides before assuming runtime drift.
3. Verify local binary paths before treating a failure as a permission issue.

## Process and Port

1. Confirm the expected `node` process exists.
2. Confirm the target UI port is listening on `127.0.0.1`.
3. If the port is occupied, identify the owner before any restart action.

## Permissions and Policy

1. Distinguish missing binary/path from execution-policy or ACL denial.
2. Prefer read-only inspection of privileges and file access first.
3. Do not change firewall, registry, service startup mode, or install dependencies without approval.

## Recovery Gate

1. Prefer env correction, path correction, or local process restart.
2. Re-run the original launcher or probe after each bounded change.
3. Report residual blockers when the next safe action would cross an approval boundary.
