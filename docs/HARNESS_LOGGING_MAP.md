# HARNESS_LOGGING_MAP

Updated: 2026-04-12

## 1) First Look Files

まず見るべき current truth:
- `design_conformance_summary.json`
- `latest_run_summary.json`
- `latest_signoff_summary.json`
- `operator_summary.json`
- `review_load_breakdown.json`

## 2) Surface Roles

- design conformance: design-sensitive gate
- latest run: latest governed run の概況
- latest signoff: signoff-ready truth
- operator summary: one-screen state
- review load breakdown: reviewer / tester / doc-sync / evidence burden

## 3) Reading Order

1. `operator_summary.json`
2. `latest_signoff_summary.json`
3. `latest_run_summary.json`
4. `design_conformance_summary.json`
5. `review_load_breakdown.json`

## 4) Design Conformance Guide

design-sensitive task では signoff 前に design conformance を必ず読むこと。

## 5) Bundle Dive

current root で不足する場合のみ、bundle の以下を見ること。
- `signoff_summary.json`
- `runtime_snapshot.json`
- `core_harness_workflow_run.json`
- `natural_task_trace_summary.json`
- `conformance_report.json`
- `operator_view_summary.json`
- `bundle_surface_map.json`
