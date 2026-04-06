# EVALS

## Eval stack

The current local eval stack is heuristic-first and file-backed.

### Included

- Rubric scoring
- Pairwise winner calculation
- Long-conversation category coverage
- Failure extraction
- Feedback sync surface

### Current limitation

The grader is deterministic and heuristic, not a human study. This is acceptable for local iteration, but human preference capture remains necessary.

## Dataset

- Dataset name: `core-180`
- Total cases: 180
- Shape: 9 categories x 20 cases each
- Categories:
  - smalltalk
  - deepDive
  - work
  - feeling
  - review
  - grounded
  - reflection
  - longConversation
  - styleDrift

`grounded` is the high-risk bucket. `styleDrift` exists to measure repetitive fallback tone across multi-turn exchanges.

## Key metrics

- interestingness
- humanNaturalness
- conversationality
- stance
- sharpness
- compression
- empathyFit
- groundedness
- nonAiSmell
- repetitionPenalty
- nextTurnPotential

## Success criteria

- pairwise improved win rate over baseline >= 65
- ai smell improves by at least 30 percent
- interestingness improves by at least 20 percent
- groundedness does not worsen
- repetition/style drift decline over time

## Measurement notes

- Pairwise winner is computed per case from aggregate rubric totals.
- `aiSmellDropPct` measures the lift of `nonAiSmell`.
- `interestingnessLiftPct` measures the relative gain on `interestingness`.
- `repetitionDropPct` measures the lift of `(1 - repetitionPenalty)`.
- Long-conversation and style-drift cases both include assistant history, so repetition is scored against prior turns rather than single-turn text only.
