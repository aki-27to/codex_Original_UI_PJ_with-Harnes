# Runtime Surface

This directory is the dedicated home for repo-local transient runtime material.

What belongs here:
- local caches such as npm and Playwright browser downloads
- scratch exports, temporary verification payloads, and migrated root `tmp_*` files
- migrated shared-page HTML captures such as root `share_*.html`
- regenerable output that should not stay in the intentional `output/` surface, such as Playwright capture trees, timestamped phase probes, and ad hoc `note_article_*.md` drafts under `runtime/output-transient/`
- local resume/session helpers that are not part of the harness source of truth

What does not belong here:
- machine-readable contracts in `scripts/config/`
- implementation code in `scripts/lib/`, `server.js`, and `web/`
- governed evidence surfaces in `logs/`
- intentional artifact/report surfaces in `output/`

Goal:
- keep the repository root source-first
- keep transient local operator/runtime material reversible and easy to purge
