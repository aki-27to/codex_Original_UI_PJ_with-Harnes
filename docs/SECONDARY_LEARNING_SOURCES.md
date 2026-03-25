# SECONDARY_LEARNING_SOURCES

Updated: 2026-03-25

## Purpose

Define how non-OpenAI external sources can be learned from without outranking the primary OpenAI learning lane or causing runtime drift.

## Current Sources

- Primary source:
  - `OpenAI Developers Blog`
  - authority level: primary
  - allowed to participate in bounded runtime retrieval when separately enabled
- Secondary source:
  - `Anthropic Engineering`
  - authority level: secondary
  - current mode: observe, digest, proposal, doc sync
  - runtime retrieval: disabled by default

## Secondary Source Rules

- Secondary sources must be stored in their own artifacts and docs.
- Secondary sources must not silently override `AGENTS.md`, frozen Step 1/2 behavior, or the locked requirement contract.
- Secondary sources must be filtered down to portable agent-engineering principles.
- Vendor-specific product mechanics, benchmark marketing, and model-family-specific advice stay out of runtime policy.
- Secondary-source learnings can inform proposals, reviews, and governed documentation before they are considered for runtime use.

## Anthropic Engineering Lane

- policy:
  - `scripts/config/anthropic_engineering_learning_policy.json`
- cycle command:
  - `node scripts/anthropic_engineering_learning_cycle.js`
- curated doc:
  - `docs/ANTHROPIC_ENGINEERING_LEARNINGS.md`
- artifacts:
  - `output/anthropic_engineering_learning_ledger.json`
  - `output/anthropic_engineering_learning_digest.json`
  - `output/anthropic_engineering_learning_report.md`
  - `output/anthropic_engineering_learning_proposals/`

## Promotion Boundary

- Learning a secondary source does not authorize automatic runtime behavior change.
- Any widening from digest/proposal/doc sync into runtime retrieval requires separate validation and regression checks.
