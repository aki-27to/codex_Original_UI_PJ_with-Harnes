# CONTEXT_MEMORY_POLICY

Updated: 2026-04-11

## 1) Purpose

Define the governed memory model for this harness so long-horizon execution can reuse durable state without letting speculative summaries, stale learnings, or ungated preferences become runtime truth.

## 2) Core Model

This repo now treats memory as a contract-backed graph rather than a freeform summary cache.

- Memory is file-backed, typed, evidence-linked, scope-bounded, and revocable.
- Capture, promotion, and runtime retrieval are separate stages.
- Constitutional/frozen artifacts are not lessons. They remain top-level invariants.
- External learnings, self-improvement candidates, and manual captures stay advisory until promotion gates say otherwise.
- The active runtime never consumes the whole store. It consumes a compiled bounded memory pack.

## 3) Canonical Store

Canonical governed memory lives under:

- `logs/archive/raw/runtime_state/memory/`

The canonical event surface is:

- `memory_events.jsonl`
- `memory_feedback.jsonl`
- `memory_tombstones.jsonl`

Derived indexes live under:

- `indexes/by_id.json`
- `indexes/by_scope.json`
- `indexes/by_type.json`
- `indexes/by_task_family.json`
- `indexes/by_agent.json`
- `indexes/by_workspace.json`

Derived projections live under:

- `projections/spec_graph.json`
- `projections/workspace_progress/*.json`
- `projections/preference_profiles/active.json`
- `projections/semantic_lessons/{primary,secondary}.json`
- `projections/failure_patterns/latest.json`
- `projections/active_runtime_hints/latest.json`
- `projections/improvement_state/latest.json`
- `projections/eval_observations/latest.json`

Compiled retrieval artifacts live under:

- `retrieval/packs.jsonl`
- `retrieval/last_pack_by_thread.json`
- `retrieval/last_pack_by_workspace.json`

Human-facing memory reports are projections only and live under:

- `output/memory/`
- `output/memory_public/`

`output/memory/` is the local operator projection and is not canonical truth.
`output/memory_public/` is the repo-safe redacted projection surface used for sample/public evidence.

Those projections now surface memory-health fields as well:

- recent promotions
- recent revocations / blocked items
- stale memory warnings derived from retention policy
- latest-pack section counts and high-confidence counts

Public-safe projections must:

- redact absolute workspace paths
- replace opaque runtime ids with stable public refs
- keep compatibility lane state without exposing local-only turn/thread identifiers
- remain regenerable from an export script instead of being edited manually

## 4) Memory Tiers

- Tier 0 `constitutional memory`
  - `AGENTS.md`, frozen foundation audits, architecture invariants, core contracts
  - immutable for runtime retrieval purposes
- Tier 1 `intent / requirement memory`
  - active requirement contract, acceptance checks, locked non-goals, revision gates
- Tier 2 `preference / taste memory`
  - approved taste profiles and benchmark constraints only
- Tier 3 `workspace progress memory`
  - objective, milestones, blockers, risks, recent touched paths, next actions
- Tier 4 `episodic memory`
  - turn outcomes, evidence manifests, replay traces, eval runs, probe persistence
- Tier 5 `semantic lesson memory`
  - promoted reusable lessons, failure patterns, success patterns, runtime hints
- Tier 6 `improvement candidate memory`
  - proposal-only, shadow, blocked, or reinforcement-tracked improvement candidates

## 5) Memory Types

The active machine-readable type catalog lives in:

- `scripts/config/memory_type_catalog.json`

Representative types are:

- `constitution_ref`
- `requirement_ref`
- `preference_signal`
- `workspace_progress`
- `episodic_event`
- `eval_observation`
- `semantic_lesson`
- `failure_pattern`
- `procedure_pattern`
- `execution_strategy`
- `review_failure_pattern`
- `adoption_feedback`
- `evaluation_lesson`
- `skill_candidate`
- `runtime_hint`
- `improvement_candidate`

## 6) Promotion Rules

- Capture does not equal truth.
- A captured observation becomes durable runtime memory only after type assignment, scope assignment, evidence linking, and promotion-status evaluation.
- Secondary external learnings must remain secondary. They cannot outrank repo contracts, frozen audits, or primary-lane OpenAI learnings.
- Manual self-improvement remains proposal-first unless a dedicated promotion path explicitly upgrades it.
- User preference signals become durable only after explicit user instruction or equivalent approved intent contract.
- Manual correction lessons may be captured as `improvement_candidate` items tagged for preference learning, but they remain advisory/proposal-only until an explicit preference contract or equivalent governed promotion path upgrades them.
- Stale, conflicting, blocked, or regressed entries must be revoked or expired instead of silently kept in active packs.

