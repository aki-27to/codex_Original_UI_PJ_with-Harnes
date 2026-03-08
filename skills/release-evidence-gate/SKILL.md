---
name: release-evidence-gate
description: Enforce strict release gate decisions from baseline and over-delivery evidence. Use when release_manager must decide PASS, FAIL, or BLOCKED based on implementation coverage, dedicated tests, command outputs, and documentation sync in docs/CURRENT_ARCHITECTURE.md and docs/ARCHITECTURE_CHANGELOG.md.
---

# Release Evidence Gate

Apply deterministic release decisions from evidence, not assumptions.

## Workflow

1. Build evidence matrix:
   - baseline scope delivered
   - over-delivery items delivered
   - verification commands with outcomes
   - documentation sync status
2. Enforce dynamic QA gate:
   - if over-delivery adds logic branches or retries or fallback behavior, dedicated tests are mandatory.
3. Apply verdict:
   - PASS only if no blocking gaps.
   - FAIL if required evidence is missing or failing.
   - BLOCKED if inputs are incomplete or inconsistent.

## Required Evidence

1. File-level implementation evidence.
2. Test command list with PASS outputs.
3. `docs/CURRENT_ARCHITECTURE.md` sync with baseline and over-delivery details.
4. Matching `docs/ARCHITECTURE_CHANGELOG.md` entry.

## Output Contract

1. Gate table by requirement.
2. PASS or FAIL or BLOCKED verdict.
3. Exact repair instructions for each failed gate.

## Reference

- `references/release-gate-checklist.md`
