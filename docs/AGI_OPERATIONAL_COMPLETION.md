# AGI Operational Completion

この repo では「公開上 AGI を証明した」ことと、「内部運用上、AGI に近い閉ループを持つ」ことを分けて扱います。

## Operational completion
次を同時に満たす状態を、内部運用上の到達に近い状態とみなします。

- governed memory が canonical truth として動作している
- bottleneck から autonomous learning agenda が生成される
- remediation の結果が observation と causal trace に戻る
- distinct incumbent / challenger lineage で改善履歴を持てる
- continuity debt を closeout loop に接続できる
- public proof が live truth と意味的に一致する

## What this is not
- 公開の AGI 証明ではありません
- unsupported / not evaluated / no evidence を成功扱いすることではありません

## Public proof surfaces
- `output/memory_public/*`
- `output/agi_readiness/*`
- `output/continuity_public/*`

## Interpretation
- readiness score は headline 指標です
- capability loop の成熟は、agenda / causal trace / lineage / debt の有無で見ます
- fail-closed 原則により、欠落した evidence は hold / block のまま残します
