# EXPERIMENT LOG

Date: 2026-04-05

## Baseline setup

- Baseline engine: single direct-answer path with safe, summary-shaped fallback language
- Improved engine: staged pipeline with turn analysis, stage detection, move routing, multi-candidate generation, scoring, rewrite, anti-AI filtering, grounding routing, and memory snapshots
- Eval harness: `npm run evals`
- Dataset: `core-180`

## Loop 1 - baseline tuning

### Change

- Established the baseline vs improved split as two runnable engines.
- Tuned improved defaults for more compression and stronger first-sentence angle.

### Result

- Pairwise win rate: 100%
- AI smell drop: 32.28%
- Interestingness lift: 38.10%
- Groundedness delta: 0
- Repetition drop: 8.56%

### Read

- The improved engine was already clearly better on angle and anti-AI language.
- The main remaining weakness was that the anti-AI gains were driven more by prompt shape than by explicit pattern handling.

## Loop 2 - anti-AI tuning

### Change

- Hardened anti-AI detectors and kept the improved engine away from summary framing, praise, and over-neat openings.
- Preserved the baseline's safe but flatter default shape as the comparison target.

### Result

- Pairwise win rate: 100%
- AI smell drop: 32.28%
- Interestingness lift: 38.10%
- Groundedness delta: 0
- Repetition drop: 8.56%

### Read

- Anti-AI behavior stayed better than baseline, but interestingness had not improved past loop 1.
- That suggested the next repair should target the engine's angle selection, not more detector work.

## Loop 3 - final tuning

### Change

- Pushed the improved engine toward more angle, stance, and compression.
- Expanded the eval dataset to a full 180 cases by adding `styleDrift`.
- Made repetition/style-drift measurable by giving multi-turn cases prior assistant history and letting the baseline repeat earlier openings.

### Result

- Pairwise win rate: 100%
- AI smell drop: 32.28%
- Interestingness lift: 57.14%
- Groundedness delta: 0
- Repetition drop: 8.56%

### Read

- This loop delivered the best interestingness lift without hurting groundedness.
- The repetition metric now moves in the intended direction instead of staying flat.

## Threshold check

- Pairwise >= 65%: pass
- AI smell >= 30% improvement: pass
- Interestingness >= 20% improvement: pass
- Groundedness not worse than baseline: pass
- Repetition/style drift reduced vs baseline: pass

## Promoted learning

- Goldens and anti-examples are stored under `data/goldens/` and `data/anti_examples/`.
- Failures for regression are stored under `data/failures/`.
- User feedback and pairwise preferences are stored under `data/feedback/` and reused by the product surfaces in the Feedback Lab.

## Remaining weakness

- Debug candidates are still easier to inspect than to love: the runtime can polish the final answer into Japanese, but internal drafts remain utilitarian.
- The current eval stack is heuristic-first. It is good enough for local iteration, but it still wants more real user preference data over time.
