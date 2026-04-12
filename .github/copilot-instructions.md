# Repository-wide Copilot Instructions

This repository is a local-first governed Codex App Server harness, not a generic app sandbox.

Primary authority order:
1. `docs/HARNESS_CONSTITUTION.md`
2. `AGENTS.md`
3. `docs/AGENT_OPERATING_RULES.md`
4. machine-readable contracts under `scripts/config/`
5. `docs/CURRENT_ARCHITECTURE.md` for the active narrative spec

GitHub-native customization surfaces in `.github/copilot-instructions.md`, `.github/instructions/`, and `.github/agents/` are projection layers for that authority. They do not replace the local constitution.

Always preserve these repo invariants unless the user explicitly asks to change them:
- standard execution route `POST /api/exec`
- evaluation route `POST /api/eval/run`
- default local UI port `57525`
- local-first operation with no new dependency by default
- the existing `/api/batch/*` compatibility surface without expanding it into a parallel orchestration system

Autonomy and scope rules:
- minimize user intervention for local, reversible, auditable changes
- do not silently widen scope
- do not claim completion without evidence
- treat `approvalBoundaryItems` as planning and audit metadata, not an automatic stop signal
- escalate only for explicit user-decision clauses, destructive irreversible changes, broad environment changes, permission boundary changes, or irreversible external writes

When behavior, governance, or operator-facing posture changes:
- update `docs/CURRENT_ARCHITECTURE.md`
- append a matching entry to `docs/ARCHITECTURE_CHANGELOG.md`
- run the required tests for the touched surface
- prefer machine-readable contracts over prose if they disagree

Design-sensitive work is not complete because it builds. Intent alignment, benchmark fit, visual evidence, and independent review remain required gates.

Repo surface discipline:
- keep repo root source-first
- transient local material belongs in `runtime/`
- governed evidence belongs in `logs/`
- intentional operator/report artifacts belong in `output/`

Use the path-specific instructions under `.github/instructions/` and the bounded worker roles under `.github/agents/` whenever they are relevant.
