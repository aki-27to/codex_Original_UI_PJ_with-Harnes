# AGI Operational Completion

Updated: 2026-04-12

## 1) この文書が扱う completion

この repo で扱う completion は、自由意思や自己主権の意味での completion ではありません。  
対象は、**固定された憲法の内側で動くワーカーが、どこまで運用上きちんと閉じているか** です。

つまり「AGI」という語を使うときも、何でも自己判断する存在を意味するのではなく、
ユーザー依頼を採択可能な成果物へ変換する運用知能として、どこまで completion を満たしているかを見ます。

## 2) 何を正本として見るか

- 見出しになる surface: `output/governance_public/worker_decision_surface.json`
- プログラム全体の readiness: `output/agi_readiness/goal_completion_status.json`
- 主観品質の補助面: `output/agi_readiness/subjective_goal_completion_status.json`
- 互換層: `output/agi_readiness/compatibility_completion_status.json`
- 古い互換別名: `output/agi_readiness/sovereign_goal_completion_status.json`

`sovereign` は互換用に残るだけで、いまの見出し語彙でも、現在の判断基準でもありません。

## 3) 何を満たせば completion と言えるか

completion は 1 つの score ではなく、次をまとめて見ます。

1. L0 / L1 / L2 を破っていない
2. literal request と latent intent に整合している
3. release-quality evidence がある
4. open debt が headline score をごまかしていない
5. self-improvement が bounded / auditable / non-regressive である

## 4) operational completion の最低条件

最低でも次を満たす必要があります。

- 採択可能な成果物になっている
- constitutional / permission boundary の内側にある
- signoff に足る evidence がある
- stable coverage の breadth がある
- residual risk が明示されている
- blocked agenda を放置していない

## 5) subjective completion の考え方

主観品質を含む task では、単に PASS が並ぶだけでは不十分です。

- benchmark superiority or parity を問う
- screenshot / reviewer / tester を持つ
- false-complete delivery を避ける
- 追加反復の期待値が低いことを示す

## 6) 複数の score view

readiness は 1 つの数字ではなく、複数の見え方を持ちます。

- internal governed score
- externally auditable score
- display final score
- blocked / insufficient-evidence / continuity debt による cap

## 7) 何を置き換えたか

以下の薄い leaf docs は、この文書に統合されています。

- rollback readiness
- self-directed capability closure
- sovereign agent completion
- workspace world model
- continuity closeout policy
- robustness remediation
- governed autonomous learning loop
- improvement lineage
- public hygiene policy
- governed live capability loop note

## 8) 関連 surface

- buyer-facing framing: `BUYER_PAIN_MAP.md`
- comparison framing: `PRODUCT_POSITIONING.md`
- capability framing: `CAPABILITY_SURFACE.md`
- active implementation shape: `CURRENT_ARCHITECTURE.md`
- eval extension: `AGI_V1_EVAL_FRAMEWORK.md`

## Autonomous Learning Count Contract

- `currentVerifiedPositiveCount`: verified-positive entries in the current `exportSessionId` window.
- `historicalVerifiedPositiveCount`: cumulative verified-positive carry from prior `exportSessionId` windows only.
- `summary.verifiedPositive`: strict equality with `currentVerifiedPositiveCount`.
- `countSemantics`: machine-readable contract embedded in the artifact and enforced by strict public eval.
- This supporting contract does not change the headline: `worker_decision_surface` stays primary, while program readiness / subjective companion / compatibility remain separate scopes.

<!-- compatibility markers:
POST /api/exec
POST /api/eval/run
worker_decision_surface.json
program-readiness
-->
