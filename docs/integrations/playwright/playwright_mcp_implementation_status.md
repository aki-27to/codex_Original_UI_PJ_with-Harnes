# Playwright MCP Implementation Status

Updated: 2026-04-24

## Scope

This document captures the shipped local-first Playwright MCP wrapper. It turns browser inspection, action, diagnostics, viewport evidence, and smoke checks into MCP tools without adding new repo dependencies.

## Delivered Surface

- Standalone MCP server:
  - `tools/playwright-mcp-server/src/server.js`
- MCP smoke client:
  - `tools/playwright-mcp-server/tests/smoke_test.js`
- Browser smoke client:
  - `tools/playwright-mcp-server/tests/browser_smoke_test.js`
- Package metadata:
  - `tools/playwright-mcp-server/package.json`
- Codex MCP registration:
  - `.codex/config.toml` as `mcp_servers.playwright`
  - The registration sets an explicit repo `cwd` so the relative server path resolves even when Codex starts MCP servers from another working directory.
- Artifact root:
  - `output/playwright/mcp/`

## Implemented MCP Tools

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

## User-Facing Capabilities

- Open a page, click, fill, and capture the result from a real browser session.
- Return a DOM snapshot with stable `e0`, `e1`, ... refs for follow-up actions.
- Save screenshots and visual checkpoints under `output/playwright/mcp/`.
- Collect console messages, page exceptions, failed requests, and HTTP 4xx/5xx responses.
- Check mobile, tablet, and desktop viewports in one call with screenshots and layout-risk metrics.
- Start a bounded local dev server command, wait for a URL, run browser smoke actions, capture evidence, and stop the server by default.

## Runtime Behavior

- The MCP server starts without Playwright installed.
- Browser-backed tools use repo dependencies first, then repo-local npx cache entries under `runtime/npm-cache/_npx/`.
- Chromium-backed tools accept a `channel` argument such as `msedge` or `chrome` for environments with installed browsers but no Playwright-managed browser bundle.
- Browser-backed tools return a structured tool error with the install hint when `playwright` is still missing.
- Browser sessions are in-memory per MCP process and can be closed with `playwright_close_session`.
- Local smoke server commands run without a shell and with `cwd` constrained to the repository.

## Verification Commands

From the repo root:

```powershell
node tools/playwright-mcp-server/tests/smoke_test.js
npm run test:playwright-mcp
node tools/playwright-mcp-server/tests/config_startup_test.js
npm run test:playwright-mcp:config
node tools/playwright-mcp-server/tests/browser_smoke_test.js
npm run test:playwright-mcp:browser
```

Browser-backed proof after dependencies are installed:

```powershell
npm install
npx playwright install chromium
node tools/playwright-mcp-server/src/server.js
```

## Current Limits

- Screenshot diffing stores deterministic visual checkpoints and hashes, but does not perform pixel-by-pixel comparison yet.
- Element refs are snapshot-scoped. Run `playwright_observe` again after major DOM changes.
- Local smoke accepts process commands, but it intentionally avoids shell parsing; pass command arguments as `start_args`.
