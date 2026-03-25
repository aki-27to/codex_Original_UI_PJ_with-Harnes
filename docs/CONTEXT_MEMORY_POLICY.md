# CONTEXT_MEMORY_POLICY

Updated: 2026-03-23

## 1) Purpose

Define how the harness preserves, summarizes, shares, and externalizes context so execution stays accurate without uncontrolled prompt growth.

## 2) Context Tiers

- Turn-local context:
  - the active user request
  - immediate constraints, acceptance checks, and findings
  - discard after the turn unless promoted
- Session summary:
  - current goal, locked decisions, open questions, risks, and pending approvals
  - keep only what is likely needed for the next turn in the same thread
- Project memory:
  - stable repo facts, policy decisions, machine-readable contracts, and durable operator expectations
  - source these from files or config whenever possible instead of freeform recollection
- Artifact memory:
  - large outputs, logs, screenshots, traces, datasets, and transcripts
  - store in files/artifacts, then reference them from summaries instead of inlining them into prompts

## 3) Promotion Rules

- Promote turn-local facts into session summary only when they affect likely next-step execution.
- Promote facts into project memory only when they are stable, reusable, and source-backed.
- Do not promote speculative interpretations, transient failures, or unverified user preferences into durable memory.
- User taste signals may be promoted into durable memory only when the user has explicitly indicated them or approved them through the harness UI.
- If a fact is already represented in a repo file, prefer updating or citing that file instead of duplicating the fact in freeform memory.

## 4) Parent and Child Context Boundaries

- Parent context should contain:
  - requirement contract
  - non-goals and constraints
  - acceptance checks
  - current review state
- Child context should contain only:
  - the scoped subtask
  - required files or artifacts
  - explicit skill/tool requirements
  - acceptance checks needed for that subtask
- Do not inject unrelated thread history into child prompts.
- Read-only roles should receive review/research context only, not implementation scope beyond what is needed to inspect.

## 5) Artifact First Rule

- When command output is long, persist it as an artifact or file and summarize only the relevant result in prompt context.
- When design state becomes durable, sync it into `docs/CURRENT_ARCHITECTURE.md` and append the matching change entry to `docs/ARCHITECTURE_CHANGELOG.md` rather than relying on conversational memory.
- Prefer file references over copied blocks when the information already exists in the repository.
- The intent-first harness keeps user taste memory in a dedicated persisted store instead of smearing those preferences across arbitrary prompts.

## 6) External Learning Memory

- Official external learnings must be ingested into dedicated artifacts such as `output/openai_blog_learning_ledger.json`, `output/openai_blog_learning_digest.json`, and `docs/OPENAI_DEVELOPER_LEARNINGS.md` rather than copied into every prompt.
- Secondary external learnings may be ingested from non-OpenAI sources only when they are explicitly labeled as secondary, stored in separate artifacts, and prevented from outranking the primary OpenAI lane.
- Secondary sources must retain only portable agent-engineering principles. Vendor-specific mechanics, model-marketing claims, and model-family-specific benchmark notes do not become runtime policy.
- Retrieval must stay selective: only inject learnings that match the current task family or subsystem, and cap the number of promoted guidance items.
- Runtime retrieval must stay bounded and gated: apply only to explicitly allowed agents/task families, keep a kill switch, and prefer shadow/proposal modes before widening the scope.
- External learnings are advisory memory, not constitutional truth. They must not silently override `AGENTS.md` or frozen Step 1/2 behavior.
- Promotion from external learning into runtime behavior must stay governed and regression-checked; collecting or summarizing a learning does not authorize automatic policy drift.

## 7) Safety and Privacy

- Do not copy secrets, credentials, tokens, or unnecessary personal data into summaries, child prompts, or artifacts unless the task explicitly requires it and the approval boundary allows it.
- Scope shared context to the minimum needed for the receiving role to complete its task safely.
