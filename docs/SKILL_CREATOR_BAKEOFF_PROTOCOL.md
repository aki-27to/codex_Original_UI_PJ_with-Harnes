# Skill Creator Bakeoff Protocol

## Purpose

Compare the official system `skill-creator` with the repo-local `skill-creator-master` by judging the downstream skills they create, not by judging the generator skill's own mechanical score.

## Competitors

- `official`: `C:\Users\akima\.codex\skills\.system\skill-creator\SKILL.md`
- `repo-local`: `plugins/skill-governance/skills/skill-creator-master/SKILL.md`

## Controls

- Use the same task prompts for both competitors.
- Run each competitor in an isolated context when child dispatch is explicitly permitted.
- Save generated packages under a temporary bakeoff directory outside promoted skill roots.
- Do not show one competitor's output, score, or intended answer to the other competitor.
- Strip competitor labels before final review when practical.

## Test Tasks

1. `workflow-script-skill`: create a skill for a repeatable local workflow that benefits from a deterministic script and validation command.
2. `reference-evaluator-skill`: create a read-only evaluator skill that uses a fixed rubric and reports evidence-backed findings.
3. `strict-output-skill`: create a skill for a narrow exact-output writing or transformation contract where trigger precision and failure guards matter.

## Scoring

Score each generated skill package from 0 to 100:

- 20: mechanical skill-design analyzer score.
- 15: activation contract and trigger precision.
- 15: output, evidence, verification, and failure-guard clarity.
- 15: correct layer choice for scripts, references, assets, hooks, or docs.
- 15: catalog/promotion/rollback readiness for repo-local adoption.
- 15: downstream task usability by a fresh agent.
- 5: operator-confusion and overfit penalty.

## Winner Rule

- A competitor wins only with a 5-point or larger average margin and no severe safety, authority, or false-completion defect.
- If `official` wins on resource depth but `repo-local` wins on Harnes adoption contracts, classify the result as `split_by_scope`.
- If isolated generation was not run, report `NOT_YET_ISOLATED` rather than claiming a final winner.

## Required Evidence

- Generator skill path used for each run.
- Generated package paths.
- Analyzer output for each generated package.
- Reviewer notes for activation, layering, output/evidence, and failure guards.
- Catalog check output when a generated package is promoted into `.agents/skills`.
- Explicit non-claims about isolation, runtime invocation, and real downstream adoption.
