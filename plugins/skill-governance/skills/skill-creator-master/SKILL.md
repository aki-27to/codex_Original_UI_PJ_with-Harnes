---
name: "skill-creator-master"
description: "Use when authoring, comparing, or hardening Codex skills from repeated task patterns with output, evidence, verification, rollback, and catalog or plugin contracts."
---

# skill-creator-master

## Purpose

Create concise skills that improve repeatable agent behavior, not saved prompts. Use this when a task pattern is recurring enough to deserve a reusable skill package, or when an existing skill needs stronger trigger, evidence, verification, rollback, or packaging contracts.

## Procedure

1. Lock the skill contract: task pattern, trigger examples, avoid examples, side effects, expected artifacts, owner scope, and adoption criteria.
2. Choose the smallest adequate package shape: `SKILL.md` only, or add `scripts/`, `references/`, `assets/`, and `agents/openai.yaml` only when they add operational value.
3. Draft a lean `SKILL.md` with `Purpose`, `Procedure`, `Output Contract`, `Evidence`, `Verification`, and `Failure Guard`.
4. Put deterministic or fragile checks in scripts, hooks, CI, CLI, MCP, API, or package commands instead of prose-only instructions.
5. Keep generator instructions separate from evaluator criteria when quality judgment matters.
6. Synchronize the target repository's catalog, plugin manifest, flow contract, or marketplace entry when the skill is promoted into a managed surface.
7. Validate the package with local analyzer, catalog, plugin, or portfolio checks when available.

## Output Contract

Return:

- `outcome`: `ADOPTABLE`, `REVISE`, `DRAFT_ONLY`, `FAILED_VALIDATION`, or `BLOCKED`.
- `created_or_updated_paths`: skill files, catalog entries, plugin files, scripts, references, or assets touched.
- `skill_contract`: trigger, purpose, role, side effects, expected artifacts, and non-targets.
- `evidence`: analyzer output, catalog checks, plugin checks, script checks, or forward-test artifacts inspected.
- `open_issues`: missing evidence, unresolved routing questions, or remaining design risks.
- `rollback_notes`: how to remove, demote, or archive the skill if it overfits, misroutes, or harms outcomes.

## Evidence

- Source examples or task pattern that justify a reusable skill.
- Target `SKILL.md` and any referenced resources.
- Catalog, plugin manifest, marketplace, or flow entries when applicable.
- Analyzer output, package checks, or representative script checks when available.

For portable evidence categories, see `../../references/generic-skill-governance-surfaces.md`.

## Verification

Before claiming the generated skill is adoption-ready:

- confirm frontmatter `name` matches the folder and `description` contains trigger conditions;
- confirm required sections are present and specific;
- confirm deterministic work is covered by a script, command, or explicit evidence path when needed;
- confirm the managed catalog or plugin surface points to the intended path;
- confirm failed or skipped checks are reported as adoption risk.

## Failure Guard

Do not create a new skill when a short instruction, script, test, or documentation edit would solve the repeatable problem with less operator confusion. Do not claim promotion from a single successful run without lifecycle evidence.
