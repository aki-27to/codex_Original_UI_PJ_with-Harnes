# SELF_IMPROVEMENT_POLICY

Updated: 2026-03-25

## 1) Purpose

Define how the harness turns learned external guidance into governed self-improvement without silently drifting away from the constitution or frozen Requirement-Driven Foundation V1.

## 2) Core Model

- Learning collection may be autonomous.
- Improvement proposal generation may be autonomous.
- Promotion into runtime behavior must be machine-gated.
- `AGENTS.md` and frozen Step 1/2 files stay outside automatic promotion.

## 3) Machine-Readable Surfaces

- Improvement proposal schema:
  - `scripts/config/self_improvement_proposal.schema.json`
- Eval gate schema:
  - `scripts/config/self_improvement_eval_gate.schema.json`
- Promotion policy:
  - `scripts/config/self_improvement_promotion_policy.json`

## 4) Promotion Tiers

- `auto_apply_candidate`
  - only for bounded low-risk `runtime_retrieval_hint` changes
  - requires self-improvement eval gate `PASS`
- `proposal_only`
  - for docs, eval ideas, frontend quality notes, operator-policy notes, or runtime-policy tuning that should not silently change runtime behavior
- `blocked`
  - for constitutional targets and frozen Requirement-Driven Foundation V1 targets

## 5) Eval Gate

- The self-improvement eval gate compares baseline retrieval against candidate retrieval.
- The gate checks:
  - required topics remain available on targeted web-creative cases
  - forbidden topics do not leak into non-targeted cases
  - topic budget does not balloon
  - baseline-ready retrieval does not regress into skip/disable
- Only a `PASS` gate may promote auto-apply runtime hints.
- If the latest candidate fails, the harness may retain the last passing applied hint set instead of widening drift.

## 6) Runtime Scope

- Auto-applied self-improvement currently changes only bounded runtime retrieval hints for the primary OpenAI learning lane.
- Secondary learning sources remain proposal-first and must not outrank the primary lane.
- Runtime self-improvement remains advisory. It does not rewrite requirement contracts, approval boundaries, or release gates.

## 7) Operator Surface

- Runtime and Overview expose:
  - gate status
  - applied decision
  - applied hint count
  - failed eval case ids
  - artifact paths for proposal/state/gate outputs

## 8) Commands

- Recompute self-improvement gate from current learning artifacts:
  - `node scripts/self_improvement_eval_gate.js`
- Run the primary learning lane and refresh self-improvement state:
  - `node scripts/openai_blog_learning_cycle.js`
- Run the secondary learning lane and refresh self-improvement state:
  - `node scripts/anthropic_engineering_learning_cycle.js`
