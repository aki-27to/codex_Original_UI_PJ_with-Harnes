---
name: turn-log-auditor
description: Audit turn artifacts and operation logs for protocol and governance compliance. Use when release_manager or reviewer must validate manifest integrity, terminal events, risk audit fields, approval traces, prompt truncation records, and evidence completeness before release.
---

# Turn Log Auditor

Audit turn evidence with strict pass or fail criteria.

## Workflow

1. Locate evidence artifacts:
   - `logs/turns/**/manifest.json`
   - operation log snapshots from runtime or diagnostics outputs.
2. Validate terminal integrity:
   - each turn has exactly one terminal completion record.
3. Validate approval and risk trace:
   - command or file-change approvals include risk rule ids and summaries.
4. Validate prompt audit chain:
   - truncation indicators and activity events are consistent.
5. Produce verdict:
   - PASS only when artifact fields and process evidence are complete.

## Commands

```bash
rg --files logs | rg "manifest\\.json|operation"
rg -n "turn/completed|approval|riskRuleIds|prompt_truncated" logs
```

## Output Contract

1. Findings ordered by severity.
2. Missing-field matrix by artifact path.
3. PASS or FAIL verdict with blocking reasons.

## Reference

- `references/audit-matrix.md`
