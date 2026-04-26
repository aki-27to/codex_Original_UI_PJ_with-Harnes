# Harness Artifact MCP

`harness_artifacts` is a repo-local, read-only MCP server for observing current harness evidence.

## Role

- Observation only: expose existing artifact status and selected payloads.
- No evaluation: do not compute `COMPLETED`, `ADOPT`, goal status, adoption score, or learning score.
- No mutation: do not write, delete, spawn shell commands, or call external networks.

## Allowlist

The server reads only explicit filenames under:

- `output/governance_public/`
- `output/agi_readiness/`
- `logs/current/`

Root allowlisting alone is not enough. Files must also be present in the server's filename allowlist.

## Safety Rules

- Reject path traversal and absolute paths.
- Return bounded output.
- Redact secret-like strings and absolute paths.
- Deny binary and non-allowlisted reads.
- Treat MCP output as evidence observation, not truth mutation.

## Verification

```powershell
node tools/harness-artifact-mcp-server/tests/smoke_test.js
```

## MCP Registration

Register the server as `harness_artifacts` when the local `.codex/config.toml` is writable:

```toml
[mcp_servers.harness_artifacts]
command = "node"
cwd = "C:/Users/akima/dev/codex_Original_UI_PJ_with-Harnes"
args = ["tools/harness-artifact-mcp-server/src/server.js"]
```
