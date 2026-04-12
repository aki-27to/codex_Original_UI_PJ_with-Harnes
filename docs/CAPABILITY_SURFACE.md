# いま見せられること

Authority role: `navigation / capability summary only`  
Authority registry: `authority-registry.v1`

このページが答える問いは 1 つです。  
**いま、この repo は何を目に見える形で示せるのか。**

これは「いま見せられること」の要約であって、正本ではありません。固定ルールは `HARNESS_CONSTITUTION.md` と `AGENTS.md` を見てください。

## 中心的な性格

この repo が特に強いのは次です。

- 統治付き高自律ワーカー基盤
- 証拠を伴う出荷判断と到達度の仕組み
- local-first の Codex App Server harness

主価値として前面に出していないもの:

- 対応先の多さそのものを主価値にした仕組み
- 接続先の多さを前面に出す仕組み
- 何でも派手に見せるだけの実行環境

<!-- ## Three Visible Jobs -->
## 3 つの目に見える仕事

対応できる仕事の幅を見せたいとき、機能名の並べ立てから始めてはいけません。  
人が最初から最後まで追える仕事から入ります。

| 仕事 | 開始点 | 見えるもの | 根拠面 | 触る場所 |
| --- | --- | --- | --- | --- |
| 委ねられた実装を終える | `POST /api/exec` または Console | 稼働中のワーカー、専門ワーカーへの委譲、証拠、成果記録 | `output/governance_public/`、`output/agi_readiness/` | Overview、Console、`logs/current/` |
| 出荷判断を返す | `POST /api/eval/run` または Overview -> Evidence | 最終判定、実行根拠、評価履歴、到達度、出荷判断 | `output/governance_public/bundle_overview.md`、`output/agi_readiness/goal_completion_status.md` | Overview -> Evidence、`output/` |
| 長時間タスクを引き継ぐ | Overview -> Memory または `/api/continuity/*` | 現在の目的、引き継ぎ、負債、再開状態、記憶のまとめ、制御された改善状態 | `output/memory_public/`、`output/continuity_public/` | Overview -> Memory、continuity APIs |

## 目に見える機能一覧

| 面 | 見えるか | どこで見るか | 何を意味するか |
| --- | --- | --- | --- |
| 標準の実行経路 | はい | `POST /api/exec`、HarnesUI | 委ねられた仕事を進める主経路が固定されている |
| 評価と出荷判断 | はい | `POST /api/eval/run`、`output/governance_public/` | 出荷判断を証拠面で行う |
| 段階的な計画 | はい | `logs/current/`、HarnesUI、planning contracts | 要件の固定、計画の深さ、計画状態が見える |
| 専門ワーカーへの委譲 | はい | 構成図、実行面、統治 bundle | 親子の役割分担が見える |
| 統治付きの記憶と継続 | はい | Overview の Memory、`output/memory_public/`、`output/continuity_public/` | 再開時に意図と経緯を失わない |
| 制御された自己改善 | はい | readiness outputs、learning status、policy docs | 改善はされるが、統治は勝手に変わらない |
| 公開できる証拠の書き出し | はい | `output/governance_public/`、`output/agi_readiness/` | 第三者が判断根拠を追える |

## この repo が見せている「幅」とは何か

この repo の幅は、「何でも派手にできる」ことではありません。  
固定された権限境界の内側で、**実装、判定、再開、改善** を 1 つのハーネスとしてつなげて見せられることです。

## 関連文書

- `DEMO_FLOWS.md`
- `BUYER_PAIN_MAP.md`
- `COMPARISON_BOUNDARY.md`

<!-- ## Touch It Now -->
## いま触るならここ

- Overview で現在のワーカー判断を見る
- Capabilities で 3 つの仕事を見る
- Demo Flow で最初から最後までの流れを見る
- Evidence で最終判定と実行根拠を開く
