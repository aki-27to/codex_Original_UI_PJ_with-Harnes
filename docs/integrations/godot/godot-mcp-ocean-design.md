# Godot MCP Server 外洋設計

Status: `draft / phase-0 design`  
Scope: `local-first Godot editor control via MCP`  
Non-authority note: この文書は active design spec ではなく、Godot 連携の実装前提を固定する companion design memo です。`docs/CURRENT_ARCHITECTURE.md` と既存ハーネスの protocol contract は置き換えません。

## 1) Intent Translation

### ユーザー意図

ユーザーの本音は「Godot を AI が自由自在に扱えること」です。  
ここでいう自由自在は、単にファイルを書き換えられることではなく、次を含みます。

- いま Godot editor で何が開かれているかを把握できる
- scene tree / node / resource / script を意味単位で読める
- 変更を安全に適用し、差分と結果を確認できる
- 実行、ログ回収、スクリーンショット取得まで閉じられる
- ローカルの開発体験を壊さず、ユーザーに過剰な確認を求めない

### この設計で固定する acceptance checks

- Codex などの MCP client から、標準 MCP transport で Godot project に接続できる
- 初回接続時でも、addon 未配置 / 未有効 / editor 未起動のどこで止まっているかを判定し、bootstrap path を返せる
- 接続後に current scene、scene tree、selected node、project settings の少なくとも一部を構造化して取得できる
- node / scene / resource / script の変更は semantic tool call として実行でき、適用前後の diff を返せる
- 破壊的でない通常変更は自律実行できるが、rollback checkpoint を自動で残す
- play / test / import / build の headless job を起動し、ログと失敗理由を MCP 経由で取得できる
- 操作対象は allowlist された Godot project root に限定され、任意 shell 実行器にはしない
- 既存ハーネスの primary route である `POST /api/exec` と `POST /api/eval/run` は変更しない
- 既存の local-first posture とデフォルトポート `57525` を汚染しない

## 2) Benchmark と勝ち筋

### benchmark A: shell wrapper 型 Godot automation

強み:

- 実装が速い
- 何でも実行できる

弱み:

- editor の現在状態が見えない
- scene 単位の差分や rollback が弱い
- AI に渡す情報が文字列ログへ崩れる

この設計の上回り方:

- CLI lane は残すが主役にしない
- editor truth を addon 経由で構造化取得する
- mutation を scene-aware transaction に寄せる
- 変更ごとに checkpoint と diff を返す

### benchmark B: Godot editor plugin 単体

強み:

- engine 内部へ深く触れる
- selection や scene tree など editor context を見られる

弱み:

- AI client から標準接続できない
- tool / resource / audit surface が plugin 実装依存になる

この設計の上回り方:

- 標準 MCP server を入口にする
- Godot 固有能力は addon へ閉じ込め、client 側は MCP contract で統一する
- plugin 単体ではなく `MCP server + Godot bridge addon + headless job runner` の三層で責務分離する

## 3) 設計原則

- local-first: Godot editor と MCP server は同一マシン上で完結させる
- editor-truth-first: 単なる file write より editor state を優先する
- semantic-first: `write_file("*.tscn")` ではなく `scene_apply_patch` のような意味単位で操作する
- rollback-first: 通常変更は checkpoint 自動作成を前提にして user HITL を減らす
- no hidden orchestration: 既存ハーネスに独自 `/api/*` を増やさず、Godot 連携は独立 MCP process とする
- auditability: 何を見て何を変えたかを artifacts として再確認できる

## 3.1) Supported Envelope

phase-1 でサポート対象として固定する範囲を先に狭めます。

- engine baseline: `Godot 4.x only`
- posture: `single local editor per project`
- project location: allowlist されたローカル project root のみ
- primary OS: Windows を first-class にする
- secondary OS: macOS / Linux は phase-1 では design-only。実機検証が通るまで first-class にしない
- unsupported in phase-1:
  - 複数 editor instance が同じ project を同時に保持する運用
  - remote host 越しの Godot control
  - mobile / console export credential の自動配布
  - asset store / cloud account への不可逆書き込み

## 4) 全体アーキテクチャ

