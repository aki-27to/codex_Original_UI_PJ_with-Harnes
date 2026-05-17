# Harnes Adapter Notes

These notes are repo-specific. Keep them out of the portable skill requirements unless the task is running inside the Harnes repo.

## Common Harnes Skill Governance Surfaces

- `scripts/config/repo_local_skill_catalog.json`
- `scripts/config/skill_flow_contract.json`
- `scripts/config/skill_portfolio_policy.json`
- `scripts/config/generated_skill_registry.json`
- `scripts/config/correction_learning_contract.json`
- `logs/skill_outcomes.jsonl`
- `.agents/skills/`
- `.agents/old-skills/`
- `plugins/<plugin-name>/skills/`

## Harnes Checks

- `node scripts/repo_local_skill_catalog_test.js`
- `node scripts/generated_skill_registry_guard_test.js`
- `node scripts/skill_flow_contract_test.js`
- `node scripts/skill_design_review_analyzer_test.js`
- `node scripts/skill_portfolio_audit.js`

## Harnes Migration Rule

When a repo-local skill is replaced by a plugin distribution copy, point the active catalog entry at `plugins/<plugin>/skills/<skill>/SKILL.md`, move the former active `.agents/skills/<skill>` package into `.agents/old-skills/<skill>`, and verify that the active duplicate no longer exists.
