# PRODUCT_SPEC

## Product frame

`talkApp` is a local-first conversation R&D app for building a Japanese AI that feels worth talking to again. It is not just a chat shell. It exists to make conversation quality observable, debuggable, and improvable.

## Core product layers

1. Conversation engine
2. Eval and preference capture
3. Debuggable operator UI

## Product goals

- Knowledge quality should remain AI-grade.
- Replies should feel like a return, not a summary.
- The system should preserve stance, compression, and next-turn potential.
- User preference signals should be collectable and reusable.
- Improvements should be measurable against a baseline.

## Non-goals

- Pretending to be human
- Maximizing politeness
- Covering every point in every turn
- Shipping a polished visual brand before the engine is useful

## Engine variants

- `baseline`
  - direct response path
  - useful as a regression anchor
- `improved`
  - staged conversation pipeline
  - candidate generation and scoring
  - anti-AI filtering and voice rewrite
- `cost-save`
  - reserved for lighter runtime settings

## User-facing surfaces

- Chat
- Debug
- Evals
- Feedback Lab

## Persistence

- Chat/session state: browser localStorage
- Feedback/preferences/memory/reports: local JSON files under `data/`
