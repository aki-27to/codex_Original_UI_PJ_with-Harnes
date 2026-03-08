---
name: blender-pro-character-pipeline
description: Build or polish character models in Blender to professional quality with strict gates for silhouette, topology, materials, rigging, natural animation, and export validation. Use when users ask for high-quality character creation before final export.
---

# Blender Pro Character Pipeline

Deliver high-quality character work in Blender with repeatable quality gates.

## Use This Skill When

- The user asks for character modeling quality to be significantly higher.
- The request includes words like "professional quality", "natural motion", "not robotic", or "portfolio level".
- The task requires final export after visual and animation quality checks.

## Do Not Use This Skill When

- The user only wants a quick draft, rough concept, or temporary proxy mesh.
- The task is only engine integration without model-quality changes.

## Workflow

1. Lock the quality contract:
   - Define target style in one line (`stylized`, `semi-real`, or `realistic`).
   - Define top 3 quality priorities (for example: face readability, silhouette, natural animation).
   - Define export target (`GLB`, `FBX`, or both).
2. Run silhouette gate before details:
   - Block out head, torso, limbs, and accessories with clean readable proportions.
   - Verify front, 3/4, and side views before any material polish.
   - Use `references/quality-gates.md` section `Silhouette Gate`.
3. Run limb continuity gate before polish:
   - Confirm arm-to-hand continuity in hero poses (especially waving pose).
   - If using ribbed/flexible joints, preserve a readable wrist and palm mass.
   - Use `references/quality-gates.md` section `Limb Continuity Gate`.
4. Run topology gate:
   - Ensure clean loops around deformation zones (eyes, mouth, shoulder, elbow, wrist).
   - Remove accidental ngons in deformation-critical areas.
   - Use `references/quality-gates.md` section `Topology Gate`.
5. Run material and lighting gate:
   - Evaluate under a neutral lookdev setup and one presentation setup.
   - Eliminate washout and crushed shadows before final render/export.
   - Use `references/quality-gates.md` section `Material and Lighting Gate`.
6. Run rig and weighting gate:
   - Validate key deformation poses (blink, arm raise, elbow bend, hand pose).
   - Fix clipping and candy-wrapper artifacts.
7. Run label/symbol fit and prompt fidelity gate:
   - Validate all explicit prompt tokens are represented and readable in-frame.
   - Keep labels inside button/panel bounds with centered layout and margin.
   - Use `references/quality-gates.md` sections `Label and Symbol Fit Gate` and `Prompt Fidelity Gate`.
8. Run natural animation gate:
   - Build blink as phased motion (`close -> hold -> open`) with interval variance.
   - Add easing and asymmetry; avoid perfectly mirrored robotic timing.
   - Use `references/animation-naturalness.md`.
9. Run export validation gate:
   - Export to target format.
   - Re-import exported file into clean scene and compare with source for visual/motion drift.
   - Use `references/export-validation.md`.
10. Package deliverables:
   - Final model file.
   - Final exported asset.
   - 3 still review images (`front`, `3/4`, `side`).
   - Short preview animation video.
   - One concise quality summary with PASS/FAIL results for every gate.

## Hard Rules

1. Do not skip silhouette gate to rush detail work.
2. Do not compensate poor rigging with aggressive procedural jitter.
3. Do not finalize export before re-import validation.
4. Do not report "complete" when any gate is fail.
5. Do not hide primary structural meshes unless replacement geometry preserves continuity and silhouette in hero poses.
6. Do not accept labels, symbols, or semantic surface details that overflow bounds or become unreadable in final framing.

## Trigger Examples

- "Make this Blender character look like a pro made it."
- "The animation looks robotic. Make blink and hand motion natural."
- "Polish this model quality, then export final GLB."
