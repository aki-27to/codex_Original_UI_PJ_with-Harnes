# 代表的な仕事の流れ

Authority role: `navigation / demo surface only`  
Authority registry: `authority-registry.v1`

このページは、深い設計書を読む前に **何を見せるべきか** を固定する文書です。  
記憶や自己改善の名前を先に並べるのではなく、読む人が最後まで追える仕事から入ります。

<!-- ## The Three Fixed Demo Jobs -->
## 3 つの固定デモ

| 仕事 | 開始点 | 見えるもの | 開く証拠 | 答える問い |
| --- | --- | --- | --- | --- |
| 証拠つきで実装を終える | `POST /api/exec` または Console | 稼働中のワーカー、専門ワーカーへの委譲、成果記録、実行の根拠、最終判定 | `output/governance_public/`、`output/agi_readiness/` | 委ねた実装作業を正直に終えられるか |
| 出荷してよいかを正直に決める | `POST /api/eval/run` または Overview -> Evidence | 最新の最終判定、評価履歴、実行の根拠、到達度 | `output/governance_public/bundle_overview.md`、`output/agi_readiness/goal_completion_status.md` | 出荷判断を根拠つきで信頼できるか |
| 途中からでも迷わず再開する | Overview -> Memory と `/api/continuity/*` | 現在の目的、記憶のまとめ、継続上の負債、引き継ぎ回数、復旧状態 | `output/memory_public/`、`output/continuity_public/` | 長時間タスクを意図と証拠を失わずに再開できるか |

## 1) 証拠つきで実装を終える

このデモで見たいのは次です。

- worker が委ねられた実装を最後まで進められるか
- 1 つの agent が全部やったように見せず、専門ワーカーを使い分けられるか
- 口頭の完了主張ではなく、証拠つきで終われるか

推奨導線:

1. Console から通常の委譲実行経路を走らせる
2. Overview で Capabilities を仕事単位で読む
3. Evidence で最新の実行根拠と最終判定を見る
4. 詳しい trace が必要なら `output/governance_public/bundle_overview.md` を開く

## 2) 出荷してよいかを正直に決める

このデモで見たいのは次です。

- 何かが動いたことと、採択可能な成果物であることを区別できるか
- 確認する人が「なぜ安全だと判断したか」を説明できるか
- 根拠が薄いときに正直に block できるか

推奨導線:

1. Overview -> Evidence を開く
2. 最新の最終判定、評価履歴、実行根拠をまとめて見る
3. `output/agi_readiness/goal_completion_status.md` を開く
4. `output/governance_public/bundle_overview.md` を開く

## 3) 途中からでも迷わず再開する

このデモで見たいのは次です。

- 長時間の作業でも継続性を保てるか
- 次の session が曖昧な記憶ではなく統治された状態を引き継げるか
- 見えない自己書き換えではなく、制御された改善に留まれるか

推奨導線:

1. Overview -> Memory を開く
2. 現在の目的、まとめられた記憶、継続上の負債を見る
3. `/api/continuity/tasks?state=all` を確認する
4. `output/memory_public/` と `output/continuity_public/` を照合する

## この 3 つはどこで見えるべきか

- `../README.md`
- `../web/01.HarnesUI/overview.html`
- `CAPABILITY_SURFACE.md`
- `BUYER_PAIN_MAP.md`
- `PRODUCT_POSITIONING.md`

<!-- ## One-Line Rule -->
## 一行ルール

仕組みを先に語るのではなく、まず「どんな仕事を最後まで任せられるか」を見せる。
