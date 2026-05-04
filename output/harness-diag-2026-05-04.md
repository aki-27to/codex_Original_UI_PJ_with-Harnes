# Harness Diagnosis: codex_Original_UI_PJ_with-Harnes

> 評価基準: `.agents/skills/review-harness/diagnosis-rubric.md` と Codex 互換の `.agents/skills/review-harness-codex/references/codex-harness-rubric.md`  
> 診断日: 2026-05-04  
> Scope: clean `HEAD` / generated output / static config. Live server API とブラウザ画面は今回未検証。

## Verdict

- Overall: **S / 90%** (`45/50`)
- Summary: Codex-native の権威、役割分離、証拠契約、current-truth surface はかなり成熟している。弱点は、owner-local の強権限姿勢が物理的ガードより policy/test に寄っていることと、UI/公開 claim の freshness を常に自動で証明するところまでは届いていないこと。
- Grade asset: `.agents/skills/review-harness/ogp/rank-s.webp`

## Surface Map

| Surface | Evidence |
|---|---|
| Authority | `AGENTS.md:8`, `AGENTS.md:12`, `scripts/config/authority_registry.json:97-100` |
| Runtime posture | `.codex/config.toml:4-12`, `.codex/agents/default.toml:4-5`, `scripts/config/deployment_posture_profiles.json:4-21` |
| Protocol routes | `AGENTS.md:59-62`, `docs/CURRENT_ARCHITECTURE.md:129-136`, `scripts/config/authority_registry.json:99-100` |
| Evidence contract | `docs/EVIDENCE_CONTRACT.md:20-38`, `docs/EVIDENCE_CONTRACT.md:136-149`, `scripts/config/task_outcome_contract.json:132-134` |
| Skills and roles | `.codex/config.toml:18-50`, `.codex/agents/*.toml`, `.agents/skills/**/SKILL.md` 15件, `scripts/config/repo_local_skill_catalog.json` |
| Current truth | clean `git status --short --branch`; `logs/current/` 5 files; `output/governance_public/reviewer_start_here.json`; `output/governance_public/worker_decision_surface.json` |

## Harness Configuration Summary

| 項目 | 現状 |
|---|---|
| CLAUDE.md equivalent | `AGENTS.md` 149行 / pointer 34件 / 強い制約表現 12件 |
| Permissions / posture | `.codex` owner-local default: `danger-full-access`, `approval_policy = "never"`; reference default: `portable_local` |
| Hooks | Claude-style `PreToolUse` / `PostToolUse` は未使用。代替として package scripts / CI / governance tests が gate を担う |
| Skills | repo-local 15件。catalog に `useWhen`, `avoidWhen`, `expectedArtifacts`, `rollbackCriteria` あり |
| MCP | `stitch`, `playwright`, `harness_artifacts`; tool registry に risk / access mode / fallback を記録 |
| Memory | repo policy は typed item graph / retrieval pack / evidence strength。現行 runtime memory store の live integrity は今回未検証 |
| Agents | `.codex/agents/*.toml` 9件。parent / intake / release / frontend / backend / infra / reviewer / tester / explorer |
| CI / tests | `.github/workflows` 4件、package scripts 多数、`scripts/*test*.js` 147件 |

## Score Summary

| Category | Indicators | Score | 小計 |
|---|---|---:|---:|
| **A. Context and attention efficiency** | A1 ✅ A2 ✅ A3 ✅ A4 ✅ A5 ✅ | 10/10 | 100% |
| **B. Verification robustness** | B1 ✅ B2 ✅ B3 ✅ B4 ⚠️ B5 ✅ | 9/10 | 90% |
| **C. Permission and trust boundaries** | C1 ✅ C2 ⚠️ C3 ⚠️ C4 ✅ C5 ✅ | 8/10 | 80% |
| **D. Knowledge and current truth** | D1 ✅ D2 ⚠️ D3 ✅ D4 ✅ D5 ✅ | 9/10 | 90% |
| **E. Runtime and product fit** | E1 ✅ E2 ✅ E3 ✅ E4 ✅ E5 ⚠️ | 9/10 | 90% |
| **Overall** | 25 applicable indicators | **45/50** | **90%** |

## Detected Anti-Patterns

### C2. Destructive Or External Actions Are Gated ⚠️

**検出事実**: `owner_local` は `danger-full-access`, `approval_policy = "never"`, `autoCommitAndPush = true` を許容する。一方で `portable_local` が reference default であり、AGENTS も強権限を universal default と見なさないよう明記している。  
**影響**: owner-local では、外部影響操作や破壊的操作の一部が physical deny ではなく policy / runtime discipline / tool approval に依存する。  
**改善案**: `scripts/config/deployment_posture_profiles.json` に加え、実行時の destructive command / external write を検出する package-visible test を追加し、`git push --force`, recursive delete, deploy 系を明示 deny する。

### C3. Self-Configuration Mutation Is Governed But Not Physically Locked ⚠️

**検出事実**: `.codex/`, `.agents/skills`, skill catalog は governance docs と tests で監査されるが、workspace 内では編集可能。`unknownAgentFileChangePolicy = "deny"` と catalog tests はある。  
**影響**: 誤った自己設定変更は test で捕まる設計だが、変更自体を初手で物理的に防ぐ設計ではない。  
**改善案**: `.codex/**`, `.agents/skills/**`, `scripts/config/*catalog*.json` を対象に、変更検出時は `node scripts/repo_local_skill_catalog_test.js`, `node scripts/system_coherence_review_test.js`, skill audit を必須化する single command を作る。

