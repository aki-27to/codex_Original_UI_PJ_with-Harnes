# CURRENT_ARCHITECTURE

Updated: 2026-03-08

## 1) Purpose

This document is the active architecture spec for the Codex App Server integration harness.
- Current-state architecture belongs here.
- Historical implementation logs belong in `docs/ARCHITECTURE_CHANGELOG.md`.

## 2) Active Execution Path

- Interactive execution stays on standard Codex through `POST /api/exec`.
- The UI is local-first and defaults to port `57525`.
- An invalid non-numeric `CODEX_UI_PORT` falls back to `57525` before `UI_URL` is built.
- `default` is the default exec agent and the canonical collaboration-first parent entrypoint for end-to-end tasks.
- `start_codex_ui.bat` applies safer Windows launcher defaults only when env vars are unset:
  - `CODEX_EXECUTION_PROFILE=full-runtime`
  - `CODEX_REQUEST_USER_INPUT_POLICY=blocked`
  - `CODEX_PARENT_DISPATCH_GUARD_MODE=enforce`
  - `CODEX_PARENT_DISPATCH_GUARD_MAX_RETRIES=1`
- `start_codex_ui.bat` also enables turn-complete Git automation by default:
  - `CODEX_GIT_AUTOCOMMIT_ENABLED=1`
  - `CODEX_GIT_AUTOPUSH_ENABLED=1`
  - `CODEX_GIT_ALLOW_DIRTY_BASELINE=0`
  - `CODEX_GIT_REMOTE=origin`
- `server.js` now infers the non-interactive `request-user-input` fallback as `blocked` when `CODEX_REQUEST_USER_INPUT_POLICY` is unset.
- `server.js` owns HTTP APIs, app-server protocol handling, evidence capture, replay, eval, and SLO surfaces.
- Turn-complete Git automation ignores harness runtime metadata files such as `logs/harness_execution_memory.json` and `logs/eval_runs.jsonl` when the target repo is this workspace, so operator-memory persistence alone does not trigger an automated publish.
- `web/` owns the browser UI and uses the standard exec/runtime APIs.
- `archive/` now holds legacy docs, example sites, installer drops, and manual render outputs that are not part of the active runtime surface.
- `GET /english-conversation-app/*` now preserves the existing same-origin route while resolving static files in this priority order:
  - `CODEX_ENGLISH_CONVERSATION_APP_ROOT`
  - sibling repo `../english-conversation-app/`
  - bundled fallback `web/english-conversation-app/`
- `start_english_conversation_app.bat` primes `CODEX_ENGLISH_CONVERSATION_APP_ROOT` to the sibling repo when `..\english-conversation-app\index.html` exists and the env var is unset.
- `bootstrap_english_conversation_app_repo.bat` / `scripts/bootstrap_english_conversation_app_repo.ps1` can seed the sibling repo from the bundled static app when splitting it out for the first time.
- `web/01.HarnesUI/overview.html` is a dedicated operator overview page that aggregates runtime posture, topology, contracts, evidence bundles, replay/eval summaries, and skill coverage without mixing that inventory into the execution console.
- The floating Agent Topography Monitor now renders only agents that are relevant to the active chat, using that chat's current scoped parent, local trace/pending state, harness events, and matching runtime thread metadata.

## 3) Collaboration-First Agent Topology

- Parent roles:
  - `default`
    - only general-purpose parent role
    - config posture: `sandbox_mode = "workspace-write"`, `approval_policy = "never"`
    - owns end-to-end orchestration, specialist delegation, and final doc sync
  - `intake`
    - Step 1/2-only parent planner
    - config posture: `sandbox_mode = "read-only"`, `approval_policy = "never"`
    - locks baseline/over-delivery contract and dispatch criteria, then hands off
  - `release_manager`
    - Step 4/5-only parent gate
    - config posture: `sandbox_mode = "read-only"`, `approval_policy = "never"`
    - reviews child evidence, verifies doc sync, and decides PASS/FAIL/BLOCKED
- Specialist child roles:
  - `frontend_worker`
  - `backend_worker`
  - `infra_worker`
  - `tester`
  - `reviewer`
  - `explorer`
- Collaboration rule:
  - implementation work routes to child specialists instead of parent direct execution
  - `intake` and `release_manager` are focused parent overlays, not interchangeable default parents
  - unresolved user decisions must surface as `NEEDS_INPUT`/`BLOCKED`; parent roles must not auto-answer approval-boundary questions
- Retired runtime role:
  - `worker`
  - no longer configured in `.codex/config.toml` and must not appear in normal dispatch plans
  - `POST /api/exec` rejects `worker` and scoped aliases such as `worker@chat-legacy` as unconfigured runtime targets
  - retained only as a legacy governance contract artifact for bounded compatibility audits and explicit parent-override interpretation

