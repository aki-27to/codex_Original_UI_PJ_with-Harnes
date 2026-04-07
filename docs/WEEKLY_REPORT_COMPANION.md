# Weekly Report Companion

Updated: 2026-04-07

## Purpose

This document holds the external workflow-companion detail that should not live in the core harness architecture spec.

- Core harness authority remains in `README.md`, `AGENTS.md`, `HARNESS_MAP.md`, and `docs/CURRENT_ARCHITECTURE.md`.
- The weekly-report companion is an adjacent integration that uses the harness as one governed backend surface; it is not the definition of the harness itself.
- Keeping the integration inventory here prevents `docs/CURRENT_ARCHITECTURE.md` from mixing repo-core architecture with one external workflow's operational details.

## Boundary To The Harness

- The main harness route stays unchanged: `POST /api/exec`.
- The companion is allowed to sit beside the harness only if it does not introduce a new parallel harness or bypass the existing governed export/eval flow.
- Companion-specific operational details belong here, not in the core architecture spec.

## Current Verified Companion Inventory

- Conversational face:
  - Copilot Studio agent `週報下書きアシスタント`
  - environment `Default-1a69c0c6-e1c8-439d-8c95-0b8bc3c195d4`
- Evidence persistence:
  - Microsoft To Do list `Weekly Evidence`
- Started Power Automate flows:
  - `WR_TEAMS_CHANNEL_TO_EVIDENCE_V1` (`b46fc296-b725-f111-88b4-000d3acf2bda`)
  - `WR_OUTLOOK_SENT_TO_EVIDENCE_V1` (`3ce1784f-b825-f111-88b4-000d3acf2bda`)
  - `WR_ADD_WORK_MEMO_TO_EVIDENCE_V1` (`49e1784f-b825-f111-88b4-000d3acf2bda`)
  - `WR_GET_WEEKLY_EVIDENCE_PACKET_V1` (`54e1784f-b825-f111-88b4-000d3acf2bda`)
  - `WR_WEEKLY_DRAFT_REMINDER_V1` (`60e1784f-b825-f111-88b4-000d3acf2bda`)
- Verified tool exposure:
  - `WR_ADD_WORK_MEMO_TO_EVIDENCE_V1`
  - `WR_GET_WEEKLY_EVIDENCE_PACKET_V1`

## Known Limitation

- In the current Copilot Studio tool exposure for `WR_ADD_WORK_MEMO_TO_EVIDENCE_V1`, the tested agent UI surfaced `memo_text` but not the optional `memo_project` / `memo_date` fields. Memo capture therefore remains optimized for short one-line notes instead of fully structured memo entry.
