---
name: "design-quality-operator"
description: "Use when design-sensitive web/UI work should generate, score, reject, route, and present only the necessary design decision instead of making the user inspect every variant."
---

# design-quality-operator

## Purpose

Run design work as an exception-based operator: lock the customer-image benchmark first, generate multiple candidates, collect visual evidence, score them against reference grammar and taste memory, reject weak options, and show the user only the recommended outcome or the narrow decision that truly needs judgment.

## Procedure

1. Lock the target surface, page scope, customer-image reference, reference grammar, anti-reference, win conditions, anti-taste patterns, and non-mutation boundary.
2. Use `scripts/design/design_quality_operator.js` to generate candidates, copy required visual assets, capture desktop/mobile screenshots, score the candidates, and route the decision.
3. Evaluate generator output as untrusted: use fixed criteria from policy, visual grammar, anti-taste memory, and screenshot evidence rather than accepting the candidate's own labels or prose.
4. Block `auto_recommend` when the candidate does not beat the locked customer-image benchmark, even if screenshots exist and the generic score is high.
5. Treat `web/design-quality/latest/decision.json` as the user-facing status source and `web/design-quality/latest/index.html` as the detail view.
6. If the operator routes to `auto_recommend`, report the recommendation, reasons, risk, and detail link without asking the user to compare all images.
7. If it routes to `review_inbox` or `FAILED_VALIDATION`, show only the narrowed choice, calibration miss, or missing-evidence reason.
8. Convert explicit user feedback with `scripts/design/extract_feedback_to_taste_memory.js`; do not silently persist taste-memory changes without review.

## Output Contract

Return:

- `operator_status`: `PASS`, `NEEDS_DECISION`, `FAILED_VALIDATION`, or `BLOCKED`.
- `recommendation`: candidate id, label, score, and why it is recommended.
- `human_decision`: whether the user must choose, and if so the smallest useful choice.
- `calibration`: customer-image reference, gate status, failed checks, win conditions, and anti-reference.
- `evidence`: decision file, detail view, scorecard, screenshots, rejected-candidate reasons, and verification commands.
- `open_issues`: missing screenshots, target-server limitations, apply-stage risks, or unmerged taste-memory candidates.

## Evidence

- `scripts/config/design_quality_operator_policy.json`
- `scripts/config/visual_grammar.json`
- `scripts/config/anti_taste_memory.json`
- `web/design-quality/latest/decision.json`
- `web/design-quality/latest/index.html`
- `web/design-quality/latest/screenshots/*.png`
- `logs/design_operator.jsonl`

## Verification

Before claiming the operator is adoption-ready, verify:

- `node scripts/design_quality_operator_test.js`
- `node scripts/harnesui_design_quality_panel_test.js`
- `node plugins/skill-governance/skills/skill-design-review-codex/scripts/analyze-skill-design.js .agents/skills/design-quality-operator`
- `node scripts/repo_local_skill_catalog_test.js`
- `node scripts/skill_flow_contract_test.js`

For a real visual run, also verify that `decision.json` has `status: PASS`, `humanDecisionRequired: false` or a narrow inbox choice, and desktop/mobile screenshots exist for the recommended candidate.

## Failure Guard

Do not turn this into an image gallery. The user should not inspect every generated design by default. Do not call a run complete when screenshots are missing, when all candidates are weak, when the customer-image benchmark is not locked, when calibration failed, or when a production app patch has not actually been applied. The operator can recommend a design image; applying it to the target repo is a separate apply-stage task.
