---
name: spec-sync-assistant
description: Synchronize implementation results with architecture or spec documents before completion. Use when default or release_manager must update docs/CURRENT_ARCHITECTURE.md and docs/ARCHITECTURE_CHANGELOG.md with design intent, baseline delivery, over-delivery details, verification evidence, and residual risks for traceable final reporting.
---

# Spec Sync Assistant

Convert code and test outcomes into consistent architecture-document updates.

## Workflow

1. Collect change set:
   - modified files
   - tests and command outputs
2. Extract delivery narrative:
   - design intent
   - baseline delivery
   - over-delivery details
3. Extract verification evidence:
   - command list and PASS or FAIL outcomes
4. Write synchronized spec updates:
   - update `docs/CURRENT_ARCHITECTURE.md`
   - append a matching dated entry to `docs/ARCHITECTURE_CHANGELOG.md`
5. Confirm consistency:
   - spec claims match code and tests
   - no undocumented over-delivery remains

## Mandatory Section Fields

1. Design intent
2. Baseline delivery
3. Over-delivery
4. Verification evidence
5. Residual risks

## Output Contract

1. Updated spec path and section id.
2. Mismatch list found and resolved.
3. Confirmation that completion gate is satisfied.

## Reference

- `references/section-template.md`
