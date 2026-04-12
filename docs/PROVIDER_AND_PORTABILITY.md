# Provider And Portability

Authority role: `navigation / portability boundary only`  
Authority registry: `authority-registry.v1`

このページは、「この repo が portability をどう扱っているか」を正直に説明するための文書です。

## 現在の立ち位置

この repo は portability を無視しているわけではありません。  
ただし、**provider の多さを主価値にした broad runtime product** を目指しているわけでもありません。

現在の中心は次です。

- Codex App Server 連携を軸にした local-first 実行
- `POST /api/exec` と `POST /api/eval/run` を固定した運用
- authority、evidence、release judgment をぶらさないこと

## 既定 posture

- architecture default: `portable_local`
- 強いローカル権限を使う posture: `owner_local`
- レビュー付き change control を前提にした posture: `reviewed_team`

## portability で優先すること

- provider を増やすことより、authority と evidence を壊さないこと
- execution path を増やすことより、主要 route を固定すること
- broad runtime product に見せることより、adoptability を守ること

## いまやらないこと

- broad runtime product と同じ provider breadth を追うこと
- breadth を見せるためだけに execution path を増やすこと
- governance を薄めて portability を優先すること

## 一言でいうと

この repo は portability を否定しません。  
ただし、**採択可能性を先に守り、その範囲で portability を扱う** という順番を崩しません。
