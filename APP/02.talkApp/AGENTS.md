# AGENTS

## Repo Intent

This repository is a local conversation R&D app, not a generic chat demo. Every change should preserve debuggability, evalability, and feedback capture.

## Working rules

- Treat `docs/VOICE_BIBLE.md` and `docs/PRODUCT_SPEC.md` as behavioral source-of-truth.
- Do not collapse the engine into a single prompt file. Keep the staged pipeline explicit in `src/conversation/`.
- Keep baseline and improved engines both runnable. Do not remove the baseline path.
- Keep evals reproducible and file-based. Reports belong in `data/eval_reports/`.
- Feedback and memory are local product features, not developer-only traces. Preserve user visibility and deletion paths.
- For new heuristics, add both:
  - the implementation
  - at least one golden or failure case exercising it
- Prefer plain JSON or Markdown data files unless there is a strong reason otherwise.

## Editing guidance

- Keep runtime abstractions under `src/runtime/`.
- Keep front-end app code under `app/frontend/`.
- Keep backend HTTP code under `app/backend/` and thin.
- Keep domain logic under `src/`, not in route handlers.
- When changing scoring rules, update:
  - `docs/EVALS.md`
  - `docs/EXPERIMENT_LOG.md`
  - relevant golden or anti-example data

## Quality bar

- Avoid AI-polished wording in user-facing defaults.
- Prefer traceable heuristics over opaque magic.
- Every new major feature should surface enough debug state to understand why the engine behaved that way.
