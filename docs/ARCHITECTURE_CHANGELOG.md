# ARCHITECTURE_CHANGELOG

Updated: 2026-04-12

- 2026-04-12: Hardened the internal Codex app-server client against stale child-process state. `server.js` now treats destroyed stdin / killed child handles as restart-required before issuing a new RPC, and the transport resilience suite covers the specific race where a dead child reference survives long enough to make `turn.prepare` fail with `app-server is not running`.
- 2026-04-12: Added an explicit single-harness multi-plane contract for the repo. Introduced `scripts/config/harness_plane_contract.json` plus `scripts/lib/harness_plane_contract.js`, exposed the plane summary in `/api/runtime`, and synchronized public governance export overview data so execution, evaluation, monitoring, and governance stay inside one governed harness with clearer trust boundaries. The evaluation route now fail-closes configured protected lanes through the eval-lane access policy, while worker-centric current truth remains centered on `worker_decision_surface` and `sovereign` stays a legacy compatibility alias only.
- 2026-04-12: Unified the repo's top-level governed-decision surface around a worker-centric outcome model and neutralized the remaining public completion vocabulary. Added `scripts/config/worker_decision_surface_contract.json` plus `scripts/lib/worker_decision_surface.js`, wired governance runtime/eval/turn/public export surfaces to emit `worker_decision_surface`, and updated `server.js` to expose the same summary in `/api/runtime`. The governed memory public export now writes `output/agi_readiness/compatibility_completion_status.{json,md}` as the preferred checked-in completion companion while retaining `sovereign_goal_completion_status.{json,md}` only as a legacy compatibility alias for older consumers. Public docs/tests were synchronized so adoption-readiness, latent-intent alignment, and minimal-HITL now resolve through one top-level worker-facing decision surface instead of split vocabularies.

この文書は、現行アーキテクチャへ効いている主要変更だけを日本語で残した履歴台帳です。細かい一時実験や古い mixed-language ledger は Git history に委ね、ここでは current-use surface を理解するために必要なマイルストーンを保持します。

## 2026-04-12

- docs surface を整理し、front-door / authority / proof / runbook を役割別に再編した
- stale な thin docs を統合し、`docs/AGI_OPERATIONAL_COMPLETION.md` に readiness/completion の説明を集約した
- human-facing docs を `docs/human/` に整理し、active overview を `docs/human/AI_AGENT_HARNESS_DETAILED_DESIGN.html` に移した
- Copilot Studio 補助資料を `docs/integrations/copilot-studio/` に整理した
- AGI v1 sample artifacts を `docs/samples/agi_v1/` に整理した
- current-use docs を日本語 front door として読める形へ寄せた

## 2026-04-11

- repo の front door を architecture-first から buyer/job-first へ再構成した
- 追加 docs:
  - `docs/DEMO_FLOWS.md`
  - `docs/CAPABILITY_SURFACE.md`
  - `docs/BUYER_PAIN_MAP.md`
  - `docs/PRODUCT_POSITIONING.md`
  - `docs/COMPARISON_BOUNDARY.md`
  - `docs/PROVIDER_AND_PORTABILITY.md`
- `output/governance_public/` に repo-safe public governance proof bundle を追加した
- readiness headline を internal governed score と externally auditable score に分離した
- authority wording drift を除去し、`HARNESS_CONSTITUTION.md` を single supreme frozen constitution として固定した
- `server.js` の一部 runtime / governance glue を `scripts/lib/*` へ切り出した

## 2026-04-09

- GitHub 側へ local constitution を mirror する governance surface を追加した
- `.github/copilot-instructions.md`, `.github/instructions/`, `.github/agents/` を整備した
- `docs/CURRENT_ARCHITECTURE.md` を source-first / docs-first の current spec に寄せた
- repo root から長文教材を `docs/human/legacy/AI_AGENT_HARNESS_TEXTBOOK_JA.html` へ寄せた

## 2026-04-08 以前

- HarnesUI を operator-centered / chat-first に段階的に簡素化した
- voice strip を main console から除去し、text-only standard path へ戻した
- memory / self-improvement / current-surface / signoff bundle の固定面を整備した

## 運用ルール

- 動作や posture が変わる変更では、`docs/CURRENT_ARCHITECTURE.md` とこの文書を対で更新する
- narrative doc は machine-readable contract と runtime proof より下位
- 詳細な古い差分は Git history を参照する

<!-- compatibility markers:
GitHub-native Copilot governance surface
-->
