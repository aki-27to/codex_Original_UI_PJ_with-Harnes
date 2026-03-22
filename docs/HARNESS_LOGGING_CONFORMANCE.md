# HARNESS_LOGGING_CONFORMANCE

## Verdict

Overall status: PASS

No fixed-goal blockers remain. The repository now conforms to the operator-first logging design recorded in `docs/HARNESS_LOGGING_SPEC.md`.

## PASS Areas

### Root Layout

- `logs/` root contains only `current`, `bundles`, and `archive`.
- Root-exposed temp signoff logs were removed from the active root surface.

### Current Surface

- `logs/current/` contains exactly five operator-facing files.
- `index.json`, `runtime_snapshot.json`, `conformance_report.json`, and `operator_view_summary.json` are removed from `current`.
- `operator_summary.json` is the only first-look entrypoint.
- The current operator summaries are aligned on the same passing signoff bundle and report `defaultExecAgent = default`.

### Current File Contracts

- `operator_summary.json` includes the required operator decision fields, posture summary, and follow-up refs.
- `design_conformance_summary.json` exposes pass/fail, reason, and evidence ref for every required check.
- `latest_run_summary.json` is regenerated from the same passing signoff bundle truth used by `latest_signoff_summary.json`, separates completed outcomes from residual-risk semantics, and keeps signoff refs aligned.
- `review_load_breakdown.json` declares its timing model and overlap semantics.
- `latest_signoff_summary.json` exposes signoff-safe fields directly at top level.

### Bundle Surface

- The latest signoff bundle top level is summary-first.
- `conformance_report.json` and `operator_view_summary.json` are preserved at signoff bundle top level as constitution-grade release summaries.
- Disallowed top-level artifacts are relocated under `raw/`.
- Per-turn artifacts and raw operational evidence live below deep raw paths.

### Archive Surface

- Admin inventories and deletion reporting live under `logs/archive/admin/`.
- Raw runtime state, eval history, turn artifacts, and operation logs live under `logs/archive/raw/`.

### Documentation Sync

- `docs/CURRENT_ARCHITECTURE.md` now describes the current surface as the fixed five operator-facing summaries only.
- `docs/HARNESS_LOGGING_MAP.md` now describes `runtime_snapshot.json` as bundle-only detail.

### Default Submission Export

- `scripts/export_submission_artifacts.js` produces a flat operator-first review bundle.
- Default export includes the fixed five current summaries, fixed bundle top-level summaries including bundle `conformance_report.json` and `operator_view_summary.json`, and required repo files.
- Raw and admin artifacts remain excluded from default export.
- Exported operator and bundle JSON rewrites follow-up refs to flat exported filenames instead of unresolved `logs/current` or `logs/bundles` paths.
- A separate flat 20-file review handoff is curated in the repository review bundle directory when the recipient needs files only and no directory structure.

### Reduction Reporting

- `logs/archive/admin/log_deletion_report.json` uses one consistent reduction story.
- Current archive evidence reports:
  - root entries: 5 before, 3 after
  - current operator files: 7 before, 5 after
  - disallowed signoff bundle top-level entries relocated under `raw/relocated_top_level`: 430

## Fixes Applied

- Rewrote `docs/HARNESS_LOGGING_SPEC.md` as the fixed formal spec.
- Normalized current-surface rewriting in `scripts/restructure_logging_surface.js`.
- Enforced current-surface cleanup in `scripts/lib/logging_surface.js`.
- Updated `scripts/generate_signoff_evidence.js` so signoff assertions match the fixed bundle top-level contract.
- Reworked `scripts/export_submission_artifacts.js` so default export is the fixed flat review bundle and exported JSON refs are rewritten to flat filenames.
- Regenerated the current surface, signoff bundle, and deletion report after the code changes.
- Added `scripts/current_surface_truth_test.js` to verify current-surface coherence, required latest-run fields, signoff truth alignment, current file count, and doc sync.

## Verification Evidence

- `logs/current/operator_summary.json`
- `logs/current/design_conformance_summary.json`
- `logs/current/latest_run_summary.json`
- `logs/current/review_load_breakdown.json`
- `logs/current/latest_signoff_summary.json`
- `logs/bundles/signoff/signoff-2026-03-09T12-14-35-783Z-3d047b/signoff_summary.json`
- `logs/bundles/signoff/signoff-2026-03-09T12-31-59-842Z-24dd95/conformance_report.json`
- `logs/bundles/signoff/signoff-2026-03-09T12-31-59-842Z-24dd95/operator_view_summary.json`
- `logs/archive/admin/log_deletion_report.json`
- `docs/CURRENT_ARCHITECTURE.md`
- `docs/HARNESS_LOGGING_MAP.md`
- `scripts/current_surface_truth_test.js`
- repository review bundle directory with the flat 20-file handoff

## Remaining Issues

None for the fixed goal.
