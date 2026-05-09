# Skill Design Review Rubric

Use this rubric as fixed criteria. Score each dimension from 0 to 4:

- 0: absent or actively harmful
- 1: weak, mostly implicit, or likely to misroute behavior
- 2: adequate but incomplete or hard to verify
- 3: strong and operationally usable
- 4: exemplary, compact, evidence-backed, and easy to maintain

Convert the 40-point raw score to 0-100. If a dimension cannot be checked, mark it `unknown` and explain why instead of guessing.

## Score Profiles

The default score profile is `article_alignment`.

`article_alignment` means the target is judged against the article's design language: Codex Skills as reusable workflow components, layer choice before skill authoring, activation contracts, progressive disclosure, purpose/trigger/shape/role classification, naming or equivalent role contract, generator/evaluator separation, evidence-backed completion, and lifecycle governance.

`operational_adoptability` can be reported as a secondary score when the target is useful in this repo despite article-language gaps. Do not use operational adoptability as the headline score when the user asks whether a skill satisfies the article.

### 100-point invariant

A score of 100 means all article-alignment gates are checked and pass, or a proposed article mechanism is replaced by an explicit machine-checked repo-local alternative. For example, a skill can satisfy the article's prefix-contract intent without `ref-`/`run-`/`wrap-`/`assign-`/`delegate-` only when a catalog/flow/lint surface gives callers the same side-effect and role information.

Do not give 100 when:

- the score only means "repo-local checks passed";
- article prefix or metadata gaps are hand-waved without a checked alternative;
- `not_checked` includes activation, evidence, naming/role contract, lifecycle, or evaluator integrity;
- completion depends on self-report rather than artifacts, checks, or evidence.

## Article Alignment Gates

These gates cap the headline score. Any failed gate prevents 100 even if the 10-dimension rubric looks strong.

Each gate must expose both `criterion` and observed `evidence`. `criterion` is the requirement the gate checks. `evidence` is the concrete measured data used for the status, such as frontmatter fields, description length, section booleans, resource counts, catalog/flow contract booleans, or article signal booleans. Do not place criterion text in an `evidence` field.

1. Activation contract: `name` and `description` tell Codex when to use the skill.
2. Purpose / Trigger / Shape / Role: the four axes are explicit in frontmatter, body, or machine-checked repo catalog/flow.
3. Naming and side-effect contract: article prefixes are used, or an equivalent repo-local naming/catalog/flow convention is checked.
4. Layer fit: deterministic work is routed to scripts, hooks, CI, CLI, MCP, API, or package commands instead of prose-only instructions.
5. Progressive disclosure: `SKILL.md` stays lean and directly points to required resources.
6. Output and evidence: artifact, status vocabulary, verification, residual risk, and failure guard are visible before completion.
7. Self-report rejection: "done" style statements are not treated as evidence.
8. Generator/evaluator integrity: evaluators use fixed criteria and treat generator/delegate output as untrusted.
9. Governance lifecycle: repo-local promoted skills have catalog, flow, promotion, and rollback surfaces when the repo enforces them.
10. Plugin and automation boundary: Plugin is distribution and Automation is schedule; neither is hidden inside an ordinary Skill claim.

## Dimensions

1. Activation contract
   - `name` and `description` make the skill discoverable.
   - `description` focuses on when to use the skill, not how many steps it performs.
   - Trigger wording is short enough to survive listing and routing pressure.

2. Layer choice
   - The skill does not reimplement deterministic checks in prose.
   - Repeated or fragile operations move to scripts, hooks, CI, CLI, MCP, API, or package commands.
   - The skill explains how to use tools rather than pretending to be the tool.

3. Responsibility boundary
   - Dictionary and workflow behavior are not mixed without an explicit reason.
   - Purpose, Trigger, Shape, and Role can be stated in one line each.
   - Side effects are clear before execution.

4. Naming and metadata contract
   - The name or repo-local convention tells callers the expected side effects and role.
   - `ref-`, `run-`, `wrap-`, `assign-*`, and `delegate-*` style prefixes are treated as design contracts when the target follows that taxonomy.
   - Custom metadata such as `base:`, `pair:`, or `kind:` is useful only when another lint, catalog, or orchestrator surface checks it.

5. Progressive disclosure
   - `SKILL.md` is lean, with the essential procedure and guards near the top.
   - Long examples, rubrics, schemas, and templates are in referenced files.
   - Resource files are discoverable from `SKILL.md`; unreferenced helper files count against maintainability.

6. Instruction quality
   - The body omits generic model knowledge.
   - Rules are concrete and verifiable.
   - Important rules explain why or when they apply.
   - All-caps `ALWAYS` or `NEVER` is reserved for true invariants.

7. Gotchas and learning path
   - Gotchas are short, current, and failure-derived.
   - Repeated mechanical failures are candidates for scripts, lint, hooks, or CI.
   - Stale warnings have a removal path.

8. Evaluation integrity
   - Workflow skills define how completion is judged.
   - Generator and evaluator roles are separated when quality judgment matters.
   - Evaluators do not alter criteria, accept their own output uncritically, or let delegated opinions become facts.

9. Output and evidence contract
   - The skill states expected artifacts, status vocabulary, and residual-risk reporting.
   - Verification commands or evidence surfaces are listed for package changes.
   - `COMPLETED` or adoption-ready claims require evidence, not self-report.

10. Governance and lifecycle
   - Catalog, promotion criteria, rollback criteria, and owner/scope surfaces are synchronized when the repo uses them.
   - The skill can remain draft if evidence is insufficient.
   - Broad authority, dependency, or external-write changes are not smuggled into a local skill edit.

## Verdict Thresholds

- 85-100: `ADOPTABLE`
- 70-84: `REVISE_MINOR`
- 50-69: `REVISE_MAJOR`
- 1-49: `DRAFT_ONLY`
- Any severe safety, authority, or false-completion defect: `ROLLBACK_CANDIDATE` or `DRAFT_ONLY` even if the numeric score is higher.

## Platform Adaptation

Some fields in Claude Code articles are platform-specific. For Codex repo-local skills, treat those as compatibility notes unless the target explicitly claims Claude Code behavior.

Required in this repo:

- Valid `SKILL.md` with matching frontmatter `name`.
- Useful `description`.
- Repo-local catalog entry when the skill is promoted into `.agents/skills`.
- Passing package checks after skill package changes.

Recommended when relevant:

- Resource references for long rubrics or scripts.
- Mechanical analyzer or verification command for repeatable review.
- Lifecycle state, promotion criteria, and rollback criteria.

Optional unless enforced by a target runtime:

- Claude-only invocation flags.
- Proposed prefix metadata such as `base:`, `pair:`, or `kind:`.
- Dynamic context injection patterns.

## Common Severe Findings

- The skill asks the model to judge completion without artifacts or tests.
- The evaluator writes, weakens, or redefines the rubric it is using.
- The skill hides side effects behind a reference-style name.
- The description summarizes a multi-step workflow so the model can act from the listing without reading the body.
- Long resources exist but `SKILL.md` never points to them.
- Delegated or external-LLM output is treated as authoritative fact.
