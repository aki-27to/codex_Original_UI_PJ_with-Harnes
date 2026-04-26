---
name: "repo-truth-audit"
description: "Audit repo truth across README, architecture docs, harness maps, current logs, governance public output, and readiness artifacts. Use when Codex must detect docs/code/output mismatch or stale completion claims."
---

# repo-truth-audit

## Purpose

Find contradictions between public docs, runtime output, current logs, and decision artifacts.

## Procedure

1. Compare headline docs with current output artifacts.
2. Check `worker_decision_surface.json`, goal completion status, learning adoption status, and latest signoff logs.
3. Distinguish stale export from live contradiction.
4. Report mismatches by artifact path and decision impact.

## Evidence

- `README.md`
- `docs/CURRENT_ARCHITECTURE.md`
- `output/governance_public/worker_decision_surface.json`
- `output/agi_readiness/goal_completion_status.json`
- `logs/current/*.json` allowlisted summaries

## Failure Guard

Do not claim the repo is fully consistent when only one surface was checked.
