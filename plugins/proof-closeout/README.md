# Proof / Closeout Plugin

Proof / Closeout packages reusable Codex skills for evidence-backed task closure.

The plugin does not replace repository-specific governance, tests, CI, or release gates. It gives Codex a portable closeout bundle that helps decide whether a task is actually done, only partially done, failed validation, blocked, or ready for handoff.

## Included Skills

- `code-change-verification`: map changed surfaces to verification evidence.
- `safe-refactor-with-proof`: keep multi-file changes small, reversible, and checked.
- `repo-truth-audit`: compare docs, generated outputs, logs, and current artifacts for stale or contradictory claims.
- `worker-decision-review`: decide whether an outcome should be adopted, revised, blocked, or retried.
- `long-run-session-closeout`: prevent false completion at the end of a long-running session.
- `handoff-artifact-generation`: produce a durable continuation bundle.

## Boundary

The plugin is a distribution package. It does not define automatic skill-to-skill execution, does not replace parent-agent judgment, and does not make repository-specific artifacts mandatory for other repositories.

Use `references/harnes-adapter-notes.md` when applying this plugin inside the Harnes repo.
