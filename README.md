# Codex Governed Harness

HTML guide:
- `http://127.0.0.1:57525/01.HarnesUI/guide.html`

## Current App Layout

The shared harness now owns the multi-app surface under `APP/`.

- `APP/01.english-conversation-app`
- `APP/02.talkApp`
- `APP/03.プレゼン上達AI`

Current default runtime posture:

- English Conversation App static files resolve from `APP/01.english-conversation-app` first.
- `CODEX_ENGLISH_CONVERSATION_APP_ROOT` remains the explicit override.
- `../english-conversation-app` remains a legacy compatibility fallback only.
- App manifests and runtime wiring live under `APP/*/app.manifest.json`.
- Architecture details live in `docs/HARNESS_APP_PLATFORM.md`.

このリポジトリは、単なる「Codex を呼ぶだけの Web UI」ではありません。
`codex app-server` をローカル優先で運用しつつ、既存の標準実行経路を維持したまま、要件固定、親子ガバナンス、evidence-first の release judgment、fail-closed な `agi_v1` 評価を重ねる governed harness です。

固定する主経路:
- interactive execution: `POST /api/exec`
- evaluation / promotion: `POST /api/eval/run`
- local batch operations: `/api/batch/*`

この repo の front-door claim:
- truth source は narrative だけでなく machine-readable contracts と runtime proof
- 完了は会話の終了ではなく evidence と release decision state で判定
- `agi_v1` は既存 eval ルートへの extension-only 実装であり、parallel harness や別 CLI 宇宙を増やさない
- self-improvement は machine-gated に扱い、fail-open で昇格しない

構成:
- HTTP UI: `web/*`
- Node アダプタ: `server.js`
- 実行バックエンド: `codex app-server`
- machine-readable contracts: `scripts/config/*`
- evidence / proof / signoff: `logs/current/*`, `logs/archive/*`, `logs/bundles/*`

リポジトリ配置:
- 現役の runtime / docs / scripts / tools / web UI は root に置きます。
- 旧資料・サンプル・手動生成物のうち未参照だったものは整理で削除しました。

## まず読む順番

1. `README.md`
2. `AGENTS.md`
3. `HARNESS_MAP.md`
4. `docs/CURRENT_ARCHITECTURE.md`
5. `docs/EVIDENCE_CONTRACT.md`
6. `docs/AGI_V1_EVAL_FRAMEWORK.md`

## このハーネスが実際に持っているもの

- standard Codex route 維持:
  - interactive 実行は `POST /api/exec`
  - eval / promotion は `POST /api/eval/run`
- governed decision system:
  - requirement lock
  - parent / child role governance
  - release decision state の分離
- evidence-first runtime:
  - turn artifact
  - review bundle
  - signoff / proof bundle
- AGI-oriented extension:
  - `evaluation.profile = "agi_v1"` で fail-closed な比較 / 昇格判定を追加
  - weighted geometric mean、CVaR、hard gates、hidden evaluator integrity を既存 eval flow の上に重ねる

## クイックスタート

1. `start_codex_ui.bat` を実行
2. `http://127.0.0.1:57525` を開く
3. プロンプトを入力して `Send`
4. launcher は常に管理者権限へ self-elevate します。UAC を拒否した場合は起動しません

## English Conversation App

1. `start_codex_ui.bat` を実行
2. 既定の same-origin 入口として `http://127.0.0.1:57525/english-conversation-app/index.html` を開く
3. 静的ファイルは次の優先順で解決されます
   - `CODEX_ENGLISH_CONVERSATION_APP_ROOT`
   - integrated app `APP/01.english-conversation-app/`
   - legacy external clone `../english-conversation-app/`
   - bundled fallback `web/english-conversation-app/`
4. `start_english_conversation_app.bat` は互換用の standalone app を `127.0.0.1:57526` で起動し、会話/TTS API だけを main harness (`127.0.0.1:57525`) に proxy します
5. `bootstrap_english_conversation_app_repo.bat` は legacy external clone を明示的に用意したい場合だけ使います

## スモークテスト

実行:

```bash
node scripts/git_automation_policy_test.js
node scripts/app_server_smoke_test.js
node scripts/external_english_conversation_app_mount_test.js
node scripts/web_autonomy_copy_test.js
node scripts/eval_replay_api_smoke_test.js
node scripts/eval_harness_policy_test.js
node scripts/harness_contract_policy_test.js
node scripts/skill_portfolio_policy_test.js
node scripts/skill_portfolio_audit.js
```

確認内容:
- turn 完了時の Git auto-commit / autopush ポリシー
- `codex app-server` の起動と handshake
- `thread/start`、`turn/start`、`turn/interrupt`
- `GET /api/runtime`
- `POST /api/exec`
- English Conversation App の external mount と traversal guard
- static/operator docs の runtime-truth drift
- skill portfolio policy

