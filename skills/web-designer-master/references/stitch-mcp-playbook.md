# Stitch MCP Playbook

Use this reference when `web-designer-master` needs Stitch as design intake.

## Prefer This Order

1. Inspect available project/screens first.
2. Pull the minimum code/image source needed.
3. Adapt the imported result into the repo.
4. Only generate a full site scaffold when the user explicitly wants that output shape.

## Tool Selection

### Inspect and browse

- Use Stitch project/screen listing or browsing when you need to understand available screens before coding.
- If Stitch is exposed as an app connector, use the connector tools first. Do not treat `list_mcp_resources` or `list_mcp_resource_templates` as the source of truth for Stitch availability.
- Do not diagnose Stitch access from raw `curl` alone before checking the connector path. A private project can fail in the browser while still being reachable through authenticated Stitch tools.
- If CLI access is the path, typical commands are:
  - `npx @_davideast/stitch-mcp view --projects`
  - `npx @_davideast/stitch-mcp screens -p <project-id>`

### Import one screen's implementation source

- Prefer `get_screen_code` when a single Stitch screen should become a repo page or component.
- Use it to capture HTML/CSS structure, then refactor into local components and tokens.

### Import one screen's visual reference

- Prefer `get_screen_image` when you need screenshot evidence or visual comparison during implementation.

### Build a route map from multiple screens

- Prefer `build_site` when the user has several screens and wants an initial page-to-route mapping.
- Use the returned HTML as source material, not as final ship-ready code.

### Local preview outside Codex MCP

- Use `serve -p <project-id>` when you need a quick local preview of project screens.

### Full generated project output

- Use `site -p <project-id>` only when the user explicitly wants an Astro site scaffold or greenfield prototype export.
- Do not force Astro output into an existing non-Astro repo.

## Setup Notes

- Codex can attach Stitch through MCP with a project-scoped `.codex/config.toml` entry.
- Typical STDIO MCP config shape:

```toml
[mcp_servers.stitch]
command = "npx"
args = ["@_davideast/stitch-mcp", "proxy"]
```

- Auth usually comes from one of:
  - `STITCH_API_KEY`
  - `npx @_davideast/stitch-mcp init`
  - existing `gcloud` auth plus `STITCH_USE_SYSTEM_GCLOUD=1`

## Fallback Rules

1. If Stitch auth is missing, state the gap briefly and continue manually.
2. If only screenshots are available, use them as visual reference and rebuild implementation locally.
3. If imported markup conflicts with repo patterns, preserve repo conventions and treat Stitch as reference only.
4. When asked "can we access this Stitch project/screen?", answer from the strongest available path in this order: authenticated connector/tool result -> CLI result -> public URL/curl result.
