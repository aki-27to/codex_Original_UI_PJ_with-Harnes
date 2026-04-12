# ANTHROPIC_ENGINEERING_LEARNINGS

Updated: 2026-04-12

## How to use

これは Anthropic engineering article から抽出した **portable** な agent-engineering learning の curated doc です。Claude 固有 mechanic を runtime policy に直接昇格させる場ではありません。

## Topic: agents

最近の主な学習:
- agent eval は infra noise に大きく揺れる
- brain と hands の分離が長時間運用で効く
- long-running work は harness design の差が大きい
- eval は complexity-aware に設計しないと意味が薄い
- AI-resistant evaluation が重要

## Usage Rule

- runtimeRetrieval は既定で無効
- doc sync / proposal / secondary reasoning に使う
- Claude-specific mechanic は portable guidance へ圧縮してから扱う