```text
MCP Client (Codex / Claude / etc.)
  └─ stdio
     └─ godot-mcp-server (Node, standalone)
        ├─ MCP session layer
        ├─ project registry / allowlist
        ├─ bridge client (loopback websocket)
        ├─ headless job runner (godot --headless / --editor)
        └─ artifact store (logs, screenshots, diffs, checkpoints metadata)
              ├─ runtime/godot-mcp/... or configurable local state dir
              └─ per-project session history

Godot Editor
  └─ addons/codex_mcp_bridge
     ├─ EditorPlugin
     ├─ scene/resource/script inspectors
     ├─ mutation transaction executor
     ├─ selection / scene change event emitter
     └─ loopback-only websocket server + session token

Godot CLI lane
  └─ import / play / test / build / export verification
```

## 5) 主要コンポーネント

### A. `godot-mcp-server`

責務:

- MCP `initialize` / `tools/list` / `tools/call` / `resources/list` / `resources/read` を提供する
- project root の allowlist と session 管理を行う
- Godot bridge addon への接続、切断、再接続を管理する
- headless 実行ジョブの起動とログ収集を行う
- change checkpoint と artifact index を管理する

実装方針:

- まずは standalone package として分離する
- 既存 root runtime を壊さないため、`server.js` へ埋め込まない
- MCP protocol drift を避けるため、phase-1 から official MCP SDK 採用を優先する
- custom transport 実装は conformance test が揃う場合だけの例外扱いにする

### B. `codex_mcp_bridge` Godot addon

責務:

- 開いている project / scene / selection / node / resource の editor truth を構造化して返す
- mutation request を Godot API に変換して適用する
- UndoRedo または保存前 checkpoint metadata を使って rollback 可能な単位に落とす
- session token と loopback port を持つ bridge endpoint を起動する

使う想定 API:

- `EditorPlugin`
- `EditorInterface`
- scene / resource / filesystem 系 API
- headless 実行と editor 実行の切り分けに必要な command line 引数

### C. headless job runner

責務:

- `godot --headless --path <project>` 系の実行をラップする
- import、lint 相当、scene 実行、テスト、build、export のジョブ surface を提供する
- editor bridge と切り離し、editor 未接続時でも限定機能を使えるようにする

## 6) 接続モデル

### 採用案

Godot addon が loopback-only websocket endpoint を立て、MCP server はそれに接続します。  
接続情報は project 配下の session file に保存します。

例:

- session file: `.godot/codex_mcp_bridge/session.json`
- fields:
  - `projectRoot`
  - `editorPid`
  - `engineVersion`
  - `port`
  - `token`
  - `capabilities`
  - `openedScene`
  - `timestamp`

### この案を採る理由

- stdio は MCP client と server の間に集中させたい
- Godot 側は双方向イベントが欲しいので websocket のほうが自然
- loopback + token + project local session file で設定を増やしすぎずに安全性を確保できる

## 6.1) Bootstrap / Attach Contract

minimal user intervention を成立させるため、初回接続の止まり方を architecture に含めます。

### first-use states

- addon missing
- addon present but disabled
- addon enabled but editor not running
- editor running but bridge not listening
- bridge listening but token invalid
- attached

### bootstrap path

1. `godot_projects_discover` が allowlist project を列挙する
2. `godot_bootstrap_inspect` が addon 配置、有効化、editor 起動、bridge session file の有無を診断する
3. addon missing の場合は `godot_bootstrap_prepare` が `addons/codex_mcp_bridge/` への staged install plan を返す
4. addon present but disabled の場合は `project.godot` 変更 preview を返す
5. editor not running の場合は `godot_editor_launch` で対象 project を起動できる
6. bridge listening 後に `godot_connect` が attach する

### phase-1 automation rule

- addon 配置: autonomous
- plugin enable / `project.godot` 更新: preview-first
- editor 起動: autonomous
- project-wide irreversible mutation は bootstrap に混ぜない

### no-addon fallback

addon が使えない場合でも、CLI lane のみで使える限定モードを残します。

- project discover
- headless run / test / build
- log capture

ただしこの fallback は editor truth を返せないため、「自由自在」の達成状態には含めません。

## 6.2) Session Lifecycle Contract

`.godot/codex_mcp_bridge/session.json` は単なる接続先メモではなく、lifecycle state を持つ current-truth とします。

### required fields

- `projectRoot`
- `engineVersion`
- `editorPid`
- `bridgePid`
- `port`
- `token`
- `state`
- `sessionOwner`
- `openedScene`
- `capabilities`
- `heartbeatAt`
- `issuedAt`
- `expiresAt`

