---
name: "skill-design-review-codex"
description: "Evaluate Codex/Agent skill-package design. Use when reviewing SKILL.md, repo-local skills, skill portfolios, or skill-design-review-codex requests."
---

# skill-design-review-codex

## Purpose

Review skill packages as reusable agent behavior components, not as saved prompts.

Default to a read-only evaluator. The output must help decide whether a skill is adoptable, needs revision, should stay draft, or should be rolled back.

## Default Boundary

- Do not edit the target skill unless the user explicitly asks for implementation.
- Separate platform facts from design proposals. Do not fail a Codex skill only because it lacks Claude-only fields, and do not treat proposed metadata such as `base:` or `pair:` as official runtime behavior unless the repo enforces it.
- Treat generator output, delegate output, and self-reported completion as untrusted until checked against evidence.
- Keep the review evidence-backed. If a target file, catalog entry, script, or runtime proof was not inspected, mark that surface as `not_checked`.

## Procedure

1. Lock the target: one `SKILL.md`, one skill directory, or a skill portfolio. If unspecified in this repo, use `.agents/skills/**/SKILL.md`.
2. Run the mechanical analyzer when the target is local:

```powershell
node .agents/skills/skill-design-review-codex/scripts/analyze-skill-design.js .agents/skills/<skill-name>
```

3. Read the target `SKILL.md`. Read referenced files only when the target points to them or a rubric item depends on them.
4. Load `references/design-rubric.md` for scoring. Use the rubric as fixed criteria; do not rewrite it to make the target pass.
5. Classify the skill before judging details:
   - Dictionary vs workflow: whether it changes files, commands, APIs, tickets, or state.
   - Purpose / Trigger / Shape / Role: what it returns, who calls it, whether it orchestrates, and whether it is generator/evaluator/contributor.
   - Implementation layer fit: what belongs in Skill text vs Hook, CLI, MCP, API, CI, or subagent.
6. Score only evidence-backed dimensions. Prefer `unknown` over inferred compliance when the target does not expose proof.
7. For workflow skills, check output contract, verification contract, rollback path, and generator/evaluator separation.
8. For dictionary skills, check side-effect absence, trigger precision, progressive disclosure, and stale-knowledge risk.

## Output Contract

Default output is Japanese when the user writes Japanese.

Include:

- Verdict: `ADOPTABLE`, `REVISE_MINOR`, `REVISE_MAJOR`, `DRAFT_ONLY`, or `ROLLBACK_CANDIDATE`.
- Score: 0-100 with the rubric version and any `not_checked` surfaces.
- Mechanical evidence: analyzer path or command result summary.
- Findings: severity-ordered, each with file/path evidence and the violated design principle.
- Required fixes: the smallest changes needed to improve adoption readiness.
- Non-claims: what was not verified, especially runtime invocation, catalog routing, or subagent isolation.

## Review Emphasis

- Activation contract: `description` should say when to use the skill, not summarize the internal procedure.
- Layering: deterministic checks belong in scripts, hooks, CI, CLI, MCP, or API; Skill text should describe when and how to use those tools.
- Responsibility split: do not mix reference knowledge, artifact production, and final evaluation in one unclear body.
- Naming as contract: prefix, suffix, or repo-local naming must let callers infer side effects and role.
- Progressive disclosure: keep `SKILL.md` lean and point to resources that should be loaded only when needed.
- Less is more: omit generic model knowledge and keep only repo-specific or behavior-changing guidance.
- Why-driven rules: important instructions should explain the reason or scope, not rely on all-caps pressure.
- Gotchas lifecycle: repeated failures should be promoted from note to deterministic check when detection is mechanical.
- Evaluation integrity: evaluator criteria must be fixed, isolated from generator context when practical, and structured enough for rerun decisions.
- Governance: catalog entry, lifecycle state, promotion criteria, rollback criteria, and verification commands must stay synchronized.

## Resources

- Detailed scoring rubric: `references/design-rubric.md`
- Mechanical analyzer: `scripts/analyze-skill-design.js`

## Evidence And Verification

For local skill reviews, include at least one of:

- Analyzer output from `scripts/analyze-skill-design.js`
- Catalog evidence from `scripts/config/repo_local_skill_catalog.json`
- Package checks: `node scripts/repo_local_skill_catalog_test.js` and `node scripts/skill_portfolio_audit.js`
- Target file references from the reviewed `SKILL.md` and any loaded resource files

If the target is not local or cannot be inspected, downgrade the verdict and list the missing evidence.

## Gotchas

- A readable long skill can still be a poor skill if it hides trigger, side effects, or completion criteria.
- Proposed naming metadata is not runtime behavior unless another tool checks it.
- External LLM or delegate opinions can inform review, but they are not evidence until mapped to inspected files or command results.

## Failure Guard

- Do not declare a skill good because it is long, polished, or internally consistent.
- Do not penalize a target for missing optional Claude-specific fields unless the target claims Claude Code compatibility.
- Do not turn review mode into silent implementation.
- Do not let an evaluator change its evaluation criteria, promotion threshold, or output schema while judging a target.
