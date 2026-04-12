# Demo Flows

Authority role: `navigation / demo surface only`  
Authority registry: `authority-registry.v1`

This page fixes the three demo jobs that should be visible before anyone reads deep architecture.

Do not lead with `memory`, `subagents`, or `self-improvement` as isolated nouns.
Lead with the work a reviewer or operator can actually watch end to end.

## The Three Fixed Demo Jobs

| Job | Start point | What you should see | Proof to open | Question it answers |
| --- | --- | --- | --- | --- |
| Implement and finish with proof | `POST /api/exec` or `Console` | Active worker, specialist dispatch, task outcome, runtime proof, and signoff in `Overview` | `output/governance_public/`, `output/agi_readiness/` | Can this worker do delegated implementation and stop honestly? |
| Decide ship / no-ship honestly | `POST /api/eval/run` or `Overview -> Evidence` | Latest signoff, eval history, runtime proof, and readiness state in one place | `output/governance_public/bundle_overview.md`, `output/agi_readiness/goal_completion_status.md` | Can review trust the release call without reading raw logs? |
| Resume across sessions without guesswork | `Overview -> Memory` plus `/api/continuity/*` | Current objective, memory pack, continuity debt, handoff count, and recovery state | `output/memory_public/`, `output/continuity_public/` | Can long-running work resume without losing intent, proof, or rationale? |

## 1) Implement And Finish With Proof

Use this when the question is:

- can the worker do real delegated implementation work
- can it use specialists instead of pretending one agent did everything
- can it finish with proof instead of an answer-only completion claim

Recommended path:

1. Open `Console` and run the normal delegated-work path.
2. Open `Overview` and read `Capabilities` as job surfaces.
3. Check `Evidence` for the latest runtime proof and signoff.
4. Open `output/governance_public/bundle_overview.md` if you want the repo-safe public trace.

## 2) Decide Ship / No-Ship Honestly

Use this when the question is:

- can the runtime distinguish "something ran" from "this is adoptable"
- can a reviewer explain why the system thinks release is safe
- can the system block honestly when proof is missing

Recommended path:

1. Open `Overview -> Evidence`.
2. Check the latest signoff, eval history, and runtime proof together.
3. Open `output/agi_readiness/goal_completion_status.md`.
4. Open `output/governance_public/bundle_overview.md`.

## 3) Resume Across Sessions Without Guesswork

Use this when the question is:

- can the runtime keep continuity across long-running work
- can the next session inherit intent and proof instead of tribal memory
- can improvement stay bounded instead of becoming opaque self-rewrite

Recommended path:

1. Open `Overview -> Memory`.
2. Inspect the current objective, compiled pack, and continuity debt.
3. Open `/api/continuity/tasks?state=all`.
4. Cross-check `output/memory_public/` and `output/continuity_public/`.

## Where These Jobs Should Be Visible

The fixed demo jobs should be visible from:

- `../README.md`
- `../web/01.HarnesUI/overview.html`
- `CAPABILITY_SURFACE.md`
- `BUYER_PAIN_MAP.md`
- `PRODUCT_POSITIONING.md`

## One-Line Rule

`Show the work first, then explain the mechanism.`
