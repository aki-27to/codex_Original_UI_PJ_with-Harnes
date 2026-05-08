---
name: "skill-creator-master"
description: "Create or revise repo-local Codex skills from an existing task pattern while preserving official skill-creator principles and adding Harnes-specific output, evidence, verification, rollback, catalog, and forward-test contracts. Use when a skill package is being authored, compared, hardened, or prepared for repo-local adoption."
---

# skill-creator-master

## Purpose

Create concise repo-local skills that improve repeatable agent behavior, not saved prompts. Preserve the official `skill-creator` strengths around concrete examples, progressive disclosure, bundled resources, and validation integrity, then add this repo's explicit output, evidence, verification, rollback, and catalog contracts.

## Procedure

1. Lock the skill contract: target task pattern, trigger examples, non-targets, side effects, expected artifacts, owner role, and adoption criteria.
2. Choose the package shape: `SKILL.md` only, or `scripts/`, `references/`, and `assets/` when deterministic work, long reference material, or output resources are genuinely needed.
3. Draft a lean `SKILL.md` with `Purpose`, `Procedure`, `Output Contract`, `Evidence`, `Verification`, and `Failure Guard`; keep long examples and schemas in directly referenced resource files.
4. Put repeatable mechanical checks in scripts or existing package commands instead of prose, and keep evaluator criteria separate from generator instructions when quality judgment matters.
5. For repo-local skills, synchronize `scripts/config/repo_local_skill_catalog.json` with `useWhen`, `avoidWhen`, `expectedArtifacts`, `evidenceSurfaces`, `workerDecisionConnection`, `promotionCriteria`, and `rollbackCriteria`.
6. Validate the package with the skill-design analyzer and catalog checks when applicable; if scripts are added, run a representative script check.
7. Forward-test with fresh agents only when the current runtime and user instruction permit child dispatch; otherwise report that isolation was not checked.

## Output Contract

Return a concise result with:

- `outcome`: `ADOPTABLE`, `REVISE`, `DRAFT_ONLY`, `FAILED_VALIDATION`, or `BLOCKED`.
- `created_or_updated_paths`: skill files, catalog entries, scripts, references, or assets touched.
- `skill_contract`: trigger, purpose, role, side effects, expected artifacts, and non-targets.
- `evidence`: analyzer output, catalog checks, script checks, or forward-test artifacts inspected.
- `open_issues`: missing evidence, unresolved routing questions, or remaining design risks.
- `rollback_notes`: how to remove or demote the skill if it overfits, misroutes, or harms task outcomes.

## Evidence

- Source examples or task pattern that justify a reusable skill.
- Target `SKILL.md` and any referenced `scripts/`, `references/`, or `assets/`.
- `scripts/config/repo_local_skill_catalog.json` entry for promoted repo-local skills.
- Analyzer result from `.agents/skills/skill-design-review-codex/scripts/analyze-skill-design.js`.
- Package checks such as `node scripts/repo_local_skill_catalog_test.js` and `node scripts/skill_portfolio_audit.js` when catalog or portfolio surfaces change.
- Forward-test artifacts only when independent dispatch was actually used.

## Verification

Before claiming the generated skill is adoption-ready, verify at least:

- frontmatter `name` matches the folder and `description` contains trigger conditions;
- `Purpose`, `Procedure`, `Output Contract`, `Evidence`, `Verification`, and `Failure Guard` are present and specific;
- deterministic or fragile work is covered by scripts or package commands rather than prose alone;
- repo-local catalog fields are synchronized when the skill is promoted under `.agents/skills`;
- analyzer and catalog checks pass, or the result is reported as `FAILED_VALIDATION`.

## Gotchas

- A skill that scores well on the analyzer can still be weak if it overfits the rubric and fails real task transfer.
- A useful official or system skill can look structurally weak under repo-local checks if its runtime contract is different.
- Do not compare skill generators by self-score; compare the downstream skills they create under the same independent tasks.

## Failure Guard

Do not claim this skill is better than `skill-creator` because it receives a higher mechanical score. Do not create a new skill when a short repo instruction, script, test, or documentation edit would solve the repeatable problem with less operator confusion.
