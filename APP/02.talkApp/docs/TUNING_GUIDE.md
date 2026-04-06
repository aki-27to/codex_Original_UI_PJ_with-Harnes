# TUNING_GUIDE

## Levers

- `mode`
- `engineVariant`
- `provider`
- `runtimeModel`
- `gradingModel`
- sliders:
  - warmth
  - sharpness
  - humor
  - density
  - challenge
  - brevity
  - weirdness

## When to tune what

- If replies feel too safe:
  - raise `sharpness`
  - raise `challenge`
  - slightly raise `weirdness`
- If replies feel too long:
  - raise `brevity`
  - lower `density`
- If replies feel cold:
  - raise `warmth`
- If replies feel too polite:
  - tighten the voice bible and anti-patterns

## Data promotion flow

1. collect feedback in Chat
2. inspect in Feedback Lab
3. promote to golden or anti-example
4. rebuild few-shots
5. rerun eval loops
