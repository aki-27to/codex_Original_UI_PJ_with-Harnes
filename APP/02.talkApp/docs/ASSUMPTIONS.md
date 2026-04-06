# ASSUMPTIONS

Date: 2026-04-05

## Runtime assumptions

- Codex CLI is available locally and may be used as the default quality runtime when API keys are absent.
- OpenAI Responses API remains available as an optional runtime when `OPENAI_API_KEY` is configured.
- Live web search may not be available in all runtimes, so grounding must degrade gracefully.

## Product assumptions

- The app is local-first and stores chat, memory, feedback, and eval artifacts on disk.
- A pragmatic heuristic grader is acceptable as part of the local eval stack as long as reports clearly state what is heuristic versus model-graded.
- Synthetic or templated eval cases are acceptable if they are diverse, readable, and traceable.

## Delivery assumptions

- The existing static app may be replaced if necessary.
- The current task prioritizes a working R&D foundation over pixel polish.
- When a full human-study loop is unavailable, the app should still support later human preference collection and promotion into goldens and anti-examples.
