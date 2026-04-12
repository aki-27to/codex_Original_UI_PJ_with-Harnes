# Buyer Pain Map

Authority role: `navigation / value translation only`  
Authority registry: `authority-registry.v1`

This page translates repo mechanisms into buyer-visible reasons to care.

## The Short Version

Buyers do not purchase:

- `externally auditable score`
- `proof-carrying release`
- `adoption readiness`

They purchase:

- fewer false-complete AI deliveries
- fewer risky AI changes reaching production
- faster and cleaner review of delegated work
- clearer ship / no-ship decisions
- less operational ambiguity when work spans sessions and agents
- a lower trust burden on the human who still owns release

## What Responsibility Gets Lighter

This repo is valuable when it reduces responsibility load for real people:

- `reviewers`
  - they do not need to reconstruct release rationale from raw logs and confidence language
- `operators`
  - they do not need to guess whether the worker is truly done, blocked, or only procedurally closed
- `owners`
  - they do not need to carry continuity state manually across long-running sessions
- `teams adopting AI work`
  - they do not need to trust an answer-only completion claim without proof attached

## Pain -> What This Repo Does

| Buyer pain | What this repo changes | Why the buyer cares | Where it shows up |
| --- | --- | --- | --- |
| "The AI said it was done, but it was not actually shippable." | Distinguishes procedural closure from adoptable completion. | Prevents false-complete delivery from leaking into release review. | `docs/HARNESS_CONSTITUTION.md`, `output/agi_readiness/`, `output/governance_public/` |
| "We cannot explain why the system thought release was safe." | Exports repo-safe proof and release artifacts. | Lowers reviewer trust burden and audit friction. | `output/governance_public/` |
| "Delegated work drifts away from the original request." | Locks requirement/intent surfaces and rejects silent goal substitution. | Prevents scope drift from becoming an adoption surprise. | `AGENTS.md`, `scripts/config/task_outcome_contract.json`, `scripts/config/iteration_control_contract.json` |
| "Long-running work loses context between sessions." | Preserves governed memory and continuity state. | Lowers handoff debt and makes resumption concrete. | `output/memory_public/`, `output/continuity_public/`, HarnesUI Overview |
| "We do not know whether to keep iterating or stop." | Separates release, block, input-needed, and failed-validation states. | Makes stop / escalate / ship decisions explicit instead of implied. | `docs/HARNESS_CONSTITUTION.md`, `output/agi_readiness/goal_completion_status.*` |
| "AI improvements are opaque and risky." | Forces bounded, gated self-improvement instead of free-form rewrite. | Prevents invisible runtime drift from hiding behind "continuous improvement." | `docs/SELF_IMPROVEMENT_POLICY.md`, readiness outputs, HarnesUI Overview |

## What Incidents It Helps Prevent

This repo is easiest to understand when you describe the incidents it reduces:

- shipping changes without enough proof
- silently widening scope beyond the original request
- accepting output that only satisfies internal heuristics
- resuming a long-running task and guessing what happened
- using "the agent said so" as a release argument

## What Becomes Safer To Delegate

The repo is not trying to make every AI task look possible.
It is trying to make specific delegated work safer to adopt:

- bounded implementation that must end with proof
- release recommendation that must survive review
- long-horizon work that must resume without losing rationale
- improvement work that must stay policy-gated instead of self-rewriting freely

## How To Pitch It In One Sentence

Use this wording:

`It lets an autonomous worker do real delegated work and still tell you honestly whether the result is safe to adopt.`

## What Gets Faster

- triaging whether a run is truly done
- reviewing evidence for ship / no-ship
- resuming work without reconstructing context manually
- understanding which runtime lane is active and why

## What Gets Smaller

- false confidence
- handoff ambiguity
- review debt
- hidden release risk
- "the agent said so" decision making

## What Adoption Barrier It Lowers

This repo lowers the barrier for teams that would otherwise say:

- "We cannot let AI output reach release review without an audit trail."
- "We cannot let a long-running delegated task depend on tribal memory."
- "We cannot accept a runtime that always looks done even when proof is thin."
- "We need the worker and the release judgment to live on the same governed path."

## Use This Doc When

Read this page when the question is:

- "why should anyone want this repo?"
- "what buyer pain does governance solve here?"
- "how do I explain the value without leading with mechanism jargon?"
