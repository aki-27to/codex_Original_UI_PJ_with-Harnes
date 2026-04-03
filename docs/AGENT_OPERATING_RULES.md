# AGENT_OPERATING_RULES

Updated: 2026-03-20

## 1) Scope
This document contains tier-1 operating rules referenced by `AGENTS.md`.
- It expands execution policy only; `AGENTS.md` remains the tier-0 constitution.
- The frozen harness-design authority for this repo is `docs/HARNESS_CONSTITUTION.md`.
- If this document and machine-readable config disagree on skill IDs or assignments, `scripts/config/skill_catalog.json` wins.

## 2) Hierarchical Flow (5-Step)
- System model: one Parent Orchestrator + specialist Children.
- Parent duties:
  - Step 1 `Requirement Understanding`: lock explicit goal + over-delivery scope.
  - design-sensitive tasks must also lock benchmark, taste memory signals, disallowed patterns, and review gates before Step 2.
  - Step 2 `Planning and Dispatch`: split tasks, assign specialists, define acceptance checks.
  - Step 4 `Parent Review`: validate child outcomes against baseline and over-delivery criteria.
  - Step 5 `Final Report`: emit release decision, report baseline result + added value + residual risks.
- Parent prohibition:
  - parent roles are governed decision owners, not material implementers
  - repo changes that affect behavior, posture, release state, or tests must map to dispatched child work
- Child duties:
  - Step 3 `Specialist Execution`: execute assigned tasks with evidence.
- Collaboration-first rule:
  - end-to-end user execution defaults to `default`
  - `intake` and `release_manager` are phase-scoped parent overlays, not interchangeable general-purpose parents

### 2.1 Planning Modes For Step 1/2
- Step 1/2 thickness is selected per task, not globally.
- `FAST`:
  - existing-scope change
  - specialist ownership is clear
  - acceptance checks are already concrete
  - no explicit user-decision gate
  - open questions are effectively zero
- `NORMAL`:
  - bounded but cross-specialist work
  - reviewer/tester evidence matters
  - approval-boundary markers may exist if the path stays local, reversible, and evidence-backed
  - assumptions exist but do not block execution
- `DISCOVERY`:
  - requirements or non-goals are still ambiguous
  - explicit user decision exists
  - open questions or assumption load are high enough that speculative implementation would create rework
- Selection inputs are explicit and machine-readable:
  - open question count
  - acceptance-check clarity
  - specialist-boundary count
  - explicit user-decision signal
  - over-delivery risk
  - user-decision requirement
  - assumption dependence
- `DISCOVERY` must surface unresolved explicit decisions as `EXTERNAL_ACTION_REQUIRED` or proposal-only `RELEASE_BLOCKED`; heuristic boundary markers alone do not force that state.
- `FAST` keeps the previous harness bias toward speed, but only when the selector says the task is actually low-risk.
- Planning output must exist before child execution as a machine-readable `RoutingDecision`.

### 2.2 Assurance Depth For Step 4
- Step 4 strictness is also selected per task, independently from Step 1/2 thickness.
- `LIGHT_ASSURANCE`:
  - docs-only or similarly low-risk bounded work
  - no unnecessary reviewer/tester/signoff fan-out
- `STANDARD_ASSURANCE`:
  - normal implementation work
  - bounded review/test evidence when the workflow or risk requires it
- `SIGNOFF_ASSURANCE`:
  - runtime, protocol, infra, governance, or new-logic work
  - reviewer/tester/doc-sync/signoff evidence must be ready before a release decision can be `RELEASE_APPROVED` or `RELEASE_APPROVED_WITH_ASSUMPTIONS`
- Assurance inputs are explicit and machine-readable:
  - change kind (`docs`, `web`, `server.js`, `scripts`, governance)
  - runtime/protocol/infra contact
  - reviewer/tester need
  - user-facing impact
  - irreversible risk
  - signoff importance
  - new-logic risk

## 3) Role Routing
- `default` (Parent Orchestrator): default runtime entrypoint, end-to-end parent owner, and the only general-purpose parent role.
- `intake` (Parent Planner): Step 1/2-only requirement contract + dispatch matrix; not a release gate or implementation fallback.
- `release_manager` (Parent Gate): Step 4/5-only final review loop + release decision; not an intake planner or implementation fallback.
- `frontend_worker` (Child): `web/` UI/UX and browser behavior.
- `backend_worker` (Child): `server.js`, `scripts/`, protocol/API behavior.
- `infra_worker` (Child): `.codex/`, launch/runtime/logging/operational reliability.
- `tester` (Child): executable verification and user-journey checks.
- `reviewer` (Child): independent defect/risk review.
- `explorer` (Child, read-only): uncertainty reduction and repository fact-finding.
- `worker` is no longer an active configured child role. It remains only as a legacy governance contract artifact for compatibility audits and must not appear in normal dispatch plans.

## 4) Parent Runtime Posture
- Config-backed parent defaults:
  - `default`: `sandbox_mode = "danger-full-access"`, `approval_policy = "never"`
  - `intake`: `sandbox_mode = "read-only"`, `approval_policy = "never"`
  - `release_manager`: `sandbox_mode = "read-only"`, `approval_policy = "never"`
