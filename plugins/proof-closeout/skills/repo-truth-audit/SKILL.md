---
name: "repo-truth-audit"
description: "Use when repository docs, generated outputs, logs, status artifacts, or completion claims may disagree with current implementation truth."
---

# repo-truth-audit

## Purpose

Find contradictions between public docs, runtime output, generated artifacts, logs, and decision surfaces before a task is reported as done.

## Procedure

1. Identify the surfaces users or future agents will treat as truth: README, architecture docs, runbooks, generated reports, status exports, logs, dashboards, or release notes.
2. Compare headline claims against current implementation and current artifacts.
3. Distinguish stale export, stale documentation, runtime contradiction, and missing evidence.
4. Report mismatches by path or surface and describe their decision impact.
5. Recommend the smallest sync action or state downgrade when truth surfaces do not agree.

## Output Contract

Return:

- `mismatch_report`: contradictory or stale surfaces, with path or artifact reference.
- `truth_status`: `consistent`, `stale_export`, `stale_docs`, `contradictory`, or `insufficient_evidence`.
- `decision_impact`: whether the mismatch blocks completion, blocks release, or only needs follow-up.
- `open_issues`: missing checks, stale outputs, or unresolved claims.

## Evidence

- README, architecture docs, runbooks, or release notes
- current output artifacts, generated reports, logs, or status exports
- implementation files relevant to the claim
- verification commands or reviewer findings

## Failure Guard

Do not claim repository truth is consistent after checking only one surface. Do not treat stale generated output as current runtime evidence without confirming its generation path and timestamp.
