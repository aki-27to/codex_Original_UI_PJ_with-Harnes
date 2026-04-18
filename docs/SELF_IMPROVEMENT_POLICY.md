# SELF_IMPROVEMENT_POLICY

Updated: 2026-04-12

## 1) 目的

自己改善を「自由改変」ではなく、governed change lifecycle として扱います。目的は planner / decomposition / retrieval / tool-use / retry / memory-pack / skill-surface を改善することであり、constitution や core release gate を書き換えることではありません。

## 2) Core Model

改善候補は proposal-first です。runtime へ混ぜる前に evidence と non-regression gate を通します。

## 3) Machine-Readable Surfaces

- schema: `scripts/config/self_improvement_proposal.schema.json`
- promotion lifecycle: `scripts/config/self_improvement_promotion_policy.json`
- eval gate: `scripts/self_improvement_eval_gate.js`
- apply flow: `scripts/self_improvement_apply.js`

## 4) Promotion Tiers

- `proposal_only`
- `shadow_candidate`
- `gated_candidate`
- `auto_apply_candidate`
- `blocked`

## 5) Allowed and Blocked Classes

改善してよい:
- planner
- decomposition
- retrieval
- tool selection
- retry / recovery
- memory pack policy
- skill surface policy

blocked:
- constitution
- authority
- safety boundary
- approval boundary
- core release gate
- core evaluator hard gate

## 6) Eval Gate

候補は次を満たす必要があります。

- reproducible
- evidence-linked
- non-regressive
- bounded blast radius
- rollback possible

per-case `maxPromptBlockChars` など prompt growth も non-regression に含めます。

## 7) Runtime Integration

OpenAI / Anthropic learning lane や manual capture lane は、すべて同じ promotion policy の下に置きます。manual lane は retrieval の素材にはなっても、governed lane が再分類しない限り runtime behavior を直接変えてはいけません。

## 8) Correction-to-Skill Routing

correction loop と skill promotion loop は同じものではありません。correction event の直後は、まず `Learning Triage` を通して `patch target` と `improvement lifecycle` を決めます。

- patch target:
  - `conversation_only`
  - `project`
  - `harness`
- improvement lifecycle:
  - `proposal_only`
  - `shadow_candidate`
  - `gated_candidate`
  - `auto_apply_candidate`
  - `blocked`

原則は `smallest scope that prevents recurrence` です。最初から何でも skill にしてはいけません。skill は correction の直接行き先ではなく、patch と replay verification の後に、再利用可能な workflow であり、反復成功と audit evidence が揃ったものだけが promotion candidate になります。
