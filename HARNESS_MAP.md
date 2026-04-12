# HARNESS_MAP

Authority role: `navigation / entrypoint only`  
Authority registry: `authority-registry.v1`

Updated: 2026-04-12

## Single-Harness Plane Doc

- `docs/SINGLE_HARNESS_MULTI_PLANE.md`
  - single governed harness identity
  - execution / evaluation / monitoring / governance plane model
  - trust boundary and protected eval asset policy

## Current Truth Hierarchy

- `output/governance_public/worker_decision_surface.json`
  - headline current truth
  - scope: `worker_decision`
  - fields: `topLevelOutcome`, `topLevelSummary`, `adoptionReadiness`, `latentIntentAlignment`, `minimalHitl`, `operatorAction`
- `output/agi_readiness/goal_completion_status.json`
  - supporting program-readiness surface
  - scope: `program_readiness`
- `output/agi_readiness/subjective_goal_completion_status.json`
  - supporting subjective companion gate
  - scope: `subjective_companion`
- `output/agi_readiness/compatibility_completion_status.json`
  - supporting compatibility layer
  - scope: `compatibility_layer`
- `output/governance_public/adoption_readiness_eval.json`
  - supporting adoption-readiness evaluator
- `output/governance_public/iteration_decision.json`
  - supporting iteration / operator-action gate
- `output/externalization_nohitl/no_hitl_analysis.json`
  - supporting minimal-HITL and no-HITL constraint summary
- `output/agi_readiness/sovereign_goal_completion_status.json`
  - legacy compatibility alias only
  - not active headline semantics

## 1) 目的と読み順

このファイルは、front-door README のあとに読む operator map です。

- front-door identity と quick posture は README.md
- docs の入口と authority map は docs/README.md
- active overview-first guide は docs/human/AI_AGENT_HARNESS_DETAILED_DESIGN.html
- product-facing summary は docs/DEMO_FLOWS.md、docs/CAPABILITY_SURFACE.md、docs/BUYER_PAIN_MAP.md、docs/PRODUCT_POSITIONING.md、docs/COMPARISON_BOUNDARY.md、docs/PROVIDER_AND_PORTABILITY.md
- single-source authority precedence は scripts/config/authority_registry.json
- human-facing rule は policy docs
- machine-readable truth は contracts
- proof / signoff artifact は execution evidence

推奨読み順:

1. README.md
2. docs/human/AI_AGENT_HARNESS_DETAILED_DESIGN.html
3. docs/README.md
4. docs/BEGINNER_PATH.md
5. docs/DEMO_FLOWS.md
6. docs/CAPABILITY_SURFACE.md
7. docs/BUYER_PAIN_MAP.md
8. docs/PRODUCT_POSITIONING.md
9. docs/COMPARISON_BOUNDARY.md
10. docs/PROVIDER_AND_PORTABILITY.md
11. AGENTS.md
12. docs/AGENT_OPERATING_RULES.md
13. docs/CURRENT_ARCHITECTURE.md
14. docs/HARNESS_APP_PLATFORM.md
15. docs/EVIDENCE_CONTRACT.md

## 2) layer map

- Tier-0 / authority order
  - docs/HARNESS_CONSTITUTION.md
  - AGENTS.md
  - docs/CURRENT_ARCHITECTURE.md
  - docs/EVIDENCE_CONTRACT.md
  - scripts/config/authority_registry.json
- Tier-1 / operating policy
  - docs/AGENT_OPERATING_RULES.md
  - docs/HARNESS_APP_PLATFORM.md
  - docs/APP_SERVER_PROTOCOL_RUNBOOK.md
  - docs/CONTEXT_MEMORY_POLICY.md
  - docs/SKILL_PORTFOLIO_GOVERNANCE.md
- current architecture / change history
  - docs/CURRENT_ARCHITECTURE.md
  - docs/ARCHITECTURE_CHANGELOG.md
- machine-readable contracts
  - scripts/config/*
- runtime evidence / proof / signoff
  - logs/current/
  - logs/bundles/
  - logs/archive/
  - docs/HARNESS_LOGGING_MAP.md

## 3) parent と child の責務

- parent orchestrator
  - requirement lock
  - planning mode selection
  - dispatch contract fixation
  - child evidence review
  - final outcome と residual risk report
- child specialist
  - owned path のみ実行
  - reproducible evidence を返す
  - review / test work は分離する

## 4) normal run の流れ

1. requirement structuring
2. dispatch planning
3. specialist execution
4. quality gate
5. final outcome

live runtime `requestUserInputPolicy=auto-default`
strict `proof` / `repro` / `conversation-app-server` lanes pin `requestUserInputPolicy=blocked`

現在の state を見る主な場所:

- docs/CURRENT_ARCHITECTURE.md
- logs/current/operator_summary.json
- logs/current/latest_run_summary.json
- logs/current/review_load_breakdown.json
- output/agi_readiness/
- output/memory_public/
- output/continuity_public/

## 5) ひとことで言うと

README が product の顔、docs/README が文書導線、HARNESS_MAP が operator の読み順です。
