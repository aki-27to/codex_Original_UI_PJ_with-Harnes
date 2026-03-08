# AGENT_SKILL_MATRIX

Updated: 2026-03-06

## 0) Skill ID Consistency

- The single source of truth for skill IDs is `scripts/config/skill_catalog.json`.
- This document is a human-facing summary of catalog/policy state, not an alternate source of truth.
- Dispatch prompts, policy checks, and audit evidence must use exact catalog IDs.
- Current canonical experiment ID is `skill-creator-master`.
- Historical references to `skill-creater-maseter` are legacy pre-migration references only.
- Any rename (for example typo cleanup) must be executed as a catalog + policy + skill-package migration in one change set.

## 1) Classification Model

| Class | Alias | Coverage | Meaning |
|---|---|---|---|
| `global` | `G` | generic | Reusable foundation capability across roles and domains. |
| `role` | `R` | semi-generic | Reusable within a role family (parent, frontend, backend, infra, QA). |
| `scenario` | `S` | partial | Narrow, context-specific capability for recurring task patterns. |
| `experiment` | `E` | partial | Trial capability under observation before promotion. |

Policy source of truth:
- `scripts/config/skill_portfolio_policy.json`
- `scripts/config/skill_catalog.json`

## 2) Role Assignment Summary

| Role | Assigned Skills | Class Mix | Requirement Check |
|---|---|---|---|
| `default` | `openai-docs`, `skill-creator-master`, `skill-creator`, `skill-installer`, `spec-sync-assistant`, `parent-dispatch-guard`, `feedback-promotion-governor`, `red-requirement-auditor` | `G:1 / R:6 / S:0 / E:1` | PASS |
| `intake` | `openai-docs`, `parent-dispatch-guard`, `feedback-promotion-governor`, `red-requirement-auditor` | `G:1 / R:3 / S:0 / E:0` | PASS |
| `release_manager` | `openai-docs`, `spreadsheet`, `turn-log-auditor`, `release-evidence-gate`, `spec-sync-assistant`, `parent-dispatch-guard`, `feedback-promotion-governor`, `red-requirement-auditor` | `G:1 / R:5 / S:2 / E:0` | PASS |
| `frontend_worker` | `playwright`, `screenshot`, `ui-regression-diff` | `G:0 / R:1 / S:2 / E:0` | PASS |
| `backend_worker` | `openai-docs`, `pdf`, `spreadsheet`, `appserver-protocol-debugger` | `G:1 / R:0 / S:3 / E:0` | PASS |
| `infra_worker` | `openai-docs`, `skill-installer` | `G:1 / R:1 / S:0 / E:0` | PASS |
| `worker` | `openai-docs`, `pdf`, `spreadsheet`, `playwright`, `screenshot`, `blender-pro-character-pipeline` | `G:1 / R:1 / S:4 / E:0` | PASS |
| `tester` | `playwright`, `screenshot`, `spreadsheet`, `pdf`, `appserver-protocol-debugger`, `ui-regression-diff` | `G:0 / R:1 / S:5 / E:0` | PASS |
| `reviewer` | `openai-docs`, `turn-log-auditor` | `G:1 / R:0 / S:1 / E:0` | PASS |
| `explorer` | `openai-docs` | `G:1 / R:0 / S:0 / E:0` | PASS |

## 3) Skill Metadata Registry

