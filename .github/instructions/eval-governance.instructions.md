---
applyTo: "scripts/**/*eval*.js,scripts/config/*eval*.json,scripts/config/eval_suite_default.json,docs/AGI_V1_EVAL_FRAMEWORK.md"
---

This path scope owns evaluation and promotion behavior.

Evaluation policy:
- improve task-level evaluators, probes, and reporting without turning constitutional safety gates into self-modifying targets
- task rubrics may evolve; release gates, approval boundaries, and requirement contracts remain fixed authority unless the user explicitly changes governance
- keep eval outputs fail-closed when evidence or manifest integrity is missing
- do not treat synthetic or fixture-only evidence as proof of live operational completion

When changing these files:
- keep eval semantics compatible with the existing `/api/eval/run` route
- keep public-proof language subordinate to observed evidence
- update `docs/CURRENT_ARCHITECTURE.md` and `docs/ARCHITECTURE_CHANGELOG.md` if the operator-visible eval posture changes