## 4) Machine-Readable Contracts

- Agent governance:
  - `scripts/config/agent_governance_contracts.json`
  - defines parent agents, scope paths, read-only and verification-only roles, plus legacy `worker` audit gating
- Turn lifecycle:
  - `scripts/config/harness_contract_spec.json`
  - defines `in_progress -> completed|interrupted|failed`, terminal event `turn/completed`, and turn-to-task-outcome bridge rules
- Task outcome taxonomy:
  - `scripts/config/task_outcome_contract.json`
  - defines `COMPLETED`, `BLOCKED`, `NEEDS_INPUT`, `FAILED_VALIDATION`, `PARTIAL`

## 5) Runtime Surfaces

- Static UI routes:
  - `/01.HarnesUI/*`
    - always served from bundled `web/01.HarnesUI/`
  - `/english-conversation-app/*`
    - served from external sibling/override root when present, otherwise bundled fallback
    - keeps the existing same-origin browser path so conversation/TTS APIs do not need CORS or alternate ports
- `GET /api/runtime`
  - runtime snapshot, latest turn, governance policy, turn contract, task outcome contract, eval/replay/SLO capability summary
  - includes `gitAutomation` with config posture and latest turn-level auto-commit/autopush result
  - includes `staticApps.englishConversationApp` with mount source/root summary for the current English Conversation App static root
- `GET /api/harness/overview`
  - aggregated operator snapshot for `web/01.HarnesUI/overview.html`
  - combines runtime posture, full agent topology, contract snapshots, latest proof/signoff bundles, recent eval history, replay memory, execution-memory summaries, and skill-portfolio audit output
  - overview UI distinguishes the currently active runtime agent from the explicitly reported default exec agent, so retired or scoped runtime focus does not get mislabeled as the canonical parent entrypoint
  - redacts the live control API token before exposing the overview payload to the operator page
  - selects proof/signoff bundles by bundle `generatedAt` timestamp, with filesystem mtime used only as a fallback
- `POST /api/exec`
  - authenticated JSON exec endpoint with NDJSON streaming turn events
  - defaults to `default` unless the request selects another configured role
  - rejects unconfigured agent targets such as retired `worker` and `worker@...` scoped aliases
  - idempotency key may be supplied by header or body, but header/body mismatch is rejected with `400` before a claim is created
  - duplicate idempotency reuse with the same key but a mismatched effective request hash returns `409` (`idempotency_request_hash_mismatch`)
  - duplicate in-flight idempotency claims return `409`; resolved duplicates return the stored outcome snapshot with `200`
  - carries request-scoped runtime posture such as sandbox, approval, and request-user-input settings
  - collab-agent stream items now include `child=<agent>` hints when the dispatch target can be resolved, so the UI can attribute specialist activity to the active chat's monitor lane
- `GET /api/exec/idempotency/:key`
  - returns the current idempotency lifecycle snapshot for a claimed exec request
  - exposes `running`, terminal states, and `released` when a claim was closed before a terminal outcome was recorded
- `GET /api/eval/suites`
- `GET /api/eval/history`
- `POST /api/eval/run`
  - accepts opt-in eval probe persistence via `persistProbeResultsToMemory` or legacy alias `persistProbeResults`
  - when enabled, synthetic probe outcomes are appended into harness execution memory through `persistProbeResultsToMemory` / `persistProbeResults`
- `GET /api/replay/turns`
- `GET /api/replay/turn/:turnId`
- `POST /api/replay/turn`
- `GET /api/slo/status`
- `GET /api/conversation/runtime`
- `POST /api/conversation/direct`

## 6) Evidence and Persistence

- Turn artifacts are written under `logs/turns/` with `manifest.json` plus events/items/diff/stdout/stderr artifacts.
- The turn artifact manifest now records:
  - terminal turn status
  - terminal task outcome status and reason
  - turn/task-outcome bridge validation surface through the runtime contracts
  - approval audit records
  - execution observed signals
