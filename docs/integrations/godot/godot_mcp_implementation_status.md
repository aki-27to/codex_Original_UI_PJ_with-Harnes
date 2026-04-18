# Godot MCP Implementation Status

Updated: 2026-04-15

## Scope

This document captures the shipped implementation status for the local-first Godot MCP server and the proof project used to validate it.

## Delivered Surface

- Standalone MCP server:
  - `tools/godot-mcp-server/src/server.js`
- MCP smoke client:
  - `tools/godot-mcp-server/tests/smoke_test.js`
- Local Godot runtime pinned for reproducible runs:
  - `tools/godot-runtime/Godot_v4.6.2-stable_win64.exe`
  - `tools/godot-runtime/Godot_v4.6.2-stable_win64_console.exe`
- Proof project completed with playable Tetris loop:
  - `APP/04.godot/01.TTL/project.godot`
  - `APP/04.godot/01.TTL/scenes/main.tscn`
  - `APP/04.godot/01.TTL/scripts/tetris_game.gd`
  - `APP/04.godot/01.TTL/debug/test_tetris.gd`

## Tetris UI Surface

- The proof project is not only a rules-complete Tetris loop; it now ships with a deliberate in-game HUD and a denser presentation surface.
- The final HUD pass intentionally avoids template-dashboard language:
  - the score tower is the single heavy mass
  - the next queue is a rack, not a repeated card column
  - hold and control remain thin attached bands instead of competing panels
- The playfield renders stack pressure directly:
  - live pressure rail
  - top-out danger tint
  - active-piece header
- The telemetry band now exposes concrete runtime values rather than abstract filler copy:
  - stack height
  - remaining headroom
  - lines to next level
  - locked-piece count
  - bag progress
- The Godot MCP live-debug bridge is visible in the actual game screen through bridge-state HUD text and the GUI capture artifacts.
- The closeout evidence now includes staged GUI proof instead of a single idle frame.

## Runtime Default

- Automation-facing Godot MCP runs now default to headless mode.
- `godot_run_project` uses the console/headless binary unless `headless=false` is supplied explicitly.
- `godot_debug_session_start` also defaults to headless so routine Codex-driven build/debug loops do not steal desktop focus.
- `godot_launch_editor` remains explicitly visible by design because its purpose is to open the editor window.

## Implemented MCP Tools

- `godot_project_status`
- `godot_files_list`
- `godot_file_read`
- `godot_text_asset_write`
- `godot_script_apply_patch`
- `godot_scene_tree_get`
- `godot_launch_editor`
- `godot_run_project`
- `godot_headless_run_script`
- `godot_capture_probe`
- `godot_debug_session_start`
- `godot_debug_session_state`
- `godot_debug_send_command`
- `godot_debug_capture_frame`
- `godot_debug_session_stop`
- `godot_logs_tail`
- `godot_stop_run`

## What The Runtime Proof Covers

- The MCP server can inspect the Godot project and scene tree.
- The MCP server can run a deterministic headless validation script against the Tetris project.
- The MCP server can capture dynamic runtime state and a probe screenshot.
- The MCP server can start a live debug session, inject gameplay commands, read live state, capture a live frame, and stop the session.
- The runtime state export now includes gameplay telemetry used by the HUD:
  - `pieces_locked`
  - `stack_height`
  - `danger_ratio`
  - `lines_to_next_level`
- The proof project supports runtime observation through:
  - `OS.get_cmdline_user_args()` probe flags
  - bridge-backed live command files
  - state export to JSON
  - screenshot export to PNG
  - scripted scene manipulation for debug verification

## Verification Commands

From `tools/godot-mcp-server/`:

```powershell
npm install
npm run smoke
$env:GODOT_MCP_SMOKE_GUI='1'; node .\tests\smoke_test.js
node .\tests\ui_evidence_sequence.js
```

Direct Godot validation:

```powershell
& "C:\Users\akima\dev\codex_Original_UI_PJ_with-Harnes\tools\godot-runtime\Godot_v4.6.2-stable_win64_console.exe" `
  --headless `
  --path "C:\Users\akima\dev\codex_Original_UI_PJ_with-Harnes\APP\04.godot\01.TTL" `
  --script "C:\Users\akima\dev\codex_Original_UI_PJ_with-Harnes\APP\04.godot\01.TTL\debug\test_tetris.gd"
```

GUI probe capture:

```powershell
& "C:\Users\akima\dev\codex_Original_UI_PJ_with-Harnes\tools\godot-runtime\Godot_v4.6.2-stable_win64.exe" `
  --path "C:\Users\akima\dev\codex_Original_UI_PJ_with-Harnes\APP\04.godot\01.TTL" `
  --debug `
  --quit-after 8 `
  --log-file "C:\Users\akima\dev\codex_Original_UI_PJ_with-Harnes\output\godot_probe_gui\run.log" `
  -- `
  --mcp-state "C:\Users\akima\dev\codex_Original_UI_PJ_with-Harnes\output\godot_probe_gui\state.json" `
  --mcp-screenshot "C:\Users\akima\dev\codex_Original_UI_PJ_with-Harnes\output\godot_probe_gui\screen.png" `
  --mcp-quit-after-frames 8
```

## Evidence Artifacts

- Headless MCP probe screenshot:
  - `output/godot_mcp/probe-*/probe.png`
- Headless MCP probe state:
  - `output/godot_mcp/probe-*/probe_state.json`
- GUI MCP live-debug capture:
  - `output/godot_mcp/debug-*/bridge/live_capture.png`
- GUI MCP smoke result:
  - `output/godot_mcp_gui_smoke_output.json`
- GUI staged debug sequence:
  - `output/godot_mcp_ui_sequence.json`
- GUI probe screenshot:
  - `output/godot_probe_gui/screen.png`
- GUI probe state:
  - `output/godot_probe_gui/state.json`
- GUI probe runtime log:
  - `output/godot_probe_gui/run.log`

## Current Limits

- The delivered debug loop now supports live session control, but it is still runtime-debug oriented rather than a full IDE debugger.
- Breakpoint stepping and call-stack control are not implemented yet.
- Scene/resource mutation is currently text-patch and semantic inspection oriented; deeper live editor mutation is the next layer.
