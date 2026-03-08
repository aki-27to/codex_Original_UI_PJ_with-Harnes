---
name: ui-regression-diff
description: Run and triage visual regression checks for web UI changes. Use when frontend_worker or tester must compare baseline and current screenshots, detect layout shifts, identify interaction regressions, and produce actionable visual diff reports for desktop and mobile views.
---

# UI Regression Diff

Detect unintended UI changes with reproducible screenshot evidence.

## Workflow

1. Define capture matrix:
   - page routes
   - breakpoints
   - key UI states
2. Capture baseline screenshots.
3. Capture current screenshots after changes.
4. Compute and review diffs.
5. Classify each diff:
   - expected design change
   - unintended regression
   - flaky capture artifact
6. Provide file and selector level remediation notes for regressions.

## Default Verification Scope

1. Desktop and mobile viewports.
2. Navigation, hero, content sections, and form states.
3. Hover or focus states for primary controls when relevant.

## Output Contract

1. Diff summary table.
2. Regression list with severity and impacted component.
3. Approval list for intentional visual updates.

## Reference

- `references/triage-rules.md`
