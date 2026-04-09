---
applyTo: "web/**/*.html,web/**/*.css,web/**/*.js"
---

This path scope owns the operator-facing harness UI.

Preserve these expectations:
- the main user workflow still executes through the governed harness, not a parallel client-side orchestration path
- operator surfaces stay local-first and assistant-like rather than dashboard-heavy
- the UI should explain current work, blockage, and next step without overclaiming certainty
- simple layouts and strong operator readability beat decorative complexity

Change rules:
- do not introduce UI flows that hide requirement uncertainty or fabricate completion
- do not make the UI depend on new external services by default
- keep design work aligned with the active intent profile and requirement lock
- when changing primary console behavior, verify route health with `GET /api/runtime` and `GET /01.HarnesUI/index.html`
- when changing visual/operator behavior, keep desktop and mobile evidence in mind and update docs when the operator mental model changes
