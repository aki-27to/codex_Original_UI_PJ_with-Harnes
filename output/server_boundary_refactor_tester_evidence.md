# Server Boundary Refactor Tester Evidence

Updated: 2026-04-13

## Dedicated checks run

- `node scripts/harness_overview_test.js`
- `node scripts/single_harness_multi_plane_test.js`
- `node scripts/harnesui_pending_state_test.js`
- `node scripts/governance_bundle_test.js`
- `node scripts/traceability_service_split_test.js`
- `node scripts/harness_overview_snapshot_service_split_test.js`
- `node scripts/current_surface_service_split_test.js`
- `node scripts/current_log_surface_service_split_test.js`
- `npm run test:repo-quality`
- `npm run test:repo-quality:governance`
- `npm run test:repo-quality:runtime`
- `npm run test:repo-quality:surfaces`
- `npm run reviewer:baseline-comparison`

## What those checks cover

- `single_harness_multi_plane_test.js`
  - primary routes still resolve to `POST /api/exec` and `POST /api/eval/run`
  - exec surface remains isolated from protected eval markers
  - public governance export still preserves worker-decision vs program-readiness separation
- `harnesui_pending_state_test.js`
  - browser pending logic now prefers authoritative `turnRuntime`
  - stale top-level runtime fields do not keep chats pending once `turnRuntime` says the server is idle
  - orphaned local pending rows are reclaimed from server-idle truth, not from browser-only counters
- `governance_bundle_test.js`
  - `reviewer_start_here.json` and `.md` are emitted as derived public artifacts
  - the reviewer-start surface exposes exactly two decision faces: `task_verdict` and `program_readiness`
  - the reviewer-start surface exposes the explicit baseline refresh entrypoint `npm run reviewer:baseline-comparison`
  - the reviewer-start surface carries the current exported comparison packet with `sampleCount: 5` and `coverageGapCount: 0`
- `traceability_service_split_test.js`
  - `server_impl.js` no longer owns inline planning traceability / post-lock drift builders
  - `server/services/traceability_service.js` is now the reviewer-visible owner of those governance adapters
- `harness_overview_snapshot_service_split_test.js`
  - `server_impl.js` no longer owns inline harness overview payload assembly or the eval-history / execution-memory / topography overview helper cluster
  - `server/services/harness_overview_snapshot_service.js` now owns that reviewer-facing surface assembly
- `current_log_surface_service_split_test.js`
  - `server_impl.js` no longer writes `logs/current/*` artifacts inline
  - `server/services/current_log_surface_service.js` now owns current-log refresh assembly and refresh-result packaging
- `harness_overview_test.js`
  - overview route registration is now validated through `server/request_handler.js` + `server/routes/overview_routes.js`, matching the post-split architecture
- `worker_completion_status_test.js`
  - explicit aligned export-session ids stay canonical instead of being contaminated by stale background sidecar ids
- `export_submission_artifacts_test.js`
  - flat submission export follows `logs/current/latest_signoff_summary.json`
  - exported `operator__latest_signoff_summary.json` stays aligned with `submission_manifest.json`
- `process_invocation_test.js`
  - Windows package-script execution now routes through explicit `cmd.exe /d /s /c ...` invocation instead of a `shell:true` path

## Visual artifact

- Screenshot: `output/playwright/reviewer-overview-2026-04-13.png`
- Capture source: `http://127.0.0.1:57525/01.HarnesUI/overview.html`

## Result

- Targeted baseline checks and the full `npm run test:repo-quality` gate passed on 2026-04-13.
- The UI pending-state tests now verify the intended server-truth model instead of the older browser-counter model.
- The public governance export now includes a compact reviewer-first surface without breaking the existing worker/public bundle artifacts.
- The public worker-completion companion now stays self-consistent under aligned public-export context.
- The reviewer-first surface now exposes a reviewer-named baseline comparison refresh command, so the comparison packet has a reviewer-visible entrypoint instead of a hidden generator/test pair.
- The implementation root is measurably smaller, and the latest reduction came from moving reviewer-facing harness overview assembly into `server/services/harness_overview_snapshot_service.js`, but the split still stops short of a small composition root.
- The repo-quality runner now accepts the branch end-to-end: governance, runtime, and surfaces all pass under the shared stage runner and via the top-level `test:repo-quality` entrypoint.

## Remaining truth

- These tests prove the new route/service boundaries, server-truth pending projection, and reviewer-start surface. They do not prove that `server_impl.js` has already been reduced to a small composition root.
- `scripts/run_repo_quality_gate.js` is the canonical source of stage membership and still executes serially.
- `output/playwright` still produces host-level `EPERM` during housekeeping and is only tolerated because the surface policy classifies it as `ENV_BLOCKED`.
