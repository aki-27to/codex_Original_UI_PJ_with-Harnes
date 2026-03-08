# Codex Standard Harness

Local harness for `codex app-server` (Web UI only).

Architecture:
- HTTP UI (`web/*`)
- Node adapter (`server.js`)
- `codex app-server` over JSONL stdio (inside `server.js`)

Repository layout:
- Active runtime/materials stay at the root (`docs/`, `scripts/`, `tools/`, `web/`, `logs/`, `output/`).
- Archived legacy docs/examples/installers/manual renders now live under `archive/`.

## Quick start

1. Run `start_codex_ui.bat`
2. Open `http://127.0.0.1:57525`
3. Enter a prompt and click `Send`

English conversation app:

1. Run `start_english_conversation_app.bat`
2. It opens `http://127.0.0.1:57525/english-conversation-app/index.html`
3. Static files are resolved in this order while keeping the same URL:
   - `CODEX_ENGLISH_CONVERSATION_APP_ROOT` when set
   - sibling repo `../english-conversation-app/`
   - bundled fallback `web/english-conversation-app/`
4. To seed the sibling repo from the bundled app once, run `bootstrap_english_conversation_app_repo.bat`

## Smoke test

Run:

```bash
node scripts/app_server_smoke_test.js
node scripts/external_english_conversation_app_mount_test.js
node scripts/eval_replay_api_smoke_test.js
node scripts/eval_harness_policy_test.js
node scripts/harness_contract_policy_test.js
node scripts/skill_portfolio_policy_test.js
node scripts/skill_portfolio_audit.js
```

Validates:
- `codex app-server` startup and handshake (`initialize` -> `initialized`)
- `thread/start` + `turn/start` + `turn/interrupt`
- local harness startup (`GET /api/runtime`)
- standard execution path (`POST /api/exec`)
- external English Conversation App mount resolution + traversal guard
- skill portfolio classification and anti-monotony governance policy

Expected result:
- stdout contains `PASS`
- exit code `0`

## Active API routes

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

Unknown API routes return `404`.

## Runtime fields

`GET /api/runtime` includes:
- `mode: "app-server"`
- `latest_turn` / `latestTurn`
- `staticApps.englishConversationApp` mount source/root summary
- `operationLog` settings
- `executionProfile` / `executionVisibility` / `fullUtilization`
- `harnessMemory` summary (contract/execution/audit/replay/abstraction memory counters)
- `slo` snapshot (failure rate / p95 latency / idempotency conflict rate)
- `evalHarness` snapshot (fixed suite + run/history endpoints)

## Requirements

- `node` in `PATH`
- `codex` in `PATH`

## Piper (Best Practice)

For stable and safe local operation, keep Piper binary vendored in this repo:

1. Place executable at `tools/piper/piper.exe` (Windows).
2. Keep model files under `models/piper/<model-id>/`.
3. Run preflight:

```bash
node scripts/piper_runtime_doctor.js --model en_US-lessac-high
```

Launchers auto-wire this path:
- `start_codex_ui.bat`
- `start_english_conversation_app.bat`

If you intentionally allow model download during doctor check, add `--allow-download`.

Secure install (when temporary network access is allowed):

```powershell
powershell -ExecutionPolicy Bypass -File scripts/piper_secure_install.ps1 `
  -Url "<piper release .zip or .exe url>" `
  -Sha256 "<sha256 from trusted release note>"
```

Batch wrapper:

```bat
scripts\piper_secure_install.bat -Url "<url>" -Sha256 "<sha256>"
```

Default host allowlist in installer:
- `github.com`
- `objects.githubusercontent.com`
- `release-assets.githubusercontent.com`
- `huggingface.co`

## Kokoro FastAPI (Local OpenAI-Compatible TTS)

For local Kokoro TTS server bootstrap, use:

- `tools/kokoro-fastapi/docker-compose.yml`
- `tools/kokoro-fastapi/.env.example`
- `tools/kokoro-fastapi/README.md`

Quick start:

```powershell
cd tools/kokoro-fastapi
powershell -ExecutionPolicy Bypass -File .\start.ps1
```

Verification:

```powershell
Invoke-WebRequest -Uri "http://127.0.0.1:8880/docs" -UseBasicParsing | Select-Object -ExpandProperty StatusCode
Invoke-RestMethod -Uri "http://127.0.0.1:8880/v1/models"
powershell -ExecutionPolicy Bypass -File .\tools\kokoro-fastapi\smoke_test_speech.ps1
```

English Conversation App integration:

