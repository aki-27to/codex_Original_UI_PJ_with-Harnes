# 現在の技術構成

Updated: 2026-04-18

Authority role: `active design spec`
Authority registry: `authority-registry.v1`

<!-- machine-readable compatibility markers:
scripts/config/system_coherence_review_contract.json
scripts/config/harness_plane_contract.json
Execution plane
Monitoring plane
.github/copilot-instructions.md
.github/instructions/
.github/agents/
node scripts/github_copilot_governance_surface_test.js
-->

## 1) この文書の位置づけ

この文書は Codex App Server 連携ハーネスの **active design spec** です。
入口の説明は `README.md`、docs の入口は `docs/README.md`、最上位の固定ルールは `docs/HARNESS_CONSTITUTION.md` が担います。

### First-pass reviewer shortcut

reviewer が最初の 90 秒で確認する標準順序は次です。

- `output/governance_public/reviewer_start_here.json`
  - `task_verdict` と `program_readiness` の読み分けを最初に固定する
- `output/governance_public/worker_decision_surface.json`
  - その時点の対象範囲に対して運用者がどう判断すべきかを見る
- `output/governance_public/worker_completion_status.json`
  - headline を維持したまま背景 debt と readiness 補助面を見る
- `logs/current/latest_signoff_summary.json`
  - 現在 pointer の signoff bundle を開く

reviewer 向けの外部比較 refresh は `npm run reviewer:baseline-comparison` を正本とし、`reviewer_start_here.{json,md}` はそのコマンドを current aggregate と並べて表示する。

関連文書:

- `README.md`
- `docs/README.md`
- `docs/BEGINNER_PATH.md`
- `docs/DEMO_FLOWS.md`
- `docs/BUYER_PAIN_MAP.md`
- `docs/COMPARISON_BOUNDARY.md`
- `docs/PRODUCT_POSITIONING.md`
- `docs/WEEKLY_REPORT_COMPANION.md`
- `docs/PROVIDER_AND_PORTABILITY.md`
- `docs/human/AI_AGENT_HARNESS_DETAILED_DESIGN.html`
- `docs/human/legacy/AI_AGENT_HARNESS_TEXTBOOK_JA.html`
- `docs/ARCHITECTURE_CHANGELOG.md`

## 2) いま何を正本として見るか

この repo の現在の正本は、ワーカー中心で役割ごとに分かれています。

- 最上位の公開面: `output/governance_public/worker_decision_surface.json`
  - scope: `worker_decision`
  - その時点の対象範囲に対して、運用者がどう判断すべきかを示す面
- プログラム全体の到達度: `output/agi_readiness/goal_completion_status.json`
  - scope: `program_readiness`
  - repo / program 全体を見る補助面であり、ワーカーの見出し面ではない
- 主観品質の補助面: `output/agi_readiness/subjective_goal_completion_status.json`
  - scope: `subjective_companion`
- 互換層の補助面: `output/agi_readiness/compatibility_completion_status.json`
  - scope: `compatibility_layer`
- 古い互換別名: `output/agi_readiness/sovereign_goal_completion_status.json`
  - 互換用に残すだけで、いまの見出し語彙ではない

### Residual completion semantics

- `worker_decision_surface.json` stays headline-only. It is not replaced.
- `worker_completion_status.json` is a first-class supplemental worker artifact. It binds the worker headline to background readiness debt without promoting program-readiness NOT_YET into the top-level task verdict.
- `worker_completion_status.json` is trusted only when its background readiness inputs share the same `exportSessionId`; fail-closed evidence is exposed through `backgroundArtifactSessionConsistency` and `backgroundArtifactInputsTrusted`.
- `goal_completion_status.json` and `subjective_goal_completion_status.json` expose `runningAgendaDecisionBasis`, and their `runningAgendaCount` consumes `autonomous_learning_status.json.gateDecisionCounts.running`, not the broader `currentRunningCount`.
- `autonomous_learning_status.json` keeps the broader supporting counts (`currentRunningCount`) over non-`memory_eval` agenda entries and also exposes `gateDecisionCounts` plus `excludedMetaCompletionCounts` for the completion-gate subset.
- `self_directed_probe_status.json` exposes `currentSnapshot`, `effectiveHistoryAware`, `requiredThresholds`, `meetsThresholds`, and `thresholdDecisionBasis`; its threshold consumer reads the history-aware effective counts, not the raw snapshot alone.
- `novel_task_acquisition.json` exposes the same threshold-basis fields, but its threshold consumer is explicitly `current_snapshot_no_history_uplift`.

