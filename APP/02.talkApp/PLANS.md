# PLANS

## Repo Audit

Date: 2026-04-05

### Current state

- The repo is a small static chat UI backed by a single `server.mjs`.
- It supports `codex exec` and the OpenAI Responses API as chat runtimes.
- It does not have:
  - a conversation engine pipeline
  - eval datasets or runners
  - feedback collection beyond plain chat history
  - memory tiers
  - debug visibility into intermediate decisions
  - pairwise preference tooling
  - goldens / anti-examples / importer flow
- The UI is too thin for the R&D workflow in the current spec.

### Decision

Rebuild the app around a TypeScript conversation engine and a debuggable local product shell. The current `server.mjs` and static UI are useful only as reference for runtime wiring and local startup behavior.

### Rebuild targets

1. Introduce a modular backend with:
   - runtime abstraction
   - baseline engine
   - improved engine
   - conversation pipeline stages
   - memory and feedback stores
   - eval APIs and batch runners
2. Introduce a richer frontend with:
   - chat
   - controls
   - debug panels
   - eval UI
   - feedback lab
   - A/B preference review
3. Introduce docs and data assets:
   - product spec
   - voice bible
   - assumptions
   - experiment log
   - goldens
   - anti-examples
   - failures
   - eval datasets and reports

## Execution phases

### Phase 1

- Create `AGENTS.md`
- Create `docs/ASSUMPTIONS.md`
- Scaffold directories and toolchain

### Phase 2

- Implement runtime abstraction and conversation engine
- Implement stores and feedback APIs
- Implement baseline and improved engines

### Phase 3

- Implement frontend screens and panels
- Implement importer and preference tools

### Phase 4

- Build datasets, goldens, anti-examples, failures
- Run baseline vs improved evals
- Repair weak spots
- Repeat three loops minimum

### Acceptance focus

- Local startup must work from `README.md`
- Chat, settings, memory, feedback, debug, eval, and feedback-lab flows must all be present
- Improved engine must beat the baseline on the project’s own eval harness