期待結果:
- stdout に `PASS` が出る
- exit code が `0`

## 利用可能な API

- `GET /api/runtime`
- `GET /api/conversation/runtime`
- `GET /api/diagnostics`
- `GET /api/slo/status`
- `POST /api/conversation/direct`
- `POST /api/exec`
- `GET /api/eval/suites`
- `GET /api/eval/history`
- `POST /api/eval/run`
- `GET /api/replay/turns`
- `GET /api/replay/turn/:turnId`
- `POST /api/replay/turn`
- `GET /api/batch/status`
- `POST /api/batch/run`
- `POST /api/batch/scheduler`
- `POST /api/open-cmd`
- `POST /api/requirement-guard/validate`

未知の API ルートは `404` を返します。

## `GET /api/runtime` の主な項目

- `mode: "app-server"`
- `latest_turn` / `latestTurn`
- `gitAutomation` / `git_automation`
- `staticApps.englishConversationApp`
- `operationLog`
- `executionProfile` / `executionVisibility` / `fullUtilization`
- `harnessMemory`
- `slo`
- `evalHarness`

## 前提条件

- `node` が `PATH` にあること
- `codex` が `PATH` にあること

## Piper 運用

安定運用のため、Piper の実行ファイルは repo 内に vendor する前提です。

1. Windows では `tools/piper/piper.exe` に配置
2. モデルは `models/piper/<model-id>/` 配下に配置
3. 事前チェック:

```bash
node scripts/piper_runtime_doctor.js --model en_US-lessac-high
```

launcher 側で自動参照されます:
- `start_codex_ui.bat`

doctor 実行時にダウンロードを許可するなら `--allow-download` を追加してください。

一時的に network を許可して secure install する場合:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/piper_secure_install.ps1 `
  -Url "<piper release .zip or .exe url>" `
  -Sha256 "<trusted release note の sha256>"
```

batch wrapper:

```bat
scripts\piper_secure_install.bat -Url "<url>" -Sha256 "<sha256>"
```

installer の既定 allowlist:
- `github.com`
- `objects.githubusercontent.com`
- `release-assets.githubusercontent.com`
- `huggingface.co`

## Kokoro FastAPI

ローカル OpenAI 互換 TTS として Kokoro FastAPI を使う場合:

- `tools/kokoro-fastapi/docker-compose.yml`
- `tools/kokoro-fastapi/.env.example`
- `tools/kokoro-fastapi/README.md`

起動:

```powershell
cd tools/kokoro-fastapi
powershell -ExecutionPolicy Bypass -File .\start.ps1
```

確認:

```powershell
Invoke-WebRequest -Uri "http://127.0.0.1:8880/docs" -UseBasicParsing | Select-Object -ExpandProperty StatusCode
Invoke-RestMethod -Uri "http://127.0.0.1:8880/v1/models"
powershell -ExecutionPolicy Bypass -File .\tools\kokoro-fastapi\smoke_test_speech.ps1
```

English Conversation App 連携:
- `http://127.0.0.1:57525/english-conversation-app/index.html` を開く
- サーバーは `CODEX_ENGLISH_CONVERSATION_APP_ROOT` 未設定時に `APP/01.english-conversation-app` を既定優先し、必要なときだけ legacy external clone を使います
- 明示 override は `CODEX_ENGLISH_CONVERSATION_APP_ROOT=/abs/path/to/english-conversation-app`
- `start_english_conversation_app.bat` は互換用 standalone app を `127.0.0.1:57526` で開き、会話/TTS API だけを `127.0.0.1:57525` に proxy します
- 初回 split が必要なら `bootstrap_english_conversation_app_repo.bat`
- `TTS Engine` を `Kokoro FastAPI (local)` に設定
- 音声応答は `POST /api/voice/kokoro` を経由してブラウザ再生されます

## Git 自動化

このハーネスは、既定で turn 完了時に `commit + push` まで自動実行します。  
`start_codex_ui.bat` 経由でも `node server.js` 直実行でも、env で明示無効化しない限り有効です。

既定値:
- `CODEX_GIT_AUTOCOMMIT_ENABLED=1`
- `CODEX_GIT_AUTOPUSH_ENABLED=1`
- `CODEX_GIT_ALLOW_DIRTY_BASELINE=0`
- `CODEX_GIT_REMOTE=origin`

