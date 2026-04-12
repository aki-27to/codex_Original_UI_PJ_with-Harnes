# Codex Governed Harness

Authority role: `navigation / entrypoint only`  
Authority registry: `authority-registry.v1`

This repo exists for teams that need to delegate AI work without accepting false completions, unreviewable handoffs, or "looks done" release calls. It is a governed autonomous worker platform with fixed authority boundaries, evidence-backed ship / no-ship decisions, and fail-closed behavior when proof is missing.

It is not trying to win the broad-runtime-shell comparison. It is optimized for a different question: can an autonomous worker do real work, stop honestly, and hand back something a reviewer can actually adopt?

## What Pain It Removes

Use this repo when the operational pain is:

- "The AI said it was done, but nobody can actually ship it."
- "We still have to reconstruct why the system thinks release is safe."
- "Long-running delegated work loses context between sessions and handoffs."
- "The worker drifted away from the original request and nobody noticed soon enough."
- "Reviewers are carrying too much ambiguity debt because the runtime only reports confidence, not proof."

In buyer language, this repo is about:

- preventing false-complete AI delivery
- reducing review and handoff debt
- lowering the trust burden on release reviewers
- making delegated work easier to adopt, block, or escalate honestly
- keeping audit and release evidence attached to the work itself

## What You Can Hand To It Today

The front door should read as work, not as mechanism. Today the repo visibly supports three product jobs:

1. `Delegated implementation`
   - Start from `POST /api/exec` or the local Console.
   - Watch specialist dispatch, runtime state, and proof surfaces from `Overview`.
2. `Governed review / release decision`
   - Start from `POST /api/eval/run` or the `Evidence` section in `Overview`.
   - Review ship / no-ship using signoff, runtime proof, and public governance artifacts.
3. `Long-horizon continuity / bounded improvement`
   - Start from `Overview -> Memory` and the continuity APIs.
   - Resume work across sessions without reconstructing intent and proof by hand.

Supporting visible surfaces:

- governed memory public surface: `output/memory_public/`
- readiness and completion surface: `output/agi_readiness/`
- public governance proof bundle: `output/governance_public/`
- latest operator/runtime state: `logs/current/`

Overview-first guide:

- `docs/AI_AGENT_HARNESS_DETAILED_DESIGN.html`

## Fastest 3-Minute Trial

If you are evaluating whether this repo is worth your time, do this:

1. Start the UI.
2. Open `http://127.0.0.1:57525` and go to `Overview`.
3. Read `Capabilities` first as job scenarios, not as infrastructure lanes.
4. Open `Demo Flow` and pick one of the fixed flows:
   - `Implement and finish with proof`
   - `Decide ship / no-ship honestly`
   - `Resume across sessions without guesswork`
5. Then check `output/governance_public/bundle_overview.md` and `output/agi_readiness/goal_completion_status.md`.

That path should answer the first-contact questions that matter:

1. what work this worker can really do
2. whether it is only a judge or also an execution system
3. what risk it removes for reviewers and operators
4. why governance here is product value instead of bureaucracy
5. why it should be compared on adoptability, release honesty, and auditability

## Should You Evaluate This Repo?

Yes, if you want:

- a governed autonomous worker
- local-first execution with proof-carrying release judgment
- bounded self-improvement and continuity
- a runtime that can work and also justify whether the result is adoptable

No, if you mainly want:

- the broadest provider matrix
- the flashiest generic agent shell
- a scheduler-first or gateway-first product
- "do many things quickly" as the first optimization target

## Why This Exists

Most agent products optimize first for breadth:

- more providers
- more gateways
- more tools
- more surfaces

This repo optimizes first for governed adoption:

- constitution-locked authority boundaries
- literal-request plus latent-intent alignment
- evidence-first release judgment
- fail-closed escalation
- externally auditable readiness and governance proof

If you want "an agent that can do many things quickly," there are broader products. If you want "an autonomous worker that should only be considered done when it is actually safe and adoptable," this repo is designed for that problem.

## Quick Start

### Windows

1. Launch the local UI:
   - `start_codex_ui.bat`
2. Open:
   - `http://127.0.0.1:57525`
3. If you want the script surface:
   - `npm run help:scripts`
4. Launcher/runtime default:
   - `CODEX_REQUEST_USER_INPUT_POLICY=auto-default`

### Generic Node Path

1. Start the server:
   - `npm start`
2. Open the local UI:
   - `http://127.0.0.1:57525`
3. Run the main quality gate:
   - `npm run test:repo-quality`

### First Five Minutes

If you only want the shortest path to understanding:

1. Read `docs/BEGINNER_PATH.md`
2. Read `docs/DEMO_FLOWS.md`
3. Open the UI
4. Run `npm run help:scripts`
5. Inspect `output/agi_readiness/goal_completion_status.md`
6. Inspect `output/governance_public/bundle_overview.md`

## Why Governance Exists Here

This repo is built to remove specific operational pain:

- AI says "done" but the result is not actually adoptable.
- Reviewers cannot reconstruct why the system believed release was safe.
- Long-running delegated work loses context between sessions.
- Agents optimize for local heuristics instead of the user's real goal.
- Teams need to block honestly when evidence is missing, instead of shipping on confidence language.

