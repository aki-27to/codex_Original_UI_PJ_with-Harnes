# Generic Evidence Surfaces

Use the smallest evidence set that proves the claimed outcome.

## Changed Surface

- Version control status and diff summary.
- Task-owned files, modules, APIs, UI flows, configuration, docs, generated artifacts, or runtime outputs.
- Explicit separation between task-owned changes and unrelated dirty work.

## Verification

- Unit, integration, contract, lint, typecheck, smoke, browser, or visual checks that match the changed surface.
- Exact command or artifact inspected.
- Result classification: `pass`, `fail`, `blocked`, or `not_run`.
- Skipped-check reason and adoption risk when evidence is incomplete.

## Truth Surfaces

- README and architecture docs.
- Current runtime or generated output artifacts.
- Logs, status exports, reports, or dashboards that users may rely on.
- Reviewer, tester, CI, or external-tool findings.

## Closeout

- Original user request and acceptance criteria.
- Completion state: `COMPLETED`, `PARTIAL`, `FAILED_VALIDATION`, `BLOCKED`, or `NEEDS_INPUT`.
- Residual risk, unresolved issues, and next action.
