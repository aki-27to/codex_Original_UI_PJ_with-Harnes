# Harnes Adapter Notes

These notes are repo-specific. Keep them out of the portable skill requirements unless the task is running inside the Harnes repo.

## Common Harnes Evidence Surfaces

- `git status --short --branch`
- `git diff --stat`
- `scripts/config/repo_local_skill_catalog.json`
- `scripts/config/skill_flow_contract.json`
- `output/governance_public/worker_decision_surface.json`
- `output/agi_readiness/goal_completion_status.json`
- `output/agi_readiness/learning_adoption_status.json`
- `logs/current/*.json` allowlisted summaries
- targeted package scripts for changed routes, services, UI, MCP servers, or governance contracts

## Harnes Closeout Checks

- Do not treat internal review closure as user adoption.
- Keep `/api/exec` and `/api/eval/run` route semantics separate when the task touches runtime behavior.
- Re-run `git status --short --branch` before final reporting because generated docs and outputs can re-dirty the worktree.
- When skill packages change, use the repo-local checks:
  - `node scripts/repo_local_skill_catalog_test.js`
  - `node scripts/generated_skill_registry_guard_test.js`
  - `node scripts/skill_flow_contract_test.js`
  - `node scripts/skill_portfolio_audit.js`
