# BEGINNER_PATH

This is the shortest path to understanding the repo in about five minutes.

If you want a quick overview before the canonical front door,
open `AI_AGENT_HARNESS_DETAILED_DESIGN.html` first and then come back here.

## 0) Decide If This Repo Is Even For You

Use this repo if your first concern is:

- whether AI-produced work is actually adoptable
- whether autonomous execution stays inside fixed authority boundaries
- whether a reviewer can audit why the system thinks release is safe

Do not start here if your first concern is:

- provider count
- gateway breadth
- scheduler-first convenience
- "broadest shell" optics

## 1) What This Repo Is

This repo is a governed harness and governed autonomous worker runtime.

Its center of gravity is not "the broadest possible agent shell."
Its center of gravity is:

- fixed authority boundaries
- adoption-ready outcomes
- evidence-first release judgment
- fail-closed escalation
- public/auditable output surfaces

The two primary runtime routes are:

- execution: `POST /api/exec`
- evaluation and release judgment: `POST /api/eval/run`

## 2) What To Open First

1. `../README.md`
2. `DEMO_FLOWS.md`
3. `CAPABILITY_SURFACE.md`
4. `BUYER_PAIN_MAP.md`
5. `PRODUCT_POSITIONING.md`
6. `COMPARISON_BOUNDARY.md`
7. `PROVIDER_AND_PORTABILITY.md`
8. `../AGENTS.md`
9. `CURRENT_ARCHITECTURE.md`
10. `EVIDENCE_CONTRACT.md`
11. `../HARNESS_MAP.md`

Read them in that order if you only need the shortest usable mental model.

That order tells you:

1. what it is
2. which three demo jobs to watch first
3. what it can visibly do
4. why anyone should want it
5. how to frame it against broad runtime products
6. what its portability claim really is

## 3) What To Run First

Windows local path:

1. `../start_codex_ui.bat`
2. Open `http://127.0.0.1:57525`
3. Run `npm run help:scripts`

Generic Node path:

1. `npm start`
2. Open `http://127.0.0.1:57525`
3. Run `npm run help:scripts`

## 3.1) What To Click First

When the UI opens, start with:

1. `Overview`
2. `Capabilities`
3. `Demo Flow`

That is the fastest way to answer:

- does this runtime actually do work?
- what can it do right now?
- which fixed product jobs should I try first?
- where do memory, continuity, browser recovery, and self-improvement show up?

## 4) Where Truth Shows Up At Runtime

- latest operator/runtime surface: `logs/current/`
- intentional public/operator artifacts: `output/`
- local-only transient material: `runtime/`

Useful first stops:

- `output/agi_readiness/goal_completion_status.md`
- `output/governance_public/bundle_overview.md`
- `output/memory_public/summary.md`

## 5) What Success Looks Like Here

The repo does not treat a procedurally neat run as enough.

The target is an adoption-ready outcome that is:

- aligned to the literal request
- aligned to latent user intent
- inside authority and safety boundaries
- strong enough to ship or to block honestly
- supported by evidence

## 6) What To Ignore At First

Do not start by trying to read every script or every changelog entry.

You can ignore these on the first pass:

- deep archive material
- long historical implementation logs
- every program-phase command in `package.json`

Start with the front door, then the active runtime path, then the proof surfaces.

## 7) Fast Mental Model

Use this shorthand:

- `README.md`
  - product identity
- `AGENTS.md`
  - runtime execution constitution
- `CURRENT_ARCHITECTURE.md`
  - active system shape
- `EVIDENCE_CONTRACT.md`
  - what claims need to be believable
- `logs/current/`
  - what the harness thinks is happening now
- `output/`
  - what the repo intentionally exposes

## 8) Common Commands

- `npm run help:scripts`
- `npm run test:repo-quality`
- `npm run regression:public`
- `npm run artifact:governance-public`
- `npm run artifact:memory-public`

## 9) One-Sentence Positioning

If Hermes-style products optimize first for breadth, this repo optimizes first for governed adoption.
