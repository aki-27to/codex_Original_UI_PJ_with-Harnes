# Docs README

Authority role: `navigation / entrypoint only`  
Authority registry: `authority-registry.v1`

This page is the docs entrypoint. It exists to answer one question quickly:

`Which document should I read next for the job I am trying to do?`

If you are new here, do not start by reading everything. Start from:

1. `../README.md`
2. `BEGINNER_PATH.md`
3. `DEMO_FLOWS.md`
4. `CAPABILITY_SURFACE.md`
5. `BUYER_PAIN_MAP.md`
6. `PRODUCT_POSITIONING.md`
7. `COMPARISON_BOUNDARY.md`
8. `PROVIDER_AND_PORTABILITY.md`
9. `HARNESS_CONSTITUTION.md`
10. `../AGENTS.md`
11. `CURRENT_ARCHITECTURE.md`

That order gives you:

1. product identity
2. five-minute operator path
3. fixed demo jobs
4. visible capability breadth
5. buyer pain translation
6. market/category framing
7. comparison guardrail
8. honest portability posture
9. frozen authority and mission
10. runtime execution constraints
11. active technical shape

## Canonical Authority

- `HARNESS_CONSTITUTION.md`
  - single supreme frozen constitution
- `../AGENTS.md`
  - operational constitution / runtime behavior constraints
- `CURRENT_ARCHITECTURE.md`
  - active design spec
- `EVIDENCE_CONTRACT.md`
  - proof contract truth
- `../scripts/config/authority_registry.json`
  - authority precedence and drift markers

Use this section when the question is:

- what is fixed
- what is allowed to move
- what counts as truth

## Operational Runbooks

- `AGENT_OPERATING_RULES.md`
- `APP_SERVER_PROTOCOL_RUNBOOK.md`
- `CONTEXT_MEMORY_POLICY.md`
- `SELF_IMPROVEMENT_POLICY.md`
- `SKILL_PORTFOLIO_GOVERNANCE.md`

Use this section when the question is:

- how the harness should run
- how memory is handled
- how self-improvement is gated
- how operational routines work in practice

## Overview Guides

- `AI_AGENT_HARNESS_DETAILED_DESIGN.html`
  - active overview-first guide for understanding what this worker is
- `archive/AI_AGENT_HARNESS_TEXTBOOK_JA.html`
  - older long-form Japanese textbook kept as archive material

Use this section when the question is:

- what this AI agent is in plain language
- where to start with a plain-language overview before reading the authority docs
- which overview is active versus archived

## Companion And Adjacent Surfaces

- `HARNESS_APP_PLATFORM.md`
- `WEEKLY_REPORT_COMPANION.md`
- `DOCUMENT_TOOLING_GUIDE.md`

Use this section when the question is:

- what sits beside the harness
- what is a companion surface rather than core harness truth
- how repo-local document tooling works

## Research And Learning Notes

- `OPENAI_DEVELOPER_LEARNINGS.md`
- `ANTHROPIC_ENGINEERING_LEARNINGS.md`
- `AGI_OPERATIONAL_COMPLETION.md`
- `SECONDARY_LEARNING_SOURCES.md`
- `FRONTEND_QUALITY_PLAYBOOK.md`

Use this section when the question is:

- what the repo learned
- how capability or robustness changed over time
- which research notes informed current policy
- which checked-in readiness/proof surfaces currently matter

## Archive And Compatibility

- `SYSTEM_ARCHITECTURE.md`

Use this section when the question is:

- where the older long-form material moved
- where historical architecture explanations still live
- what should be treated as reference rather than active truth

## Fast Navigation

- beginner path: `BEGINNER_PATH.md`
- demo flows: `DEMO_FLOWS.md`
- capability surface: `CAPABILITY_SURFACE.md`
- buyer pain map: `BUYER_PAIN_MAP.md`
- product positioning: `PRODUCT_POSITIONING.md`
- comparison boundary: `COMPARISON_BOUNDARY.md`
- provider posture: `PROVIDER_AND_PORTABILITY.md`
- front-door product doc: `../README.md`
- glossary: `GLOSSARY.md`
- operator map: `../HARNESS_MAP.md`
- script surface help: `npm run help:scripts`

## Common Tasks

- start local server: `npm start`
- launch local UI on Windows: `../start_codex_ui.bat`
- inspect scripts: `npm run help:scripts`
- run repo quality gate: `npm run test:repo-quality`
- run public regression: `npm run regression:public`

## Reading Strategy

Read by intent, not by volume.

- If you want to use the repo: `../README.md` -> `BEGINNER_PATH.md`
- If you want the three fixed product demos first: `DEMO_FLOWS.md`
- If you want to explain what the repo can do: `CAPABILITY_SURFACE.md`
- If you want to explain why someone should buy or adopt it: `BUYER_PAIN_MAP.md`
- If you want to explain how it should be sold: `PRODUCT_POSITIONING.md`
- If you want to keep the comparison axis honest: `COMPARISON_BOUNDARY.md`
- If you want the honest portability story: `PROVIDER_AND_PORTABILITY.md`
- If you want a quick overview first: `AI_AGENT_HARNESS_DETAILED_DESIGN.html`
- If you want the hard rules: `HARNESS_CONSTITUTION.md` -> `../AGENTS.md`
- If you want the active implementation shape: `CURRENT_ARCHITECTURE.md`
- If you want to verify claims: `EVIDENCE_CONTRACT.md` -> `../output/` -> `../logs/current/`
