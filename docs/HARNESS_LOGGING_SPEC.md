# HARNESS_LOGGING_SPEC

Updated: 2026-04-12

## Goal

logging を dump ではなく、operator review と replay のための fixed surface にすることです。

## Fixed Principles

- append-only raw log と current summary を分ける
- operator-facing summary は固定枚数に絞る
- bundle 側に rich summary を寄せ、current root を肥大化させない
- narrative claim より machine-readable summary を優先

## Required Directory Layout

- `logs/current/`
- `logs/archive/`
- turn bundle / signoff bundle 配下の summary / raw separation

## Current Surface

`logs/current/` は次の 5 ファイルのみを current truth とします。

- `design_conformance_summary.json`
- `latest_run_summary.json`
- `latest_signoff_summary.json`
- `operator_summary.json`
- `review_load_breakdown.json`

## Not Current Truth

次は bundle 内に置き、current root へは置きません。

- `runtime_snapshot.json`
- `conformance_report.json`
- `operator_view_summary.json`

## Reading Rule

operator はまず `logs/current/` を見て、必要なときだけ bundle surface へ降ります。
