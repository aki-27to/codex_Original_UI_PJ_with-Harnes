# OUTPUT_SURFACE_POLICY

Updated: 2026-04-04

## Purpose

`output/` is not a generic dump directory.

The harness now treats generated material as two different surfaces:

- `output/`: intentional artifacts
- `runtime/output-transient/`: regenerable transient material

This keeps the repo source-first while preserving the file-backed evidence and export model the harness depends on.

## Intentional Artifacts

These stay under `output/` because docs, runbooks, policy, or runtime summary surfaces point at them directly.

Examples:
- `output/agi_v1/`
- `output/agi_readiness/`
- `output/claim_closure/`
- `output/externalization_nohitl/`
- `output/repo_closure_export/`
- `output/manual_self_improvement/`
- `output/memory/`
- `output/*learning*`
- top-level summary files such as `output/public_regression_latest.json`

Rule:
- if an artifact is part of a named program, report contract, release gate, or operator summary path, it stays in `output/`
- governed memory reports are intentional output even though canonical memory truth stays under `logs/archive/raw/runtime_state/memory/`

## Regenerable Transient

These do not belong in the intentional artifact surface.

Examples:
- Playwright browser profiles and screenshot scratch trees
- ad hoc UI capture sessions
- timestamped phase probe files such as `phase2-long-horizon-*.json`
- temporary bootstrap/debug payloads
- demo-home snapshots that can be recreated locally

Rule:
- if the artifact can be regenerated from code/tests and no runbook or policy treats it as a source-of-truth deliverable, move it under `runtime/output-transient/`

## Current Policy

Machine-readable policy lives at [output_surface_policy.json](C:\Users\akima\dev\codex_Original_UI_PJ_with-Harnes\scripts\config\output_surface_policy.json).

Current transient routing:
- `output/playwright` -> `runtime/output-transient/playwright`
- `output/appserver_tui_demo_home` -> `runtime/output-transient/appserver_tui_demo_home`
- `output/phase2-long-horizon-*.json` -> `runtime/output-transient/phase-probes`
- `output/phase3-lifecycle-*.json` -> `runtime/output-transient/phase-probes`
- `output/tmp_harnesui_retry_bootstrap.js` -> `runtime/output-transient/bootstrap`

## Retention

Transient output is retained with bounded policy, not forever.

Default retention:
- age cap
- entry-count cap
- byte-budget cap

The policy is enforced by [organize_output_surface.js](C:\Users\akima\dev\codex_Original_UI_PJ_with-Harnes\scripts\organize_output_surface.js).

## Operator Commands

- `npm run housekeeping:output-surface`
- `npm run housekeeping:surfaces`

These commands are safe to re-run. They move transient material out of `output/`, apply retention, and write a manifest under `runtime/`.

## Decision Rule

When adding a new generated artifact:

1. If a runbook, release gate, runtime overview, or machine-readable policy points at it, keep it in `output/`.
2. If it is local debug/capture/scratch and can be recreated, route it to `runtime/output-transient/`.
3. If uncertain, default to transient first and only promote it to `output/` when an explicit contract needs it.
