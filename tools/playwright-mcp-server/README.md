# Playwright MCP Server

Local-first MCP wrapper for browser evidence work. It uses the repository-level `playwright` package when installed, can fall back to repo-local npx cache entries under `runtime/npm-cache/_npx/`, and otherwise stays usable for status and tool discovery.

## Tools

- `playwright_status`
- `playwright_navigate`
- `playwright_observe`
- `playwright_click`
- `playwright_fill`
- `playwright_screenshot`
- `playwright_diagnostics`
- `playwright_viewport_matrix`
- `playwright_visual_checkpoint`
- `playwright_local_smoke`
- `playwright_close_session`

## Usage

From the repo root:

```powershell
node tools/playwright-mcp-server/src/server.js
```

Smoke test:

```powershell
node tools/playwright-mcp-server/tests/smoke_test.js
node tools/playwright-mcp-server/tests/browser_smoke_test.js
```

Browser-backed tools require Playwright to be available from repo dependencies or the repo-local npx cache:

```powershell
npm install
npx playwright install chromium
```

When Playwright-managed browsers are not installed, Chromium tools also accept an installed browser `channel` such as `msedge` or `chrome`.

Artifacts are written under `output/playwright/mcp/`.

The repository `.codex/config.toml` registers this server as `playwright`.
