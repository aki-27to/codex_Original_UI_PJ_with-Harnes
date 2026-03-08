# Codex Skill Release Checklist

## Intent

1. Define explicit goal in one sentence.
2. Define non-goals.
3. Define constraints and environment assumptions.

## Metadata

1. `SKILL.md` exists.
2. Frontmatter contains `name` and `description`.
3. `name` equals folder name.
4. `name` uses lowercase, digits, hyphens only.
5. `description` explains both capability and trigger contexts.

## Body Quality

1. Instructions are imperative and procedural.
2. Ambiguous wording is removed.
3. Negative scope is documented for risky misuse cases.
4. Optional variants are moved to `references/`.

## Resource Hygiene

1. Add `scripts/` only for deterministic, repeated tasks.
2. Add `references/` only for material that should be loaded on demand.
3. Add `assets/` only for output resources.
4. Avoid duplicate content across `SKILL.md` and references.

## UI Metadata

1. `agents/openai.yaml` exists.
2. `interface.display_name` is human-readable.
3. `interface.short_description` is concise.
4. `interface.default_prompt` mentions `$skill-name`.

## Validation

1. Run `scripts/quick_validate.py <skill-path>` when available.
2. If validator is unavailable, run manual structural checks.
3. Test with at least three realistic prompts.
4. Confirm trigger precision:
   - No obvious false positives.
   - No obvious false negatives for intended cases.

## Completion Gate

Ship only when all sections pass.
