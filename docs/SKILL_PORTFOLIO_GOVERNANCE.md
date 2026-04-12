# SKILL_PORTFOLIO_GOVERNANCE

Updated: 2026-04-12

## 1) Goal

skill surface を無制限に増やさず、再利用価値のある procedure だけを curated portfolio に残します。

## 2) Sources of Truth

- skill catalog: `scripts/config/skill_catalog.json`
- portfolio policy: `scripts/config/skill_portfolio_policy.json`
- governance contracts: `scripts/config/agent_governance_contracts.json`

## 3) Skill Classes

- installed / external skill
- local curated skill
- generated candidate
- legacy compatibility artifact

## 4) Required Skill Metadata

- skill id
- owner role
- purpose
- entry condition
- evidence of usefulness
- lifecycle state
- stale / archive status

## 5) Promotion Rule

skill は、再現性・再利用性・品質非劣化・constitution/evaluator 非衝突が確認できた場合のみ昇格します。good note と good skill は同義ではありません。

## 6) Audit Rule

skill package change では `node scripts/skill_portfolio_audit.js` を evidence に含めます。
