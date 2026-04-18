#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const serverRoot = path.resolve(__dirname, "..");

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function parseToolJson(result) {
  const textBlock = (result.content || []).find((entry) => entry.type === "text");
  assert(textBlock && typeof textBlock.text === "string", "Tool response did not contain text content.");
  return JSON.parse(textBlock.text);
}

async function callJson(client, name, args = {}) {
  const result = await client.callTool({
    name,
    arguments: args,
  });
  return parseToolJson(result);
}

async function main() {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [path.join(serverRoot, "src", "server.js")],
    cwd: serverRoot,
    stderr: "pipe",
  });
  if (transport.stderr) {
    transport.stderr.on("data", (chunk) => {
      process.stderr.write(chunk);
    });
  }

  const client = new Client({
    name: "godot-mcp-smoke",
    version: "0.1.0",
  });

  await client.connect(transport);

  let debugSessionId = null;
  let guiDebugSessionId = null;

  try {
    const toolList = await client.listTools();
    const requiredTools = [
      "godot_project_status",
      "godot_scene_tree_get",
      "godot_headless_run_script",
      "godot_capture_probe",
      "godot_debug_session_start",
      "godot_debug_session_state",
      "godot_debug_send_command",
      "godot_debug_capture_frame",
      "godot_debug_session_stop",
      "godot_logs_tail",
    ];
    const toolNames = new Set(toolList.tools.map((tool) => tool.name));
    for (const toolName of requiredTools) {
      assert(toolNames.has(toolName), `Missing required MCP tool: ${toolName}`);
    }

    const status = await callJson(client, "godot_project_status");
    assert(status.projectExists === true, "Godot project was not detected.");
    assert(Boolean(status.mainScene), "Main scene is not configured.");

    const sceneTree = await callJson(client, "godot_scene_tree_get");
    assert(sceneTree.root?.name === "TetrisGame", "Unexpected scene root.");
    assert(sceneTree.nodeCount >= 1, "Scene tree appears empty.");

    const resource = await client.readResource({ uri: "godot://project/status" });
    const resourceText = resource.contents?.[0]?.text || "";
    assert(resourceText.includes("\"mainScene\""), "Project status resource was not readable.");

    const scriptedRun = await callJson(client, "godot_headless_run_script", {
      script_path: "debug/test_tetris.gd",
      timeout_ms: 60000,
    });
    assert(scriptedRun.exitCode === 0, "Headless scripted validation failed.");
    assert(String(scriptedRun.tail || "").includes("PASS: TTL Tetris cleared a scripted line."), "Expected PASS marker not found.");

    const tailedLog = await callJson(client, "godot_logs_tail", {
      run_id: scriptedRun.runId,
      lines: 40,
    });
    assert(String(tailedLog.tail || "").includes("PASS: TTL Tetris cleared a scripted line."), "Runtime log tail did not capture PASS marker.");

    const probe = await callJson(client, "godot_capture_probe", {
      frames: 8,
      timeout_ms: 60000,
      headless: true,
    });
    assert(probe.exitCode === 0, "Probe capture did not exit cleanly.");
    assert(probe.statePath && fs.existsSync(probe.statePath), "Probe state artifact missing.");
    assert(probe.screenshotPath && fs.existsSync(probe.screenshotPath), "Probe screenshot artifact missing.");
    assert(probe.state?.current_piece, "Probe state payload was empty.");

    const defaultRun = await callJson(client, "godot_run_project", {
      quit_after: 4,
    });
    assert(defaultRun.executable === status.godotConsolePath, "Default run should use the console/headless Godot binary.");
    await callJson(client, "godot_stop_run", {
      run_id: defaultRun.runId,
    });

    const debugSession = await callJson(client, "godot_debug_session_start", {
      timeout_ms: 15000,
    });
    debugSessionId = debugSession.sessionId;
    assert(debugSession.headless === true, "Default debug session should start headless.");
    assert(debugSession.initialState?.current_piece, "Debug session did not publish an initial state.");
    const initialX = Number(debugSession.initialState.current_origin?.x);

    const moved = await callJson(client, "godot_debug_send_command", {
      session_id: debugSessionId,
      command: "move_left",
      timeout_ms: 8000,
    });
    assert(Number(moved.state?.current_origin?.x) === initialX - 1, "Live move_left command did not change the current origin.");

    const rotated = await callJson(client, "godot_debug_send_command", {
      session_id: debugSessionId,
      command: "rotate_cw",
      timeout_ms: 8000,
    });
    assert(Number(rotated.state?.current_rotation) === 1, "Live rotate_cw command did not update rotation.");

    const dropped = await callJson(client, "godot_debug_send_command", {
      session_id: debugSessionId,
      command: "hard_drop",
      timeout_ms: 8000,
    });
    assert(Number(dropped.state?.locked_cells) >= 4, "Live hard_drop command did not lock a tetromino into the board.");

    const liveCapture = await callJson(client, "godot_debug_capture_frame", {
      session_id: debugSessionId,
      timeout_ms: 8000,
    });
    assert(liveCapture.capturePath && fs.existsSync(liveCapture.capturePath), "Live debug capture artifact missing.");

    const liveState = await callJson(client, "godot_debug_session_state", {
      session_id: debugSessionId,
    });
    assert(liveState.state?.bridge?.last_command_name === "capture_frame", "Debug session state did not reflect the latest live command.");

    const runGuiSession = process.env.GODOT_MCP_SMOKE_GUI === "1";
    let guiDebugProof = null;
    if (runGuiSession) {
      const guiSession = await callJson(client, "godot_debug_session_start", {
        headless: false,
        timeout_ms: 15000,
      });
      guiDebugSessionId = guiSession.sessionId;
      const guiMove = await callJson(client, "godot_debug_send_command", {
        session_id: guiDebugSessionId,
        command: "move_left",
        timeout_ms: 8000,
      });
      const guiCapture = await callJson(client, "godot_debug_capture_frame", {
        session_id: guiDebugSessionId,
        timeout_ms: 8000,
      });
      assert(Number(guiMove.state?.current_origin?.x) === Number(guiSession.initialState.current_origin?.x) - 1, "GUI debug session did not accept live movement.");
      assert(guiCapture.capturePath && fs.existsSync(guiCapture.capturePath), "GUI debug capture artifact missing.");
      guiDebugProof = {
        sessionId: guiDebugSessionId,
        capturePath: guiCapture.capturePath,
      };
    }

    console.log(
      JSON.stringify(
        {
          ok: true,
          projectRoot: status.projectRoot,
          projectName: status.projectName,
          mainScene: status.mainScene,
          sceneRoot: sceneTree.root,
          scriptedRun: {
            runId: scriptedRun.runId,
            exitCode: scriptedRun.exitCode,
          },
          probe: {
            runId: probe.runId,
            exitCode: probe.exitCode,
            screenshotPath: probe.screenshotPath,
            statePath: probe.statePath,
            currentPiece: probe.state.current_piece,
          },
          liveDebug: {
            sessionId: debugSessionId,
            capturePath: liveCapture.capturePath,
            lockedCells: dropped.state.locked_cells,
            lastCommand: liveState.state.bridge.last_command_name,
          },
          guiDebug: guiDebugProof,
        },
        null,
        2
      )
    );
  } finally {
    if (guiDebugSessionId) {
      try {
        await callJson(client, "godot_debug_session_stop", { session_id: guiDebugSessionId });
      } catch {}
    }
    if (debugSessionId) {
      try {
        await callJson(client, "godot_debug_session_stop", { session_id: debugSessionId });
      } catch {}
    }
    await transport.close();
  }
}

main().catch((error) => {
  console.error("[godot-mcp-smoke] failed:", error);
  process.exit(1);
});
