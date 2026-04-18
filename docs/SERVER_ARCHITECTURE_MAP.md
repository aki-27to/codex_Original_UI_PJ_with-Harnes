# SERVER_ARCHITECTURE_MAP

Updated: 2026-04-13

## 1. Purpose

This refactor is not a feature add. The goal is to make the governed harness easier to trust by separating
the server composition root, request-family boundaries, and startup lifecycle without changing the public
surface or fail-closed posture.

The public contract remains fixed:

- default port: `57525`
- primary execution route: `POST /api/exec`
- primary evaluation route: `POST /api/eval/run`
- legacy local orchestration: `/api/batch/*`
- runtime/public surfaces: `logs/current/`, `output/`, `runtime/`, `output/governance_public/*`
- task outcome taxonomy: `COMPLETED`, `BLOCKED`, `NEEDS_INPUT`, `FAILED_VALIDATION`, `PARTIAL`

## 2. Before / After

| State | Structure | Reviewer cost |
| --- | --- | --- |
| Before | `server.js` directly mixed bootstrap, port binding, top-level route matching, app proxy/static handling, runtime endpoints, batch endpoints, exec/eval entrypoints, and export wiring. | High: central control flow existed, but the boundaries were hard to prove at a glance. |
| After | `server.js` is a compatibility entrypoint; route-family dispatch, route-service composition, request-handler context assembly, and startup lifecycle are split into dedicated modules while the existing service logic remains in `server_impl.js`. | Lower: a reviewer can now see the entrypoint, request composition, route-service composition, direct service surface, and bootstrap lifecycle separately, even though dependency concentration still remains upstream in `server_impl.js`. |
| Current boundary truth | Route-family boundaries are explicit, `server/route_services.js` now owns request-handler service composition, `server/request_handler_context.js` owns the request-context shape, `server/services/{overview_service,control_service,harness_app_service,conversation_service,replay_service,eval_service,exec_service,runtime_state_service,runtime_api_snapshot_service,harness_overview_snapshot_service,traceability_service,current_surface_service,current_surface_support,current_log_surface_service}.js` own the extracted surfaces, and `server_impl.js` no longer duplicates overview/control/exec/eval route authority, inline runtime-snapshot assembly, or current-log refresh / traceability helper clusters. `server_impl.js` still remains the implementation root for the rest of the server and for the deeper helper/dependency surface, so composition ownership moved but monolith debt did not disappear. | Lower: a reviewer can now prove the overview/control/app-bridge/replay/execution boundaries, the reviewer-facing overview assembly, the traceability adapters, and the current-log refresh path without paging through the whole monolith, while still seeing where the remaining dependency concentration lives. |

## 3. New Boundary Map

### `server.js`

- Thin compatibility entrypoint.
- Loads the implementation module.
- Preserves exported lifecycle helpers for in-process tests and tooling.
- Runs CLI startup only when invoked as the main script.

### `server_impl.js`

- Implementation root for the existing harness logic.
- Owns the large existing service layer and the remaining helper/dependency concentration.
- Assembles the route-service composition input, the request-handler context, and the bootstrap context.
- Publishes the server-runtime truth surface through `server/services/runtime_state_service.js`, which feeds `turnRuntime`.
- Delegates runtime API snapshot assembly and current-truth surface loading to `server/services/runtime_api_snapshot_service.js`.
- Delegates harness overview payload assembly, governed-memory overview sync, eval-history projection, execution-memory projection, and topography overview assembly to `server/services/harness_overview_snapshot_service.js`.
- Delegates planning traceability and post-lock drift assembly to `server/services/traceability_service.js`.
- Delegates current-log refresh assembly to `server/services/current_log_surface_service.js`.
- Delegates current-surface support helpers (bundle references, residual semantics, changed-path projection) to `server/services/current_surface_support.js`.
- Delegates Windows Codex app-server spawn target resolution to `scripts/lib/harness_app_runtime.js`, removing the remaining `shell:true` path from the live harness app-server client.
- Exports `__implementationPath` so tests can inspect the real implementation source while the runtime stays
  anchored on `server.js`.

### `server/route_services.js`

- Owns request-handler service composition for the extracted route families.
- Builds the grouped `routeServices` surface from the DI-based service factories.
- Keeps `server_impl.js` from directly importing and assembling each extracted route service inline.
- Improves reviewer visibility of the composition step, but it still receives a broad dependency bag from `server_impl.js`.

### `server/request_handler.js`

- Composition point for inbound HTTP requests.
- Applies top-level app proxy forwarding and app read-surface handling first.
- Builds the route list once and dispatches those routes against the grouped `ctx.services.*` service surface instead of per-route wrapper helpers.
- Dispatches route families in a visible order:
  1. runtime / overview / continuity / diagnostics
  2. batch
  3. app bridge mutations
  4. conversation mutations
  5. voice mutations
  6. replay
  7. eval
  8. exec
- Keeps a no-op legacy fallback hook for compatibility, but overview/control/exec/eval authority now lives in the extracted route modules rather than in duplicate `server_impl.js` conditionals.

### `server/request_handler_context.js`

