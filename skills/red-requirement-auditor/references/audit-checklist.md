# Red Requirement Audit Checklist

## 1) Ambiguity

Check for unclear terms:

1. "fast", "secure", "scalable", "user-friendly", "soon"
2. Missing measurable threshold
3. Missing explicit in-scope or out-of-scope boundary

## 2) Contradiction

Check for incompatible statements:

1. Constraint conflicts with success criteria
2. Non-goal conflicts with requested output
3. Risk controls conflict with timeline or tooling constraints

## 3) Testability

Check whether each success criterion can be verified:

1. Pass or fail condition exists
2. Test method is named
3. Evidence artifact is identifiable

## 4) Dependency Clarity

Check for missing prerequisites:

1. Required external system or credential not stated
2. Environment assumptions hidden
3. Role or ownership for decision point missing

## 5) Safety and Regression

Check whether risk and rollback are explicit:

1. Failure mode is described
2. Rollback trigger is described
3. Regression surface is listed

## Severity Rules

1. `critical`: blocks safe or correct implementation now.
2. `high`: likely causes rework or test failure.
3. `medium`: degrades clarity, may cause drift.
4. `low`: minor wording or optional precision gain.

