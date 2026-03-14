# DESIGN_ACCEPTANCE_CONTRACT

Updated: 2026-03-13

## 1) Purpose

Define the extra contract that applies when the user is judging the output by taste, quality, and benchmark superiority rather than only by runtime correctness.

## 2) Hard Requirements

- A benchmark or reference to beat must be fixed.
- The user's taste memory must be available and applied.
- The target workspace must be locked before execution.
- Visual evidence must exist.
- Independent review must exist.
- Technical verification must still exist.

## 3) Failure Rule

- If any hard requirement above is missing, the task is not complete even when build/test/API checks pass.
- The correct task outcome is `FAILED_VALIDATION`.

## 4) Default Taste Signals for This Harness

- Strongly prefer:
  - real-world information density
  - typography with hierarchy and tension
  - concrete proof such as photos, numbers, certifications, or outcomes
- Strongly reject:
  - AI-looking generic layouts
  - glassmorphism as a default visual language
  - uniform card grids with weak hierarchy
  - cheap dashboard aesthetics

## 5) Runtime Sources

- Machine-readable contract:
  - `scripts/config/design_acceptance_contract.json`
- Seed taste memory:
  - `scripts/config/default_user_taste_memory.json`
- Mutable persisted taste memory:
  - `logs/user_taste_memory.json`
