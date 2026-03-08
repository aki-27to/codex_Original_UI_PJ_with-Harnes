# Animation Naturalness Checklist

## Blink

Target pattern:
- Close: 50 to 90 ms
- Hold: 10 to 40 ms
- Open: 70 to 140 ms
- Interval variance: roughly 1.5 to 4.5 s
- Occasional double blink is allowed

PASS conditions:
- Blink is not perfectly periodic.
- Left and right lids are not perfectly identical in timing.
- Closed frame does not "stick" unnaturally.

## Idle Body Motion

PASS conditions:
- Motion has layered frequencies (slow primary + subtle secondary).
- Amplitude remains small enough to avoid floaty behavior.
- Head, torso, and hand do not move in rigid lockstep.

FAIL examples:
- Constant-speed oscillation with no easing.
- High-frequency jitter used to fake detail.

## Arm and Hand Motion

PASS conditions:
- In and out transitions are eased (not constant velocity).
- Finger detail is subtle and subordinate to arm action.
- No repetitive mirrored pattern every cycle.

## Review Procedure

1. Review at normal speed and 0.5x speed.
2. Scrub frame-by-frame around blinks and direction changes.
3. Mark each section PASS or FAIL before export.
