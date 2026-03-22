---
name: web-designer-master
description: Design and implement web UI with a Stitch-first workflow. Use when users ask for website creation, redesign, landing pages, design-to-code imports, or frontend UI prototyping, especially when a Stitch project, Stitch URL, or Stitch MCP should be used before coding.
---

# Web Designer Master

Use Stitch as the default design intake path for web UI work, then adapt the result into production-ready code.

## Core Objective

Turn web UI requests into repo-ready implementation by pulling structure, code, and screenshots from Stitch whenever available.

## Use This Skill When

1. The user asks for a website, landing page, app UI, redesign, or design-heavy frontend implementation.
2. The user provides a Stitch project URL, project ID, screen ID, or explicitly wants Stitch involved.
3. The task would benefit from design import, screenshot reference, or design-to-code acceleration before manual coding.

## Do Not Use This Skill When

1. The task is backend or API work with no meaningful UI/design scope.
2. The task is a narrow bugfix or copy-only tweak where Stitch would add overhead.
3. The task is an exact in-place patch to an established design system and the user did not ask for Stitch or fresh design exploration.

## Workflow

1. Lock the implementation target:
   - Fill `references/design-brief-template.md`.
2. Prefer Stitch intake before coding:
   - If a Stitch project URL or ID exists, inspect that source first.
   - If the request is design-heavy and Stitch is available, use Stitch to generate or inspect candidate screens before implementation.
   - Use `references/stitch-mcp-playbook.md` to choose the right Stitch command or tool path.
3. Capture source-of-truth inputs:
   - Record the project ID, relevant screen IDs, route mapping, screenshots, and imported HTML/code.
   - If Stitch is unavailable, state that once and continue with manual design instead of blocking.
4. Convert design source into implementation:
   - Treat Stitch output as draft source material, not final shipped code.
   - Normalize layout, semantics, tokens, responsive behavior, and accessibility.
   - Preserve the existing product's patterns if the repo already has a design system.
5. Implement with discipline:
   - Map imported screens to real routes, components, and assets.
   - Factor repeated patterns into local components and tokens.
   - Remove generated cruft, placeholder copy, dead wrappers, and mismatched assets.
6. Validate before close:
   - Run `references/quality-gate.md` and fix every FAIL.
   - For design-sensitive tasks, keep screenshot or imported-image evidence tied to the implemented routes.
7. Report cleanly:
   - List which Stitch sources were used.
   - List which parts were manually adapted or rebuilt.
   - State any auth or tooling gaps that prevented Stitch usage.

## Hard Rules

1. Do not ship raw Stitch or AI-generated markup without adaptation.
2. Do not force Astro output into this repo unless the user explicitly wants an Astro site.
3. Do not replace a stable existing design system with generic imported styling.
4. Prefer Stitch screenshots and code as design source, but final implementation must follow repo conventions.
5. If Stitch is unavailable, continue manually and say so; never pretend Stitch was used.

## Deliverable Contract

Provide:

1. Source summary:
   - Stitch project/screens used, or explicit manual fallback.
2. Screen-to-route mapping.
3. Implemented UI files with responsive behavior.
4. Key adaptations made after import.
5. Validation summary tied to `references/quality-gate.md`.

## Trigger Diagnostics

When trigger quality is uncertain, evaluate with `references/trigger-samples.md`.
