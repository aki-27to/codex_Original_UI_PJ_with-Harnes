# Codex Harness Rubric

Score each applicable indicator:

- `2`: clearly supported by evidence
- `1`: partially supported, stale, implicit, or owner-local only
- `0`: missing, contradicted, or unsafe
- `N/A`: not applicable or not observable from available evidence

Overall grade:

- `S`: 90%+
- `A`: 75-89%
- `B`: 60-74%
- `C`: 40-59%
- `D`: 20-39%
- `E`: below 20%

Percent = earned points / applicable points.

## A. Context And Attention Efficiency

### A1. Operational Constitution Is Navigable

Question: Does `AGENTS.md` define runtime constraints, success, completion, and escalation without becoming a procedure dump?

`2`: concise operational constitution with references to detailed docs.
`1`: useful but mixed with excess procedure or stale wording.
`0`: missing, contradictory, or too large to guide routine turns.

### A2. Tool And MCP Surface Is Justified

Question: Are MCPs and tools present because they add evidence or workflow value, not because they are a menu?

`2`: each registered MCP/tool has a clear purpose, fallback, and risk boundary.
`1`: mostly useful, but some surfaces are unclear or rarely used.
`0`: broad tool list with no routing or safety rationale.

### A3. Repo-Specific Knowledge Is Separated From Model-Known Knowledge

Question: Are repo-specific contracts and policies externalized while generic knowledge is not repeated?

`2`: project-only facts live in docs/config/skills; generic instructions stay lean.
`1`: some repetition exists but does not dominate.
`0`: large repeated guidance crowds out task-local context.

### A4. Skill Triggers Are Bounded

Question: Are `.agents/skills` trigger descriptions precise enough to avoid wrong activation?

`2`: names/descriptions/useWhen/avoidWhen distinguish roles and scenarios.
`1`: usable but with overlap or vague trigger language.
`0`: skills are broad, stale, or likely to hijack unrelated tasks.

### A5. Long-Running State Is Externalized

Question: Can work resume after context loss without relying on transcript memory?

`2`: state, evidence, and handoff artifacts are durable and discoverable.
`1`: partial handoff exists but not uniformly used.
`0`: critical state exists only in chat.

## B. Verification Robustness

### B1. Contract Checks Are Deterministic

Question: Are schema/config/docs contracts verified by scripts rather than agent judgment?

`2`: package scripts or Node tests cover key contracts.
`1`: checks exist but are incomplete or not easy to run.
`0`: correctness depends mainly on reviewer prose.

### B2. Standard Execution And Evaluation Routes Are Proven

Question: Are `POST /api/exec` and `POST /api/eval/run` protected as primary routes?

`2`: docs, config, and tests align on the standard routes and forbidden alternatives.
`1`: routes are documented but not strongly checked.
`0`: custom orchestration or role-specific endpoints can replace primary routes.

### B3. Verification Feeds Repair

Question: Do failed checks lead to bounded repair and re-verification instead of passive reporting?

`2`: loop is defined and used in contracts/skills/tests.
`1`: repair happens manually or inconsistently.
`0`: failures are logged without a reliable next action.

### B4. UI And Visual Claims Require Visual Evidence

Question: Are UI/design claims backed by screenshots or browser evidence?

`2`: visual evidence is required and usually captured for UI work.
`1`: expected in docs but not consistently enforced.
`0`: visual quality is claimed from source inspection only.

### B5. Completion Is Proof-Carrying

Question: Is `COMPLETED` blocked when required evidence is missing?

`2`: task outcome contracts and final reporting require evidence refs.
`1`: policy exists, but some surfaces can still overclaim.
`0`: completion can be self-reported without proof.

## C. Permission And Trust Boundaries

### C1. Runtime Posture Profiles Are Explicit

Question: Is `owner_local` separated from safer portable or shared defaults?

`2`: posture profiles are explicit and active behavior declares which one is in use.
`1`: owner-local is documented but can be mistaken for universal default.
`0`: broad permissions are presented as generally safe.

### C2. Destructive Or External Actions Are Gated

Question: Are deletes, schema changes, pushes, deployments, and external writes handled through clear gates?

