# HARNESS_CONSTITUTION

Updated: 2026-03-08

## 1) Frozen Goal

This harness is an autonomy-first governed decision system for delegated execution.

Its primary goal is:

> Move ambiguous user requests into a governed, reviewable, replayable, evidence-backed, decisionable state while maximizing autonomous forward progress and minimizing unnecessary human interruption.

Important:
- Constitution conformance is the primary design goal.
- Raw Codex superiority is a secondary claim and must not be asserted without direct evidence.
- Mock-fixture evidence must never be represented as live parity evidence.

## 2) Harness Success vs Task Success

- Task Success:
  - the requested deliverable was created, changed, or validated correctly
- Harness Success:
  - the run reached a correct terminal business decision state

Allowed top-level terminal business decision states:
- `RELEASE_APPROVED`
- `RELEASE_APPROVED_WITH_ASSUMPTIONS`
- `RELEASE_BLOCKED`
- `EXTERNAL_ACTION_REQUIRED`
- `HARNESS_FAILURE`

`completed` may be used for child task status, but never as the run-level business outcome.

## 3) System Model

### 3.1 Three Planes

- Control Plane:
  - requirement framing
  - routing
  - dispatch
  - orchestration
  - aggregation
  - review coordination
  - release decision
- Work Plane:
  - specialist child execution
  - implementation
  - validation
  - exploration
- Assurance Plane:
  - evidence
  - reviewer findings
  - runtime proof
  - signoff bundle
  - release blockers, waivers, and residual risk

### 3.2 Actor Responsibilities

- Parent:
  - framing
  - routing
  - dispatch
  - aggregation
  - review coordination
  - release decision
  - signoff packaging
  - must not perform material implementation
- Child specialists:
  - material implementation
  - specialist execution
  - task-scoped validation
  - task outcome emission
- Reviewer / Tester:
  - findings
  - validation outputs
  - severity and coverage reporting
- Release Manager:
  - final release decision
  - signoff bundle
  - blocker and waiver handling

### 3.3 Material Implementation

Material implementation means repository changes that affect deliverable behavior, UI, API, infra posture, test behavior, or release posture.

Parent roles must not perform material implementation directly.

## 4) Fixed Phase Model

### Phase 1: Intake / Frame

Required artifact: `RequestFrame`

Minimum fields:
- `user_goal`
- `expected_deliverable`
- `constraints`
- `acceptance_criteria`
- `ambiguity_points`
- `risk_class`
- `external_dependencies`
- `assumption_policy`
- `requested_release_posture`

### Phase 2: Route / Plan

Required artifact: `RoutingDecision`

Minimum fields:
- `lane`
- `planning_depth`
- `assurance_depth`
- `dispatch_graph`
- `agent_assignments`
- `required_evidence_classes`
- `review_requirements`
- `routing_rationale`
- `planning_score`
- `assurance_score`

### Phase 3: Execute

Required artifact: `TaskOutcome[]`

Minimum fields:
- `task_id`
- `actor`
- `status`
- `claimed_work`
- `changed_artifacts`
- `evidence_refs`
- `unresolved_items`
- `acceptance_coverage`
- `handoff_readiness`

### Phase 4: Aggregate / Review

Required artifact: `ReviewBundle`

Minimum fields:
- `acceptance_coverage_matrix`
- `reviewer_findings`
- `severity`
- `residual_risk`
- `missing_evidence`
- `pass_fail_per_criterion`
- `recommended_release_state`

### Phase 5: Release / Close

Required artifact: `ReleaseDecision`

Minimum fields:
- `terminal_state`
- `rationale`
- `signoff_refs`
- `blocker_list`
- `waived_risks`
- `remaining_conditions`
- `replay_bundle_refs`

## 5) Lane and Depth Model

### 5.1 Lane Model

- `DELIVERY`
  - create, change, and validate the requested deliverable
- `DISCOVERY`
  - reduce ambiguity and produce a decisionable framing

`DISCOVERY` is a first-class lane, not a degraded form of delivery.

`DISCOVERY` minimum outputs:
- `open_questions`
- `assumptions`
- `candidate_hypotheses`
- `disconfirming_evidence`
- `decision_boundary`
- `non_goals`
- `recommended_next_path`
- `confidence_rationale`

### 5.2 Planning Depth

- `FAST_PLANNING`
- `STANDARD_PLANNING`
- `DISCOVERY_PLANNING`

### 5.3 Assurance Depth

- `LIGHT_ASSURANCE`
- `STANDARD_ASSURANCE`
- `SIGNOFF_ASSURANCE`

### 5.4 Routing Policy

Depth selection must be machine-readable policy output.

`PlanningScore = ambiguity + acceptance_uncertainty + novelty + external_dependency`

Each factor is scored `0/1/2` and must retain rationale.

- `0-2 => FAST_PLANNING`
- `3-5 => STANDARD_PLANNING`
- `6-8 => DISCOVERY_PLANNING`

`AssuranceScore = blast_radius + irreversibility + release_criticality + evidence_burden`

Each factor is scored `0/1/2` and must retain rationale.

- `0-2 => LIGHT_ASSURANCE`
- `3-5 => STANDARD_ASSURANCE`
- `6-8 => SIGNOFF_ASSURANCE`

## 6) Frozen Posture and Non-Negotiables

The following may only be preserved or strengthened:

- `requestUserInputPolicy = autonomy_first`
- `parentDispatchGuard = enforce`
- retired worker remains legacy-only
- turn contract and task outcome contract remain separate
- evidence-first
- signoff-first
- parent does not perform material implementation
- `RoutingDecision` exists before child execution
- top-level run state uses terminal business decision states

## 7) Critical Invariants

### Control Invariants

1. Parent must not perform material implementation.
2. Every material change must map to a dispatched child task.
3. `RoutingDecision` must exist before child execution.
4. Retired worker must not be used in normal runtime.

### Execution Invariants

5. Heuristic approval-boundary markers alone must not force interruption; only explicit user-decision clauses or narrow irreversible external actions may escalate to operator input.
6. No child task may complete without `TaskOutcome`.
7. `DELIVERY` runs must carry evidence for each material claim.
8. `DISCOVERY` runs must emit assumptions, open questions, and decision boundary.

### Assurance Invariants

9. No release decision without `ReviewBundle`.
10. No signoff release without required evidence classes.
11. Assurance depth requirements must be satisfied.
12. Top-level terminal state must be a decision state, not generic completed.

### Audit Invariants

13. Replay lineage must be reconstructible.
14. Blockers and residual risks must be explicit.
15. Acceptance coverage must be inspectable.

## 8) Source-of-Truth Hierarchy

Truth precedence:

1. Constitution / design authority
2. Machine-readable contracts
3. Policy code / enforcement
4. Agent configuration
5. Runtime proof artifacts
6. Narrative docs

If narrative docs disagree with contracts, policy, or runtime truth, the docs must be corrected.

## 9) Evidence and Claims

- Pass claims require executable evidence or generated artifacts.
- Live transport parity is not proven by mock-fixture runs.
- Raw Codex superiority is not proven without direct comparison evidence.
- Signoff-grade claims require `ReviewBundle`, `ReleaseDecision`, and evidence completeness.

## 10) Operator View

Every governed run must expose a machine-readable operator summary with at least:

- `current_phase`
- `current_lane`
- `planning_depth`
- `assurance_depth`
- `dispatch_graph`
- `current_blockers`
- `evidence_completeness`
- `residual_risk`
- `release_state`
- `violated_invariants`
- `remaining_conditions_to_release`
