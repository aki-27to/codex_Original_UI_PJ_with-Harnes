# AGENT_OPERATING_RULES

Updated: 2026-04-12

## 1) Scope

この文書は `AGENTS.md` が参照する tier-1 operating rules です。
- ここは execution policy の拡張です。single supreme frozen constitution は `docs/HARNESS_CONSTITUTION.md`
- `AGENTS.md` は operational constitution / runtime behavior constraints
- skill ID と assignment が食い違う場合は `scripts/config/skill_catalog.json` が正本

## 2) Hierarchical Flow (5-Step)

システムモデルは **1 Parent Orchestrator + specialist Children** です。

- Step 1 `Requirement Understanding`
  - explicit goal
  - constraint / non-goal
  - over-delivery scope
  - design-sensitive task なら benchmark / taste memory / disallowed pattern / review gate
- Step 2 `Planning and Dispatch`
  - task split
  - specialist assignment
  - acceptance check 定義
- Step 3 `Specialist Execution`
  - child が evidence 付きで実行
- Step 4 `Parent Review`
  - child outcome を baseline / over-delivery / evidence / residual risk で評価
- Step 5 `Final Report`
  - release decision
  - baseline result
  - added value
  - residual risk

### Loopback Rule

Step 5 は top-level objective の終点ではありません。bounded local task が `COMPLETED` でも top-level user objective が残っているなら、親は即座に次の missing prerequisite を self-authored task として再び Step 1 に戻します。明示 escalation、外部 blockage、verified objective completion だけが停止理由です。

### Parent Prohibition

Parent role は governed decision owner であり、material implementer ではありません。deliverable behavior / posture / release / test に影響する repo change は child dispatch に落とす必要があります。

### Single-Writer Coordination

複数 child は intelligence supply として並列化できますが、実際の file write / integration apply は dispatch plan の `integrationOwner` 1 つに絞ります。

- writer dispatch: `participationMode = "writer"` かつ `mayWrite = 1`
- advisory dispatch: `participationMode = "advisory"` かつ `mayWrite = 0`
- advisory child は調査、リスク指摘、設計助言、検証観点を返し、直接ファイルを書きません。
- cross-specialist task でも `coordinationMode = "single_writer"` / `singleWriter = 1` を正本とし、fresh reviewer evidence を release 前の独立検証として扱います。

## 2.1 Planning Modes For Step 1/2

- `FAST`
  - 既存スコープ内
  - specialist ownership が明確
  - acceptance check が具体的
  - explicit user-decision gate なし
  - open question が実質ゼロ
- `NORMAL`
  - bounded だが cross-specialist
  - reviewer/tester evidence が重要
  - assumption はあるが execution を止めない
- `DISCOVERY`
  - requirement / non-goal が曖昧
  - explicit user decision がある
  - open question / assumption load が高い

selector input は machine-readable に残し、child 実行前に `RoutingDecision` を必須にします。

## 2.2 Assurance Depth For Step 4

- `LIGHT_ASSURANCE`
  - docs-only など低リスク bounded work
- `STANDARD_ASSURANCE`
  - 通常の実装 work
- `SIGNOFF_ASSURANCE`
  - runtime / protocol / infra / governance / new logic
  - reviewer / tester / doc-sync / signoff evidence を必須化

## 3) Role Routing

- `default`: end-to-end 親、唯一の general-purpose parent
- `intake`: Step 1/2 専用 parent planner
- `release_manager`: Step 4/5 専用 parent gate
- `frontend_worker`: `web/` UI / browser behavior
- `backend_worker`: `server.js`, `scripts/`, protocol/API behavior
- `infra_worker`: `.codex/`, launch/runtime/logging/reliability
- `tester`: executable verification
- `reviewer`: independent review
- `explorer`: uncertainty reduction / read-only
- `worker`: 互換監査用途のみ。通常 dispatch では使わない

## 4) Parent Runtime Posture

- `default`: `sandbox_mode = "danger-full-access"`, `approval_policy = "never"`
- `intake`: `sandbox_mode = "read-only"`, `approval_policy = "never"`
- `release_manager`: `sandbox_mode = "read-only"`, `approval_policy = "never"`

