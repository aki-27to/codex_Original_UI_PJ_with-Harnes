---
name: "skill-design-review-codex"
description: "Use to evaluate Codex or Agent skill-package design against activation, layering, naming, progressive disclosure, evaluation, governance, and plugin boundaries."
---

# skill-design-review-codex

## Purpose

Review skill packages as reusable agent behavior components, not as saved prompts. The output must help decide whether a skill is adoptable, needs revision, should stay draft, should be archived, or should be rolled back.

## Default Boundary

- Default to read-only review unless the user explicitly asks for implementation.
- Separate platform facts from design proposals.
- Treat generator output, delegate output, and self-reported completion as untrusted until checked against files, commands, artifacts, or user feedback.
- Keep `article_alignment` separate from actual-use maturity.

## Procedure

1. Lock the target: one `SKILL.md`, one skill directory, one plugin skill, or one skill portfolio.
2. Run the mechanical analyzer when the target is local:

```powershell
node plugins/skill-governance/skills/skill-design-review-codex/scripts/analyze-skill-design.js <skill-dir-or-SKILL.md>
```

3. Read the target `SKILL.md`. Read referenced files only when the target points to them or a rubric item depends on them.
4. Load `references/design-rubric.md` for fixed scoring criteria.
5. Select the scoring profile:
   - `article_alignment`: whether design-language gates pass.
   - `operational_maturity`: optional secondary score for real use evidence, split into usage, evidence, automation, and distribution maturity.
6. Classify purpose, trigger, shape, role, side effects, and layer fit before scoring details.
7. Score only evidence-backed dimensions. Prefer `unknown` over inferred compliance when proof is missing.
8. For workflow skills, check output contract, verification contract, rollback path, and generator/evaluator separation.

## Output Contract

Return:

- `verdict`: `ADOPTABLE`, `REVISE_MINOR`, `REVISE_MAJOR`, `DRAFT_ONLY`, `ROLLBACK_CANDIDATE`, or `ARCHIVE_CANDIDATE`.
- `score`: 0-100 with score profile, score meaning, and not-checked surfaces.
- `article_alignment`: aligned status and failed or alternative gates.
- `mechanical_evidence`: analyzer path or command result summary.
- `findings`: severity-ordered findings with file/path evidence.
- `required_fixes`: smallest changes needed to improve adoption readiness.
- `non_claims`: runtime invocation, catalog routing, or isolation evidence that was not verified.

## Evidence

- Analyzer output from `scripts/analyze-skill-design.js`.
- Target `SKILL.md` and referenced files.
- Catalog, plugin manifest, flow contract, marketplace, or package checks when applicable.
- Actual-use logs or user feedback only when operational maturity is being judged.

## Verification

Before declaring a skill design review complete:

- confirm the target path was inspected or mark it `not_checked`;
- confirm review criteria came from `references/design-rubric.md`;
- confirm evaluator criteria were not changed to fit the target;
- confirm missing evidence downgrades the verdict.

## Gotchas

- A readable long skill can still be weak if it hides trigger, side effects, or completion criteria.
- A skill can be operationally useful but still fail article-alignment gates.
- Plugin and automation maturity are applicability-gated; do not punish a skill for not being a plugin unless distribution is part of the goal.

## Resources

- Detailed scoring rubric: `references/design-rubric.md`
- Mechanical analyzer: `scripts/analyze-skill-design.js`

## Failure Guard

Do not declare a skill good because it is long, polished, or internally consistent. Do not turn read-only review into silent implementation. Do not let operational usefulness, maturity logs, or a favorable self-report imply article-alignment 100.
