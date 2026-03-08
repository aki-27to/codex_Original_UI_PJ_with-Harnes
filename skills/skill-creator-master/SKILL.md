---
name: skill-creator-master
description: Create and improve Codex skills end to end with strict naming, trigger metadata, progressive disclosure, validation, and iteration workflow. Use when the user asks to create a new Codex skill, update SKILL.md, tune skill triggering, add scripts or references, generate agents/openai.yaml, or verify skill quality.
---

# Skill Creator Master

Build production-ready Codex skills with repeatable quality and low ambiguity.

## Workflow

1. Lock intent before writing files.
2. Define success criteria, non-goals, and constraints in one concise block.
3. Collect 2 to 3 concrete trigger examples from expected user requests.
4. Normalize skill name to hyphen-case (lowercase, digits, hyphens only).
5. Create or update `<skill-name>/SKILL.md` first, then add optional resources.
6. Keep frontmatter minimal: `name` and `description`.
7. Write `description` as the trigger contract:
   - State what the skill does.
   - State when to use it.
   - Include concrete verbs and contexts.
8. Write body instructions in imperative form and minimize filler.
9. Move large or variant-specific details into `references/` and link from `SKILL.md`.
10. Add deterministic scripts only for repeated or fragile operations.
11. Create or refresh `agents/openai.yaml` with UI metadata.
12. Validate structure and run quick checks before reporting completion.

## Mandatory Output Contract

Produce these artifacts for every new skill:

1. `<skill-name>/SKILL.md` (required)
2. `<skill-name>/agents/openai.yaml` (recommended)
3. Optional folders only when needed:
   - `<skill-name>/scripts/`
   - `<skill-name>/references/`
   - `<skill-name>/assets/`

Do not add auxiliary docs such as `README.md`, `CHANGELOG.md`, or process notes.

## SKILL.md Rules

Apply these rules strictly:

1. Keep YAML frontmatter at the top and close it correctly.
2. Include `name` and `description`.
3. Keep `name` equal to folder name.
4. Keep `description` specific enough to avoid false positives and false negatives.
5. Keep body concise and procedural.
6. Prefer references for detailed examples, schemas, and long option matrices.

## `agents/openai.yaml` Rules

Include at minimum:

```yaml
interface:
  display_name: "Human readable title"
  short_description: "Short UI summary"
  default_prompt: "Use $skill-name to <task>."

policy:
  allow_implicit_invocation: true
```

Keep strings quoted and mention `$skill-name` explicitly in `default_prompt`.

## Validation

Run this when Python is available:

```bash
scripts/quick_validate.py <path/to/skill>
```

If Python is unavailable, run manual checks:

1. Confirm file/folder structure exists.
2. Confirm frontmatter has `name` and `description`.
3. Confirm `name` is hyphen-case and <= 64 chars.
4. Confirm `description` length is <= 1024 chars.
5. Confirm `default_prompt` references `$skill-name`.

## Iteration Loop

1. Test with real prompts.
2. Record trigger misses and false triggers.
3. Tighten `description` first.
4. Update body steps only when procedure quality is the issue.
5. Re-run validation after each edit batch.

## Reference Map

Use these files as needed:

- `references/codex-skill-checklist.md` for release gating.
- `references/trigger-tuning.md` for trigger diagnostics and rewrite patterns.
