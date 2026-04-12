# Capability Surface

Authority role: `navigation / capability summary only`  
Authority registry: `authority-registry.v1`

This page answers one question:

`What can this repo visibly do today, without reading the whole architecture?`

It is a product-surface summary, not the canonical authority. For frozen rules, use `HARNESS_CONSTITUTION.md` and `AGENTS.md`.

## Core Identity

This repo is strongest as:

- a governed autonomous worker runtime
- a proof-carrying release and readiness system
- a local-first Codex App Server harness

It is not primarily trying to be:

- the broadest multi-provider agent shell
- a gateway-first marketplace runtime
- a flashy "do everything" demo shell

## Three Visible Jobs

If you want breadth to be visible, do not start with a noun list like `memory / browser / subagents`.
Start with the work a reviewer or operator can watch end to end.

| Job | What starts it | What becomes visible | Proof surface | Where to touch |
| --- | --- | --- | --- | --- |
| Delegated implementation | `POST /api/exec` or `Console` | active worker, specialist dispatch, live runtime state, evidence, and task outcome | `output/governance_public/`, `output/agi_readiness/`, `Overview -> Evidence` | `Overview`, `Console`, `logs/current/` |
| Governed review / release decision | `POST /api/eval/run` or `Overview -> Evidence` | signoff, runtime proof, eval history, readiness state, and release truth | `output/governance_public/bundle_overview.md`, `output/agi_readiness/goal_completion_status.md` | `Overview -> Evidence`, `output/` |
| Long-horizon continuity / bounded improvement | `Overview -> Memory` or `/api/continuity/*` | current objective, handoffs, debt, replay state, memory pack, and gated improvement state | `output/memory_public/`, `output/continuity_public/` | `Overview -> Memory`, continuity APIs |

## Visible Capability Matrix

| Surface | Visible today | Where to see it | What it means |
| --- | --- | --- | --- |
| Standard execution path | Yes | `POST /api/exec`, HarnesUI | Main delegated-work path stays fixed and local-first |
| Evaluation and release judgment | Yes | `POST /api/eval/run`, `output/governance_public/` | Runs are judged through governed release/evidence surfaces |
| Multi-step planning | Yes | `logs/current/`, HarnesUI, planning contracts | The harness locks requirements, chooses planning depth, and carries plan state |
| Multi-agent specialist dispatch | Yes | topology/runtime surfaces, governance bundles | Parent/child role separation is visible and contract-backed |
| Governed memory | Yes | `output/memory_public/`, `docs/CONTEXT_MEMORY_POLICY.md` | Memory is bounded, typed, linked to evidence, and exportable |
| Continuity / long-horizon state | Yes | `output/continuity_public/` | The repo can persist and resume governed task progress |
| Self-improvement governance | Yes | `docs/SELF_IMPROVEMENT_POLICY.md`, readiness outputs | Improvement proposals, gates, and promotion states are visible |
| Public proof bundle | Yes | `output/governance_public/` | A repo-safe request -> routing -> execution -> review -> release chain is exportable |
| Readiness / adoption scoring | Yes | `output/agi_readiness/` | Internal vs externally auditable readiness is separated |
| Browser verification path | Yes, but secondary | tests, frontend verification docs, local verification flows | Browser-grade checks exist, but they are not the headline product entrypoint |
| Companion app platform | Yes | `docs/HARNESS_APP_PLATFORM.md` | Multiple product UIs can share the harness without redefining core authority |

## Visible Breadth Today

If a third party asks "does it only judge, or can it actually do work?", the honest answer is:

It can visibly do all of these:

- structure a request into a bounded contract
- plan and dispatch specialist execution
- preserve governed memory and continuity
- evaluate literal alignment, latent-intent alignment, and release readiness
- export public-safe proof and readiness surfaces

That means the repo is not only an evaluator.
It is an execution system whose breadth becomes clear when you look at the three product jobs first and the mechanism lanes second.

## Touch It Now

You do not need to infer breadth only from docs anymore.

Open the local UI and start with:

1. `Overview`
2. `Capabilities`
3. `Demo Flow`

Those surfaces expose, in one place:

- the jobs you can hand to the runtime now
- the supporting breadth behind those jobs
- the proof that tells you whether the result is actually adoptable

and give direct paths into:

- `Console`
- replay/evidence APIs
- continuity APIs
- the underlying proof sections

## What Is Strong But Easy To Miss

These are real strengths that many people will not notice unless you point them out:

- governed memory, not just a chat summary cache
- public proof bundle, not just an internal log folder
- externally auditable score, not just an internal confidence score
- fail-closed release judgment, not just "looks done"
- self-improvement with promotion gates, not free-form self-rewrite

## What Is Not First-Class Yet

These are the places where broad agent runtimes still look stronger from the outside:

- first-class multi-provider runtime surface
- one-command install/setup/use flow comparable to `curl | bash`
- a broad marketplace-style gateway story
- a scheduler-first product surface
- a homepage/demo surface that makes runtime breadth obvious in one glance

This repo should not overclaim those areas today.

## How To Describe The Repo Honestly

Good:

- governed autonomous worker
- local-first governed harness
- proof-carrying release and readiness runtime
- adoption-first agent platform

Bad or misleading:

- broadest general-purpose agent shell
- provider-agnostic runtime first and foremost
- runtime marketplace
- unconstrained self-improving autonomous agent

## Fast Links

- front door: `../README.md`
- demo flows: `DEMO_FLOWS.md`
- beginner path: `BEGINNER_PATH.md`
- buyer pain map: `BUYER_PAIN_MAP.md`
- positioning: `PRODUCT_POSITIONING.md`
- comparison boundary: `COMPARISON_BOUNDARY.md`
- provider posture: `PROVIDER_AND_PORTABILITY.md`
- architecture: `CURRENT_ARCHITECTURE.md`
