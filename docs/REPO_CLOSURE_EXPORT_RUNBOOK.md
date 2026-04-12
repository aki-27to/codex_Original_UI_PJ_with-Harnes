# Repo Closure Export Runbook

Updated: 2026-04-12

## Purpose

repo-safe な closure/export packet を作る runbook です。

## One-Command Entrypoints

- repo closure export command
- output/governance_public など public-safe artifact を優先

## Operator Flow

1. latest signoff bundle を確認
2. public-safe packet を抽出
3. raw local evidence は持ち出さない

## External-Only Packets

外部に渡すのは redacted / intentional artifact のみです。
