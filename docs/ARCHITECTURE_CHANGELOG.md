# SYSTEM_ARCHITECTURE

- 2026-04-07: Systemized whole-system coherence review as an enforceable gate instead of a discretionary review habit. Added `scripts/config/system_coherence_review_contract.json`, `scripts/lib/system_coherence_review_policy.js`, `scripts/system_coherence_review_test.js`, and `docs/SYSTEM_COHERENCE_REVIEW.md`; updated `package.json`, `docs/AGENT_OPERATING_RULES.md`, `docs/EVIDENCE_CONTRACT.md`, `scripts/config/evidence_contract.json`, `scripts/config/agent_governance_contracts.json`, and `scripts/config/task_outcome_contract.json` so core harness changes now require an explicit coherence audit across execution path, governance, machine contracts, server/runtime, eval-memory-lifecycle, and artifact-surface planes; and `server.js` plus task-outcome policy now treat missing that audit as `system_coherence_review_missing` / `FAILED_VALIDATION`.
- 2026-04-07: Closed a second output-surface drift found during repo inspection. `scripts/config/output_surface_policy.json` now routes ad hoc `output/note_article_*.md` drafts into `runtime/output-transient/note-articles/`, `.gitignore` treats those drafts as transient output noise, `scripts/organize_output_surface_test.js` covers the new routing rule, `scripts/repo_static_hygiene_test.js` now reads the machine-readable output-surface policy and fails whenever transient `output/` roots or files remain in place, and `docs/CURRENT_ARCHITECTURE.md`, `docs/OUTPUT_SURFACE_POLICY.md`, and `runtime/README.md` now document the stricter intentional-vs-transient split.
- 2026-04-07: Closed two local hygiene drifts found during repo inspection. `scripts/harness_contract_policy_test.js` no longer hard-codes `harness-turn-contract.v1` and now accepts the active versioned contract shape instead of failing on a harmless schema bump to `v2`. `scripts/organize_runtime_surface.js` now migrates root `share_*.html` browser-share captures into `runtime/shared-pages/`, `.gitignore` treats those captures as transient runtime noise, `scripts/repo_static_hygiene_test.js` now fails if they remain at the repo root, and `runtime/README.md` documents the runtime-only placement.
- 2026-04-06: Tightened governed ambiguity-strategy handling so ambiguity-resolution directives do not self-trigger the wrong gate. `scripts/lib/planning_mode_policy.js` now treats weak user-decision verbs (`clarify`, `confirm`, `choose`) as explicit human-input boundaries only when the surrounding line also carries a real approval or user-decision context, limits the governed single-question gate to prompts that explicitly request governed clarification, governed disambiguation, or governed deferral behavior, and honors explicit `bounded_assumption` directives as a strategy override instead of converting them into synthetic `NEEDS_INPUT`. Question extraction still skips imperative ambiguity-handling directives such as "resolve an ambiguous request" so they are not echoed back as synthetic open questions. Added regression coverage in `scripts/planning_mode_policy_test.js` and `scripts/requirement_guard_validator_test.js`, and updated the non-parent transform checks so the emitted planning mode matches the selected planning context instead of hard-coding a stale mode.

- 2026-04-07: Reduced static-review noise around the harness core. `docs/CURRENT_ARCHITECTURE.md` now keeps external workflow companions behind a dedicated boundary note and points the weekly-report inventory at `docs/WEEKLY_REPORT_COMPANION.md` instead of inlining Copilot/Power Automate detail into the core architecture spec. `HARNESS_MAP.md`, `.codex/config.toml`, and `.codex/agents/default.toml` now also make the owner-operated nature of the repo's hot default posture explicit.
- 2026-04-07: Added static repo-hygiene checks and request-guard extraction. `scripts/repo_static_hygiene_test.js` now fails when root-only noise such as `.npm-cache` or `node_modules` reappears or when `docs/CURRENT_ARCHITECTURE.md` drifts back into companion-specific detail, `package.json` now exposes `test:repo-hygiene:static`, and `.gitignore` now explicitly ignores `node_modules/`. `scripts/lib/http_request_guards.js` now owns pure request-header/content-type/idempotency/governance-override helpers, `server.js` imports them instead of carrying those definitions inline, and `scripts/http_request_guards_test.js` verifies the extracted behavior.
- 2026-04-05: Consolidated the shared AGI app platform into the harness repo `APP/` tree. `english-conversation-app`, `talkApp`, and `プレゼン上達AI` now live under `APP/01.english-conversation-app`, `APP/02.talkApp`, and `APP/03.プレゼン上達AI` respectively; the harness manifests/runtime now default to those integrated paths while preserving env override plus legacy external-clone compatibility; `server.js`, `README.md`, `web/01.HarnesUI/guide.html`, `docs/HARNESS_APP_PLATFORM.md`, and `docs/CURRENT_ARCHITECTURE.md` were synchronized to that topology; and smoke/build verification was rerun after the migration.
- 2026-04-04: Replaced fragmented memory handling with a governed canonical memory graph. Added machine-readable memory contracts under `scripts/config/memory_*.json`, added `scripts/lib/governed_memory_graph.js` plus `scripts/governed_memory_graph_test.js`, rooted canonical memory under `logs/archive/raw/runtime_state/memory/`, and added intentional memory projections under `output/memory/`. `server.js` now exposes `runtime.governedMemory`, `/api/harness/overview` now syncs and surfaces `memory.governedGraph`, turn finalization plus persisted eval probe results now also trigger canonical memory sync, and `web/01.HarnesUI/overview.*` now shows a dedicated Governed Memory Graph card while legacy OpenAI/Anthropic learning artifacts remain compatibility projections.
- 2026-04-04: Finished the low-risk governed-memory hardening pass without changing `/api/exec` prompt behavior. Compiled memory packs now honor `defaultPackBudget`, per-section budgets, and minimum/high-confidence score thresholds from `scripts/config/memory_retrieval_policy.json`; canonical events now emit schema-aligned `memory_item_upsert` / `memory_pack_compiled` records with `memoryType`, `sourceTier`, and `authorityTier`; governed-memory retention now prunes event/pack history per `scripts/config/memory_retention_policy.json`; and the runtime/overview surface now exposes stale-memory warnings plus recent promotions/revocations while preserving the older summary fields.
- 2026-04-04: Added a repo-safe governed-memory export surface. `scripts/config/memory_public_export_policy.json`, `scripts/export_governed_memory_public.js`, `scripts/export_governed_memory_public_sample.js`, and `scripts/governed_memory_public_export_test.js` now generate/redact `output/memory_public/` as a public/sample projection separate from local `output/memory/`. The exported surface includes redacted workspace-progress, latest-pack, promotion/revocation health, a public-safe `memory_eval_suite.json` PASS artifact, and OpenAI/Anthropic lane projections derived from the canonical graph plus legacy compatibility state. `output/memory/` remains the live local operator projection and is no longer the checked-in public evidence surface.
- 2026-04-04: Split generated output into intentional artifacts versus regenerable transient material. Added `scripts/config/output_surface_policy.json` as the machine-readable taxonomy, `scripts/organize_output_surface.js` plus `scripts/organize_output_surface_test.js` as the housekeeping and regression surface, `docs/OUTPUT_SURFACE_POLICY.md` as the operator-facing rulebook, and package scripts for `housekeeping:output-surface` / `housekeeping:surfaces`. `output/playwright`, `output/appserver_tui_demo_home`, top-level `phase2-long-horizon-*.json`, top-level `phase3-lifecycle-*.json`, and `output/tmp_harnesui_retry_bootstrap.js` are now treated as regenerable transient output that belongs under `runtime/output-transient/` with retention, while named program/report artifacts remain in `output/`.
- 2026-04-04: Closed the remaining operator-surface wording drift around request-user-input posture and English Conversation App topology. `README.md` and `HARNESS_MAP.md` now match the actual launcher/runtime default (`CODEX_REQUEST_USER_INPUT_POLICY=auto-default`) instead of implying blocked-by-default live turns, `web/01.HarnesUI/guide.html` now distinguishes the autonomy-first live default from strict blocked lanes (`conversation`, `proof`, `repro`), and the guide/README English Conversation App copy now states the real topology: same-origin path by default plus an optional standalone launcher on `127.0.0.1:57526` that proxies conversation/TTS APIs back to the main harness on `127.0.0.1:57525`. `docs/CURRENT_ARCHITECTURE.md` and `docs/AGI_V1_EVAL_FRAMEWORK.md` now also spell out that these narrative docs stay subordinate to runtime proof, and the existing docs drift test (`npm run test:docs:drift`) is part of the fresh proof path for this surface.
- 2026-04-04: Reframed the repo front door so top-level materials describe the harness as a governed decision system rather than only a local Web + CLI wrapper. `README.md` now foregrounds the fixed standard routes (`POST /api/exec`, `POST /api/eval/run`, existing `/api/batch/*`), machine-readable contracts, evidence-first release judgment, extension-only `agi_v1` evaluation, and the no-parallel-harness rule. `package.json` description/keywords, `HARNESS_MAP.md`, `docs/CURRENT_ARCHITECTURE.md`, `web/01.HarnesUI/guide.html`, and `web/01.HarnesUI/overview.html` were synchronized to the same posture.
- 2026-04-04: Extended that same front-door reframing into the static/operator web surfaces. `web/01.HarnesUI/guide.html` now explains the harness as a governed standard-route system with evidence and release judgment rather than a generic Codex UI, and `web/01.HarnesUI/overview.html` now labels itself as the operator map for standard routes, governance posture, and release truth instead of generic control-plane telemetry. `docs/CURRENT_ARCHITECTURE.md` was updated to reflect that UI entry posture.
- 2026-04-03: Hardened HarnesUI and the launcher against repeated local `network error` failures during `/api/exec`. `start_codex_ui.bat` now defaults to reusing an already-running harness instead of force-restarting it, refuses explicit restart while active `/api/exec` work is in progress unless `CODEX_FORCE_ACTIVE_RESTART=1` is set, and keeps the browser-open path compatible with that reuse mode. `server.js` now exposes `serverProcess.activeExecRequests` / `restartProtection` plus `appServerTransport` on `/api/runtime`, and it ignores broken-pipe-like process-level `EPIPE` faults instead of killing the whole harness. `web/01.HarnesUI/app.js` now recovers post-open stream disconnects through `/api/exec/idempotency/:key` and `/api/replay/turn/:turnId` when persisted turn state is available, so browser-visible disconnects no longer collapse immediately into an unrecoverable final send error.
- 2026-04-03: Reframed governance around autonomy-first execution instead of approval-boundary-first stopping. `AGENTS.md`, `docs/HARNESS_CONSTITUTION.md`, and `docs/AGENT_OPERATING_RULES.md` now treat human intervention as a narrow escalation path rather than a constitutional default, `scripts/lib/planning_mode_policy.js` and `scripts/lib/discovery_needs_input_policy.js` now keep `approvalBoundaryItems` as audit metadata without automatically forcing `DISCOVERY`/`NEEDS_INPUT`, `scripts/config/autonomy_risk_policy.json` and `scripts/config/approval_matrix.json` now reserve mandatory operator approval for critical irreversible external effects, and `scripts/config/agi_improvement_flywheel.json` plus the launcher/runtime default request-user-input posture now favor continuous autonomous improvement over blocked-by-default clarification loops. Follow-up runtime fixes also aligned turn-readiness, conformance invariants, and current-surface design checks so the normal live posture must remain autonomy-first while signoff bundles can still prove a deliberately blocked strict lane.
- 2026-04-03: Added a manual self-improvement capture lane for non-governed turns without changing runtime behavior. `scripts/config/manual_self_improvement_capture_policy.json` now points at `output/manual_self_improvement/latest.json`, defines the lane as compressed `latest_only`, non-constitutional, and proposal-first by default, `package.json` now exposes `npm run learn:self-improvement:manual:validate`, and the self-improvement/context architecture docs now distinguish this manual capture surface from the governed auto-learning + eval-gated promotion lanes.
- 2026-04-03: Fixed the harness-side English conversation execution lane so `conversation-app-server` no longer trips parent-dispatch retries for short spoken turns. `scripts/lib/parent_dispatch_guard_policy.js` now exempts that profile from the parent-dispatch guard, `server.js` now runs `/api/conversation/direct` with explicit `requestUserInputPolicy=blocked` plus a conversation-specific low reasoning-effort override, and `/api/conversation/runtime` now exposes that posture so the standalone app no longer leaks `Internal retry requirement...` prompts or stalls behind unnecessary specialist delegation.
- 2026-04-02: Split the sibling English conversation app launch path from the main harness lifecycle. `../english-conversation-app/start_english_conversation_app.bat` now starts `standalone_server.js` on `127.0.0.1:57526` instead of delegating to `start_codex_ui.bat`, the standalone server proxies only `/api/conversation/*` and `/api/voice/*` to the harness backend on `127.0.0.1:57525`, and the app UI now surfaces harness-backend-offline status explicitly so launching the English app no longer restarts the harness or interrupts active HarnesUI `/api/exec` sessions.
- 2026-04-03: Fixed the standalone English conversation proxy so proxied mutation requests (`/api/conversation/*`, `/api/voice/*`) now rewrite `Origin` / `Referer` to the harness origin before forwarding to `127.0.0.1:57525`. This preserves the harness same-port local-origin guard while allowing the separated app on `127.0.0.1:57526` to send conversation and voice POST requests successfully.
- 2026-04-03: Raised the standalone English conversation proxy timeout budget for `/api/conversation/direct`, `/api/voice/piper`, and `/api/voice/kokoro` so the proxy no longer reports `HARNESS_BACKEND_UNAVAILABLE` just because the English conversation turn legitimately takes longer than the previous 15 second upstream timeout.
- 2026-04-02: Reworked `web/01.HarnesUI` around AGI-oriented operator flow instead of telemetry-first layout. The main console now surfaces a `Mission Brief` (`Goal / Scope / Constraints / Done When`), keeps live execution context chips above the composer, updates those summaries from the draft prompt and runtime settings in real time, replaces scoped runtime ids with operator-facing agent labels across the main UI, and compresses mobile simple-view so the mission/composer path stays above the fold.
- 2026-04-02: Reworked `web/01.HarnesUI/overview.html` into a posture-first operator map. Runtime and Evidence remain expanded by default, deeper inventory sections move behind collapsible shells, the raw snapshot is closed by default, and the overview refresh-state surface no longer depends on mojibake-prone status strings.
- 2026-04-01: Added internal/private governance reporting on top of the existing externalization closure without changing any public-claim gate. `scripts/config/claim_closure_gate_policy.json` now defines `internalPrivateGovernance`, and `scripts/lib/externalization_nohitl_runtime.js` now emits `privateOperatorLoopState`, `privateOperatorLoop`, and explicit human-baseline roles so owner-operated deployments can treat human comparison as calibration-only internally while keeping public evidence requirements unchanged.
- 2026-03-31: Added Final Externalization & No-HITL closure on top of Phase 11-17 without introducing a new execution route. New configs `scripts/config/non_interactive_execution_profile.json`, `scripts/config/no_hitl_blocked_reason_taxonomy.json`, and `scripts/config/deployment_evidence_policy.json` define non-interactive posture, structured blocked reasons, and production-like evidence thresholds. `scripts/lib/externalization_nohitl_runtime.js` plus `scripts/run_externalization_nohitl.js` now export/import human baseline evidence, sealed audit packs, and deployment evidence, then recompute a stricter claim gap that excludes synthetic/mock fixtures from public-claim math.
- 2026-03-31: Added `scripts/externalization_nohitl_e2e_test.js` and `docs/EXTERNALIZATION_RUNBOOKS.md` to verify the closure path end-to-end. Live runs remain `PUBLIC_AGI_CLAIM_BLOCKED` while observed evidence is missing, protected audit reads fail closed with structured policy errors, and a simulation-only fixture can exercise `PUBLIC_CLAIM_READY_SIMULATION_ONLY` without being mixed into observed evidence.
- 2026-03-31: Added repo-side closure verification and execution-pack export without introducing a new phase. `scripts/lib/repo_closure_export_runtime.js` plus `scripts/run_repo_closure_export.js` audit repo-side completeness, export five external-only packets, run observed-evidence dry-runs in an isolated workspace, generate a fixed blocking matrix, and emit a zero-natural-language structured status contract. Added `scripts/repo_closure_export_e2e_test.js`, `docs/REPO_CLOSURE_EXPORT_RUNBOOK.md`, and package scripts for `full_preflight`, packet export, dry-run import, and public-claim recompute.

譛邨ょ酔譛・ 2026-02-22  
菴懈・譬ｹ諡: 繝ｪ繝昴ず繝医Μ螳溯｣・・騾・ｧ｣譫・+ 螳溷ロ繝・せ繝郁ｨｼ霍｡
- 2026-03-25: Tightened the governed self-improvement loop around change-level readiness instead of proposal-only counts. `scripts/lib/openai_blog_learning.js` now records raw auto-apply suggestions, ready-to-gate changes, waiting-on-observation notes, waiting-on-reinforcement notes, and policy-disabled candidates, and both runtime snapshots and `web/01.HarnesUI/overview.js` now surface `nextPriority` plus a bounded backlog for the next self-improvement cycle.
- 2026-03-26: Fixed a silent observability loss in frontend-note reinforcement progress. `scripts/lib/openai_blog_learning.js` now preserves the full reinforcement progress object when serializing `nextPriority` and `priorityBacklog`, adds explicit stabilization-lane posture fields (`observationStatus`, `observationCount`, `lastObservedAt`), and keeps those values visible in runtime snapshots, reports, and `web/01.HarnesUI/overview.js` instead of collapsing them to raw success/failure counts.
- 2026-03-25: Fixed a promotion blind spot where reinforced frontend quality notes could only be applied when runtime retrieval hints were also present. `buildAppliedSelfImprovementState` now promotes ready frontend notes even when there are zero ready hints, and `buildRuntimeLearningSelection` preserves inferred task-family/topic context even when runtime retrieval is disabled so note-only prompt injection can still work.
- 2026-03-25: Strengthened the self-improvement eval gate with per-case prompt-block budgets. `scripts/config/self_improvement_promotion_policy.json` now carries `maxPromptBlockChars`, the gate emits those limits in case results, and regressions now fail when prompt injection silently grows past the allowed cap.
- 2026-03-25: Reduced learning-lane noise by collapsing near-duplicate guidance candidates and penalizing likely truncated guidance in `scripts/lib/openai_blog_learning.js`, then re-synced the OpenAI and Anthropic learning artifacts plus reports.
- 2026-03-25: Tightened external-learning extraction quality again so low-signal article fragments stop polluting working memory. `scripts/lib/openai_blog_learning.js` now filters obvious extraction boilerplate like embedded video fallback text, treats trailing-dash paragraphs as truncation noise, downranks long multi-sentence paragraph candidates, and keeps those fragments out of the curated docs and runtime prompt blocks. Regression coverage was extended in `scripts/openai_blog_learning_test.js` and `scripts/anthropic_engineering_learning_test.js`.
- 2026-03-23: Added a governed self-learning lane sourced only from the official OpenAI Developers blog. `scripts/lib/openai_blog_learning.js` plus `scripts/openai_blog_learning_cycle.js` now fetch recent official articles, keep unread/tracked state in `output/openai_blog_learning_ledger.json`, build a topic-indexed digest in `output/openai_blog_learning_digest.json`, emit governed proposal artifacts under `output/openai_blog_learning_proposals/`, and auto-sync the non-constitutional retrieval doc `docs/OPENAI_DEVELOPER_LEARNINGS.md`. `server.js` now exposes the same lane as `runtime.externalLearning`, starts a bounded background polling loop, and `web/01.HarnesUI/overview.html` + `overview.js` surface the lane in Overview without changing the main `POST /api/exec` path or frozen Step 1/2 behavior.
- 2026-03-23: Added bounded runtime retrieval on top of that external-learning lane without changing topology or the main `POST /api/exec` path. `scripts/lib/openai_blog_learning.js` now resolves task-family-aware official article matches and can build an advisory `HARNESS_EXTERNAL_LEARNING_CONTEXT_V1` block, while `server.js` applies that block only after planning lock, only for targeted `default` / `frontend_worker` web-creative turns, and records the retrieval decision into runtime snapshots and turn artifacts. `web/01.HarnesUI/overview.js` now surfaces runtime retrieval state in Overview, and regression coverage was extended in `scripts/openai_blog_learning_test.js`, `scripts/harness_overview_test.js`, and `scripts/app_server_smoke_test.js`.
- 2026-03-25: Added governed self-improvement on top of the learning lanes without changing topology, the main `POST /api/exec` route, or frozen Requirement-Driven Foundation V1. `scripts/config/self_improvement_proposal.schema.json` now fixes the machine-readable improvement proposal shape, `scripts/config/self_improvement_promotion_policy.json` classifies `auto_apply_candidate` vs `proposal_only` vs `blocked` targets, and `scripts/lib/openai_blog_learning.js` now emits lane-specific self-improvement proposal/state/gate artifacts under `output/*self_improvement*`.
- 2026-03-25: Added a machine eval gate for self-improvement promotion. `scripts/self_improvement_eval_gate.js` can recompute the gate from current learning artifacts, the gate compares baseline versus candidate retrieval on targeted and non-targeted cases, and only low-risk `runtime_retrieval_hint` candidates that pass the gate may self-promote into the primary OpenAI lane. Runtime/overview snapshots now expose self-improvement gate status, applied decision, hint counts, and artifact paths, while secondary Anthropic learnings stay proposal-first.
- 2026-03-22: Implemented and verified the external Copilot Studio weekly-report companion without changing the harness main path (`POST /api/exec`). The companion now uses Microsoft To Do list `Weekly Evidence` as the evidence store, not the earlier SharePoint-list assumption.
- 2026-03-22: Created and started five Power Automate flows for the weekly-report companion: `WR_TEAMS_CHANNEL_TO_EVIDENCE_V1` (`b46fc296-b725-f111-88b4-000d3acf2bda`), `WR_OUTLOOK_SENT_TO_EVIDENCE_V1` (`3ce1784f-b825-f111-88b4-000d3acf2bda`), `WR_ADD_WORK_MEMO_TO_EVIDENCE_V1` (`49e1784f-b825-f111-88b4-000d3acf2bda`), `WR_GET_WEEKLY_EVIDENCE_PACKET_V1` (`54e1784f-b825-f111-88b4-000d3acf2bda`), and `WR_WEEKLY_DRAFT_REMINDER_V1` (`60e1784f-b825-f111-88b4-000d3acf2bda`).
- 2026-03-22: Wired `WR_ADD_WORK_MEMO_TO_EVIDENCE_V1` and `WR_GET_WEEKLY_EVIDENCE_PACKET_V1` into the Copilot Studio agent `週報下書きアシスタント`, then verified live Teams evidence capture, Outlook evidence capture, memo-tool storage, weekly reminder delivery, weekly packet retrieval, and end-to-end weekly draft generation from Copilot Studio.
- 2026-03-22: Recorded the remaining weekly-report companion limitation in docs: the current Copilot Studio tool exposure for `WR_ADD_WORK_MEMO_TO_EVIDENCE_V1` surfaced `memo_text` in the tested agent UI, while the underlying flow schema still supports optional `memo_project` and `memo_date`.
- 2026-03-22: Strengthened Step 1 request coverage so the ledger is no longer backfilled only from the requirement contract. `scripts/lib/planning_mode_policy.js` now re-parses the sanitized user prompt directly for goal/scope/non-goal/acceptance clauses, prompt directives, prompt-level value signals, prompt-anchored benchmarks, and full-line approval-boundary clauses before it seeds `requestCoverage.rawRequestClauses`, and `sanitizeRequirementRequestCoverage(...)` now auto-generates `droppedItems` for unmapped non-core clauses with machine-readable reason codes such as `unsafe_or_approval` or `deferred_nonblocking`. `scripts/config/planning_mode_contract.json` also extends the approval-boundary keyword set so phrases like `Push to GitHub only after explicit approval.` promote into `approvalBoundaryItems` instead of collapsing to a generic keyword label. Regression coverage was expanded in `scripts/planning_mode_policy_test.js`.
- 2026-03-22: Extended the same requirement-traceability work past Step 1 without changing topology or the `/api/exec` main path. `scripts/lib/planning_mode_policy.js` and `scripts/config/dispatch_plan.schema.json` now add `requestClauseRefs`, `requirementRefs`, and `acceptanceCheckRefs` to each `dispatch-plan.v2` dispatch, `scripts/lib/operator_plan_surface.js` threads those refs into visible plan steps, `server.js` now exposes `contracts.designAcceptance`, `memory.taste`, and a derived `traceability` snapshot on `GET /api/harness/overview`, and `web/01.HarnesUI/overview.html` + `overview.js` now render a dedicated `Traceability` section that follows original request clauses through requirement refs, plan steps, and parked/dropped reasons. The existing single-card `Requirement Lock` remains lightweight in `web/01.HarnesUI/app.js`, while regression coverage now also includes `scripts/operator_plan_surface_test.js` and `scripts/harness_overview_test.js`.
- 2026-03-22: Added a dedicated post-lock drift evaluation path without introducing a new execution route. `server.js` now derives `postLockDrift` from the locked planning artifacts and downstream request-trace refs, exposes the same snapshot through `flow_trace_summary.json`, and supports a new `/api/eval/run` probe driver `post_lock_drift_probe` that can mutate downstream traceability (`dropDispatchTraceRefs`, orphan injections, ref clearing) to verify drift detection. `scripts/lib/eval_harness_policy.js` now allows the new driver, `scripts/config/eval_suite_default.json` adds clean-trace and drift-detected default cases, and regression coverage was expanded in `scripts/eval_harness_policy_test.js` plus `scripts/eval_replay_api_smoke_test.js`.
- 2026-03-22: Moved locked-requirement governance from visibility into runtime enforcement without changing topology or the `/api/exec` main path. `scripts/lib/planning_mode_policy.js` and `scripts/config/requirement_contract.schema.json` now persist `activeRevisionProposal` and `revisionGate` on `requirement-contract.v5`, keep `intake` as the only authoritative revision publisher, block non-intake silent rewrites behind `proposal_required`, and record approved proposal lineage in `revisionLedger.approvedProposalId` / `approvedProposalOriginatingAgent`. `scripts/extensions/requirement_guard_hook.js` now instructs downstream agents to return a marked `REVISION_PROPOSAL_V1` payload instead of rewriting the contract body.
- 2026-03-22: Runtime completion now hard-stops downstream drift instead of only reporting it after the fact. `server.js` now parses marked revision proposals from parent/child output, turns pending revisions into `RETURN_TO_INTAKE`, fails silent rewrite attempts with `silent_requirement_rewrite`, blocks downstream clause gaps or orphan refs with `runtime_post_lock_drift_failed`, and refuses final completion when the new clause-by-clause `clauseCompletionScorecard` still leaves any core request clause unsatisfied. `scripts/lib/task_outcome_policy.js` plus `scripts/config/task_outcome_contract.json` now classify `silent_requirement_rewrite`, `runtime_post_lock_drift_failed`, `return_to_intake_required`, and `release_clause_unsatisfied`.
- 2026-03-22: Release-time artifacts now expose core-clause completion explicitly. `scripts/lib/requirement_revision_policy.js` builds the shared clause scorecard, `scripts/lib/constitution_conformance.js` threads it into `review_bundle.json`, `release_decision.json`, and `operator_view_summary.json`, and latest-turn / evidence / flow-trace runtime surfaces now publish `runtimeRevisionGate`, `postLockDrift`, and `clauseCompletionScorecard` together. Regression coverage was expanded in `scripts/planning_mode_policy_test.js`, the new `scripts/requirement_revision_policy_test.js`, `scripts/requirement_guard_validator_test.js`, `scripts/harness_console_ui_policy_test.js`, `scripts/app_server_smoke_test.js`, `scripts/operator_plan_surface_test.js`, `scripts/harnesui_execution_plan_purpose_test.js`, `scripts/eval_harness_policy_test.js`, and `scripts/eval_replay_api_smoke_test.js`.
- 2026-03-22: Froze Requirement-Driven Foundation V1 behind an explicit exit audit instead of continuing Step 1/2 feature growth. Added `docs/PHASE_REQUIREMENT_FOUNDATION_V1.md` as the phase completion contract, added `scripts/phase_exit_requirement_foundation_v1.js` as the one-command 8-check audit that writes `output/phase_exit_requirement_foundation_v1.json` and `.md`, and added `scripts/phase_exit_requirement_foundation_v1_test.js` so the audit itself stays regression-covered.
- 2026-03-22: Runtime and overview now publish the phase freeze state. `server.js` reads the exit-audit report into `phaseStatus.requirementFoundationV1`, `completedAt`, and `auditReportPath`, `web/01.HarnesUI/overview.js` surfaces that state in the overview health card, and focused regressions were added in `scripts/app_server_smoke_test.js` and `scripts/harness_overview_test.js`.
- 2026-03-22: Brought request-trace purpose forward into the main `Execution Plan` surface. `web/01.HarnesUI/index.html` adds a dedicated purpose line on the current-step card, `web/01.HarnesUI/app.js` now preserves `requestClauseRefs` / `requirementRefs` / `acceptanceCheckRefs` through focused-step selection and renders `支える依頼` / `支える受け入れ` / `支える要件` on both the current card and each plan row, and `web/01.HarnesUI/styles.css` adds the supporting presentation rules. Added focused regression coverage in `scripts/harnesui_execution_plan_purpose_test.js`, updated the UI contract checks in `scripts/harness_console_ui_policy_test.js`, and realigned the browser integration expectations in `scripts/harness_check_mode_test.js`.
- 2026-03-22: Aligned the repository-backed startup parent posture with `Full Access`. `.codex/agents/default.toml` now sets `sandbox_mode = "danger-full-access"` with `approval_policy = "never"`, `docs/AGENT_OPERATING_RULES.md` and `docs/CURRENT_ARCHITECTURE.md` now describe that posture accurately, and `scripts/project_codex_config_policy_test.js` now guards the default parent-agent permission contract.
- 2026-03-22: Changed the fresh `web/01.HarnesUI` permission default from `Guardian Approvals` to `Agent (Full Access)`. `web/01.HarnesUI/app.js` now uses `full-access` as `DEFAULT_PROFILE_ID`, `web/01.HarnesUI/index.html` pre-renders the matching `danger-full-access` / `approval_policy=never` / `web_search=live` surface for first paint, and `scripts/harness_console_ui_policy_test.js` now locks the new default so the top `//permissions` selector stays aligned with the full-access preset.
- 2026-03-21: Strengthened Step 1 for structured Stitch replay requests. `scripts/lib/planning_mode_policy.js` now detects prompts that specify a Stitch project/screen and ask for reproduction, promotes the real replay objective into `explicitGoal` / `lockedGoal`, carries project and screen ids plus hosted-asset retrieval instructions into `baselineScope`, adds Stitch-specific inferred acceptance checks, and emits a display contract that tells the operator to fetch the target screen assets first while preserving replay boundaries such as `指定された Stitch screen を基準にする` and `完全再現から外れる独自アレンジを入れない`. Added prompt-level regression coverage in `scripts/planning_mode_policy_test.js` and UI-summary coverage in `scripts/harnesui_requirement_summary_test.js`.
- 2026-03-21: Made structured Stitch references directly inspectable from HarnesUI. The conversation timeline now renders a compact `Stitch参照` card for structured Stitch prompts, and `Requirement Lock` now shows a `確認対象` row with the referenced project/screen/assets so operators can verify the content target from the UI without rereading the full raw prompt.
- 2026-03-22: Corrected Stitch access-check routing so parent-side intake no longer falls back to generic `list_mcp_resources`/`curl` reasoning first. Added `web-designer-master` to `default` and `intake` skill assignments in `scripts/config/skill_catalog.json`, updated `skills/web-designer-master/references/stitch-mcp-playbook.md` to require authenticated connector/tool checks before raw URL probing, tightened the skill's default prompt toward strongest-path Stitch inspection, synced `docs/AGENT_OPERATING_RULES.md` and `docs/AGENT_SKILL_MATRIX.md`, and added regression coverage in `scripts/skill_portfolio_policy_test.js`.
- 2026-03-21: Fixed the remaining `Requirement Lock` / `Execution Plan` inconsistency in `web/01.HarnesUI`. When Step 1 is still `保留/BLOCKED`, the journey cards already stop at requirements, but the separate `Execution Plan` panel previously continued to surface downstream explicit `plan/update` or `PLAN SKIP` state. `web/01.HarnesUI/app.js` now gates that panel on the same requirement contract truth, replacing the plan surface with the active blocker plus a paused explanation until the requirement gate clears. Added focused regression coverage in `scripts/harness_requirement_gate_flow_test.js` and tightened the UI policy assertions in `scripts/harness_console_ui_policy_test.js`.
- 2026-03-21: Changed the main `web/01.HarnesUI` request composer to stay at the bottom of the page instead of following the viewport while scrolling. `web/01.HarnesUI/styles.css` now uses static placement for `.composer` across desktop/mobile, `web/01.HarnesUI/index.html` starts with `body.composer-static` to avoid first-paint stickiness, `web/01.HarnesUI/app.js` now keeps the old spacing helper in permanent static mode, and the UI policy/layout regressions were updated in `scripts/harness_console_ui_policy_test.js` and `scripts/harnesui_ui_reload_layout_test.js`.
- 2026-03-21: Strengthened Step 1 autonomous requirement tightening so the harness blocks less often on low-risk ambiguity. `scripts/lib/planning_mode_policy.js` now infers bounded acceptance gates from the locked goal / scope / direction when no explicit acceptance section exists, partitions unresolved questions into `blocking` versus deferred (`defaultable` / `taste`) lanes before planning mode selection, and carries the deferred questions into the requirement contract's `questionPlan` plus assumptions instead of treating every unresolved question as a blocker. This keeps truly blocking approval/scope/decision gaps in `openQuestions` while allowing execution-ready work to stay `NORMAL`/`LOCKED`. Regression coverage was expanded in `scripts/planning_mode_policy_test.js`, and `scripts/requirement_guard_validator_test.js` was updated to reflect the new structured-execution path for autonomously tightened requests.
- 2026-03-21: Repaired `実行トレース` so spawned child agents keep honest terminal placement instead of disappearing back into an idle/configured state. `server.js` now retains terminal live-collab child snapshots after `wait` completion, preserving the resolved child role, terminal status, child thread id, and last detail for `/api/agent-topography`; `web/01.HarnesUI/app.js` now merges those synced topography rows into the main execution-trace card lanes and synthetic trace list so reviewers/testers/workers move from `実行中` into `完了` or `失敗/中断` in the active chat. Added focused regression coverage in `scripts/agent_topography_test.js` and the new `scripts/harnesui_execution_trace_state_test.js`.
- 2026-03-21: Fixed the `web/01.HarnesUI` conversation/composer collision on desktop without sacrificing the ChatGPT-like bottom-pinned composer. `web/01.HarnesUI/styles.css` now lets `work-panel` rows size naturally, removes the old desktop-only forced-static composer rule, and keeps the transcript panel's bottom edge compact instead of reserving a large composer-sized blank strip; `web/01.HarnesUI/app.js` now keeps sticky placement for normal desktop/mobile heights, falls back to static only on very short viewports, and exposes `reloadUiShellForUi()` for a header `UI更新` button. Added focused regression coverage in `scripts/harnesui_ui_reload_layout_test.js` and updated `scripts/harness_console_ui_policy_test.js`.
- 2026-03-21: Fixed the remaining transcript blank-space issue in `web/01.HarnesUI` when a chat has only a few messages. `web/01.HarnesUI/app.js` now renders transcript rows through a bottom-aligned `timeline-stack` wrapper instead of appending messages directly to the tall scroll panel, `web/01.HarnesUI/styles.css` now makes `.timeline` a flex column with `.timeline-stack { margin-top: auto; }`, and focused regression coverage was added in `scripts/harnesui_timeline_layout_test.js` plus the updated `scripts/harness_console_ui_policy_test.js`.
- 2026-03-21: Trimmed transcript-side local file references one step further in `web/01.HarnesUI` so the final operator-facing UI no longer renders separate `L1323` chips. `web/01.HarnesUI/app.js` now keeps basename-only labels for local file references in transcript rendering and chat previews while preserving the repo-relative path plus line marker in hover text, `web/01.HarnesUI/styles.css` drops the unused line-chip styling, and regression coverage was updated in `scripts/harnesui_message_reference_test.js` plus `scripts/harness_console_ui_policy_test.js`.
- 2026-03-21: Fixed the desktop `web/01.HarnesUI` composer action stretch regression that made `停止` / `送信` fill the full composer height. `web/01.HarnesUI/styles.css` now keeps `.composer-actions` aligned to its own content height instead of the taller textarea column, and `scripts/harness_console_ui_policy_test.js` now guards that layout contract so the action buttons stay normal-sized while the sticky composer remains in place.
- 2026-03-21: Tightened `Requirement Lock` and Step 1 journey honesty in `web/01.HarnesUI`. `scripts/lib/planning_mode_policy.js` now refuses to lock fragmentary subordinate-clause goals such as `...するときは`, `web/01.HarnesUI/app.js` prefers the interpreted direction over clause fragments, downgrades stale `displayContract.goalMode=locked` surfaces when the contract is still blocked, localizes the common `What acceptance checks define success?` question inside the operator card, and marks the Step 1 journey card as `保留` instead of `完了` when the requirement contract is still blocked or unresolved. Regression coverage was extended in `scripts/planning_mode_policy_test.js` and `scripts/harnesui_requirement_summary_test.js`, and the UI contract was re-verified with `scripts/harness_console_ui_policy_test.js`.
- 2026-03-21: Fixed the deeper progression bug where `Harness Status` could still advance to planning/execution after Step 1 remained blocked. `web/01.HarnesUI/app.js` now derives stage progression from the requirement contract gate, so blocked/unresolved `Requirement Lock` snapshots freeze Step 2/3/4/5 in waiting state, suppress `PLAN SKIP` as a downstream progression signal, and make `Current Work` show the blocker itself instead of a later-stage plan or execution summary. Added a focused regression in `scripts/harness_requirement_gate_flow_test.js` and kept the operator-surface regressions green with `scripts/harness_console_ui_policy_test.js` and `scripts/harnesui_requirement_summary_test.js`.
- 2026-03-20: Refactored Step 1 requirement handling around a richer contract object instead of a single inferred goal string. `scripts/lib/planning_mode_policy.js` and `scripts/config/requirement_contract.schema.json` now promote the contract to `requirement-contract.v5`, adding `lockedGoal`, `intentHypotheses`, `challengeReport`, `questionPlan`, `delightPlan`, and `displayContract`. The planner now keeps alternate intent hypotheses before lock, derives challenger-style findings plus a small prioritized question plan, separates optional adjacent value into a dedicated delight lane, and hands `web/01.HarnesUI/app.js` a display-safe summary so `Requirement Lock` can foreground the locked goal or working hypothesis without depending on raw prompt wording. `scripts/lib/operator_plan_surface.js` now also prefers `lockedGoal` / `displayContract.goal` when rewriting generic plan copy. Regressions were expanded in `scripts/planning_mode_policy_test.js` and `scripts/harnesui_requirement_summary_test.js`, and the updated contract path was re-verified with `scripts/requirement_guard_validator_test.js` and `scripts/harness_console_ui_policy_test.js`.
- 2026-03-20: Cleaned up transcript-side file-reference readability in `web/01.HarnesUI`. `web/01.HarnesUI/app.js` now parses markdown-style links inside assistant/system messages, collapses absolute local file references down to basename-first labels, and renders local references as compact inline chips instead of exposing long `/C:/...` paths directly in the visible transcript. Chat previews now use the same shortening rule, hover detail is shortened to a repo-relative path (`scripts/lib/... • L1323`) instead of the full absolute path, `web/01.HarnesUI/styles.css` adds dedicated transcript reference-chip/link styling, and regression coverage now includes `scripts/harnesui_message_reference_test.js` plus the updated `scripts/harness_console_ui_policy_test.js`.
- 2026-03-20: Simplified the `Requirement Lock` operator surface in `web/01.HarnesUI` from a multi-box contract dashboard into a single pre-plan strategy card. `web/01.HarnesUI/app.js` now collapses Step 1 into one short `AIの方針` card that foregrounds only the core current interpretation plus a few compact rows (`進め方`, `止まる理由`, `守る線`) instead of long contract lists; `web/01.HarnesUI/index.html` updates the panel copy to explain that this stage is about the AI's goal and approach before planning; and `web/01.HarnesUI/styles.css` now renders the section as a summary-first card with compact labeled rows instead of bullet-heavy sublists. Regression coverage was updated in `scripts/harnesui_requirement_summary_test.js` and re-verified with `scripts/harness_console_ui_policy_test.js`.
- 2026-03-20: Simplified the main `web/01.HarnesUI` operator flow around first-run clarity and direct action. `web/01.HarnesUI/index.html` now adds a `次にやること` focus panel, an explicit conversation wrapper with empty-state guidance, fill-only composer preset buttons, and jump-to-composer actions; `web/01.HarnesUI/app.js` now renders chat previews plus dynamic chat/workspace/send summaries; `web/01.HarnesUI/styles.css` now supports the new focus/conversation surfaces, keeps the composer sticky on narrow screens, and moves the main work panel ahead of the side settings on mobile simple-view. Verification included `node scripts/harness_console_ui_policy_test.js`, `node scripts/harnesui_prompt_autogrow_test.js`, route check `GET /01.HarnesUI/index.html -> 200`, and Playwright desktop/mobile viewport screenshots.
- 2026-03-20: Made workspace-lock failures recoverable from the main HarnesUI instead of surfacing only as a raw `HTTP 409 workspace lock required...` submit error. `web/01.HarnesUI/index.html` now exposes a dedicated workspace-lock strip (`このパスで lock` / `unlock` + live status), `web/01.HarnesUI/app.js` now reads `/api/runtime.workspaceGuard`, calls `POST /api/workspace/lock` / `/api/workspace/unlock`, rewrites `workspace_lock_required` and `outside_locked_workspace` submit failures into `needs_input` guidance, and keeps the workspace-lock controls visible even in simple view by collapsing the settings card down to that recovery surface. Regression coverage now includes the updated `scripts/harness_console_ui_policy_test.js`, and the runtime path was re-verified with `scripts/app_server_smoke_test.js`.
- 2026-03-20: Fixed the `Execution Plan` surface so it no longer foregrounds abstract governance stop rules such as "ask the user before implementation" when a more concrete task summary is available. `scripts/lib/operator_plan_surface.js` now rewrites generic policy-plan steps into request-specific wording by pulling from the locked goal, unresolved questions, owned paths, and acceptance checks, so discovery/needs-input turns show what the agent is concretely clarifying and normal execution turns show what change is actually being advanced. Added regression coverage in `scripts/operator_plan_surface_test.js` and re-verified the runtime path with `scripts/app_server_smoke_test.js`.
- 2026-03-20: Removed the standalone floating `AIエージェントかんばん` overlay from `web/01.HarnesUI` and embedded the same `/api/agent-topography` output into `実行トレース` as an inline `担当エージェント` section. `web/01.HarnesUI/app.js` dropped the floating-panel collapse state, `web/01.HarnesUI/styles.css` converted the board layout into an inline trace subpanel, and `scripts/agent_topography_test.js` plus `scripts/harness_console_ui_policy_test.js` now assert the trace-integrated presentation. Playwright visual verification confirmed the floating strip no longer appears and the grouped agent lanes render inside the execution trace panel.
- 2026-03-20: Realigned `web/01.HarnesUI` to the current Codex v0.116-era permission UX. The settings panel now uses `Agent (Auto)` / `Chat (Read Only)` / `Guardian Approvals` / `Agent (Full Access)` / `Custom (config.toml)` as the primary modes, adds a visible execution-mode summary card, moves raw `approval_policy` / guardian / `sandbox_mode` controls under a dedicated config-level details block, and exposes `web_search` as the exact tri-state `cached | live | disabled`. `server.js` now carries that exact `web_search` mode through `/api/exec`, execution-recipe snapshots, thread-reset decisions, and `thread/start` config instead of collapsing it to a boolean. Regression coverage now includes `scripts/harness_console_ui_policy_test.js`, `scripts/web_search_mode_policy_test.js`, and `scripts/runtime_default_feature_flags_test.js`; runtime verification was re-run with `scripts/app_server_transport_resilience_test.js` and `scripts/app_server_smoke_test.js`.
- 2026-03-20: Codified explicit user-granted adjacent-improvement autonomy in governance docs. `AGENTS.md` now allows small same-task/same-subsystem improvements only when the user explicitly grants that latitude, while `docs/AGENT_OPERATING_RULES.md` now constrains the rule so it cannot cross approval boundaries, turn into unrelated roadmap work, or ship without dedicated evidence and separated reporting.
- 2026-03-20: Strengthened Step 1 from a plain requirement compiler into a higher-trust requirement quality loop. `scripts/lib/planning_mode_policy.js` and `scripts/config/requirement_contract.schema.json` now promote the contract to `requirement-contract.v4`, adding machine-readable `status` / `statusReason`, per-field `provenance`, explicit `validation`, and a `revisionLedger` so the harness can distinguish user-stated facts from inferred ones, tell whether a contract is still draft/blocked/locked/revised, surface whether the contract is actually strong enough to drive quality work, and record what changed from the previous turn. `server.js` now persists the validator output as `requirement_validation.json` and threads it into the evidence manifest, while `web/01.HarnesUI/app.js` exposes the same state in `Requirement Lock` so operators can judge contract trustworthiness before specialist execution. Regressions in `scripts/planning_mode_policy_test.js`, `scripts/harnesui_requirement_summary_test.js`, `scripts/requirement_guard_validator_test.js`, and `scripts/harness_console_ui_policy_test.js` cover the new contract path.
- 2026-03-20: Made the floating `AIエージェントかんばん` show actual spawned specialists instead of only parent/runtime rows. `server.js` now tracks live collab child activity from real `spawnAgent` / `sendInput` / `wait` / `closeAgent` tool items, resolves child names from the locked dispatch plan or prompt-role hints when the payload only exposes `receiverThreadIds`, merges those live rows into `/api/agent-topography`, and clears them once the matching wait/close lifecycle proves the child stopped working. `web/01.HarnesUI/app.js` now fast-refreshes topography after collab item completions so the board shows spawned workers during the active turn, and `scripts/agent_topography_test.js` plus `scripts/harness_console_ui_policy_test.js` now cover the live-child path. Playwright visual verification confirmed `backend_worker` appears in `稼働中` with `source: collab` on a seeded live snapshot.
- 2026-03-20: Fixed the `web/01.HarnesUI` progress panel so deleting the last chat no longer leaks stale harness state into the auto-created replacement room. `runtimeTurnMatchesChat(...)` now refuses to bind an unscoped `latestTurn` to a fresh `forceNewSession` chat just because it is the only remaining `default` room, and `scripts/harnesui_chat_delete_progress_reset_test.js` now locks that regression.
- 2026-03-20: Converted user-facing response safety from a prose-only rule into a shared machine-readable runtime contract. Added `scripts/config/user_facing_response_contract.json` plus `scripts/lib/user_facing_response_contract.js`, rewired `scripts/lib/user_facing_response_policy.js` and `scripts/lib/adversarial_shadow_policy.js` to consume the same contract for close-in-place enforcement, completion-claim gating, and internal-process disclosure checks, exposed the active contract summary/path through `/api/runtime`, added coverage in `scripts/user_facing_response_policy_test.js` and `scripts/app_server_smoke_test.js`, synced `scripts/app_server_transport_resilience_test.js` with the repo's explicit Fast-mode-off default, and updated `web/01.HarnesUI` model presets to expose `gpt-5.4-mini` alongside `gpt-5.4` and `gpt-5.3-codex`.
- 2026-03-19: Hardened the user-facing response contract so non-blocked short/direct answers now close in place instead of appending unsolicited `必要なら...` / `If you'd like...` style follow-up offers. Added shared response-policy helpers in `scripts/lib/user_facing_response_policy.js`, taught `scripts/lib/adversarial_shadow_policy.js` to fail `unsolicited_followup_closing`, updated `scripts/lib/adversarial_loop_policy.js` retry instructions to require direct-answer-first plus close-in-place behavior, extended `server.js` final-text rewriting to strip leftover optional closing invitations before emitting the client-facing `final`, added `scripts/user_facing_response_policy_test.js`, and expanded `scripts/adversarial_shadow_policy_test.js` plus `scripts/adversarial_loop_policy_test.js`.
- 2026-03-19: Restored the dedicated local intent-profile API surface expected by the smoke/runtime contract. `server.js` now serves `GET /api/intent/profile`, `POST /api/intent/profile`, and `POST /api/intent/profile/reset`, persists operator intent/taste-profile updates into `logs/archive/raw/runtime_state/intent_profile_memory.json` instead of mutating the seed file, exposes that runtime overlay path inside `runtime.intentFirst`, and ignores the overlay file in turn-complete Git automation. This closes the `/api/intent/profile did not return intentFirst` regression and brings `node scripts/app_server_smoke_test.js` back to PASS.
- 2026-03-19: Closed the remaining intent-first workspace-lock runtime gap. `server.js` now exposes top-level `workspaceGuard` state in `/api/runtime`, adds authenticated `POST /api/workspace/lock` and `POST /api/workspace/unlock` control APIs, blocks design-sensitive `/api/exec` requests from lock-required sources such as `web_ui` with `409 workspace_lock_required` until a lock exists, rejects `/api/exec` and `/api/batch/run` when their `cwd` falls outside the active locked root, and fixes intent-profile patch merging so alias fields like `northStar`, `benchmarkSites`, `prefers`, and `rejects` override the normalized stored profile instead of being shadowed by canonical fields. Updated `scripts/intent_first_runtime_test.js` and `scripts/workspace_lock_api_smoke_test.js` to use the in-process harness server so the Windows sandbox no longer trips `spawn EPERM`, and both tests now PASS.
- 2026-03-18: Moved `Requirement Lock` intent interpretation upstream into the Step 1 contract itself. `scripts/lib/planning_mode_policy.js` now persists a machine-readable `intentInterpretation` (`presentation`, `questionLike`, `direction`, `hypothesis`) inside `requirement-contract.v3`, `scripts/config/requirement_contract.schema.json` requires that field, `web/01.HarnesUI/app.js` now treats the contract as the primary source of truth instead of inventing hypotheses client-side, and regressions in `scripts/planning_mode_policy_test.js` plus `scripts/harnesui_requirement_summary_test.js` now cover both interpreted meta-questions and the “do not fabricate a hypothesis when no interpretation exists” path.
- 2026-03-18: Restored the operator-facing agent board in `web/01.HarnesUI` and then tightened its meaning so it only foregrounds agents that are actually active in runtime/trace data. The floating panel stays labeled `AIエージェントかんばん`, remains visible in `simple-view` and `telemetry-off`, defaults to expanded when no local preference exists, groups agents into `稼働中 / 親 / 専門 / 検証` lanes, keeps scoped runtime agents with an active turn visible in `稼働中` even when they belong to a different chat session, and no longer decorates planned-but-idle specialists as if they were presently working. Updated `scripts/agent_topography_test.js` and `scripts/harness_console_ui_policy_test.js`, and re-verified the UI via Playwright.
- 2026-03-17: Realigned `web/01.HarnesUI` settings copy with the latest Codex permissions model. The top selector now uses `Auto (default)` / `Read-only` / `Full Access` / `Custom (config.toml)`, raw sandbox wording is `サンドボックスモード`, deprecated `on-failure` no longer appears in the approval dropdown, and `web/01.HarnesUI/app.js` now normalizes legacy saved presets (`safe` / `balanced` / `full-auto` / `power`) plus legacy `on-failure` settings into the current Codex combinations on load.
- 2026-03-17: Updated the user-facing response contract so `結論 / 根拠 / 限界/反論 / 実務上の意味` is now documented as the default high-precision answer shape rather than an absolute format; `AGENTS.md` now allows task-specific override formats when they improve reach precision, and `docs/AGENT_OPERATING_RULES.md` now defines preferred override patterns for short fact answers, reviews, implementation reports, option comparisons, and blocked/approval-boundary states while preserving answer/basis/limits/practical-implication coverage.
- 2026-03-17: Refined the `Requirement Lock` UI so question-style Step 1 goals no longer echo the literal topic as `回答テーマ`; `web/01.HarnesUI/app.js` now derives a `進行仮説` from `userValueFrame.userWants` / locked intent signals plus a question-intent reframing heuristic, surfaces `向かう先` as the headline, drops redundant `未解決` rows that only restate the same question, and updated `scripts/harnesui_requirement_summary_test.js` to cover the new grouping.
- 2026-03-17: Removed the repo-scoped `service_tier = "flex"` default after confirming it broke ChatGPT-authenticated Codex/TUI and `codex app-server` sessions with `Unsupported service_tier: flex`; the repo now keeps `features.fast_mode = false`, keeps `guardian_approval = true`, and leaves non-Fast service tier selection unspecified (`auto`) so the provider default is used unless operators explicitly enable Fast.
- 2026-03-15: Tightened Step 1 requirement understanding so Requirement Lock no longer treats courtesy-only lead-ins as the user goal, `planning_mode_contract.json` recognizes more Japanese headings (`依頼文`, `製作目的`, `要件`, `前提`, `非対象`), unstructured Japanese multiline briefs now infer real baseline items such as page count / working directory / company metadata / placeholder-image constraints, and `web/01.HarnesUI` only shows the Requirement Lock panel when core requirement fields were actually captured; added regressions in `scripts/planning_mode_policy_test.js` and `scripts/harnesui_requirement_summary_test.js`.
- 2026-03-15: Hardened benchmarked web-recreation governance so `web_creative + benchmark URL` cannot fall below `STANDARD_ASSURANCE`, explicit near-copy requests (`ほぼ同じ` / `完全再現` / `丸パクリ`) force `SIGNOFF_ASSURANCE`, follow-up turns inherit locked benchmark candidates from the previous planning context in the same workspace, repo-aware specialist `ownedPaths` now come from the active workspace shape (for example Laravel `resources/views/` instead of a generic `web/` fallback), and non-completed turns no longer leak `修正済み` / `done` style completion claims to operators because both adversarial shadow review and runtime final-text rewriting now suppress them; added regressions in `scripts/planning_mode_policy_test.js`, `scripts/adversarial_shadow_policy_test.js`, `scripts/adversarial_loop_wiring_test.js`, and `scripts/planning_carryover_wiring_test.js`.
- 2026-03-15: Removed the repo-scoped Fast default from `.codex/config.toml` by switching the project service tier to `flex` and setting `features.fast_mode = false`, keeping `guardian_approval` enabled and aligning repo defaults with the existing runtime `CODEX_FAST_MODE_DEFAULT=0` posture.
- 2026-03-15: Rewrote `docs/AI_AGENT_HARNESS_DETAILED_DESIGN.html` into an overview-first Japanese mechanism guide that starts from the big picture, explains parent/child/server/UI roles in plain language, centers the request flow and safety/evidence concepts, and removes inventory-heavy metric cards and endpoint-count-first framing.
- 2026-03-15: Made the main `web/01.HarnesUI` chat composer keep its current initial height while auto-growing and shrinking `#promptInput` with multiline input, including send-clear, preset insert, command insert, and resize reflow handling.
- 2026-03-15: Changed Fast mode to default OFF across `server.js`, `start_codex_ui.bat`, and `web/01.HarnesUI` unless `CODEX_FAST_MODE_DEFAULT` explicitly overrides it.
- 2026-03-15: Fixed `web/01.HarnesUI` chat composer auto-grow baselining so resize-time remeasurement always uses the empty default control state, clearing the field still returns it to the original initial height, manual resize is disabled for deterministic behavior, and `scripts/harnesui_prompt_autogrow_test.js` now guards the regression.
- 2026-03-15: Reworked `web/01.HarnesUI` progress visibility so `Harness Status` now includes a dedicated `Requirement Lock` summary driven by `latestTurn.planning.requirementContract`, and each phase card shows what was actually fixed or completed instead of only the phase name.
- 2026-03-15: Added browser-side `POST /api/exec` submit retries in `web/01.HarnesUI` using request-scoped idempotency keys, clearer terminal send-failure messaging, and launcher-side automatic harness restart with bounded retry/backoff in `start_codex_ui.bat`.
- 2026-03-15: Added project-scoped Codex defaults in `.codex/config.toml` so this repo keeps `features.fast_mode = true`, `features.guardian_approval = true`, and `service_tier = "fast"` without per-session operator setup.
- 2026-03-15: Added a three-way ambiguity gate for design-sensitive `web_creative` prompts so the harness can proceed, ask exactly one clarification question, or stop for explicit input; HarnesUI now surfaces that terminal path as `needs_input` instead of a false failure.
- 2026-03-15: Wired the harness runtime to honor those defaults locally as well: `start_codex_ui.bat` now exports `CODEX_FAST_MODE_DEFAULT=1` and `CODEX_AUTOMATIC_APPROVAL_REVIEW=1` when unset, planning policy promotes bounded `NORMAL` work into `FAST` when fast mode is enabled, and `on-request` approvals now run through automatic low-risk review instead of failing immediately as "interactive approval unavailable".
- 2026-03-15: Surfaced the repo-default `Fast mode` / `Automatic approval review` posture in `web/01.HarnesUI`, changed the default interactive `power` profile to `approvalPolicy: on-request`, and made the UI send `fastModeEnabled = true` plus `automaticApprovalReviewEnabled = true` on every interactive `POST /api/exec` request.
- 2026-03-15: Fixed `web/01.HarnesUI` settings persistence so operator Fast mode / Automatic approval review toggles stay pinned after local saves instead of snapping back to repo defaults during periodic `/api/runtime` refresh; updated the UI policy test and current architecture spec accordingly.
- 2026-03-15: Removed the redundant `Codex 既定モード` summary block from `web/01.HarnesUI` so the settings panel now relies on the existing Fast mode / Automatic approval review checkboxes only; made the UI policy test ASCII-safe by asserting the removed node IDs are absent instead of matching mojibake-prone Japanese literals.
- 2026-03-15: Fixed `start_codex_ui.bat` restart ergonomics so reruns stop an already-running local harness on the configured port before starting a fresh `node server.js`, and browser auto-open is now launcher-owned to avoid opening the same `01.HarnesUI` window twice.
- 2026-03-15: Moved the launcher's `CODEX_PAUSE_ON_EXIT=1` default ahead of the elevation/dependency checks so fast-fail startup paths no longer disappear before operators can read the error, while `CODEX_PAUSE_ON_EXIT=0` still keeps automation non-interactive.
- 2026-03-15: Hardened app-server stdio failure containment so `EPIPE`/write-side transport errors are handled inside `CodexAppServerClient`, stale `close`/`error` events from an old child cannot tear down a replacement child, and the next request can respawn the app-server without forcing parent harness shutdown; added `scripts/app_server_transport_resilience_test.js` for regression coverage.
- 2026-03-15: Tightened the spurious discovery `needs_input` fallback so answer-only confirmation turns no longer append `[needs_input] user decision required before implementation` from heuristic open-question detection alone; the auto-surfaced fallback now remains reserved for explicit approval-boundary or explicit user-decision signals.
- 2026-03-15: Narrowed Parent Dispatch Guard material-work detection so read-only diagnostic/status turns no longer count shell/MCP inspection as parent implementation; dispatch remains required for actual file-changing parent work and for planned non-proposal child execution.
- 2026-03-15: Stopped `01.HarnesUI` from appending post-final internal terminal errors into the visible assistant transcript, and softened parent-dispatch retry prompt wording so retry guidance stays internal instead of surfacing as a user-facing `[Parent Dispatch Guard] ...` block.
- 2026-03-15: Added a lightweight `01.HarnesUI` completion chime using the browser Web Audio API so interactive runs play a short local notification when `runPrompt` reaches `completed`, `failed`, or `interrupted`, without adding audio asset files or extra dependencies.
- 2026-03-15: Added machine-readable `task_family_profiles.json`, a task-family selector for planning, family-aware requirement-guard prompt shaping, runtime exposure of family-profile contracts, and user-value scoring support for `web_creative` comparisons.
- 2026-03-15: Refocused `web/01.HarnesUI/index.html` around operator readability: the console now defaults to a simpler Japanese-first view, keeps `Harness Status` visible even when secondary telemetry is hidden, demotes `Performance Metrics` / `Execution Trace` / `Diagnostics` / floating topography to secondary panels, and threads `task family`, `user-value thesis`, and `family gate` into the existing progress/verdict surfaces instead of adding new clutter.
- 2026-03-15: Added root-level `AI_AGENT_HARNESS_TEXTBOOK_JA.html` as a comprehensive Japanese textbook for the harness, consolidating governance, architecture, API surface, evidence/logging, skill/runtime concepts, launch configuration, verification scripts, and current operational caveats into one browser-readable document; updated `docs/CURRENT_ARCHITECTURE.md` to point at the new textbook.
- 2026-03-15: Wired family-aware completion through the outcome/current surface stack: `task_outcome_contract` now classifies `intent_*` and `family_completion_gate_failed` as `FAILED_VALIDATION`, persisted latest-turn snapshots retain `family_completion_gate`, `/api/runtime` + operator surfaces keep that verdict visible after reload, and `latest_run_summary.json` now carries the specialized family completion result for creative runs.
- 2026-03-15: Promoted `user-value first` into the upstream requirement contract: `requirement-contract.v3` now persists a machine-readable `userValueFrame` (`valueThesis`, `userWants`, `userShouldFeelGet`, `mustAvoid`, `hardConstraints`, `qualityAxes`, `benchmarkCandidates`, `completedMeans`), planning/runtime sanitation preserves it, requirement-guard prompts treat it as the primary optimization target, and RBJ requirement-definition now requires a `user_value_core` section before implementation planning.
- 2026-03-11: Fixed execution-retry contract drift so adversarial and parent-dispatch retries preserve the original planning context, execution retries carry the dispatch/evidence contract forward instead of degrading into answer-only rewrites, the parent dispatch guard blocks completed parent turns that still had planned child work, and Japanese frontend redesign prompts now route to `frontend_worker` without forcing unnecessary `LIGHT_ASSURANCE` reviewer evidence.
- 2026-03-12: `Execution Plan` now shows only explicit operator-visible plan events or explicit `PLAN SKIP` decisions derived from the locked planning context, `Current Work` now follows the active plan step instead of the latest raw event, and the planning journey card surfaces `SKIP` when detailed planning is intentionally omitted for direct-response turns.
- 2026-03-09: Fixed current-surface truth selection so operator-facing summaries prefer the latest passing live `stdio` signoff bundle over newer `mock-fixture` bundles, remove extra current files after refresh, and keep the fixed five current summaries aligned with bundle truth.
- 2026-03-10: Scoped `web/01.HarnesUI` performance and operator-monitor session labels to the active chat so `Performance Metrics`, `Harness Status`, and agent monitor cards now describe the same chat/thread instead of mixing active-chat harness state with global runtime session data.
- 2026-03-10: `Execution Plan` は明示的な計画更新が出ない軽量ターンでも、active-chat の推定 plan へフォールバックし、`No plan` の代わりに手順順序と進捗を表示するようになりました。
- 2026-03-10: Localized the `Execution Plan` operator surface to Japanese-first labels and details while preserving the `明示プラン` / `推定プラン` distinction for active-chat plan tracking.
- 2026-03-10: Hardened `/api/exec` streaming recovery so upstream `stream disconnected before completion` failures trigger a single fresh-session retry before surfacing terminal failure, aligning stream-disconnect handling with the existing unknown-thread fallback.
- 2026-03-09: Aligned signoff bundle truth surfaces so live signoff bundles preserve top-level `conformance_report.json` and `operator_view_summary.json`, `bundle_surface_map.json` cleanly separates fixed top-level summaries from relocated operator aids, default flat export includes those bundle-level release summaries, and comparison refresh now re-normalizes the bundle surface contract for existing bundles.
- 2026-03-09: Runtime proof generation now writes top-level `conformance_report.json` and `operator_view_summary.json` with explicit proof acceptance coverage, closing proof-bundle invariant gaps around material-claim evidence and inspectable acceptance coverage.
- 2026-03-08: Restored `docs/HARNESS_CONSTITUTION.md` as the frozen design authority, preserved `logs/current/conformance_report.json` and `logs/current/operator_view_summary.json` across current-surface refreshes, and fixed signoff conformance artifacts so planning/assurance score breakdowns now reflect the actual routing-policy output.
- 2026-03-09: Added split-resumable live signoff bundle execution with `signoff_resume_state.json`, emitted `lane_latency_summary.json` for stage/baseline hotspot visibility, captured `raw/raw_direct_baseline/` as a separate direct stdio baseline surface, fixed baseline comparison path resolution so direct-baseline reports read the bundle-local raw/summaries artifacts truthfully, and taught standalone comparison refreshes to re-sync relocated top-level comparison artifacts plus `signoff_summary.json` / `bundle_surface_map.json`.
- 2026-03-08: Hardened live child-evidence attribution so reviewer/tester evidence survives opaque child thread IDs from the app-server by inferring those roles from the dispatched child prompt context, restoring approvable live `stdio` runtime proof generation.
- 2026-03-08: Purged repo-root legacy/reference payloads that were proven unused, removing the top-level `archive/` payload set, stale generated artifacts under `output/`, `submissions/`, `提出用/`, `tmp_export.out`, unreferenced English Conversation App comparison screenshots, and previously unused `docs/HARNESS_CONSTITUTION.md`; also removed the broken `manual-single-codex.html` UI link and updated English Conversation App guidance to go through `start_codex_ui.bat`.
- 2026-03-08: Verification after that cleanup: `node scripts/app_server_smoke_test.js` -> PASS, `node scripts/eval_replay_api_smoke_test.js` -> PASS, `node scripts/requirement_guard_validator_test.js` -> FAIL (`runtime-sensitive non-parent transform should still carry assurance depth information`).
- 2026-03-08: Converged the repo on the frozen governed-decision constitution by adding machine-readable `RequestFrame`, `RoutingDecision`, `DiscoveryOutcome`, `ReviewBundle`, `ReleaseDecision`, evidence, and invariant contracts; added `docs/HARNESS_CONSTITUTION.md`; introduced `scripts/generate_conformance_report.js` plus `scripts/generate_operator_view.js`; taught `server.js` and signoff/proof generators to emit `conformance_report.json`, `operator_view_summary.json`, and top-level business release states; and enforced that parent agents cannot perform material implementation directly.
- 2026-03-08: Replaced the baseline comparison fallback with measured governance-light sample runs stored inside each signoff bundle, while keeping vanilla-like fallback only for older bundles missing baseline traces.
- 2026-03-08: Synced operator-first polish docs so `operator_summary.json` is documented as the single first-look file with `topLineDecision` / `whyThisIsSafe` / `whyThisMayNeedAttention` / `openOnlyIfNeeded`, `runtime_snapshot.json` is explicitly optional camelCase-only detail, `latest_run_summary.json` is documented to keep completed-run blocker wording out of `residualRisks`, `review_load_breakdown.json` is documented with its timing-model explanation, `current/index.json` is no longer part of the default human path, and `submission_manifest.json` notes/fileCount are expected to match the review-first export mode.
- 2026-03-08: Hardened adversarial shadow/retry handling for execution tasks so `Final reply must be exactly:` contracts are recognized, citation/date findings no longer conflict with exact-reply signoff tasks, and retry prompts preserve actual execution/delegation instead of devolving into answer-only rewrites.
- 2026-03-08: Relaxed child evidence parsing so `Owned paths` headers are recognized with or without a trailing colon, fixing live signoff doc-sync aggregation when reviewer/tester notes omit the punctuation.
- 2026-03-08: Updated live discovery evaluation to accept proposal-only delegated investigation when the run makes no implementation edits, satisfies the parent-dispatch guard, and terminates as either `NEEDS_INPUT` or proposal-only `COMPLETED`.
- 2026-03-08: Brought the measured live raw-like baseline onto the same DISCOVERY rule so proposal-only delegated investigation is accepted when reviewer/tester stay absent, no implementation edits occur, and dispatch remains satisfied-or-unneeded.
- 2026-03-08: Applied final operator-first logging polish so `logs/current/runtime_snapshot.json` keeps camelCase-only persisted keys, `latest_run_summary.json` separates completed-run informational notes from real residual risks, `review_load_breakdown.json` declares its overlapping timing model, `operator_summary.json` no longer points humans at `current/index.json`, and default submission export keeps bundle detail/raw artifacts behind `--with-raw`.
- 2026-03-08: Finalized the operator-first logging cleanup so `logs/current/operator_summary.json` is the only first-look entry, root `logs/` collapses to `current / bundles / archive`, admin migration reports live under `logs/archive/admin/`, signoff bundles push raw turns/operation logs under `raw/`, and `scripts/export_submission_artifacts.js` now exports a flat default review surface with optional raw add-ons.
- 2026-03-08: Added `scripts/baseline_comparison_test.js` so DISCOVERY evidence-richness scoring and transport-aware comparison reporting have dedicated regression coverage.
- 2026-03-08: Made proof/signoff generation transport-aware (`mock-fixture` or `stdio`) with explicit `transportMode` recorded in summaries/traces, upgraded discovery requirement artifacts to the `v2` schemas with inferred open-question/non-goal structure, and taught the baseline comparison report to score discovery evidence richness plus flag remaining fixture-backed samples.
- 2026-03-08: Reworked `scripts/app_server_smoke_test.js` and `scripts/eval_replay_api_smoke_test.js` to use the in-process harness path for sandbox-safe verification, updated artifact discovery to follow the archived turn-artifact surface, and switched eval API smoke coverage to a targeted custom suite so `/api/eval/run` stays stable under the runtime `maxCases` cap.
- 2026-03-08: Executed the logging-surface migration so `logs/current/` is the operator-first entrypoint, bundles live under `logs/bundles/`, raw turn/operation/runtime-state artifacts moved under `logs/archive/`, duplicate baseline/test proof surfaces were deleted, and inventory/deletion reports now document before/after retention.
- 2026-03-08: Reworked the logging surface so operator review starts in `logs/current/`, proof/signoff bundles live under `logs/bundles/`, raw turn/operation/runtime-state artifacts default under `logs/archive/`, and current summaries now expose design conformance, latest run, latest signoff, and Step 4 review-load timing without requiring raw-log traversal.

## 0. 騾・ｧ｣譫舌・蟇ｾ雎｡遽・峇

縺薙・譁・嶌縺ｯ縲・*縺薙・繝ｪ繝昴ず繝医Μ縺ｧ螳滄圀縺ｫ蜍輔＞縺ｦ縺・ｋ莉慕ｵ・∩**繧呈律譛ｬ隱槭〒蝗ｺ螳壼喧縺励◆莉墓ｧ俶嶌縺ｧ縺吶・ 
莉･荳九・繝輔ぃ繧､繝ｫ繧呈ｹ諡縺ｫ險倩ｿｰ縺励※縺・∪縺吶・
- `server.js`
- `web/index.html`
- `web/app.js`
- `scripts/app_server_smoke_test.js`
- `scripts/agent_topography_test.js`
- `scripts/extensions/requirement_guard_hook.js`
- `.codex/config.toml`
- `.codex/agents/*.toml`
- `AGENTS.md`

螳滓命縺励◆螳溷ロ遒ｺ隱阪・譛ｬ譖ｸ縲・5. 遞ｼ蜒崎ｨｼ霍｡縲阪↓險倬鹸縺励∪縺吶・
蟇ｾ雎｡螟・

- 蝓ｺ逶､繝｢繝・Ν蜀・Κ・磯㍾縺ｿ縲・撼蜈ｬ髢区耳隲悶い繝ｫ繧ｴ繝ｪ繧ｺ繝・・- 螟夜Κ繧ｵ繝ｼ繝薙せ蜀・Κ縺ｧ隕ｳ貂ｬ荳崎・縺ｪ螳溯｣・
## 1. 繧ｷ繧ｹ繝・Β蠅・阜・亥・菴灘ワ・・
譛ｬ繧ｷ繧ｹ繝・Β縺ｯ莉･荳九・3螻､讒区・縺ｧ縺吶・
1. 繝悶Λ繧ｦ繧ｶUI螻､
   - `web/index.html`, `web/app.js`, `web/styles.css`
   - 蠖ｹ蜑ｲ: 蜈･蜉帙・ｲ謐怜庄隕門喧縲¨DJSON繧ｹ繝医Μ繝ｼ繝陦ｨ遉ｺ縲∬ｨｺ譁ｭ陦ｨ遉ｺ縲ゝopography陦ｨ遉ｺ
2. Node繧｢繝繝励ち螻､
   - `server.js`
   - 蠖ｹ蜑ｲ: HTTP API縲∥pp-server讖区ｸ｡縺励》hread/turn蛻ｶ蠕｡縲√せ繝医Μ繝ｼ繝豁｣隕丞喧縲∵､懆ｨｼ縲√Ο繧ｰ
3. Codex app-server螻､
   - `server.js` 縺九ｉ蟄舌・繝ｭ繧ｻ繧ｹ襍ｷ蜍・   - 蠖ｹ蜑ｲ: JSONL/JSON-RPC鬚ｨ繝励Ο繝医さ繝ｫ縺ｫ繧医ｋ螳溯｡梧悽菴・
繝昴Μ繧ｷ繝ｼ螻､:

- 繝槭Ν繝√お繝ｼ繧ｸ繧ｧ繝ｳ繝郁ｨｭ螳・ `.codex/config.toml`, `.codex/agents/*.toml`
- 驕狗畑繧ｬ繝ｼ繝峨Ξ繝ｼ繝ｫ: `AGENTS.md`

## 2. 襍ｷ蜍輔・繝励Ο繧ｻ繧ｹ險ｭ險・
### 2.1 Node繧ｵ繝ｼ繝占ｵｷ蜍・
- 繧ｨ繝ｳ繝医Μ: `main()` (`server.js`)
- 繝昴・繝・
  - `CODEX_UI_PORT` 蜆ｪ蜈茨ｼ域里螳・ `57525`・・  - 菴ｿ逕ｨ荳ｭ譎ゅ・ `probeExistingServer()` 縺ｧ蜷檎ｨｮ繝上・繝阪せ縺句愛螳・    - 蜷檎ｨｮ縺ｪ繧牙､夐㍾襍ｷ蜍輔○縺夂ｵゆｺ・    - 蛻･繝励Ο繧ｻ繧ｹ縺ｪ繧芽ｵｷ蜍募､ｱ謨・- 繝悶Λ繧ｦ繧ｶ閾ｪ蜍戊ｵｷ蜍・
  - `CODEX_AUTO_OPEN_BROWSER=0` 縺ｧ辟｡蜉ｹ蛹・
### 2.2 app-server繝ｩ繧､繝輔し繧､繧ｯ繝ｫ

- 邂｡逅・け繝ｩ繧ｹ: `CodexAppServerClient`
- 襍ｷ蜍輔ワ繝ｳ繝峨す繧ｧ繧､繧ｯ鬆・ｺ・
  - `initialize` 繝ｪ繧ｯ繧ｨ繧ｹ繝・  - `initialized` 騾夂衍
- 逡ｰ蟶ｸ邨ゆｺ・凾:
  - pending RPC 繧貞､ｱ謨怜喧
  - turn watcher 縺ｫ fatal 騾夂衍
  - 蜀・Κ迥ｶ諷九ｒ繧ｯ繝ｪ繧｢

## 3. 繧ｨ繝ｼ繧ｸ繧ｧ繝ｳ繝域ｧ区・縺ｨ繝ｫ繝ｼ繝・ぅ繝ｳ繧ｰ

### 3.1 `.codex/config.toml` 荳翫・蠖ｹ蜑ｲ

- Parent邉ｻ:
  - `default`
  - `intake`
  - `release_manager`
- Child邉ｻ:
  - `frontend_worker`
  - `backend_worker`
  - `infra_worker`
  - `worker`
  - `tester`
  - `reviewer`
  - `explorer`

### 3.2 繝・ヵ繧ｩ繝ｫ繝亥ｮ溯｡後お繝ｼ繧ｸ繧ｧ繝ｳ繝・
邨瑚ｷｯ蛻･縺ｫ譌｢螳壹′蟄伜惠縺励∪縺吶・
- UI/API邨瑚ｷｯ (`POST /api/exec`):
  - `web/app.js` 縺ｮ `DEFAULT_AGENT_NAME="intake"`
  - `server.js` 蛛ｴ縺ｮ env 譛ｪ謖・ｮ壽凾譌｢螳壹ｂ `intake`
- CLI邨瑚ｷｯ:
  - `.codex/config.toml` 縺ｮ `agents.default` 繝励Ο繝輔ぃ繧､繝ｫ・郁ｦｪ繧ｪ繝ｼ繧ｱ繧ｹ繝医Ξ繝ｼ繧ｿ繝ｼ譁ｹ驥晢ｼ・
### 3.3 繝ｩ繝ｳ繧ｿ繧､繝迥ｶ諷九せ繝医い

`server.js` 縺ｯ in-memory 縺ｮ `agentStates` 繧呈戟縺｡縲∽ｻ･荳九ｒ菫晄戟縺励∪縺吶・
- `sessionRef`
- `threadId`
- `activeTurnId`
- `experimentalEnabled`
- `experimentalFeatures`
- `forkedFrom`
- `manualSessionPinned`
- `lastSandboxMode`
- `lastWebSearch`
- `lastCwd`
- `lastRequestUserInputPolicy`

## 4. API螂醍ｴ・ｼ亥ｮ溯｣・ｺ匁侠・・
`requestHandler()` 縺梧署萓帙☆繧帰PI:

- `GET /api/runtime`
  - runtime蜈ｨ菴薙∥gents縲〕atest_turn縲〉equirementId3縲｛perationLog險ｭ螳壹ｒ霑泌唆
- `GET /api/agent-topography`
  - 險ｭ螳壹お繝ｼ繧ｸ繧ｧ繝ｳ繝・+ runtime迥ｶ諷九・邨ｱ蜷井ｸ隕ｧ繧定ｿ泌唆
- `POST /api/requirement-guard/validate`
  - requirement-guard matcher隧穂ｾ｡
- `GET /api/diagnostics`
  - codex/node/git 縺ｮ蜿ｯ逕ｨ諤ｧ險ｺ譁ｭ
- `POST /api/open-cmd`
  - 繝ｭ繝ｼ繧ｫ繝ｫcmd襍ｷ蜍・- `POST /api/exec`
  - Security guard: Origin/Referer + control token + strict `Content-Type: application/json`
  - Blocked request event: `api.exec_blocked`
  - 讓呎ｺ門ｮ溯｡檎ｵ瑚ｷｯ・・DJSON繧ｹ繝医Μ繝ｼ繝溘Φ繧ｰ・・
陬懷勧繝ｫ繝ｼ繝ｫ:

- 譛ｪ螳溯｣・`/api/*` 縺ｯ `404`
- `/api/*` 縺ｧ method/path 縺梧悴繝槭ャ繝√↑蝣ｴ蜷医・ `404`・・Unknown API route`・・- `/api/*` 莉･螟悶〒 `GET` 莉･螟悶・ `405`

## 5. `/api/exec` 螳溯｡後ヱ繧､繝励Λ繧､繝ｳ・医さ繝ｼ繝ｫ繧ｰ繝ｩ繝包ｼ・
```text
HTTP POST /api/exec
  -> requestHandler
     -> 蜈･蜉帶ｭ｣隕丞喧(prompt/sandbox/approval/cwd/images/requestUserInputPolicy)
     -> prompt 逶｣譟ｻ諠・ｱ繧堤函謌撰ｼ・nputLength/outputLength/truncated・・     -> applyRequirementGuardExecExtension
     -> resolveAgentName
     -> runCodexExecStreaming
        -> (slash command 蛻・ｲ・ /agent /experimental /resume /fork /mention)
        -> executeTurnStreaming
           -> ensureAgentThread
              -> thread/resume 縺ｾ縺溘・ thread/start
              -> 繝｢繝ｼ繝牙ｷｮ蛻・sandbox/webSearch/cwd/requestUserInputPolicy)縺ｧthread蜀堺ｽ懈・蛻､螳・              -> thread/start config 縺ｫ harness.request_user_input_policy 繧呈ｳｨ蜈･
           -> turn/start
              -> unknown thread譎ゅ・ fresh thread 縺ｧ1蝗槭Μ繝医Λ繧､
           -> watchTurn
              -> delta/item/diff/plan/tokenUsage/activity 繧誰DJSON縺ｸ螟画鋤
              -> prompt蛻・ｊ隧ｰ繧∵凾縺ｯ activity(prompt_truncated) 繧帝∝・
              -> turn/completed 繧堤ｵらｫｯ縺ｨ縺励※遒ｺ螳・           -> finalizeTurn
              -> terminal status豁｣隕丞喧
              -> latest_turn譖ｴ譁ｰ
              -> final/error/status 蜃ｺ蜉・```

## 6. NDJSON繧ｹ繝医Μ繝ｼ繝莉墓ｧ・
UI縺ｫ霑斐☆荳ｻ隕√う繝吶Φ繝・

- `turn` (`started` / `completed`)
- `delta`
- `final`
- `error`
- `status` (`completed` / `failed` / `interrupted`)
- `item`
- `diff`
- `plan`
- `tokenUsage`
- `activity`

邨らｫｯ菫晁ｨｼ:

- 豁｣隕冗ｵらｫｯ縺ｯ `turn/completed`
- 蛻・妙譎ゅ・ `turn/interrupt` 繧帝√ｊ縲∽ｸ螳壽凾髢灘ｾ後↓ `interrupted` 縺ｧ蠑ｷ蛻ｶ邨らｫｯ

## 7. UI繝ｩ繝ｳ繧ｿ繧､繝險ｭ險・
### 7.1 迥ｶ諷狗ｮ｡逅・
`web/app.js` 縺ｯ莉･荳九ｒ荳ｭ蠢・↓邂｡逅・＠縺ｾ縺吶・
- 蜈ｨ菴鍋憾諷・`s`
- 繝√Ε繝・ヨ蜊倅ｽ阪・繝上・繝阪せ蜿ｯ隕門喧迥ｶ諷・`createHarnessState()`
- Topography迥ｶ諷・`topographyState`
- DOM蜿ら・霎樊嶌 `e`

### 7.2 螳溯｡後ヵ繝ｭ繝ｼ

荳ｭ蠢・未謨ｰ: `runPrompt()`

1. 繝・く繧ｹ繝・逕ｻ蜒乗､懆ｨｼ
2. `POST /api/exec` 騾∽ｿ｡・域里螳・`agentName=intake`・・3. `ReadableStream` + `TextDecoder` 縺ｧNDJSON騾先ｬ｡隱ｭ霎ｼ
4. `happly()` 縺ｧ plan/tokenUsage/diff/item/activity 繧貞渚譏
5. 螳御ｺ・凾縺ｫ runtime 蜀崎ｪｭ霎ｼ縺ｨUI迥ｶ諷区峩譁ｰ

### 7.3 Boot繝輔Ο繝ｼ

`boot()` 縺ｧ莉･荳九ｒ螳滓命:

- 險ｭ螳壼ｾｩ蜈・- 繝√Ε繝・ヨ蠕ｩ蜈・- 繧､繝吶Φ繝医ヰ繧､繝ｳ繝・- runtime/diagnostics縺ｮ蛻晄悄隱ｭ霎ｼ
- topography蛻晏屓隱ｭ霎ｼ + 蜻ｨ譛滓峩譁ｰ髢句ｧ・
## 8. Agent Topography Monitor

### 8.1 繝舌ャ繧ｯ繧ｨ繝ｳ繝・
- API: `GET /api/agent-topography`
- 蜃ｦ逅・
  - `.codex/config.toml` 縺九ｉ螳夂ｾｩ繧ｨ繝ｼ繧ｸ繧ｧ繝ｳ繝医ｒ隗｣譫・  - runtime `agentStates` 縺ｨ邨ｱ蜷・  - role/status/source 繧剃ｻ倅ｸ弱＠縺ｦ霑泌唆

### 8.2 繝輔Ο繝ｳ繝医お繝ｳ繝・
蟇ｾ雎｡隕∫ｴ:

- `#agentTopographyPanel`
- `#agentTopographyRefreshBtn`
- `#agentTopographyMeta`
- `#agentTopographyList`

謖吝虚:

- 荳ｻ蜿門ｾ・ `/api/agent-topography`
- 繝輔か繝ｼ繝ｫ繝舌ャ繧ｯ: `/api/runtime`
- 謇句虚譖ｴ譁ｰ繝懊ち繝ｳ縺ゅｊ
- 10遘貞捉譛溯・蜍墓峩譁ｰ縺ゅｊ

險ｭ險域э蝗ｳ:

- 隕ｳ貂ｬ諤ｧ繧貞━蜈医＠縲∝ｰら畑API髫懷ｮｳ譎ゅｂ runtime 縺九ｉ邵ｮ騾陦ｨ遉ｺ繧堤ｶ咏ｶ・
## 9. requirement_guard 諡｡蠑ｵ繝輔ャ繧ｯ

### 9.1 繧ｵ繝ｼ繝仙・

- 譛牙柑蛹悶ヵ繝ｩ繧ｰ: `CODEX_REQUIREMENT_GUARD_ENABLED`
- 繝・ヵ繧ｩ繝ｫ繝医Δ繧ｸ繝･繝ｼ繝ｫ: `scripts/extensions/requirement_guard_hook.js`
- 螳溯｡悟燕繝輔ャ繧ｯ: `applyRequirementGuardExecExtension()`

### 9.2 諡｡蠑ｵ繝｢繧ｸ繝･繝ｼ繝ｫ蛛ｴ

`scripts/extensions/requirement_guard_hook.js` 縺梧署萓・

- matcher險ｭ螳・隧穂ｾ｡
- requirement lock / scope expansion 險ｭ螳・- `transformExecRequest()` 縺ｫ繧医ｋ繝励Ο繝ｳ繝励ヨ螟画鋤

## 10. 螳牙・諤ｧ繝ｻ讀懆ｨｼ繝ｭ繧ｸ繝・け

- 繝ｪ繧ｯ繧ｨ繧ｹ繝域悽譁・し繧､繧ｺ蛻ｶ髯・
  - 騾壼ｸｸ: 2MB
  - `/api/exec`: 24MB
  - 雜・℃譎・ `/api/exec` 縺ｯ `413`・・Request body too large`・・- 遨ｺ蜈･蜉幃亟豁｢:
  - prompt + image 縺檎ｩｺ縺ｪ繧・`400`
- 逕ｻ蜒乗､懆ｨｼ:
  - 諡｡蠑ｵ蟄舌・MIME荳閾ｴ
  - Base64螯･蠖捺ｧ
  - 譛螟ｧ10MB
  - 逕ｻ蜒丞粋險医・霑ｽ蜉蛻ｶ髯・
    - 繝・さ繝ｼ繝牙ｾ悟粋險・ 邏・6.5MB・・maxChatImageAggregateBytes`・・    - Base64霎ｼ縺ｿ蜷郁ｨ・ 22MB・・maxChatImageAggregateEncodedBytes`・・    - 24MB body荳企剞縺ｨ縺ｮ謨ｴ蜷医ｒ蜿悶ｋ縺溘ａ縲∬ｶ・℃蜑阪↓ `400` 縺ｧ諡貞凄
- 螳溯｡後Δ繝ｼ繝画ｭ｣隕丞喧:
  - approvalPolicy / sandboxMode 縺ｯ險ｱ蜿ｯ蛟､縺ｸ豁｣隕丞喧
- 謇ｿ隱阪Μ繧ｹ繧ｯ蛻､螳壹・逶｣譟ｻ螂醍ｴ・
  - 繝ｫ繝ｼ繝ｫ繧ｻ繝・ヨ迚・ `riskRulesVersion`・育樟陦・ `2026-02-22.r1`・・  - `approval.decision` 繝ｭ繧ｰ縺ｫ莉･荳九ｒ蠢・井ｿ晏ｭ・
    - `riskRulesVersion`
    - `riskRuleIds`・医ヲ繝・ヨ縺励◆ rule id 荳隕ｧ・・    - `riskInputSummary`・亥愛螳壼・蜉帙・隕∫ｴ・ｼ・  - turn artifact `manifest.json` 縺ｫ莉･荳九ｒ蠢・井ｿ晏ｭ・
    - `approvalDecisions.riskRulesVersion`
    - `approvalDecisions.records[].riskRuleIds`
    - `approvalDecisions.records[].riskInputSummary`
  - `riskInputSummary` 縺ｮ萓・
    - `commandExecution`: 豁｣隕丞喧繧ｳ繝槭Φ繝峨〉etry譛臥┌縲∝､夜Κ蜿門ｾ・pipe螳溯｡梧怏辟｡
    - `fileChange`: 螟画峩謨ｰ縲∝炎髯､謨ｰ縲『orkspace螟門､画峩謨ｰ縲∝ｯｾ雎｡繝代せ隕∫ｴ・- 繝ｪ繧ｹ繧ｯ rule id・域栢邊具ｼ・
  - commandExecution:
    - `cmd.destructive_delete`
    - `cmd.remote_fetch_pipe_exec`
    - `cmd.disk_operation`
    - `cmd.system_control`
    - `cmd.retry_hint`
  - fileChange:
    - `file.delete_change`
    - `file.outside_workspace_change`
    - `file.bulk_change`
    - `file.multi_change`
- prompt蛻・ｊ隧ｰ繧∫屮譟ｻ:
  - `buildPromptAudit` 縺ｧ `inputLength/outputLength/truncated` 繧堤函謌・  - operation log (`api.exec`, `api.exec_prompt_truncated`) 縺ｫ險倬鹸
  - NDJSON `activity(prompt_truncated)` 縺ｨ turn artifact 縺ｫ險ｼ霍｡菫晏ｭ・- 髱槫ｯｾ隧ｱ `requestUserInput` 繝昴Μ繧ｷ繝ｼ:
  - 迺ｰ蠅・､画焚: `CODEX_REQUEST_USER_INPUT_POLICY`
  - 譌｢螳壼､: `blocked`・磯撼蟇ｾ隧ｱ縺ｧ縺ｮ遒ｺ隱崎ｦ∵ｱゅ・ `-32004` 縺ｧ蛛懈ｭ｢・・  - turn蜊倅ｽ阪〒 `requestUserInputPolicy` 繧・`/api/exec` 縺九ｉ蜿礼炊蜿ｯ閭ｽ
  - `thread/start` config 縺ｨ `turn context` 縺ｮ荳｡譁ｹ縺ｫ莨晄眺
  - 譏守､ｺ繝｢繝ｼ繝・ `auto-default` / `auto-empty`
  - `auto-*` 蛻ｩ逕ｨ譎ゅ・ `tool.user_input_assumption` 縺ｫ莉ｮ螳壹ｒ險倬鹸
- 菴懈･ｭ繝・ぅ繝ｬ繧ｯ繝医Μ讀懆ｨｼ:
  - 蟄伜惠繝ｻ繝・ぅ繝ｬ繧ｯ繝医Μ遞ｮ蛻･繧堤｢ｺ隱・
## 11. 蜿ｯ隕ｳ貂ｬ諤ｧ・・peration Log・・
`CompactOperationLog` 縺ｮ讖溯・:

- 繝ｬ繝吶Ν蛻･繝ｭ繧ｰ・・ff/core/standard/verbose・・- 繧ｵ繧､繧ｺ荳企剞邂｡逅・ｼ・rim・・- 譌･谺｡蛻・牡・医が繝励す繝ｧ繝ｳ・・- 蝨ｧ邵ｮ繧｢繝ｼ繧ｫ繧､繝厄ｼ医が繝励す繝ｧ繝ｳ・・
`/api/runtime.operationLog` 縺ｧ迴ｾ蝨ｨ險ｭ螳壹ｒ蜿ら・蜿ｯ閭ｽ縲・`/api/runtime.nonInteractiveUserInput` 縺ｨ `/api/diagnostics.nonInteractiveUserInput` 縺ｧ
`requestUserInput` 縺ｮ髱槫ｯｾ隧ｱ繝昴Μ繧ｷ繝ｼ險ｭ螳壹ｒ蜿ら・蜿ｯ閭ｽ縲・
## 12. 繧ｬ繝舌リ繝ｳ繧ｹ・・arent/Child + 蜩∬ｳｪ繧ｲ繝ｼ繝茨ｼ・
繝ｫ繝ｼ繝ｫ蜃ｺ蜈ｸ:

- `AGENTS.md`
- `.codex/agents/default.toml`
- `.codex/agents/release-manager.toml`

譛牙柑繝ｫ繝ｼ繝ｫ:

- 5繧ｹ繝・ャ繝鈴嚴螻､繝輔Ο繝ｼ
- 螳溯｡梧凾繧ｬ繝舌リ繝ｳ繧ｹ蠑ｷ蛻ｶ・・evaluateAgentGovernance`・・
  - `frontend_worker`: `web/` 縺ｮ縺ｿ邱ｨ髮・ｨｱ蜿ｯ
  - `backend_worker`: `server.js`, `scripts/`, `docs/` 繧堤ｷｨ髮・ｨｱ蜿ｯ
  - `infra_worker`: `.codex/`, `logs/`, 襍ｷ蜍輔せ繧ｯ繝ｪ繝励ヨ縲～docs/` 繧堤ｷｨ髮・ｨｱ蜿ｯ
  - `tester`: `scripts/` 驟堺ｸ九°縺､ test/spec/smoke/harness 逶ｸ蠖薙・縺ｿ險ｱ蜿ｯ
  - `reviewer` / `explorer`: read-only・・ommand/fileChange/toolCall 繧呈拠蜷ｦ・・  - 騾ｸ閼ｱ譎ゅ・謇ｿ隱阪お繝ｳ繧ｸ繝ｳ縺・`agent_governance_block` 縺ｨ縺励※ `decline`
- Dynamic QA Gate:
  - Over-delivery縺ｧ蛻・ｲ・繧ｿ繧､繝槭・/繝輔か繝ｼ繝ｫ繝舌ャ繧ｯ遲峨ｒ霑ｽ蜉縺励◆蝣ｴ蜷医・    tester縺ｫ繧医ｋ蟆ら畑閾ｪ蜍輔ユ繧ｹ繝医′蠢・・  - 險ｼ霍｡荳崎ｶｳ縺ｯ release_manager 縺・FAIL
- Auto-Documentation Gate:
  - Step 5蜑阪↓譛ｬ譖ｸ蜷梧悄蠢・・  - 譛ｪ蜷梧悄縺ｯ COMPLETED 荳榊庄

## 13. 繝・せ繝域ｧ区・

### 13.1 `scripts/app_server_smoke_test.js`

讀懆ｨｼ蟇ｾ雎｡:

- app-server襍ｷ蜍輔→蛻晄悄繝上Φ繝峨す繧ｧ繧､繧ｯ
- thread/start, turn/start, interrupt, turn/completed
- harness `/api/runtime`
- `/api/exec` 讓呎ｺ也ｵ瑚ｷｯ縺ｨ latest_turn 譖ｴ譁ｰ
- 譛ｪ遏･API縺ｮ404

### 13.2 `scripts/agent_topography_test.js`

讀懆ｨｼ蟇ｾ雎｡:

- `TOPOGRAPHY_REFRESH_MS=10000`
- ticker wiring
- boot譎ゅ・ticker髢句ｧ・- `/api/runtime` 繝輔か繝ｼ繝ｫ繝舌ャ繧ｯ蛻・ｲ・- `/api/agent-topography` 邨ｱ蜷亥ｿ懃ｭ・
### 13.3 `scripts/request_user_input_policy_test.js`

讀懆ｨｼ蟇ｾ雎｡:

- `CODEX_REQUEST_USER_INPUT_POLICY` 縺ｮ豁｣隕丞喧・・lias/fallback・・- `blocked` 譎ゅ・蛛懈ｭ｢豎ｺ螳・- `auto-empty` 譎ゅ・遨ｺ蝗樒ｭ疲・遉ｺ
- `auto-default` 譎ゅ・譌｢螳壼､/謗ｨ螂ｨ驕ｸ謚槭・閾ｪ蜍募屓遲・- 雉ｪ蝠終D谺關ｽ譎ゅ・莉ｮ螳夊ｨ倬鹸

### 13.4 `scripts/agent_governance_policy_test.js`

讀懆ｨｼ蟇ｾ雎｡:

- role蜷肴ｭ｣隕丞喧
- `reviewer` 縺ｮ read-only 諡貞凄
- `frontend_worker` 縺ｮ path scope 蠑ｷ蛻ｶ
- `tester` 縺ｮ verification-only 蠑ｷ蛻ｶ
- unknown role / `worker` 縺ｮ fallback 謖吝虚

### 13.5 `scripts/exec_payload_policy_test.js`

讀懆ｨｼ蟇ｾ雎｡:

- prompt逶｣譟ｻ・亥・繧願ｩｰ繧∵怏辟｡・・- 逕ｻ蜒丞粋險医し繧､繧ｺ蛻､螳夲ｼ・ecoded/encoded・・- byte陦ｨ遉ｺ繝輔か繝ｼ繝槭ャ繝・
### 13.6 `scripts/approval_risk_audit_test.js`

讀懆ｨｼ蟇ｾ雎｡:

- `classifyApprovalRisk()` 縺ｮ rule id 莉倅ｸ・- `buildApprovalAuditRecord()` 縺ｮ逶｣譟ｻ繝輔ぅ繝ｼ繝ｫ繝・- turn artifact `manifest.json` 縺ｸ縺ｮ `approvalDecisions` 菫晏ｭ・
## 14. 譌｢遏･縺ｮ蛻ｶ邏・
1. UI邨瑚ｷｯ譌｢螳壹・ `intake`縲，LI譌｢螳壹・繝ｭ繝輔ぃ繧､繝ｫ縺ｯ `default` 縺ｧ蜈･蜿｣縺檎焚縺ｪ繧九・2. `item/tool/call` 縺ｯ謇ｿ隱阪・繝ｪ繧ｷ繝ｼ蛻､螳壹・逶｣譟ｻ繝ｭ繧ｰ縺ｾ縺ｧ縺ｯ螳溯｣・ｸ医∩縺縺後‥ynamic tool bridge 縺ｯ譛ｪ螳溯｣・・縺溘ａ螟ｱ謨怜ｿ懃ｭ斐〒霑斐☆縲・3. 螳溯｡悟刀雉ｪ縺ｯ螟夜Κ codex runtime 蜿ｯ逕ｨ諤ｧ縺ｫ萓晏ｭ倥☆繧九・4. requirement_guard 諡｡蠑ｵ縺ｯ譌｢螳唹FF縺ｧ縲＾N譎ゅ・繝励Ο繝ｳ繝励ヨ螟画鋤謖吝虚縺悟､牙喧縺吶ｋ縲・
## 15. 遞ｼ蜒崎ｨｼ霍｡・・026-02-22, 迴ｾ蝨ｨ螳溯｡鯉ｼ・
螳溯｡後さ繝槭Φ繝・

1. `node --check server.js` -> PASS
2. `node --check web/app.js` -> PASS
3. `node scripts/agent_governance_policy_test.js` -> PASS (`total=7 pass=7 fail=0`)
4. `node scripts/exec_payload_policy_test.js` -> PASS (`total=5 pass=5 fail=0`)
5. `node scripts/request_user_input_policy_test.js` -> PASS (`total=6 pass=6 fail=0`)
6. `node scripts/adversarial_shadow_policy_test.js` -> PASS (`total=5 pass=5 fail=0`)
7. `node scripts/approval_risk_audit_test.js` -> PASS (`total=4 pass=4 fail=0`)
8. `node scripts/turn_artifact_security_test.js` -> PASS (`total=4 pass=4 fail=0`)
9. `node scripts/app_server_smoke_test.js` -> PASS
10. `node scripts/app_server_cli_smoke_test.js` -> FAIL (`spawn EPERM`, 螳溯｡檎腸蠅・宛邏・
11. `node scripts/requirement_guard_validator_test.js` -> FAIL・育樟陦梧僑蠑ｵ譌｢螳壼､縺ｨ繝・せ繝域悄蠕・､縺ｮ荳堺ｸ閾ｴ・・12. `node scripts/agent_topography_test.js` -> FAIL・育ｵｱ蜷医メ繧ｧ繝・け縺・worker 邨檎罰襍ｷ蜍輔ｒ蜑肴署・・
遒ｺ隱阪〒縺阪◆縺薙→:

- turn interrupt/terminal 螳御ｺ・- `/api/runtime` 豁｣蟶ｸ
- `/api/exec` 讓呎ｺ也ｵ瑚ｷｯ豁｣蟶ｸ
- `/api/exec` idempotency duplicate-completed 縺・`200` 縺ｧ霑斐ｋ
- `GET /api/exec/idempotency/:key` 縺悟茜逕ｨ蜿ｯ閭ｽ
- unknown API 404
- role/path騾ｸ閼ｱ譎ゅ・繧ｬ繝舌リ繝ｳ繧ｹ諡貞凄繝ｭ繧ｸ繝・け縺悟虚菴・- prompt蛻・ｊ隧ｰ繧・逕ｻ蜒丞粋險医し繧､繧ｺ蛻､螳壹Ο繧ｸ繝・け縺ｮ蜊倅ｽ薙ユ繧ｹ繝医′騾夐℃
- FAIL 2莉ｶ縺ｯ螳溯｣・ラ繝ｪ繝輔ヨ・医ユ繧ｹ繝域悄蠕・・蜿､縺包ｼ峨∪縺溘・螳溯｡檎腸蠅・宛邏・↓襍ｷ蝗

## 16. 菫晏ｮ亥･醍ｴ・ｼ域峩譁ｰ繝ｫ繝ｼ繝ｫ・・
莉墓ｧ伜､画峩譎ゅ・縲ヾtep 5蜑阪↓譛ｬ譖ｸ繧呈峩譁ｰ縺吶ｋ縺薙→縲・ 
譛菴朱剞莉･荳九ｒ霑ｽ險倥☆繧九％縺ｨ縲・
- Baseline螟画峩轤ｹ
- Over-delivery螟画峩轤ｹ縺ｨ險ｭ險域э蝗ｳ
- 髢｢騾｣繝・せ繝茨ｼ域眠隕・譖ｴ譁ｰ・・- 螳溯｡瑚ｨｼ霍｡・医さ繝槭Φ繝峨→邨先棡・・
譛ｪ蜷梧悄縺ｮ蝣ｴ蜷医√ち繧ｹ繧ｯ縺ｯ螳御ｺ・桶縺・↓縺励↑縺・・

## 17. Performance Indicator Sync (2026-02-22)

Design intent:
- Show current-session cumulative performance in the Web UI, not only per-turn values.
- Keep totals stable across UI refresh by sourcing baseline metrics from server runtime state.

Baseline delivery:
- Added session-level cumulative metrics: consumed tokens and processing time (ms).
- Added realtime update path so the UI reflects in-flight turn progress before turn completion.

Over-delivery:
- Added sparkline visualization for cumulative token and processing-time trends.
- Added in-flight delta display (+tokens, +ms) alongside cumulative totals.

Backend sync (server.js):
- Added in-memory session performance tracker keyed by sessionRef.
- Aggregates cumulative token usage + cumulative processing time per session.
- Tracks in-flight turn usage and elapsed time for realtime snapshot.
- GET /api/runtime now includes sessionPerformance and session_performance.
- NDJSON tokenUsage event now includes threadId and turnId.

Frontend sync (web/):
- web/index.html: added Performance Indicator panel and render targets.
- web/app.js: added runtime-sync + stream event aggregation + sparkline rendering.
- web/styles.css: added panel styles and responsive/telemetry-off behavior.

Verification evidence:
1. node --check server.js -> PASS
2. node --check web/app.js -> PASS
3. node scripts/app_server_smoke_test.js -> PASS
4. Runtime probe (server startup + GET /api/runtime) -> PASS (mode=app-server, HTTP 200)

Residual risk:
- Session performance data is in-memory. Restarting server.js resets cumulative counters.

## 18. Batch Automation Integration (2026-02-28)

Design intent:
- Remove the temporary PoC-only separation in UI.
- Keep one standard harness UI while retaining both execution paths:
  - Interactive: `POST /api/exec`
  - Batch: scheduler/manual via batch runner

Baseline delivery:
- Added first-class batch routes:
  - `GET /api/batch/status`
  - `POST /api/batch/run`
  - `POST /api/batch/scheduler`
- Kept legacy PoC aliases for compatibility:
  - `GET /api/poc/status`
  - `POST /api/poc/batch/run`
  - `POST /api/poc/batch/simulate-tick`
- Updated status payload `batchPath` to the integrated route (`POST /api/batch/run`).

UI delivery:
- Removed the standalone PoC comparison panel from `web/01.HarnesUI/index.html`.
- Removed the temporary `Automation` side panel as well.
- Current operation model is backend-only for batch/scheduler settings.
  - Operators control batch routes via API or backend runtime configuration.
  - Main harness UI now exposes only interactive chat execution.

Over-delivery:
- Added UI-side endpoint fallback (`/api/batch/*` -> `/api/poc/*`) for smooth compatibility with older server builds.

Verification evidence:
1. `node --check server.js`
2. `node --check web/01.HarnesUI/app.js`
3. `node scripts/app_server_smoke_test.js`
4. Runtime probe after UI launch: `GET /api/runtime` returns HTTP 200

Residual risk:
- Operation log event names still use `poc.*` for backward continuity even though routes are integrated.

## 18.1 Harness Compliance Verdict UI (2026-02-28)

Design intent:
- Make it explicit whether a turn appears to follow the intended harness flow, not only show raw state cards.

Baseline delivery:
- Added a dedicated verdict area to the Harness panel:
  - `WAIT`, `RUNNING`, `PASS`, `WARN`, `FAIL`
  - reason text shown directly under the verdict badge
- Added first-row highlight entry:
  - `準拠判定: <verdict> / <reason>`

Heuristic signals used:
- `turn/start`
- `turn/completed`
- `plan/update`
- child-dispatch evidence (`collab agent tool` / `spawn_agent` / `receivers=`)
- terminal turn status and failed/error trace events

Verification evidence:
1. `node --check web/01.HarnesUI/app.js`
2. Runtime probe after UI launch: `GET /api/runtime` returns HTTP 200

## 19. CLI Harness Sync (2026-02-22)

Design intent:
- Unify harness behavior across both user entry points:
  - `Web -> server.js -> codex app-server`
  - `CLI -> codex app-server`
- Keep App Server protocol (`initialize` then `initialized`) as the single integration contract.

Baseline delivery:
- Added `scripts/app_server_cli_harness.js`.
  - Directly spawns `codex app-server`.
  - Performs required handshake (`initialize` -> `initialized`).
  - Supports `thread/start`, `thread/resume`, `turn/start`, `turn/interrupt`.
  - Streams `item/agentMessage/delta` and finalizes on `turn/completed`.
  - Handles approval requests (`commandExecution` / `fileChange`) with policy-based auto response.
  - Supports both one-shot (`--prompt`) and interactive REPL mode.
- Added launcher `start_codex_cli_harness.bat` for Windows operators.

Over-delivery:
- Added CLI-specific smoke test `scripts/app_server_cli_smoke_test.js`.
  - Runs one-shot harness path with `--json`.
  - Verifies terminal status, thread id, turn id, and non-empty output.

Verification evidence:
1. `node --check scripts/app_server_cli_harness.js`
2. `node --check scripts/app_server_cli_smoke_test.js`
3. `node scripts/app_server_smoke_test.js`
4. `node scripts/app_server_cli_smoke_test.js`

Residual risk:
- The CLI and Web paths intentionally keep separate in-memory thread/session state holders.
- Cross-surface session continuity requires explicit thread id handoff (`--thread <id>` or `/resume <id>`).

## 20. requestUserInput Non-Interactive Hardening (2026-02-22)

Design intent:
- 髱槫ｯｾ隧ｱ螳溯｡後〒 `tool/requestUserInput` 縺梧擂縺溷ｴ蜷医↓縲∵囓鮟咏ｩｺ蝗樒ｭ斐〒縺ｯ縺ｪ縺・  譏守､ｺ繝昴Μ繧ｷ繝ｼ縺ｧ蛻ｶ蠕｡縺励∝愛譁ｭ譬ｹ諡繧堤屮譟ｻ蜿ｯ閭ｽ縺ｫ縺吶ｋ縲・
Baseline delivery:
- `server.js` 縺ｮ髱槫ｯｾ隧ｱ `requestUserInput` 譌｢螳壼虚菴懊ｒ `blocked` 縺ｫ螟画峩縲・- `blocked` 譎ゅ・ `-32004` 繧定ｿ斐＠縲√ち繝ｼ繝ｳ蜀・〒譖匁乂縺ｪ邯咏ｶ壹ｒ髦ｲ豁｢縲・- `tool.user_input_request` 繝ｭ繧ｰ縺ｸ `userInputPolicy` 縺ｨ莉ｶ謨ｰ諠・ｱ繧定ｿｽ蜉縲・
Over-delivery:
- 蜈ｱ騾壹・繝ｪ繧ｷ繝ｼ繝｢繧ｸ繝･繝ｼ繝ｫ `scripts/lib/request_user_input_policy.js` 繧定ｿｽ蜉縲・- 譏守､ｺ繝｢繝ｼ繝・`auto-default` / `auto-empty` 繧貞ｮ溯｣・＠縲～auto-*` 縺ｮ莉ｮ螳壹ｒ
  `tool.user_input_assumption` 縺ｫ險倬鹸縲・- `/api/runtime` 縺ｨ `/api/diagnostics` 縺ｫ髱槫ｯｾ隧ｱ `requestUserInput` 繝昴Μ繧ｷ繝ｼ繧貞・髢九・- CLI harness 縺ｫ `--request-user-input` 繧ｪ繝励す繝ｧ繝ｳ繧定ｿｽ蜉縲・- smoke邉ｻ繝上・繝阪せ縺ｯ譏守､ｺ逧・↓ `auto-empty` 繧帝∈謚槫庄閭ｽ縺ｨ縺励・撼蟇ｾ隧ｱ驕狗畑譁ｹ驥昴ｒ
  繧ｳ繝ｼ繝我ｸ翫〒蜿ｯ隕門喧縲・
Verification evidence:
1. `node --check server.js` -> PASS
2. `node --check scripts/app_server_cli_harness.js` -> PASS
3. `node --check scripts/app_server_smoke_test.js` -> PASS
4. `node --check scripts/lib/request_user_input_policy.js` -> PASS
5. `node scripts/request_user_input_policy_test.js` -> PASS (`total=6 pass=6 fail=0`)
6. `node scripts/app_server_smoke_test.js` -> PASS
7. `node scripts/app_server_cli_smoke_test.js` -> FAIL (`spawn EPERM`, 螳溯｡檎腸蠅・宛邏・

Residual risk:
- CLI smoke 縺ｯ螳溯｡檎腸蠅・′ `codex app-server` 蟄舌・繝ｭ繧ｻ繧ｹ襍ｷ蜍輔ｒ諡貞凄縺吶ｋ縺ｨ螟ｱ謨励☆繧九・- `auto-default` 縺ｯ雉ｪ蝠上せ繧ｭ繝ｼ繝樔ｾ晏ｭ倥・謗ｨ螳壼屓遲斐↑縺ｮ縺ｧ縲∵悽逡ｪ驕狗畑縺ｧ縺ｯ `blocked` 繧呈耳螂ｨ縲・
## 21. Risk Decision Auditability Sync (2026-02-22)

Design intent:
- 謇ｿ隱阪Μ繧ｹ繧ｯ蛻､螳壹ｒ隨ｬ荳芽・屮譟ｻ蜿ｯ閭ｽ縺ｫ縺励～high risk` 蛻､螳壹・譬ｹ諡繧剃ｺ句ｾ瑚ｿｽ霍｡縺ｧ縺阪ｋ迥ｶ諷九↓縺吶ｋ縲・
Baseline delivery:
- `riskRulesVersion` 繧貞ｰ主・縺励∝愛螳夂ｵ先棡縺ｸ蟶ｸ譎ゆｻ倅ｸ弱・- `approval.decision` 繝ｭ繧ｰ縺ｫ `riskRuleIds` / `riskInputSummary` 繧定ｿｽ蜉縲・- `manifest.json` 縺ｫ `approvalDecisions` 繧ｻ繧ｯ繧ｷ繝ｧ繝ｳ繧定ｿｽ蜉縺励・  蜷・価隱榊愛螳壹・ `riskRulesVersion` / `riskRuleIds` / `riskInputSummary` 繧剃ｿ晏ｭ倥・
Over-delivery:
- 繝ｫ繝ｼ繝ｫID繧・operation蛻･縺ｫ譏守､ｺ蛹厄ｼ・ommandExecution / fileChange / generic・峨・- 蛻､螳壼・蜉幄ｦ∫ｴ・ｒ讓呎ｺ門喧縺励…ommand/file 縺ｮ荳ｻ隕∝愛譁ｭ霆ｸ繧貞崋螳壹ヵ繧ｩ繝ｼ繝槭ャ繝亥喧縲・- dedicated test `scripts/approval_risk_audit_test.js` 繧定ｿｽ蜉縲・
Verification evidence:
1. `node --check server.js`
2. `node scripts/approval_risk_audit_test.js`
3. `node scripts/app_server_smoke_test.js`

Residual risk:
- 繝ｫ繝ｼ繝ｫID菴鍋ｳｻ縺ｯ莠呈鋤邯ｭ謖√′蠢・ｦ√Ｓename譎ゅ・ `riskRulesVersion` 繧貞ｿ・★譖ｴ譁ｰ縺吶ｋ縺薙→縲・
## 22. `/api/exec` Security Hardening (2026-02-22)

Design intent:
- Treat `/api/exec` as the highest-risk state-change API because it can trigger command/file-change actions.
- Align its guard strength with `/api/open-cmd` so local-browser attack paths are explicitly constrained.

Baseline delivery:
- Added request guard for `POST /api/exec` before body parsing:
  - `Origin` / `Referer` local-origin validation (same loopback + same port)
  - control token validation (`x-codex-control-token`, token from runtime)
  - strict `Content-Type` check (`application/json` only)
- Added blocked-attempt audit log event:
  - `api.exec_blocked` with reason/status/origin/referer/host/token-presence/content-type

Over-delivery:
- Runtime contract now exposes `execApi` capability snapshot:
  - `tokenHeader`, `tokenRequired`, `originCheck`, `contentType`
- Web UI now sends control token header for `/api/exec`.
- Extended smoke test to verify:
  - unauthenticated `/api/exec` -> `403`
  - non-json `/api/exec` -> `415`
  - authenticated `/api/exec` still works end-to-end

Verification evidence:
1. `node --check server.js` -> PASS
2. `node --check web/app.js` -> PASS
3. `node --check scripts/app_server_smoke_test.js` -> PASS
4. `node scripts/app_server_smoke_test.js` -> PASS
5. `node scripts/app_server_cli_smoke_test.js` -> FAIL (`spawn EPERM`, 螳溯｡檎腸蠅・宛邏・

Residual risk:
- This hardening assumes browser-originated calls; non-browser local clients must attach both origin and control token intentionally.
- `/api/poc/batch/*` remains outside this guard scope and should be evaluated separately if remote surface expansion is planned.

## 23. Adversarial Shadow Review (2026-02-22)

Design intent:
- Add a first-step GAN-like quality loop without changing the user-visible completion contract.
- Keep `/api/exec` latency stable by running adversarial review asynchronously after terminal completion.

Baseline delivery:
- Added rule-based `Red/Judge` evaluator:
  - `scripts/lib/adversarial_shadow_policy.js`
  - Inputs: prompt, final answer, terminal status
  - Outputs: findings, severity counts, score, judge decision
- Added server integration in `server.js`:
  - Trigger point: after `turn/completed` finalization in `executeTurnStreaming` (`finalizeTurn`)
  - Execution mode: async queue (`setImmediate`) so response streaming is not blocked
  - Operation log events:
    - `shadow.review`
    - `shadow.review_flag` (threshold miss)
    - `shadow.review_failed`

Over-delivery:
- Added runtime/diagnostics visibility for operators:
  - `/api/runtime` now includes:
    - `adversarialShadow`
    - `adversarial_shadow`
  - `/api/diagnostics` now includes:
    - `adversarialShadow`
- Added environment controls:
  - `CODEX_ADVERSARIAL_SHADOW_ENABLED` (default: off)
  - `CODEX_ADVERSARIAL_SHADOW_MIN_SCORE`
  - `CODEX_ADVERSARIAL_SHADOW_MAX_PROMPT_CHARS`
  - `CODEX_ADVERSARIAL_SHADOW_MAX_ANSWER_CHARS`
- Added dedicated regression test:
  - `scripts/adversarial_shadow_policy_test.js`

Verification evidence:
1. `node --check server.js` -> PASS
2. `node --check scripts/lib/adversarial_shadow_policy.js` -> PASS
3. `node --check scripts/adversarial_shadow_policy_test.js` -> PASS
4. `node scripts/adversarial_shadow_policy_test.js` -> PASS (`total=5 pass=5 fail=0`)
5. `node scripts/app_server_smoke_test.js` -> PASS

Residual risk:
- Initial `Red/Judge` is heuristic (rule-based), not model-based adversarial generation.
- Review findings currently affect logs/runtime telemetry only; they do not rewrite user output yet.
- If `CODEX_ADVERSARIAL_SHADOW_ENABLED=0`, no review record is produced (intentional for phased rollout).

## 24. Auditability and Governance Hardening (2026-02-22)

Design intent:
- Keep full turn evidence useful for audit while reducing secret/PII leakage risk.
- Make idempotency behavior operationally usable for both duplicate-completed and duplicate-running requests.
- Strengthen governance policy shape so role/path rules are sourced from one config contract with an explicit exception procedure.

Baseline delivery:
- Turn artifact pre-save redaction:
  - Added masking for secret/token patterns across `events/items/diff/stdout/stderr`.
  - Added redaction summary to `manifest.json` (`redaction.replacements`, `redaction.byRule`).
- Turn artifact retention and quota control:
  - Added `CODEX_TURN_ARTIFACTS_MAX_BYTES` and `CODEX_TURN_ARTIFACTS_MAX_DAYS`.
  - Added startup/finalization pruning with operation log event `turn.artifacts.pruned`.
  - Added retention policy snapshot to artifact manifest and `/api/runtime.evidenceArtifacts`.
- Idempotency response model:
  - Duplicate key in `running` state remains `409`.
  - Duplicate key in `completed` state returns `200` with duplicate snapshot/result metadata.
  - Added `GET /api/exec/idempotency/:key` with optional `wait_ms` follow/poll behavior.
- Governance source-of-truth and exception procedure:
  - Moved contract mapping to `scripts/config/agent_governance_contracts.json`.
  - Added parent-only override procedure (`override.requestedBy`, `override.reason`) in governance evaluation.
  - Added override fields to approval audit records and turn artifact manifest audit entries.

Over-delivery:
- Added dedicated security/regression test:
  - `scripts/turn_artifact_security_test.js`
  - Validates redaction masking, nested payload redaction, retention pruning, and idempotency helper snapshot behavior.
- Added distribution safeguard:
  - `.gitignore` now excludes `logs/turns/` and local operation log artifacts.

New/updated runtime contract:
- `/api/runtime.evidenceArtifacts` now includes:
  - `maxBytes`, `maxDays`, `redaction.enabled`, `redaction.placeholder`
- `/api/runtime.idempotency` now includes:
  - `statusApi.path`, `statusApi.waitMaxMs`
- `/api/runtime.governancePolicy` now exposes governance policy snapshot metadata.

Verification evidence:
1. `node --check server.js` -> PASS
2. `node scripts/agent_governance_policy_test.js` -> PASS (`total=7 pass=7 fail=0`)
3. `node scripts/turn_artifact_security_test.js` -> PASS (`total=4 pass=4 fail=0`)
4. `node scripts/app_server_smoke_test.js` -> PASS
   - includes duplicate-completed idempotency `200`
   - includes `GET /api/exec/idempotency/:key` lookup
   - includes artifact manifest redaction/retention field checks

Residual risk:
- Redaction is pattern-based and may miss novel secret formats not covered by current rules.
- Idempotency records remain in-memory and are reset on server restart.

## 25. TEST Corporate Website Sync (2026-02-22)

Design intent:
- Build a standalone corporate-style homepage under `TEST/` as requested.
- Keep implementation local and dependency-light (static HTML/CSS/JS only).

Baseline delivery:
- Added `TEST/index.html` with a major-enterprise style structure:
  - sticky global header + mobile menu
  - hero area + KPI highlight panel
  - business domains, strategy timeline, sustainability, news, careers, footer
- Added `TEST/styles.css`:
  - blue enterprise visual direction via CSS variables
  - responsive layouts for desktop/mobile
  - staged reveal motion and polished section styling
- Added `TEST/app.js`:
  - mobile navigation toggle behavior
  - intersection-based reveal animation
  - KPI number count-up animation

Over-delivery:
- None beyond requested scope (no backend/API/runtime behavior changes).

Verification evidence:
1. `node --check TEST/app.js` -> PASS
2. File presence check -> PASS (`TEST/index.html`, `TEST/styles.css`, `TEST/app.js`)
3. `node --check TEST/index.html` -> N/A (Node syntax check does not support `.html`)

Residual risk:
- This is a static page scaffold; no CMS/data-feed integration is included.

## 26. Operation Log Level Max Sync (2026-02-22)

Design intent:
- Set operation log verbosity to the maximum level by default, as requested.

Baseline delivery:
- Updated `server.js` default `CODEX_OPERATION_LOG_LEVEL` fallback from `core` to `verbose`.
- Synced the environment-variable default table in `docs/SYSTEM_ARCHITECTURE.html` (`core` -> `verbose`).

Over-delivery:
- None beyond requested scope.

Verification evidence:
1. `node --check server.js` -> PASS
2. `node scripts/app_server_smoke_test.js` -> PASS

Residual risk:
- If `CODEX_OPERATION_LOG_LEVEL` is explicitly set in the process environment, that value still overrides the default fallback.

## 27. TEST Corporate Website Rebuild (2026-02-22)

Design intent:
- Keep existing `web/` harness UI untouched and deliver the requested enterprise website as a standalone artifact in `TEST/`.
- Provide a production-style static front-end with clear information architecture and responsive behavior.

Baseline delivery:
- Added new `TEST/index.html`:
  - enterprise hero, service pillars, rollout program timeline, governance, case studies, contact section
  - semantic structure and accessible navigation labels
- Added new `TEST/styles.css`:
  - dedicated visual system (brand tokens, cards, gradients, backdrop, responsive breakpoints)
  - desktop/mobile layout handling for all major sections
- Added new `TEST/app.js`:
  - mobile navigation toggle
  - scroll-state header behavior
  - reveal-on-scroll animation
  - KPI counter animation
  - footer year auto-update

Over-delivery:
- Added atmosphere and motion primitives (floating backdrop orbs, grid layer, staged reveal timing) while keeping the build dependency-free (plain HTML/CSS/JS).

Verification evidence:
1. `node --check TEST/app.js` -> PASS
2. `node --check web/app.js` -> PASS
3. `node scripts/app_server_smoke_test.js` -> PASS
   - includes harness startup and `GET /api/runtime` readiness verification

Residual risk:
- Contact form is currently static and does not submit to a backend endpoint.

## 28. TEST Venture Website Visual Refresh (2026-02-23)

Design intent:
- Eliminate template-like "AI feel" from `TEST/` and rebuild the page with a sharper venture-style visual language.
- Keep the implementation static and local-first (HTML/CSS/JS only), with no backend coupling.

Baseline delivery:
- Rebuilt `TEST/index.html` content architecture and copy:
  - new hero narrative, refined section taxonomy, and stronger brand voice
  - preserved existing JS hook ids/classes (`menuToggle`, `globalNav`, `yearNow`, `.reveal`, `[data-counter]`)
- Replaced `TEST/styles.css` design system:
  - new color direction (warm neutral + coral + cobalt), typography hierarchy, and card rhythm
  - stronger asymmetric hero composition, section surfaces, and non-generic atmosphere layers
  - responsive behavior updated for desktop/tablet/mobile breakpoints

Over-delivery:
- Added motion/accessibility refinement with `prefers-reduced-motion` handling.
- Added external type pairing (`Outfit` + `IBM Plex Sans JP`) with safe fallback stacks.

Verification evidence:
1. `node --check TEST/app.js` -> PASS
2. Character corruption scan (`rg "\\xEF\\xBF\\xBD" TEST/index.html TEST/styles.css`) -> no matches
3. Playwright automation attempt -> BLOCKED in this environment
   - PowerShell execution policy blocks `npx.ps1`
   - `npx.cmd` install path blocked by npm `EACCES` in sandboxed setup

Residual risk:
- Google Fonts may not load in offline/restricted networks; CSS fallback fonts are in place.
- Headless browser visual regression checks could not be completed under current command/network constraints.

## 29. Adversarial Re-answer Loop Sync (2026-02-23)

Design intent:
- Move from "shadow-only scoring" to a real adversarial retry loop for answer quality.
- Keep App Server terminal contract unchanged (`turn/completed` per turn) while allowing controlled in-request retries.

Baseline delivery:
- Added retry policy module: `scripts/lib/adversarial_loop_policy.js`
  - `shouldRetryAdversarialLoop(...)`
  - `buildAdversarialRetryPrompt(...)`
- Updated `server.js` execution flow in `executeTurnStreaming`:
  - After each turn finalization, run synchronous adversarial review when loop mode is enabled.
  - If Judge verdict is non-pass and retry budget remains, auto-start a new turn with a revised prompt.
  - Emit retry activity event (`activity: adversarial_retry`) and operation logs:
    - `shadow.loop_retry`
    - `shadow.loop_retry_failed`
    - `shadow.loop_stop`

Over-delivery:
- Runtime/diagnostics visibility for loop controls:
  - `/api/runtime.adversarialShadow.loop`
  - `/api/diagnostics.adversarialShadow.loop`
- Added loop env controls:
  - `CODEX_ADVERSARIAL_LOOP_ENABLED`
  - `CODEX_ADVERSARIAL_LOOP_MAX_RETRIES`
- Added dedicated automated tests:
  - `scripts/adversarial_loop_policy_test.js` (policy behavior)
  - `scripts/adversarial_loop_wiring_test.js` (server wiring guard)
- Extended smoke validation (`scripts/app_server_smoke_test.js`) to assert runtime loop snapshot exists.

Verification evidence:
1. `node --check server.js` -> PASS
2. `node --check scripts/lib/adversarial_loop_policy.js` -> PASS
3. `node --check scripts/adversarial_loop_policy_test.js` -> PASS
4. `node --check scripts/adversarial_loop_wiring_test.js` -> PASS
5. `node --check scripts/app_server_smoke_test.js` -> PASS
6. `node scripts/adversarial_shadow_policy_test.js` -> PASS (`total=5 pass=5 fail=0`)
7. `node scripts/adversarial_loop_policy_test.js` -> PASS (`total=4 pass=4 fail=0`)
8. `node scripts/adversarial_loop_wiring_test.js` -> PASS
9. `node scripts/app_server_smoke_test.js` -> PASS

Residual risk:
- Retry outcome still depends on the same model family; repeated failures can occur on hard prompts.
- Retries currently preserve request scope but do not expose per-attempt controls in Web UI yet.

## 30. Skill Creator Master Package Sync (2026-02-23)

Design intent:
- Add a reusable Codex-only skill package that encodes the complete skill-authoring workflow.
- Standardize skill creation quality (naming, trigger metadata, structure, validation, iteration).

Baseline delivery:
- Added new skill package at `skills/skill-creater-maseter/` (renamed to `skills/skill-creator-master/` on 2026-03-06).
- Added required core file:
  - historical path `skills/skill-creater-maseter/SKILL.md` (current path `skills/skill-creator-master/SKILL.md`)
- Added recommended UI metadata:
  - historical path `skills/skill-creater-maseter/agents/openai.yaml` (current path `skills/skill-creator-master/agents/openai.yaml`)

Over-delivery:
- Added focused references for operation and diagnostics:
  - historical path `skills/skill-creater-maseter/references/codex-skill-checklist.md` (current path `skills/skill-creator-master/references/codex-skill-checklist.md`)
  - historical path `skills/skill-creater-maseter/references/trigger-tuning.md` (current path `skills/skill-creator-master/references/trigger-tuning.md`)
- Included manual-validation fallback flow in `SKILL.md` for environments where Python validator scripts are unavailable.

Verification evidence:
1. Skill artifact presence check:
   - historical path `skills/skill-creater-maseter/SKILL.md` (current path `skills/skill-creator-master/SKILL.md`)
   - historical path `skills/skill-creater-maseter/agents/openai.yaml` (current path `skills/skill-creator-master/agents/openai.yaml`)
   - historical path `skills/skill-creater-maseter/references/codex-skill-checklist.md` (current path `skills/skill-creator-master/references/codex-skill-checklist.md`)
   - historical path `skills/skill-creater-maseter/references/trigger-tuning.md` (current path `skills/skill-creator-master/references/trigger-tuning.md`)
2. Frontmatter/manual contract checks in `SKILL.md`:
   - `name` and `description` present
   - hyphen-case skill name
3. `default_prompt` in the then-current `agents/openai.yaml` explicitly referenced `$skill-creater-maseter`.

Residual risk:
- `scripts/quick_validate.py` could not be executed in this environment because `python` is not executable from PATH.
- Functional trigger behavior still requires real conversational usage to tune precision/recall further.

## 31. Web Designer Master Skill Sync (2026-02-23)

Design intent:
- Add a Codex skill that upgrades web output from generic AI style to distinctive, client-ready design quality.
- Provide a repeatable workflow for art direction, visual system building, and delivery gating.

Baseline delivery:
- Added skill package `skills/web-designer-master/`.
- Added required skill definition:
  - `skills/web-designer-master/SKILL.md`
- Added UI metadata:
  - `skills/web-designer-master/agents/openai.yaml`

Over-delivery:
- Added reusable references:
  - `skills/web-designer-master/references/design-brief-template.md`
  - `skills/web-designer-master/references/style-directions.md`
  - `skills/web-designer-master/references/quality-gate.md`
  - `skills/web-designer-master/references/trigger-samples.md`
- Embedded user-provided problem statement as trigger sample evidence (`Expected: YES`).

Verification evidence:
1. Skill artifact presence check:
   - `skills/web-designer-master/SKILL.md`
   - `skills/web-designer-master/agents/openai.yaml`
   - `skills/web-designer-master/references/*.md`
2. Frontmatter/manual contract checks in `SKILL.md`:
   - keys: `name`, `description`
   - hyphen-case `name`: `web-designer-master`
3. Prompt contract check:
   - `agents/openai.yaml` `default_prompt` explicitly references `$web-designer-master`
4. Trigger sample review:
   - 2 YES and 1 NO scenarios defined in `references/trigger-samples.md`

Residual risk:
- Full trigger behavior in live runs still depends on real conversational distribution and may require further description tuning.
- Automated validator (`quick_validate.py`) remains unavailable in this environment because Python is not executable.

## 32. Premium IT Website Build in withskill (2026-02-23)

Design intent:
- Build a client-delivery-grade IT company website in `archive/TESTFolder/testWebPage/withskill`.
- Eliminate generic AI-template appearance and provide a clear, intentional visual direction.

Baseline delivery:
- Added complete static site bundle:
  - `archive/TESTFolder/testWebPage/withskill/index.html`
  - `archive/TESTFolder/testWebPage/withskill/styles.css`
  - `archive/TESTFolder/testWebPage/withskill/app.js`
- Added website validation script:
  - `archive/TESTFolder/testWebPage/withskill/validate_site.js`

Over-delivery:
- Added a distinctive visual system with:
  - layered atmospheric background (`ambient-glow`, `grid-noise`)
  - asymmetric case-study composition and signature hero board
  - dedicated color token system and non-default type pairing
- Added interaction polish:
  - reveal-on-scroll
  - animated KPI counters
  - active section nav tracking
  - client-safe contact form validation messaging
  - reduced-motion support

Verification evidence:
1. `node --check archive/TESTFolder/testWebPage/withskill/app.js` -> PASS
2. `node archive/TESTFolder/testWebPage/withskill/validate_site.js` -> PASS
   - core files, section IDs, form fields, responsive hooks, and JS interaction hooks validated

Residual risk:
- Visual QA in a real browser (pixel-level cross-browser review) was not executed in this environment.
- External font loading depends on network availability; fallback fonts are defined.

## 33. withskill Japanese Enterprise Localization (2026-02-23)

Design intent:
- Localize the premium IT website in `archive/TESTFolder/testWebPage/withskill` for Japanese corporate audiences.
- Preserve the strong visual direction while making messaging, labels, and conversion flow native to Japan business context.

Baseline delivery:
- Localized copy and form UX in:
  - `archive/TESTFolder/testWebPage/withskill/index.html`
  - `archive/TESTFolder/testWebPage/withskill/app.js`
- Updated typography source to Japanese-first families in:
  - `archive/TESTFolder/testWebPage/withskill/index.html`
  - `archive/TESTFolder/testWebPage/withskill/styles.css`

Over-delivery:
- Reframed value proposition and sections around Japanese enterprise themes:
  - 合意形成しやすい進め方
  - 運用定着と継続改善
  - 中堅〜大手向けの実務的成果訴求
- Converted contact flow to Japanese business conventions:
  - localized labels/placeholders
  - localized validation feedback messages
  - JPY-like budget options

Verification evidence:
1. `node --check archive/TESTFolder/testWebPage/withskill/app.js` -> PASS
2. `node archive/TESTFolder/testWebPage/withskill/validate_site.js` -> PASS
   - structure, sections, form fields, and JS hooks remain valid

Residual risk:
- Browser-side visual QA for Japanese glyph rendering was not executed in this environment.

## 34. Japanese Line-Break Quality Tuning (2026-02-23)

Design intent:
- Fix awkward Japanese heading wraps in `withskill` (e.g., orphaned short tail lines).
- Keep the existing visual direction while improving readability and trust for enterprise audiences.

Baseline delivery:
- Updated typography wrapping and line-break controls in:
  - `archive/TESTFolder/testWebPage/withskill/styles.css`
- Adjusted heading width constraints to reduce unnatural breaks:
  - `.hero-copy h1` max width tuned (`16ch` -> `18ch`)
  - `.section-head h2` max width tuned (`21ch` -> `30ch`)
  - `.careers-layout h2` max width tuned (`20ch` -> `24ch`)
- Added responsive override to remove hard max-width for section/career headings on small screens.

Over-delivery:
- Added language-safe text wrapping defaults:
  - heading: `text-wrap: balance`
  - paragraph/list: `text-wrap: pretty`
  - `line-break: strict` for body/headings/paragraph-like elements

Verification evidence:
1. `node --check archive/TESTFolder/testWebPage/withskill/app.js` -> PASS
2. `node archive/TESTFolder/testWebPage/withskill/validate_site.js` -> PASS
3. CSS selector/setting presence check (`rg`) -> PASS

Residual risk:
- Final visual line-break quality can still vary slightly by browser rendering engine and installed font fallback.

## 35. High-Priority Skill Pack + Explicit Invocation Education (2026-02-23)

Design intent:
- Implement high-priority missing skills first and enforce explicit skill invocation across agent operations.
- Reduce ambiguity in protocol debugging, release gating, visual regression, and spec synchronization workflows.

Baseline delivery:
- Added high-priority skills:
  - `skills/appserver-protocol-debugger/`
  - `skills/turn-log-auditor/`
  - `skills/release-evidence-gate/`
  - `skills/ui-regression-diff/`
  - `skills/spec-sync-assistant/`
- Updated role-to-skill policy and explicit invocation rules in:
  - `AGENTS.md`
- Updated skill matrix and proposal status in:
  - `docs/AGENT_SKILL_MATRIX.md`

Over-delivery:
- Added per-skill `agents/openai.yaml` UI metadata and focused `references/` for deterministic execution.
- Added explicit parent review requirement that missing relevant skill invocation is a process defect.
- Added final-report requirement to include a skill usage ledger (`role -> $skill-name -> evidence`).

Verification evidence:
1. New skill artifact presence checks (`rg --files skills`) -> PASS
2. Policy update presence checks:
   - `AGENTS.md` includes updated skill assignment and explicit invocation requirements -> PASS
   - `docs/AGENT_SKILL_MATRIX.md` moves MS-002/003/004/006/008 to implemented -> PASS
3. Manual SKILL metadata sanity checks (name/description and openai.yaml default prompt token use) -> PASS

Residual risk:
- `.codex/agents/*.toml` could not be updated in this environment due write-permission denial on `.codex/agents` paths; education is enforced through `AGENTS.md` and matrix policy instead.

## 32. Turn Visibility Hardening (2026-02-23)

Design intent:
- Remove ambiguity when reading logs by explicitly labeling each run as smoke/test vs real runtime profile.
- Expose whether "full-utilization defaults" were actually active for each turn.
- Expose concrete execution evidence (collab/mcp/dispatch counters) in both runtime API and turn artifacts.

Baseline delivery:
- Added `CODEX_EXECUTION_PROFILE` support in `server.js`.
- Added runtime visibility snapshots:
  - `/api/runtime.executionVisibility`
  - `/api/runtime.fullUtilization`
  - `/api/runtime.executionProfile`
- Extended latest turn snapshot (`latest_turn`) with:
  - execution profile/intent
  - full-utilization readiness flags
  - observed execution signals
  - artifact directory path
- Extended turn artifacts:
  - `events.ndjson` `turn.started` now includes execution metadata
  - `events.ndjson` `turn.context` now includes execution metadata
  - `manifest.json.execution.meta`
  - `manifest.json.execution.observed`

Over-delivery:
- Added request-level profile metadata pass-through from Web UI (`web/app.js`) to `POST /api/exec`:
  - `executionProfile`
  - `executionIntent`
  - `executionSource`
- Added launcher defaults:
  - `start_codex_ui.bat`: `CODEX_EXECUTION_PROFILE=full-runtime` (if unset)
  - `start_codex_cli_harness.bat`: `CODEX_EXECUTION_PROFILE=full-runtime` (if unset)
- Pinned smoke harness profile:
  - `scripts/app_server_smoke_test.js` sets `CODEX_EXECUTION_PROFILE=smoke-test`
  - smoke assertions validate runtime and manifest visibility fields

Verification evidence:
1. Syntax validation:
   - `node --check server.js`
   - `node --check web/app.js`
   - `node --check scripts/app_server_smoke_test.js`
2. Smoke harness command:
   - `node scripts/app_server_smoke_test.js`
   - Expected: validates `executionVisibility` in `/api/runtime` and `manifest.json.execution.*` fields

Residual risk:
- If operators launch `server.js` directly without launcher scripts or env vars, profile defaults to `standard`.
- Visibility fields show observed counts; they do not force multi-agent delegation by themselves.

## 33. Git Dependency Removal (2026-02-23)

Design intent:
- Remove Git-specific runtime coupling because local operation does not require pushing to remote.
- Keep diagnostics focused on runtime prerequisites only (Codex CLI + Node + web search condition).

Baseline delivery:
- Removed Git version probe from `GET /api/diagnostics` response (`server.js`).
- Removed Git diagnostic card from Web UI diagnostics panel (`web/index.html`).
- Removed Git diagnostic handling from frontend state/render path (`web/app.js`).

Over-delivery:
- Updated README requirements to remove Git mention from prerequisites.
- Confirmed runtime endpoint remains healthy after UI/server changes.

Verification evidence:
1. `node --check server.js` -> PASS
2. `node --check web/app.js` -> PASS
3. `node scripts/app_server_smoke_test.js` -> PASS
4. Runtime probe (`GET /api/runtime`) -> `status=200`, `mode=app-server`, no Git diagnostics field in payload

Residual risk:
- Some external documentation snippets may still mention Git historically; runtime behavior no longer depends on it.

## 34. Agent Skill Assignment Policy (2026-02-23)

Design intent:
- Standardize which skill set each parent/child role should use.
- Make skill ownership explicit for dispatch, review, and gap reporting.

Baseline delivery:
- Added role-to-skill assignment policy in `AGENTS.md` (`Skill Assignment Policy` section).
- Added missing-skill proposal governance in `AGENTS.md` (`Missing-skill proposal tracking` section).
- Added matrix document:
  - `docs/AGENT_SKILL_MATRIX.md`
  - includes current assignments and proposal IDs (`MS-001`..`MS-008`) for unavailable skills.

Over-delivery:
- Added explicit operational rule in matrix doc to force proposal-ID reporting when a task depends on missing capability.

Verification evidence:
1. `AGENTS.md` contains role-to-skill mapping and routing rules.
2. `docs/AGENT_SKILL_MATRIX.md` exists and includes:
   - assigned skill table for all roles
   - desired-but-missing skill table with proposal IDs and owners

Residual risk:
- `.codex/agents/*.toml` is not writable in this runtime, so enforcement is policy-level (`AGENTS.md`) rather than agent-file-level for now.

## 35. Skill Portfolio Governance (Generic vs Partial) (2026-02-23)

Design intent:
- Prevent one-dimensional skill evolution by explicitly balancing generic and partial improvements.
- Make promotion decisions (`scenario -> role -> global`) evidence-driven instead of subjective.

Baseline delivery:
- Added machine-readable policy:
  - `scripts/config/skill_portfolio_policy.json`
- Added machine-readable catalog:
  - `scripts/config/skill_catalog.json`
- Added validator library:
  - `scripts/lib/skill_portfolio_policy.js`
- Added executable audit command:
  - `scripts/skill_portfolio_audit.js`
- Added policy test:
  - `scripts/skill_portfolio_policy_test.js`
- Updated operator policy and matrix docs:
  - `AGENTS.md`
  - `docs/AGENT_SKILL_MATRIX.md`
  - `docs/SKILL_PORTFOLIO_GOVERNANCE.md`

Over-delivery:
- Added promotion-candidate detection from optional outcome evidence (`logs/skill_outcomes.jsonl`).
- Added hard-stop guardrail in policy to block promotion when guard metrics fail.
- Added role-level class-mix gate and portfolio ratio gate to reduce monotony risk.

Verification evidence:
1. `node --check scripts/lib/skill_portfolio_policy.js` -> PASS
2. `node --check scripts/skill_portfolio_audit.js` -> PASS
3. `node --check scripts/skill_portfolio_policy_test.js` -> PASS
4. `node scripts/skill_portfolio_policy_test.js` -> PASS
5. `node scripts/skill_portfolio_audit.js` -> PASS
   - diversity: `3/3`
   - class share: `global=24.2%`, `role=27.3%`, `scenario=48.5%`

Residual risk:
- Promotion quality depends on ongoing accumulation quality of `logs/skill_outcomes.jsonl`.
- `experiment` class is currently not assigned in active roles, so experimentation throughput is policy-ready but operationally optional.

## 36. English Conversation App UI (`web/english-conversation-app`) (2026-02-23)

Design intent:
- Provide a simple, production-usable English conversation UI.
- Route conversation through a dedicated conversation API path, isolated from `/api/exec` harness controls.

Baseline delivery:
- Added a new UI implementation:
  - `web/english-conversation-app/index.html`
  - `web/english-conversation-app/styles.css`
  - `web/english-conversation-app/app.js`
- Added launcher-safe root entry:
  - `web/index.html` now redirects to `/english-conversation-app/index.html`.
- Added conversation-only API path in `server.js`:
  - `GET /api/conversation/runtime`
  - `POST /api/conversation/direct`
- Conversation runtime is fixed to `app-server` provider:
  - reuses Codex app-server authentication/session
  - no external OpenAI API key path for this UI
- Frontend switched to conversation-only API:
  - removed dependence on `/api/exec` + control token handshake for chat turns.
- Implemented core UX:
  - simple chat timeline (You / AI / System)
  - level selector + topic input
  - Enter-to-send and stop(interrupt) button
  - new conversation reset

Over-delivery:
- Added realtime voice conversation loop (no extra dependencies):
  - continuous speech capture via `SpeechRecognition` / `webkitSpeechRecognition`
  - auto-send to `POST /api/conversation/direct` after configurable silence window (0.9-2.0s)
  - automatic turn loop: listen -> send -> app-server response -> TTS playback -> listen
  - optional response playback via `speechSynthesis`
  - fallback messaging when speech APIs are unsupported
- Added runtime-hardening UX:
  - realtime button is locked when conversation runtime is unavailable
  - realtime session auto-stops when runtime probe flips to offline

Verification evidence:
1. `node --check web/english-conversation-app/app.js` -> PASS
2. `node --check server.js` -> PASS
4. In-process server startup + runtime probe -> PASS
   - `status=200`
   - `mode=app-server`
   - `apiVersion=4`
5. In-process conversation runtime probe -> PASS
   - `GET /api/conversation/runtime` -> `200`
   - `mode=app-server`
6. In-process static page probe -> PASS
   - `GET /` -> `200`
   - `GET /english-conversation-app/index.html` -> `200`
   - page contains realtime controls (`Start Realtime Talk`, `silenceMsSelect`)
7. `node scripts/app_server_smoke_test.js` -> PASS
   - validates `GET /api/conversation/runtime` returns app-server provider metadata
   - validates `POST /api/conversation/direct` rejects non-JSON with `415`

Residual risk:
- Browser-level UX behavior (visual details, input ergonomics) is validated via endpoint probes and script checks in this environment, not full interactive manual QA.

## 37. Parent Dispatch Guard + Skillization (2026-02-23)

Design intent:
- Prevent parent-agent completion without successful child dispatch when delegation is required.
- Convert delegation behavior from "prompt guidance only" into enforceable runtime behavior and reusable skill workflow.

Baseline delivery:
- Added parent dispatch guard policy module:
  - `scripts/lib/parent_dispatch_guard_policy.js`
- Integrated guard into `server.js` turn-finalization:
  - records dispatch attempts/success/failure counters
  - evaluates parent dispatch requirement for non-smoke completed turns
  - auto-retries once with explicit delegation instructions when configured
  - blocks completion (`status=failed`) if enforcement remains unsatisfied
- Extended runtime visibility:
  - `/api/runtime.parentDispatchGuard`
  - `/api/runtime.executionVisibility.parentDispatchGuard`
- Extended turn snapshot + artifacts:
  - `latest_turn.parent_dispatch_guard`
  - `manifest.json.execution.observed.dispatchSuccessCount`
  - `manifest.json.execution.observed.dispatchFailureCount`
  - `manifest.json.execution.observed.collabFailures`

Over-delivery:
- Added reusable skill package:
  - `skills/parent-dispatch-guard/SKILL.md`
  - `skills/parent-dispatch-guard/agents/openai.yaml`
  - `skills/parent-dispatch-guard/references/dispatch-recovery-checklist.md`
- Updated role skill policy and matrix to include `$parent-dispatch-guard` for parent roles:
  - `AGENTS.md`
  - `docs/AGENT_SKILL_MATRIX.md`
  - `scripts/config/skill_catalog.json`
- Strengthened smoke verification for new visibility/counter fields:
  - `scripts/app_server_smoke_test.js`

Verification evidence:
1. `node --check server.js` -> PASS
2. `node --check scripts/lib/parent_dispatch_guard_policy.js` -> PASS
3. `node --check scripts/parent_dispatch_guard_policy_test.js` -> PASS
4. `node --check scripts/app_server_smoke_test.js` -> PASS
5. `node scripts/parent_dispatch_guard_policy_test.js` -> PASS (`total=6 pass=6 fail=0`)
6. `node scripts/agent_governance_policy_test.js` -> PASS (`total=7 pass=7 fail=0`)
7. `node scripts/skill_portfolio_audit.js` -> PASS
   - exposure=`36`, class share `global=22.2%`, `role=33.3%`, `scenario=44.4%`
8. `node scripts/app_server_smoke_test.js` -> PASS

Residual risk:
- `.codex/agents/*.toml` remains runtime-restricted in this environment, so explicit parent-skill invocation is enforced at `AGENTS.md` policy and runtime guard layers, not by per-agent prompt file edits.

## 38. Feedback Promotion Skill + Skill Creator Master Enforcement (2026-02-23)

Design intent:
- Convert feedback-driven self-improvement into a reusable anti-overfit skill, not ad-hoc local tuning.
- Ensure skill authoring requests are routed through `skill-creater-maseter` by policy before fallback (renamed to `skill-creator-master` on 2026-03-06).

Baseline delivery:
- Added feedback promotion skill package:
  - `skills/feedback-promotion-governor/SKILL.md`
  - `skills/feedback-promotion-governor/agents/openai.yaml`
  - `skills/feedback-promotion-governor/references/promotion-matrix.md`
- Updated parent-role skill assignments and routing policy:
  - `AGENTS.md`
  - `scripts/config/skill_catalog.json`
  - `docs/AGENT_SKILL_MATRIX.md`
- Added explicit policy rule:
  - skill create/update requests must invoke `$skill-creater-maseter` first
  - `$skill-creator` is fallback only when `skill-creater-maseter` is unavailable

Over-delivery:
- Introduced catalog-level metrics for feedback promotion quality:
  - primary: `root_improvement_promotion_precision >= 0.90`
  - guard: `local_overfit_promotion_rate <= 0.08`
- Activated experiment-class exposure (`skill-creater-maseter`) in default parent assignment so portfolio governance now audits real experiment usage.

Verification evidence:
1. `node scripts/skill_portfolio_audit.js` -> PASS
   - diversity=`4/3`, exposure=`40`
   - class share: `global=20.0%`, `role=37.5%`, `scenario=40.0%`, `experiment=2.5%`
2. `node scripts/app_server_smoke_test.js` -> PASS
   - confirms harness runtime/API behavior remains healthy after catalog + policy sync

Residual risk:
- `feedback-promotion-governor` defines policy and gating, but long-term promotion quality still depends on real outcome evidence accumulation in `logs/skill_outcomes.jsonl`.

## 39. Requirement RBJ Loop + Red Skillization (2026-02-23)

Design intent:
- Introduce a deterministic Requirement Blue/Red/Judge loop before implementation planning.
- Ensure Red behavior is constrained by a dedicated skill so audits improve clarity instead of producing arbitrary objections.

Baseline delivery:
- Added new Red skill package:
  - `skills/red-requirement-auditor/SKILL.md`
  - `skills/red-requirement-auditor/agents/openai.yaml`
  - `skills/red-requirement-auditor/references/audit-checklist.md`
- Added RBJ policy module:
  - `scripts/lib/requirement_rbj_policy.js`
- Integrated RBJ policy into requirement guard extension:
  - `scripts/extensions/requirement_guard_hook.js`
  - injects `[REQUIREMENT_RBJ_V1]` block with strict Blue/Red/Judge contract
  - references `$red-requirement-auditor` explicitly
  - supports one-turn bypass via `#rbj-bypass`
- Extended runtime requirement-guard snapshot with RBJ config surface:
  - `server.js` now includes `requirementGuard.rbj` when extension module is loaded

Over-delivery:
- Added dedicated RBJ policy test:
  - `scripts/requirement_rbj_policy_test.js`
- Expanded requirement guard validator coverage:
  - verifies RBJ prompt injection in parent context
  - verifies RBJ suppression for non-parent role
  - verifies RBJ disable env (`CODEX_REQUIREMENT_RBJ_ENABLED=0`)
- Enabled full-runtime launcher defaults for requirement RBJ path:
  - `start_codex_ui.bat`
  - `start_codex_cli_harness.bat`
  - default envs: `CODEX_REQUIREMENT_GUARD_ENABLED=1`, `CODEX_REQUIREMENT_RBJ_ENABLED=1`

Verification evidence:
1. `node scripts/requirement_rbj_policy_test.js` -> PASS
2. `node scripts/requirement_guard_validator_test.js` -> PASS
3. `node scripts/skill_portfolio_audit.js` -> PASS
4. `node scripts/app_server_smoke_test.js` -> PASS

Residual risk:
- RBJ loop quality still depends on runtime model compliance; deterministic prompt contracts reduce but do not eliminate variance.
- Requirement guard module remains toggleable by env, so direct `node server.js` runs without launcher defaults may not activate RBJ unless env is set.

## 39. Voice Engine Switch UI (Microsoft/Browser <-> Piper -high) (2026-02-23)

Design intent:
- Let users switch reply playback engine from UI without code edits.
- Prepare Piper `-high` model usage flow before model download/setup.

Baseline delivery:
- Updated `web/english-conversation-app` voice panel with new controls:
  - `TTS Engine` selector (`Microsoft / Browser`, `Piper (-high local)`)
  - `Piper Model (-high)` input
  - `Piper Speaker ID` input
  - TTS engine hint/status line
- Persisted user choices in local storage:
  - selected engine
  - selected browser voice URI
  - Piper model + optional speaker ID
- Updated playback logic:
  - Browser path prefers Microsoft English voices when available
  - Piper path sends playback request to `POST /api/voice/piper`
  - If Piper endpoint is not ready, UI shows a clear setup-pending error message

Verification evidence:
1. `node --check web/english-conversation-app/app.js` -> PASS
2. Runtime/UI probe -> PASS
   - `GET /api/runtime` -> `200` (`mode=app-server`, `apiVersion=4`)
   - `GET /english-conversation-app/index.html` -> `200`
   - page contains `ttsProviderSelect`, `piperModelInput`, `piperSpeakerInput`

Residual risk:
- This section delivered UI-side switching only. Server-side Piper runtime was added later in section `39.1`.

## 39.1 Piper Model Download + `/api/voice/piper` Playback Wiring (2026-02-23)

Design intent:
- Complete local Piper TTS path end-to-end for the new voice-engine switch UI.
- Keep server changes minimal and isolate Piper-specific logic to avoid merge conflicts with parallel edits.

Baseline delivery:
- Added reusable Piper runtime module:
  - `scripts/lib/piper_voice_runtime.js`
  - responsibilities:
    - normalize/validate `-high` model ids
    - optional speaker-id normalization
    - model asset resolution under `models/piper/<model-id>/`
    - download model assets (`.onnx` + `.onnx.json`) from Hugging Face with redirect support
    - synthesize via `piper` CLI and play WAV locally (Windows `SoundPlayer`, macOS `afplay`, Linux `aplay`/`paplay`)
    - resolve bundled binary path first (`tools/piper/piper.exe`) when `CODEX_PIPER_BIN` is not set
- Added model setup CLI:
  - `scripts/piper_model_setup.js`
  - supports:
    - download-if-missing mode (default)
    - `--check-only` for non-download presence checks
- Added app-server endpoint:
  - `POST /api/voice/piper` in `server.js`
  - behavior:
    - local-origin + JSON content-type enforcement
    - accepts `text`, `model`, optional `speaker`, optional `autoDownload`
    - defaults model to `en_US-lessac-high`
    - returns actionable missing-model error when `autoDownload=false`
- Added pre-generation prepare endpoint:
  - `POST /api/voice/piper/prepare` in `server.js`
  - behavior:
    - model preparation before first reply (download + optional warmup synthesis without playback)
    - accepts `model`, optional `speaker`, optional `autoDownload`, optional `warmup`, optional `warmupText`
    - designed for "ready-before-first-talk" workflow
- Added runtime visibility:
  - `/api/runtime.piperVoiceApi`
  - `/api/runtime.piper_voice_api`
  - includes `prepareEndpoint`
- Updated `web/english-conversation-app/app.js` Piper flow:
  - UI triggers Piper pre-prepare in background at startup (even before provider switch) to minimize first-use latency
  - model/speaker changes trigger re-prepare in background regardless of current provider
  - when Piper is selected, readiness status is surfaced in the TTS hint/status area
  - Piper errors stay explicit on Piper path (no automatic provider fallback)
  - playback call to `/api/voice/piper` now uses `autoDownload=false` so runtime turn avoids download wait
  - TTS hint shows preparing/ready/not-ready states
- Updated launcher defaults for local Piper binary pickup:
  - `start_codex_ui.bat` auto-sets `CODEX_PIPER_BIN` when `tools/piper/piper.exe` exists
  - `start_codex_cli_harness.bat` auto-sets `CODEX_PIPER_BIN` when `tools/piper/piper.exe` exists
  - local placement guide: `tools/piper/README.md`
- Updated setup CLI:
  - `scripts/piper_model_setup.js` now supports prepare mode with warmup
  - `--no-warmup` option for download-only preparation
- Added runtime preflight doctor:
  - `scripts/piper_runtime_doctor.js`
  - checks binary resolution, model presence, and synthesis warmup in one command
- Added secure installer helper:
  - `scripts/piper_secure_install.ps1`
  - requires explicit download URL + SHA256 and verifies hash before install
  - host allowlist by default (`github.com`, `objects.githubusercontent.com`, `release-assets.githubusercontent.com`, `huggingface.co`)

Verification evidence:
1. `node --check server.js` -> PASS
2. `node --check scripts/lib/piper_voice_runtime.js` -> PASS
3. `node --check scripts/piper_model_setup.js` -> PASS
4. `node --check scripts/piper_runtime_doctor.js` -> PASS
5. `node --check web/english-conversation-app/app.js` -> PASS
6. `node scripts/app_server_smoke_test.js` -> PASS
7. Isolated server probe on alternate port (`57536`) -> PASS
   - `GET /api/runtime` includes `piperVoiceApi.endpoint = POST /api/voice/piper`
   - `GET /api/runtime` includes `piperVoiceApi.prepareEndpoint = POST /api/voice/piper/prepare`
   - `POST /api/voice/piper/prepare` with `autoDownload=false` returns structured missing-model error (`404`, code=`piper_model_missing`)

Residual risk:
- Actual synthesis playback depends on local `piper` binary availability (`CODEX_PIPER_BIN` or `piper` on PATH).
- Model download execution was not run in this environment, so first real playback still requires model fetch on your machine.


## 40. Conversation Mode Split (Normal vs Friend Persona) (2026-02-23)

Design intent:
- Split the English conversation experience into two explicit paths:
  - `normal` mode: neutral speaking partner
  - `persona_friend` mode: friend-style personality only
- Keep the persona path isolated from the legacy harness behavior and make mode differences visible in UI.

Baseline delivery:
- Added server-side mode contract and runtime metadata:
  - `GET /api/conversation/runtime` now returns `modeOptions`, `defaultMode`, and persona memory metadata.
- Added mode-aware prompt routing in `server.js`:
  - `normal` keeps neutral conversation-partner instructions.
  - `persona_friend` uses explicit friend persona rules (not teacher/examiner) and injects memory context.
- Added persona memory persistence for friend mode:
  - storage file: `logs/conversation_persona_memory.json`
  - per-user memory key via `personaUserId`
  - extracted user facts/topics are reused in later prompts for continuity.
- Added persona memory reset API:
  - `POST /api/conversation/persona/reset`
- Updated web app UI (`web/english-conversation-app`) with visible mode split:
  - `Conversation mode` selector
  - persona-specific memory status text
  - `Reset Friend Memory` action
  - persona visual theme changes when friend mode is active
- Updated web payload wiring:
  - each direct conversation request now sends `mode` and `personaUserId`.

Over-delivery:
- Added dedicated, isolated policy module:
  - `scripts/lib/conversation_persona_policy.js`
  - centralizes mode normalization, persona memory normalization/update, fact extraction, and prompt-section generation.
- Added dedicated automated tests for the new logic:
  - `scripts/conversation_persona_policy_test.js`

Verification evidence:
1. `node scripts/conversation_persona_policy_test.js` -> PASS
   - covers mode normalization, user-id normalization, fact extraction, memory update/context limits, prompt split.
2. `node scripts/app_server_smoke_test.js` -> PASS
   - confirms app-server handshake + runtime endpoints still healthy after `server.js` changes.
3. Runtime verification for web changes -> PASS
   - started server process and confirmed `GET /api/runtime` returns `200` with `apiVersion=4`.

Residual risk:
- Persona memory extraction currently uses lightweight regex heuristics; nuance and multilingual recall quality can be expanded in a later iteration.
- Memory file is local JSON storage and is not encrypted by default.

## 41. CLI Path Unification To `/api/exec` (2026-02-23)

Design intent:
- Remove duplicated execution-path logic between `server.js` and `scripts/cli_via_api_exec.js`.
- Make `server.js` the single execution core so guardrails (Requirement Guard/RBJ, idempotency, artifact logging, approval governance) are shared by both Web UI and CLI entrypoints.

Baseline delivery:
- Updated `scripts/cli_via_api_exec.js` from direct JSONL/stdin app-server client to HTTP adapter mode:
  - CLI now routes through `POST /api/exec` and consumes NDJSON events.
  - CLI still supports one-shot (`--prompt`, `--json`) and interactive mode (`/help`, `/thread`, `/new`, `/resume`, `/interrupt`, `/exit`).
  - CLI now auto-starts local `server.js` if `/api/runtime` is not already available.
- Updated `server.js` `/api/exec` request parsing to accept `forceNewSession` from request body and pass it through existing execution options.
- Updated architecture summary in `README.md` to reflect unified route:
  - `CLI -> /api/exec -> server.js -> app-server`.
- Added backward-compatible shim:
  - `scripts/app_server_cli_harness.js` now forwards to `scripts/cli_via_api_exec.js`.

Over-delivery:
- Added compatibility behavior notes in CLI usage/help:
  - `--model` is accepted but currently ignored in unified `/api/exec` path, preventing silent ambiguity.
- Added runtime token/origin aware request handling in CLI adapter:
  - fetches control token from `GET /api/runtime`
  - attaches required control header + local `Origin`/`Referer` for guarded mutation API calls.

Verification evidence:
1. `node --check scripts/cli_via_api_exec.js` -> PASS
2. `node --check server.js` -> PASS
3. `node scripts/cli_via_api_exec.js --help` -> PASS
4. `node scripts/cli_via_api_exec.js --prompt "Reply with one short sentence." --json --quiet --approval-policy never --sandbox workspace-write --web-search disabled --request-user-input auto-empty` -> PASS
5. `node scripts/app_server_cli_smoke_test.js` -> FAIL (`spawn EPERM` in this sandbox; nested `node:child_process.spawn` is blocked)
6. `node scripts/app_server_smoke_test.js` -> PASS

Residual risk:
- `--model` is currently a compatibility no-op in the unified CLI route; if per-thread model override is required later, add explicit `/api/exec` support in `server.js` thread-start path.
- Interactive `/new` is implemented as "force new session on next prompt", not immediate thread creation without a prompt.

## 42. RBJ Requirement Gate Hardening (TBD/ASK Stop) (2026-02-23)

Design intent:
- Prevent requirement-phase overfitting where the model fabricates concrete values (for example, deadlines/headcount) that were never confirmed by the user.
- Keep Red/Blue/Judge useful while ensuring implementation does not proceed on unconfirmed assumptions.

Baseline delivery:
- Updated `scripts/lib/requirement_rbj_policy.js` RBJ instruction contract:
  - Blue output now requires explicit buckets:
    - `confirmed_requirements`
    - `assumptions_non_binding`
    - `open_questions_blocking`
    - `acceptance_checks`
  - Unknown concrete constraints must be marked `TBD` instead of fabricated.
  - `ASK` verdict must stop with `STATUS: NEED_USER_INPUT` and capped question count.
  - Assumptions are explicitly non-binding until user confirmation.
- Updated `scripts/extensions/requirement_guard_hook.js` prompt mode routing:
  - When RBJ is active for parent roles, execution mode is now:
    - `[REQUIREMENT_LOCK_V1] mode: requirement_definition_gate`
    - `[SCOPE_EXPANSION_V1] expansion_status: parked_until_rbj_pass`
  - Scope expansion intent is preserved as `requested_expansion_mode` but parked until RBJ PASS.
  - Prompt protocol now enforces requirement-only structure and stop conditions before implementation.

Over-delivery:
- Strengthened validator coverage in:
  - `scripts/requirement_rbj_policy_test.js`
  - `scripts/requirement_guard_validator_test.js`
- Added assertions for:
  - `TBD` fallback requirement
  - non-binding assumption handling
  - parked expansion behavior under RBJ gate
  - fallback to over-delivery mode when RBJ is disabled

Verification evidence:
1. `node scripts/requirement_rbj_policy_test.js` -> PASS
2. `node scripts/requirement_guard_validator_test.js` -> PASS
3. `node scripts/app_server_smoke_test.js` -> PASS

Residual risk:
- The guardrail is prompt-policy enforcement, not hard schema validation of model output; future hardening can add post-response structural validators for `confirmed/assumptions/open_questions`.

## 43. Kokoro FastAPI Local Bootstrap (Docker Compose) (2026-02-23)

Design intent:
- Prepare a local Kokoro TTS server path with minimal operational friction and without changing existing default behavior.
- Keep the setup isolated under `tools/` and document OpenAI-compatible endpoint checks.

Baseline delivery:
- Added a dedicated local deployment directory:
  - `tools/kokoro-fastapi/`
- Added Docker Compose runtime config:
  - `tools/kokoro-fastapi/docker-compose.yml`
  - default image: `ghcr.io/remsky/kokoro-fastapi-cpu:latest`
  - default host port: `8880`
  - persistent cache mount: `tools/kokoro-fastapi/cache/huggingface`
- Added env template:
  - `tools/kokoro-fastapi/.env.example`
- Added operator runbook:
  - `tools/kokoro-fastapi/README.md`
  - includes setup, verify (`/docs`, `/v1/models`), sample OpenAI-compatible `/v1/audio/speech`, and cleanup.
- Added PowerShell operator scripts:
  - `tools/kokoro-fastapi/start.ps1` (daemon check + optional pull + up + health wait)
  - `tools/kokoro-fastapi/stop.ps1` (compose down)
  - `tools/kokoro-fastapi/smoke_test_speech.ps1` (OpenAI-compatible `/v1/audio/speech` smoke test, optional `-LangCode`)
- Synced top-level bootstrap docs:
  - `README.md` now includes Kokoro FastAPI quick-start and verification commands.

Over-delivery:
- Added repo-level ignore rule for local model cache artifacts:
  - `.gitignore` now excludes `tools/kokoro-fastapi/cache/` to keep runtime downloads out of version control.
- Added repo-level ignore rule for local env artifact:
  - `.gitignore` now excludes `tools/kokoro-fastapi/.env` to avoid committing host-specific runtime settings.

Verification evidence:
1. `docker --version` -> PASS (Docker CLI present)
2. `docker compose -f tools/kokoro-fastapi/docker-compose.yml config` -> PASS
3. `docker pull ghcr.io/remsky/kokoro-fastapi-cpu:latest` -> FAIL in this sandbox (`dockerDesktopLinuxEngine` access denied for this execution user)
4. Documentation/path sync checks -> PASS
   - `tools/kokoro-fastapi/docker-compose.yml` present
   - `tools/kokoro-fastapi/.env.example` present
   - `tools/kokoro-fastapi/README.md` present
   - `tools/kokoro-fastapi/start.ps1` present
   - `tools/kokoro-fastapi/stop.ps1` present
   - `tools/kokoro-fastapi/smoke_test_speech.ps1` present
   - `README.md` includes Kokoro section

Residual risk:
- Runtime pull/start verification is blocked until Docker daemon is running on this machine.
- Model and voice identifiers for `/v1/audio/speech` can vary by image build; verify with `GET /v1/models` after container startup.

## 44. English Conversation App Kokoro TTS Provider Integration (2026-02-23)

Design intent:
- Enable Kokoro as a third reply-playback engine in `web/english-conversation-app` without regressing existing Browser/Piper behavior.
- Keep browser and server same-origin by routing Kokoro through `server.js` (`POST /api/voice/kokoro`), instead of direct cross-origin calls from the web app.

Baseline delivery:
- Updated UI engine selector:
  - `web/english-conversation-app/index.html`
  - added option: `Kokoro FastAPI (local)` to `#ttsProviderSelect`.
- Updated frontend playback routing:
  - `web/english-conversation-app/app.js`
  - provider normalization now supports `browser | piper | kokoro`.
  - added Kokoro playback path (`speakAssistantTextWithKokoro`) using `fetch("/api/voice/kokoro")` + browser audio playback.
  - added Kokoro playback stop handling on stop/reset/provider-switch (`stopKokoroPlayback`).
  - updated TTS hint text and provider-switch behavior to keep Browser/Piper/Kokoro transitions explicit.
- Added server-side Kokoro proxy endpoint:
  - `server.js`
  - new route: `POST /api/voice/kokoro`
  - validates local origin + JSON content-type (same guard model as existing voice APIs).
  - forwards to Kokoro FastAPI `/v1/audio/speech` at configured local endpoint and returns audio bytes to the browser.
- Added Kokoro runtime snapshot in `/api/runtime`:
  - `kokoroVoiceApi` / `kokoro_voice_api`
  - includes endpoint, upstream base URL, defaults, and limits.

Configuration:
- `CODEX_KOKORO_API_BASE_URL` (default: `http://127.0.0.1:8880`)
- `CODEX_KOKORO_DEFAULT_MODEL` (default: `kokoro`)
- `CODEX_KOKORO_DEFAULT_VOICE` (default: `af_heart`)
- `CODEX_KOKORO_DEFAULT_LANG_CODE` (default: `a`)
- `CODEX_KOKORO_REQUEST_BODY_LIMIT_BYTES` (default: `262144`)
- `CODEX_KOKORO_REQUEST_TIMEOUT_MS` (default: `45000`)

Over-delivery:
- Hardened browser-side Kokoro playback lifecycle:
  - abort in-flight Kokoro request when user presses stop / toggles provider / disables TTS.
  - revoke object URLs after playback for local memory hygiene.
- Added UTF-8 request-body send path in Kokoro smoke helper:
  - `tools/kokoro-fastapi/smoke_test_speech.ps1`

Verification evidence:
1. `node --check server.js` -> PASS
2. `node --check web/english-conversation-app/app.js` -> PASS
3. `node scripts/app_server_smoke_test.js` -> PASS
4. `GET http://127.0.0.1:57525/api/runtime` -> PASS (`apiVersion=4`)

Residual risk:
- If an old `server.js` process remains running, `POST /api/voice/kokoro` may return `404` until server restart.
- Kokoro upstream behavior can vary by image tag; keep `tools/kokoro-fastapi` image and server defaults aligned.

## 45. English Conversation App UI Compaction (2026-02-23)

Design intent:
- Remove non-essential controls from the main screen and keep only the core interaction path visible.
- Preserve existing required functionality (chat, realtime input, reply playback engine switching) while reducing visual/operational clutter.

Baseline delivery:
- Reworked `web/english-conversation-app/index.html` layout:
  - removed visible conversation-mode / persona-memory / level / topic / advanced voice controls from the primary UI.
  - kept visible essentials:
    - `Start Realtime Talk`
    - `Clear Chat`
    - silence threshold selector
    - TTS selector (`Browser`, `Kokoro`, `Piper`)
    - read-aloud toggle
    - chat log + message composer.
- Updated `web/english-conversation-app/styles.css` to a compact layout:
  - tighter spacing, smaller control heights, denser header/chat/composer geometry.
  - compact control bar design (`control-panel`, `control-row`, compact select/toggle styles).
  - preserved avatar panel responsiveness and sizing behavior.
- Updated `web/english-conversation-app/app.js` boot behavior:
  - conversation mode now starts in `normal` explicitly to avoid stale hidden-mode state.
  - no dependency on removed UI elements for core send/realtime/TTS flow.

Over-delivery:
- Removed hidden fallback DOM controls from `index.html` rather than keeping shadow inputs, so UI and DOM are now aligned to the compact scope.

Verification evidence:
1. `node --check web/english-conversation-app/app.js` -> PASS
2. `GET http://127.0.0.1:57525/api/runtime` -> PASS (`apiVersion=4`)
3. Removed-control grep check on `index.html` -> PASS (no matches for removed ids)

Residual risk:
- Persona-memory and topic/level features still exist server-side but are intentionally not exposed in the compact UI.

## 46. English Conversation App VRM Avatar + Lip Sync Wiring (2026-02-23)

Design intent:
- Add an on-screen 3D character (`gpt_chan.vrm`) to the conversation UI and synchronize mouth animation with reply playback state.
- Keep changes local to the web app layer without changing server API contracts.

Baseline delivery:
- Added avatar viewport to UI:
  - `web/english-conversation-app/index.html`
  - new `avatar-panel` with `#avatarCanvas` + `#avatarStatus`.
  - added browser import-map entries for:
    - `three`
    - `three/addons/`
    - `@pixiv/three-vrm`
- Added avatar rendering runtime:
  - `web/english-conversation-app/avatar.js`
  - loads `./assets/models/gpt_chan.vrm`
  - tries Three.js + GLTFLoader + `@pixiv/three-vrm` from multiple module sources:
    - import-map mapped modules
    - `esm.sh`
    - `skypack`
  - adds camera/light/idle motion/blink and simple speaking lip-sync loop.
  - when 3D module loading is blocked, auto-falls back to local canvas 2D avatar mode (keeps speaking lip-sync state animation instead of hard-failing).
- Added TTS-to-avatar bridge hooks:
  - `web/english-conversation-app/app.js`
  - new bridge helpers:
    - `getAvatarBridge`
    - `setAvatarTalking`
    - `setAvatarAudioElement`
    - `setSpeakingState`
  - Piper/Kokoro/Browser TTS paths now route speaking state through `setSpeakingState(...)` so avatar mouth animation starts/stops with playback lifecycle.
- Added avatar styling:
  - `web/english-conversation-app/styles.css`
  - new `.avatar-panel`, `.avatar-stage`, `#avatarCanvas`, `.avatar-status`.

Over-delivery:
- Added explicit avatar status messaging (`loading`, `ready`, `error`) to make runtime failures (WebGL/CDN/model load) visible to operators without opening devtools.
- Added module-boot watchdog in `index.html`:
  - if avatar module cannot boot (import-map/CDN/module failure), status is rewritten to an explicit startup error instead of hanging at static `loading...`.
- Added VRM load timeout guard (`20s`) in `avatar.js`:
  - fails closed with explicit error status when model loading stalls.
- Added module source failover + graceful rendering fallback:
  - if all 3D module sources fail, app switches to 2D avatar mode automatically so conversation UI remains usable.

Verification evidence:
1. `node --check web/english-conversation-app/app.js` -> PASS
2. `node --check web/english-conversation-app/avatar.js` -> PASS
3. `node scripts/app_server_smoke_test.js` -> PASS (includes local harness `/api/runtime` verification)

Residual risk:
- Avatar runtime depends on CDN module fetch (`three`, `GLTFLoader`, `@pixiv/three-vrm`); offline or filtered networks will disable avatar loading.
- Lip sync is state-driven mouth animation (speaking on/off), not phoneme-level viseme sync yet.

## 47. English Conversation App Avatar Local-Fallback Hardening (2026-02-23)

Design intent:
- Eliminate operator-facing startup failure noise for blocked 3D module environments and guarantee a visible avatar path in local restricted runtime.

Baseline delivery:
- Updated `web/english-conversation-app/avatar.js`:
  - switched module load policy to local import-map first with short timeout (`4000ms`) and optional remote fallback only when `?avatarRemoteFallback=1` is explicitly set.
  - removed default multi-CDN retry chain (`esm.sh` / `skypack`) from normal boot path.
  - changed fallback status text from detailed failure dump to stable ready-state label: `Avatar: ready (local 2D).`
  - preserved detailed failure cause in bridge diagnostics (`window.__avatarBridge.lastError`) and status tooltip instead of inline UI text.
- Updated `web/english-conversation-app/index.html` import-map to local vendor paths:
  - `three -> ./vendor/three.module.js`
  - `three/addons/ -> ./vendor/three/addons/`
  - `@pixiv/three-vrm -> ./vendor/three-vrm.module.js`
  - this makes fallback decision deterministic under network-restricted conditions and allows future local vendor drop-in without code changes.
- Added explicit vendor placeholder modules:
  - `web/english-conversation-app/vendor/three.module.js`
  - `web/english-conversation-app/vendor/three/addons/loaders/GLTFLoader.js`
  - `web/english-conversation-app/vendor/three-vrm.module.js`
  - placeholders fail fast with operator-readable guidance instead of silent `404` fetch failures.

Over-delivery:
- Added runtime observability fields to avatar bridge:
  - `moduleLoadTimeoutMs`, `modelLoadTimeoutMs`, `remote3dFallback`, `lastError`.
  - operators can inspect active behavior from devtools without modifying app code.

Verification evidence:
1. `node --check web/english-conversation-app/avatar.js` -> PASS
2. `node --check web/english-conversation-app/app.js` -> PASS
3. `GET http://127.0.0.1:57525/api/runtime` -> PASS (`200`)
4. `GET http://127.0.0.1:57525/english-conversation-app/index.html` -> PASS (`200`)
5. `GET http://127.0.0.1:57525/english-conversation-app/vendor/three.module.js` -> PASS (`200`)
6. `GET http://127.0.0.1:57525/english-conversation-app/vendor/three/addons/loaders/GLTFLoader.js` -> PASS (`200`)
7. `GET http://127.0.0.1:57525/english-conversation-app/vendor/three-vrm.module.js` -> PASS (`200`)

Residual risk:
- Current vendor files are placeholders, not full `three` / `three-vrm` runtime implementations; therefore 3D VRM mode remains unavailable by default until real vendor modules replace placeholders.
- Browser automation verification via Playwright remained blocked in this environment (`browserType.launch: spawn EPERM`), so visual confirmation is limited to runtime-level checks and fallback-path guarantees.

## 48. English Conversation App 2D Fallback Removal (2026-02-23)

Design intent:
- Enforce strict 3D-only avatar policy: when VRM runtime cannot be initialized, show explicit error status instead of any 2D fallback rendering.

Baseline delivery:
- Updated `web/english-conversation-app/avatar.js`:
  - removed local 2D fallback runtime entirely (`startFallback`, fallback drawing loop, 2D canvas synthesis code).
  - removed all 2D-ready success messaging and replaced it with explicit failure state when 3D boot fails.
  - on 3D initialization failure:
    - `bridge.mode = "error"`
    - `bridge.ready = false`
    - `bridge.error = true`
    - status text: `Avatar: failed to initialize 3D runtime.`
  - retained failure details in `window.__avatarBridge.lastError` + `#avatarStatus.title` for diagnostics.
- Updated `web/english-conversation-app/index.html`:
  - restored import-map to CDN-based 3D module paths (`three`, `three/addons`, `@pixiv/three-vrm`).
- Removed temporary vendor placeholder module files introduced in prior iteration:
  - `web/english-conversation-app/vendor/three.module.js`
  - `web/english-conversation-app/vendor/three/addons/loaders/GLTFLoader.js`
  - `web/english-conversation-app/vendor/three-vrm.module.js`

Over-delivery:
- Increased 3D module load timeout back to `12000ms` to reduce false negatives in constrained but reachable networks while still failing deterministically.
- Kept opt-in remote runtime override (`?avatarRemoteFallback=1`) for controlled troubleshooting without altering default behavior.

Verification evidence:
1. `node --check web/english-conversation-app/avatar.js` -> PASS
2. `node --check web/english-conversation-app/app.js` -> PASS
3. `GET http://127.0.0.1:57525/api/runtime` -> PASS (`200`)

Residual risk:
- In this execution environment, external module fetch remains restricted (`npm`/`npx` fetch `EACCES`), so CDN-based 3D modules can still fail to load at runtime.
- Browser automation remains restricted (`Playwright launch: spawn EPERM`), so visual proof must be operator-confirmed in an unrestricted browser session.

## 49. English Conversation Avatar 3D Runtime Multi-Source Recovery (2026-02-23)

Design intent:
- Remove the single-source 3D runtime dependency that caused `Avatar: failed to initialize 3D runtime.` in restricted or CDN-filtered environments.
- Recover a path to render `web/english-conversation-app/assets/models/gpt_chan.vrm` without changing server API contracts.

Baseline delivery:
- Updated `web/english-conversation-app/avatar.js` runtime bootstrap:
  - switched from single import-map/CDN path to staged source probing:
    - `local-vendor` direct module URLs
    - `importmap` modules
    - remote fallback chain (`esm.sh`, `unpkg`, `skypack`, `jsdelivr`)
  - added module export validation for each source (`THREE`, `GLTFLoader`, `VRMLoaderPlugin`) before accepting runtime.
  - added bridge observability for active module source candidates (`window.__avatarBridge.moduleSources`).
  - changed remote fallback policy to enabled by default with opt-out query (`?avatarNoRemoteFallback=1`); explicit opt-in flag (`?avatarRemoteFallback=1`) remains supported.
- Updated `web/english-conversation-app/index.html` import-map:
  - `three -> ./vendor/three.module.js`
  - `three/addons/ -> ./vendor/three/addons/`
  - `@pixiv/three-vrm -> ./vendor/three-vrm.module.js`
  - this makes local vendor runtime the first-class default while preserving remote recovery in `avatar.js`.
- Added vendor proxy modules:
  - `web/english-conversation-app/vendor/three.module.js`
  - `web/english-conversation-app/vendor/three/addons/loaders/GLTFLoader.js`
  - `web/english-conversation-app/vendor/three-vrm.module.js`
  - proxies route import-map modules through `esm.sh` so local import paths resolve without placeholder `404`.

Over-delivery:
- Added CDN diversity at runtime (not only jsDelivr) to avoid repeated hard-failure when one provider is blocked but others are reachable.

Verification evidence:
1. `node --check web/english-conversation-app/avatar.js` -> PASS
2. `node --check web/english-conversation-app/app.js` -> PASS
3. `node scripts/app_server_smoke_test.js` -> PASS (includes `/api/runtime` verification)

Residual risk:
- In fully offline environments (or when all configured providers are filtered), runtime fetch still fails because current vendor modules are remote proxies, not fully vendored library binaries.
- Browser-level visual confirmation remains blocked in this execution environment (`Playwright launch: spawn EPERM`), so final on-screen avatar verification requires local manual check.

## 50. Default Sandbox/Approval Relaxation at Startup (2026-02-24)

Design intent:
- Apply relaxed execution defaults from initial launch so operators do not need to switch sandbox/approval each session.

Baseline delivery:
- Updated CLI harness launcher defaults:
  - `start_codex_cli_harness.bat`
  - changed `HARNESS_DEFAULT_ARGS` default to:
    - `--approval-policy never`
    - `--sandbox danger-full-access`
    - `--web-search live`
- Updated web UI default execution profile:
  - `web/01.HarnesUI/app.js`
  - changed `loadSettings()` default profile from `balanced` to `power`.
  - aligned empty-value fallbacks in request dispatch to:
    - `approvalPolicy: never`
    - `sandboxMode: danger-full-access`

Over-delivery:
- Kept profile mapping structure unchanged (`safe` / `balanced` / `full-auto` / `power`) so operators can still downgrade manually from UI without migration impact.

Verification evidence:
1. `node --check web/01.HarnesUI/app.js` -> PASS
2. `node scripts/app_server_smoke_test.js` -> PASS (includes `/api/runtime` verification)

Residual risk:
- Existing browser `localStorage` settings can override new defaults until cleared or replaced by user selection.
- Relaxed defaults increase accidental destructive-operation risk; operators should switch to stricter profiles when working outside isolated workspaces.

## 51. Avatar 3D Runtime Root-Cause Fix + Local Vendor Rendering Recovery (2026-02-24)

Design intent:
- Eliminate persistent `Avatar: failed to initialize 3D runtime.` on `http://127.0.0.1:57525/english-conversation-app/index.html`.
- Ensure `web/english-conversation-app/assets/models/gpt_chan.vrm` is actually visible in the viewport, not only "ready" by status text.

Baseline delivery:
- Root-cause correction:
  - `@pixiv/three-vrm@2.0.12` references were invalid (non-existent package version) and caused module fetch failure across all fallback sources.
- Replaced vendor proxy placeholders with real local runtime assets:
  - `web/english-conversation-app/vendor/three.module.js` (three@0.164.1 runtime module)
  - `web/english-conversation-app/vendor/three/addons/loaders/GLTFLoader.js`
  - `web/english-conversation-app/vendor/three/addons/utils/BufferGeometryUtils.js` (required by GLTFLoader import chain)
  - `web/english-conversation-app/vendor/three-vrm.module.js` (`@pixiv/three-vrm@2.1.3`)
- Updated `web/english-conversation-app/avatar.js`:
  - fallback sources now use `@pixiv/three-vrm@2.1.3` (valid version).
  - removed previously failing fallback providers (`unpkg` CORS path and skypack package errors) from normal fallback list.
  - renderer switched to opaque clear (`alpha:false`, explicit clear color) for stable canvas visibility.
  - added automatic camera framing based on loaded VRM bounds so model is guaranteed in frame.
  - added bridge diagnostics:
    - `runtimeSource`
    - `frameCount`
    - `lastFrameAt`
    - `modelBounds`
  - idle motion now uses computed base transform (post-framing) instead of fixed hard-coded placement.

Over-delivery:
- Added deterministic local-vendor rendering path verification hooks (`frameCount`, `modelBounds`) to distinguish "loaded-but-not-visible" from actual render-loop failure.
- Corrected default facing direction to front view (rotation baseline) after auto-framing.

Verification evidence:
1. `node --check web/english-conversation-app/avatar.js` -> PASS
2. `GET http://127.0.0.1:57525/api/runtime` -> PASS (`200`)
3. Playwright runtime check on `/english-conversation-app/index.html`:
   - `status: Avatar: ready (local-vendor).`
   - `ready: true`, `error: false`, `mode: three-vrm`
   - `frameCount > 0` and `modelBounds` present
4. Playwright screenshot evidence:
   - `.playwright-cli/page-2026-02-24T11-37-10-797Z.png`
   - confirms `gpt_chan.vrm` visible in viewport.

Residual risk:
- Avatar pose is currently source-model default pose plus lightweight idle/blink/mouth behavior; no full-body animation clip playback is configured.
- Runtime still depends on WebGL availability in the browser; environments with WebGL disabled will still fail 3D rendering.

## 52. Avatar Framing + Pose Comfort Tuning (2026-02-24)

Design intent:
- Improve operator-facing avatar presentation after runtime recovery by:
  - bringing the character closer in frame
  - reducing rigid T-pose arm spread for a more natural neutral stance.

Baseline delivery:
- Updated `web/english-conversation-app/avatar.js`:
  - corrected camera fit-distance math from oversized full-dimension basis to half-dimension fit (`height/width` fit distance), then applied a controlled distance factor.
  - adjusted camera target to upper torso/head line for conversational framing.
  - added `applyComfortPose()` to relax humanoid arm bones (`upperArm` / `lowerArm`) after VRM load.
  - preserved existing idle/blink/mouth behavior while anchoring motion to computed pose baseline.

Over-delivery:
- Added small runtime observability fields for render-loop confidence (`frameCount`, `lastFrameAt`) and applied model-bounds reporting to aid future framing diagnostics.

Verification evidence:
1. `node --check web/english-conversation-app/avatar.js` -> PASS
2. `GET http://127.0.0.1:57525/api/runtime` -> PASS (`200`)
3. Playwright runtime check:
   - `Avatar: ready (local-vendor).`
   - `ready=true`, `error=false`, `frameCount>0`
4. Visual confirmation:
   - `.playwright-cli/page-2026-02-24T11-40-41-122Z.png`
   - avatar appears closer and arm spread is reduced from full T-pose.

Residual risk:
- Neutral arm pose is procedural and may vary by VRM rig conventions; exact per-character aesthetic may require per-model offsets.

## 53. Avatar Close-Up Tuning (2026-02-24)

Design intent:
- Move avatar framing closer on operator request while preserving stable local-vendor rendering.

Baseline delivery:
- Updated `web/english-conversation-app/avatar.js`:
  - tuned `CAMERA_DISTANCE_FACTOR` from `1.18` to `0.92` for a closer conversational framing.

Verification evidence:
1. `node --check web/english-conversation-app/avatar.js` -> PASS
2. `GET http://127.0.0.1:57525/api/runtime` -> PASS (`200`)
3. Playwright runtime check:
   - `Avatar: ready (local-vendor).`
   - `ready=true`, `error=false`, `frameCount>0`
4. Visual confirmation:
   - `.playwright-cli/page-2026-02-24T11-51-26-732Z.png`

Residual risk:
- Stronger close-up can clip lower body on narrower viewport heights; further tuning may require separate mobile/desktop camera factors.

## 54. Avatar Natural Arms + Extra Close Framing (2026-02-24)

Design intent:
- Apply additional user-requested tuning:
  - arms lowered to a more natural neutral pose
  - camera moved even closer.

Baseline delivery:
- Updated `web/english-conversation-app/avatar.js`:
  - `CAMERA_DISTANCE_FACTOR`: `0.92 -> 0.72`
  - `ARM_RELAX_Z`: `0.78 -> 1.22`
  - `FOREARM_RELAX_Z`: `0.18 -> 0.32`
  - increased slight forward bend on upper/lower arms (`rotation.x`) to reduce rigid spread.

Verification evidence:
1. `node --check web/english-conversation-app/avatar.js` -> PASS
2. `GET http://127.0.0.1:57525/api/runtime` -> PASS (`200`)
3. Playwright runtime check:
   - `Avatar: ready (local-vendor).`
   - `ready=true`, `error=false`, `frameCount>0`
4. Visual confirmation:
   - `.playwright-cli/page-2026-02-24T11-53-31-468Z.png`
   - confirms closer framing + lowered arms.

Residual risk:
- With aggressive close-up, lower body clipping can occur on short viewport heights by design.

## 55. Browser TTS Lip-Sync Syncing + Closer Framing Retune (2026-02-24)

Design intent:
- Address remaining UX gaps after close-up tuning:
  - keep the avatar closer without unstable head clipping
  - make mouth motion track phrase cadence better (not constant idle flapping).

Baseline delivery:
- Updated `web/english-conversation-app/app.js`:
  - fixed a critical regression in `cancelBrowserSpeechSynthesis()` (accidental self-recursion) and restored proper `window.speechSynthesis.cancel()` handling.
  - introduced boundary-aware speech cue logic:
    - `noteAvatarSpeechBoundary(event, utteranceText)` now derives cue strength/duration from `onboundary` timing + segment length.
    - fallback cue track remains active initially, then automatically disables when boundary events are frequent enough.
  - strengthened cue control helpers:
    - clamp utility for stable cue ranges
    - boundary-sync reset lifecycle on start/finalize/cancel.
- Updated `web/english-conversation-app/avatar.js`:
  - lip-sync behavior now follows cue/audio input directly (removed sinusoidal idle flap that looked disconnected from speech timing).
  - tuned audio-level mapping and mouth follow rates for faster attack / smoother release.
  - retuned close-up framing and neutral pose:
    - `CAMERA_DISTANCE_FACTOR` -> `0.54`
    - arm relax parameters (`ARM_RELAX_Z`, `FOREARM_RELAX_Z`) for a more natural lowered stance
    - floor baseline and camera framing offsets adjusted to keep full head visible while staying close.

Over-delivery:
- Added boundary-driven/adaptive lip-sync fallback hybrid for Browser TTS so environments with sparse `onboundary` events still get paced mouth cues without pure constant flapping.

Verification evidence:
1. `node --check web/english-conversation-app/app.js` -> PASS
2. `node --check web/english-conversation-app/avatar.js` -> PASS
3. `GET http://127.0.0.1:57525/api/runtime` -> PASS (`200`)
4. Playwright checks on `/english-conversation-app/index.html`:
   - `Avatar: ready (local-vendor).`
   - bridge `ready=true`, `error=false`, `frameCount>0`
   - TTS path executed by sending one chat turn (Browser TTS selected) with no runtime JS errors besides favicon 404
5. Visual confirmation:
   - `.playwright-cli/page-2026-02-24T12-07-48-825Z.png`

Residual risk:
- Browser `SpeechSynthesis` exposes boundary timing quality differently by engine/voice; phrase sync is improved but still approximate compared to phoneme-level viseme streams.
- Console still reports favicon 404 (non-functional impact).

## 56. Persona UX Recovery + Voice Input Robustness (2026-02-24)

Design intent:
- Resolve user-reported multi-defect state in the English conversation UI:
  - persona mode was no longer selectable
  - persona memory felt non-persistent
  - conversation could become non-actionable from current open state
  - voice pickup quality needed better practical behavior.

Baseline delivery:
- `web/english-conversation-app/index.html`
  - restored persona controls:
    - `#conversationModeSelect` (Normal / Friend Persona)
    - `#conversationModeHint`
    - `#personaMemoryStatus`
    - `#personaResetBtn`
  - added voice-input language selector:
    - `#recognitionLangSelect` (`en-US`, `en-GB`, `en-AU`, `ja-JP`)
  - CSP update:
    - `connect-src` now allows `blob:` for GLTF/VRM texture blob fetch path, restoring stable local-vendor avatar load in strict CSP environments.
- `web/english-conversation-app/styles.css`
  - styling for secondary control row and danger reset button state.
- `web/english-conversation-app/app.js`
  - restored mode persistence on boot:
    - boot now loads `loadStoredConversationMode()` instead of hard-reset to `"normal"`.
  - added persona-memory persistence fallback in local storage:
    - `english_conversation_persona_memory_summary`
    - `setPersonaMemorySummary()` now stores normalized summary every update.
  - added server sync helper:
    - `syncPersonaMemoryFromServer()` for persona summary refresh (non-blocking; graceful fallback).
  - improved send reliability from current screen state:
    - explicit `Send` button click handler invokes `sendMessage()` directly.
    - `setPending()` no longer hard-disables send when runtime readiness transiently drops; submit path uses `ensureConversationReady()` at send time.
  - improved speech recognition behavior:
    - persisted recognition language selection via local storage.
    - recognition now uses up to 3 alternatives and selects the best transcript by confidence/length.
    - interim-only transcripts are held slightly longer before auto-send to avoid premature low-quality sends.
    - clearer handling for `no-speech` / `audio-capture` cases and smoother restart cadence.
- `server.js`
  - added `GET /api/conversation/persona/memory?personaUserId=...` for explicit persona summary retrieval.

Over-delivery:
- Added client-side persona summary persistence fallback so memory context remains visible across reloads even before server route rollout/restart.
- Improved CSP compatibility for avatar resource loading under strict browser enforcement.

Verification evidence:
1. Syntax:
   - `node --check web/english-conversation-app/app.js` -> PASS
   - `node --check web/english-conversation-app/avatar.js` -> PASS
   - `node --check server.js` -> PASS
2. Required harness gate:
   - `node scripts/app_server_smoke_test.js` -> PASS
3. UI/runtime:
   - `GET http://127.0.0.1:57525/api/runtime` -> `200`
4. Playwright checks (`/english-conversation-app/index.html`):
   - avatar: `Avatar: ready (local-vendor).`
   - persona UI elements present and operable
   - click-send produces `/api/conversation/direct` and assistant response
   - persona memory label updates after persona turn and persists after reload (local storage fallback)
   - recognition language selection persists (`english_conversation_recognition_lang`)
5. Visual artifact:
   - `.playwright-cli/page-2026-02-24T13-03-27-024Z.png`

Residual risk:
- Browser automation (`playwright-cli select`) showed intermittent select-command reliability; app-side `change` handlers are validated via direct event dispatch and manual click/send flow.
- CSP meta warning for `frame-ancestors` and favicon 404 remain non-functional.

## 56. Local-Only 3D Runtime Lock + External Fetch Block (2026-02-24)

Design intent:
- Keep `gpt_chan.vrm` rendering in strict local mode and prevent browser-side CDN fetches (`https://...`) during avatar runtime initialization.
- Preserve the 3D-required contract: if runtime/model loading fails, show explicit error state (`Avatar: failed to initialize 3D runtime.`), with no 2D fallback.

Baseline delivery:
- Updated `web/english-conversation-app/avatar.js`:
  - removed remote runtime fallback source list (`esm.sh` / `jsdelivr`) from executable initialization flow.
  - removed query-flag-based remote fallback toggles from runtime boot.
  - runtime loader now uses only:
    - `local-vendor` direct URLs (`./vendor/...`)
    - import-map resolution (`three`, `three/addons`, `@pixiv/three-vrm`)
  - bridge telemetry reflects local-only behavior (`remote3dFallback=false`, moduleSources limited to local paths).
- Updated `web/english-conversation-app/index.html`:
  - added CSP meta policy to block external script/connect targets by default:
    - `default-src 'self'`
    - `script-src 'self' 'unsafe-inline'`
    - `connect-src 'self'`
    - plus strict object/base/frame directives.

Over-delivery:
- Hardened browser-side attack surface for this app route by policy, so accidental reintroduction of `https://` dynamic imports is blocked at runtime unless policy is changed.

Verification evidence:
1. `node --check web/english-conversation-app/avatar.js` -> PASS
2. `node scripts/app_server_smoke_test.js` -> PASS (includes `/api/runtime` verification)
3. Static inspection:
   - `web/english-conversation-app/avatar.js` initialization path no longer executes remote CDN runtime sources.
   - `web/english-conversation-app/index.html` includes CSP restricting external fetch/script origins.

Residual risk:
- If vendor module files are replaced with externally re-exporting stubs in the future, module resolution integrity depends on code review + CSP staying intact.

## 58. No Focus-Steal Defaults for Game/Background Use (2026-02-24)

Design intent:
- Prevent unexpected screen switching while the operator is in another foreground task (e.g., gaming).
- Keep shell/browser popup behavior explicitly opt-in.

Baseline delivery:
- Updated `server.js`:
  - changed browser auto-open default to opt-in:
    - `CODEX_AUTO_OPEN_BROWSER=1` only (default is off).
  - added `CODEX_ALLOW_OPEN_CMD_WINDOW` gate for `/api/open-cmd`:
    - default off (`false`).
    - when disabled, endpoint returns `403` with runtime-policy error.
  - control API action allowlist now reflects gate state:
    - disabled by default (empty list unless `CODEX_ALLOW_OPEN_CMD_WINDOW=1`).
  - when command shell open is enabled, launch path is minimized (`start /min`) to reduce focus impact.
- Updated `web/01.HarnesUI/app.js`:
  - `Open CMD` button is enabled only when runtime token exists **and** `open_workspace_shell` is allowed by runtime allowlist.
  - clicking the button while disallowed returns local system message instead of triggering popup attempts.

Verification evidence:
1. `node --check web/01.HarnesUI/app.js` -> PASS
2. `node --check server.js` -> PASS
3. `node scripts/app_server_smoke_test.js` -> PASS (includes `/api/runtime` and unauthenticated `/api/open-cmd` guard check)
4. `GET http://127.0.0.1:57525/api/runtime` -> `200` (on running server instance)

Residual risk:
- Existing already-running `server.js` process keeps old behavior until restart.
- If user explicitly enables both `CODEX_AUTO_OPEN_BROWSER=1` and `CODEX_ALLOW_OPEN_CMD_WINDOW=1`, focus-stealing behavior can return by design.

## 57. CLI Harness Pretty Output Readability Upgrade (2026-02-24)

Design intent:
- Improve operator UX in `start_codex_cli_harness.bat` sessions by making assistant responses easier to scan in terminal output.
- Keep the standard execution path unchanged (`CLI -> /api/exec`) while adding local rendering-only enhancements.

Baseline delivery:
- Updated `scripts/cli_via_api_exec.js`:
  - added `PrettyStreamRenderer` for streamed response formatting in interactive and one-shot text modes.
  - applies lightweight readability shaping:
    - heading emphasis
    - list/bullet normalization (`*` -> `-`)
    - soft line wrapping for long unbroken outputs
    - markdown inline styling (`**strong**`, `` `code` ``)
  - added blue-highlight emphasis for `**strong**` segments when ANSI colors are available.
  - preserved raw output compatibility with a new switch:
    - `--plain-output` disables pretty rendering
    - `--pretty-output` forces pretty rendering
  - preserved JSON one-shot behavior (`--json`) and existing payload semantics.
- Updated `README.md` CLI path notes with pretty-output defaults and opt-out control.

Over-delivery:
- Added environment-level default control:
  - `HARNESS_PRETTY_OUTPUT=0` disables pretty rendering globally without changing launcher files.

Verification evidence:
1. `node --check scripts/cli_via_api_exec.js` -> PASS
2. `node scripts/cli_via_api_exec.js --help` -> PASS (new CLI options shown)
3. `node scripts/app_server_smoke_test.js` -> FAIL in this environment (`spawn EPERM` while spawning `codex app-server`)

Residual risk:
- ANSI styling availability depends on terminal capabilities; when unsupported, formatting falls back to plain text transforms.
- Runtime smoke verification remains blocked in this environment by process spawn permissions (`EPERM`), so full end-to-end execution should be revalidated on a host where `codex app-server` spawn is permitted.

## 59. Persona Continuity + TTS Lock Recovery (2026-02-24)

Design intent:
- Fix user-reported blockers in the English conversation UI:
  - Persona mode selector unusable/missing.
  - Persona memory not feeling persistent.
  - Conversation getting stuck from current screen state.
  - Voice input quality feeling weak.
- Keep existing local-first architecture and default port (`57525`) unchanged.

Baseline delivery:
- Restored persona and input controls in `web/english-conversation-app/index.html`:
  - `#conversationModeSelect` (Normal / Friend Persona)
  - `#recognitionLangSelect` (en-US/en-GB/en-AU/ja-JP)
  - `#personaMemoryStatus`, `#personaResetBtn`
- Added CSP connect allowance for local blob transport used by avatar runtime:
  - `connect-src 'self' blob:`
- Strengthened UI behavior in `web/english-conversation-app/app.js`:
  - preserve stored mode on boot (`loadStoredConversationMode()`).
  - local fallback persistence for persona summary (`english_conversation_persona_memory_summary`).
  - explicit click handler for `#sendBtn`.
  - send/compose lock now tied to pending only (no hidden lock on `conversation.ready` for send button).
  - speech recognition robustness:
    - `maxAlternatives=3`
    - best-alternative selection (`pickRecognitionTranscript`)
    - adaptive interim hold and silence flush timing
    - persisted recognition language preference.
- Added `GET /api/conversation/persona/memory` in `server.js` for explicit persona memory fetch.

Over-delivery:
- Added TTS lock-recovery safety in `web/english-conversation-app/app.js`:
  - `speakAssistantTextWithTimeout()` wraps TTS playback wait with dynamic timeout (`~7-30s`).
  - prevents indefinite pending state when browser TTS callbacks stall.
- Expanded persona fact extraction in `scripts/lib/conversation_persona_policy.js`:
  - captures intents like:
    - "I want to practice speaking/talking about ..."
    - "I'd like to talk about ..."
    - "I'm interested in ..."
    - "My goal is to ..."
  - improves memory retention feel for common learning-intent phrasing.
- Added regression assertion in `scripts/conversation_persona_policy_test.js` for practice-topic extraction.

Verification evidence:
1. Static/syntax:
   - `node --check web/english-conversation-app/app.js` -> PASS
   - `node --check scripts/lib/conversation_persona_policy.js` -> PASS
2. Persona policy tests:
   - `node scripts/conversation_persona_policy_test.js` -> PASS
3. Harness gate:
   - `node scripts/app_server_smoke_test.js` -> PASS
4. Runtime/API:
   - `GET http://127.0.0.1:57525/api/runtime` -> `200`
   - `GET /api/conversation/persona/memory?personaUserId=...` -> `200`
5. Functional checks:
   - persona direct turn returns memory summary with extracted practice-topic fact.
   - headless browser flow confirms mode switch + send path + assistant response and eventual send unlock.

Residual risk:
- Browser SpeechRecognition remains engine-dependent; `recognitionLang` and alternative scoring improve practical quality but do not guarantee phoneme-level accuracy.
- Browser TTS timing is now fail-safe bounded; long responses can still keep input locked until playback or timeout completes by design.

## 60. Cute Robot GLB Animation Integration for English Conversation App (2026-02-28)

Design intent:
- Replace the previous VRM-only avatar dependency with a project-local animated robot asset that can be rendered directly in the English conversation app.
- Keep compatibility with existing VRM runtime path while enabling GLB animation playback.

Baseline delivery:
- Created and exported animated GLB asset from Blender:
  - Output: `web/english-conversation-app/assets/models/cute_robot_loop.glb`
  - Timeline: frame `1-72` (24fps), loop-friendly idle+bob+wave motion.
- Updated `web/english-conversation-app/avatar.js`:
  - Model URL switched to `./assets/models/cute_robot_loop.glb`.
  - Loader path upgraded from VRM-only to `VRM/GLB dual-mode`.
  - Added generic GLTF animation playback via `THREE.AnimationMixer` and automatic clip loop.
  - Kept VRM expression/lip-sync code path intact when model type is VRM.
  - Added bridge diagnostics fields:
    - `modelType`
    - `animationClips`
    - `supportsExpressions`

Over-delivery:
- Runtime status now includes source/model mode/clip count (`local-vendor/gltf clips:N`), improving operator diagnostics when swapping 3D assets.
- Camera auto-framing path generalized from VRM-only to any loaded 3D model root.

Verification evidence:
1. Asset export:
   - Blender MCP export log confirms GLB write success:
     - `GLB_EXPORTED:C:\Users\akima\Desktop\codex_Original_UI_PJ\web\english-conversation-app\assets\models\cute_robot_loop.glb`
2. Syntax:
   - `node -e "new Function(fs.readFileSync('.../avatar.js','utf8'))"` -> PASS
3. Runtime API:
   - `GET http://127.0.0.1:57525/api/runtime` -> `200`
4. Browser E2E (Playwright):
   - `AVATAR_STATUS: Avatar: ready (local-vendor/gltf clips:10).`
   - Screenshot evidence:
     - `web/english-conversation-app/avatar_load_check.png`

Residual risk:
- GLB path does not support VRM expression channels; mouth/blink viseme controls remain VRM-only by design.
- Generated model is object-animation based (not humanoid rig), so future gesture expansion is clip-centric rather than bone-retarget-centric.

## 61. CLI Harness Completion Summary Noise Reduction (2026-02-28)

Design intent:
- Reduce operator noise in default Windows CLI harness usage by suppressing non-essential turn completion summary lines.
- Keep failure visibility and explicit opt-in metadata logging behavior unchanged.

Baseline delivery:
- Updated `start_codex_cli_harness.bat`:
  - default `HARNESS_SHOW_META` changed from `1` to `0` when unset.
  - result: successful turns no longer print trailing `[turn] status=completed ...` by default.

Over-delivery:
- Updated `README.md` Notes section to document:
  - default suppression behavior
  - opt-in restoration via `HARNESS_SHOW_META=1`

Verification evidence:
1. Static config check:
   - `start_codex_cli_harness.bat` now contains:
     - `if "%HARNESS_SHOW_META%"=="" set "HARNESS_SHOW_META=0"`
2. Documentation sync:
   - `README.md` launcher notes include `HARNESS_SHOW_META` default and override guidance.

Residual risk:
- If user/session explicitly sets `HARNESS_SHOW_META=1` (or passes `--show-meta`), completion summary logs are still shown by design.

## 62. Cute Robot Natural Motion Layer Tuning (2026-02-28)

Design intent:
- Make the GLB robot avatar feel less mechanical by adding natural secondary motion on top of existing baked clips.
- Keep the current asset path and loader contract unchanged for `web/english-conversation-app`.

Baseline delivery:
- Updated `web/english-conversation-app/avatar.js` GLTF runtime path:
  - Added a procedural motion layer for GLB models (`gltf` mode only).
  - Added gentle left-arm conversational movement (shoulder/arm/forearm/fingers).
  - Added subtle head micro-motion.
  - Added random-interval eye blink behavior by scaling eye nodes:
    - `REF_EyeRing_*`
    - `REF_EyePupil_*`
    - `REF_EyeHi_*`
  - Added small right-finger micro offsets layered over the existing baked right-hand wave clip.

Over-delivery:
- Motion composition is now additive where clips already exist, preserving the authored animation while reducing robotic stiffness.
- Node lookup and procedural setup are isolated to GLTF mode so VRM behavior stays unchanged.

Verification evidence:
1. Syntax:
   - `node --check web/english-conversation-app/avatar.js` -> PASS
2. Runtime:
   - `GET http://127.0.0.1:57525/api/runtime` -> `200`
3. Browser E2E (Playwright):
   - `AVATAR_STATUS: Avatar: ready (local-vendor/gltf clips:10).`
   - frame-difference check (`1.8s` interval): `SCREEN_DIFF:YES`
   - no runtime page exceptions: `PAGE_ERRORS:0`
   - screenshots:
     - `web/english-conversation-app/avatar_motion_tuned_a.png`
     - `web/english-conversation-app/avatar_motion_tuned_b.png`

Residual risk:
- Blink relies on named mesh nodes in the exported GLB; if future exports rename these nodes, blink animation will no-op until mapping is updated.
- Procedural offsets are tuned for this stylized robot and may need retuning for other non-humanoid GLB assets.

## 63. Web Avatar Refresh with Antenna-Tuned GLB (2026-02-28)

Design intent:
- Apply the latest Blender-side visual tuning (stronger antenna silhouette) to the actual web avatar asset.
- Keep existing web runtime behavior unchanged while updating only the rendered character look.

Baseline delivery:
- Re-exported Blender robot to:
  - `web/english-conversation-app/assets/models/cute_robot_loop.glb`
- Export used current `REF_*` robot set (mesh + empty) with animation enabled:
  - selected objects: `80`
  - actions included: `10`
  - keeps existing loop animation tracks (`REF_RobotRootAction` + right-arm/antenna actions)

Over-delivery:
- Ran viewport-preview tuning pass focused on antenna readability before final export:
  - stem elongated and oriented toward raised tip positions
  - bulb/halo size adjusted for clearer “antenna” impression
- Produced updated local verification artifacts for quick visual regression checks.

Verification evidence:
1. Blender MCP export:
   - `EXPORT_RESULT:{'FINISHED'}`
   - `GLB_EXPORTED:C:\Users\akima\Desktop\codex_Original_UI_PJ\web\english-conversation-app\assets\models\cute_robot_loop.glb`
2. Asset timestamp/size:
   - `cute_robot_loop.glb` updated (`LastWriteTime=2026-02-28 19:39:39`, size `986,520` bytes)
3. Runtime/API:
   - `GET http://127.0.0.1:57525/api/runtime` -> `200`
4. Browser E2E (Playwright):
   - `AVATAR_STATUS: Avatar: ready (local-vendor/gltf clips:10).`
   - screenshot:
     - `web/english-conversation-app/avatar_after_antenna_apply.png`

Residual risk:
- The app uses browser cache; users may need hard-reload (`Ctrl+F5`) to see the newly exported GLB immediately.

## 64. GLB Avatar Natural Motion Smoothing + Blink Upgrade (2026-02-28)

Design intent:
- Reduce “robotic/choppy” perception in the GLB avatar by improving procedural secondary motion quality.
- Keep current asset path and clip playback compatibility while making idle/face motion feel more organic.

Baseline delivery:
- Updated `web/english-conversation-app/avatar.js` GLTF procedural layer:
  - Added damping helper (`smoothTowards`) and clamp utility for stable motion interpolation.
  - Reworked left-arm/head/smile offsets from direct high-frequency sine motion to damped target-following motion.
  - Replaced single symmetric blink with staged blink state machine:
    - close -> hold -> open
    - random interval scheduling
    - occasional double-blink
    - left/right asymmetric closure bias
  - Split eye scaling targets into left/right groups for independent blink amount.
  - Reduced right-arm micro jitter by lowering frequency/amplitude and applying gentler additive offsets.
- Tuned GLTF clip actions:
  - `setEffectiveWeight(0.95)`
  - `setEffectiveTimeScale(0.96)`

Over-delivery:
- Preserved existing `gltf clips:10` pipeline while improving perceived naturalness without requiring a new rig or breaking VRM path.
- Added fresh visual evidence snapshots after motion tuning.

Verification evidence:
1. Syntax:
   - `node --check web/english-conversation-app/avatar.js` -> PASS
2. Runtime:
   - `GET http://127.0.0.1:57525/api/runtime` -> `200`
3. Browser E2E (Playwright):
   - `AVATAR_STATUS: Avatar: ready (local-vendor/gltf clips:10).`
   - `MODEL_TYPE:gltf`
   - `PAGE_ERRORS:0`
   - screenshots:
     - `web/english-conversation-app/avatar_natural_motion_tuned_a.png`
     - `web/english-conversation-app/avatar_natural_motion_tuned_b.png`

Residual risk:
- Motion quality is still tied to the stylized non-rig setup (object-level transforms + procedural overlays), so “fully character-animated” quality would require dedicated rig/blendshape authoring.

## 65. New Skill: Blender Pro Character Pipeline (2026-03-01)

Design intent:
- Capture retrospective quality lessons from recent robot-avatar work and convert them into a reusable skill workflow.
- Prioritize Blender-side model quality and animation naturalness first, then export fidelity validation.

Baseline delivery:
- Added new skill package:
  - `skills/blender-pro-character-pipeline/SKILL.md`
  - `skills/blender-pro-character-pipeline/agents/openai.yaml`
  - `skills/blender-pro-character-pipeline/references/quality-gates.md`
  - `skills/blender-pro-character-pipeline/references/animation-naturalness.md`
  - `skills/blender-pro-character-pipeline/references/export-validation.md`
- Skill scope is platform-agnostic:
  - no Tripo-specific naming
  - no web-runtime-specific assumptions
  - workflow is Blender quality gates + export validation

Over-delivery:
- Updated machine-readable skill catalog metadata:
  - `scripts/config/skill_catalog.json`
    - added `blender-pro-character-pipeline` skill metadata (`class=scenario`, `coverage=partial`, `ownerRoles=[worker]`)
    - added assignment under `worker`
    - bumped catalog version/date (`2026-03-01.r1`, `2026-03-01`)

Verification evidence:
1. Skill portfolio audit:
   - `node scripts/skill_portfolio_audit.js` -> PASS
   - includes `PROMOTION none` output
2. Filesystem checks:
   - new skill files created under `skills/blender-pro-character-pipeline`
3. Catalog integrity:
   - updated `skill_catalog.json` parsed and validated via audit path

Residual risk:
- The skill codifies process quality but does not automatically generate high-end topology or stylization; output quality still depends on iterative artistic review at each gate.

## 66. Prompt-Based Robot Quality Upgrade in Blender (2026-03-01)

Design intent:
- Shift robot refinement from image-led adjustments to a prompt-driven specification flow.
- Increase fidelity of materials, glow behavior, and studio presentation while keeping animation/export pipeline intact.

Baseline delivery:
- Applied prompt-constrained material and lookdev pass in Blender:
  - glossy black screen tuning (`REF_Screen`)
  - neon-green eye/smile glow reinforcement (`REF_Eye`) + dedicated pupil glow material (`REF_EyePupilGlow`)
  - stronger red blush readability (`REF_Blush`)
  - glowing yellow chest-heart core (`REF_HeartGlow` assigned to `REF_HeartCore`)
  - button color alignment (`PLAY` green, `LEARN` red)
  - antenna glow tuning for green/orange bulbs and halos (`REF_AntGlowG`, `REF_AntGlowO`, halo materials)
  - joint/tread material balancing toward prompt-described gray mechanics
- Soft studio lighting and neutral background setup:
  - Eevee Next lookdev pass, neutral world background, key/fill/rim rebalance, default legacy light hidden for render consistency.
- Generated updated preview artifacts:
  - `output/blender/robot_prompt_based_high_quality.png`
  - `output/blender/robot_prompt_based_preview_compat.mp4`
- Re-exported updated model to app asset:
  - `web/english-conversation-app/assets/models/cute_robot_loop.glb`

Over-delivery:
- Added object-level material isolation for eye pupils and heart core so emissive look is controllable without contaminating unrelated text/line materials.
- Preserved existing animation tracks and runtime compatibility while raising visual quality.

Verification evidence:
1. Blender export + render commands:
   - `PROMPT_PASS_ANIM:{'FINISHED'}`
   - `PROMPT_PASS_GLB:{'FINISHED'}`
2. Artifact presence:
   - still: `robot_prompt_based_high_quality.png` (created)
   - video: `robot_prompt_based_preview_compat.mp4` (created)
   - GLB: `cute_robot_loop.glb` updated (`LastWriteTime=2026-03-01 11:39:52`)
3. Runtime/API:
   - `GET http://127.0.0.1:57525/api/runtime` -> `200`
4. Browser E2E (Playwright):
   - `AVATAR_STATUS: Avatar: ready (local-vendor/gltf clips:10).`
   - screenshot: `web/english-conversation-app/avatar_prompt_based_upgrade.png`

Residual risk:
- This pass is still constrained by the existing base geometry; major silhouette/style leaps to premium concept-art level require topology-level remodel rather than material-only tuning.

## 63. UI Launcher Default Entry Fix (2026-02-28)

Design intent:
- Make `start_codex_ui.bat` visibly launch the harness UI for operators without manual URL input.
- Align the default landing page with the expected harness path: `/01.HarnesUI/index.html`.

Baseline delivery:
- Updated `start_codex_ui.bat`:
  - Default `CODEX_AUTO_OPEN_BROWSER` to `1` only when unset.
  - Updated launcher fallback URL to `http://127.0.0.1:%CODEX_UI_PORT%/01.HarnesUI/index.html`.
  - Removed pre-launch `netstat/tasklist/taskkill` port-owner cleanup block to avoid permission-noise (`ERROR: Access denied`) during startup.
  - Kept default port `57525` and local-first execution path unchanged.
- Updated `web/index.html`:
  - Redirect target changed from `/english-conversation-app/index.html` to `/01.HarnesUI/index.html`.
  - Page title/link text aligned to `Codex Harness UI`.

Over-delivery:
- Added explicit launcher console guidance:
  - auto-open expected line
  - fallback URL line for manual recovery
- Existing direct paths remain available (`/english-conversation-app/index.html` still works when opened directly).

Verification evidence:
1. Launcher run:
   - `cmd /c start_codex_ui.bat` output includes:
     - `[launcher] browser should open automatically.`
     - `[launcher] fallback URL: http://127.0.0.1:57525/01.HarnesUI/index.html`
2. Runtime API:
   - `GET http://127.0.0.1:57525/api/runtime` -> `200`
3. Root landing content:
   - `GET http://127.0.0.1:57525/` returns `web/index.html` with
     `meta refresh` and `window.location.replace` pointing to `/01.HarnesUI/index.html`.

Residual risk:
- Browser auto-open depends on Windows shell `start` behavior; locked-down endpoint policy can still block browser launch, but fallback URL remains printed.

## 64. English Conversation App Launcher Addition (2026-02-28)

Design intent:
- Provide a dedicated one-click launcher for `web/english-conversation-app/index.html`.
- Keep a single server startup path while allowing per-launcher browser landing targets.

Baseline delivery:
- Updated `server.js`:
  - Added `CODEX_AUTO_OPEN_PATH` support for browser auto-open URL selection.
  - Auto-open now uses `http://127.0.0.1:<port><CODEX_AUTO_OPEN_PATH>` when path is set.
  - Added `autoOpenPath` to `server.started` operation log payload.
- Updated `start_codex_ui.bat`:
  - Added default `CODEX_AUTO_OPEN_PATH=/01.HarnesUI/index.html` when unset.
  - `UI_URL` now composes from `%CODEX_UI_PORT%` + `%CODEX_AUTO_OPEN_PATH%`.
  - `CODEX_EXECUTION_PROFILE` now defaults only when unset (`relaxed-ui`).
- Added `start_english_conversation_app.bat`:
  - Sets default `CODEX_AUTO_OPEN_PATH=/english-conversation-app/index.html`.
  - Sets default `CODEX_EXECUTION_PROFILE=english-conversation-ui`.
  - Delegates startup to `start_codex_ui.bat`.
- Updated `README.md`:
  - Added dedicated quick-start instructions for English conversation app launcher.
  - Added `CODEX_AUTO_OPEN_PATH` note.

Over-delivery:
- Introduced launcher composition pattern (`wrapper -> start_codex_ui.bat`) to avoid duplicated runtime/bootstrap logic.
- Preserved default port (`57525`) and standard `POST /api/exec` execution path.

Verification evidence:
1. Static checks:
   - `node --check server.js` -> PASS
2. Required harness smoke test (server change):
   - `node scripts/app_server_smoke_test.js` -> PASS
3. Runtime API:
   - `GET http://127.0.0.1:57525/api/runtime` -> `200`

Residual risk:
- If enterprise endpoint policy blocks shell-driven browser open, both launchers still require manual URL open via printed fallback.

## 65. Launcher Pause-On-Exit Visibility Gate (2026-02-28)

Design intent:
- Prevent operator confusion when launcher windows close immediately after a successful fast-exit path.
- Ensure both UI launchers keep visible terminal state until user acknowledgment.

Baseline delivery:
- Updated `start_codex_ui.bat`:
  - Added default `CODEX_PAUSE_ON_EXIT=1` (only when unset).
  - Added explicit success line on normal exit:
    - `[launcher] server.js exited with code: 0`
  - Unified exit flow to always support pause + exit code propagation.
  - Added close prompt:
    - `[launcher] press any key to close this window...`
- Updated `start_english_conversation_app.bat`:
  - Added default `CODEX_PAUSE_ON_EXIT=1` (only when unset), inherited by delegated `start_codex_ui.bat`.
- Updated `README.md` Notes:
  - Documented `CODEX_PAUSE_ON_EXIT` default and opt-out (`0`).

Over-delivery:
- Added opt-out control so automation/CI can still run non-interactive launcher checks by setting `CODEX_PAUSE_ON_EXIT=0`.

Verification evidence:
1. Script output checks (with piped key input):
   - `cmd /c "echo.| start_codex_ui.bat"` output includes close prompt line.
   - `cmd /c "echo.| start_english_conversation_app.bat"` output includes close prompt line.
2. Runtime API:
   - `GET http://127.0.0.1:57525/api/runtime` -> `200`

Residual risk:
- If launcher is executed from a host that does not provide stdin, `pause` can still wait indefinitely unless `CODEX_PAUSE_ON_EXIT=0` is explicitly set.

## 66. Edge-First Browser Auto-Open (2026-02-28)

Design intent:
- Ensure launcher auto-open behavior uses Microsoft Edge explicitly when available.
- Keep fallback compatibility with system-default browser when Edge is not present.

Baseline delivery:
- Updated `server.js` auto-open path:
  - Added Edge executable resolver (`resolveEdgeExecutable()`):
    - priority: `CODEX_EDGE_EXE` -> `where msedge` -> common Edge install paths.
  - Updated `openBrowser(url)`:
    - launches Edge with `--new-window <url>` when Edge is resolved.
    - falls back to `cmd /c start "" "<url>"` if Edge launch path is unavailable/fails.
  - Added startup operation-log visibility:
    - `server.started.autoOpenBrowserEngine = "edge" | "system-default"`.
- Updated `README.md` Notes:
  - documented Edge-first behavior and `CODEX_EDGE_EXE` override.
- Updated `start_codex_ui.bat`:
  - auto-resolves `CODEX_EDGE_EXE` from common Windows Edge install paths when unset.
  - prints browser target hint (`Microsoft Edge` or `system default`).

Over-delivery:
- Added explicit `--new-window` launch argument to reduce ambiguity when an Edge process is already running.

Verification evidence:
1. Syntax:
   - `node --check server.js` -> PASS
2. Required harness smoke test (server change):
   - `node scripts/app_server_smoke_test.js` -> PASS
3. Runtime API:
   - `GET http://127.0.0.1:57525/api/runtime` -> `200`

Residual risk:
- Some managed Windows environments can block detached browser spawning; in that case fallback/manual URL remains required.

## 67. Agent Topography Toggle + Trace Sync Overlay (2026-02-28)

Design intent:
- Let operators collapse/expand the floating `Agent Topography Monitor` while working in the main trace panel.
- Reduce perception gap between `実行トレース` and topography by overlaying live trace/pending state on topography rows.

Baseline delivery:
- Updated `web/01.HarnesUI/index.html`:
  - Added topography header actions container with new toggle button:
    - `#agentTopographyToggleBtn` (`閉じる` / `開く`)
  - Kept existing manual refresh button.
- Updated `web/01.HarnesUI/app.js`:
  - Added topography UI state persistence:
    - `TOPOGRAPHY_COLLAPSED_KEY`
    - `loadTopographyUiState()`, `saveTopographyUiState()`, `setTopographyCollapsed()`
  - Added trace sync merge logic:
    - `syncedTopographyRows(rows)` merges `/api/agent-topography` rows with local `s.req` + latest `s.trace`.
    - Shows synthetic trace-only rows when trace agent is missing from topography source.
    - Prioritizes tones by activity (`running` > `failed` > `completed` > `idle`).
  - Enhanced `renderAgentTopography()`:
    - collapsed class support + `aria-expanded` update
    - trace-sync count and timestamp in meta line
    - per-row sync detail text (`trace HH:MM:SS / event ...`)
  - Added immediate synchronization hook:
    - `flow()` now calls `renderAgentTopography()` after trace list render.
  - Bound toggle button action in `bind()`.
  - Boot now restores collapse state before first render.
- Updated `web/01.HarnesUI/styles.css`:
  - Added `.agent-topography-actions`.
  - Added collapsed presentation (`.agent-topography-monitor.collapsed`).
  - Added sync visuals:
    - `.agent-topography-item.synced`
    - `.agent-topography-status.completed`
    - `.agent-topography-sync`.

Over-delivery:
- Collapse state persists across reloads to reduce repeated operator clicks.
- Topography now displays recent trace evidence inline per agent, not only remote topography status labels.

Verification evidence:
1. Syntax:
   - `node --check web/01.HarnesUI/app.js` -> PASS
2. UI launch and runtime API (required for `web/` changes):
   - `cmd /c "set CODEX_PAUSE_ON_EXIT=0&&start_codex_ui.bat"` -> launcher started
   - `GET http://127.0.0.1:57525/api/runtime` -> `200`

Residual risk:
- Trace overlay is based on latest local trace event per agent; if a role emits no trace in current session, topography falls back to API status labels.

## 68. Chat Session Delete Action (2026-02-28)

Design intent:
- Add an explicit way to delete an entire chat session from the harness UI (not only clear messages).
- Keep local-first chat persistence behavior and avoid leaving the UI without an active chat.

Baseline delivery:
- Updated `web/01.HarnesUI/index.html`:
  - Added `#deleteChatBtn` ("削除") next to the existing `#newChatBtn` in chat manager header.
- Updated `web/01.HarnesUI/styles.css`:
  - Added `.chat-manager-actions` layout to align new/delete controls side-by-side.
- Updated `web/01.HarnesUI/app.js`:
  - Added `deleteChatBtn` element binding.
  - Added `deleteChat(chatId)` implementation:
    - confirmation dialog before deletion,
    - aborts in-flight requests for the deleted chat,
    - removes chat from in-memory list and persisted localStorage state,
    - reselects a valid active chat,
    - auto-creates fallback `Chat 1` when last chat is deleted.
  - Added keyboard shortcut on chat list item: `Delete` key triggers deletion.
  - Wired header button click to `deleteChat()`.
  - Keeps delete button disabled when no active chat exists.

Over-delivery:
- Added explicit warning text in confirmation when the target chat has running requests, and forcibly aborts those requests to prevent orphaned execution from continuing after deletion.

Verification evidence:
1. Syntax check:
   - `node --check web/01.HarnesUI/app.js` -> PASS
2. Required web-runtime check:
   - started UI server via `node server.js` (with `CODEX_AUTO_OPEN_BROWSER=0`)
   - `GET http://127.0.0.1:57525/api/runtime` -> `200`
3. UI artifact check:
   - `GET http://127.0.0.1:57525/01.HarnesUI/index.html` includes `id="deleteChatBtn"`

Residual risk:
- When deleting a chat with in-flight requests, stream teardown and local UI state updates are asynchronous; transient pending counters can momentarily appear until abort finalization completes.

## 69. Harness UI Mojibake Remediation (2026-02-28)

Design intent:
- Eliminate severe mojibake in `web/01.HarnesUI/index.html` that made core controls unreadable.
- Restore a stable UTF-8 text surface without changing runtime behavior/IDs required by `app.js`.

Baseline delivery:
- Rebuilt `web/01.HarnesUI/index.html` with clean UTF-8 labels.
- Preserved all critical DOM IDs used by `web/01.HarnesUI/app.js` (chat controls, diagnostics, trace, topography, automation, composer).
- Kept recent topography toggle markup (`#agentTopographyToggleBtn`) and automation IDs (`#automation*`) aligned with current `app.js`.

Over-delivery:
- Normalized static copy to ASCII/English to avoid recurring code-page corruption on mixed Windows environments.

Verification evidence:
1. No mojibake signatures in served UI HTML:
   - `GET /01.HarnesUI/index.html` -> `MOJIBAKE_NOT_FOUND` (pattern check).
2. Runtime remains healthy:
   - `GET /api/runtime` -> `200`
3. Script syntax:
   - `node --check web/01.HarnesUI/app.js` -> PASS

Residual risk:
- Dynamic text emitted from future edits can still regress if files are saved with inconsistent encodings; keep UTF-8 explicit on all `web/01.HarnesUI/*` edits.

## 70. Parent/Child Trace Clarification + Default Agent Reset (2026-02-28)

Design intent:
- Make agent ownership obvious in `Execution Trace` by showing `parent/child` semantics.
- Hide technical placeholder agent `main` from operator-facing trace/topography views.
- Restore launcher default execution agent to `default` (parent orchestrator).

Baseline delivery:
- Updated `web/01.HarnesUI/app.js`:
  - Added hidden-agent rule: `HIDDEN_AGENT_NAMES = ["main"]`.
  - Added role inference helper for UI cards:
    - parent set: `default`, `intake`, `release_manager`
    - otherwise `child`
  - Updated `flow()` (`Execution Trace`) to:
    - filter hidden agents,
    - render `role: parent|child` on each card.
  - Updated topography sync merge path to exclude hidden agent names consistently.
- Updated `start_codex_ui.bat`:
  - `CODEX_DEFAULT_EXEC_AGENT=default`
- Updated `start_codex_cli_harness.bat`:
  - unset fallback changed from `worker` to `default`

Over-delivery:
- Kept filtering logic centralized (`normalizeAgentNameForUi`, `isHiddenAgentForUi`) so future UI panels can reuse the same visibility policy without duplicate conditions.

Verification evidence:
1. Syntax:
   - `node --check web/01.HarnesUI/app.js` -> PASS
2. Launcher defaults:
   - `start_codex_ui.bat` contains `CODEX_DEFAULT_EXEC_AGENT=default`
   - `start_codex_cli_harness.bat` contains fallback `CODEX_DEFAULT_EXEC_AGENT=default`
3. Runtime/API smoke:
   - `node scripts/app_server_smoke_test.js` -> PASS
   - includes `/api/runtime` health step (`start local harness server (/api/runtime)` + runtime assertions)

Residual risk:
- If an operator manually sets `CODEX_DEFAULT_EXEC_AGENT` in the shell before launch, that explicit env value still overrides launcher defaults by design.

## 71. New Chat Semantics Hardening (2026-02-28)

Design intent:
- Align `New Chat` with operator expectation: a fresh conversation context, not only a new message list.
- Prevent prior chat execution trace/live status from leaking into a newly created chat view.

Baseline delivery:
- Updated `web/01.HarnesUI/app.js`:
  - Added per-chat execution trace tagging (`trace(..., cid)`), storing `cid` on each trace event.
  - Changed `Execution Trace` rendering (`flow()`) to scope by active chat ID:
    - agent cards derive from active chat + active chat trace + active chat pending requests.
    - prior chat traces are excluded from the current view.
  - Changed `live()` panel to scope by active chat:
    - running counters and last-run status now use active chat ID.
  - Added `forceNewSession` chat flag:
    - new chats default `forceNewSession=true`.
    - first successful run sends `forceNewSession=true` to `/api/exec`, then flips false.
  - Updated `clearChat()` (`New Thread`) to reset chat-local execution context:
    - clears chat messages/harness,
    - resets chat trace rows,
    - clears chat-local last-run marker,
    - re-arms `forceNewSession=true`.
  - Updated chat persistence payload to include `forceNewSession`.
  - Updated `Clear Trace` action to clear only the active chat trace (not global).

Over-delivery:
- Added safe restore behavior for legacy saved chats:
  - if persisted `forceNewSession` is absent, restored empty chats default to `true`.

Verification evidence:
1. Syntax:
   - `node --check web/01.HarnesUI/app.js` -> PASS
2. Runtime/API smoke:
   - `node scripts/app_server_smoke_test.js` -> PASS
   - includes `/api/runtime` health checks and end-to-end `/api/exec` path checks.

Residual risk:
- Chat isolation is still agent-session based on runtime internals; this change guarantees fresh session on first run of new chat but does not provide fully independent server-side thread pinning when switching back and forth between multiple historical chats.

## 72. Harness Stage Progression Sync Fix (2026-02-28)

Design intent:
- Ensure `Harness Status` phase cards reflect actual stream signals instead of staying at `1. 要件整理 (待機中)`.
- Keep the phase model operator-meaningful even when event shapes differ across turns.

Baseline delivery:
- Updated `web/01.HarnesUI/app.js`:
  - Added `syncHarnessFlow(c)` and called it at the top of `renderHarness()`.
  - Added `deriveHarnessEvidence(events)` to compute task/test/review/log counters from observed events.
  - Added phase derivation from runtime signals:
    - `dispatch` / `turn/start` / `plan/update` / execution-item events / terminal status.
  - Phase states now move through `todo -> active -> done` (or `failed`) based on observed stream evidence.

Over-delivery:
- Introduced lightweight keyword-based quality detection (`test/review/audit/guard`) so quality phase can surface as active when such signals appear.

Verification evidence:
1. Syntax:
   - `node --check web/01.HarnesUI/app.js` -> PASS
2. Runtime/API smoke:
   - `node scripts/app_server_smoke_test.js` -> PASS
   - includes `/api/runtime` and `/api/exec` validation path.

Residual risk:
- Quality/evidence counters are heuristic (keyword/event-label based) and may under/over-count for uncommon tool/event naming patterns.

## 73. Regression Sweep + Topography Test Repair (2026-02-28)

Design intent:
- Perform broad regression sweep to detect latent breakages after recent UI/harness refactors.
- Restore `scripts/agent_topography_test.js` so it validates current repository layout/runtime behavior.

Baseline delivery:
- Updated `scripts/agent_topography_test.js`:
  - Replaced stale fixed UI path (`web/app.js`) with resolver:
    - prefers `web/01.HarnesUI/app.js`
    - falls back to legacy `web/app.js` when present.
  - Replaced broken worker-based `require(server.js)` boot path with explicit child-process launch:
    - `node server.js` with isolated test port/env.
  - Expanded environment restriction matcher (`EPERM`/`EACCES`/permission-denied variants).

Verification evidence:
1. Targeted test:
   - `node scripts/agent_topography_test.js` -> PASS
2. Full test sweep:
   - all `scripts/*_test.js` executed sequentially -> `FAILED_COUNT=0`
3. Additional smoke in sweep:
   - `scripts/app_server_smoke_test.js` -> PASS
   - `scripts/app_server_cli_smoke_test.js` -> PASS

Residual risk:
- This sweep covers repository test assets and smoke checks; browser-visual regressions still depend on operator-side manual UI confirmation in unrestricted desktop environment.

## 74. Harness Strict/Relaxed Gate Mode (2026-02-28)

Design intent:
- Provide explicit gate strictness so operators can choose audit-grade validation (`Strict`) or heuristic progress (`Relaxed`).
- Prevent misleading stage jumps to execution when planning evidence is missing.

Baseline delivery:
- Updated `web/01.HarnesUI/index.html`:
  - Added harness gate selector `#harnessCheckMode` (`Strict` / `Relaxed`) in Harness header.
  - Added mode explanation text `#harnessCheckModeHint`.
- Updated `web/01.HarnesUI/styles.css`:
  - Added layout/styles for harness mode selector and responsive behavior.
- Updated `web/01.HarnesUI/app.js`:
  - Added persisted mode state:
    - key: `codex-harness-check-mode-v1`
    - default: `strict`
  - Added mode-aware flow sync:
    - `syncHarnessFlow(c, mode)` now gates stage progression by mode.
  - Added mode-aware verdict:
    - `evaluateHarnessVerdict(h, mode)` now applies strict hard/soft signal requirements.
  - `Strict` behavior:
    - stage 3 is not entered unless `plan/update` evidence exists.
    - completed turns missing hard signals (`requirement/dispatch`, `turn/start`, `turn/completed`, `plan/update`) return `FAIL`.
  - `Relaxed` behavior:
    - preserves prior inferred progression logic.

Over-delivery:
- Added mode traceability in highlights:
  - `判定モード: strict（厳密）` or `relaxed（推定）`

Verification evidence:
1. Syntax:
   - `node --check web/01.HarnesUI/app.js` -> PASS
2. Runtime/API smoke:
   - `node scripts/app_server_smoke_test.js` -> PASS
3. Browser automation check:
   - confirmed selector exists and defaults to `strict`
   - switching to `relaxed` updates hint text
   - localStorage key `codex-harness-check-mode-v1` updated accordingly

Residual risk:
- Strict stage/quality interpretation still relies on observable event labels; if upstream event taxonomy changes, strict verdict may become conservative until mapping rules are updated.

## 75. Deep Audit Follow-up Hardening (2026-02-28)

Design intent:
- Validate that `Strict/Relaxed` harness gating works in real browser/runtime execution, not only by code inspection.
- Close drift in test fixtures after UI path migration to `web/01.HarnesUI/*`.

Baseline delivery:
- Added `scripts/harness_check_mode_test.js`:
  - boots local server on isolated port,
  - opens `/01.HarnesUI/index.html` with Playwright,
  - verifies default mode (`strict`),
  - verifies mode persistence (`localStorage` + reload),
  - verifies strict-vs-relaxed stage behavior:
    - strict blocks stage-3 progression without plan/update,
    - relaxed allows inferred stage-3 progression.
- Updated `scripts/agent_governance_policy_test.js`:
  - aligned frontend sample changed path from legacy `web/app.js` to `web/01.HarnesUI/app.js`.

Verification evidence:
1. New dedicated test:
   - `node scripts/harness_check_mode_test.js` -> PASS
2. Full repository test sweep:
   - all `scripts/*_test.js` -> `FAILED_COUNT=0`
3. Smoke regression:
   - `node scripts/app_server_smoke_test.js` -> PASS

Residual risk:
- A broad set of historical architecture notes still references legacy paths (`web/app.js` / `web/styles.css`) as past-state records; runtime behavior is unaffected, but documentation cleanup can further reduce operator confusion.

## 76. Strict Verdict False-Negative Fix (Signal Latching) (2026-02-28)

Design intent:
- Eliminate strict-mode false negatives caused by event list truncation (`events` ring buffer) dropping early `dispatch`/`turn/start` evidence.
- Keep strict checks audit-grade while making them robust to long turns with many item events.

Baseline delivery:
- Updated `web/01.HarnesUI/app.js`:
  - Added persistent harness signal set on state object:
    - `requirement`, `dispatch`, `turnStart`, `turnCompleted`, `plan`, `delegation`, `quality`
  - Added helper pipeline:
    - `createHarnessSignals()`
    - `ensureHarnessSignals(h)`
    - `foldHarnessSignalsFromLabel(...)`
    - `getHarnessSignals(h)`
  - `hpush(...)` now latches signals as events arrive (independent of 64-event display cap).
  - `syncHarnessFlow(...)` and `evaluateHarnessVerdict(...)` now consume latched signals first, with event-derived fallback.

Over-delivery:
- Added fallback inference from terminal status/thread metadata so strict evaluation remains stable after reload and long-stream scenarios.

Verification evidence:
1. Syntax:
   - `node --check web/01.HarnesUI/app.js` -> PASS
2. Dedicated strict/relaxed behavior test:
   - `node scripts/harness_check_mode_test.js` -> PASS
3. Runtime smoke:
   - `node scripts/app_server_smoke_test.js` -> PASS
4. Full test sweep:
   - all `scripts/*_test.js` -> `FAILED_COUNT=0`

Residual risk:
- If upstream stream semantics rename key signals (e.g., plan/delgation labels), latching rules may need periodic mapping updates.

## 77. Strict Signal-Latching Verification Expansion (2026-02-28)

Design intent:
- Prove strict verdict stability under event-buffer overflow conditions, not only nominal event counts.

Baseline delivery:
- Extended `scripts/harness_check_mode_test.js` with overflow scenarios:
  - pushes >120 extra events after initial strict-required signals,
  - confirms display buffer truncation (`events.length=64`) while strict verdict still uses latched signals.
- Added two assertions:
  - strict remains `PASS` when required signals were observed before overflow.
  - strict remains `FAIL` only for true missing `plan/update` (and does not regress to false missing `dispatch`/`turn/start`).

Verification evidence:
1. Dedicated test:
   - `node scripts/harness_check_mode_test.js` -> PASS
2. Full suite:
   - `scripts/*_test.js` -> `TOTAL=18 FAILED=0`

Residual risk:
- Overflow validation currently uses synthetic in-page signal injection; real-world long-turn traces are covered indirectly by smoke tests and should continue to be monitored.

## 78. Multi-Chat Parallel Dispatch + Clear Pending Scope (2026-03-01)

Design intent:
- Allow independent chat rooms to run in parallel while keeping the status surface explicit about "this chat" vs "other chats".
- Keep single-chat safety by preventing duplicate submit only within the same chat.

Baseline delivery:
- Updated `web/01.HarnesUI/app.js`:
  - Removed global submit lock in `runPrompt(...)` and replaced it with per-chat lock (`pendingCountForChat(c.id)`).
  - Added per-chat agent assignment helpers:
    - `deriveAgentNameFromChatId(...)`
    - `ensureChatAgent(...)`
  - New chats now default to a dedicated room agent (`room-*`) instead of sharing one global agent.
  - Saved chat agent is now restored from localStorage (`normalizeSavedChat` keeps `raw.agent`).
  - Updated pending/live indicators:
    - `pendingState`: `No pending`, `Pending: this chat X / total Y`, or `Running in other chats: Y`.
    - `liveStatusDetail` now explicitly shows when only other chats are running.
  - Updated chat list rows to show agent id and per-chat status (`Running N` / `Idle`).

Over-delivery:
- Added status clarity in top bar (`agentState`) by showing both chat title and mapped agent id.

Verification evidence:
1. Syntax:
   - `node --check web/01.HarnesUI/app.js` -> PASS
2. Runtime probe after UI/server up:
   - `GET http://127.0.0.1:57525/api/runtime` -> `200`

Residual risk:
- Parallel requests now rely on per-chat dedicated agents; very large numbers of chats can increase runtime agent-state cardinality until process restart.

## 79. Adaptive Harness Plan Gate (2026-03-01)

Design intent:
- Align harness behavior with intent-first execution where every turn keeps a minimal planning signal, without forcing heavy explicit planning on trivial tasks.
- Reduce repeated false-red operator feedback when strict plan gating is too rigid for lightweight single-action turns.

Baseline delivery:
- Updated `web/01.HarnesUI/app.js`:
  - Added new check mode `adaptive` and made it the default mode.
  - Migrated persisted mode key to `codex-harness-check-mode-v2` with legacy carry-over:
    - keep legacy `relaxed`,
    - map legacy `strict` to new default `adaptive`.
  - Added adaptive micro-plan inference for lightweight turns (no explicit `plan/update`, no delegation/file-change/MCP-heavy signals, no quality/failure signals, and low operation count).
  - Extended latched harness signals with `planInferred` so inferred plan state survives event-buffer churn and repeated flow/verdict recalculation.
  - Updated verdict logic:
    - `strict` remains explicit-plan hard gate.
    - `adaptive` keeps hard gating for heavier turns but allows inferred micro-plan pass for lightweight turns.
  - Updated highlights mode labels to include `adaptive（軽量自動）`.
- Updated `web/01.HarnesUI/index.html`:
  - Added `Adaptive` option to `#harnessCheckMode`.
  - Updated default hint copy for adaptive behavior.
- Updated `scripts/harness_check_mode_test.js`:
  - default mode expectation changed to `adaptive`.
  - added adaptive lightweight pass scenario (inferred micro-plan).
  - added adaptive heavy missing-plan failure scenario (still hard fail on missing `plan/update`).

Over-delivery:
- Adaptive pass path now suppresses soft `child dispatch` warning only for inferred lightweight turns, while retaining the warning for non-lightweight cases.

Verification evidence:
1. Syntax:
   - `node --check web/01.HarnesUI/app.js` -> PASS
   - `node --check scripts/harness_check_mode_test.js` -> PASS
2. Dedicated behavior test:
   - `node scripts/harness_check_mode_test.js` -> PASS
3. Runtime/API smoke:
   - `node scripts/app_server_smoke_test.js` -> PASS
   - includes `/api/runtime` health path validation.

Residual risk:
- Adaptive lightweight classification is heuristic and tied to current event labels; if upstream event taxonomy changes, inference thresholds may need tuning.

## 80. Isolated Chat Lanes with Scoped Default Parent (2026-03-05)

Design intent:
- Keep each chat as an isolated execution space (independent session/thread continuity).
- Preserve parent-orchestrator semantics by treating each chat lane as `default` parent behavior instead of child fallback behavior.

Baseline delivery:
- Updated `web/01.HarnesUI/app.js`:
  - Replaced per-chat runtime agent naming from `room-*` to scoped default lanes: `default@chat-*`.
  - Added automatic migration for legacy saved chat agents (`room-*` and plain `default`) to scoped default lanes.
  - Added canonical parent-role handling in UI (`default@...` resolves to parent role `default`).
  - Updated chat/trace/topography/live status labels to show canonical default name while retaining lane scope context where useful.
- Updated policy modules to recognize scoped parent aliases:
  - `scripts/lib/parent_dispatch_guard_policy.js`
  - `scripts/lib/requirement_rbj_policy.js`
  - `scripts/lib/agent_governance_policy.js`
  - `default@chat-*` is now treated as parent `default` for parent-only gates.
- Updated `server.js` topography role inference:
  - runtime agent names with scoped parent format (`default@...`) are classified as `parent`.

Over-delivery:
- Added compatibility-focused tests for scoped parent aliases across guard/RBJ/governance policy layers.

Verification evidence:
1. Syntax:
   - `node --check web/01.HarnesUI/app.js` -> PASS
   - `node --check server.js` -> PASS
   - `node --check scripts/lib/parent_dispatch_guard_policy.js` -> PASS
   - `node --check scripts/lib/requirement_rbj_policy.js` -> PASS
   - `node --check scripts/lib/agent_governance_policy.js` -> PASS
2. Policy unit tests:
   - `node scripts/parent_dispatch_guard_policy_test.js` -> PASS
   - `node scripts/requirement_rbj_policy_test.js` -> PASS
   - `node scripts/agent_governance_policy_test.js` -> PASS
3. UI harness behavior:
   - `node scripts/harness_check_mode_test.js` -> PASS
4. Runtime/API smoke:
   - `node scripts/app_server_smoke_test.js` -> PASS
   - includes `/api/runtime` health path check.

Residual risk:
- Scoped alias recognition currently uses `@`-based prefix parsing and parent set membership; if future agent naming conventions introduce new scoped separators, compatibility mapping may require extension.

## 80. Exec Model Selector (2026-03-05)

Design intent:
- Allow operators to switch execution model directly from the UI while keeping default behavior aligned to `codex-5.3` + `xhigh`.

Baseline delivery:
- Updated `web/01.HarnesUI/index.html`:
  - Added `Model` input (`#modelName`) in settings panel.
- Updated `web/01.HarnesUI/app.js`:
  - Added default UI model constant `DEFAULT_EXEC_MODEL="codex-5.3"`.
  - Added model persistence in localStorage settings payload (`modelName`).
  - Added `model` to `POST /api/exec` payload for each run.
- Updated `server.js`:
  - Added execution model normalization (`normalizeExecModel`).
  - Added server default model `defaultExecModelName` (`CODEX_DEFAULT_EXEC_MODEL` or `codex-5.3`).
  - Added `model` to thread-start config (`thread/start -> config.model`).
  - Kept reasoning effort fixed to `xhigh` (`model_reasoning_effort`).
  - Added model-aware thread reset when model changes.
  - Added model metadata to runtime payload:
    - `execApi.defaultModel`
    - `execApi.modelReasoningEffort`

Over-delivery:
- Added model dimension to idempotency request hash and operation logs so duplicate detection and audit trails are model-aware.

Verification evidence:
1. Syntax:
   - `node --check web/01.HarnesUI/app.js` -> PASS
   - `node --check server.js` -> PASS
2. Required server smoke:
   - `node scripts/app_server_smoke_test.js` -> PASS
3. UI/runtime probe:
   - `GET http://127.0.0.1:57567/api/runtime` -> `200`
   - `execApi.defaultModel=codex-5.3`
   - `execApi.modelReasoningEffort=xhigh`

Residual risk:
- `model` accepts normalized free-text identifiers; unsupported upstream model names will fail at runtime in `thread/start`.

## 81. Reload-Safe Running Status (2026-03-05)

Design intent:
- Preserve per-room `RUNNING` visibility after page refresh so operators can track ongoing work without losing status context.

Baseline delivery:
- Updated `web/01.HarnesUI/app.js`:
  - `pendingCountForChat` now combines local in-flight requests (`s.req`) and runtime active turns (`/api/runtime -> agents[].activeTurnId`) by agent mapping.
  - Added `totalPendingCount` and runtime-aware pending/live rendering, so chat list and top status reflect active turns even after reload.
  - Updated `agent-flow` running classification to treat runtime active turns as pending.
  - Kept `Stop` button bound to local request controllers only (`localPendingCountForChat`) to avoid false-stop expectations after reconnect.
- Updated `server.js`:
  - In `executeTurnStreaming` client-close handling, `executionSource=web_ui` now detaches instead of immediate `turn/interrupt`.
  - This allows turns started from the web UI to continue in background across page reload.
  - Added operation log event `turn.client_closed_detached`.

Over-delivery:
- Added explicit detached-close audit trail so background continuation is observable in operation logs.

Verification evidence:
1. Syntax:
   - `node --check web/01.HarnesUI/app.js` -> PASS
   - `node --check server.js` -> PASS
2. Required server smoke:
   - `node scripts/app_server_smoke_test.js` -> PASS
3. UI/runtime probe:
   - `GET http://127.0.0.1:57568/api/runtime` -> `200`

Residual risk:
- Detached background execution currently applies only to `executionSource=web_ui`; other execution sources keep the existing disconnect-interrupt behavior.

## 81. Web-Only Route Unification + Persistent Harness Memory (2026-03-05)

Design intent:
- Make the harness single-path for operators (Web UI only).
- Remove legacy API aliases and CLI entrypoints that create split behavior.
- Persist execution-contract memory so idempotency survives server restarts.

Baseline delivery:
- Removed CLI artifacts:
  - deleted `start_codex_cli_harness.bat`
  - deleted `scripts/cli_via_api_exec.js`
  - deleted `scripts/app_server_cli_harness.js`
  - deleted `scripts/app_server_cli_smoke_test.js`
- Removed legacy API aliases in `server.js`:
  - removed `GET /api/poc/status`
  - removed `POST /api/poc/batch/run`
  - removed `POST /api/poc/batch/simulate-tick`
  - kept canonical `/api/batch/*` only
- Updated Web UI automation calls in `web/01.HarnesUI/app.js`:
  - removed fallback calls to `/api/poc/*`
  - now calls `/api/batch/*` directly
- Added persistent harness memory in `server.js`:
  - storage file: `logs/harness_execution_memory.json`
  - stores:
    - contract memory (idempotency key/state/outcome)
    - execution memory (turn terminal records)
    - audit memory (artifact manifest references + hashes)
    - abstraction memory (aggregated mistake patterns)
  - restores contract memory at startup and rebuilds active idempotency cache
  - converts in-flight `running` entries to terminal failed records on restart
- Extended idempotency outcome payload and turn snapshots with artifact manifest hash metadata.
- Updated runtime payload:
  - added `harnessMemory` / `harness_memory` summary
  - added idempotency persistence metadata (`persistent`, `storage`)
- Updated `README.md` and `tools/piper/README.md` to reflect Web-only operation.
- Updated governance config paths:
  - `scripts/config/agent_governance_contracts.json`
  - `scripts/lib/agent_governance_policy.js`

Over-delivery:
- Introduced mistake abstraction buckets from terminal outcomes:
  - `guard.parent_dispatch`
  - `contract.idempotency_conflict`
  - `runtime.client_disconnect`
  - `runtime.timeout`
  - `runtime.interrupted`
  - `runtime.unknown_failure`
- Each pattern tracks count, first/last seen, samples, and preventive hint.

Verification evidence:
1. Syntax:
   - `node --check server.js` -> PASS
   - `node --check scripts/app_server_smoke_test.js` -> PASS
   - `node --check scripts/agent_governance_policy_test.js` -> PASS
2. Policy/unit checks:
   - `node scripts/agent_governance_policy_test.js` -> PASS
   - `node scripts/skill_portfolio_policy_test.js` -> PASS
3. Required server smoke:
   - `node scripts/app_server_smoke_test.js` -> PASS
   - includes `GET /api/runtime` check and `/api/batch/*` path checks
4. UI harness check:
   - `node scripts/harness_check_mode_test.js` -> PASS

Residual risk:
- Docs HTML mirrors (`docs/SYSTEM_ARCHITECTURE.html`, `docs/APP_SERVER_HARNESS_MEMO.html`) still include historical CLI/legacy-route references and should be regenerated if strict doc parity is required.

## 82. Evaluation + Replay + SLO + Contract Spec (2026-03-05)

### Intent
- Raise harness maturity from execution-only toward reproducible/comparable/operable contracts.

### Implemented
- Standardized evaluation harness APIs:
  - `GET /api/eval/suites`
  - `GET /api/eval/history`
  - `POST /api/eval/run`
- Fixed suite source of truth:
  - `scripts/config/eval_suite_default.json`
  - case set + scoring rules + output schema are stable.
- Replay execution foundation:
  - `GET /api/replay/turns`
  - `GET /api/replay/turn/:turnId`
  - `POST /api/replay/turn`
  - replay-capable request contract is persisted in `harness_execution_memory.json` as `replayMemory`.
- SLO monitoring:
  - `GET /api/slo/status`
  - runtime now publishes SLO metrics and alert state (`failureRate`, `p95LatencyMs`, `idempotencyConflictRate`).
- Turn contract formalization:
  - machine-readable spec: `scripts/config/harness_contract_spec.json`
  - validator module: `scripts/lib/harness_contract_policy.js`
  - runtime enforcement: terminal transition/event checks log `contract.turn_*_violation` on mismatch.
- Repro profile hardening:
  - `executionProfile=repro` enforces `webSearch=0`, `forceNewSession=1`, `requestUserInputPolicy=blocked`.
  - turn visibility/artifacts include execution recipe hash for rerun comparability.

### Tests
- `node scripts/app_server_smoke_test.js` -> PASS
- `node scripts/agent_governance_policy_test.js` -> PASS
- `node scripts/skill_portfolio_policy_test.js` -> PASS
- `node scripts/skill_portfolio_audit.js` -> PASS
- `node scripts/turn_artifact_security_test.js` -> PASS
- `node scripts/eval_replay_api_smoke_test.js` -> PASS
- `node scripts/eval_harness_policy_test.js` -> PASS
- `node scripts/harness_contract_policy_test.js` -> PASS

## 83. Exec Model Compatibility Repair (2026-03-06)

### Intent
- Stop the harness from forcing the unsupported `codex-5.3` slug during ChatGPT-account sessions.
- Keep model selection aligned with Codex config defaults while preserving local-first behavior on port `57525`.

### Implemented
- Server-side default model resolution now follows this order:
  - `CODEX_DEFAULT_EXEC_MODEL`
  - project `.codex/config.toml` top-level `model`
  - user `~/.codex/config.toml` top-level `model`
  - fallback `gpt-5.4`
- Added legacy model alias normalization so `codex-5.3` is translated to `gpt-5.3-codex` before request dispatch.
- Updated harness UI defaults from `codex-5.3` to `gpt-5.4`.
- Added UI-side localStorage migration and runtime-default sync so previously stored `codex-5.3` values are normalized instead of being resent forever.

### Verification Evidence
- `node --check server.js` -> PASS
- `node --check web/01.HarnesUI/app.js` -> PASS
- `node scripts/app_server_smoke_test.js` -> PASS
- Temporary runtime probe on an isolated verification port reported `execApi.defaultModel = gpt-5.4`

### Residual Risk
- The already running legacy process on port `57525` must be restarted before this repair is visible at `http://127.0.0.1:57525/01.HarnesUI/index.html`.

## 84. Exec Default Flexibility (2026-03-06)

### Intent
- Keep the harness defaults at `gpt-5.4` and `xhigh`.
- Stop forcing that pair for every run so operators can override model and reasoning effort from the web UI.

### Implemented
- Server-side execution settings now carry both `model` and `modelReasoningEffort` through:
  - `/api/exec`
  - thread reuse/reset decisions
  - replay payloads
  - eval variants
  - execution recipe snapshots
  - idempotency metadata
- Runtime metadata now publishes:
  - `execApi.defaultModel`
  - `execApi.modelReasoningEffort`
  - `execApi.supportedModelReasoningEfforts`
- The web harness settings panel now exposes a `Reasoning` selector with:
  - `minimal`
  - `low`
  - `medium`
  - `high`
  - `xhigh`
- UI settings persistence now stores both `modelName` and `modelReasoningEffort`, while still defaulting to runtime-provided values when no explicit user choice exists.

### Verification Evidence
- `node --check server.js` -> PASS
- `node --check web/01.HarnesUI/app.js` -> PASS
- `node scripts/app_server_smoke_test.js` -> PASS
  - includes local harness startup and `GET /api/runtime`

### Residual Risk
- The isolated temporary runtime probe path hit local `spawn EPERM`, so explicit one-shot capture of the runtime JSON on a temporary port was not added to verification evidence in this session.

## 85. Model Selector Dropdown UX Sync (2026-03-06)

### Intent
- Make `Model` selection behavior match `Reasoning` in the harness settings UI.
- Remove free-text model entry from the primary control and use a dropdown selector.

### Implemented
- Updated `web/01.HarnesUI/index.html`:
  - Replaced `#modelName` from `<input type="text">` to `<select>`.
  - Added preset options:
    - `gpt-5.4`
    - `gpt-5.3-codex`
- Updated `web/01.HarnesUI/app.js`:
  - Added model-option hydration helpers so runtime default/stored model values are auto-added if missing from presets.
  - Updated settings/runtime sync paths to set `#modelName` via dropdown-safe option handling.
  - Kept model persistence (`modelName`) behavior unchanged.

### Verification Evidence
- `node --check web/01.HarnesUI/app.js` -> PASS
- Runtime probe after UI changes: `GET /api/runtime` -> HTTP 200
- Playwright UI check (headless):
  - `#modelName` is rendered as `select`
  - selecting a different model updates value
  - selected value persists after `loadRuntime()`

### Residual Risk
- Dropdown presets are intentionally minimal; if additional model IDs are needed frequently, they should be added as explicit preset options.

## 86. AGENTS Policy Layering Refactor (2026-03-06)

### Intent
- Reduce policy ambiguity by separating top-level constitution rules from detailed operational rules.
- Make it clear whether failures come from runtime behavior or policy design.
- Clarify approval boundaries and over-delivery limits.

### Implemented
- Rebuilt `AGENTS.md` as a tier-0 constitution only:
  - identity/success definition
  - core generic layer vs repository overlay
  - completion definition
  - explicit `needs_input` boundary categories
  - bounded over-delivery contract
  - reference map to detailed policy documents
- Added `docs/AGENT_OPERATING_RULES.md` for tier-1 operational policy:
  - 5-step flow details
  - role/tool routing
  - skill assignment/routing
  - explicit skill invocation rules
  - QA gate and doc-sync gate details
- Added `docs/APP_SERVER_PROTOCOL_RUNBOOK.md`:
  - handshake order
  - JSONL/JSON-RPC framing expectations
  - terminal `turn/completed` contract
  - verification checklist and evidence expectations
- Updated `docs/AGENT_SKILL_MATRIX.md`:
  - added skill-ID consistency section for the experimental skill package

### Verification Evidence
- File references in `AGENTS.md` resolve to existing documents:
  - `docs/AGENT_OPERATING_RULES.md`
  - `docs/APP_SERVER_PROTOCOL_RUNBOOK.md`
  - `docs/SKILL_PORTFOLIO_GOVERNANCE.md`
  - `docs/AGENT_SKILL_MATRIX.md`
- Markdown docs updated with explicit sectioned policy boundaries.

### Residual Risk
- At this point the experimental skill still used its pre-migration ID; later rename work is tracked separately.

## 87. Governance Doc and Catalog Sync (2026-03-06)

### Intent
- Remove governance drift after the AGENTS tier split without expanding scope beyond in-repo doc/config alignment.
- Keep `AGENTS.md` as tier-0 only and treat catalog/policy JSON as canonical for skill IDs and assignments.

### Implemented
- Updated `docs/AGENT_OPERATING_RULES.md`:
  - added an explicit tier-1 boundary note pointing back to `AGENTS.md`
  - clarified that `scripts/config/skill_catalog.json` wins on assignment or skill-ID conflicts
  - synchronized `worker` skill assignment to include `blender-pro-character-pipeline`
- Updated `docs/AGENT_SKILL_MATRIX.md`:
  - marked the document as a human-facing summary rather than a second source of truth
  - synchronized the `worker` assignment and class mix to the catalog
  - added the `blender-pro-character-pipeline` metadata row
  - refreshed the audit baseline to exposure total `44` with current class shares
- Updated `docs/SKILL_PORTFOLIO_GOVERNANCE.md`:
  - clarified that human docs must mirror policy/catalog state
  - required same-change-set doc sync when assignments or package names change
- Updated `docs/APP_SERVER_PROTOCOL_RUNBOOK.md`:
  - clarified its boundary as a protocol/runbook document under `AGENTS.md`

### Verification Evidence
- Manual document-boundary review -> PASS
  - `AGENTS.md` remains tier-0 only (`Document Boundary`, `Core Constitution`, `Reference Map`)
  - `docs/AGENT_OPERATING_RULES.md` declares itself tier-1 and defers assignment conflicts to `scripts/config/skill_catalog.json`
  - `docs/APP_SERVER_PROTOCOL_RUNBOOK.md` declares itself a protocol runbook under `AGENTS.md`, not a competing governance source
  - `docs/AGENT_SKILL_MATRIX.md` declares itself a human-facing summary, not an alternate source of truth
- `node scripts/skill_portfolio_audit.js` -> PASS
  - exposure total `44`
  - `worker` assigned `6/5` -> PASS
  - no issues, no warnings

### Residual Risk
- At this point the experimental skill ID still had not been migrated; later sections supersede this state.

## 88. Skill Creator Master ID Migration (2026-03-06)

### Intent
- Retire the typo-bearing experimental skill ID and replace it with a canonical catalog/package name.
- Keep skill invocation, package metadata, and governance docs aligned in one change set.

### Implemented
- Renamed the experimental skill package directory:
  - `skills/skill-creater-maseter/` -> `skills/skill-creator-master/`
- Updated the skill package metadata:
  - `skills/skill-creator-master/SKILL.md`
  - `skills/skill-creator-master/agents/openai.yaml`
- Updated the canonical skill catalog:
  - default parent assignment now uses `skill-creator-master`
  - experiment skill key renamed from `skill-creater-maseter` to `skill-creator-master`
- Refreshed catalog metadata:
  - `version` -> `2026-03-06.r1`
  - `updatedAt` -> `2026-03-06`
- Updated human-facing governance docs:
  - `docs/AGENT_OPERATING_RULES.md`
  - `docs/AGENT_SKILL_MATRIX.md`
- Preserved historical chronology in earlier sections while annotating them with the current renamed package path.

### Verification Evidence
- Manual migration review -> PASS
  - package directory exists at `skills/skill-creator-master/`
  - `SKILL.md` frontmatter `name` matches folder name
  - `agents/openai.yaml` `default_prompt` references `$skill-creator-master`
  - `scripts/config/skill_catalog.json` metadata updated to `version=2026-03-06.r1`, `updatedAt=2026-03-06`
- `node scripts/skill_portfolio_audit.js` -> PASS
  - exposure total `44`
  - `default` assigned `8/4` -> PASS
  - no issues, no warnings

### Residual Risk
- Historical notes may still mention `skill-creater-maseter` when describing pre-migration state, but current policy/config/package references now use `skill-creator-master`.

## 89. Status Taxonomy + Context/Evidence Policy Sync (2026-03-07)

### Intent
- Tighten the tier-0 constitution by giving it explicit non-complete status vocabulary.
- Add dedicated detailed-policy documents for context/memory handling and evidence requirements instead of letting those rules stay implicit.

### Implemented
- Updated `AGENTS.md`:
  - added `4.1) Task Status Taxonomy`
  - extended `Reference Map` with:
    - `docs/CONTEXT_MEMORY_POLICY.md`
    - `docs/EVIDENCE_CONTRACT.md`
- Added `docs/CONTEXT_MEMORY_POLICY.md`:
  - context tiers
  - promotion rules
  - parent/child context boundaries
  - artifact-first and privacy rules
- Added `docs/EVIDENCE_CONTRACT.md`:
  - evidence classes
  - minimum evidence by change type
  - reporting contract
  - failure semantics

### Verification Evidence
- Manual policy-boundary review -> PASS
  - `AGENTS.md` remains tier-0 and only adds status vocabulary plus reference targets
  - detailed context/memory policy now lives outside `AGENTS.md`
  - detailed evidence policy now lives outside `AGENTS.md`
- File reference resolution -> PASS
  - `docs/CONTEXT_MEMORY_POLICY.md`
  - `docs/EVIDENCE_CONTRACT.md`

### Residual Risk
- Context/memory policy is documentation-only at this point; no machine-readable enforcement layer exists yet for context promotion or child-context injection discipline.

## 90. AGENTS Japanese Localization Sync (2026-03-07)

### Intent
- Make `AGENTS.md` readable in Japanese without changing the policy structure or rule meaning.
- Preserve the tier-0 constitution role while keeping file paths, status IDs, and code references stable.

### Implemented
- Translated `AGENTS.md` into Japanese.
- Kept the existing section numbering and policy structure:
  - document boundary
  - identity/success
  - generic constitution
  - repository overlay
  - completion definition
  - task status taxonomy
  - approval boundary
  - over-delivery boundary
  - reference map
  - safety default
- Preserved literal identifiers and references where stability matters:
  - status IDs such as `COMPLETED`, `BLOCKED`, `NEEDS_INPUT`, `FAILED_VALIDATION`, `PARTIAL`
  - path/code references such as `POST /api/exec`, `danger-full-access`, and `docs/*`

### Verification Evidence
- Manual meaning-preservation review -> PASS
  - section structure unchanged
  - policy boundaries unchanged
  - reference map still resolves to the same detailed documents
- Manual reference check -> PASS
  - `docs/AGENT_OPERATING_RULES.md`
  - `docs/APP_SERVER_PROTOCOL_RUNBOOK.md`
  - `docs/SKILL_PORTFOLIO_GOVERNANCE.md`
  - `docs/CONTEXT_MEMORY_POLICY.md`
  - `docs/EVIDENCE_CONTRACT.md`
  - `docs/AGENT_SKILL_MATRIX.md`

### Residual Risk
- The detailed policy documents remain mostly English, so `AGENTS.md` is now Japanese-first while the lower-tier docs are still mixed-language.

## 91. Docs Folder Core-Only Cleanup (2026-03-07)

### Intent
- Reduce operator confusion in `docs/` by keeping only the documents that still participate in the current AGENTS/governance/spec workflow.
- Remove clearly non-core and legacy mirror documents from the active docs set.

### Implemented
- Deleted non-core docs from `docs/`:
  - `docs/APP_SERVER_HARNESS_MEMO.html`
  - `docs/SYSTEM_ARCHITECTURE.html`
  - `docs/TEST_WEBSITE_SPEC.md`
  - `docs/VOICE_IMPLEMENTATION_OPTIONS.html`
- Kept the current core docs set:
  - AGENTS/governance policy docs
  - runbook docs
  - architecture sync ledger

### Verification Evidence
- Manual reference review -> PASS
  - no active `AGENTS.md` reference points to the deleted files
  - no current governance/reference-map document depends on the deleted files
- Manual docs inventory review -> PASS
  - `docs/` now contains the current AGENTS/governance/spec documents only

### Residual Risk
- `docs/SYSTEM_ARCHITECTURE.md` still contains historical mentions of deleted files where they existed at the time; those references are retained as history, not as active dependencies.

## 92. AGENTS Reference Map Contract Source Sync (2026-03-07)

### Intent
- Remove the remaining asymmetry in `AGENTS.md` reference mapping.
- Expose the machine-readable governance and turn-contract sources alongside the already-listed skill governance sources.

### Implemented
- Updated `AGENTS.md` reference map:
  - added `scripts/config/agent_governance_contracts.json`
  - added `scripts/config/harness_contract_spec.json`
- Kept the existing tier split unchanged:
  - `AGENTS.md` still points to detailed policy and contract sources
  - the new entries are references only, not new policy text inside `AGENTS.md`

### Verification Evidence
- Manual reference-map review -> PASS
  - machine-readable skill governance sources remain listed
  - machine-readable agent governance source is now listed
  - machine-readable turn contract source is now listed
- File existence check -> PASS
  - `scripts/config/agent_governance_contracts.json`
  - `scripts/config/harness_contract_spec.json`

### Residual Risk
- `eval_suite_default.json` remains intentionally outside the AGENTS reference map because it is an evaluation fixture/config, not a core governance contract source.

## 93. AGENTS Reference Map Classification Sync (2026-03-07)

### Intent
- Make the `AGENTS.md` reference map easier to scan by grouping references by contract type instead of only by topic.
- Expose `eval_suite_default.json` explicitly as evaluation config without promoting it to core governance contract status.

### Implemented
- Reorganized `AGENTS.md` reference map into:
  - tier-1 operating policies
  - protocol/runtime runbook
  - machine-readable governance contracts
  - machine-readable runtime contract
  - evaluation config
- Added `scripts/config/eval_suite_default.json` under:
  - `Evaluation config (supplemental, non-governance)`

### Verification Evidence
- Manual reference-map classification review -> PASS
  - governance contracts are separated from runtime contract
  - evaluation config is now visible but clearly labeled non-governance
  - existing detailed policy docs remain referenced
- File existence check -> PASS
  - `scripts/config/eval_suite_default.json`

### Residual Risk
- `AGENTS.md` reference map is now clearer, but the deeper enforcement gap remains in runtime/context/evidence implementation rather than document classification.

## 94. Worker Legacy Gate + Task Outcome Contract + Architecture Split (2026-03-07)

### Intent
- Remove `worker` as an unbounded runtime escape hatch while preserving a bounded compatibility lane.
- Make task outcome vocabulary machine-readable and visible in runtime, replay, idempotency, and turn artifacts.
- Split current architecture state from the historical ledger so Step 5 sync no longer targets a mixed current/history document.

### Implemented
- Tightened runtime governance:
  - `scripts/config/agent_governance_contracts.json`
    - `worker.enforced = true`
    - `worker.legacyOnly = true`
    - `worker.requiresParentOverride = true`
  - `scripts/lib/agent_governance_policy.js`
    - deny `worker` unless a valid parent override is supplied
  - `.codex/agents/worker.toml`
    - reframed as legacy-only compatibility child
  - `server.js`
    - conversation direct path default agent changed from `worker` to `default`
- Added machine-readable task outcome contract:
  - `scripts/config/task_outcome_contract.json`
  - `scripts/lib/task_outcome_policy.js`
  - `scripts/task_outcome_policy_test.js`
- Wired task outcome through runtime surfaces:
  - `GET /api/runtime` now exposes `taskOutcomeContract`
  - terminal turn events now include `taskOutcomeStatus` and `taskOutcomeReason`
  - latest turn snapshots, replay memory, idempotency snapshots, and turn artifact manifests now carry task outcome fields
  - eval case summaries now include task outcome metadata when available
- Split architecture docs:
  - current spec moved to `docs/CURRENT_ARCHITECTURE.md`
  - historical ledger retained in `docs/ARCHITECTURE_CHANGELOG.md`
  - `docs/SYSTEM_ARCHITECTURE.md` replaced with compatibility stub
- Synced lower-tier references:
  - `AGENTS.md`
  - `docs/AGENT_OPERATING_RULES.md`
  - `docs/APP_SERVER_PROTOCOL_RUNBOOK.md`
  - `docs/CONTEXT_MEMORY_POLICY.md`
  - `docs/EVIDENCE_CONTRACT.md`
  - `.codex/agents/default.toml`
  - `skills/spec-sync-assistant/*`
  - `skills/release-evidence-gate/*`
  - `skills/turn-log-auditor/references/audit-matrix.md`

### Verification Evidence
1. `node scripts/task_outcome_policy_test.js` -> PASS
2. `node scripts/agent_governance_policy_test.js` -> PASS
3. `node scripts/eval_harness_policy_test.js` -> PASS
4. `node scripts/app_server_smoke_test.js` -> PASS
5. `node scripts/eval_replay_api_smoke_test.js` -> PASS

### Residual Risk
- `worker` still exists as a compatibility lane in config/catalog and should eventually be retired if no bounded legacy cases remain.
- Context/memory promotion remains stronger as policy than as full runtime-enforced schema.
- `docs/ARCHITECTURE_CHANGELOG.md` intentionally preserves older historical content, including prior mixed-language and pre-split references.

## 95. Worker Retirement From Active Routing + Workflow Eval Hardening (2026-03-07)

### Intent
- Remove `worker` from active runtime routing so it can no longer serve as an escape hatch.
- Expand the default eval suite from string-only smoke checks into workflow-policy coverage.
- Strengthen the bridge between turn lifecycle states and task outcome semantics.
- Improve adversarial review so contract mismatch and internal-process leakage are caught earlier.

### Implemented
- Retired `worker` from active routing:
  - removed `worker` from `.codex/config.toml` configured agents
  - removed `worker` assignment from `scripts/config/skill_catalog.json`
  - removed `worker` role requirements from `scripts/config/skill_portfolio_policy.json`
  - updated `docs/AGENT_OPERATING_RULES.md`, `docs/AGENT_SKILL_MATRIX.md`, `docs/CURRENT_ARCHITECTURE.md`, `.codex/agents/default.toml`, and `skills/parent-dispatch-guard/*`
- Added runtime agent registration enforcement:
  - `server.js`
    - validates requested `agentName` against configured/runtime-known agents
    - rejects retired or unconfigured agents such as `worker` at `POST /api/exec`
- Expanded workflow eval coverage:
  - `scripts/lib/eval_harness_policy.js`
    - added driver-aware eval cases and promptless workflow probes
  - `scripts/config/eval_suite_default.json`
    - promoted suite to workflow-oriented baseline coverage:
      - retired worker rejection
      - requirement RBJ activation
      - parent dispatch guard violation
      - blocked non-interactive user input
      - failed validation and needs-input task outcomes
      - turn/task-outcome bridge validation
      - adversarial exact-contract mismatch
      - adversarial retry on `FAILED_VALIDATION`
- Strengthened turn/task-outcome bridge:
  - `scripts/config/harness_contract_spec.json`
    - added `taskOutcomeBridge.allowedByTurnState`
  - `scripts/lib/harness_contract_policy.js`
    - added bridge validation helper
  - `scripts/lib/task_outcome_policy.js`
    - added turn-state compatibility validation helper
  - `server.js`
    - logs contract violations if terminal turn state and derived task outcome diverge
- Strengthened adversarial review loop:
  - `scripts/lib/adversarial_shadow_policy.js`
    - detects exact-reply mismatch, strict-JSON mismatch, and internal-process leakage
  - `scripts/lib/adversarial_loop_policy.js`
    - retries `FAILED_VALIDATION` outcomes
    - avoids retry on `BLOCKED` and `NEEDS_INPUT`

### Verification Evidence
1. `node scripts/task_outcome_policy_test.js`
2. `node scripts/agent_governance_policy_test.js`
3. `node scripts/harness_contract_policy_test.js`
4. `node scripts/eval_harness_policy_test.js`
5. `node scripts/adversarial_shadow_policy_test.js`
6. `node scripts/adversarial_loop_policy_test.js`
7. `node scripts/adversarial_loop_wiring_test.js`
8. `node scripts/app_server_smoke_test.js`
9. `node scripts/eval_replay_api_smoke_test.js`
10. `node scripts/skill_portfolio_audit.js`

### Residual Risk
- `worker` still exists in the governance contract and historical ledger so older traces remain interpretable.
- Workflow eval is deeper than before, but the default suite is still intentionally small and does not cover every adversarial scenario.
- Context/memory promotion and evidence shaping still have stronger policy than full schema-enforced runtime builders.

## 96. Parent Role Posture and Collaboration-First Doc Sync (2026-03-07)

### Intent
- Close governance/runtime posture gaps for parent roles without changing `server.js` or `scripts/`.
- Make the default-vs-intake-vs-release-manager split explicit so collaboration-first behavior is documented the same way the current runtime is intended to operate.
- Record request-user-input posture in docs where config support is not explicitly documented.

### Implemented
- Tightened parent role registration and descriptions:
  - `.codex/config.toml`
    - `default` now described as the primary parent orchestrator and default entrypoint
    - `intake` now described as Step 1/2-only planning parent
    - `release_manager` now described as Step 4/5-only review parent
- Added explicit parent config posture:
  - `.codex/agents/default.toml`
    - `sandbox_mode = "workspace-write"`
    - `approval_policy = "never"`
    - clarified that `default` is the only general-purpose parent and must surface true user decisions as `NEEDS_INPUT`
  - `.codex/agents/intake.toml`
    - `sandbox_mode = "read-only"`
    - `approval_policy = "never"`
    - clarified Step 1/2-only scope and no self-answering of requirement gaps
  - `.codex/agents/release-manager.toml`
    - `sandbox_mode = "read-only"`
    - `approval_policy = "never"`
    - clarified Step 4/5-only scope and release blocking on unresolved user decisions
- Synced collaboration-first governance docs:
  - `docs/AGENT_OPERATING_RULES.md`
    - added parent runtime posture section
    - documented request-user-input posture as a governance rule rather than a per-agent config key
    - clarified that `intake` and `release_manager` are phase-scoped overlays, not interchangeable parent defaults
  - `docs/CURRENT_ARCHITECTURE.md`
    - updated active architecture to reflect `default` as default exec agent, explicit parent posture, and collaboration-first routing

### Verification Evidence
1. Verified against the Codex config reference that `approval_policy` and `sandbox_mode` are supported `config.toml` keys and that per-role config layers are declared via `agents.<name>.config_file`.
2. Confirmed current runtime alignment by reading `server.js`:
   - default exec agent fallback is `default`
   - non-interactive request-user-input fallback remains `auto-default`
3. Re-read the edited `.codex/` and `docs/` files to confirm posture/role-boundary wording is consistent across config and architecture docs.

### Residual Risk
- Request-user-input posture still depends on runtime request metadata plus governance rules; this pass intentionally did not add undocumented per-agent config keys.
- Parent documentation is now stricter than some older historical logs, so legacy traces may still show pre-sync overlap between `default`, `intake`, and direct parent execution.

## 97. Worker Retirement Doc Tightening + Idempotency Lifecycle Sync (2026-03-07)

### Intent
- Align the remaining worker-facing governance text with the actual runtime posture.
- Document the active `POST /api/exec` idempotency guarantees without widening scope beyond architecture/doc sync.

### Implemented
- Updated `.codex/agents/worker.toml`:
  - marked `worker` as a retired, legacy-only compatibility child
  - clarified that it is not a configured runtime target and must decline normal dispatch
- Updated `docs/CURRENT_ARCHITECTURE.md`:
  - clarified that retired `worker` aliases such as `worker@chat-legacy` are rejected by `POST /api/exec`
  - documented idempotency request mismatch behavior:
    - header/body key mismatch -> `400` before claim creation
    - same idempotency key + mismatched effective request hash -> `409` (`idempotency_request_hash_mismatch`)
    - duplicate in-flight key -> `409`
    - duplicate resolved key -> stored outcome snapshot with `200`
  - documented `GET /api/exec/idempotency/:key` lifecycle visibility, including `released`

### Verification Evidence
1. Read `.codex/config.toml` to confirm `worker` is no longer a configured runtime agent.
2. Read `server.js` to confirm:
   - `validateRequestedAgentName()` rejects unconfigured agent names and scoped aliases whose base role is unconfigured
   - `extractExecIdempotencyKey()` throws on header/body mismatch
   - duplicate idempotency claims with a mismatched effective request hash return `409` with code `idempotency_request_hash_mismatch`
   - `POST /api/exec` returns `409` for active duplicate claims and `200` with stored outcome for resolved duplicates
   - `GET /api/exec/idempotency/:key` returns lifecycle snapshots and exposes `released` when a claim closes before terminal outcome

### Residual Risk
- The legacy `worker` contract still exists in machine-readable governance for audit interpretation, so operators may still encounter it in historical traces even though runtime dispatch rejects it.
- Idempotency persistence remains TTL-based memory plus persisted snapshots; this entry documents the current behavior but does not change retention semantics.

## 98. Launcher Safer Defaults + Missing Skill Package Implementation (2026-03-07)

### Intent
- Align the Windows launcher with the current safer operator posture without overriding explicit shell/env choices.
- Implement the remaining missing skill proposals for infra and API-contract coverage.
- Sync skill governance and architecture docs to remove stale "missing proposal" state.

### Implemented
- Updated `start_codex_ui.bat`:
  - launcher defaults now apply only when the corresponding env var is unset
  - default posture changed to:
    - `CODEX_DEFAULT_EXEC_AGENT=default`
    - `CODEX_EXECUTION_PROFILE=full-runtime`
    - `CODEX_REQUEST_USER_INPUT_POLICY=blocked`
    - `CODEX_PARENT_DISPATCH_GUARD_MODE=enforce`
    - `CODEX_PARENT_DISPATCH_GUARD_MAX_RETRIES=1`
    - `CODEX_ADVERSARIAL_SHADOW_ENABLED=1`
    - `CODEX_ADVERSARIAL_LOOP_ENABLED=1`
    - `CODEX_ADVERSARIAL_LOOP_MAX_RETRIES=1`
    - `CODEX_REQUIREMENT_GUARD_ENABLED=1`
    - `CODEX_REQUIREMENT_RBJ_ENABLED=1`
    - `CODEX_REQUIREMENT_RBJ_MAX_QUESTIONS=3`
    - `CODEX_REQUIREMENT_RBJ_MAX_REVISIONS=2`
- Added missing skill packages:
  - `skills/windows-runtime-ops/`
    - Windows launcher/process/port/path/permission diagnostics and bounded recovery workflow
  - `skills/api-contract-testgen/`
    - route-contract inventory and focused contract-test generation workflow
- Updated skill governance:
  - `scripts/config/skill_catalog.json`
    - assigned `windows-runtime-ops` to `infra_worker`
    - assigned `api-contract-testgen` to `backend_worker` and `tester`
    - added metadata for both skills
    - cleared active `missingProposals`
  - `docs/AGENT_SKILL_MATRIX.md`
    - role/class mix, metadata table, and implemented-proposal status updated
  - `docs/AGENT_OPERATING_RULES.md`
    - skill assignment policy synced to the catalog
- Updated active architecture doc:
  - `docs/CURRENT_ARCHITECTURE.md`
    - documents the launcher safer-default posture and its request-user-input tradeoff
- No backend isolated proof-artifact capability landed in this infra-owned pass, so architecture state for proof artifacts is unchanged.

### Verification Evidence
1. `node scripts/skill_portfolio_audit.js` -> PASS
2. `node --check scripts/skill_portfolio_audit.js` -> PASS
3. PowerShell launcher default assertion on `start_codex_ui.bat` -> PASS
   - confirmed unset-only safer defaults for `CODEX_REQUEST_USER_INPUT_POLICY=blocked`, `CODEX_PARENT_DISPATCH_GUARD_MODE=enforce`, `CODEX_PARENT_DISPATCH_GUARD_MAX_RETRIES=1`, `CODEX_EXECUTION_PROFILE=full-runtime`, `CODEX_ADVERSARIAL_SHADOW_ENABLED=1`, and `CODEX_REQUIREMENT_GUARD_ENABLED=1`

### Residual Risk
- `CODEX_REQUEST_USER_INPUT_POLICY=blocked` is safer for unattended UI launches, but operators who intentionally want `auto-default` or `auto-empty` must override it explicitly.
- Launcher verification in this pass stayed light and config-focused; it did not re-run the full app-server smoke suite because no `server.js` or `scripts/` runtime logic changed.

## 99. Proof Artifact Capability + Server-Level Blocked User-Input Default Doc Sync (2026-03-07)

### Intent
- Sync architecture docs to the now-landed backend proof capability without widening scope beyond documentation.
- Record that the server-level inferred non-interactive `request-user-input` default is now `blocked`.
- Document the isolated proof bundle paths and opt-in eval-probe persistence path.

### Implemented
- Updated `docs/CURRENT_ARCHITECTURE.md`:
  - documented that `server.js` now falls back to `CODEX_REQUEST_USER_INPUT_POLICY=blocked` when unset
  - documented isolated persistence env overrides:
    - `CODEX_HARNESS_MEMORY_PATH`
    - `CODEX_EVAL_HISTORY_PATH`
    - `CODEX_TURN_ARTIFACTS_DIR` in the proof bundle recipe
  - documented opt-in `/api/eval/run` probe persistence through `persistProbeResultsToMemory` and legacy alias `persistProbeResults`
  - added `scripts/generate_runtime_proof.js` as the proof generator entrypoint
  - recorded the verified proof bundle shape:
    - `logs/proofs/runtime-proof-*/harness_execution_memory.json`
    - `logs/proofs/runtime-proof-*/eval_runs.jsonl`
    - `logs/proofs/runtime-proof-*/turns/`
    - `logs/proofs/runtime-proof-*/runtime_proof_summary.json`
    - `logs/proofs/runtime-proof-*/live_dispatch_proof.md`
- Changelog-only note:
  - launcher now falls back invalid non-numeric `CODEX_UI_PORT` to `57525` before building `UI_URL`

### Verification Evidence
1. `rg -n "normalizeRequestUserInputPolicy\\(process\\.env\\[requestUserInputPolicyEnvKey\\],\"blocked\"\\)|CODEX_HARNESS_MEMORY_PATH|CODEX_EVAL_HISTORY_PATH|CODEX_TURN_ARTIFACTS_DIR|persistProbeResultsToMemory|persistProbeResults" server.js scripts/generate_runtime_proof.js` -> PASS
2. `rg -n "server.js now infers|persistProbeResultsToMemory|CODEX_HARNESS_MEMORY_PATH|CODEX_EVAL_HISTORY_PATH|scripts/generate_runtime_proof.js|runtime-proof-\\*" docs/CURRENT_ARCHITECTURE.md` -> PASS
3. Manual readback of `docs/CURRENT_ARCHITECTURE.md` and this changelog entry -> PASS

### Residual Risk
- This sync documents the isolated proof capability and verified bundle shape, but does not add new retention or cleanup policy beyond the existing artifact controls.

## 100. Signoff Evidence Generator for Final-Safe Isolated Bundles (2026-03-07)

### Intent
- Add a reproducible signoff bundle generator that proves the final-safe runtime posture instead of relying on a manually assembled bundle.
- Capture one full `core-harness-workflow.v4` run plus one natural docs/infra trace inside a bundle-local evidence directory.

### Implemented
- Added `scripts/generate_signoff_evidence.js`:
  - launches an isolated `server.js` instance with signoff-safe env:
    - `CODEX_REQUEST_USER_INPUT_POLICY=blocked`
    - `CODEX_PARENT_DISPATCH_GUARD_MODE=enforce`
    - `CODEX_PARENT_DISPATCH_GUARD_MAX_RETRIES=1`
    - `CODEX_REQUIREMENT_GUARD_ENABLED=1`
    - `CODEX_REQUIREMENT_LOCK_ENABLED=1`
    - `CODEX_REQUIREMENT_RBJ_ENABLED=1`
    - `CODEX_ADVERSARIAL_SHADOW_ENABLED=1`
    - `CODEX_ADVERSARIAL_LOOP_ENABLED=1`
  - redirects bundle-local persistence through:
    - `CODEX_HARNESS_MEMORY_PATH`
    - `CODEX_EVAL_HISTORY_PATH`
    - `CODEX_TURN_ARTIFACTS_DIR`
    - `CODEX_OPERATION_LOG_PATH`
  - writes:
    - `runtime_snapshot.json`
    - `core_harness_workflow_run.json`
    - `natural_task_trace_summary.json`
    - `harness_execution_memory.json`
    - `eval_runs.jsonl`
    - bundle-local `turns/`
    - `signoff_summary.json`
  - runs one natural repo docs/infra maintenance task through `POST /api/exec` and asserts specialist + reviewer dispatch evidence before signoff passes
  - resolves the natural-task proof turn from persisted execution memory on the shared thread so later adversarial retry completions do not replace the implementation-bearing trace
- Updated `docs/CURRENT_ARCHITECTURE.md` to record the new signoff bundle recipe and artifact shape.

### Verification Evidence
1. `node --check scripts/generate_signoff_evidence.js` -> PASS
2. Runtime generation command:
   - `node scripts/generate_signoff_evidence.js`
3. Required script-change smoke coverage:
   - `node scripts/app_server_smoke_test.js`
   - `node scripts/eval_replay_api_smoke_test.js`

### Residual Risk
- The natural task trace still depends on live model behavior; the script reduces ambiguity by asserting dispatch, artifact, and posture signals, but a future model regression can still fail the run and require operator investigation.

## 101. Active-Chat Agent Topography Filtering + Child Dispatch Hints (2026-03-07)

### Intent
- Make the floating Agent Topography Monitor show only the agents that are relevant to the currently selected chat instead of listing unrelated configured roles from other chats.
- Preserve visibility for specialist child agents by surfacing resolved dispatch targets in collab stream-item detail.

### Implemented
- Updated `web/01.HarnesUI/app.js`:
  - narrowed monitor matching to the active chat using:
    - the current chat's scoped parent agent
    - local pending requests for that chat
    - local trace rows for that chat
    - current harness event details for that chat
    - runtime rows whose `threadId`, `sessionRef`, or `activeTurnId` match the active chat
  - suppresses generic parent rows such as plain `default` when a scoped chat variant like `default@chat-...` is present for the active chat
  - keeps runtime fallback behavior intact
- Updated `server.js`:
  - collab-agent item detail now appends `child=<agent>` when a dispatch target can be resolved from the collab payload, allowing the UI to attribute specialist child lanes to the active chat
- Updated `scripts/agent_topography_test.js`:
  - added checks for active-chat-only filtering
  - added checks for scoped-parent suppression
  - added checks for `child=...` collab detail hints

### Verification Evidence
1. `node --check server.js` -> PASS
2. `node --check web/01.HarnesUI/app.js` -> PASS
3. `node scripts/agent_topography_test.js` -> PASS

### Residual Risk
- Child specialist visibility still depends on dispatch metadata being recoverable from collab item payloads; custom prompt-only delegation without a resolved child hint will remain harder to attribute in the monitor.

## 102. Dedicated Harness Overview Page + Aggregated Overview API (2026-03-07)

### Intent
- Make the full harness legible without overloading the execution console.
- Separate "run a task" UI from "understand the whole system" UI.

### Implemented
- Updated `server.js`:
  - added `buildRuntimeApiSnapshot()` so `/api/runtime` and the new overview route share one runtime snapshot source
  - added `GET /api/harness/overview`
  - overview payload now aggregates:
    - runtime posture and control-plane metadata
    - full topography lanes
    - governance, turn-contract, and task-outcome snapshots
    - latest runtime-proof and signoff bundle summaries from `logs/proofs/` and `logs/signoff-bundles/`
    - recent eval history
    - replay and execution-memory summaries
    - skill-portfolio audit output and role assignments
  - overview payload now redacts `controlApi.token` and marks the token as redacted instead of leaking the live control secret into the operator page/raw JSON panel
  - proof/signoff bundle ordering now prefers bundle `generatedAt` over summary-file mtime so "latest" means newest generated evidence
- Updated `web/01.HarnesUI/index.html`:
  - added an `Overview` button in maintenance tools
- Added `web/01.HarnesUI/overview.html`:
  - dedicated operator page with separate sections for Runtime, Topology, Contracts, Evidence, and Memory
  - includes a raw JSON snapshot panel for full-fidelity inspection
- Added `web/01.HarnesUI/overview.css`:
  - dedicated layout and lane styling for the overview page
- Added `web/01.HarnesUI/overview.js`:
  - fetches `/api/harness/overview`
  - auto-refreshes every 20 seconds
  - renders runtime posture, topology lanes, latest bundles, eval/replay summaries, and skill coverage
  - distinguishes `runtime.activeAgent` from the explicitly reported default exec agent so retired or scoped runtime focus is not mislabeled as the canonical parent entrypoint
  - ignores stale failed refreshes and stale successful refreshes once a newer overview request has already won
- Added `scripts/harness_overview_test.js`:
  - static checks for the new page and route
  - integration probe for `GET /api/harness/overview` and served `overview.html`
  - verifies control-token redaction, task-outcome reason-key exposure, generatedAt-based latest-bundle ordering, and full DOM mount-id coverage
  - executes a client-side race check for both stale-failure and stale-success overlap orderings
  - renders the served `/api/harness/overview` payload through the served page assets to catch client/server contract drift
  - proves the active-agent/default-exec distinction with a scoped render smoke over served assets
- Updated `docs/CURRENT_ARCHITECTURE.md` to record the new page and overview route.

### Verification Evidence
1. `node --check server.js` -> PASS
2. `node --check web/01.HarnesUI/overview.js` -> PASS
3. `node --check scripts/harness_overview_test.js` -> PASS
4. `node scripts/harness_overview_test.js` -> PASS
5. `node scripts/app_server_smoke_test.js` -> PASS

### Residual Risk
- The overview page summarizes the latest proof/signoff bundles that exist on disk; it does not decide whether those bundles are semantically sufficient for release, so operator review is still required for final signoff judgments.

## 103. External English Conversation App Static Mount + Launcher/Doc Sync (2026-03-08)

### Intent
- Let `english-conversation-app` live as a sibling repo under `C:\Users\akima\dev\english-conversation-app` without changing the browser URL or same-origin API path.
- Keep the bundled in-repo app as a fallback so the harness still boots when the sibling repo is absent.
- Sync the launcher and docs to the new external-first behavior.

### Implemented
- Updated `server.js`:
  - `/english-conversation-app/*` static requests now resolve in this priority order:
    - `CODEX_ENGLISH_CONVERSATION_APP_ROOT`
    - sibling repo `../english-conversation-app/`
    - bundled fallback `web/english-conversation-app/`
  - kept `/01.HarnesUI/*` on the bundled harness UI root
  - added an internal static-mount test export surface for focused verification
- Added `scripts/external_english_conversation_app_mount_test.js`:
  - verifies env-override mount resolution
  - verifies bundled harness UI resolution is unchanged
  - verifies traversal outside the selected static root is rejected
- Updated `start_english_conversation_app.bat`:
  - auto-sets `CODEX_ENGLISH_CONVERSATION_APP_ROOT` to sibling `..\english-conversation-app` when `index.html` exists there and the env var is unset
  - keeps the existing `/english-conversation-app/index.html` auto-open path
- Added sibling bootstrap helpers:
  - `bootstrap_english_conversation_app_repo.bat`
  - `scripts/bootstrap_english_conversation_app_repo.ps1`
  - copies the bundled app to sibling `..\english-conversation-app` for the initial split, refusing to overwrite a non-empty target unless `-Force` is supplied
- Updated `README.md` and `docs/CURRENT_ARCHITECTURE.md`:
  - documented the external-first static mount behavior, launcher default, sibling bootstrap step, focused verification command, and same-origin rationale

### Verification Evidence
1. `node --check server.js` -> PASS
2. `node --check scripts/external_english_conversation_app_mount_test.js` -> PASS
3. `node scripts/external_english_conversation_app_mount_test.js` -> PASS
4. `node scripts/app_server_smoke_test.js` -> FAIL (`failed to spawn codex app-server: spawn EPERM` in the current sandboxed execution environment)

### Residual Risk
- The sibling-repo path is discovered at request time and launcher start time, so operators still need the external repo contents themselves to stay compatible with the harness APIs.
- Full app-server smoke coverage could not be completed in this environment because subprocess spawn for `codex app-server` is blocked by sandbox policy, even though the focused static mount test passed.

## 104. Root Layout Cleanup and Archive Consolidation (2026-03-08)

### Intent
- Reduce top-level clutter without changing the active harness runtime paths.
- Separate active runtime surfaces from legacy docs, examples, installer drops, and manual render outputs.

### Implemented
- Added `archive/` as the non-runtime holding area for legacy and reference-only material.
- Moved top-level legacy/reference directories:
  - `doc_old/` -> `archive/doc_old/`
  - `TESTFolder/` -> `archive/TESTFolder/`
  - `outputs/` -> `archive/outputs/`
  - `sakura-tag-v2.4.2-build4203-a3e63915b-Win32-Release-Installer/` -> `archive/installers/sakura-tag-v2.4.2-build4203-a3e63915b-Win32-Release-Installer/`
- Updated active docs so archived website-example paths now reference `archive/TESTFolder/...`.
- Updated `README.md` and `docs/CURRENT_ARCHITECTURE.md` to distinguish active root surfaces from archived material.

### Verification Evidence
1. Confirmed active runtime surfaces still remain at the root: `docs/`, `scripts/`, `tools/`, `web/`, `logs/`, `output/`
2. Confirmed archived material now resolves under `archive/`
3. Confirmed `docs/ARCHITECTURE_CHANGELOG.md` references to the website example now point to `archive/TESTFolder/...`

### Residual Risk
- Archived example/doc paths are no longer in their historical top-level locations, so any private notes or external shortcuts that pointed at the old root paths will need manual adjustment.

## 105. Turn-Complete Git Auto-Commit/Autopush for Target Repos (2026-03-08)

### Intent
- Let the harness publish work automatically after successful turns, including when the active `cwd` points at an external sibling app repo.
- Keep the automation bounded to the target repo for the turn instead of assuming the harness repo is always the Git target.
- Avoid scooping unrelated pre-existing edits by refusing to auto-commit on a dirty baseline unless operators explicitly opt in.

### Implemented
- Added `scripts/lib/git_automation.js`:
  - captures Git repo state for an arbitrary turn `cwd`
  - normalizes runtime config from env
  - performs turn-complete `git add -A`, `git commit`, and optional `git push -u <remote> <branch>`
  - skips safely when the turn is not `COMPLETED`, the target is not a Git repo, the repo baseline is already dirty, the repo has no remote, or HEAD is detached
  - ignores harness runtime metadata files (`logs/harness_execution_memory.json`, `logs/eval_runs.jsonl`) when the target repo is this workspace so local memory persistence does not trigger an automated publish by itself
  - ignores harness-managed runtime files (`logs/harness_execution_memory.json`, `logs/eval_runs.jsonl`) when the target repo is this harness repo so those files do not poison the next baseline
- Updated `server.js`:
  - captures a Git baseline snapshot at turn start for the active `cwd`
  - runs Git automation after the turn is finalized and `taskOutcomeStatus` is known, but before artifact finalization and memory persistence
  - records summarized Git automation state into the latest turn snapshot and `GET /api/runtime`
  - emits `turn.git_automation` into turn artifacts and operation logs
- Updated `start_codex_ui.bat`:
  - enables Git automation defaults when unset:
    - `CODEX_GIT_AUTOCOMMIT_ENABLED=1`
    - `CODEX_GIT_AUTOPUSH_ENABLED=1`
    - `CODEX_GIT_ALLOW_DIRTY_BASELINE=0`
    - `CODEX_GIT_REMOTE=origin`
- Added `scripts/git_automation_policy_test.js`:
  - validates env normalization
  - validates successful auto-commit + autopush against a temporary local repo and local bare remote
  - validates dirty-baseline skip behavior
  - validates no-change skip behavior
  - validates ignored runtime metadata paths do not trigger automation
- Updated `README.md` and `docs/CURRENT_ARCHITECTURE.md` to document launcher defaults, runtime exposure, skip conditions, and focused verification.

### Verification Evidence
1. `node --check server.js` -> PASS
2. `node --check scripts/lib/git_automation.js` -> PASS
3. `node --check scripts/git_automation_policy_test.js` -> PASS
4. `node scripts/git_automation_policy_test.js` -> PASS
5. `node scripts/app_server_smoke_test.js` -> PASS

### Residual Risk
- Auto-push is now enabled by launcher default, so a clean repo with a configured remote will publish immediately after a successful turn unless the env vars are overridden.
- Dirty-baseline protection avoids sweeping unrelated local edits into an automated commit, but it also means operators must clean or explicitly allow dirty baselines before automation will publish a turn in that repo.

## 106. README Japanese Rewrite + Server-Level Git Autopublish Default (2026-03-08)

### Intent
- Make the top-level README usable for the primary Japanese-speaking operator workflow.
- Ensure Git automation is a harness default, not only a launcher default, so direct `node server.js` runs also publish through `push`.

### Implemented
- Rewrote `README.md` in Japanese while preserving the active runtime guidance:
  - quick start
  - English Conversation App split/mount behavior
  - smoke tests
  - runtime API summary
  - Piper / Kokoro setup
  - Git automation defaults and skip rules
- Updated `scripts/lib/git_automation.js`:
  - `buildGitAutomationConfig()` now defaults `CODEX_GIT_AUTOCOMMIT_ENABLED=1`
  - `buildGitAutomationConfig()` now defaults `CODEX_GIT_AUTOPUSH_ENABLED=1`
  - env overrides can still disable either behavior explicitly
- Updated `scripts/git_automation_policy_test.js`:
  - now verifies the no-env default is `autocommit=on` and `autopush=on`
- Updated `docs/CURRENT_ARCHITECTURE.md`:
  - documents that `server.js` itself defaults Git automation to `commit + push`

### Verification Evidence
1. `node --check scripts/lib/git_automation.js` -> PASS
2. `node --check scripts/git_automation_policy_test.js` -> PASS
3. `node scripts/git_automation_policy_test.js` -> PASS

### Residual Risk
- Because server-level defaults now enable autopush, running the harness against a clean repo with a configured remote will publish on successful turns even when the launcher is bypassed, unless env overrides disable it.

## 107. Ignore Root Runtime Memory Files from Git (2026-03-08)

### Intent
- Stop commit noise from root runtime state files that change on nearly every harness run.
- Keep `harness_execution_memory.json` and `eval_runs.jsonl` available locally without treating them as source artifacts.

### Implemented
- Updated `.gitignore`:
  - added `logs/harness_execution_memory.json`
  - added `logs/eval_runs.jsonl`
- Root-level runtime state files are now intended to live only in the local working tree.
- Updated `README.md` and `docs/CURRENT_ARCHITECTURE.md` to document that these files are local runtime state and intentionally excluded from Git tracking.

### Verification Evidence
1. `git rm --cached logs/harness_execution_memory.json logs/eval_runs.jsonl` removes the files from the index while keeping local copies on disk
2. `git status --short` no longer reports the root runtime files after the index update
3. `git check-ignore -v logs/harness_execution_memory.json logs/eval_runs.jsonl` confirms the root ignore rules

### Residual Risk
- Historical commits and proof/signoff bundles still contain snapshots of these files where they were previously committed; this change only stops future root-level tracking noise.

## 108. Launcher Self-Elevation to Administrator (2026-03-08)

### Intent
- Ensure the primary Windows launcher always starts the harness with Administrator privileges.
- Remove manual operator steps around right-click `Run as administrator`.

### Implemented
- Updated `start_codex_ui.bat`:
  - checks whether the current process is already running as Administrator
  - when not elevated, relaunches itself with `Start-Process -Verb RunAs`
  - exits early in the non-elevated parent after spawning the elevated child
  - reports an error and aborts when UAC elevation is cancelled or fails
- Updated `README.md` and `docs/CURRENT_ARCHITECTURE.md` to document the always-elevated launcher behavior.

### Verification Evidence
1. Static launcher check confirms Administrator-role probe is present in `start_codex_ui.bat`
2. Static launcher check confirms `Start-Process ... -Verb RunAs` relaunch path is present in `start_codex_ui.bat`

### Residual Risk
- This changes launcher UX: every direct `start_codex_ui.bat` run now triggers a UAC prompt when started from a non-elevated shell.

## 109. Harness UI Stale Running Recovery (2026-03-08)

### Intent
- Stop `web/01.HarnesUI` from staying in `Running` after the backend has already completed the turn.
- Let the operator page recover automatically instead of requiring a manual refresh or reconnect.

### Implemented
- Updated `web/01.HarnesUI/app.js`:
  - added runtime-side stale-pending reconciliation keyed by the latest terminal turn snapshot
  - updates the chat harness status/thread/turn when a stale local pending row is recovered
  - starts a lightweight `/api/runtime` polling loop only while local requests are active
  - stops that polling loop automatically when no local requests remain or the page unloads
- Updated `docs/CURRENT_ARCHITECTURE.md`:
  - documents the active-request runtime polling and stale-pending self-heal behavior for `/01.HarnesUI/*`

### Verification Evidence
1. `node --check web/01.HarnesUI/app.js` -> PASS
2. Targeted VM-backed harness script evaluating `web/01.HarnesUI/app.js` reconciliation logic -> PASS
   - stale local request cleared: `1`
   - `s.req.size` after reconcile: `0`
   - chat harness status after reconcile: `completed`
   - reconciled turn id propagated: `turn-1`

### Residual Risk
- Real browser automation could not be executed in this environment because Playwright Chromium launch returned `spawn EPERM`, so verification here is limited to syntax plus targeted runtime-logic execution rather than a full headed browser pass.

## 110. Main Harness Execution Plan Visibility (2026-03-08)

### Intent
- Let the operator see the latest emitted plan directly in the main harness console instead of inferring progress from trace highlights.
- Make the currently executing plan step explicit while a turn is running.

### Implemented
- Updated `web/01.HarnesUI/index.html`:
  - added an `Execution Plan` panel inside `Harness Status`
  - placed it below the current stage/work/verdict cards and above the highlights list
  - added mounts for:
    - plan summary text
    - current plan step card
    - per-step ordered plan list
- Updated `web/01.HarnesUI/app.js`:
  - added plan-step status normalization for:
    - `pending`
    - `in_progress`
    - `completed`
    - `failed`
    - `interrupted`
  - added plan-focus selection logic that prefers:
    - explicit `in_progress`
    - blocked step
    - next pending step while running
    - last completed step
  - renders plan summary, current-step card, completion count, and step list into the new panel during `renderHarness()`
- Updated `web/01.HarnesUI/styles.css`:
  - added panel, current-step card, step-list, and status-badge styling
  - added responsive handling for the plan grid
- Updated `scripts/harness_check_mode_test.js`:
  - added browser assertions for:
    - plan summary text
    - current plan step card
    - per-step localized status labels
    - in-progress focus styling
- Updated `docs/CURRENT_ARCHITECTURE.md`:
  - documented the new `Execution Plan` panel behavior in the active execution-console architecture

### Verification Evidence
1. `node --check web/01.HarnesUI/app.js` -> PASS
2. `node --check scripts/harness_check_mode_test.js` -> PASS
3. `node scripts/harness_check_mode_test.js` -> PASS
4. `GET http://127.0.0.1:57525/01.HarnesUI/index.html` -> `200`
5. Live HTML probe confirms `Execution Plan` and `harnessPlanCurrentCard` are present on the served page

### Residual Risk
- If a turn never emits a `plan` event, the new panel cannot show a real step list and will remain in its empty-state messaging.

## 2026-03-08 - Planning Mode Selector + Step 4 Observability

### Summary
- Added task-dependent Step 1/2 planning modes: `FAST`, `NORMAL`, `DISCOVERY`.
- Added machine-readable Step 1/2 contract surfaces:
  - `scripts/config/planning_mode_contract.json`
  - `scripts/config/requirement_contract.schema.json`
  - `scripts/config/dispatch_plan.schema.json`
- Extended turn artifacts with:
  - `requirement_contract.json`
  - `dispatch_plan.json`
  - `evidence_manifest.json`
  - `stage_timeline.json`
  - `flow_trace_summary.json`
- Preserved task outcome semantics and kept the task outcome contract separate from the turn contract.

### Runtime / Policy Changes
- Updated `scripts/extensions/requirement_guard_hook.js` to select planning mode before execution and to keep `DISCOVERY` tasks proposal-only until ambiguity is resolved.
- Updated `server.js` so turn runtime snapshots, execution memory, and latest-turn visibility include:
  - planning mode
  - flow path
  - planning contract paths
  - evidence-manifest / stage-timeline / flow-trace artifact paths
- Added `planning_mode_probe` and `planning_contract_probe` eval drivers to support workflow-level probes.

### Verification
1. `node scripts/planning_mode_policy_test.js` -> PASS
2. `node scripts/requirement_guard_validator_test.js` -> PASS
3. `node scripts/eval_harness_policy_test.js` -> PASS

### Environment-Limit Notes
- `node scripts/app_server_smoke_test.js` -> blocked in this environment (`spawn EPERM` while the harness tries to launch the Codex app-server)
- `node scripts/eval_replay_api_smoke_test.js` -> blocked in this environment (`spawn EPERM`)
- `node scripts/harness_overview_test.js` static checks pass, but live integration is blocked by the same `spawn EPERM`

### Residual Risk
- Live proof/signoff generation depends on spawning the Codex app-server, so end-to-end artifact generation still needs to be re-run in an environment where child process launch is permitted.
## 2026-03-08 - Adaptive Planning + Assurance Depth

- Added independent `planning depth` and `assurance depth` selection so low-risk tasks can stay fast while runtime/protocol work stays signoff-heavy.
- Extended requirement/dispatch contracts to record `selectedPlanningDepth`, `selectedAssuranceDepth`, `signoffRequired`, and `dedicatedTestsRequired`.
- Added `review_load_breakdown.json` and surfaced planning/assurance depth through runtime snapshots, flow traces, and latest-turn summaries.
- Expanded workflow eval coverage for `FAST_PLANNING + LIGHT_ASSURANCE`, `DISCOVERY_PLANNING`, approval-boundary signoff escalation, and dedicated-test requirements for new logic.
- Added `scripts/generate_baseline_comparison.js` for vanilla-like baseline comparison output.
- 2026-03-08: Runtime proof sample now records fixture-backed dispatch evidence plus doc-sync coverage for sandboxed proof generation.
- 2026-03-08: Added signoff assurance sample evidence wiring for planning/assurance trace and doc-sync bundle checks.
# 2026-03-08 - Human-first current log surface

- Added `logs/current/operator_summary.json` as the single human-first entrypoint for current logs.
- Moved log migration/admin reports from `logs/` root to `logs/archive/admin/`.
- Demoted `logs/current/index.json` to a secondary machine-oriented directory guide instead of the primary human entrypoint.
# 2026-03-08

- Audited retirement leftovers and removed the unused `.codex/agents/worker.toml` compatibility file. Retired `worker` compatibility now remains only in governance and eval contracts.
- Deleted archive-only resources with zero local references: the legacy installer payload under `archive/installers/` and the manual render artifacts under `archive/outputs/`.
- Removed stale references to the missing `start_english_conversation_app.bat` launcher and updated operator/bootstrap guidance to use `start_codex_ui.bat` plus the same-origin English Conversation App route.
- Removed the broken `manual-single-codex.html` link from the operator console.
- Added `web/01.HarnesUI/guide.html` and `guide.css` as the static human-facing harness explainer, and linked the guide from both the Console and Overview pages.
- 2026-03-08: Converged the harness onto the frozen constitution by adding `docs/HARNESS_CONSTITUTION.md`, machine-readable contracts for `RequestFrame` / `RoutingDecision` / `DiscoveryOutcome` / `ReviewBundle` / `ReleaseDecision` / evidence / conformance invariants, explicit operator/conformance summaries, and constitution-aware release decision states. Policy/runtime enforcement now blocks parent material implementation, requires routing artifacts before child execution, keeps blocked user-input posture, and exposes `conformance_report.json` plus `operator_view_summary.json` in current and bundle surfaces.


## 2026-03-15 - Exec Submit Retry + FastMode Default OFF

- Changed the server/operator FastMode default to OFF when `CODEX_FAST_MODE_DEFAULT` is unset, while preserving env override behavior.
- Updated the Web UI FastMode checkbox default to unchecked and kept runtime-driven operator defaults authoritative once `/api/runtime` loads.
- Added bounded automatic retry for transient interactive `POST /api/exec` submit failures in `web/01.HarnesUI/app.js`.
- Interactive UI submits now attach a stable idempotency key to both the request body and `Idempotency-Key` header, so retries do not widen into duplicate work.
- Retry attempts now refresh runtime state before resubmitting, which refreshes the control token after a local harness restart.
- Hardened `start_codex_ui.bat` with launcher-managed auto-restart defaults, a retry budget, restart delay, and a stability window for unexpected `node server.js` exits.

### Verification

1. `node scripts/exec_retry_regression_test.mjs` -> PASS
2. `node scripts/app_server_smoke_test.js` -> pending manual run in a normal shell; this js_repl environment cannot invoke the repository shell runner directly

### Residual Risk

- If a request was already accepted by the server before the browser lost the response stream, the retry path will stop on the existing idempotency record rather than fabricate a second execution; operators may still need to inspect the latest harness turn for that already-accepted work.

## 2026-03-30 - Phase 2 Long-Horizon Continuity

- Added file-backed single-agent continuity without changing the main execution route.
- `scripts/lib/long_horizon_continuity.js` now owns structured `task_state`, `plan_state`, `session_memory`, `global_memory`, `artifact_index`, and `verifier_state`.
- `scripts/long_horizon_task.js` now exposes `initialize_task`, `resume_task`, `update_task`, `close_session`, and inspection commands for operator use.
- Sessions now emit carry-forward artifacts under `logs/archive/raw/runtime_state/continuity/`:
  - `task_summary`
  - `next_session_brief`
  - `open_issues`
  - `verification_status`
  - `changed_surface`
  - `durable_learnings`
- Closeout now blocks `COMPLETED` when verifier findings, acceptance criteria, or open issues remain unresolved.
- Repo-local continuity skills were added under `.agents/skills/`.
- Added `scripts/long_horizon_continuity_e2e_test.js` to verify resume, half-finished recovery, false-completion guard, and memory hygiene.

## 2026-03-30 - Phase 3 Structured Planning & Lifecycle

- Extended continuity into an explicit task lifecycle with enforced states: `initialized`, `planned`, `running`, `blocked`, `awaiting_approval`, `verifier_failed`, `completed`, `abandoned`, `archived`.
- `scripts/lib/structured_task_lifecycle.js` is now used by `close_session`, not only initialize/update/resume, so closeout writes `closeout_summary.json`, keeps `FAILED_VALIDATION` compatibility, and connects false completion to lifecycle `verifier_failed` plus `replan.json`.
- `scripts/lib/long_horizon_continuity.js` now adds `abandonTask(...)`, `archiveTask(...)`, `pruneDurableMemory(...)`, lifecycle JSONL logging, and richer inspection modes for `task_spec`, `acceptance_contract`, `closeout_summary`, `replan`, `operating_summary`, and lifecycle task lists.
- `scripts/long_horizon_task.js` now exposes `abandon_task`, `archive_task`, `prune_durable_memory`, and the new inspection commands.
- `server.js` now exposes continuity inspection through `GET /api/continuity/task` and `GET /api/continuity/tasks`.
- Added `scripts/phase3_structured_planning_lifecycle_e2e_test.js` to verify initialize -> resume -> close success, false-completion -> verifier_failed -> replan -> recovery, abandon/archive transitions, stale durable memory prune safety, and HTTP inspection.

## 2026-03-30 - Phase 4 Bounded Multi-Agent Orchestration

- Added runtime role contracts in `scripts/config/agent_role_contract_manifest.json` for `planner`, `researcher`, `executor`, `verifier`, and `coordinator`, including tool/state scopes, budgets, stop conditions, and handoff pre/postconditions.
- Added `scripts/lib/bounded_multi_agent_orchestrator.js` as the bounded handoff engine on top of the existing continuity/lifecycle substrate. Parent tasks now create child tasks with `delegated_work_item.json`, child raw/normalized outputs, and parent integration summaries instead of using a separate orchestration API family.
- Extended continuity persistence to include `agent_graph.json`, `handoff_history.json`, and `integration_summary.json`, and expanded CLI/HTTP inspection to show active agent trees, handoff history, child task buckets, pending integrations, and orphan subtasks.
- Added failure containment across handoffs: denied tool/state writes, verifier failure, and child execution failure now keep the parent out of `completed`, record replan/integration status, and route back into `blocked` or `verifier_failed`.
- Added `scripts/config/multi_agent_public_baseline.json` plus `scripts/run_multi_agent_public_baseline.js`, and folded the resulting verdict into `scripts/run_public_regression.js` so public regression now checks bounded multi-agent behavior on coding, research, and planning-family baselines.
- Added `scripts/phase4_bounded_multi_agent_e2e_test.js` to verify normal planner->researcher/executor->verifier closeout, child-failure recovery via replan, denied-action containment, parent-child resume, single-agent fallback, and compatibility with Phase 1/2/3 evidence suites.
- Added `docs/PHASE4_BOUNDED_MULTI_AGENT_RUNBOOK.md` to document role contracts, handoff triggers, inspection commands, verifier-failure handling, lifecycle meanings, fallback conditions, and baseline commands.

## 2026-03-30 - Remaining Program for AGI-Candidate Scaffold

- Added broad readiness suites and lanes for `agi_readiness_public`, `agi_readiness_holdout`, and `blackbox_readiness`, with expanded family coverage across coding, research, planning, analysis, business ops, multimodal docs, spreadsheets, web tool use, debugging, and tool learning.
- Added `scripts/lib/agi_candidate_runtime.js` as a shared runtime layer for versioned knowledge, retrieval evaluation, generated skills, runtime tool registry, routing, adaptation packaging, safety controls, and claim gating.
- Added `scripts/lib/remaining_program_runtime.js` plus `scripts/run_remaining_program.js` and `scripts/remaining_program_e2e_test.js` to run Phase 5 through Phase 10 end-to-end without replacing the existing Phase 1-4 entrypoints.
- Continuity resume context now merges generated skills and a bounded `relevant_knowledge` slice instead of relying only on durable memory.
- Bounded multi-agent handoff bundles now carry `modelRoute`, `knowledgeSlice`, and `riskAssessment`, so delegated work records the selected model, retrieved knowledge, and bounded safety classification.
- Added `docs/REMAINING_PROGRAM_RUNBOOK.md` to document phase commands, outputs, eval lanes, knowledge store locations, and claim-gate posture.
- 2026-04-04: Added an AGI-oriented evaluation / promotion layer to the existing harness under `evaluation.profile = "agi_v1"` instead of creating a parallel harness. `server.js` now keeps the existing `/api/eval/run` flow and emits `report.agiV1` only when requested, `scripts/lib/eval_harness_policy.js` now accepts the `agi_metric_probe` driver and AGI-oriented case metadata, `scripts/lib/agi_v1_profile.js` now centralizes fail-closed config validation, manifest hashing, held-out/leakage checks, weighted geometric capability aggregation, catastrophic-risk CVaR penalties, and cold-start/incumbent promotion logic, and `scripts/lib/agi_candidate_runtime.js` now applies that promotion rule only for AGI bundles while leaving legacy scorecards untouched. Added `scripts/agi_v1_profile_test.js`, `scripts/agi_v1_profile_e2e_test.js`, example profile/request files, and generated sample report artifacts under `docs/examples/agi_v1_sample/`.
- 2026-04-04: Introduced a dedicated `runtime/` surface so repo-local transient material no longer needs to live at the repository root. `.npmrc` and `start_codex_ui.bat` now steer npm cache and Playwright browser downloads into `runtime/`, `.gitignore` now treats `runtime/`, root `tmp_*`, `.playwright-cli/`, and legacy `提出用/` payloads as non-source runtime noise, and `scripts/organize_runtime_surface.js` migrates existing root transient directories/files into `runtime/` without touching governed `logs/` or intentional `output/` artifacts.
- 2026-04-04: Made HarnesUI operator state room-scoped instead of console-global. `web/01.HarnesUI/app.js` now persists each chat's workspace path, desired workspace-lock root, execution profile, approval/sandbox/web-search settings, model selection, and unsent composer draft inside chat state; switching chats reapplies that room's settings to the visible controls and re-syncs the server workspace lock to the active room when needed, so `Chat 1` lock/settings no longer bleed into `Chat 2`. Added `scripts/harnesui_chat_room_state_test.js` to verify chat-switch persistence and saved chat payloads, and re-ran `scripts/harnesui_chat_delete_progress_reset_test.js`, `scripts/harness_console_ui_policy_test.js`, and `scripts/harnesui_exec_submit_retry_test.js`.
