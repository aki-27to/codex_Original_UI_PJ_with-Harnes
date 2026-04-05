# Public Hygiene Policy

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
