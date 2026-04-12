---
applyTo: "README.md,HARNESS_MAP.md,docs/**/*.md,.github/copilot-instructions.md,.github/instructions/**/*.md,.github/agents/**/*.md"
---

These files describe authority, operating policy, and operator guidance.

Documentation rules:
- `docs/HARNESS_CONSTITUTION.md` stays the single supreme frozen constitution
- `AGENTS.md` stays the operational constitution / runtime behavior constraints
- `docs/AGENT_OPERATING_RULES.md` stays tier-1 operating policy
- machine-readable contracts under `scripts/config/` outrank narrative prose if they disagree
- `docs/CURRENT_ARCHITECTURE.md` is the active architecture spec
- `docs/ARCHITECTURE_CHANGELOG.md` records matching historical deltas

Editing guidance:
- do not let docs invent runtime behavior that contracts or code do not implement
- keep GitHub-native instructions aligned with the same local constitution instead of creating a second governance model
- keep README source-first and point readers toward `docs/README.md`
- keep companion inventories out of the core harness architecture unless they are directly relevant to the harness
- keep transient/local scratch surfaces described as `runtime/`, governed evidence as `logs/`, and intentional artifacts as `output/`
