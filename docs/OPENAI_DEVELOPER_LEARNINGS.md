# OPENAI_DEVELOPER_LEARNINGS

Updated: 2026-04-12

## How to use

これは constitutional authority ではなく、OpenAI developer article から抽出した portable learning の curated doc です。runtime retrieval や bounded self-improvement proposal の素材として使います。

## Topic: agents

最近の主な学習:
- agent product は prompt 単体ではなく product loop で評価する
- long-horizon task は coherence 維持が重要
- frontend quality は生成だけでなく inspect / test / verify の閉ループが必要
- repo-local skill と repeatable workflow が保守速度を上げる
- context は丸ごと入れるのでなく retrieval pack として絞る

## Usage Rule

- frozen constitution を上書きしない
- Step 1/2 contract を勝手に rewite しない
- portable guidance だけを runtime hint 候補にする
- risky target は proposal-only に留める
