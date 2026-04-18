# Server Boundary Refactor Reviewer Evidence

Updated: 2026-04-13

## Scope

- Split the runtime family into explicit `overview` and `control` route/service surfaces.
- Removed duplicated overview/control/exec/eval route authority from `server_impl.js`; it now keeps a no-op legacy fallback hook instead of a second inline router.
- Added `server/services/runtime_state_service.js` and exposed authoritative `turnRuntime` / `turn_runtime` server truth in the runtime snapshot.
- Extracted `server/services/harness_overview_snapshot_service.js` so reviewer-facing harness overview assembly and its eval-history / execution-memory / topography helper cluster no longer live inline in `server_impl.js`.
- Extracted `server/services/traceability_service.js`, `server/services/current_surface_support.js`, and `server/services/current_log_surface_service.js` so the remaining governance/current-log adapters no longer live inline in `server_impl.js`.
- Reworked `web/01.HarnesUI/app.js` so pending/active-turn decisions prefer `turnRuntime` and use local `s.req` only as a short-lived bridge.
- Added `output/governance_public/reviewer_start_here.json` and `.md` as the single reviewer-first surface that compresses top-level semantics into `task_verdict` and `program_readiness`.

## Reviewer-visible wins

- `server_impl.js` is materially thinner at the route-authority layer: the extracted request handler and route modules now own overview/control/exec/eval dispatch.
- `server_impl.js` is also thinner at the governance/support layer: reviewer-facing overview assembly, traceability, residual-semantics support, and current-log refresh assembly moved to explicit service modules, bringing the file down to `13,044` lines on the current branch.
- `server/routes/overview_routes.js` and `server/routes/control_routes.js` make read vs control surfaces independently inspectable.
- `server/services/runtime_state_service.js` makes the pending/active/terminal turn truth explicit instead of leaving the browser to infer it from local-only counters.
- `web/01.HarnesUI/app.js` no longer increments/decrements `c.pending` as source-of-truth during submit/finalize; browser state is now derived from `s.req` plus authoritative runtime snapshots.
- `output/governance_public/reviewer_start_here.json` now gives the reviewer one place to start:
  - `task_verdict` -> `output/governance_public/worker_decision_surface.json`
  - `program_readiness` -> `output/agi_readiness/goal_completion_status.json`
- `output/governance_public/reviewer_start_here.json` now exposes an explicit baseline refresh entrypoint beside the comparison aggregate:
  - `refreshCommand: npm run reviewer:baseline-comparison`
  - `reportArtifact: raw/relocated_top_level/baseline_comparison_report.json`
- `output/governance_public/reviewer_start_here.json` now surfaces the current exported comparison packet directly (`sampleCount: 5`, `matchedSampleCount: 5`, `coverageGapCount: 0`).
- `docs/SERVER_ARCHITECTURE_MAP.md` now reflects the actual split: `runtime_routes.js` is gone, overview/control are separate, and the remaining debt is dependency concentration rather than duplicate route authority.
- `logs/current/latest_signoff_summary.json`, `output/governance_public/latest_signoff_summary.json`, and the flat `submission_manifest.json` now point at the same passing bundle instead of drifting between old and new signoff roots.
- `output/governance_public/worker_completion_status.json` now keeps a single canonical aligned background session id when public export is intentionally signoff-scoped.

## Visual evidence

- Screenshot: `output/playwright/reviewer-overview-2026-04-13.png`
- Capture source: `http://127.0.0.1:57525/01.HarnesUI/overview.html`
- What the screenshot proves:
  - the reviewer-facing overview surface still renders on the refactored server
  - the governed shell remains non-generic after the overview snapshot service extraction
  - the navigation and hero surface still load from the live branch after the latest split

## Evidence run

- `node scripts/harness_overview_test.js`
- `node scripts/single_harness_multi_plane_test.js`
- `node scripts/harnesui_pending_state_test.js`
- `node scripts/governance_bundle_test.js`
- `node scripts/worker_completion_status_test.js`
- `node scripts/export_submission_artifacts_test.js`
- `node scripts/process_invocation_test.js`
- `node scripts/traceability_service_split_test.js`
- `node scripts/harness_overview_snapshot_service_split_test.js`
- `node scripts/current_surface_service_split_test.js`
- `node scripts/current_log_surface_service_split_test.js`
- `npm run reviewer:baseline-comparison`
- `npm run test:repo-quality`
- `npm run test:repo-quality:governance`
- `npm run test:repo-quality:runtime`
- `npm run test:repo-quality:surfaces`
- `node -e "require('./scripts/lib/governance_public_bundle').exportGovernancePublicBundle()"`
- `node scripts/export_submission_artifacts.js`

## Result

- Targeted baseline checks and the full `npm run test:repo-quality` gate passed on 2026-04-13.
- The main reviewer concern about duplicate route authority is materially reduced: extracted route modules now own the public dispatch surface and `server_impl.js` no longer mirrors those conditionals inline.
- The main reviewer concern about `server_impl.js` still reading like a reviewer-surface monolith is materially reduced: harness overview payload assembly now lives in `server/services/harness_overview_snapshot_service.js` instead of as a dense helper cluster inside the implementation root.
- The main reviewer concern about browser/runtime split-brain is materially reduced: `turnRuntime` is now the server-side truth surface, and the browser only bridges short-lived pending rows until the authoritative turn snapshot arrives.
- The main reviewer concern about semantics weight is materially reduced: `reviewer_start_here.json` compresses the public reading order into two verdict faces instead of forcing the reviewer to infer that mapping from multiple files.
- The main reviewer concern about external comparison entry friction is materially reduced: the reviewer-first surface now exposes a reviewer-named refresh command instead of requiring the reviewer to infer which generator/test pair updates the packet.
- The main reviewer concern about freshness drift is materially reduced: current-pointer, public export, and flat submission export now converge on the same 2026-04-12 signoff bundle.
- The main reviewer concern about env-noise semantics is materially reduced: `output/playwright` is classified as `ENV_BLOCKED` in the surfaces manifest instead of causing a false gate failure.
- The live harness app-server client and the smoke spawn path no longer depend on a `shell: true` path for Windows Codex app-server execution.
- The repo-quality quality gate is now boring again on the current branch: governance, runtime, and surfaces all pass through the same stage runner, and the full `test:repo-quality` entrypoint also passes end-to-end.

## Residual debt

- `server_impl.js` is still too large as a dependency root; route authority is thinner, but helper injection is still broad.
- `scripts/run_repo_quality_gate.js` is still serial.
- `output/playwright` still hits `EPERM` during housekeeping and is classified as `ENV_BLOCKED`; it no longer fails the gate, but the host-level lock noise still exists.
