# 最短の読み順

この文書は、約 5 分で repo の全体像をつかむための最短導線です。  
overview から入りたいなら、先に `human/AI_AGENT_HARNESS_DETAILED_DESIGN.html` を開いてから戻ってきてください。

## 0) そもそも自分向けか

次が最初の関心なら、この repo は向いています。

- AI に任せた仕事が、本当に採択できる状態まで届くか
- 自律実行が、固定された権限境界の内側に収まるか
- 確認する人が、出荷判断の根拠をたどれるか

逆に、次が第一優先なら別の製品の方が近いです。

- 対応先の多さ
- 接続先の広さ
- 定期実行中心の便利さ
- とにかく派手に幅広く見える実行環境

## 1) この repo は何か

この repo は、固定された憲法と権限境界の内側で、AI に仕事を進めさせつつ、最後は証拠付きで採択可能かどうかを返す **統治付き高自律ワーカー基盤** です。

中心は次です。

- 固定された権限境界
- 採択可能な成果物
- 根拠に基づく出荷判断
- fail-closed の停止
- 公開できる証拠面

主な経路は次の 2 つです。

- 実行: `POST /api/exec`
- 評価と出荷判断: `POST /api/eval/run`

そのほかの重要な置き場:

- 現在の運用状態の記録: `logs/current/`
- 公開できる証拠と到達度の面: `output/`

<!-- What To Click First -->
## 2) UI で最初に見る場所

1. Overview
2. Capabilities
3. Demo Flow
4. Evidence
5. Memory

この順に見ると、仕事、証拠、継続性がつながって見えます。

## 3) 最低限読む文書

1. `DEMO_FLOWS.md`
2. `CAPABILITY_SURFACE.md`
3. `BUYER_PAIN_MAP.md`
4. `COMPARISON_BOUNDARY.md`
5. `HARNESS_CONSTITUTION.md`
6. `../AGENTS.md`
7. `CURRENT_ARCHITECTURE.md`

## 4) すぐ触るコマンド

- ローカル UI を起動する: `npm start`
- Windows launcher を使う: `../start_codex_ui.bat`
- スクリプト一覧を見る: `npm run help:scripts`
- 品質ゲートを回す: `npm run test:repo-quality`

## 4.1) logs と proof の場所

- main execution route: `POST /api/exec`
- main evaluation route: `POST /api/eval/run`
- live logs / session traces: `logs/current/`
- exported proof / public artifacts: `output/`

## 5) 一言でいうと

固定された権限境界の下で、AI に仕事を進めさせつつ、最後は「通してよいか」を証拠付きで返す local-first のワーカー基盤です。