### Task verdict vs program readiness

- ordinary task completion keeps the task verdict primary through `worker_decision_surface.json`
- `worker_completion_status.json` can carry non-blocking background debt, but it must keep `programReadinessBlockingWorkerStop = false` whenever the worker headline remains complete
- program readiness becomes blocking only for explicit readiness / release / whole-harness completion asks
- for ordinary task reporting, program readiness stays background telemetry instead of overriding the task verdict
- reviewer-facing read order is fixed to `reviewer_start_here.json` -> `worker_decision_surface.json` -> `worker_completion_status.json` -> `bundle_overview.md`

### Server-boundary proof surface

- `ac-1`: reviewer refresh and packet reopen stay package-visible through `npm run reviewer:baseline-comparison` and `npm run reviewer:server-boundary-proof`
- `ac-2`: tester verification stays package-visible through `npm run test:server-boundary-proof`, which covers the extracted server-boundary split tests plus the reviewer/export proof surfaces
- reviewer evidence artifacts are `output/server_boundary_refactor_reviewer_evidence.md` and `output/playwright/reviewer-overview-2026-04-13.png`
- tester evidence artifacts are `output/server_boundary_refactor_tester_evidence.md` and `output/submission_artifacts.json`

## 3) 1 つのハーネスの中にある 4 つの面

この repo は 1 つの統治付きハーネスの中に複数の面を持たせています。
分かれているのは repo ではなく、**信頼境界と責務**です。

### 実行面

- 主要経路: `POST /api/exec`
- 役割: 依頼理解、計画、ツール利用、専門ワーカーへの委譲、継続状態の保持、成果物と証拠の記録
- 最適化対象: 採択可能な成果物、不要な人手介入の削減、時間 / コスト効率、継続性の品質

### 評価面

- 主要経路: `POST /api/eval/run`
- 役割: 再実行による確認、採点、回帰検知、保護付き評価、到達度確認、fail-closed の検証
- 最適化対象: 比較可能性、再現可能性、漏えい耐性、回帰への感度

### 監視面

- 主要な公開面: `GET /api/runtime`、`GET /api/harness/overview`、`logs/current/`、`output/`、`runtime/`
- 役割: 稼働状態の把握、`logs/current/` の見える化、`output/` の見える化、運用者が確認できる drift / debt の追跡

### 統治面

- 見出しとなる公開面: `output/governance_public/worker_decision_surface.json`
- 支える公開面: `goal_completion_status.json`、`subjective_goal_completion_status.json`、`compatibility_completion_status.json`、最終判定や bundle overview の成果物
- 役割: 最終判定、出荷判断、昇格 / 非昇格、採択 / 保留判断、方針に沿った停止判断

## 4) 信頼境界のルール

- 実行面は hidden grader asset に依存してはいけない
- 実行面は、運用者向けの出荷可否を単独で確定してはいけない
- 統治面は hidden benchmark や protected holdout の結果をまとめてよい
- 統治面は program-facing score と worker-facing decision を混同してはいけない
- 互換面は legacy alias を提供してよいが、primary vocabulary を上書きしてはいけない

## 5) 主要経路と posture

