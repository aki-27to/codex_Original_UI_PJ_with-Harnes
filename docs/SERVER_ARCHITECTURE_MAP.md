# SERVER_ARCHITECTURE_MAP

Updated: 2026-04-12

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
| After | `server.js` is a compatibility entrypoint; route-family dispatch and startup lifecycle are split into dedicated modules while the existing service logic remains in `server_impl.js`. | Lower: a reviewer can now see the entrypoint, request composition, route families, and bootstrap lifecycle separately. |
| Current boundary truth | Route-family boundaries are explicit and `server/services/{eval_service,exec_service}.js` now hold the primary `eval` / `exec` behavior. `server_impl.js` still remains the implementation root for the rest of the server and for the current dependency-injection surface. | Lower: a reviewer can now prove the primary `exec` / `eval` path without paging through the whole monolith, while still seeing where the remaining legacy concentration lives. |

## 3. New Boundary Map

### `server.js`

- Thin compatibility entrypoint.
- Loads the implementation module.
- Preserves exported lifecycle helpers for in-process tests and tooling.
- Runs CLI startup only when invoked as the main script.

### `server_impl.js`

- Implementation root for the existing harness logic.
- Owns the large existing service layer and compatibility fallbacks.
- Assembles the request-handler context and bootstrap context.
- Exports `__implementationPath` so tests can inspect the real implementation source while the runtime stays
  anchored on `server.js`.

### `server/request_handler.js`

- Composition point for inbound HTTP requests.
- Applies top-level app proxy forwarding and app read-surface handling first.
- Dispatches route families in a visible order:
  1. runtime / overview / continuity / diagnostics
  2. batch
  3. eval
  4. exec
- Falls back to legacy request handling for routes not yet extracted.

### `server/routes/runtime_routes.js`

- Groups runtime-oriented public and control routes:
  - `/api/intent/profile`
  - `/api/workspace/lock`
  - `/api/workspace/unlock`
  - `/api/harness/overview`
  - `/api/conversation/runtime`
  - `/api/conversation/persona/memory`
  - `/api/agent-topography`
  - `/api/continuity/*`
  - `/api/requirement-guard/validate`
  - `/api/diagnostics`
  - `/api/slo/status`

### `server/routes/batch_routes.js`

- Isolates `/api/batch/status`, `/api/batch/run`, and `/api/batch/scheduler`.
- Keeps `/api/batch/*` as the only allowed legacy local orchestration surface.

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

- `server/services/eval_service.js` now owns the primary `GET /api/eval/suites`, `GET /api/eval/history`, and `POST /api/eval/run` behavior.
- `server/services/exec_service.js` now owns the primary `GET /api/exec/idempotency/:key` and `POST /api/exec` behavior.
- `server_impl.js` assembles these services and keeps the shared helper pool plus the remaining legacy runtime/governance logic.
- The next hardening stage is not "introduce services" anymore; it is to reduce the dependency surface that `server_impl.js` still injects into those services.

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
2. `server_impl.js` builds a request context and passes it into `createRequestHandler(...)`.
3. `server/request_handler.js` handles app proxy/static preflight and routes the request into a family module.
4. Route-family modules validate inputs and delegate into the assembled service/runtime surface.
5. For `exec` / `eval`, the visible route modules hand off to `handleExecRequest(...)` /
   `handleEvalRunRequest(...)` in `server_impl.js`, and those functions now delegate into
   `server/services/exec_service.js` and `server/services/eval_service.js`.
6. Any still-unextracted route uses the legacy fallback path, so the refactor stays compatibility-first and
   fail-closed.
7. `server_impl.js` builds a bootstrap context and passes it into `createBootstrapApi(...)`.
8. `server/bootstrap.js` owns lifecycle behavior, while `server.js` remains the external bootstrap entrypoint.

## 5. Why This Raises Design Trust

- A reviewer can now inspect the composition root without paging through the entire service implementation.
- Startup/shutdown concerns are no longer mixed into route handling.
- Runtime and batch route families are readable as bounded modules instead of scattered conditionals.
- Exec and eval primary paths are now explicit at both the route layer and the service layer.
- The docs distinguish completed service extraction for `exec` / `eval` from the still-pending decomposition of the wider implementation root, which keeps reviewer trust aligned with reality.
- The launcher stale-runtime detector now watches both `server/` and `server_impl.js`, so the runtime will not
  silently reuse an out-of-date implementation process.
- Tests that inspect server source can target the implementation file directly without forcing the public
  runtime entrypoint to stay monolithic.

## 6. Compatibility Kept Intentionally

- `server.js` remains the external runtime entrypoint for launchers, scripts, and manual startup.
- `/api/exec` and `/api/eval/run` remain the primary planes.
- `/api/batch/*` remains the only allowed legacy local orchestration family.
- Existing exports such as `startHarnessServer`, `stopHarnessServer`, `__riskAudit`, `__staticMount`,
  `__codexModes`, `__runtimeVisibility`, and `__topography` remain available.
- Unextracted routes still resolve through the legacy fallback path instead of changing behavior silently.

## 7. Residual Decomposition Points

The server is materially more legible, but the refactor is intentionally staged. The highest-value next splits are:

1. Lift governance/evidence assembly adapters and shared helper clusters out of `server_impl.js` into focused server-side service/common modules so the new services stop depending on a giant injected surface.
2. Extract the request-handler context builder so the route modules and services depend on a smaller, typed surface.
3. Continue moving remaining legacy runtime/governance route families out of `server_impl.js` once their helper boundaries are explicit.

These are follow-up refinements, not blockers for the current hardening step.
