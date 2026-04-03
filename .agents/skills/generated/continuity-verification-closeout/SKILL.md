# Continuity Verification Closeout

Use after a successful long-horizon execution to combine changed surface, verification state, and next-session brief.

## Trigger
when closeout must preserve verifier and continuity state

## Deterministic Steps
- load latest verifier state
- refresh closeout summary
- emit next_session_brief

## Contextual Reasoning
- prefer verified artifacts
- do not promote session-only notes

## Tests
- closeout_summary exists
- verification_status exists

Source Trace: output/agi_readiness/phase5/agi_readiness_public_latest.json