- execution route: `POST /api/exec`
- evaluation / release route: `POST /api/eval/run`
- legacy local orchestration: `/api/batch/*`
- reference architecture default: `portable_local`
- stronger local ownership posture: `owner_local`
- reviewed team posture: `reviewed_team`
- `GET /api/runtime` exposes `activePostureProfile` as live truth, so `owner_local` and `portable_local` are not inferred from prose or launcher assumptions.
- `GET /api/runtime` also exposes `repoTruth` / `repo_truth` as a read-only current-truth snapshot. It separates `HEAD`, `dirty_working_tree`, `live_runtime`, and `generated_output`, includes `HEAD` versus `origin/*` commit equality, classifies dirty files as `intended_change_candidate`, `generated_side_effect`, or `unorganized_diff`, and carries `liveVerificationTimestamp` for final reporting.
- `GET /api/runtime` publishes `currentTruth.operationalPosture` / `operationalPostureCurrentTruth` as reviewer-facing current truth. It keeps `owner_local`, `danger-full-access`, `approval_policy = never`, autocommit, and autopush visible as current runtime facts rather than portable reference defaults.
- `COMPLETED`, `RELEASE_APPROVED`, and `NOT_YET` are scoped through `statusScopeMap`: task completion, release/signoff approval, and program-readiness debt must not be collapsed into one success label.

### Runtime server composition

- external runtime entrypoint: `server.js`
- implementation root: `server_impl.js`
- request/bootstrap split: `server/request_handler.js`, `server/route_services.js`, `server/request_handler_context.js`, `server/bootstrap.js`
- explicit route families: `server/routes/{runtime,batch,app,conversation,voice,replay,eval,exec}_routes.js`
- the runtime split is compatibility-first: public routes stay fixed, and unextracted paths continue to fall back through the existing implementation
- current stage: route-family, route-service composition, request-handler context, bootstrap, and primary `apps` / `conversation` / `voice` / `replay` / `exec` / `eval` service boundaries are extracted, while most remaining runtime/governance logic still lives in `server_impl.js`
- `apps` / `conversation` / `voice` / `replay` / `exec` / `eval` are now reviewer-visible at the route-family boundary, the route-service composition boundary, and the direct grouped service boundary through `server/routes/{app,replay,conversation,voice,eval,exec}_routes.js`, `server/route_services.js`, `server/request_handler_context.js`, and `server/services/{harness_app_service,replay_service,conversation_service,eval_service,exec_service}.js`
- reviewer-facing harness overview assembly is now extracted into `server/services/harness_overview_snapshot_service.js`, so `server_impl.js` no longer owns the eval-history / execution-memory / topography helper cluster inline
- `GET /api/harness/overview` is a no-write read surface. It reuses the runtime governed-memory snapshot and does not refresh governed-memory or tracked `output/*` artifacts during page polling.
- `scripts/run_repo_quality_gate.js` is the canonical repo-quality stage runner and now executes package scripts through direct process invocation on Windows instead of a `shell: true` path
- detailed route-to-service mapping and residual decomposition points live in `docs/SERVER_ARCHITECTURE_MAP.md`

### App-server capability-gated behavior

- `server_impl.js` exposes capability snapshot, memory bridge snapshot, and cwd canonicalization snapshot together in the runtime transport surface. The runtime now reports `capabilitySnapshot`, `memoryBridge`, and `canonicalization` on the app-server transport object.
- Thread/session reuse no longer compares raw cwd strings. `normalizeDirectoryPathIdentity(...)` strips Windows extended-length prefixes, absorbs case drift on Windows, and trims trailing separators before planning carryover and reset decisions.
- `POST /api/exec` accepts `memoryMode` and `resetCodexMemory`, preserves them through idempotency/replay memory, and applies capability-gated memory config when a new app-server thread starts. Remote memory reset remains fallback-safe: unsupported app-server capability falls back to local planning-context cleanup instead of inventing a new route.
- MCP telemetry now records richer aggregates on each turn: `mcpWallTimeMs`, `mcpPerServerCounts`, `mcpNamespaces`, `mcpSandboxStates`, and `mcpParallelSafeCallCount`. These fields flow into the logging surface and the harness overview recent-execution snapshot.
- Configured MCP servers in `.codex/config.toml` must stay represented in `scripts/config/tool_registry_manifest.json`. `test:mcp-tool-registry-alignment` compares those surfaces so optional external MCPs such as `stitch` are visible with capability, risk, access mode, status, and fallback boundaries instead of remaining hidden configuration.
- `harness_artifacts` is a repo-local read-only MCP observation surface for allowlisted governance, readiness, and current-log artifacts. It must not calculate worker decisions, update scores, mutate files, run shell commands, or call external networks.
- `POST /api/replay/turn` remains the primary replay route, but replay mode is now capability-aware. When turn artifacts exist and `rawTurnItemInjection` is reported as `supported`, replay can return `artifact_snapshot`; otherwise it falls back to `live_rerun`.

