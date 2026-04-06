# CONVERSATION_ENGINE

## Pipeline

1. Turn analysis
2. Stage detection
3. Move routing
4. Candidate generation
5. Candidate scoring
6. Voice rewrite
7. Anti-AI / anti-boring filtering
8. Grounding routing
9. Final packaging
10. Memory update

## Baseline

The baseline intentionally answers more directly with less stance. It is kept for regression purposes.

## Improved engine

The improved engine does three things the baseline does not:

- it decides what kind of move the turn needs
- it generates multiple candidate replies with different shapes
- it scores and rewrites before returning the final answer

## Grounding principle

High-risk topics must degrade toward accuracy and natural uncertainty rather than confident style.

## Debug contract

Each improved response should expose:

- analysis
- stage
- chosen moves
- candidate list
- candidate scores
- chosen candidate id
- detector hits
- grounding decision
- memory snapshot
