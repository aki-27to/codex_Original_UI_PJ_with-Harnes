# Visual Diff Triage Rules

## Severity

1. High: broken layout, hidden CTA, unreadable text, inaccessible contrast.
2. Medium: spacing drift, typography mismatch, alignment inconsistency in critical sections.
3. Low: minor color or shadow deltas with no usability impact.

## Classification

1. Intentional update:
   - linked to approved design change and consistent across breakpoints.
2. Regression:
   - change not in spec and harms clarity, hierarchy, or usability.
3. Capture artifact:
   - non-deterministic rendering noise; rerun capture before final verdict.

## Reporting

1. Include route, viewport, and component id if available.
2. Include before and after image paths.
3. Include recommended code-level fix direction.