`portable_local` は「広く配れる形」を優先する既定姿勢です。
`owner_local` はローカル所有者の強い権限を含められますが、共通既定ではありません。
`reviewed_team` はチーム運用を前提に、証拠とレビューを強めた姿勢です。

Launcher posture: the desktop launcher keeps `CODEX_REQUIRE_ADMIN=0` and `CODEX_AUTO_OPEN_BROWSER=0` by default. Operators can still opt in to elevation or browser auto-open through the environment, while UI-triggered restart helpers keep elevation, browser auto-open, and pause disabled.

## 6) 現在の構成
- `natural_task_trace_summary.json` records the selected implementation-bearing turn id and thread id, so trace bundles stay anchored to the delegated turn even when later completions share the thread.
- `SIGNOFF_ASSURANCE` sample runs keep reviewer/tester execution and doc-sync evidence co-located in signoff bundles.

この repo は、1 つのハーネスの中に次を収めています。

- 制御の面
- ワーカーの面
- 評価の面
- 記憶と継続の面
- 公開証拠の面

ただし、これらは別製品ではありません。
**固定された権限境界の内側で役割を分けているだけ**です。

現在の補助 surface:

- `natural_task_trace_summary.json` records the selected implementation-bearing turn id and thread id, so trace bundles stay anchored to the delegated turn even when later completions share the thread
- `SIGNOFF_ASSURANCE` sample runs keep planning depth, assurance depth, reviewer/tester execution, and doc-sync evidence co-located in signoff bundles

## 7) 機械可読 contract

主要な機械可読 contract は次です。

- `scripts/config/harness_contract_spec.json`
- `scripts/config/task_outcome_contract.json`
- `scripts/config/user_facing_response_contract.json`
- `scripts/config/design_acceptance_contract.json`
- `scripts/config/iteration_control_contract.json`
- `scripts/config/adoption_readiness_evaluator_contract.json`
- `scripts/config/self_steering_runtime_contract.json`
- `scripts/config/worker_decision_surface_contract.json`
- `scripts/config/deployment_posture_profiles.json`

## 8) 現在の公開面と最終判定 bundle

現在の公開面として最低限そろっているべきもの:

- `design_conformance_summary.json`
- `latest_run_summary.json`
- `latest_signoff_summary.json`
- `review_load_breakdown.json`
- `operator_summary.json`

最終判定 bundle の最上位構成も固定です。

代表例:

- `bundle_overview.md`
- `worker_decision_surface.json`
- `goal_completion_status.json`
- `subjective_goal_completion_status.json`
- `compatibility_completion_status.json`

## 9) 現在の学習面

Tracked learning artifacts are refreshed by the fixed command `npm run refresh:learning-output`. Server startup keeps background refresh disabled by default, runtime turn observations stay transient unless background refresh is explicitly enabled, and runtime retrieval can still read the last committed learning artifacts. Runtime GET is read-only, and default `GET /api/harness/overview` is a light polling profile: it can inspect runtime/current-truth state but defers bundle, eval-history, execution-memory, replay-memory, browser-capability, and continuity reads to `GET /api/harness/overview?detail=full`.