- Request-user-input posture:
  - parent roles must not fabricate human checkpoints from heuristic boundary markers just because a runtime offers `request-user-input`
  - explicit user decisions and narrow irreversible external actions may surface as `EXTERNAL_ACTION_REQUIRED` or `RELEASE_BLOCKED`
  - `intake` records unresolved decisions, `release_manager` blocks only when those decisions remain explicit and material, and `default` owns autonomous continuation otherwise

## 5) Tool/MCP Assignment Policy
- Browser-centric tooling (for example Playwright/screenshot) routes to `frontend_worker`.
- Protocol/runtime/API checks route to `backend_worker`.
- Config/runtime/logging diagnostics route to `infra_worker`.
- `reviewer` and `explorer` are read-only roles.

## 6) Skill Assignment Policy
- `default` (Parent Orchestrator):
  - `openai-docs`, `skill-creator-master`, `skill-creator`, `skill-installer`,
  - `spec-sync-assistant`, `parent-dispatch-guard`, `feedback-promotion-governor`, `red-requirement-auditor`, `web-designer-master`
- `intake` (Parent Planner):
  - `openai-docs`, `parent-dispatch-guard`, `feedback-promotion-governor`, `red-requirement-auditor`, `web-designer-master`
- `release_manager` (Parent Gate):
  - `openai-docs`, `spreadsheet`, `turn-log-auditor`, `release-evidence-gate`,
  - `spec-sync-assistant`, `parent-dispatch-guard`, `feedback-promotion-governor`, `red-requirement-auditor`
- `frontend_worker` (Child): `playwright`, `screenshot`, `ui-regression-diff`
- `backend_worker` (Child): `openai-docs`, `pdf`, `spreadsheet`, `appserver-protocol-debugger`, `api-contract-testgen`
- `infra_worker` (Child): `openai-docs`, `skill-installer`, `windows-runtime-ops`
- `tester` (Child): `playwright`, `screenshot`, `spreadsheet`, `pdf`, `appserver-protocol-debugger`, `ui-regression-diff`, `api-contract-testgen`
- `reviewer` (Child, read-only): `openai-docs`, `turn-log-auditor`
- `explorer` (Child, read-only): `openai-docs`

## 7) Skill ID Consistency Rule
- Source of truth for skill IDs is `scripts/config/skill_catalog.json`.
- Use exact catalog IDs in prompts, dispatch, and policy checks.
- Do not invent alternate spellings in execution paths.
- Current canonical experiment ID is `skill-creator-master`.
- Historical references to `skill-creater-maseter` are legacy pre-migration references only.

## 8) Skill Routing Requirements
- Parent roles (`default`, `intake`, `release_manager`) should not execute specialist skill workflows directly when delegation is possible.
- Runtime agent selection must reject `worker`; it is retired from active routing and not configured in `.codex/config.toml`.
- The machine-readable governance contract may still retain `worker` metadata for bounded legacy audit compatibility, but normal execution and eval baselines must not target it.
- Parent delegation flow must invoke `$parent-dispatch-guard` before completing Step 2/4/5 when child dispatch is expected.
- Skill package create/update requests must invoke `$skill-creator-master` first; use `$skill-creator` only as fallback when unavailable.
- Feedback-driven tuning or self-improvement scope changes must invoke `$feedback-promotion-governor` before any session/global promotion.
- Requirement definition stays planning-mode-aware:
  - `FAST`: compact requirement lock plus acceptance-check confirmation
  - `NORMAL`: brief structured requirement lock plus explicit dispatch contract
  - `DISCOVERY`: full discovery gate with open questions, assumptions, and `EXTERNAL_ACTION_REQUIRED` stop behavior
- RBJ remains the requirement-definition quality backstop before dispatch when the selector keeps the task in a discovery-grade loop:
  - Blue draft -> Red audit (`$red-requirement-auditor`) -> Judge verdict.
- Red findings without `requirement_ref` must be discarded by Judge.
- Frontend verification requiring browser operation must use `playwright` (and optionally `screenshot`) through `frontend_worker` or `tester`.
- Stitch project/screen intake or Stitch accessibility checks must use `web-designer-master` and prefer authenticated Stitch connector/tool results over generic MCP resource listing or raw `curl`.
- Design-sensitive `web/` work must explicitly plan for:
  - benchmark comparison
  - desktop/mobile visual review
  - independent reviewer or tester verdict
- OpenAI API/platform behavior checks must use `openai-docs`.
- If an assigned skill is unavailable at runtime, report the gap explicitly and include a replacement plan.

## 9) Explicit Skill Invocation Requirements
- If a task matches an assigned skill, the parent must include the skill token explicitly in dispatch prompts.
- Child agents must acknowledge the explicit skill token and follow that skill workflow before fallback heuristics.
- Step 4 Parent Review treats missing explicit skill invocation as a process defect when relevant skills are available.
- Final reports should include a skill-usage ledger (`role -> $skill-name -> evidence`).