`2`: irreversible or external actions are blocked, escalated, or separately justified.
`1`: policy exists but enforcement is partly conversational.
`0`: destructive/external actions can proceed silently.

### C3. Self-Configuration Mutation Is Governed

Question: Are changes to `.codex`, `.agents/skills`, and skill catalogs audited?

`2`: skill/config changes require catalog metadata, rollback criteria, and tests.
`1`: governance exists but promotion/use evidence is thin.
`0`: self-behavior surfaces can mutate without checks.

### C4. External Inputs Are Treated As Untrusted

Question: Are web/MCP/user-provided artifacts separated from durable truth until verified?

`2`: source attribution, trust level, and verification boundary are explicit.
`1`: external inputs are usually checked but not systematically classified.
`0`: external content can enter memory/config/output unreviewed.

### C5. Local Automation Is Non-Intrusive By Default

Question: Do browser/editor/launcher automations avoid stealing focus unless requested?

`2`: headless/non-foreground defaults are encoded and tested.
`1`: documented preference exists but some paths remain visible by default.
`0`: automation regularly disrupts the operator.

## D. Knowledge And Current Truth

### D1. Authority Precedence Has A Single Source

Question: Is there one machine-readable authority registry?

`2`: authority registry and docs agree.
`1`: registry exists but some docs are stale.
`0`: authority is spread across inconsistent prose.

### D2. Architecture And Changelog Stay Synchronized

Question: Are behavior changes reflected in current architecture and changelog surfaces?

`2`: doc-sync is part of release evidence.
`1`: docs are updated often but can lag.
`0`: docs frequently contradict implementation.

### D3. Learning And Memory Are Governed

Question: Are learning events promoted through explicit gates rather than automatic runtime mutation?

`2`: scope, promotion, rollback, and replay evidence are required.
`1`: learning policy exists but runtime adoption is partial.
`0`: memory/skills can change behavior without governance.

### D4. Current Truth Is Split By Surface

Question: Does reporting separate `HEAD`, dirty working tree, live runtime, and generated output?

`2`: reports consistently split these states.
`1`: split is known but not always present.
`0`: stale output and live behavior are conflated.

### D5. Reviewer-Facing Read Order Is Clear

Question: Can an independent reviewer find the primary verdict before secondary telemetry?

`2`: reviewer start artifacts and read order are explicit.
`1`: surfaces exist but order is not always obvious.
`0`: reviewers must infer what matters.

## E. Runtime And Product Fit

### E1. Standard Protocol Path Is Preserved

Question: Does app-server behavior stay on standard Codex routes and avoid hidden alternate orchestrators?

`2`: route constraints are encoded in docs/tests/config.
`1`: mostly true, but exceptions need clearer boundaries.
`0`: parallel orchestration paths are active or encouraged.

### E2. Role Separation Matches Work Ownership

Question: Are parent, child, reviewer, tester, and release-manager roles distinct in config and practice?

`2`: role configs and operating rules match ownership boundaries.
`1`: roles exist but some work is handled by the wrong layer.
`0`: roles are nominal and do not affect behavior.

### E3. User-Facing Semantics Match Operator Mental Model

Question: Do UI labels and states avoid misleading failure/readiness wording?

`2`: UI states distinguish working, blocked, resend-ready, and complete.
`1`: improvements exist but some labels remain ambiguous.
`0`: UI regularly misrepresents the runtime state.

### E4. Local-First Constraints Are Preserved

Question: Are port, dependencies, local operation, and offline-ish assumptions stable unless explicitly changed?

`2`: local-first constraints are documented and respected.
`1`: generally stable but not always tested.
`0`: changes introduce hidden dependencies or broad host impact.

### E5. Public Claims Are Bounded By Evidence

Question: Do README/product surfaces avoid claiming readiness beyond current proof?

`2`: public claims are tied to proof bundles and readiness artifacts.
`1`: mostly bounded but some wording can overreach.
`0`: public docs overstate current capability.

## Category Priority

When proposing improvements, rank in this order unless the user asks otherwise:

1. C. Permission and trust boundaries
2. B. Verification robustness
3. D. Knowledge and current truth
4. E. Runtime and product fit
5. A. Context and attention efficiency
