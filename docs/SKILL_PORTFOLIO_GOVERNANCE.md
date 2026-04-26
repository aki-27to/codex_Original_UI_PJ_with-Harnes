# SKILL_PORTFOLIO_GOVERNANCE

Updated: 2026-04-25

## 1) Goal

This document governs repo-local skills as a curated operating portfolio. The goal is not to accumulate many instructions, but to keep reusable procedures that improve adoption readiness, verification quality, and recurrence prevention.

## 2) Sources Of Truth

- Repo-local skill catalog: `scripts/config/repo_local_skill_catalog.json`
- Skill catalog audit: `scripts/repo_local_skill_catalog_test.js`
- Portfolio policy: `scripts/config/skill_portfolio_policy.json`
- Governance contracts: `scripts/config/agent_governance_contracts.json`

## 3) Canonical Root

`.agents/skills/` is the canonical repo-local skill root.

`skills/` may contain legacy or non-canonical local material, but new repo-local skills registered in `scripts/config/repo_local_skill_catalog.json` must point to `.agents/skills/`.

## 4) Skill Classes

- `cataloged`: A skill registered in `scripts/config/repo_local_skill_catalog.json` with complete metadata.
- `generated_candidate`: A generated skill that has not yet earned promotion.
- `legacy_local`: A local skill-like artifact outside the canonical repo-local root.
- `deprecated`: A skill kept only for migration or historical traceability.

## 5) Required Metadata

Every cataloged repo-local skill must define:

- `id`
- `path`
- `description`
- `useWhen`
- `avoidWhen`
- `expectedArtifacts`
- `evidenceSurfaces`
- `workerDecisionConnection`
- `promotionCriteria`
- `rollbackCriteria`

## 6) Lifecycle

Repo-local skills follow this lifecycle:

```text
draft -> cataloged -> used -> evidence_observed -> effective | neutral | harmful -> promote | keep | rollback
```

- `draft`: `SKILL.md` exists, but catalog and evidence metadata are incomplete.
- `cataloged`: Metadata is complete and the skill is discoverable through the repo-local catalog.
- `used`: A task selected the skill and left evidence on the expected surface.
- `evidence_observed`: Outcome, failure, or neutral effect can be inspected.
- `effective`: The skill improves adoption readiness, verification quality, or recurrence prevention.
- `neutral`: The skill does not harm outcomes, but evidence is not strong enough for promotion.
- `harmful`: The skill causes wrong routing, false completion, missing evidence, or authority-boundary drift.
- `promote`: Repeated evidence supports keeping it as a durable operating pattern.
- `keep`: More evidence is needed before promotion or rollback.
- `rollback`: Remove or demote the skill when harmful, stale, or guard-breaking behavior is observed.

## 7) Promotion Rule

A skill is not promoted just because one task succeeded. Promotion requires repeatability, evidence, guard compatibility, and no measurable degradation in user-adoptable outcomes.

## 8) Rollback Rule

A skill must be rolled back or demoted when it:

- Routes work away from the user request.
- Encourages false completion.
- Hides missing evidence.
- Expands authority or tool use beyond the task boundary.
- Produces recurring neutral overhead without outcome improvement.

## 9) Required Evidence

Skill package changes must include:

```text
node scripts/repo_local_skill_catalog_test.js
node scripts/skill_portfolio_audit.js
```

When the change affects repo-quality stages, also run the relevant repo-quality structure or stage command.