- Parent-turn observed file signals can aggregate child `Owned paths:` reports from completed collab calls, so natural multi-agent traces preserve implementation-side changed-path samples.
- `natural_task_trace_summary.json` records the selected implementation-bearing turn id and thread id, so signoff bundles stay anchored to the delegated turn even when later completions share the thread.
- `scripts/generate_signoff_evidence.js` resolves the natural-task proof turn from persisted execution memory on the shared thread, so post-completion adversarial retries do not replace the implementation-bearing trace.
- Harness memory is stored in `logs/harness_execution_memory.json` by default and can be redirected with `CODEX_HARNESS_MEMORY_PATH`.
- Eval run history is stored in `logs/eval_runs.jsonl` by default and can be redirected with `CODEX_EVAL_HISTORY_PATH`.
- Replay memory, idempotency snapshots, and latest turn snapshots carry `taskOutcomeStatus` and `taskOutcomeReason`.
- Latest turn snapshots now also carry `cwd` and a summarized `git_automation` result when turn-complete Git automation runs.
- When the target repo is this harness repo, Git automation ignores harness-managed runtime files such as `logs/harness_execution_memory.json` and `logs/eval_runs.jsonl` so those files do not block the next clean-baseline publish.
- Idempotency snapshots also retain request metadata, lifecycle status, and response-close disposition for duplicate/replay inspection.
- `POST /api/eval/run` probe cases can now persist synthetic execution-memory records when `persistProbeResultsToMemory` or `persistProbeResults` is enabled.
- `scripts/generate_runtime_proof.js` is the isolated proof generator for this capability. Its verified proof bundle shape is:
  - `logs/proofs/runtime-proof-*/harness_execution_memory.json`
  - `logs/proofs/runtime-proof-*/eval_runs.jsonl`
  - `logs/proofs/runtime-proof-*/turns/` via `CODEX_TURN_ARTIFACTS_DIR`
  - `logs/proofs/runtime-proof-*/runtime_proof_summary.json`
  - live dispatch proof file: `logs/proofs/runtime-proof-*/live_dispatch_proof.md`
- `scripts/generate_signoff_evidence.js` is the isolated signoff evidence generator for final-safe proof runs. It launches with:
  - `CODEX_REQUEST_USER_INPUT_POLICY=blocked`
  - `CODEX_PARENT_DISPATCH_GUARD_MODE=enforce`
  - `CODEX_PARENT_DISPATCH_GUARD_MAX_RETRIES=1`
  - `CODEX_REQUIREMENT_GUARD_ENABLED=1`
  - `CODEX_REQUIREMENT_LOCK_ENABLED=1`
  - `CODEX_REQUIREMENT_RBJ_ENABLED=1`
  - `CODEX_ADVERSARIAL_SHADOW_ENABLED=1`
  - `CODEX_ADVERSARIAL_LOOP_ENABLED=1`
- Its bundle shape is:
  - `logs/signoff-bundles/signoff-*/runtime_snapshot.json`
  - `logs/signoff-bundles/signoff-*/core_harness_workflow_run.json`
  - `logs/signoff-bundles/signoff-*/natural_task_trace_summary.json`
  - `logs/signoff-bundles/signoff-*/harness_execution_memory.json`
  - `logs/signoff-bundles/signoff-*/eval_runs.jsonl`
  - `logs/signoff-bundles/signoff-*/turns/`
  - `logs/signoff-bundles/signoff-*/signoff_summary.json`

## 7) Current Completion Gates

- `server.js` or `scripts/` changes:
  - run `node scripts/app_server_smoke_test.js`
  - run `node scripts/git_automation_policy_test.js` when the change touches turn-complete Git automation
- English Conversation App static-mount changes:
  - run `node scripts/external_english_conversation_app_mount_test.js`
- Skill assignment or skill package changes:
  - run `node scripts/skill_portfolio_audit.js`
- Eval / workflow policy changes:
  - run `node scripts/eval_replay_api_smoke_test.js`
- Governance/runtime posture changes in `.codex/` or parent-role docs:
  - verify parent role config posture and role-boundary wording stay aligned across `.codex/config.toml`, `.codex/agents/*.toml`, and `docs/AGENT_OPERATING_RULES.md`
- Spec sync before `COMPLETED`:
  - update this file
  - append a matching entry to `docs/ARCHITECTURE_CHANGELOG.md`

## 8) Current Residual Risks

- Request-user-input posture is enforced primarily through runtime request metadata and governance docs; there is no separately documented per-agent `config.toml` key for that posture today.
- The server-level inferred non-interactive request-user-input default is now `blocked`, and the launcher matches that posture, so flows that intentionally rely on `auto-default` or `auto-empty` must opt in explicitly via env override.
- Context and evidence discipline are stronger, but context/memory promotion is still not fully machine-enforced.
- The legacy `worker` contract still exists for compatibility interpretation, even though runtime selection now rejects it.
- Default eval coverage is now workflow-aware, but broader scenario depth is still limited by the small baseline suite.
- The external English Conversation App priority is resolved at request time; operators still need to ensure the sibling repo contents themselves stay compatible with the harness APIs.
- Some lower-tier operator documents remain mixed-language.
