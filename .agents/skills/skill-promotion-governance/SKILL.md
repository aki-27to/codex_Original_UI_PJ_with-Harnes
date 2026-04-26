---
name: "skill-promotion-governance"
description: "Govern skill creation, usage evidence, promotion, and rollback. Use when adding, cataloging, promoting, demoting, or auditing repo-local skills or skill candidates."
---

# skill-promotion-governance

## Purpose

Prevent "worked once" from becoming permanent agent behavior.

## Procedure

1. Classify the skill lifecycle state: `draft`, `cataloged`, `used`, `evidence_observed`, `effective`, `neutral`, `harmful`, `promote`, `keep`, or `rollback`.
2. Require reproducibility evidence, adoption feedback, and evaluation lesson links before promotion.
3. Define rollback criteria before relying on the skill for future tasks.
4. Run skill catalog and portfolio checks after package changes.

## Evidence

- `scripts/config/repo_local_skill_catalog.json`
- `scripts/config/skill_portfolio_policy.json`
- `logs/skill_outcomes.jsonl` when available
- `node scripts/skill_portfolio_audit.js`

## Failure Guard

Do not promote skills that are harmful, unmeasured, stale, or in conflict with authority/evidence contracts.
