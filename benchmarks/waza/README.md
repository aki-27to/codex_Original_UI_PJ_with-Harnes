# Waza External Benchmark

This directory keeps real Waza benchmarks outside the governed harness runtime.

## Boundary

- This is an external benchmark surface, not the harness execution plane.
- Do not route this through `POST /api/exec` or `POST /api/eval/run`.
- Do not write benchmark passes to `logs/skill_outcomes.jsonl`.
- `logs/skill_outcomes.jsonl` is reserved for actual skill-use outcomes.

## Quick Run

Use the real Waza CLI:

```powershell
npm run benchmark:waza
```

The command writes:

- `benchmarks/waza/results/skill-design-review-codex-waza.json`
- `benchmarks/waza/transcripts/waza-real/*.json`

## Local CLI Location

This checkout uses the real Waza Windows binary at:

```text
runtime/waza/waza.exe
```

`runtime/` is gitignored, so the binary is not committed.

## Eval Scaffold

```text
benchmarks/waza/evals/skill-design-review-codex/eval.yaml
```

The eval uses Waza's official `mock` executor because this machine does not have `copilot` or GitHub Copilot credentials available. This proves the Waza eval/task/fixture/grader surface runs under the real `waza run` command. It is not an LLM quality benchmark.

Direct command:

```powershell
runtime\waza\waza.exe run benchmarks\waza\evals\skill-design-review-codex\eval.yaml --context-dir . --output benchmarks\waza\results\skill-design-review-codex-waza.json --transcript-dir benchmarks\waza\transcripts\waza-real --no-update-check
```