## 7) Workspace Progress Memory

`workspace_progress` is mandatory durable project memory for repeated repo work.

Each workspace projection must expose:

- `currentObjective`
- `currentMilestones`
- `knownBlockers`
- `knownRisks`
- `lastSuccessfulValidation`
- `lastFailedValidation`
- `recentTouchedPaths`
- `nextRecommendedActions`
- `updatedAt`

This replaces ad hoc “what were we doing?” summaries with a bounded machine-readable progress surface.

## 8) Retrieval and Pack Compilation

Runtime retrieval is compile-time, not dump-time.

Each memory pack is built in this order:

1. spec graph
2. intent/requirement memory
3. workspace progress memory
4. recent episodic/eval observations
5. promoted semantic lessons and failure patterns
6. active preference/taste memory

Selection is deterministic and policy-backed. Authority, scope, task-family match, path ownership, freshness, evidence strength, and reinforcement state must outrank raw semantic similarity.

The machine-readable retrieval policy lives in:

- `scripts/config/memory_retrieval_policy.json`

That policy governs:

- `defaultPackBudget`
- per-section budgets (`spec`, `intent`, `workspace_progress`, `experience`, `procedure`, `evaluation`, `semantic`, `preference`, `improvement`)
- `minimumSelectionScore`
- `highConfidenceScore`

Revoked, expired, and blocked entries must not enter the compiled pack even when they would otherwise score well.

## 9) Output and Compatibility Projections

Legacy learning/self-improvement artifacts remain supported as compatibility projections, including:

- `output/openai_blog_learning_digest.json`
- `output/openai_blog_learning_ledger.json`
- `output/openai_blog_self_improvement_state.json`
- `output/openai_blog_self_improvement_gate.json`
- `output/openai_blog_reinforcement_memory.json`
- Anthropic engineering counterparts

These artifacts are no longer the canonical memory model. They are projections/reports layered on top of the governed memory graph.

The public-safe sample/export surface is:

- `output/memory_public/latest_overview.json`
- `output/memory_public/latest_overview.md`
- `output/memory_public/workspace_progress_public.json`
- `output/memory_public/latest_pack_public.json`
- `output/memory_public/promotion_revocation_health_public.json`
- `output/memory_public/memory_eval_public_status.json`
- `output/memory_public/memory_eval_public_status.md`
- `output/memory_public/openai_primary_lane_projection.json`
- `output/memory_public/anthropic_secondary_lane_projection.json`
- `output/memory_public/export_manifest.json`

Regeneration commands:

- `npm run artifact:memory-public` for live redacted export from the local canonical store
- `npm run artifact:memory-public:sample` for the deterministic repo-safe sample surface checked into the repo

Preferred publication order:

1. `npm run artifact:memory-public`
2. if the live redacted export does not pass the governed-memory public eval, regenerate the deterministic fallback sample with `npm run artifact:memory-public:sample`

The deterministic fallback sample is a two-pass fixture export. It intentionally demonstrates:

- canonical store creation
- workspace progress projection population
- bounded pack compilation
- bounded pack reuse from previously persisted canonical memory
- legacy OpenAI/Anthropic lane compatibility projection

## 10) Parent and Child Boundaries

- Parent/runtime overview may read the full compiled governed memory summary for the current workspace.
- Child agents receive only the bounded pack relevant to their role, task family, owned paths, and acceptance checks.
- Procedural and evaluation memory are first-class retrieval inputs, but they remain role-scoped and bounded. Children should receive only the procedure/eval slices that are relevant to their owned task lane.
- Read-only roles receive evidence/review/failure memory, not broad implementation history.

## 10.1) Skill Promotion Link

- `skill_candidate` memory is advisory until reproducibility and evidence linkage are confirmed.
- Successful procedure/evaluation lessons may be promoted into `scripts/config/skill_catalog.json` only when reproducibility, evidence refs, and guard metrics satisfy `docs/SKILL_PORTFOLIO_GOVERNANCE.md`.
- Regressed or stale promoted skills must remain revocable; memory promotion does not imply irreversible skill adoption.
- Unrelated thread history must not be injected into child prompts.

## 11) Safety

- Do not persist secrets, credentials, tokens, or unnecessary personal data into governed memory.
- Prefer repo-backed evidence and machine-readable contracts over conversational paraphrase.
- When in doubt, keep new observations as `captured`, `candidate`, or `proposal_only` instead of promoting them.
