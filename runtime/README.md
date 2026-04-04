# Runtime Surface

This directory is the dedicated home for repo-local transient runtime material.

What belongs here:
- local caches such as npm and Playwright browser downloads
- scratch exports, temporary verification payloads, and migrated root `tmp_*` files
- local resume/session helpers that are not part of the harness source of truth

What does not belong here:
- machine-readable contracts in `scripts/config/`
- implementation code in `scripts/lib/`, `server.js`, and `web/`
- governed evidence surfaces in `logs/`
- intentional artifact/report surfaces in `output/`

Goal:
- keep the repository root source-first
- keep transient local operator/runtime material reversible and easy to purge
