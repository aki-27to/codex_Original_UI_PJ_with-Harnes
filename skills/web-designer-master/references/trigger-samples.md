# Trigger Samples

Use these examples to evaluate trigger precision for `$web-designer-master`.

## Sample 1 (Expected: Trigger = YES)

User request:
"Build a landing page for our product and use Stitch if it helps you move faster."

Reason:
- Website creation request with explicit Stitch-first intent.

## Sample 2 (Expected: Trigger = YES)

User request:
"I have a Stitch project for this signup flow. Pull the screens into the repo and turn them into real pages."

Reason:
- Stitch project import plus frontend implementation request.

## Sample 3 (Expected: Trigger = NO)

User request:
"Implement a REST API in Node.js with JWT auth and rate limiting."

Reason:
- Backend implementation request, not a web UI/design intake task.

## Sample 4 (Expected: Trigger = NO)

User request:
"Fix the z-index bug on the existing modal and do not redesign anything."

Reason:
- Narrow frontend bugfix with no need for Stitch-driven design intake.