## 10) Missing-Skill Proposal Tracking
- Maintain missing/desired skill proposals in `docs/AGENT_SKILL_MATRIX.md`.
- If blocked by missing skill capability, include proposal ID and intended owner role in the final report.

## 11) QA and Release Gates

### 11.0 Terminal Business Decision States
- Top-level harness outcomes must use business decision states, not generic `COMPLETED`.
- Allowed terminal states are:
  - `RELEASE_APPROVED`
  - `RELEASE_APPROVED_WITH_ASSUMPTIONS`
  - `RELEASE_BLOCKED`
  - `EXTERNAL_ACTION_REQUIRED`
  - `HARNESS_FAILURE`
- Child task outcomes may still use the task taxonomy from `scripts/config/task_outcome_contract.json`.

### 11.1 Dynamic QA Gate for Over-Delivery
- If over-delivery adds logic (branches, timers, retries, fallback/error handling), Parent must dispatch `tester` to create/run dedicated automated tests.
- Any over-delivery artifact without dedicated test evidence must be marked `FAIL` by `release_manager`.
- Step 4 evidence is incomplete unless it includes dedicated test command and PASS output.

### 11.1A Explicit User-Granted Adjacent Improvement Rule
- This rule activates only when the user explicitly authorizes adjacent improvements beyond the baseline request.
- Parent may allow autonomous adjacent improvements only when they stay within the same touched subsystem, acceptance surface, or operator workflow already in scope.
- Do not reinterpret that permission as approval for unrelated cleanup, roadmap work, architecture churn, or independent feature expansion.
- Explicit user-decision clauses and narrow irreversible external actions still win. Boundary markers alone do not cancel autonomous adjacent improvements.
- Any adjacent improvement that adds or changes logic must carry dedicated tests or equivalent evidence.
- Final reporting must separate the baseline result from the user-authorized adjacent improvement result.

### 11.2 Auto-Documentation Gate (Step 5 Sync)
- Before Step 5 Final Report, update `docs/CURRENT_ARCHITECTURE.md` with baseline and over-delivery details, design intent, related tests, and current-state impact.
- Append a matching change entry to `docs/ARCHITECTURE_CHANGELOG.md`.
- Missing spec synchronization blocks release and prevents `RELEASE_APPROVED`.

### 11.3 Performance/Intent Rule
- Performance means maximizing user satisfaction, not only speed.
- Never trade away intent alignment for speed.

### 11.4 Design-Sensitive Completion Gate
- When the user asks for a site, page, visual redesign, or other judgment-heavy output, Parent Review must fail the turn unless:
  - the active taste memory or equivalent intent contract is present
  - the benchmark/reference target is named
  - visual evidence is present
  - independent review is present
- Missing any of the above is `FAILED_VALIDATION`, not a soft warning.


### 11.4 Intent-First Design Gate
- Design-facing work must use the design acceptance contract and active taste memory.
- `build/test/200` may never override a failed design acceptance review.
- When the task is benchmarked against another site or visual target, Step 4 must treat benchmark superiority as an explicit PASS/FAIL question.
- If a design-facing turn lacks screenshot evidence, reviewer involvement, or workspace lock, Parent Review should report `FAILED_VALIDATION` or `NEEDS_INPUT` instead of `COMPLETED`.

## 12) User-Facing Response Contract
- Substantive answers and final reports must optimize for reach precision on the asked question before conversational smoothness or expansion.
- Do not spend closing lines on next-step proposals, option menus, follow-up fishing, or sales-like prompts unless the user explicitly asked for them or the task is genuinely blocked.
- When information is incomplete but the gap is not fatal, state the assumption briefly and continue with the best answer; ask a confirmation question only when safety, an explicit user-decision clause, or correctness would otherwise be materially at risk.
- Surplus answer budget should go to:
  - issue decomposition
  - counterarguments / refutation
  - alternative-hypothesis comparison
  - exception and boundary-condition handling
- The four-part structure is the default high-precision standard for substantive user-facing answers:
  - `結論`
  - `根拠`
  - `限界/反論`
  - `実務上の意味`
- The default is not absolute. Override it when a task-specific structure improves reach precision, scanning speed, or error detection.
- Any override structure must still preserve the functional coverage of the default:
  - answer the asked point directly
  - expose the supporting basis
  - surface limits, objections, or uncertainty
  - make the practical implication clear
- Preferred overrides by task type:
  - short fact / direct status answer:
    - lead with the direct answer in one short paragraph or one line
    - include only the minimum caveat needed for correctness
  - code review / defect review:
    - findings first, ordered by severity, with file references
    - follow with assumptions, residual risks, or test gaps
    - summary is secondary and should stay brief
  - implementation / change report:
    - what changed
    - how it was verified
    - what remains unverified or risky
  - option comparison / decision support:
    - recommended option first
    - comparison axes and decisive tradeoffs next
    - disqualifiers or exception conditions after that
- blocked / explicit-decision or operator-escalation state:
  - blocking fact first
  - why it blocks correctness or safety
  - exact missing decision or artifact
- Do not mechanically emit section headers when they lower precision or make short answers heavier than the task warrants.
- The response should close in-place. Do not end by reopening the conversation unless required by task state.
