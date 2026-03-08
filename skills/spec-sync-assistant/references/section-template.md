# Spec Section Template

Use this structure in `docs/CURRENT_ARCHITECTURE.md`, then append a matching dated entry to `docs/ARCHITECTURE_CHANGELOG.md`.

```markdown
## <number>. <title> (<YYYY-MM-DD>)

Design intent:
- ...

Baseline delivery:
- ...

Over-delivery:
- ...

Verification evidence:
1. `<command>` -> PASS or FAIL
2. ...

Residual risk:
- ...
```

## Consistency Rules

1. Every claimed behavior must map to a changed file or test.
2. Every listed verification command must be executable.
3. Do not mark completed if spec sync is missing.