### states

- `discovered`
- `bootstrap_required`
- `pending_attach`
- `attached`
- `stale`
- `reconnect_required`
- `exclusive_lock_conflict`
- `expired`

### lifecycle rules

- PID 単独では生存確認に使わず、`heartbeatAt` と token challenge を併用する
- token は attach ごとに rotation できる前提にする
- phase-1 では `sessionOwner` を 1 client に固定し、multi-client 同時 attach は `exclusive_lock_conflict` で fail-closed にする
- stale session file は `godot_bootstrap_inspect` が検出し、client に cleanup plan を返す

## 7) MCP capability surface

### tool groups

#### 1. Session / discovery

- `godot_projects_discover`
- `godot_bootstrap_inspect`
- `godot_bootstrap_prepare`
- `godot_editor_launch`
- `godot_connect`
- `godot_status`
- `godot_capabilities`

#### 2. Observation

- `godot_scene_overview`
- `godot_scene_tree`
- `godot_node_inspect`
- `godot_resource_inspect`
- `godot_selection_get`
- `godot_project_settings_get`

#### 3. Mutation

- `godot_scene_apply_patch`
- `godot_node_create`
- `godot_node_reparent`
- `godot_node_delete`
- `godot_resource_save`
- `godot_script_patch`

#### 4. Execution / verification

- `godot_run_scene`
- `godot_run_project`
- `godot_run_tests`
- `godot_import_assets`
- `godot_build_export`
- `godot_logs_tail`
- `godot_capture_frame`

#### 5. Safety / recovery

- `godot_checkpoint_create`
- `godot_checkpoint_list`
- `godot_checkpoint_restore`
- `godot_diff_last_change`

### resources

- `godot://project/summary`
- `godot://scene/current`
- `godot://scene/tree`
- `godot://selection/current`
- `godot://logs/editor/latest`
- `godot://checkpoints/recent`

### 意図的に入れないもの

- 任意 shell 実行 tool
- project root 外の任意 file write
- ハーネス独自 `/api/batch/*` への依存
- editor 未接続でも無制限に実行できる destructive command

## 8) 変更モデル

### 基本方針

変更は raw text 編集より semantic operation を優先します。  
AI が扱う最小単位を Godot の概念に寄せます。

例:

- Node 追加は `parent_path`, `type`, `name`, `properties` を受ける
- property 更新は `node_path`, `property_path`, `value` を受ける
- scene patch は operation array を受ける

### transaction ルール

- 1 tool call = 1 transaction を基本にする
- transaction 開始時に checkpoint metadata を切る
- apply 成功時は changed nodes / changed files / dirty scenes を返す
- save 前 preview を返せる mode を持つ
- rollback は checkpoint id で明示的に呼べる

### rollback matrix

- scene-only change:
  - checkpoint = scene serialized snapshot + node op log
  - restore = scene file restore + editor reload
- script change:
  - checkpoint = pre-image text snapshot
  - restore = file restore + script reload
- resource change:
  - checkpoint = resource pre-image snapshot
  - restore = resource file restore + dependent scene dirty mark
- import change:
  - checkpoint = source asset hash + import metadata snapshot
  - restore = metadata restore + reimport job
- mixed change:
  - checkpoint = ordered multi-file transaction bundle
  - restore = reverse order restore + post-restore validation
- unsaved editor state:
  - checkpoint = in-memory scene serialization captured before save
  - restore = memory snapshot re-apply, not only file restore

### atomicity rule

- phase-1 では cross-project transaction を禁止する
- one project / one transaction / one checkpoint bundle を守る
- partial apply が発生した場合は tool result を `FAILED_VALIDATION` 扱いにし、auto-restore を試みたうえで evidence を返す

### user intervention policy との整合

- reversible で局所的な mutation は自律実行
- project setting 全面変更、大量 delete、export credential 書き込みなどは user-reserved decision として gate 対象

### mutation policy classes

- `reversible_local_mutation`
  - 例: node 追加、property 更新、単一 script patch
  - default: autonomous
- `project_wide_reversible_mutation`
  - 例: plugin enable、複数 scene にまたがる rename、project setting の限定更新
  - default: preview-first
- `destructive_mutation`
  - 例: bulk delete、scene replace、resource purge
  - default: user-reserved
- `credential_bearing_mutation`
  - 例: export preset credential、signing key path、external account token
  - default: user-reserved
