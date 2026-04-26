---
name: "not-yet-root-cause-debugger"
description: "Debug NOT_YET readiness or completion status. Use when goal completion, subjective completion, learning adoption, robustness, or coverage status remains NOT_YET after implementation appears complete."
---

# not-yet-root-cause-debugger

## Purpose

Explain why a status remains `NOT_YET` without guessing from code changes alone.

## Procedure

1. Separate symptom from root cause.
2. Check whether the status artifact is stale or generated from current inputs.
3. Identify missing runtime evidence, harmful causal trace, stable coverage failure, robustness failure, agenda still running, or missing live source.
4. Define the smallest next verification or remediation step.

## Evidence

- `output/agi_readiness/goal_completion_status.json`
- `output/agi_readiness/learning_adoption_status.json`
- related readiness/remediation artifacts referenced by those files
- generation timestamps and source artifact paths

## Failure Guard

Do not assume code changes should move a readiness metric until the metric source and generation path are verified.
