# Quality Gates

Use PASS or FAIL only. No vague verdicts.

## Silhouette Gate

PASS conditions:
- Character reads clearly in front, 3/4, and side views.
- Head/torso/limb proportions match intended style.
- Signature features remain recognizable at 25 percent zoom.

FAIL examples:
- Accessory shapes merge into head/body mass.
- Profile view feels flat or unbalanced.

## Limb Continuity Gate

PASS conditions:
- Arm, wrist, and palm read as one continuous structure in front and 3/4 views.
- If ribbed/flexible joints are used, joints are secondary detail and not the primary arm silhouette.
- Waving hand pose keeps a clean palm shape with intentional finger count and spacing.
- No floating helper pieces that read as detached bones.

FAIL examples:
- Primary support meshes are hidden and only connector/detail chains remain visible.
- Detached helper primitives are used as replacements and read as skeletal fragments.
- Old and new hand parts overlap, causing double silhouettes or broken contours.

## Topology Gate

PASS conditions:
- Deformation zones have intentional edge flow.
- No avoidable ngons in eyes, mouth, shoulder, elbow, wrist.
- Major shading artifacts are absent after normal smoothing.

FAIL examples:
- Eye and mouth loops cannot support blink or expression.
- Elbow collapse under 90 degree bend.

## Material and Lighting Gate

PASS conditions:
- Base materials stay readable under neutral and presentation lights.
- No strong washout, no clipped highlights, no crushed blacks.
- Skin/plastic/metal surfaces have distinct response.

FAIL examples:
- Everything reads as one flat material.
- Emission and exposure hide form detail.

## Rig and Deformation Gate

PASS conditions:
- Blink pose, arm raise, elbow bend, and hand curl remain clean.
- No major intersection in key hero poses.

FAIL examples:
- Eyelids clip through eyeballs.
- Wrist twist creates severe volume loss.

## Label and Symbol Fit Gate

PASS conditions:
- Text labels are centered within their host button/panel with visible margins.
- Glyph/icon and label do not overlap and both remain readable in final camera framing.
- Panel text uses stable anchoring (font/text objects preferred over offset mesh text when possible).

FAIL examples:
- Label extends outside button/panel boundary.
- Icon is hidden behind geometry or displaced outside its panel.
- Text origin offset causes apparent overflow despite nominal scale.

## Prompt Fidelity Gate

PASS conditions:
- Every user-specified semantic element is represented and readable in the final frame.
- User-specified color and material intent is preserved under final lighting.
- Framing constraints from the brief are satisfied (for example: full body, neutral background, isolated subject).

FAIL examples:
- Core brief element is missing, ambiguous, or visually contradicted.
- Lighting/exposure destroys required color or material cues.
