---
name: "skill-design-review-codex"
description: "Evaluate Codex/Agent skill-package design and article-alignment. Use when reviewing SKILL.md, repo-local skills, skill portfolios, or skill-design-review-codex requests."
---

# skill-design-review-codex benchmark stub

USE FOR:
- Waza smoke benchmark for the repo-local `skill-design-review-codex` package.
- External validation that Waza can load the skill fixture and eval tasks.
- Checking that Waza output/results stay separate from actual skill outcome logs.

DO NOT USE FOR:
- Replacing the authoritative repo-local skill.
- Writing `logs/skill_outcomes.jsonl`.
- Running harness execution or release evaluation routes.

This is the Waza benchmark copy of the repo-local skill package.

The authoritative skill remains:

```text
.agents/skills/skill-design-review-codex/SKILL.md
```

The Waza tasks load the authoritative file as a fixture from the repo root. This stub only lets Waza discover a skill named `skill-design-review-codex`.