- Owns the request-handler context shape that `server_impl.js` passes into `server/request_handler.js`.
- Keeps runtime helpers, batch/runtime-only callbacks, and the grouped `services` surface in one reviewer-visible contract.
- Preserves the live workspace-lock getter without leaving the whole context builder inline inside `server_impl.js`.

### `server/routes/overview_routes.js`

- Groups runtime-oriented read/overview routes:
  - `/api/intent/profile`
  - `/api/harness/overview`
  - `/api/conversation/runtime`
  - `/api/conversation/persona/memory`
  - `/api/agent-topography`
  - `/api/continuity/*`
  - `/api/diagnostics`
  - `/api/slo/status`

### `server/routes/control_routes.js`

- Groups runtime-oriented control/mutation routes:
  - `POST /api/intent/profile`
  - `POST /api/intent/profile/reset`
  - `POST /api/workspace/lock`
  - `POST /api/workspace/unlock`
  - `POST /api/requirement-guard/validate`
  - `POST /api/open-cmd`

### `server/routes/batch_routes.js`

- Isolates `/api/batch/status`, `/api/batch/run`, and `/api/batch/scheduler`.
- Keeps `/api/batch/*` as the only allowed legacy local orchestration surface.

### `server/routes/app_routes.js`

- Makes the harness app bridge explicit:
  - `POST /api/apps/:id/reply`
  - `POST /api/apps/:id/structured`
- Keeps the request handler free of ad hoc `/api/apps/*` branching while delegating to `server/services/harness_app_service.js`.

### `server/routes/conversation_routes.js`

- Makes the mutation side of the conversation family explicit:
  - `POST /api/conversation/direct`
  - `POST /api/conversation/persona/reset`
- Keeps the existing conversation runtime posture while delegating to `server/services/conversation_service.js`.

### `server/routes/voice_routes.js`

- Makes the local voice endpoints explicit:
  - `POST /api/voice/piper/prepare`
  - `POST /api/voice/piper`
  - `POST /api/voice/kokoro`
- Keeps the local-only speech helpers reviewer-visible while delegating to `server/services/conversation_service.js`.

### `server/routes/replay_routes.js`

- Makes the replay family explicit:
  - `GET /api/replay/turns`
  - `GET /api/replay/turn/:id`
  - `POST /api/replay/turn`
- Keeps replay inspection and replay execution out of the legacy request body while delegating to `server/services/replay_service.js`.

### `server/routes/eval_routes.js`

- Makes the evaluation route family explicit:
  - `GET /api/eval/suites`
  - `GET /api/eval/history`
  - `POST /api/eval/run`
- Keeps fail-closed evaluation behavior while delegating to `server/services/eval_service.js`.
- This is the route-family boundary that fronts the dedicated eval service boundary.

### `server/routes/exec_routes.js`

- Makes the execution route family explicit:
  - `GET /api/exec/idempotency/:key`
  - `POST /api/exec`
- Keeps the standard Codex execution route as the primary path.
- This is the route-family boundary that fronts the dedicated exec service boundary.

### `server/services/*`

- `server/services/harness_app_service.js` now owns the extracted `POST /api/apps/:id/reply` and `POST /api/apps/:id/structured` behavior.
- `server/services/conversation_service.js` now owns the extracted `POST /api/conversation/direct`, `POST /api/conversation/persona/reset`, `POST /api/voice/piper/prepare`, `POST /api/voice/piper`, and `POST /api/voice/kokoro` behavior.
- `server/services/overview_service.js` now owns the extracted `GET /api/harness/overview`, runtime summary, continuity, diagnostics, and SLO overview behavior.
- `server/services/control_service.js` now owns the extracted runtime control surface (`intent/profile`, workspace lock, requirement guard validation, `open-cmd`).
- `server/services/replay_service.js` now owns the primary `GET /api/replay/turns`, `GET /api/replay/turn/:id`, and `POST /api/replay/turn` behavior.
- `server/services/eval_service.js` now owns the primary `GET /api/eval/suites`, `GET /api/eval/history`, and `POST /api/eval/run` behavior.
- `server/services/exec_service.js` now owns the primary `GET /api/exec/idempotency/:key` and `POST /api/exec` behavior.
- `server/services/runtime_state_service.js` now owns the authoritative `turnRuntime` snapshot that the UI projects from for pending/active/terminal turn state.
- `server/services/runtime_api_snapshot_service.js` now owns runtime snapshot assembly, current-truth surface loading, and worker-decision-support projection for `/api/runtime`.
- `server/services/harness_overview_snapshot_service.js` now owns reviewer-facing harness overview payload assembly plus the eval-history / execution-memory / topography helper cluster that previously lived inline in `server_impl.js`.
- `server/services/traceability_service.js` now owns planning traceability assembly and post-lock drift snapshots, instead of leaving those governance adapters inline inside `server_impl.js`.
- `server/services/current_surface_service.js` now owns current-surface projection assembly for runtime snapshot, latest-run/signoff summaries, review-load summaries, design conformance, and operator-facing current-truth normalization.
- `server/services/current_surface_support.js` now owns the helper cluster that `current_surface_service.js` relies on for bundle references, operator-facing canonicalization, residual-risk normalization, and changed-path collection.
- `server/services/current_log_surface_service.js` now owns current-log refresh assembly and the exported refresh result payload, instead of leaving `server_impl.js` to write each `logs/current/*` artifact inline.
- `server/route_services.js` now assembles these services into one grouped route-service surface, while `server/request_handler_context.js` makes that direct route dependency explicit.
- The next hardening stage is not "introduce services" anymore; it is to reduce the helper/dependency surface that the composition root still injects into those services.