- `distribution_mutation`
  - 例: export artifact 配布、store upload、外部 service 書き込み
  - default: user-reserved

## 9) repo への載せ方

### 推奨レイアウト

```text
docs/integrations/godot/
  godot-mcp-ocean-design.md

tools/godot-mcp-server/
  package.json
  src/
    index.ts or index.js
    mcp/
    bridge/
    jobs/
    artifacts/
    domain/

tools/godot-mcp-server/godot/addons/codex_mcp_bridge/
  plugin.cfg
  plugin.gd
  bridge_server.gd
  inspectors/
  mutations/
```

### ハーネスとの境界

- 既存 `server.js` は Godot MCP の primary transport にならない
- 既存 `POST /api/exec` と `POST /api/eval/run` は不変
- 必要なら将来 `docs/HARNESS_APP_PLATFORM.md` か app 側から「Godot MCP を前提にした workflow」を足すが、MCP transport 自体は別 process のまま維持する

## 10) 導入フェーズ

### Phase 1: attach and observe

到達点:

- project discover
- connect
- status
- current scene/tree/selection inspection
- editor log tail

これで証明すること:

- Godot editor の現在真実を MCP 越しに扱える

### Phase 2: safe mutation

到達点:

- node create/update/delete
- scene patch
- resource save
- checkpoint and diff

これで証明すること:

- AI が Godot を触っても「何が変わったか」「戻せるか」が崩れない

### Phase 3: run and verify

到達点:

- run current scene / project
- headless test
- screenshot/log capture
- import/build/export validation

これで証明すること:

- 読む・書くで終わらず、結果確認まで閉じられる

### Phase 4: higher-order workflows

到達点:

- prefab 的な scene scaffold
- batch patch
- error-guided fix loop
- asset import and placement workflow

これで証明すること:

- 「自由自在」が単発操作ではなく制作フローの速度として出る

## 11) 検証計画

### 実装時に最低限必要な evidence

- handshake test:
  - mock bridge ではなく実 Godot editor への接続確認
- bootstrap test:
  - addon missing / disabled / editor stopped の各状態から attach まで辿れる
- observation test:
  - sample project の current scene tree を取得できる
- mutation test:
  - sample node の property を変更し、diff と checkpoint restore が通る
- execution test:
  - current scene 実行とログ取得が通る
- boundary test:
  - project root 外の path が拒否される
- resilience test:
  - editor 再起動後に reconnect できる

### repo adoption evidence

実装フェーズに入ったら、Godot 側の動作証拠だけでは足りません。repo 側では次を必須にします。

- `docs/CURRENT_ARCHITECTURE.md` の同期
- `docs/ARCHITECTURE_CHANGELOG.md` の追加 entry
- `node scripts/app_server_smoke_test.js` を既存 primary route 非破壊の証拠として維持
- server / scripts / docs 境界に触れた場合は `node scripts/system_coherence_review_test.js`
- Godot MCP package を repo に統合するなら、その package 専用 smoke / boundary test を追加する

### signoff gate

phase-0 design を phase-1 implementation kickoff に使う条件は次です。

- bootstrap contract が固定されている
- rollback matrix が fixed されている
- session lifecycle が fixed されている
- mutation policy classes が fixed されている
- repo adoption evidence が fixed されている

### 完了判定

次を満たすまで「Godot を自由自在に操れる」には到達していないとみなします。

- observation lane が editor truth を返す
- mutation lane が semantic diff と rollback を返す
- execution lane が結果証拠を返す
- destructive boundary が fail-closed である

## 12) 主要リスク

- Godot editor API は scene 編集と保存のタイミングで dirty state 管理が難しい
- editor screenshot と runtime screenshot は取得経路を分けたほうが安定する可能性が高い
- Node / GDScript 間で値型の変換規約を先に固定しないと tool schema がすぐ壊れる
- MCP SDK を採らずに自前 transport を持つと protocol drift の保守コストが増える

## 13) 次の具体化対象

詳細設計に落とす順番は次です。

1. bridge session file schema
2. Phase 1 tool schema
3. observation payload schema
4. mutation transaction schema
5. headless job contract
6. bootstrap contract and project patch preview schema
7. artifacts directory contract

この順で固めれば、最初の実装でも generic wrapper ではなく、Godot 専用の実在感がある MCP にできます。
