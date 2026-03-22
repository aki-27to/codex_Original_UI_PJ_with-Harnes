# Quality Gate

Mark each item PASS or FAIL before delivery.

## Source Traceability

1. The response states whether Stitch was used or a manual fallback was used.
2. Stitch project IDs, screen IDs, or equivalent source references are captured when available.
3. Route mapping between source screens and implemented pages is explicit.

## Adaptation Quality

1. Imported code has been adapted to the repo structure, not pasted in raw.
2. Placeholder text, dead wrappers, and generated cruft are removed.
3. Existing design-system constraints are preserved when required.

## Responsive and Accessibility

1. Desktop and mobile layouts are both verified.
2. Landmarks and heading hierarchy are semantic.
3. Keyboard navigation is functional for major interactions.

## Delivery Readiness

1. The implementation reflects the user's actual page/app goal, not just the imported draft.
2. The final report distinguishes Stitch-derived work from manual refinements.
3. Any auth/tooling/setup limitation is reported explicitly.
