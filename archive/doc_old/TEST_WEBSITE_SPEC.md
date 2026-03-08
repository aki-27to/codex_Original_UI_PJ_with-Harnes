# TEST Website Spec

Last updated: 2026-02-23  
Scope: `TEST/` static corporate website delivery

## 1. Intent Contract
- Goal: Build a high-quality IT company website in `TEST/` with practical UX and realistic business tone.
- Success criteria:
  - High-quality responsive landing page with clear business messaging.
  - Distinct but calm visual style (not over-designed, not exaggerated).
  - Core interaction logic: mobile navigation, scroll reveal, counters, active nav, form validation.
  - Automated validation command with reproducible PASS output.
- Non-goals:
  - Backend form integration.
  - CMS integration.
  - Build tooling or dependency installation.
- Constraints:
  - Keep implementation local-first.
  - Do not modify `server.js` or `web/` paths for this task.

## 2. Baseline Delivery
- `TEST/index.html`:
  - Full enterprise-style site structure (hero, services, case studies, process, careers, contact, footer).
  - Accessibility-oriented semantics (`aria-*`, `role=status`, `noscript`, labeled form controls).
- `TEST/styles.css`:
  - Calm and realistic corporate visual language.
  - Responsive layouts across desktop/tablet/mobile.
  - Minimal motion system focused on readability.
- `TEST/app.js`:
  - Header menu toggle for small screens.
  - IntersectionObserver-based reveal effects.
  - Animated metric counters.
  - Active section highlight on navigation.
  - Client-side form validation and feedback.

## 3. Over-delivery
- `TEST/validate_site.js`:
  - Automated structural and behavior-hook validation for HTML/CSS/JS (responsive hooks, reveal hooks, nav/form/counter logic).
  - Deterministic PASS/FAIL output for quick regression checks.

## 4. Test Evidence
- Command:
  - `node TEST/validate_site.js`
- Result:
  - Executed on 2026-02-23
  - `PASS: Core files exist.`
  - `PASS: HTML sections and links are valid.`
  - `PASS: CSS responsive and animation hooks are present.`
  - `PASS: JS interactivity features are present.`
  - `PASS: Website validation completed.`

## 5. Residual Risks
- Form submission is currently frontend-only (no API transport).
- External web fonts rely on network availability.