この repo は OpenAI developer lane と Anthropic engineering lane を持ちます。
ただし、実行時の取り込みまで開いている主レーンは OpenAI 側です。Anthropic 側は補助レーンとして、持ち運びやすい原則の抽出と提案生成に寄せています。

現在の学習面で見る主なもの:

- `output/openai_blog_learning_report.md`
- `output/anthropic_engineering_learning_report.md`
- `output/agi_readiness/autonomous_learning_status.json`
- `runtime_snapshot.json`
- `signoff_summary.json`

Design-sensitive UI completion is current-truth gated by `GET /api/runtime` under `designCompletionEvidence`: screenshot evidence and reviewer evidence must be present together, otherwise the completion state is `FAILED_VALIDATION`.

## 10) この repo をどう呼ぶか

この repo は、対応先の多さや派手さを前面に出す実行環境ではありません。
正確には、**固定された権限境界の内側で、AI に仕事を進めさせ、その結果を採択可能かどうかまで判断する統治付き高自律ワーカー基盤**です。

## Autonomous Learning Verified-Positive Contract

- `currentVerifiedPositiveCount`: current `exportSessionId` window 内で `remediationEffect = "verified_positive"` になった件数。同じ window の `passed` terminal entry を含む。
- `historicalVerifiedPositiveCount`: prior `exportSessionId` windows から carry された verified-positive 累積。current window 分は含めない。
- `summary.verifiedPositive`: total ではなく `currentVerifiedPositiveCount` と strict equality。
- `countSemantics`: JSON artifact に同梱される machine-readable contract。strict public eval が summary/count equality と合わせて fail-closed で検証する。

## 11) Correction-Driven Learning Path

The harness now treats correction handling as a first-class runtime path instead of a prose-only afterthought.

- `Intent Lock` and `Acceptance Lock` remain separate concerns
- a user correction should first create a correction event, then pass through `Learning Triage`
- `Learning Triage` does not patch `skill` directly
- the runtime now separates `patch_target_decision`, `improvement_lifecycle_decision`, and `skill_promotion_audit`
- the routing principle is `smallest_scope_that_prevents_recurrence`
- `skill` remains a post-patch destination reached only after replay verification, reusable-workflow evidence, repeated success, and promotion audit

Current implementation surfaces:

