# Godot MCP 外洋設計レビュー

Status: `independent review memo`  
Reviewed artifact: `docs/integrations/godot/godot-mcp-ocean-design.md`

## Verdict

現時点の設計は、phase-0 architecture draft として phase-1 implementation kickoff に使える水準です。

## What Was Strengthened

- bootstrap / attach contract を追加し、初回接続の止まり方を固定した
- supported envelope を追加し、`Godot 4.x only` と `single local editor per project` を明示した
- session lifecycle contract を追加し、stale / reconnect / exclusive lock の状態を固定した
- rollback matrix を追加し、scene / script / resource / import / mixed / unsaved state の復元責務を分けた
- mutation policy classes を追加し、自律実行・preview-first・user-reserved の境界を固定した
- repo adoption evidence を追加し、既存ハーネスの doc-sync / smoke / coherence obligations へ接続した

## Highest Remaining Risk

最大の未証明点は、dirty in-memory scene を含む mixed transaction の rollback です。  
設計上の定義は入ったが、実際に Godot editor 上で restore semantics が安定するかは implementation spike で先に潰す必要があります。

## First Spike

最初の実装スパイクは次に絞るのが妥当です。

1. addon attach
2. current scene tree observation
3. single-scene property mutation
4. checkpoint restore for dirty in-memory scene

この spike が通れば、設計の最重要仮説が 1 本目で検証できます。
