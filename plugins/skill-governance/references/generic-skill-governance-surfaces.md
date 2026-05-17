# Generic Skill Governance Surfaces

Use the smallest evidence set that proves a skill should be created, revised, kept, promoted, demoted, or rolled back.

## Skill Package

- `SKILL.md` frontmatter with `name` and trigger-focused `description`.
- Purpose, procedure, output contract, evidence, verification, and failure guard.
- Optional `scripts/`, `references/`, `assets/`, and `agents/openai.yaml` only when they add operational value.

## Design Evidence

- Trigger examples and avoid examples.
- Side effects and non-targets.
- Expected artifacts and status vocabulary.
- Fixed review criteria for evaluator skills.
- Verification commands or evidence surfaces.

## Lifecycle Evidence

- Real usage evidence, not forecast or synthetic examples.
- Adoption feedback, reviewer findings, or eval results.
- Promotion and rollback criteria.
- Archive or removal path when the skill is stale, harmful, duplicated, or unused.

## Recurrence Evidence

- User correction, failed validation, or repeated miss.
- Original failing case and adjacent inverse case.
- Smallest adequate patch target: prompt, checklist, skill, test, code, config, docs, or policy.
