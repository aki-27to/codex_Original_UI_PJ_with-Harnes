---
name: "web-ui-acceptance-review"
description: "Review whether web/UI work is adoption-ready. Use for design-sensitive web, UI, copy, information architecture, responsive, accessibility, or visual acceptance tasks."
---

# web-ui-acceptance-review

## Purpose

Prevent unverified visual impressions from replacing explicit acceptance criteria, reference comparison, visual evidence, and adoption decision.

## Procedure

1. Lock the UI acceptance brief: target user, page scope, benchmark, anti-benchmark, and success criteria.
2. Evaluate copy quality, information architecture, responsive behavior, accessibility, visual quality, and implementation quality.
3. Capture desktop/mobile/worst-state evidence when browser tooling is available.
4. Connect findings to worker decision and learning surfaces.

## Output Contract

Return a concise result with:

- `outcome`: the decision, artifact, or behavior change this skill produced.
- `evidence`: files, commands, logs, or artifacts checked.
- `open_issues`: missing checks, residual risks, or follow-up work.

## Evidence

- UI acceptance brief or user taste memory
- reference/benchmark analysis
- screenshots or browser diagnostics
- reviewer/tester verdicts
- implementation verification commands

## Verification

Before closing design-sensitive web/UI work, verify at least:

- desktop and mobile visual evidence when browser tooling is available
- reference or benchmark comparison for the changed surface
- console errors and failed requests when browser diagnostics are available
- horizontal overflow and text clipping on the checked viewport

## Failure Guard

Do not close design-sensitive work without visual evidence and a comparison target.