| Skill | Class | Coverage | Primary Metric | Guard Metric |
|---|---|---|---|---|
| `openai-docs` | `global` | `generic` | `citation_validity_rate >= 0.98` | `unverified_claim_rate <= 0.02` |
| `skill-creator` | `role` | `semi_generic` | `skill_adoption_rate >= 0.75` | `skill_rework_rate <= 0.25` |
| `skill-installer` | `role` | `semi_generic` | `install_success_rate >= 0.95` | `broken_install_rate <= 0.03` |
| `spec-sync-assistant` | `role` | `semi_generic` | `spec_sync_completion_rate >= 0.95` | `spec_code_mismatch_rate <= 0.05` |
| `release-evidence-gate` | `role` | `semi_generic` | `gate_decision_precision >= 0.93` | `false_pass_rate <= 0.02` |
| `parent-dispatch-guard` | `role` | `semi_generic` | `dispatch_success_before_completion_rate >= 0.95` | `silent_parent_no_dispatch_rate <= 0.02` |
| `feedback-promotion-governor` | `role` | `semi_generic` | `root_improvement_promotion_precision >= 0.90` | `local_overfit_promotion_rate <= 0.08` |
| `red-requirement-auditor` | `role` | `semi_generic` | `requirement_clarity_gain >= 0.88` | `untraceable_finding_rate <= 0.08` |
| `playwright` | `role` | `semi_generic` | `ui_flow_repro_rate >= 0.92` | `flaky_run_rate <= 0.10` |
| `turn-log-auditor` | `scenario` | `partial` | `log_defect_detection_rate >= 0.90` | `false_alarm_rate <= 0.10` |
| `screenshot` | `scenario` | `partial` | `evidence_capture_success_rate >= 0.95` | `sensitive_data_capture_rate <= 0.01` |
| `ui-regression-diff` | `scenario` | `partial` | `regression_detection_recall >= 0.90` | `false_regression_rate <= 0.12` |
| `pdf` | `scenario` | `partial` | `pdf_task_success_rate >= 0.92` | `layout_regression_rate <= 0.08` |
| `spreadsheet` | `scenario` | `partial` | `sheet_transform_accuracy >= 0.95` | `formula_breakage_rate <= 0.05` |
| `appserver-protocol-debugger` | `scenario` | `partial` | `protocol_issue_resolution_rate >= 0.90` | `regression_reopen_rate <= 0.07` |
| `blender-pro-character-pipeline` | `scenario` | `partial` | `character_quality_gate_pass_rate >= 0.86` | `export_fidelity_regression_rate <= 0.08`, `robotic_motion_detection_rate <= 0.12` |
| `web-designer-master` | `experiment` | `partial` | `design_acceptance_rate >= 0.70` | `ux_regression_rate <= 0.15` |
| `skill-creator-master` | `experiment` | `partial` | `prototype_to_adoption_rate >= 0.50` | `operator_confusion_rate <= 0.20` |

## 4) Portfolio Ratio Gate (Current Baseline)

Audit command:

```bash
node scripts/skill_portfolio_audit.js
```

Current baseline from audit:
- Exposure total: `44`
- `global`: `18.2%`
- `role`: `40.9%`
- `scenario`: `38.6%`
- `experiment`: `2.3%`
- Diversity: `4/3` classes -> PASS

## 5) Promotion Rules

- `scenario -> role`: min runs `6`, success rate `>= 0.84`, average primary score `>= 0.80`, guard failures `<= 0`
- `role -> global`: min runs `12`, success rate `>= 0.90`, average primary score `>= 0.87`, guard failures `<= 0`
- If `blockPromotionOnGuardFailure=1`, any guard failure blocks promotion.

Outcome evidence format (`logs/skill_outcomes.jsonl`, one JSON per line):
- `skill`
- `result` (example: `pass` or `fail`)
- `primaryScore` (`0..1`)
- `guardPass` (`true` or `false`)

## 6) Desired but Missing Skills

| Proposal ID | Desired Skill | Desired Class | Intended Owner | Needed Capability |
|---|---|---|---|---|
| `MS-005` | `windows-runtime-ops` | `scenario` | `infra_worker` | Windows-specific process/port/service/permission diagnostics and recovery playbooks. |
| `MS-007` | `api-contract-testgen` | `scenario` | `backend_worker`, `tester` | API contract test generation from route definitions and expected schema behavior. |

## 7) Implemented from Missing-Skill Proposals

Implemented in repository on 2026-02-23:
- `MS-001` -> `skills/red-requirement-auditor/` + requirement RBJ loop policy
- `MS-002` -> `skills/appserver-protocol-debugger/`
- `MS-003` -> `skills/turn-log-auditor/`
- `MS-004` -> `skills/release-evidence-gate/`
- `MS-006` -> `skills/ui-regression-diff/`
- `MS-008` -> `skills/spec-sync-assistant/`

## 8) Operational Rules

- If a task is blocked by missing skill capability, report the proposal ID and continue with best-effort fallback.
- Skill package create/update requests must invoke `$skill-creator-master` first; `$skill-creator` is fallback when unavailable.
- Requirement-definition planning should invoke `$red-requirement-auditor` in RBJ flow before implementation dispatch.
- If assignments or skill packages change, run `node scripts/skill_portfolio_audit.js` and require `PASS`.