動作ルール:
- `taskOutcomeStatus=COMPLETED` の turn だけが対象
- 対象 repo は常にその turn の `cwd`
- baseline が dirty の repo には自動 commit / push しない
- remote 未設定または detached HEAD の場合は push しない
- 対象がこのハーネス repo の場合は `logs/archive/raw/runtime_state/harness_execution_memory.json` と `logs/archive/raw/runtime_state/eval_runs.jsonl` を baseline 判定から除外する

## 補足

- 既定 port は `57525`
- override は `CODEX_UI_PORT`
- Conversation は `app-server` provider 固定
- Browser 自動起動を止めるには `CODEX_AUTO_OPEN_BROWSER=0`
- Browser の起動先を変えるには `CODEX_AUTO_OPEN_PATH=/some/path`
- English Conversation App の static root override は `CODEX_ENGLISH_CONVERSATION_APP_ROOT=/abs/path/to/english-conversation-app`
- `start_codex_ui.bat` は起動時に管理者権限へ昇格します
- Edge 優先起動。固定するなら `CODEX_EDGE_EXE`
- `start_codex_ui.bat` は unset 時だけ以下を補います
  - `CODEX_DEFAULT_EXEC_AGENT=default`
  - `CODEX_REQUEST_USER_INPUT_POLICY=auto-default`
  - `CODEX_PARENT_DISPATCH_GUARD_MODE=enforce`
  - `CODEX_PARENT_DISPATCH_GUARD_MAX_RETRIES=1`
  - `CODEX_ADVERSARIAL_SHADOW_ENABLED=1`
  - `CODEX_ADVERSARIAL_LOOP_ENABLED=1`
  - `CODEX_ADVERSARIAL_LOOP_MAX_RETRIES=1`
  - `CODEX_REQUIREMENT_GUARD_ENABLED=1`
  - `CODEX_REQUIREMENT_RBJ_ENABLED=1`
  - `CODEX_REQUIREMENT_RBJ_MAX_QUESTIONS=3`
  - `CODEX_REQUIREMENT_RBJ_MAX_REVISIONS=2`
  - `CODEX_EXECUTION_PROFILE=full-runtime`
- smoke harness の可視性固定値:
  - `CODEX_EXECUTION_PROFILE=smoke-test`
- turn artifact は `manifest.json.execution.meta` と `manifest.json.execution.observed` を含みます
- idempotency と turn memory は `logs/archive/raw/runtime_state/harness_execution_memory.json`
- eval history は `logs/archive/raw/runtime_state/eval_runs.jsonl`
- `logs/archive/raw/runtime_state/harness_execution_memory.json` と `logs/archive/raw/runtime_state/eval_runs.jsonl` はローカル runtime state として Git 追跡対象から外しています
- `executionProfile=repro` は `webSearch=0`、`forceNewSession=1`、`requestUserInputPolicy=blocked`
- operation log を日次分割する場合は `CODEX_OPERATION_LOG_DAILY_SPLIT=1`
- Requirement Lock は既定で無効
  - `CODEX_REQUIREMENT_GUARD_ENABLED=1`
  - `CODEX_REQUIREMENT_RBJ_ENABLED=1`
  - `CODEX_REQUIREMENT_RBJ_MAX_QUESTIONS=3`
  - `CODEX_REQUIREMENT_RBJ_MAX_REVISIONS=2`
  - `#requirement-locked`
  - `#guard-bypass`
  - `#rbj-bypass`
  - `CODEX_REQUIREMENT_LOCK_ENABLED=0`
  - `CODEX_REQUIREMENT_LOCK_REQUIRE_CONFIRM=0`
  - `#scope-plus` / `#scope-expand`
  - `#scope-core` / `#scope-no-plus`
  - `CODEX_SCOPE_EXPANSION_ENABLED=0`
  - `CODEX_SCOPE_EXPANSION_REQUIRE_APPROVAL=0`

移行メモ:
- `docs/standard-codex-migration.md`

## 2026-04-05 operational goal surfaces

The harness now exposes an operational goal-completion layer on top of governed memory and readiness.

- Primary decision artifact:
  - `output/agi_readiness/goal_completion_status.json`
- Supporting readiness artifacts:
  - `output/agi_readiness/stable_coverage_matrix.json`
  - `output/agi_readiness/stable_coverage_trend.json`
  - `output/agi_readiness/robustness_breakdown.json`
  - `output/agi_readiness/causal_regression_alerts.json`
  - `output/agi_readiness/distinct_improvement_summary.json`
- Continuity debt artifacts:
  - `output/continuity_public/continuity_debt.json`
  - `output/continuity_public/continuity_debt_trend.json`
  - `output/continuity_public/continuity_closeout_effects.json`
- Memory public causal artifact:
  - `output/memory_public/causal_effectiveness_summary.json`

This is an internal operational completion surface, not a public AGI claim.
