# Codex Harness Diagnosis Template

Use Japanese by default.

```markdown
# Codex Harness Diagnosis: {project-name}

> Rubric: `.agents/skills/review-harness-codex/references/codex-harness-rubric.md`
> Date: {YYYY-MM-DD}
> Scope: {HEAD | dirty working tree | live runtime | generated output | mixed}

## Verdict

- Overall: {S/A/B/C/D/E} / {percent}%
- Summary: {1-2 sentences}
- Scope limit: {what was not verified}

## Surface Map

| Surface | Evidence |
|---|---|
| Authority | {paths and line refs} |
| Runtime posture | {paths and line refs} |
| Protocol routes | {paths and line refs} |
| Evidence contract | {paths and line refs} |
| Skills and roles | {paths and line refs} |
| Current truth | {git/log/output evidence} |

## Category Scores

| Category | Score | Reason |
|---|---:|---|
| A. Context and attention efficiency | {earned}/{possible} | {short reason} |
| B. Verification robustness | {earned}/{possible} | {short reason} |
| C. Permission and trust boundaries | {earned}/{possible} | {short reason} |
| D. Knowledge and current truth | {earned}/{possible} | {short reason} |
| E. Runtime and product fit | {earned}/{possible} | {short reason} |

## Strong Points

- {evidence-backed positive}
- {evidence-backed positive}
- {evidence-backed positive}

## Highest-Impact Risks

1. **{risk title}**: {evidence and impact}
2. **{risk title}**: {evidence and impact}
3. **{risk title}**: {evidence and impact}

## Improvements

1. {specific next improvement}
2. {specific next improvement}
3. {specific next improvement}

## Evidence Commands

```powershell
{commands actually run}
```

## Non-Claims

- This diagnosis does not prove release readiness unless release evidence was explicitly checked.
- This diagnosis does not prove live runtime state unless a live server/runtime was inspected.
```

## Image Report Guidance

If the user asks for a photo/image:

1. Generate the rank certificate first with `scripts/render-certificate.js`.
2. Put the certificate HTML and PNG under `output/playwright/`.
3. If details are needed, create a separate evidence report or embed the certificate at the top of the detail HTML.
4. Verify the PNG visually or with a screenshot/viewer tool before reporting the path.
