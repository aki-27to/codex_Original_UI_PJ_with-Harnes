# Public Hygiene Policy

## 2026-04-05 update

- Strict public hygiene blocks completion and strict eval when major surfaces expose:
  - `memoryType = "unknown"`
  - blank references or blank outcome status
  - raw UUID-like titles
  - epoch-millisecond timestamps
  - `[object Object]`
  - `mock-` residues
- Hygiene applies to:
  - `output/memory_public/*`
  - `output/agi_readiness/*`
  - `output/continuity_public/*`

public proof は operator がそのまま読める品質を維持します。

## Hygiene rules
- raw UUID-like title を残さない
- epoch millisecond timestamp を残さない
- blank reference / blank task outcome status を残さない
- `memoryType: "unknown"` は最終 fallback に留め、原則 0 件を目標にする

## Validation
`memory_eval_public_status.json` の次の check で固定します。

- `public_hygiene_no_unknown_memory_type`
- `public_hygiene_validation_refs_present`
- `public_hygiene_no_blank_task_outcome_status`
- `public_hygiene_no_raw_uuid_titles`
- `public_hygiene_iso8601_timestamps`
