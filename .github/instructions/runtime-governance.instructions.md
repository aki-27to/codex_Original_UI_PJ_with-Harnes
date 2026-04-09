---
applyTo: "server.js,scripts/**/*.js,scripts/**/*.json,.codex/**/*.toml,start_codex_ui.bat,package.json"
---

This path scope controls harness runtime, governance, launcher posture, and machine-readable contracts.

Hard constraints:
- keep the main execution path on `POST /api/exec`
- keep evaluation and promotion on `POST /api/eval/run`
- do not add new local orchestration routes outside the existing harness family
- do not expand `/api/batch/*` into a role-specific or parallel orchestration system
- keep changes minimal, reversible, and auditable

Governance expectations:
- `approvalBoundaryItems` are audit metadata by default
- autonomous continuation is preferred for local reversible work
- explicit user-decision clauses and narrow irreversible external actions still require escalation
- do not bypass evidence gates, release gates, or requirement contracts

When touching these files:
- preserve the repo's local-first, no-new-dependency default
- keep machine-readable contracts aligned with prose docs
- update `docs/CURRENT_ARCHITECTURE.md` and `docs/ARCHITECTURE_CHANGELOG.md` for behavior or posture changes
- run `node scripts/system_coherence_review_test.js` for core-harness changes
- run `node scripts/github_copilot_governance_surface_test.js` when `.github` governance surfaces or their mirrored assumptions change
