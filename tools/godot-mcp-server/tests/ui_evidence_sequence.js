#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const serverRoot = path.resolve(__dirname, "..");
const repoRoot = path.resolve(__dirname, "..", "..", "..");
const outputPath = path.join(repoRoot, "output", "godot_mcp_ui_sequence.json");

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

function compactState(state) {
  return {
    score: state.score,
    lines: state.lines,
    level: state.level,
    pieces_locked: state.pieces_locked,
    stack_height: state.stack_height,
    danger_ratio: state.danger_ratio,
    lines_to_next_level: state.lines_to_next_level,
    current_piece: state.current_piece,
    current_rotation: state.current_rotation,
    current_origin: state.current_origin,
    hold_piece: state.hold_piece,
    queue: state.queue,
    game_over: state.game_over,
    paused: state.paused,
    bridge: {
      last_command_id: state.bridge?.last_command_id,
      last_command_name: state.bridge?.last_command_name,
      last_command_status: state.bridge?.last_command_status,
      command_history_count: Array.isArray(state.bridge?.command_history) ? state.bridge.command_history.length : 0,
      command_history: state.bridge?.command_history || [],
    },
  };
}

async function captureStage(client, sessionId, name) {
  const capture = await callJson(client, "godot_debug_capture_frame", {
    session_id: sessionId,
    timeout_ms: 8000,
  });
  const state = await callJson(client, "godot_debug_session_state", {
    session_id: sessionId,
  });
  return {
    name,
    capturePath: capture.capturePath,
    state: compactState(state.state),
  };
}

async function moveToLeftOffset(client, sessionId, offsetFromWall) {
  for (let i = 0; i < 8; i += 1) {
    await callJson(client, "godot_debug_send_command", {
      session_id: sessionId,
      command: "move_left",
      timeout_ms: 8000,
    });
  }
  for (let i = 0; i < offsetFromWall; i += 1) {
    await callJson(client, "godot_debug_send_command", {
      session_id: sessionId,
      command: "move_right",
      timeout_ms: 8000,
    });
  }
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
    name: "godot-mcp-ui-evidence",
    version: "0.1.0",
  });

  await client.connect(transport);
  let sessionId = null;

  try {
    const guiSession = await callJson(client, "godot_debug_session_start", {
      headless: false,
      timeout_ms: 15000,
    });
    sessionId = guiSession.sessionId;

    const stages = [];
    stages.push(await captureStage(client, sessionId, "start"));

    await callJson(client, "godot_debug_send_command", {
      session_id: sessionId,
      command: "hold",
      timeout_ms: 8000,
    });
    stages.push(await captureStage(client, sessionId, "post_hold"));

    const offsets = [0, 2, 1, 3, 0, 2, 1, 4, 0, 3, 1, 2, 0, 1, 3, 2];
    let midCaptured = false;
    let pressureCaptured = false;

    for (let index = 0; index < offsets.length; index += 1) {
      const current = await callJson(client, "godot_debug_session_state", {
        session_id: sessionId,
      });
      if (current.state?.game_over) {
        break;
      }
      if (index % 2 === 0) {
        await callJson(client, "godot_debug_send_command", {
          session_id: sessionId,
          command: "rotate_cw",
          timeout_ms: 8000,
        });
      }
      await moveToLeftOffset(client, sessionId, offsets[index]);
      const dropped = await callJson(client, "godot_debug_send_command", {
        session_id: sessionId,
        command: "hard_drop",
        timeout_ms: 8000,
      });
      const stackHeight = Number(dropped.state?.stack_height || 0);
      if (!midCaptured && stackHeight >= 5) {
        stages.push(await captureStage(client, sessionId, "mid_stack"));
        midCaptured = true;
      }
      if (!pressureCaptured && stackHeight >= 9) {
        stages.push(await captureStage(client, sessionId, "pressure"));
        pressureCaptured = true;
      }
      if (Number(dropped.state?.danger_ratio || 0) >= 0.6 || dropped.state?.game_over) {
        break;
      }
    }

    stages.push(await captureStage(client, sessionId, "post_command"));
    const finalState = await callJson(client, "godot_debug_session_state", {
      session_id: sessionId,
    });

    const payload = {
      ok: true,
      sessionId,
      artifactCreatedAt: new Date().toISOString(),
      stages,
      finalState: compactState(finalState.state),
    };

    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
    console.log(JSON.stringify(payload, null, 2));
  } finally {
    if (sessionId) {
      try {
        await callJson(client, "godot_debug_session_stop", { session_id: sessionId });
      } catch {}
    }
    await transport.close();
  }
}

main().catch((error) => {
  console.error("[godot-mcp-ui-evidence] failed:", error);
  process.exit(1);
});
