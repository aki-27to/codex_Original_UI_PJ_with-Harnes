# SKILL_PORTFOLIO_GOVERNANCE

Updated: 2026-05-07

## 1) Goal

This document governs repo-local skills as a curated operating portfolio. The goal is not to accumulate many instructions, but to keep reusable procedures that improve adoption readiness, verification quality, and recurrence prevention.

## 2) Sources Of Truth

- Repo-local skill catalog: `scripts/config/repo_local_skill_catalog.json`
- Skill catalog audit: `scripts/repo_local_skill_catalog_test.js`
- Generated skill archive guard: `scripts/generated_skill_registry_guard_test.js`
- Skill flow contract: `scripts/config/skill_flow_contract.json`
- Skill flow audit: `scripts/skill_flow_contract_test.js`
- Portfolio policy: `scripts/config/skill_portfolio_policy.json`
- Skill outcome event schema: `scripts/config/skill_outcome_event.schema.json`
- Actual-use outcome log: `logs/skill_outcomes.jsonl`
- Governance contracts: `scripts/config/agent_governance_contracts.json`

## 3) Canonical Root

`.agents/skills/` is the canonical repo-local skill root.

`skills/` may contain legacy or non-canonical local material, but new repo-local skills registered in `scripts/config/repo_local_skill_catalog.json` must point to `.agents/skills/`.

`.agents/old-skills/` is the archive root for demoted or historical skill packages. Archived skills must not be listed in `scripts/config/repo_local_skill_catalog.json`; restoring one requires moving it back under `.agents/skills/` and re-adding catalog metadata with fresh evidence.

Generated skill registry readers must not expose entries under `.agents/old-skills/`, entries marked `stale: 1`, missing `SKILL.md` files, or paths outside `.agents/skills/generated/` as callable skills.

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

## 7.1) Operational Maturity

`article_alignment` and `operational_maturity` are separate scores.

- `article_alignment`: whether the skill package satisfies the design-language gates for Codex Skills.
- `operational_maturity`: whether actual skill use has produced enough outcome evidence to judge repeatability.

Operational maturity is split into:

- `usage_maturity`: actual use count, success rate, and guard failures.
- `evidence_maturity`: artifacts, verification, decisions, rollback references, and promotion references left by actual use.
- `automation_maturity`: only applicable when the skill needs scheduled or unattended execution.
- `distribution_maturity`: only applicable when the skill needs cross-repository or Plugin/package distribution.

`logs/skill_outcomes.jsonl` must contain only real skill-use events that match `scripts/config/skill_outcome_event.schema.json`. Do not add synthetic success rows, sample rows, or forecast rows to raise maturity scores. Test fixtures may create temporary JSONL files, but production maturity evidence comes only from actual task outcomes.

## 8) Skill Flow Rule

`scripts/config/skill_flow_contract.json` defines parent-facing routing, not automatic skill invocation. Skills may recommend the next surface, but the parent agent remains responsible for selecting the next skill, skipping skills for small tasks, and making the final adoption decision.

The flow contract separates:

- `flows`: ordered or conditional routing where sequence matters.
- `standaloneOrSupport`: skills that can be used alone or only when a specific evidence/debug condition appears.
- `globalForbiddenDirectNext`: direct transitions that must not happen because they skip replay, evidence, design review, or governance gates.

Do not force every skill into a fixed chain. Every active repo-local skill must have a role in the flow contract, but standalone, support, and diagnostic skills may remain outside a strict sequence.

## 9) Skill Authoring Routing

For Harnes repo-local skill creation or update requests, prefer `.agents/skills/skill-creator-master/SKILL.md` before the official system `skill-creator`.

This is a routing preference, not a final promotion claim. `skill-creator-master` is preferred when the target skill must improve Harnes behavior through output, evidence, verification, rollback, and catalog contracts. The official `skill-creator` remains the fallback/reference for generic Codex skill creation, `scripts/`, `references/`, `assets/`, `agents/openai.yaml`, and system-skill compatibility.

The preference is mechanically guarded by `scripts/skill_portfolio_policy_test.js`, which requires `skill-creator-master` to appear before `skill-creator` in the default role assignments, and by `scripts/config/skill_flow_contract.json`, which forbids direct `skill-creator-master -> skill-promotion-governance` promotion without design review evidence.

## 10) Rollback Rule

A skill must be rolled back or demoted when it:

- Routes work away from the user request.
- Encourages false completion.
- Hides missing evidence.
- Expands authority or tool use beyond the task boundary.
- Produces recurring neutral overhead without outcome improvement.
- Bypasses the flow contract by jumping directly across required review, replay, evidence, or governance gates.

## 11) Required Evidence

Skill package changes must include:

```text
node scripts/repo_local_skill_catalog_test.js
node scripts/generated_skill_registry_guard_test.js
node scripts/skill_flow_contract_test.js
node scripts/skill_portfolio_audit.js
```

When the change affects repo-quality stages, also run the relevant repo-quality structure or stage command.
