# DESIGN_ACCEPTANCE_CONTRACT

Updated: 2026-04-15

## 1) Purpose

Design-sensitive work is not complete just because the build passes or the page renders. The harness must treat visual adoption quality as a hard gate, with explicit proof for benchmark fit, layout integrity, and worst-state readability.

## 2) Hard Requirements

All of the following are required before a design-sensitive task can be marked `COMPLETED`:

- active taste memory or an equivalent locked intent contract
- benchmark or reference target
- desktop screenshot review
- mobile screenshot review
- worst-state screenshot review
- layout integrity review
- copy-fit review
- independent reviewer verdict
- technical verification evidence
- documentation sync

## 3) Layout Integrity Rule

The following are blocking failures, not polish items:

- text overflow or clipping outside intended panel bounds
- label collisions or overlapping UI elements
- copy that cannot fit its allocated region without a defined wrap or truncation policy
- dense header or footer regions that become unreadable under stress states

If any of the above remain, the task state is `FAILED_VALIDATION`.

## 4) Worst-State Rule

Visual proof must include the stressful states that usually reveal broken layouts. At minimum, the harness should require evidence for:

- highest-density content state
- interrupt, pause, or error overlay state
- critical or danger status state
- longest expected localized copy state

If these states are not captured and reviewed, the task is not complete.

## 5) Default Taste Signals For This Harness

The harness defaults remain:

- intent first
- benchmark aware
- no empty polish
- no false-complete visual claim

The current taste memory and task-specific contract may add stricter direction, but they must not weaken the layout-integrity or worst-state gates.
