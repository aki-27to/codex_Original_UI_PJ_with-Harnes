# Codex Governed Harness

Authority role: `navigation / entrypoint only`  
Authority registry: `authority-registry.v1`

<!-- machine-readable compatibility markers:
single governed harness
CODEX_REQUEST_USER_INPUT_POLICY=auto-default
127.0.0.1:57525
-->

Optional standalone English conversation app: `127.0.0.1:57526`

## このリポジトリは何か

このリポジトリは、**AI に任せた仕事を、証拠つきで採択可能な成果物まで持っていくためのローカル実行基盤**です。  
AI に主権を渡すのではなく、人間が決めた憲法、権限境界、停止条件、出荷条件の内側で、できるだけ自律的に仕事を進めます。

この repo が大事にしているのは、次の 3 点です。

- ユーザーの依頼文と、その背後にある意図の両方に沿うこと
- 根拠が足りないまま進まず、必要なら正直に止まること
- 最後に人が「これなら通してよい」と判断できる証拠を返すこと

主な経路は次の 2 つです。

- 実行: `POST /api/exec`
- 評価と出荷判断: `POST /api/eval/run`

## 1 つのハーネスの中で何をしているか

この repo は、別々の製品を並べているのではなく、**1 つのハーネスの中で役割を分けている**構成です。

- 実行: 依頼理解、計画、ツール利用、専門ワーカーへの委譲、成果物の作成
- 評価: 再実行による確認、回帰検知、保護付き評価、出荷判断
- 監視: `logs/current/`、`output/`、`runtime/` を通じた状態把握
- 統治: `worker_decision_surface`、最終判定、昇格 / 非昇格、停止判断

この repo は、**固定された憲法と権限境界の内側で、委ねられた仕事を広く自律的に進め、最後は採択可能な成果物として着地させること**を重視しています。  
対応先の多さや派手な機能一覧そのものを売り物にしているわけではありません。

## いまの公開上の判断面

- `output/governance_public/worker_decision_surface.json`
  - 現在のワーカー判断を示す最上位の公開面
  - 区分: `worker_decision`
- `output/agi_readiness/goal_completion_status.json`
  - プログラム全体の到達度を示す補助面
  - 区分: `program_readiness`
- `output/agi_readiness/subjective_goal_completion_status.json`
  - 主観品質を含む補助判定面
  - 区分: `subjective_companion`
- `output/agi_readiness/compatibility_completion_status.json`
  - 互換層の補助面
  - 区分: `compatibility_layer`
- `output/agi_readiness/sovereign_goal_completion_status.json`
  - 古い互換名
  - いまの見出し語彙ではありません

### Current truth semantics

- `worker_decision_surface.json` remains the only top-level worker headline.
- `worker_completion_status.json` is a supplemental worker-stop companion: it never replaces the headline, but it makes the background readiness debt explicit when `worker_decision_surface` is still allowed to stop.
- `goal_completion_status.json` and `subjective_goal_completion_status.json` expose `runningAgendaDecisionBasis`.
- `autonomous_learning_status.json` exposes both the broader supporting counts (`currentRunningCount`, over non-`memory_eval` agenda entries) and the gate-consumed subset (`gateDecisionCounts.running`).
- `self_directed_probe_status.json` exposes `currentSnapshot`, `effectiveHistoryAware`, `requiredThresholds`, `meetsThresholds`, and `thresholdDecisionBasis`.
- `novel_task_acquisition.json` exposes the same threshold-basis fields, including the no-history-uplift case.

<!-- ## What Pain It Removes -->
## 何がつらい人向けか

この repo は、次のようなつらさを減らすためにあります。

- AI が「終わった」と言うのに、実際には出せる状態になっていない
- なぜ安全だと判断したのかを、毎回人が説明し直している
- 長い作業をまたぐと、前提や経緯が失われる
- 途中で依頼からずれても、気づくのが遅れる
- 実行は AI がやるのに、最後の信頼責任だけ人に重く残る

<!-- ## What You Can Hand To It Today -->
## いま任せられる仕事

- 実装や設定変更を進め、証拠つきで完了させる
- 出荷してよいかどうかを、根拠つきで判断する
- 長時間タスクをまたいでも、意図と状態を失わずに再開する
- 主観品質を含む変更について、追加の反復が必要かを判定する

<!-- ## Fastest 3-Minute Trial -->
## 3 分で確かめる

1. `npm start` でローカル UI を起動する
2. `http://127.0.0.1:57525` を開く
3. `Overview` で現在の状態を見る
4. `Demo Flow` で代表的な仕事を見る
5. `Evidence` で `worker_decision_surface` と最終判定を見る

補助コマンド:

- `npm run help:scripts`
- `npm run test:repo-quality`

<!-- ## Compare It On The Right Axis -->
## 比べるときの軸

この repo を比べるときは、次の問いから入ってください。

- 委ねた仕事を、採択可能な成果物まで正直に持っていけるか
- 固定された権限境界の内側で、自律実行できるか
- 根拠が薄いときに fail-closed で止まれるか
- 第三者があとから追える証拠を残せるか

対応先の数や、派手に広く見えるかどうかだけで比べると、この repo の実態を見誤ります。

## まず読む文書

- docs の入口: `docs/README.md`
- 最短の読み順: `docs/BEGINNER_PATH.md`
- 代表的な仕事: `docs/DEMO_FLOWS.md`
- できること: `docs/CAPABILITY_SURFACE.md`
- 何の痛みを減らすか: `docs/BUYER_PAIN_MAP.md`
- 比較の境界: `docs/COMPARISON_BOUNDARY.md`
- いまの技術仕様: `docs/CURRENT_ARCHITECTURE.md`
- 最上位の固定ルール: `docs/HARNESS_CONSTITUTION.md`
- 実行時の運用憲法: `AGENTS.md`
