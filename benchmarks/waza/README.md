# Waza External Benchmark

This directory keeps Waza-style skill benchmarks outside the governed harness runtime.

## Boundary

- This is an external benchmark surface, not the harness execution plane.
- Do not route this through `POST /api/exec` or `POST /api/eval/run`.
- Do not write benchmark passes to `logs/skill_outcomes.jsonl`.
- `logs/skill_outcomes.jsonl` is reserved for actual skill-use outcomes.

## Quick Run

Use the repo-local runner for a dependency-free smoke benchmark:

```powershell
npm run benchmark:waza:skill-design-review
```

The runner writes:

- `benchmarks/waza/results/skill-design-review-codex-latest.json`
- `benchmarks/waza/transcripts/skill-design-review-codex-latest.ndjson`

## Real Waza CLI

When the `waza` CLI is installed, this directory can be used as the external benchmark workspace.

The Waza-oriented eval scaffold is:

```text
benchmarks/waza/evals/skill-design-review-codex/eval.yaml
```

Example real Waza command:

```powershell
waza run benchmarks/waza/evals/skill-design-review-codex/eval.yaml --context-dir benchmarks/waza/fixtures/skill-design-review-codex --output benchmarks/waza/results/skill-design-review-codex-waza.json --transcript-dir benchmarks/waza/transcripts/waza-real
```

The local runner intentionally stays separate from the real Waza CLI so this repo can verify the benchmark shape even on machines where `waza` is not installed.
