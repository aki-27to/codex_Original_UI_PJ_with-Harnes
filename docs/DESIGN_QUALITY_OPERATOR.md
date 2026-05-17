# Design Quality Operator

Updated: 2026-05-10

## Purpose

Design Quality Operator is the harness surface for exception-based web design judgment. It is not an image gallery. It first locks the customer-image benchmark, then generates candidate designs, captures visual evidence, scores them against reference grammar and taste memory, rejects weak candidates, and shows the user only the recommended design or the narrow decision that genuinely needs human judgment.

The current MieNDI calibration reference is `https://www.suruga-k.jp/`. It is a customer-image benchmark for non-destructive inspection credibility, safety proposition, service breadth, and trust proof. It is not a layout to clone.

## User-Facing Surface

The HarnesUI first screen includes a `Design Quality Operator` panel. It reads:

- `web/design-quality/latest/decision.json`
- `web/design-quality/latest/index.html`

The panel shows:

- status: `PASS`, `NEEDS_DECISION`, `FAILED_VALIDATION`, or not run
- recommendation: candidate label and score
- human decision: required or not required
- reasons and risks
- links to the detail view and decision evidence

Screenshots are available from the detail view, but the default UI does not force the user to compare every generated image.

## Operator Flow

1. Lock the page scope, non-mutation boundary, customer-image reference, anti-reference, current-site diagnosis, and win conditions.
2. Generate multiple candidate HTML views from the target content and assets.
3. Capture desktop and mobile screenshots.
4. Score candidates with `scripts/config/visual_grammar.json`, `scripts/config/anti_taste_memory.json`, and `scripts/config/design_quality_operator_policy.json`.
5. Apply the calibration gate. A candidate cannot reach `auto_recommend` just because it has screenshots, real photos, or a high generic score.
6. Reject weak candidates and record reasons.
7. Route the outcome:
   - `auto_recommend`: one strong candidate, no human decision required.
   - `review_inbox`: close candidates or taste uncertainty, human decision required.
   - `failed_validation`: missing screenshot evidence or weak candidates.
8. Publish the latest run under `web/design-quality/latest/`.

## Commands

```powershell
npm run design:quality
npm run test:design-quality-operator
```

For feedback capture:

```powershell
npm run design:quality:feedback -- --feedback "A is closer, but make the proof strip quieter."
```

Feedback writes a candidate file. It does not silently mutate durable taste memory.

## Current Demonstration Target

The default configured target is `C:\Users\akima\dev\MieNDI`, scoped to the TOP page. The operator uses real public assets from that repository, writes the run under `output/design_runs/`, and publishes the current user-facing artifact under `web/design-quality/latest/`.

## Boundaries

- The operator does not mutate the target project.
- The operator does not replace final implementation review.
- The operator does not claim production readiness from a prototype image.
- Missing screenshots fail closed.
- Uncalibrated or benchmark-losing visual output cannot `PASS`.
