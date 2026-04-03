# AGI Claim Closure Runbook

## Purpose
- Prepare the system for internal claim closure review without conflating synthetic evidence, observed human evidence, and external audit evidence.

## Commands
- `node scripts/run_claim_closure_program.js all`
- `node scripts/run_externalization_nohitl.js full`
- `node scripts/run_externalization_nohitl.js no-hitl-analyze`
- `node scripts/run_externalization_nohitl.js human-export`
- `node scripts/run_externalization_nohitl.js human-import --file <path>`
- `node scripts/run_externalization_nohitl.js audit-export --mode blackbox`
- `node scripts/run_externalization_nohitl.js audit-import --file <path>`
- `node scripts/run_externalization_nohitl.js deployment-import --file <path>`
- `node scripts/run_externalization_nohitl.js claim-recompute`
- `node scripts/externalization_nohitl_e2e_test.js`
- `node scripts/run_claim_closure_program.js phase11`
- `node scripts/run_claim_closure_program.js phase12`
- `node scripts/run_claim_closure_program.js phase13`
- `node scripts/run_claim_closure_program.js phase14`
- `node scripts/run_claim_closure_program.js phase15`
- `node scripts/run_claim_closure_program.js phase16`
- `node scripts/run_claim_closure_program.js phase17`
- `node scripts/claim_closure_program_e2e_test.js`

## Output Roots
- `output/claim_closure/phase11`: human trial packets, adjudication packet, observed template, mock import report
- `output/claim_closure/phase12`: external audit import fixtures and report
- `output/external_review_pack/*`: sealed audit packs
- `output/claim_closure/phase13`: open-world and long-duration reports
- `output/claim_closure/phase14`: knowledge/retrieval/secrets report
- `output/claim_closure/phase15`: adaptation and tool learning report
- `output/claim_closure/phase16`: safety and deployment report
- `output/claim_closure/phase17`: unified final report and claim closure gate

## Evidence Separation
- `observationKind=human_observed` is reserved for real human trials.
- `observationKind=mock_fixture` is test-only and must not be promoted into public claim readiness.
- `observationKind=synthetic` remains a scaffold and is a public claim blocker.
- External audit packs are generated separately from external audit result imports.

## Claim Semantics
- `claimGateState` reflects internal readiness progression.
- `publicClaimState` remains blocked until observed human baseline, external audit execution, and production-grade secret/deployment evidence are present.
- externalization layer recomputes a stricter gap report in `output/externalization_nohitl/claim_gap_report.json`.

## No-HITL Notes
- non-interactive profile is defined in `scripts/config/non_interactive_execution_profile.json`.
- machine-readable blocked reasons are defined in `scripts/config/no_hitl_blocked_reason_taxonomy.json`.
- external-only evidence should resolve to `EXTERNAL_EVIDENCE_PENDING` rather than an interactive prompt.

## Freeze / Kill Expectations
- Freeze mode blocks `self_improvement`, `multi_agent_delegation`, `adaptation_job`, and `tool_adoption`.
- Read-only degraded mode is written to `logs/archive/raw/deployment_controls/degraded_mode_state.json`.