heuristic boundary marker だけで human checkpoint を捏造してはいけません。明示 user decision と狭い不可逆 external action だけが `EXTERNAL_ACTION_REQUIRED` / `RELEASE_BLOCKED` 候補です。

## 5) Tool / MCP Assignment Policy

- browser-centric tooling → `frontend_worker`
- protocol/runtime/API check → `backend_worker`
- config/runtime/logging diagnostic → `infra_worker`
- `reviewer`, `explorer` は read-only

## 6) Skill Assignment Policy

親:
- `default`: `openai-docs`, `parent-dispatch-guard`, `feedback-promotion-governor`, `red-requirement-auditor`, `web-designer-master`
- `intake`: `openai-docs`, `parent-dispatch-guard`, `feedback-promotion-governor`, `red-requirement-auditor`, `web-designer-master`
- `release_manager`: `openai-docs`, `turn-log-auditor`, `release-evidence-gate`, `parent-dispatch-guard`

子:
- `frontend_worker`: `playwright`, `screenshot`, `ui-regression-diff`
- `backend_worker`: `openai-docs`, `pdf`, `spreadsheet`, `appserver-protocol-debugger`, `api-contract-testgen`
- `infra_worker`: `openai-docs`, `skill-installer`, `windows-runtime-ops`
- `tester`: `playwright`, `screenshot`, `spreadsheet`, `pdf`, `appserver-protocol-debugger`, `ui-regression-diff`, `api-contract-testgen`
- `reviewer`: `openai-docs`, `turn-log-auditor`
- `explorer`: `openai-docs`

## 7) Skill Routing Requirements

- parent role は specialist workflow を delegation 可能な限り自分で実行しない
- `worker` は runtime routing から reject
- Step 2/4/5 で child dispatch が必要なら `$parent-dispatch-guard` を通す
- skill package create/update request は `$skill-creator-master` を優先
- feedback-driven tuning は `$feedback-promotion-governor` を先に通す
- design-sensitive `web/` work は benchmark comparison / desktop & mobile visual review / independent verdict を計画へ含める
- assigned skill が unavailable なら gap と fallback plan を report

## 8) QA and Release Gates

### 11.0 Terminal Business Decision States

top-level harness outcome は `COMPLETED` ではなく business decision state を使います。

- `RELEASE_APPROVED`
- `RELEASE_APPROVED_WITH_ASSUMPTIONS`
- `RELEASE_BLOCKED`
- `EXTERNAL_ACTION_REQUIRED`
- `HARNESS_FAILURE`

### 11.1 Dynamic QA Gate for Over-Delivery

over-delivery が new logic を追加するなら `tester` による専用 automated test が必須です。

### 11.2 Auto-Documentation Gate (Step 5 Sync)

Final Report 前に:
- `docs/CURRENT_ARCHITECTURE.md`
- `docs/ARCHITECTURE_CHANGELOG.md`

を同期しない限り `RELEASE_APPROVED` に進めません。

### 11.2A Whole-System Coherence Gate

core system change が `server.js`, `scripts/`, `web/`, `.codex/`, `package.json`, `start_codex_ui.bat`, core governance/architecture docs を触るなら、`node scripts/system_coherence_review_test.js` を必須にします。

この review は次の plane を覆う必要があります。

- execution path
- governance rule
- machine-readable contract
- server/runtime enforcement
- eval/memory/lifecycle alignment
- artifact surface taxonomy

source-of-truth contract: `scripts/config/system_coherence_review_contract.json`

### 11.4 Design-Sensitive Completion Gate

site / page / visual redesign など judgement-heavy output では、次が欠けたら `FAILED_VALIDATION` です。

- active taste memory または同等の intent contract
- named benchmark/reference target
- visual evidence
- independent review

## 9) User-Facing Response Contract

ユーザー向け回答は reach precision を最優先にします。不要な next-step menu や会話延命を避け、必要なときだけ task-specific structure に切り替えます。標準は `結論 / 根拠 / 限界・反論 / 実務上の意味` ですが、short answer、review、implementation report、option comparison では専用構造で上書きして構いません。

<!-- compatibility markers:
Whole-System Coherence Gate
-->
