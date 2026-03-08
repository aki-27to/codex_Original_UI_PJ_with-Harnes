# Export Validation

## Required Steps

1. Export target format (`GLB`, `FBX`, or both).
2. Open a clean Blender scene.
3. Re-import exported asset.
4. Compare against source for:
- proportions
- materials
- animation timing
- deformations

## PASS Conditions

- Visual look stays within acceptable drift.
- Animation plays without missing channels.
- No obvious orientation or scale mismatch.
- No critical material loss.

## FAIL Conditions

- Model orientation or unit scale is broken.
- Animation clips are missing or timing is wrong.
- Key materials are dropped or severely altered.

## Minimum Evidence Bundle

- One source screenshot.
- One re-import screenshot (same camera framing).
- One short playback clip of exported animation.
