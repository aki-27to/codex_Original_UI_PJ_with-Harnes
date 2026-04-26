# Harness Artifact MCP Server

Read-only MCP wrapper for harness evidence surfaces.

This server is an observation layer only. It reads an explicit filename allowlist under `output/governance_public/`, `output/agi_readiness/`, and `logs/current/`; it does not calculate worker decisions, mutate artifacts, run shell commands, or use external network access.

## Tools

- `harness_status`
- `harness_list_artifacts`
- `harness_read_artifact`

## Resources

- `harness://status`
- `harness://worker-decision`
- `harness://goal-completion`
- `harness://logs-current`

## Verification

```powershell
node tools/harness-artifact-mcp-server/tests/smoke_test.js
```

## Codex MCP config

Use this repo-local registration when the environment permits editing `.codex/config.toml`:

```toml
[mcp_servers.harness_artifacts]
command = "node"
cwd = "C:/Users/akima/dev/codex_Original_UI_PJ_with-Harnes"
args = ["tools/harness-artifact-mcp-server/src/server.js"]
```