- Open `http://127.0.0.1:57525/english-conversation-app/index.html`
- `start_english_conversation_app.bat` auto-points `CODEX_ENGLISH_CONVERSATION_APP_ROOT` to sibling `../english-conversation-app/` when that repo exists
- `CODEX_ENGLISH_CONVERSATION_APP_ROOT=/abs/path/to/english-conversation-app` overrides both sibling and bundled roots
- `bootstrap_english_conversation_app_repo.bat` copies the bundled app to sibling `../english-conversation-app/` for the initial split
- Set `TTS Engine` to `Kokoro FastAPI (local)`
- Replies will call `POST /api/voice/kokoro` via `server.js`, then play in browser.

## Notes

- Default port is `57525` (`CODEX_UI_PORT` to override)
- Conversation is fixed to `app-server` provider (same Codex login/session as `/api/exec`).
- Browser auto-open can be disabled with `CODEX_AUTO_OPEN_BROWSER=0`
- Browser auto-open target can be overridden with `CODEX_AUTO_OPEN_PATH=/some/path`
- English Conversation App static root can be overridden with `CODEX_ENGLISH_CONVERSATION_APP_ROOT=/abs/path/to/english-conversation-app`
- Browser auto-open prefers Microsoft Edge when available (`CODEX_EDGE_EXE` to pin explicit Edge path)
- `start_codex_ui.bat` auto-populates `CODEX_EDGE_EXE` from common Windows Edge install paths when unset
- Launcher window pause-on-exit is enabled by default (`CODEX_PAUSE_ON_EXIT=1`, set `0` to disable)
- Launcher defaults now enable the full parent-orchestrated path:
  - `CODEX_DEFAULT_EXEC_AGENT=default`
  - `CODEX_REQUEST_USER_INPUT_POLICY=auto-default`
  - `CODEX_ADVERSARIAL_SHADOW_ENABLED=1`
  - `CODEX_ADVERSARIAL_LOOP_ENABLED=1`
  - `CODEX_ADVERSARIAL_LOOP_MAX_RETRIES=1`
  - `CODEX_REQUIREMENT_GUARD_ENABLED=1`
  - `CODEX_REQUIREMENT_RBJ_ENABLED=1`
  - `CODEX_REQUIREMENT_RBJ_MAX_QUESTIONS=3`
  - `CODEX_REQUIREMENT_RBJ_MAX_REVISIONS=2`
  - `CODEX_EXECUTION_PROFILE=full-runtime`
- Smoke harness pins deterministic visibility profile:
  - `CODEX_EXECUTION_PROFILE=smoke-test`
- Turn artifacts now include explicit execution metadata:
  - `manifest.json.execution.meta` (profile/intent/full-utilization checks)
  - `manifest.json.execution.observed` (collab/mcp/dispatch counters)
- Idempotency + turn memory is persisted at:
  - `logs/harness_execution_memory.json`
- Eval run history is persisted at:
  - `logs/eval_runs.jsonl`
- Repro-friendly execution profile:
  - `executionProfile=repro` forces `webSearch=0`, `forceNewSession=1`, `requestUserInputPolicy=blocked`
  - turn visibility/artifacts now include `execution.recipe.hash`
- Daily operation log split can be enabled with `CODEX_OPERATION_LOG_DAILY_SPLIT=1` (writes `logs/codex_ops-YYYY-MM-DD.jsonl`)
- Requirement lock via the requirement guard extension is disabled by default.
  - Launchers set `CODEX_REQUIREMENT_GUARD_ENABLED=1` by default for full-runtime operation.
  - `CODEX_REQUIREMENT_GUARD_ENABLED=1`: enable the extension in the UI path.
  - `CODEX_REQUIREMENT_RBJ_ENABLED=1`: enable the Requirement Blue/Red/Judge loop block.
  - `CODEX_REQUIREMENT_RBJ_MAX_QUESTIONS=3`: cap Judge ASK questions per loop.
  - `CODEX_REQUIREMENT_RBJ_MAX_REVISIONS=2`: cap revision loops per request.
  - `#requirement-locked`: allow intake + execution in the same turn (when enabled).
  - `#guard-bypass`: skip requirement lock rewrite for one turn (when enabled).
  - `#rbj-bypass`: keep requirement lock but skip RBJ loop block for one turn.
  - `CODEX_REQUIREMENT_LOCK_ENABLED=0`: disable the guard while leaving the extension loaded.
  - `CODEX_REQUIREMENT_LOCK_REQUIRE_CONFIRM=0`: keep guard on but do not require confirm token.
  - `#scope-plus` or `#scope-expand`: approve optional Scope Expansion in the same turn.
  - `#scope-core` or `#scope-no-plus`: force baseline-only execution for one turn.
  - `CODEX_SCOPE_EXPANSION_ENABLED=0`: disable Scope Expansion while keeping Requirement Lock.
  - `CODEX_SCOPE_EXPANSION_REQUIRE_APPROVAL=0`: auto-enable expansion without explicit token.
- Migration details: `docs/standard-codex-migration.md`



