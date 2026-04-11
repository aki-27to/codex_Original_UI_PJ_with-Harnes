# SELF_IMPROVEMENT_POLICY

Updated: 2026-04-11

## 1) Purpose

Define how the harness turns learned external guidance into governed self-improvement without silently drifting away from the constitution or frozen Requirement-Driven Foundation V1.

## 2) Core Model

- Learning collection may be autonomous.
- Improvement proposal generation may be autonomous.
- Promotion into runtime behavior must be machine-gated.
- `AGENTS.md` and frozen Step 1/2 files stay outside automatic promotion.
- The promotion lifecycle is now:
  - `proposal_only`
  - `shadow_candidate`
  - `gated_candidate`
  - `auto_apply_candidate`
  - `blocked`

## 3) Machine-Readable Surfaces

- Improvement proposal schema:
  - `scripts/config/self_improvement_proposal.schema.json`
- Eval gate schema:
  - `scripts/config/self_improvement_eval_gate.schema.json`
- Promotion policy:
  - `scripts/config/self_improvement_promotion_policy.json`
- Manual capture policy:
  - `scripts/config/manual_self_improvement_capture_policy.json`

## 4) Promotion Tiers

- `auto_apply_candidate`
  - for bounded low-risk `runtime_retrieval_hint` changes
  - and for reinforced `frontend_quality_note` changes that target the mutable `docs/FRONTEND_QUALITY_PLAYBOOK.md`
  - requires self-improvement eval gate `PASS`
- `shadow_candidate`
  - for medium-blast-radius planner and decomposition changes that must be observed before they can influence the active lane
- `gated_candidate`
  - for medium-blast-radius retry/recovery, memory-pack, and skill-surface changes that require explicit targeted regression before adoption
- `proposal_only`
  - for docs, eval ideas, frontend quality notes, operator-policy notes, or runtime-policy tuning that should not silently change runtime behavior
- `blocked`
  - for constitutional targets, authority registry, approval/safety boundaries, core release gate, core evaluator hard gate, and frozen Requirement-Driven Foundation V1 targets
- Manual capture lane
  - writes only the compressed latest artifact at `output/manual_self_improvement/latest.json`
  - defaults every entry to `proposal-only` unless a separate governed lane reclassifies it
  - allows `blocked` when the lesson points at constitutional, frozen, or insufficient-evidence targets
  - does not authorize `auto-apply candidate` by itself

## 5) Eval Gate

- The self-improvement eval gate compares baseline retrieval against candidate retrieval.
- The gate checks:
  - required topics remain available on targeted web-creative cases
  - forbidden topics do not leak into non-targeted cases
  - reinforced frontend quality notes do not leak into non-targeted cases
  - topic budget does not balloon
  - prompt-block budget does not silently balloon beyond the per-case cap
  - frontend quality note budget does not balloon
  - baseline-ready retrieval does not regress into skip/disable
- Only a `PASS` gate may promote auto-apply runtime hints.
- If the latest candidate fails, the harness may retain the last passing applied hint set instead of widening drift.
- `scripts/self_improvement_apply.js` must run checkpoint -> candidate apply -> targeted regression -> rollback -> audit log before any medium/high blast-radius adoption can move past shadow/gated status.

## 5.1) Reinforcement and Stabilization

- The primary OpenAI lane now also records bounded reinforcement from completed `web_creative` turns.
- Reinforcement uses the observed task outcome plus family completion gate to classify each targeted turn as `success` or `failure`.
- `frontend_quality_note` promotion requires repeated successful observations before the note is eligible for auto-apply.
- Reinforced notes sync into `docs/FRONTEND_QUALITY_PLAYBOOK.md`, which is mutable and non-constitutional.

## 5.2) Readiness and Next-Cycle Selection

- Self-improvement state distinguishes:
  - raw auto-apply suggestions
  - ready-to-gate changes
  - candidates waiting on observations
  - candidates waiting on reinforcement
  - candidates blocked by lane capability such as disabled stabilization
- `nextPriority` and `priorityBacklog` must point to not-yet-adopted changes, not already applied hints.
- For `frontend_quality_note` candidates, `nextPriority` and `priorityBacklog` must preserve reinforcement progress, including required wins, remaining wins, observed count, success rate, and last observation time.
- The backlog should prefer low-blast-radius changes that unblock the next self-improvement cycle.

## 6) Runtime Scope

- Auto-applied self-improvement currently changes bounded runtime retrieval hints plus reinforced frontend quality notes for the primary OpenAI learning lane.
- Governed self-improvement candidates may now also target:
  - `planner_strategy`
  - `decomposition_policy`
  - `tool_selection_policy`
  - `retry_recovery_policy`
  - `memory_pack_policy`
  - `skill_surface_policy`
- Secondary learning sources remain proposal-first and must not outrank the primary lane.
- Runtime self-improvement remains advisory. It does not rewrite requirement contracts, approval boundaries, or release gates.
- Manual capture is not a runtime lane. It is a non-constitutional storage surface for compressed, on-demand retrieval of lessons that still need separate governance before any promotion.

## 7) Operator Surface

- Runtime and Overview expose:
  - gate status
  - applied decision
  - applied hint count
  - raw vs ready candidate counts
  - waiting / disabled candidate counts
  - observation status, observation count, and last observation time for the stabilization lane
  - next priority item and backlog
  - reinforcement progress for frontend-note priorities, including required wins, remaining wins, observed count, and success rate
  - failed eval case ids
  - artifact paths for proposal/state/gate outputs

## 8) Commands

- Recompute self-improvement gate from current learning artifacts:
  - `node scripts/self_improvement_eval_gate.js`
- Run the primary learning lane and refresh self-improvement state:
  - `node scripts/openai_blog_learning_cycle.js`
- Run the secondary learning lane and refresh self-improvement state:
  - `node scripts/anthropic_engineering_learning_cycle.js`
- Validate the manual self-improvement capture artifact:
  - `npm run learn:self-improvement:manual:validate`
