---
name: web-designer-master
description: Design and build distinctive, premium web interfaces with strong art direction, custom typography, deliberate color systems, expressive layout composition, and meaningful motion. Use when users ask for website creation or redesign that must avoid generic AI-looking output and reach client-delivery quality across desktop and mobile.
---

# Web Designer Master

Create visually original, client-ready websites with a clear design point of view.

## Core Objective

Ship designs that do not look template-generated and can be presented to paying clients.

## Workflow

1. Lock intent:
   - Define target audience, business goal, and brand mood in 3 lines.
2. Choose one visual direction before coding:
   - Use `references/style-directions.md`.
3. Build a concrete design brief:
   - Fill `references/design-brief-template.md`.
4. Design system first:
   - Define CSS variables for color, spacing, radius, shadow, timing.
   - Select expressive type pairing; avoid default-only stacks.
5. Compose layout with hierarchy:
   - Create a signature hero.
   - Use varied section rhythm (dense + airy zones).
   - Avoid repetitive equal-height card grids everywhere.
6. Add meaningful motion:
   - Page-load staging, section reveals, and one signature interaction.
   - Respect `prefers-reduced-motion`.
7. Polish for production:
   - Responsive behavior for desktop/tablet/mobile.
   - Accessibility checks (contrast, keyboard flow, semantic landmarks).
8. Final critique pass:
   - Run `references/quality-gate.md` and fix every FAIL.

## Hard Rules

1. Do not output generic "AI template" compositions.
2. Do not default to purple-on-white style unless explicitly requested.
3. Do not rely on only Inter/Roboto/Arial unless constrained by an existing design system.
4. Preserve the existing design system when working in an established product.
5. Always include at least one intentional signature element:
   - typography treatment, asymmetric composition, custom motif, or branded motion.

## Deliverable Contract

Provide:

1. Visual direction summary (5-8 lines).
2. Design token block (CSS variables).
3. Implemented UI files (or edited target files) with responsive behavior.
4. Rationale for key design decisions tied to client goals.

## Trigger Diagnostics

When trigger quality is uncertain, evaluate with `references/trigger-samples.md`.
