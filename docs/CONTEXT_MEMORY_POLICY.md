# CONTEXT_MEMORY_POLICY

Updated: 2026-04-12

## 1) 目的

この文書は governed memory の canonical policy を定義します。目的は「全部覚えること」ではなく、literal request / latent intent / execution history / successful procedure / failure pattern を、bounded で evidence-linked な retrieval pack に変換することです。

## 2) Core Model

memory は free-form summary ではなく、typed item graph として扱います。canonical store は event-backed で、runtime へは compiled retrieval pack を渡します。

## 3) Canonical Store

canonical append-only change stream:
- `logs/archive/raw/runtime_state/memory/memory_events.jsonl`

主要 projection:
- index / workspace-progress snapshot
- semantic lesson report
- retrieval pack
- output-facing memory summary

## 4) Memory Tiers

- episodic memory
  - 何をして何が起きたか
- semantic memory
  - repo / domain / user に関する安定知識
- procedural memory
  - うまくいく作業パターン
- evaluation memory
  - 何が通り何が落ちたか
- improvement memory
  - suggestion / reinforcement / blocked change

## 5) Retrieval Rule

retrieval は compile されるもので、丸ごと store を注入してはいけません。最低でも次を使って score します。

- authority
- scope
- task family
- owned path
- freshness
- evidence strength
- reinforcement state

compiled pack は `logs/archive/raw/runtime_state/memory/retrieval/` に保存し、section ごとの budget と selection reason を持ちます。

## 6) 圧縮・忘却

重要なのは retention より relevance です。

- stale item には warning を付ける
- old pack は retention policy で削減
- compatibility artifact は残しても canonical にはしない
- memory summary は projection であり正本ではない

## 7) 学習と昇格

successful procedure / evaluation lesson は、再現性・evidence ref・guard metric が揃ったときだけ `scripts/config/skill_catalog.json` へ昇格できます。free-form note をそのまま skill にしてはいけません。

## 8) 参照

- retrieval scoring: `scripts/config/memory_retrieval_policy.json`
- retention: `scripts/config/memory_retention_policy.json`
- skill promotion guard: `docs/SKILL_PORTFOLIO_GOVERNANCE.md`
- active architecture: `docs/CURRENT_ARCHITECTURE.md`