- contract: `scripts/config/correction_learning_contract.json`
- runtime policy: `scripts/lib/correction_learning_policy.js`
- operator UI lifecycle: `web/01.HarnesUI/app.js`
- live status surface: the inline header pill appends the active Codex CLI version from `/api/diagnostics` whenever the diagnostics probe reports a usable `codex --version`
- single-writer coordination: `scripts/config/dispatch_plan.schema.json` and `scripts/lib/planning_mode_policy.js` now publish `coordinationMode`, `singleWriter`, `integrationOwner`, advisory agents, and fresh-reviewer requirement. Cross-specialist tasks keep multiple intelligence providers in the plan, but only the integration writer may apply file changes.
- writer mutex enforcement: `scripts/lib/agent_governance_policy.js` blocks unknown-agent file writes and rejects advisory or sibling writer attempts as `parallel_writer_conflict`; the selected integration owner may use the planned write set while ordinary role scope still applies outside that plan.
- HarnesUI coordination visibility: `web/01.HarnesUI/app.js` stores the plan coordination metadata from `plan/update` and surfaces the selected writer, advisory agents, and fresh reviewer requirement in the plan header.
- HarnesUI answer-format hint: `server/services/exec_service.js` appends a web-ui-only final-answer hint to ordinary `POST /api/exec` prompts so file-changing turns include a concise `変更ファイル` section, while slash commands and exact-output contracts remain untouched
- HarnesUI work-completion definition: `web/01.HarnesUI/app.js` treats `作業完了` as the state where the requested outcome is adoptable, final answer/evidence/verification are satisfied, and no in-flight work or blocking gate remains. Every other visible state is `作業未完了`, with the reason shown separately (`作業中`, `確認待ち`, `中断`, `検証未通過`, `要件未確定`, or `未開始`).
- HarnesUI web-app restart control: `POST /api/server/restart` is a control-token protected local endpoint that launches a hidden detached restart helper. The helper waits for the HTTP response to flush, stops the current server PID, relaunches `start_codex_ui.bat` with browser auto-open, elevation, and pause disabled, and writes its reload marker to `runtime/server_restart_result.json` so `logs/current/` remains fixed-five current truth. The UI exposes it as a compact topbar `Web再起動` button, refuses the restart while `/api/exec` work is active, and verifies the restart by observing a changed runtime PID or start timestamp.
- local exec ownership guard: the same HarnesUI pending projection now treats a live request controller in `s.req` as authoritative for send blocking, so transient `/api/runtime` idle snapshots cannot reopen resend while the active tab is still receiving stream output
- blocked requirement copy/tone: the same right-rail workflow now phrases requirement waits in shorter user-facing copy (`確認したい点があります…`, `回答待ちです。`) and uses an amber waiting tone for blocked workflow cards and status values instead of sharing the hard-failure red
- current work summary: the `今していること` field prefers the user-facing 5-step workflow detail copy, so it no longer surfaces raw `step x / y` plan text or internal quality-gate jargon
- user-facing top-level workflow: the primary HarnesUI card compresses progress to `依頼理解 -> 要件確定 -> 実行 -> 検証 -> 完了`, while the full 15-step operator lifecycle stays inside the detail fold
- completed-reply override: the same right-rail workflow suppresses stale `前回状態 / 要件未確定` carryover whenever the active chat already has a terminal `completed` result
- user-facing workflow semantics: visible planning/段取り work now lives inside the compressed `要件確定` step, while `実行` is reserved for actual file changes, investigation, generation, or draft-answer work; if execution starts before planning is in place, the compressed flow still surfaces that as an execution-order failure instead of showing a healthy run
- lifecycle copy-fit / wrap policy: `web/01.HarnesUI/styles.css`
- policy narrative: `docs/SELF_IMPROVEMENT_POLICY.md`

## 12) Self-Steering Runtime Control Surface

As of 2026-04-18, the harness contract surface explicitly separates `reporting` from the intended runtime primary control surface. The new machine-readable contract is `scripts/config/self_steering_runtime_contract.json`.

- controller-heavy self-steering is now defined through `candidate_directions`, `chosen_direction`, `rejected_directions`, `kill_conditions`, `current_gap`, and `self_correction_applied`
- latent intent is now contractually evaluated through `candidate_intent_hypotheses`, `chosen_intent_model`, `benchmark_strengths_to_surpass`, and `artifact_comparison_evidence`
- recurrence prevention is now modeled as `next_turn_recurrence_patch` plus `recurrence_patch_decision`, and it is required before any skill-promotion path can pass
- the contract layer is fail-closed when the self-steering primary control surface, artifact-grounded latent-intent evidence, or next-turn recurrence patch is missing
- this pass proves contract and lifecycle consistency at the config/docs layer; runtime emission and consumption of these artifacts still require separate runtime evidence

### Acceptance checks

- `ac-1`: self-steering state is contractually defined as the runtime primary control surface, not a reporting-only summary
- `ac-2`: latent intent is contractually defined as artifact-grounded comparison required, not proxy-score-only
- `ac-3`: recurrence patch is contractually required before skill promotion, and the repo exposes a package-visible verification command for that requirement

### Package-visible verification command

- dedicated verifier: `npm run verify:self-steering-contracts`
- scope: checks the new runtime contract keys plus required-field metadata, the additive latent-intent grounding fields and evaluator input list in `scripts/config/adoption_readiness_evaluator_contract.json`, the additive recurrence-patch-before-promotion fields and lifecycle-step consistency in `scripts/config/correction_learning_contract.json`, and the presence of `ac-1`, `ac-2`, and `ac-3` in this architecture spec
- proof boundary: static contract and docs consistency only; runtime artifact emission and evaluator consumption require separate runtime evidence
