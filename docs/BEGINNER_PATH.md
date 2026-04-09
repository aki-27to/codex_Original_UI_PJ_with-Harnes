# BEGINNER_PATH

この repo を最短で理解するための 1 ページです。

## 1) まず何者か

これは governed harness / agent OS です。

- 主経路は `POST /api/exec`
- 評価と昇格は `POST /api/eval/run`
- `agi_v1` は既存 eval flow の extension-only profile

単なる narrow app ではなく、AI 実行、証拠、評価、release decision をまとめて扱う repo です。

## 2) どこが truth source か

まず見る場所:
- ルール: `../AGENTS.md`
- 全体像: `../HARNESS_MAP.md`
- 今の設計: `CURRENT_ARCHITECTURE.md`
- 証拠条件: `EVIDENCE_CONTRACT.md`
- 機械可読 contract: `../scripts/config/`

迷ったら、narrative doc だけで決めず、machine-readable contract と runtime proof も見ます。

## 3) 実行されたら何を見るか

- 直近の operator summary: `logs/current/`
- proof / signoff bundle: `logs/bundles/`
- intentional artifacts: `output/`
- transient local material: `runtime/`

覚え方:
- `logs/` = governed evidence
- `output/` = intentional artifacts
- `runtime/` = transient local material

## 4) 実行の流れ

1. 依頼が UI か app surface から入る
2. Harness が `POST /api/exec` で実行する
3. 実行結果の要約が `logs/current/` に出る
4. 必要なら `POST /api/eval/run` で eval / promotion を回す
5. release decision は evidence と contract から決まる

## 5) 最初に触るコマンド

- 起動: `../start_codex_ui.bat`
- UI: `http://127.0.0.1:57525`
- コマンド一覧: `npm run help:scripts`
- public regression: `npm run regression:public`
- repo quality gate: `npm run test:repo-quality`

## 6) 迷ったら

- app の話か、harness core の話かを先に分ける
- companion detail は core architecture に混ぜない
- `output/` に置くべきか、`runtime/` に逃がすべきかを先に決める
- owner-local defaults と universal guidance を混同しない
