# 誰のどんな負担を軽くするか

Authority role: `navigation / value translation only`  
Authority registry: `authority-registry.v1`

このページは、この repo の仕組みを「買い手にとって何が助かるのか」という言葉へ訳し直すための文書です。

## 短い要約

買い手が欲しいのは、英語の概念語そのものではありません。  
本当に欲しいのは、日々の仕事で起きる次のつらさを減らすことです。

- AI が「終わった」と言ったのに出せない、という事故を減らしたい
- 危ない変更が本番へ流れるのを防ぎたい
- AI に任せた仕事の確認を、もっと速く、もっときれいにしたい
- 出荷してよいかどうかを、曖昧さではなく根拠で決めたい
- 長い仕事でも、状態と意図を失いたくない
- 最後に責任を持つ人の負担を軽くしたい

<!-- What Responsibility Gets Lighter -->
## 誰の負担が軽くなるか

この repo の価値は、実在する人の責任を軽くするときにはっきり見えます。

- 確認する人
  - 生のログや曖昧な自信表現から、出荷理由を組み立て直さなくてよい
- 運用する人
  - 本当に終わったのか、止まっているのか、形だけ閉じたのかを推測しなくてよい
- 最終責任を持つ人
  - 長い作業の引き継ぎを人力だけで抱え込まなくてよい
- AI を現場に入れたいチーム
  - 証拠のない「終わりました」を信用しなくてよい

<!-- Pain -> What This Repo Does -->
## 痛みと、この repo が変えること

| 困りごと | この repo が変えること | 得られること | どこで見えるか |
| --- | --- | --- | --- |
| AI は終わったと言うが出荷できない | 手続き上の終了と、採択可能な完了を区別する | 見かけだけ終わった成果物を確認工程に流しにくくする | `docs/HARNESS_CONSTITUTION.md`、`output/agi_readiness/`、`output/governance_public/` |
| なぜ安全だと判断したか説明できない | 公開できる証拠と出荷判断の成果物を出す | 確認の負担と監査の摩擦を下げる | `output/governance_public/` |
| AI に任せた仕事が元依頼からずれる | 要件と意図の面を固定し、黙った目標差し替えを拒否する | ずれたまま採択に進む事故を防ぐ | `AGENTS.md`、`scripts/config/task_outcome_contract.json`、`scripts/config/iteration_control_contract.json` |
| 長時間タスクが session をまたいで前提を失う | 統治付きの記憶と継続状態を保持する | 引き継ぎ負債を下げ、再開を具体的にする | `output/memory_public/`、`output/continuity_public/`、HarnesUI Overview |
| いつ止めるべきか分からない | release / block / needs_input / failed_validation を分ける | 止める、戻す、出す、を明示的に決められる | `docs/HARNESS_CONSTITUTION.md`、`output/agi_readiness/goal_completion_status.*` |
| 改善が見えず不安 | 好き勝手な書き換えではなく、範囲を絞った gated self-improvement にする | 目に見えない実行時 drift を continuous improvement でごまかさせない | `docs/SELF_IMPROVEMENT_POLICY.md`、readiness outputs、HarnesUI Overview |

## 防ぎたい事故

- 証拠が足りないまま変更を出荷する
- 元の依頼を黙って広げる
- 内部の都合だけ満たした成果物を採択可能だと言い張る
- 長時間作業をまたいだ瞬間に意図と根拠が消える
- 改善と言いながら、統治や評価を勝手に弱める

## ひと言でどう説明するか

この repo は、**AI に任せた仕事を、採択可能な成果物へ着地させるための統治付き高自律ワーカー基盤**です。

<!-- How To Pitch It In One Sentence -->
## 一文で言うなら

「AI に任せた仕事を、証拠つきで通せる形まで持っていくためのローカル基盤」です。
