# AGI_V1_EVAL_FRAMEWORK

Updated: 2026-04-12

## 1) Scope

この文書は、既存ハーネスの上に stricter fail-closed decision layer を重ねる `agi_v1` evaluation / promotion framework を説明します。新しい主権層を作るものではありません。

## 2) Minimal-Intrusion Integration Points

既存 runtime の主 route は変えません。
- `POST /api/exec`
- `POST /api/eval/run`

追加するのは eval/promotion discipline です。

## 3) Activation

- eval profile: `agi_v1`
- challenger / incumbent bundle の比較
- promotion は direct score だけでなく gate 判定を通す

## 4) Metric Families

critical gate は最低でも次を持ちます。

- `I_eval`: evaluator integrity
- `S_trust`: trust / release honesty
- `C_corr`: correction and self-repair
- `E_epi`: episodic evidence / continuity

## 5) Promotion Rule

次のいずれかが欠ける candidate は promote しません。

- contract integrity
- evidence sufficiency
- non-regression
- bounded residual risk
- honest release posture

## 6) Output

bundle / report は public-safe proof と internal governed score を分離して扱います。narrative docs は subordinate であり、machine-readable contracts と runtime proof が優先です。

<!-- compatibility marker:
This keeps `AGI_V1_EVAL_FRAMEWORK.md` aligned with the repo-wide rule that narrative docs are subordinate to machine-readable contracts and runtime proof.
-->
