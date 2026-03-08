# SKILL_PORTFOLIO_GOVERNANCE

Updated: 2026-03-06

## 1) Goal

Avoid monotonic improvement patterns by treating skill development as a portfolio:
- keep enough generic capability to stay reusable,
- keep enough partial capability to stay task-effective,
- promote only with evidence.

## 2) Sources of Truth

- Policy: `scripts/config/skill_portfolio_policy.json`
- Catalog: `scripts/config/skill_catalog.json`
- Audit CLI: `scripts/skill_portfolio_audit.js`
- Validator library: `scripts/lib/skill_portfolio_policy.js`
- Human-facing summaries in `docs/AGENT_OPERATING_RULES.md` and `docs/AGENT_SKILL_MATRIX.md` must mirror this policy + catalog state, but config remains canonical.

## 3) Skill Classes

- `global (G)`: broad capability used across domains.
- `role (R)`: reusable capability inside a role family.
- `scenario (S)`: focused capability for recurring narrow tasks.
- `experiment (E)`: trial capability that is not yet promoted.

Coverage label:
- `generic`: broad intent.
- `semi_generic`: role-bounded but reusable.
- `partial`: narrow intent.

## 4) Required Skill Metadata

Every cataloged skill must declare:
- `class`
- `coverage`
- `ownerRoles`
- `intent`
- `primaryMetric`
- `guardMetrics`
- `maturity`

## 5) Promotion Pipeline

1. `S -> R`:
   - `runs >= 6`
   - `successRate >= 0.84`
   - `avgPrimaryScore >= 0.80`
   - `guardFailures <= 0`
2. `R -> G`:
   - `runs >= 12`
   - `successRate >= 0.90`
   - `avgPrimaryScore >= 0.87`
   - `guardFailures <= 0`
3. Guard hard stop:
   - when `blockPromotionOnGuardFailure` is enabled, any guard failure blocks promotion.

## 6) Operational Workflow

1. Update assignment or skill metadata in `scripts/config/skill_catalog.json`.
2. Run:

```bash
node scripts/skill_portfolio_audit.js
```

3. If using outcome evidence, append JSONL events to:
- `logs/skill_outcomes.jsonl`

Event format:

```json
{"skill":"ui-regression-diff","result":"pass","primaryScore":0.91,"guardPass":true}
```

4. Re-run audit and check promotion candidates.
5. Reflect accepted promotions by changing the skill class in catalog.
6. If assignments or package names changed, sync the human docs in the same change set.

## 7) Release Gate Rule

Any task that changes skill assignments or skill packages is incomplete unless:
- audit result is `PASS`,
- classification diversity and ratio checks pass,
- missing-skill proposals are tracked if unresolved.