### B4. UI And Visual Claims Require Visual Evidence, But Not Always Fresh ⚠️

**検出事実**: `AGENTS.md` と `docs/EVIDENCE_CONTRACT.md` は design-sensitive task に visual evidence と independent review を要求する。今回 `harnesui_work_completion_state_test` は PASS したが、live screenshot / mobile / dense-copy visual check は実行していない。  
**影響**: UI semantics の構造テストは強いが、「見た目が本当に採択可能か」は最新 screenshot なしでは閉じない。  
**改善案**: UI 関連の signoff command に desktop/mobile screenshot freshness check を組み込み、証拠が古い場合は `FAILED_VALIDATION` に寄せる。

### D2. Architecture And Changelog Sync Has Minor Freshness Risk ⚠️

**検出事実**: doc-sync gate と `system_coherence_review_test` は存在し PASS した。一方で `docs/CURRENT_ARCHITECTURE.md` の `Updated` 表記は 2026-04-18 のままで、2026-05-04 に更新された `.codex` / tool registry / skill surfaces と完全同期しているとは静的には言い切れない。  
**影響**: reviewer は最新実装を把握できるが、一部の更新日・説明鮮度が current truth とズレて見える可能性がある。  
**改善案**: doc-sync gate に `Updated` 日付と touched governance/runtime surfaces の対応チェックを足す。

### E5. Public Claims Are Mostly Bounded, But Broad Adoption Wording Can Overread ⚠️

**検出事実**: README は evidence / worker decision surface / program readiness の読み分けを説明している。一方で「いま任せられる仕事」の表現は強く、live runtime と latest proof を読まない閲覧者には product readiness と読まれやすい。  
**影響**: public-facing copy が、現在の proof bundle の範囲を超えた一般的な readiness claim と誤読される余地がある。  
**改善案**: README の capability claim の直下に「最新の採択可否は `output/governance_public/worker_decision_surface.json` を見る」と一文を固定する。

## Strong Points

- Authority が分離されている。`docs/HARNESS_CONSTITUTION.md`、`AGENTS.md`、`scripts/config/authority_registry.json` の順序が明確で、標準 route も registry にある。
- Completion が proof-carrying。`task_outcome_contract.json` と policy tests が、missing evidence / goal substitution / parent dispatch guard を `FAILED_VALIDATION` に落とす。
- Reviewer read order が現物である。`reviewer_start_here.json` が `worker_decision_surface` と `program_readiness` を分け、ordinary task verdict と whole-harness readiness を混同しにくい。

## Quick Wins

### 1. Owner-Local Risk Gate Test（15-30分）

`danger-full-access` + `approval_policy = "never"` が active のとき、強権限が `owner_local` に限定され、`portable_local` が reference default のままかを確認する test を `gate:pr` に含める。

### 2. Config/Skill Change Gate Command（20分）

`.codex/**` または `.agents/skills/**` が touched されたら、次をまとめて実行する package script を追加する。

```powershell
node scripts/repo_local_skill_catalog_test.js
node scripts/mcp_tool_registry_alignment_test.js
node scripts/system_coherence_review_test.js
```

### 3. Visual Evidence Freshness Check（30分）

UI signoff artifact に screenshot timestamp / viewport matrix / reviewer verdict の freshness を入れ、古い場合は signoff を通さない。

### 4. README Proof Pointer（5分）

README の capability claim 直下に、最新判断面として `output/governance_public/worker_decision_surface.json` を明示する。

## Next Improvements

1. `docs/CURRENT_ARCHITECTURE.md` の `Updated` と governance/runtime touched surfaces の同期を自動チェックする。
2. external write / deploy / force push / recursive delete の command-risk manifest を作り、owner-local でも warning ではなく checkable gate にする。
3. current truth を `HEAD`, dirty worktree, live runtime, generated output に分けた診断 exporter を package script 化する。

## Evidence Commands

```powershell
git status --short --branch
git diff --stat
git ls-files --others --exclude-standard
node scripts/repo_local_skill_catalog_test.js
node scripts/mcp_tool_registry_alignment_test.js
node scripts/system_coherence_review_test.js
node scripts/authority_registry_test.js
node scripts/deployment_posture_profile_test.js
node scripts/task_outcome_policy_test.js
node scripts/adoption_readiness_policy_test.js
node scripts/iteration_control_policy_test.js
node scripts/harnesui_work_completion_state_test.js
node scripts/start_codex_ui_launcher_policy_test.js
```

Failed exploratory command:

```powershell
node scripts/task_outcome_contract_test.js
# MODULE_NOT_FOUND; correct nearby command was node scripts/task_outcome_policy_test.js
```

## Non-Claims

- この診断は live server readiness を証明しない。`node scripts/app_server_smoke_test.js` や `GET /api/runtime` は今回実行していない。
- この診断は UI の最新見た目を証明しない。ブラウザ screenshot / mobile viewport / visual reviewer verdict は今回取得していない。
- この診断は release verdict ではない。最新 release 判断は task-specific evidence bundle と `worker_decision_surface.json` を見る必要がある。

## Share Draft

```text
診断結果はSランク(90%)でした
証拠契約は強い。次は強権限の物理ゲート強化。
https://harness-diag.vercel.app/s.html
#まさおエージェントハーネス診断
```
