---
name: "review-harness-codex"
description: "Diagnose Codex App Server harnesses and repo-local agent runtime surfaces. Use for Codex harness evaluation, scorecards, improvement plans, or report/image requests involving AGENTS.md, .codex/config.toml, .agents/skills, scripts/config contracts, docs, logs, and output truth."
---

# review-harness-codex

## Purpose

Evaluate a Codex App Server harness on Codex-native surfaces instead of Claude Code surfaces.

Use this skill when the user asks to diagnose, score, review, photograph, or improve this Codex harness or another Codex-style repo.

## Default Boundary

- Default to read-only diagnosis unless the user asks to change the harness or skill package.
- Do not grade a Codex harness by missing `CLAUDE.md` or `.claude/settings.json`.
- Treat Claude-oriented `review-harness` as a source ancestor only; use this skill for Codex-native evaluation.
- A high harness score is not a release verdict. Release/adoption still requires task-specific evidence.

## Codex Surface Map

Inspect the target path, defaulting to the current repo:

- Authority: `docs/HARNESS_CONSTITUTION.md`, `AGENTS.md`, `scripts/config/authority_registry.json`
- Runtime posture: `.codex/config.toml`, `.codex/agents/*.toml`, `scripts/config/deployment_posture_profiles.json`
- Protocol routes: `POST /api/exec`, `POST /api/eval/run`, `/api/batch/*` limits
- Evidence and outcomes: `docs/EVIDENCE_CONTRACT.md`, `scripts/config/task_outcome_contract.json`, package scripts, verifier outputs
- Skills and roles: `.agents/skills/**/SKILL.md`, `scripts/config/repo_local_skill_catalog.json`, `scripts/config/skill_catalog.json`
- Current truth: `git status`, `logs/current`, `output/governance_public`, `output/agi_readiness`, generated output freshness
- User-facing behavior: HarnesUI state wording, `NEEDS_INPUT`, resend-ready states, focus-stealing defaults

## Procedure

1. Lock the diagnosis scope: target repo, read-only vs mutation, plain report vs image. If unspecified, use read-only report for the current repo.
2. Collect evidence with targeted reads and `rg`. Split findings into `HEAD`, dirty working tree, live runtime, and generated output whenever current truth matters.
3. Load `references/codex-harness-rubric.md` and score only evidence-backed criteria. Use `N/A` for not applicable or not observable.
4. Load `references/report-template.md` when a formal report is requested.
5. If the user asks for a photo/image, preserve the original harness-diagnosis experience: generate a rank certificate image first, then optionally provide a compact evidence report.
6. Prioritize improvements by risk and adoption value: authority/protocol/evidence first, then current-truth clarity, then presentation polish.

## Rank Certificate UX

When an image/photo result is requested, use the bundled certificate renderer so the user gets the same experience as the original harness diagnosis skill, but with Codex wording.

```powershell
node .agents/skills/review-harness-codex/scripts/render-certificate.js `
  --grade A `
  --percent 80 `
  --project "codex_Original_UI_PJ_with-Harnes" `
  --summary "Codex harness evaluation adapted from native authority, runtime, evidence, and skill surfaces." `
  --html output/playwright/harness-evaluation-certificate.html `
  --out output/playwright/harness-evaluation-certificate.png
```

Use lowercase grade letters only for filenames when you need stable naming: `rank-s`, `rank-a`, `rank-b`, `rank-c`, `rank-d`, `rank-e`.

If Playwright is not available, the script still writes the HTML certificate. Report the missing PNG as a blocked visual artifact rather than silently substituting a different card layout.

## Output Contract

Default output is Japanese unless the target artifact is English-only.

Include:

- Overall grade and percent
- Category scores
- Strongest evidence-backed positives
- Highest-impact risks
- Practical next improvements
- Certificate PNG/HTML paths when an image was requested
- Scope limits, especially unverified live runtime or dirty working tree boundaries

## Verification For Skill Package Changes

When this skill itself is added or changed in this repo, run:

```powershell
node scripts/repo_local_skill_catalog_test.js
node scripts/skill_portfolio_audit.js
```

## Failure Guard

- Do not invent missing requirements or hidden release claims.
- Do not treat owner-local `danger-full-access` as universally safe.
- Do not collapse `HEAD`, dirty tree, live runtime, and generated output into one truth claim.
- Do not create or update reports when the user asked for analysis-only, unless they explicitly requested an artifact or image.
