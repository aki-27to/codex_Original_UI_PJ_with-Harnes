# AGENT_OPERATING_RULES

Updated: 2026-03-06

## 1) Scope
This document contains tier-1 operating rules referenced by `AGENTS.md`.
- It expands execution policy only; `AGENTS.md` remains the tier-0 constitution.
- If this document and machine-readable config disagree on skill IDs or assignments, `scripts/config/skill_catalog.json` wins.

## 2) Hierarchical Flow (5-Step)
- System model: one Parent Orchestrator + specialist Children.
- Parent duties:
  - Step 1 `Requirement Understanding`: lock explicit goal + over-delivery scope.
  - Step 2 `Planning and Dispatch`: split tasks, assign specialists, define acceptance checks.
  - Step 4 `Parent Review`: validate child outcomes against baseline and over-delivery criteria.
  - Step 5 `Final Report`: report baseline result + added value + residual risks.
- Child duties:
  - Step 3 `Specialist Execution`: execute assigned tasks with evidence.

## 3) Role Routing
- `default` (Parent Orchestrator): controls the 5-step flow and delegation.
- `intake` (Parent Planner): requirement contract + dispatch matrix.
- `release_manager` (Parent Gate): final review loop + release decision.
- `frontend_worker` (Child): `web/` UI/UX and browser behavior.
- `backend_worker` (Child): `server.js`, `scripts/`, protocol/API behavior.
- `infra_worker` (Child): `.codex/`, launch/runtime/logging/operational reliability.
- `worker` (Child fallback): cross-cutting implementation outside FE/BE/Infra specialization.
- `tester` (Child): executable verification and user-journey checks.
- `reviewer` (Child): independent defect/risk review.
- `explorer` (Child, read-only): uncertainty reduction and repository fact-finding.

## 4) Tool/MCP Assignment Policy
- Browser-centric tooling (for example Playwright/screenshot) routes to `frontend_worker`.
- Protocol/runtime/API checks route to `backend_worker`.
- Config/runtime/logging diagnostics route to `infra_worker`.
- `reviewer` and `explorer` are read-only roles.

## 5) Skill Assignment Policy
- `default` (Parent Orchestrator):
  - `openai-docs`, `skill-creator-master`, `skill-creator`, `skill-installer`,
  - `spec-sync-assistant`, `parent-dispatch-guard`, `feedback-promotion-governor`, `red-requirement-auditor`
- `intake` (Parent Planner):
  - `openai-docs`, `parent-dispatch-guard`, `feedback-promotion-governor`, `red-requirement-auditor`
- `release_manager` (Parent Gate):
  - `openai-docs`, `spreadsheet`, `turn-log-auditor`, `release-evidence-gate`,
  - `spec-sync-assistant`, `parent-dispatch-guard`, `feedback-promotion-governor`, `red-requirement-auditor`
- `frontend_worker` (Child): `playwright`, `screenshot`, `ui-regression-diff`
- `backend_worker` (Child): `openai-docs`, `pdf`, `spreadsheet`, `appserver-protocol-debugger`
- `infra_worker` (Child): `openai-docs`, `skill-installer`
- `worker` (Child fallback): `openai-docs`, `pdf`, `spreadsheet`, `playwright`, `screenshot`, `blender-pro-character-pipeline`
- `tester` (Child): `playwright`, `screenshot`, `spreadsheet`, `pdf`, `appserver-protocol-debugger`, `ui-regression-diff`
- `reviewer` (Child, read-only): `openai-docs`, `turn-log-auditor`
- `explorer` (Child, read-only): `openai-docs`

## 6) Skill ID Consistency Rule
- Source of truth for skill IDs is `scripts/config/skill_catalog.json`.
- Use exact catalog IDs in prompts, dispatch, and policy checks.
- Do not invent alternate spellings in execution paths.
- Current canonical experiment ID is `skill-creator-master`.
- Historical references to `skill-creater-maseter` are legacy pre-migration references only.

## 7) Skill Routing Requirements
- Parent roles (`default`, `intake`, `release_manager`) should not execute specialist skill workflows directly when delegation is possible.
- Parent delegation flow must invoke `$parent-dispatch-guard` before completing Step 2/4/5 when child dispatch is expected.
- Skill package create/update requests must invoke `$skill-creator-master` first; use `$skill-creator` only as fallback when unavailable.
- Feedback-driven tuning or self-improvement scope changes must invoke `$feedback-promotion-governor` before any session/global promotion.
- Requirement definition must run RBJ before Step 2 dispatch:
  - Blue draft -> Red audit (`$red-requirement-auditor`) -> Judge verdict.
- Red findings without `requirement_ref` must be discarded by Judge.
- Frontend verification requiring browser operation must use `playwright` (and optionally `screenshot`) through `frontend_worker` or `tester`.
- OpenAI API/platform behavior checks must use `openai-docs`.
- If an assigned skill is unavailable at runtime, report the gap explicitly and include a replacement plan.

## 8) Explicit Skill Invocation Requirements
- If a task matches an assigned skill, the parent must include the skill token explicitly in dispatch prompts.
- Child agents must acknowledge the explicit skill token and follow that skill workflow before fallback heuristics.
- Step 4 Parent Review treats missing explicit skill invocation as a process defect when relevant skills are available.
- Final reports should include a skill-usage ledger (`role -> $skill-name -> evidence`).

## 9) Missing-Skill Proposal Tracking
- Maintain missing/desired skill proposals in `docs/AGENT_SKILL_MATRIX.md`.
- If blocked by missing skill capability, include proposal ID and intended owner role in the final report.

## 10) QA and Release Gates

### 10.1 Dynamic QA Gate for Over-Delivery
- If over-delivery adds logic (branches, timers, retries, fallback/error handling), Parent must dispatch `tester` to create/run dedicated automated tests.
- Any over-delivery artifact without dedicated test evidence must be marked `FAIL` by `release_manager`.
- Step 4 evidence is incomplete unless it includes dedicated test command and PASS output.

### 10.2 Auto-Documentation Gate (Step 5 Sync)
- Before Step 5 Final Report, update `docs/SYSTEM_ARCHITECTURE.md` (or equivalent) with baseline and over-delivery details, design intent, and related tests.
- Missing spec synchronization blocks `COMPLETED`.

### 10.3 Performance/Intent Rule
- Performance means maximizing user satisfaction, not only speed.
- Never trade away intent alignment for speed.