Mechanisms like `adoption readiness`, `public proof bundle`, and `fail-closed` exist because they solve those pains. They are not bureaucracy bolted on after the fact.

## Why It Is Different

This repo is strong where many agent runtimes stay vague:

- `docs/HARNESS_CONSTITUTION.md`
  - fixed L0/L1 authority and mission
- `AGENTS.md`
  - runtime constitution and anti-bureaucratic execution rules
- `docs/EVIDENCE_CONTRACT.md`
  - minimum proof surface for claims
- `output/agi_readiness/latest_readiness.json`
  - internal vs externally auditable score split
- `output/governance_public/`
  - repo-safe redacted request -> routing -> execution -> review -> release proof chain

This means the main value is not "look how many endpoints/providers we list on the homepage." The main value is "can this worker run, stop, escalate, and ship in a way that is honest enough to adopt."

If you want the shortest external-facing explanation of breadth, positioning, and portability, read:

- `docs/DEMO_FLOWS.md`
- `docs/CAPABILITY_SURFACE.md`
- `docs/BUYER_PAIN_MAP.md`
- `docs/PRODUCT_POSITIONING.md`
- `docs/COMPARISON_BOUNDARY.md`
- `docs/PROVIDER_AND_PORTABILITY.md`

## Current Positioning

This repo is:

- a governed harness
- a governed autonomous worker runtime
- a local-first Codex App Server integration
- a proof-carrying release and readiness system

This repo is not:

- a second parallel harness stack
- a generic multi-provider shell first and foremost
- a role-specific primary endpoint architecture
- a prose-only agent demo

## Compare It On The Right Axis

Do not compare this repo first on:

- provider count
- homepage breadth theater
- scheduler/gateway surface area
- how much it looks like a generic shell

Compare it first on:

- whether a delegated implementation can end with proof instead of just a completion claim
- whether delegated work stays inside fixed authority boundaries
- whether the runtime distinguishes procedural closure from adoptable completion
- whether ship / no-ship is evidence-backed
- whether a third party can audit what happened
- whether long-horizon work can resume without losing proof or intent

If you compare it like a broad runtime shell, you will undersell its real strengths.
If you compare it like a governed autonomous worker platform, the product boundary becomes much clearer.

## Front Door

- docs entrypoint: `docs/README.md`
- beginner path: `docs/BEGINNER_PATH.md`
- fixed demo jobs: `docs/DEMO_FLOWS.md`
- capability surface: `docs/CAPABILITY_SURFACE.md`
- buyer pain map: `docs/BUYER_PAIN_MAP.md`
- product positioning: `docs/PRODUCT_POSITIONING.md`
- comparison boundary: `docs/COMPARISON_BOUNDARY.md`
- provider posture: `docs/PROVIDER_AND_PORTABILITY.md`
- operator map: `HARNESS_MAP.md`
- active design spec: `docs/CURRENT_ARCHITECTURE.md`
- operational constitution: `AGENTS.md`
- single supreme frozen constitution: `docs/HARNESS_CONSTITUTION.md`
- proof contract truth: `docs/EVIDENCE_CONTRACT.md`

## Core Identity

- main primary routes stay fixed:
  - `POST /api/exec`
  - `POST /api/eval/run`
- local-first / evidence-first / fail-closed remain non-negotiable
- narrative docs are subordinate to machine-readable contracts and runtime proof
- success is judged by governed release judgment, not by prose-only completion claims

## Runtime And Posture

Deployment posture is profile-backed:

- `owner_local`
- `portable_local`
- `reviewed_team`

The reference architecture default is `portable_local`. Owner-operated defaults such as `danger-full-access`, `approval_policy = never`, and local auto `commit + push` are allowed only as the `owner_local` posture, not as universal architecture truth.

Launcher/runtime note:

- live runtime `requestUserInputPolicy=auto-default`
- launcher default: `CODEX_REQUEST_USER_INPUT_POLICY=auto-default`
- strict `proof` / `repro` / `conversation-app-server` lanes pin `requestUserInputPolicy=blocked`

## Source-First Layout

- `server.js`
  - composition root and route registration
- `scripts/lib/`
  - policy, orchestration, evaluation, memory, and runtime modules
- `scripts/config/`
  - machine-readable contract and policy truth
- `web/`
  - operator-facing UI surfaces
- `logs/`
  - governed runtime proof and evidence bundles
- `output/`
  - intentional public/operator artifacts
- `runtime/`
  - transient local-only caches and regenerable material

## Script Surface

Primary commands:

- `npm start`
- `npm run help:scripts`
- `npm run test:repo-quality`
- `npm run regression:public`

Document tooling commands:

- `npm run tooling:document:bootstrap`
- `npm run tooling:document:status`

## Companion Boundary

Companion apps may live beside the harness, but they do not redefine the core authority. Companion details belong in dedicated docs such as `docs/HARNESS_APP_PLATFORM.md` and `docs/WEEKLY_REPORT_COMPANION.md`.

Optional standalone companion surface:

- English conversation app launcher port: `127.0.0.1:57526`
- this is a companion surface, not the core governed harness runtime
