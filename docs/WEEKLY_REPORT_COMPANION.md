# Weekly Report Companion

Updated: 2026-04-12

## Purpose

この文書は、weekly-report companion の inventory と boundary を core architecture から分離して管理するための companion doc です。

## Boundary To The Harness

- core execution path は `POST /api/exec` / `POST /api/eval/run`
- weekly-report companion は adjacent workflow であり、core authority を再定義しない
- 詳細 inventory はこの文書に閉じる

## Current Verified Companion Inventory

現時点で検証済みの companion surface と limitation をここにまとめ、`CURRENT_ARCHITECTURE.md` には詳細を埋め込まないようにします。

## Known Limitation

companion inventory は adjacent workflow なので、core governed worker の completion claim とは分けて扱います。
