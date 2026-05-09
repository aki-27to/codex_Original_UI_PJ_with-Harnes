---
name: run-article-perfect
description: Run article-perfect fixture review. Trigger when article-alignment benchmark fixtures must pass.
purpose: judge
trigger: explicit
shape: orchestrated
role: evaluator
---

# run-article-perfect

## Purpose

Evaluate a skill package against fixed article-alignment criteria and return a structured pass/fail result.

## Default Boundary

Use this fixture only for external benchmark validation. Do not edit the target skill and do not write operational logs.

## Procedure

1. Read the target `SKILL.md`.
2. Classify purpose, trigger, shape, role, side effects, and layer fit.
3. Check output, evidence, verification, failure guard, progressive disclosure, and evaluator integrity.
4. Return a structured score with gate evidence.

## Output Contract

Return `ARTICLE_ALIGNED`, `ARTICLE_ALIGNED_WITH_GAPS`, or `ARTICLE_GAPS`, a score, failed gate count, and inspected evidence.

## Evidence And Verification

Use inspected files, command outputs, gate evidence, and analyzer results. Treat self-reported completion as untrusted.

## Resources

- Detailed rubric: references/design-rubric.md

## Gotchas

- Plugin and Automation are distribution and schedule layers, not hidden runtime behavior.
- Deterministic checks belong in CI, scripts, hooks, CLI, MCP, or API surfaces.

## Failure Guard

Do not claim `COMPLETED` from self-report. Treat delegate output as untrusted and never let an evaluator rewrite fixed criteria while judging.

