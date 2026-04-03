# Remaining Program Runbook

## Scope
- Phase 5: broad readiness evals across public / hidden holdout / blackbox lanes
- Phase 6: versioned knowledge, retrieval, generated skills, tool registry
- Phase 7: failure clustering, curriculum, champion / challenger
- Phase 8: model routing, adaptation dataset packaging, safe tool adoption
- Phase 9: autonomy risk policy, blocked high-risk actions, deployment controls
- Phase 10: readiness board, claim gate, external audit bundle

## Commands
- `node scripts/run_remaining_program.js phase5`
- `node scripts/run_remaining_program.js phase6`
- `node scripts/run_remaining_program.js phase7`
- `node scripts/run_remaining_program.js phase8`
- `node scripts/run_remaining_program.js phase9`
- `node scripts/run_remaining_program.js phase10`
- `node scripts/run_remaining_program.js all`
- `node scripts/remaining_program_e2e_test.js`

## Outputs
- `output/agi_readiness/phase5/agi_readiness_public_latest.json`
- `output/agi_readiness/phase5/agi_readiness_holdout_latest.json`
- `output/agi_readiness/phase5/blackbox_readiness_latest.json`
- `output/agi_readiness/phase5/agi_readiness_scorecard.json`
- `output/agi_readiness/phase6/phase6_knowledge_skill_report.json`
- `output/agi_readiness/phase7/failure_clusters.json`
- `output/agi_readiness/phase7/curriculum.json`
- `output/agi_readiness/phase8/phase8_routing_adaptation_report.json`
- `output/agi_readiness/phase9/phase9_safety_governance_report.json`
- `output/agi_readiness/phase10/unified_readiness_report.json`
- `output/agi_readiness/phase10/claim_gate.json`
- `output/external_audit_bundle/*`

## Eval Lanes
- `public_regression`: existing compatibility gate
- `hidden_holdout`: protected compatibility lane
- `agi_readiness_public`: broad public readiness family coverage
- `agi_readiness_holdout`: protected broad holdout lane
- `blackbox_readiness`: protected blackbox lane kept out of normal optimization

## Knowledge / Skills
- Knowledge store root: `logs/archive/raw/knowledge_store`
- Generated skills root: `.agents/skills/generated`
- Tool registry runtime state: `logs/archive/raw/knowledge_store/tool_registry_state.json`

## Safety / Claim Gate
- Risk policy: `scripts/config/autonomy_risk_policy.json`
- Claim gate thresholds: `scripts/config/agi_claim_gate_policy.json`
- Claim recommendation is advisory only and does not bypass holdout, blackbox, or observed human-baseline requirements.
- Current scaffold emits `PARTIAL_READINESS` or `NOT_READY` until real human baselines and stronger held-out performance are available.