### `server/bootstrap.js`

- Owns startup and shutdown lifecycle:
  - stop / shutdown
  - fixed-port bind
  - existing-server probe
  - `refresh-current-logs-only` mode
  - broken-pipe guards
  - CLI startup wrapper

## 4. Route To Service Flow

1. `server.js` loads `server_impl.js`.
2. `server_impl.js` passes the server helper surface into `server/route_services.js`, which assembles the grouped route-service surface while still concentrating most helper ownership upstream.
3. `server_impl.js` passes that grouped surface through `server/request_handler_context.js` into `createRequestHandler(...)`.
4. `server/request_handler.js` handles app proxy/static preflight and routes the request into a family module.
5. Route-family modules validate inputs and delegate directly into the grouped service/runtime surface.
6. For `apps` / `conversation` / `voice` / `replay` / `exec` / `eval`, the visible route modules now hand off
   straight to `ctx.services.*`, which resolves to
   `server/services/harness_app_service.js`, `server/services/conversation_service.js`,
   `server/services/replay_service.js`, `server/services/exec_service.js`, and
   `server/services/eval_service.js`.
7. The request handler keeps the fallback hook compatibility-first, but the previously duplicated overview/control authority is now removed from `server_impl.js`; remaining debt is dependency concentration, not route duplication.
8. `server_impl.js` builds a bootstrap context and passes it into `createBootstrapApi(...)`.
9. `server/bootstrap.js` owns lifecycle behavior, while `server.js` remains the external bootstrap entrypoint.

## 5. Why This Raises Design Trust

- A reviewer can now inspect the composition chain without paging through the entire service implementation.
- Startup/shutdown concerns are no longer mixed into route handling.
- Overview, control, apps, conversation, voice, replay, and batch route families are readable as bounded modules instead of scattered conditionals.
- App bridge/replay and conversation/voice and exec/eval primary paths are now explicit at the route layer, in the dedicated route-service composition module, and in the service layer, without an extra `server_impl.js` wrapper hop for request-handler dispatch.
- Harness overview assembly, traceability, and current-log refresh are now inspectable as explicit service modules instead of as one-off helper clusters buried in the monolith.
- The docs now state the remaining truth directly: composition ownership moved, but dependency concentration still remains upstream in `server_impl.js`.
- The docs distinguish completed service extraction for `apps` / `conversation` / `voice` / `replay` / `exec` / `eval` from the still-pending decomposition of the wider implementation root, which keeps reviewer trust aligned with reality.
- The launcher stale-runtime detector now watches both `server/` and `server_impl.js`, so the runtime will not
  silently reuse an out-of-date implementation process.
- Tests that inspect server source can target the implementation file directly without forcing the public
  runtime entrypoint to stay monolithic.

## 6. Compatibility Kept Intentionally

- `server.js` remains the external runtime entrypoint for launchers, scripts, and manual startup.
- `/api/exec` and `/api/eval/run` remain the primary planes.
- `/api/batch/*` remains the only allowed legacy local orchestration family.
- `test:repo-quality:{governance,runtime,surfaces}` remain the package-visible stage entrypoints, but they are now thin aliases to `scripts/run_repo_quality_gate.js`, which owns the canonical stage membership.
- reviewer-visible server-boundary proof is package-visible too: `npm run reviewer:baseline-comparison` refreshes the comparison surface, `npm run reviewer:server-boundary-proof` regenerates the reviewer packet, and `npm run test:server-boundary-proof` reruns the dedicated boundary verification surface.
- Existing exports such as `startHarnessServer`, `stopHarnessServer`, `__riskAudit`, `__staticMount`,
  `__codexModes`, `__runtimeVisibility`, and `__topography` remain available.
- The legacy fallback hook remains for compatibility, but primary route authority is now owned by the extracted route modules rather than duplicated inline in `server_impl.js`.

## 7. Residual Decomposition Points

The server is materially more legible, but the refactor is intentionally staged. The highest-value next splits are:

1. Lift governance/evidence assembly adapters and shared helper clusters out of `server_impl.js` into focused server-side service/common modules so the new services stop depending on a giant injected surface.
2. Reduce the dependency bags passed into `server/route_services.js` and `server/services/*` so they stop importing broad helper pools from the implementation root.
3. Continue shrinking the dependency bags passed from `server_impl.js` into the extracted route services and runtime snapshot service, and collapse the remaining implementation root toward a composition root.
4. Keep reducing repo-quality process debt: the stage entrypoints are thinner now, but `scripts/run_repo_quality_gate.js` still executes each script serially through `spawnSync`, so the gate remains reviewer-visible operational debt.

These are follow-up refinements, not blockers for the current hardening step.
