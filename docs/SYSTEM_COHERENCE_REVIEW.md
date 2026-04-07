# SYSTEM_COHERENCE_REVIEW

Updated: 2026-04-07

## Purpose

This repo cannot treat a local fix as complete just because one file changed and one test passed.

Core changes must be reviewed as a system:

- execution path
- governance rules
- machine-readable contracts
- server/runtime enforcement
- eval, memory, and lifecycle surfaces
- artifact and runtime surface taxonomy

The machine-readable source of truth is [system_coherence_review_contract.json](C:\Users\akima\dev\codex_Original_UI_PJ_with-Harnes\scripts\config\system_coherence_review_contract.json).

## When It Applies

Run the whole-system coherence review when a change touches core harness surfaces such as:

- `server.js`
- `scripts/`
- `web/`
- `.codex/`
- `package.json`
- `start_codex_ui.bat`
- core governance and architecture docs

This review is also required when the task explicitly asks for architecture, governance, contract, eval, memory, artifact-surface, or `/api/exec` consistency.

## Required Command

- `node scripts/system_coherence_review_test.js`

This command is not a generic smoke test.
It exists to prove that the repo still agrees with itself across the main system planes.

## Review Planes

### 1) Execution Path

- `POST /api/exec` remains the primary execution route
- `/api/batch/*` remains an allowed auxiliary local workflow only
- no parallel local orchestration path is introduced

### 2) Governance Rules

- parent and child responsibilities remain clear
- completion still depends on evidence, not narrative claims
- release posture remains aligned with the constitution and operating rules

### 3) Machine-Readable Contracts

- governance, evidence, and outcome contracts stay synchronized
- new rules are encoded in machine-readable policy, not only prose
- missing review obligations map to explicit failure semantics

### 4) Server / Runtime Enforcement

- runtime missing-evidence handling reflects the contract
- the server can fail closed when a required whole-system review is missing
- evidence artifacts stay inspectable

### 5) Eval / Memory / Lifecycle

- eval and memory remain layered on the active execution route
- lifecycle and review surfaces stay connected to the same governed runtime
- no side lane silently becomes the real source of truth

### 6) Artifact Surface

- repo root stays source-first
- intentional `output/` artifacts and transient `runtime/` material remain separated
- scratch output does not quietly become durable truth

## Pass Condition

A core change is only ready to close when:

- the required command passes
- `docs/CURRENT_ARCHITECTURE.md` is synchronized
- `docs/ARCHITECTURE_CHANGELOG.md` is synchronized
- no plane-specific contradiction is left unresolved

## Failure Meaning

If this review is required but missing, the correct interpretation is:

- not "probably okay"
- not "completed with a note"
- `FAILED_VALIDATION`

This repo is complex enough that partial local confidence is not a sufficient release signal.
