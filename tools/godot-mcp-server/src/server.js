#!/usr/bin/env node

import fs from "node:fs";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn, spawnSync } from "node:child_process";
import crypto from "node:crypto";

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod/v4";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..", "..", "..");

function parseCli(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const entry = argv[index];
    if (!entry.startsWith("--")) continue;
    const key = entry.slice(2);
    const value = argv[index + 1] && !argv[index + 1].startsWith("--") ? argv[index + 1] : "true";
    options[key] = value;
    if (value !== "true") index += 1;
  }
  return options;
}

const cli = parseCli(process.argv.slice(2));

const projectRoot = path.resolve(cli.project || path.join(repoRoot, "APP", "04.godot", "01.TTL"));
const artifactRoot = path.resolve(cli["artifact-root"] || path.join(repoRoot, "output", "godot_mcp"));
const godotGuiPath = path.resolve(
  cli["godot-exe"] || path.join(repoRoot, "tools", "godot-runtime", "Godot_v4.6.2-stable_win64.exe")
);
const godotConsolePath = path.resolve(
  cli["godot-console-exe"] || path.join(repoRoot, "tools", "godot-runtime", "Godot_v4.6.2-stable_win64_console.exe")
);

const activeRuns = new Map();
const activeDebugSessions = new Map();
let debugCommandSerial = 0;

function textContent(text) {
  return {
    content: [
      {
        type: "text",
        text: typeof text === "string" ? text : JSON.stringify(text, null, 2),
      },
    ],
  };
}

function jsonResult(data) {
  return textContent(JSON.stringify(data, null, 2));
}

function safeStat(targetPath) {
  try {
    return fs.statSync(targetPath);
  } catch {
    return null;
  }
}

function ensureDirectory(targetPath) {
  fs.mkdirSync(targetPath, { recursive: true });
}

function resolveProjectPath(inputPath = ".") {
  const raw = String(inputPath || ".").trim();
  if (raw.startsWith("res://")) {
    return path.resolve(projectRoot, raw.slice("res://".length));
  }
  const absolute = path.resolve(projectRoot, raw);
  const relative = path.relative(projectRoot, absolute);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`Path escapes project root: ${inputPath}`);
  }
  return absolute;
}

function toProjectRelative(absolutePath) {
  return path.relative(projectRoot, absolutePath).replace(/\\/g, "/");
}

function readText(filePath) {
  return fs.readFileSync(filePath, "utf8");
}

function writeText(filePath, content) {
  ensureDirectory(path.dirname(filePath));
  fs.writeFileSync(filePath, content, "utf8");
}

function getProjectConfig() {
  const configPath = path.join(projectRoot, "project.godot");
  const exists = fs.existsSync(configPath);
  const text = exists ? readText(configPath) : "";
  const mainSceneMatch = text.match(/run\/main_scene="([^"]+)"/);
  const projectNameMatch = text.match(/config\/name="([^"]+)"/);
  return {
    configPath,
    exists,
    text,
    mainScene: mainSceneMatch ? mainSceneMatch[1] : null,
    name: projectNameMatch ? projectNameMatch[1] : null,
  };
}

function parseSceneTree(sceneText) {
  const lines = String(sceneText || "").split(/\r?\n/);
  const nodes = [];
  for (const line of lines) {
    const match = line.match(/^\[node name="([^"]+)"(?: type="([^"]+)")?(?: parent="([^"]*)")?.*]/);
    if (!match) continue;
    const [, name, type = "", parent = ""] = match;
    const parentPath = parent === "." ? "" : parent;
    const nodePath = parentPath ? `${parentPath}/${name}` : name;
    nodes.push({
      name,
      type,
      parent: parentPath,
      path: nodePath,
    });
  }
  return {
    root: nodes[0] || null,
    nodes,
  };
}

function nextRunId(prefix) {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  return `${prefix}-${stamp}-${crypto.randomBytes(3).toString("hex")}`;
}

function readTail(filePath, lineCount = 80) {
  if (!fs.existsSync(filePath)) return "";
  const text = fs.readFileSync(filePath, "utf8");
  const lines = text.split(/\r?\n/);
  return lines.slice(Math.max(0, lines.length - lineCount)).join("\n");
}

function getVersion() {
  const result = spawnSync(godotConsolePath, ["--version"], {
    cwd: projectRoot,
    encoding: "utf8",
    windowsHide: true,
    timeout: 15000,
  });
  if (result.error) {
    return { ok: false, output: String(result.error.message || result.error) };
  }
  return {
    ok: result.status === 0,
    output: String(result.stdout || result.stderr || "").trim(),
  };
}

function appendArrayArg(args, values) {
  if (!Array.isArray(values)) return;
  for (const entry of values) {
    args.push(String(entry));
  }
}

function createArtifactDir(runId) {
  const dir = path.join(artifactRoot, runId);
  ensureDirectory(dir);
  return dir;
}

function readJsonIfExists(filePath) {
  if (!fs.existsSync(filePath)) return null;
  try {
    return JSON.parse(readText(filePath));
  } catch {
    return null;
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForCondition(checker, options = {}) {
  const timeoutMs = options.timeoutMs ?? 5000;
  const intervalMs = options.intervalMs ?? 100;
  const description = options.description ?? "condition";
  const startedAt = Date.now();
  while (Date.now() - startedAt <= timeoutMs) {
    const result = await checker();
    if (result) return result;
    await sleep(intervalMs);
  }
  throw new Error(`Timed out waiting for ${description} after ${timeoutMs}ms`);
}

function isRunActive(runId) {
  const metadata = activeRuns.get(runId);
  return Boolean(metadata && !metadata.finishedAt);
}

function getDebugSession(sessionId) {
  const session = activeDebugSessions.get(sessionId);
  if (!session) {
    throw new Error(`Unknown debug session: ${sessionId}`);
  }
  return session;
}

function serializeDebugSession(session) {
  return {
    sessionId: session.sessionId,
    runId: session.runId,
    artifactDir: session.artifactDir,
    bridgeDir: session.bridgeDir,
    commandsDir: session.commandsDir,
    statePath: session.statePath,
    capturePath: session.capturePath,
    startedAt: session.startedAt,
    headless: session.headless,
    scenePath: session.scenePath,
    runActive: isRunActive(session.runId),
  };
}

function waitForExit(child, timeoutMs = 60000) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      try {
        child.kill();
      } catch {}
      reject(new Error(`Process timeout after ${timeoutMs}ms`));
    }, timeoutMs);
    child.once("error", (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(error);
    });
    child.once("exit", (code, signal) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ code, signal });
    });
  });
}

function killProcessTree(pid) {
  if (!pid) return;
  spawnSync("taskkill", ["/pid", String(pid), "/t", "/f"], {
    windowsHide: true,
    stdio: "ignore",
  });
}

function spawnGodot({
  runId,
  executable,
  args,
  logName,
  visible = false,
  wait = false,
  timeoutMs = 60000,
}) {
  const artifactDir = createArtifactDir(runId);
  const logPath = path.join(artifactDir, logName);
  const logStream = fs.createWriteStream(logPath, { flags: "a" });
  const child = spawn(executable, args, {
    cwd: projectRoot,
    windowsHide: !visible,
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout.on("data", (chunk) => logStream.write(chunk));
  child.stderr.on("data", (chunk) => logStream.write(chunk));
  child.once("exit", () => logStream.end());

  const metadata = {
    runId,
    pid: child.pid,
    artifactDir,
    logPath,
    args,
    executable,
    startedAt: new Date().toISOString(),
  };
  activeRuns.set(runId, { child, ...metadata });

  if (!wait) {
    child.once("exit", (code, signal) => {
      const current = activeRuns.get(runId);
      if (current) {
        current.exitCode = code;
        current.exitSignal = signal;
        current.finishedAt = new Date().toISOString();
      }
    });
    return Promise.resolve(metadata);
  }

  return waitForExit(child, timeoutMs).then(({ code, signal }) => {
    const current = activeRuns.get(runId);
    if (current) {
      current.exitCode = code;
      current.exitSignal = signal;
      current.finishedAt = new Date().toISOString();
    }
    return { ...metadata, exitCode: code, exitSignal: signal };
  });
}

async function listProjectFiles(basePath = ".", extensions = []) {
  const absoluteBase = resolveProjectPath(basePath);
  const files = [];
  async function walk(currentPath) {
    const entries = await fsp.readdir(currentPath, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name === ".godot" || entry.name === ".import") continue;
      const fullPath = path.join(currentPath, entry.name);
      if (entry.isDirectory()) {
        await walk(fullPath);
      } else if (!extensions.length || extensions.includes(path.extname(entry.name).toLowerCase())) {
        files.push(toProjectRelative(fullPath));
      }
    }
  }
  await walk(absoluteBase);
  files.sort();
  return files;
}

const server = new McpServer({
  name: "godot-mcp-server",
  version: "0.1.0",
});

server.registerResource(
  "project-status",
  "godot://project/status",
  {
    title: "Godot Project Status",
    description: "Current project configuration, binary availability, and main scene.",
    mimeType: "application/json",
  },
  async () => {
    const project = getProjectConfig();
    const version = getVersion();
    return {
      contents: [
        {
          uri: "godot://project/status",
          mimeType: "application/json",
          text: JSON.stringify(
            {
              projectRoot,
              exists: project.exists,
              name: project.name,
              mainScene: project.mainScene,
              godotGuiPath,
              godotConsolePath,
              guiExists: fs.existsSync(godotGuiPath),
              consoleExists: fs.existsSync(godotConsolePath),
              version,
            },
            null,
            2
          ),
        },
      ],
    };
  }
);

server.registerTool(
  "godot_project_status",
  {
    description: "Inspect the Godot project root, main scene, and runtime binary availability.",
  },
  async () => {
    const project = getProjectConfig();
    return jsonResult({
      projectRoot,
      projectExists: project.exists,
      projectName: project.name,
      mainScene: project.mainScene,
      godotGuiPath,
      godotConsolePath,
      godotGuiExists: fs.existsSync(godotGuiPath),
      godotConsoleExists: fs.existsSync(godotConsolePath),
      version: getVersion(),
      activeRuns: Array.from(activeRuns.values()).map((entry) => ({
        runId: entry.runId,
        pid: entry.pid,
        startedAt: entry.startedAt,
        finishedAt: entry.finishedAt || null,
        logPath: entry.logPath,
      })),
      activeDebugSessions: Array.from(activeDebugSessions.values()).map((session) => serializeDebugSession(session)),
    });
  }
);

server.registerTool(
  "godot_files_list",
  {
    description: "List project files inside the Godot project root.",
    inputSchema: {
      base_path: z.string().optional(),
      extensions: z.array(z.string()).optional(),
    },
  },
  async ({ base_path, extensions }) => {
    const files = await listProjectFiles(base_path || ".", (extensions || []).map((item) => item.toLowerCase()));
    return jsonResult({ files, count: files.length });
  }
);

server.registerTool(
  "godot_file_read",
  {
    description: "Read a text asset from the Godot project.",
    inputSchema: {
      path: z.string(),
    },
  },
  async ({ path: targetPath }) => {
    const absolutePath = resolveProjectPath(targetPath);
    return jsonResult({
      path: toProjectRelative(absolutePath),
      content: readText(absolutePath),
    });
  }
);

server.registerTool(
  "godot_text_asset_write",
  {
    description: "Write a text-based asset under the Godot project root.",
    inputSchema: {
      path: z.string(),
      content: z.string(),
    },
  },
  async ({ path: targetPath, content }) => {
    const absolutePath = resolveProjectPath(targetPath);
    const previous = safeStat(absolutePath) ? readText(absolutePath) : "";
    writeText(absolutePath, content);
    return jsonResult({
      path: toProjectRelative(absolutePath),
      bytes: Buffer.byteLength(content, "utf8"),
      existedBefore: Boolean(previous),
      changed: previous !== content,
    });
  }
);

server.registerTool(
  "godot_script_apply_patch",
  {
    description: "Apply a simple find/replace patch to a text asset within the project.",
    inputSchema: {
      path: z.string(),
      find_text: z.string(),
      replace_text: z.string(),
    },
  },
  async ({ path: targetPath, find_text, replace_text }) => {
    const absolutePath = resolveProjectPath(targetPath);
    const original = readText(absolutePath);
    if (!original.includes(find_text)) {
      throw new Error(`find_text not found in ${targetPath}`);
    }
    const updated = original.replace(find_text, replace_text);
    writeText(absolutePath, updated);
    return jsonResult({
      path: toProjectRelative(absolutePath),
      replaced: find_text,
    });
  }
);

server.registerTool(
  "godot_scene_tree_get",
  {
    description: "Parse a .tscn file and return its node tree in a lightweight structured form.",
    inputSchema: {
      scene_path: z.string().optional(),
    },
  },
  async ({ scene_path }) => {
    const project = getProjectConfig();
    const chosen = scene_path || project.mainScene;
    if (!chosen) throw new Error("No scene path supplied and project main scene is not configured.");
    const absolutePath = resolveProjectPath(chosen);
    const parsed = parseSceneTree(readText(absolutePath));
    return jsonResult({
      scenePath: chosen,
      root: parsed.root,
      nodeCount: parsed.nodes.length,
      nodes: parsed.nodes,
    });
  }
);

server.registerTool(
  "godot_launch_editor",
  {
    description: "Launch the Godot editor for the current project.",
    inputSchema: {
      dap_port: z.number().int().positive().optional(),
    },
  },
  async ({ dap_port }) => {
    const runId = nextRunId("editor");
    const args = ["--editor", "--path", projectRoot];
    if (dap_port) {
      args.push("--dap-port", String(dap_port));
    }
    const metadata = await spawnGodot({
      runId,
      executable: godotGuiPath,
      args,
      logName: "editor.log",
      visible: true,
      wait: false,
    });
    return jsonResult(metadata);
  }
);

server.registerTool(
  "godot_run_project",
  {
    description: "Run the Godot project or a specific scene. Defaults to headless for automation-safe runs; set headless=false to open a visible window.",
    inputSchema: {
      scene_path: z.string().optional(),
      headless: z.boolean().optional(),
      debug: z.boolean().optional(),
      quit_after: z.number().int().positive().optional(),
      user_args: z.array(z.string()).optional(),
    },
  },
  async ({ scene_path, headless, debug, quit_after, user_args }) => {
    const runHeadless = headless !== false;
    const runId = nextRunId(runHeadless ? "headless-run" : "run");
    const executable = runHeadless ? godotConsolePath : godotGuiPath;
    const args = ["--path", projectRoot];
    if (scene_path) {
      args.push("--scene", scene_path);
    }
    if (runHeadless) {
      args.push("--headless");
    }
    if (debug !== false) {
      args.push("--debug");
    }
    if (quit_after) {
      args.push("--quit-after", String(quit_after));
    }
    args.push("--log-file", path.join(artifactRoot, runId, "runtime.log"));
    if (Array.isArray(user_args) && user_args.length) {
      args.push("--");
      appendArrayArg(args, user_args);
    }
    const metadata = await spawnGodot({
      runId,
      executable,
      args,
      logName: "runtime-stdio.log",
      visible: !runHeadless,
      wait: false,
    });
    return jsonResult(metadata);
  }
);

server.registerTool(
  "godot_headless_run_script",
  {
    description: "Run a Godot script in headless mode for deterministic validation.",
    inputSchema: {
      script_path: z.string(),
      user_args: z.array(z.string()).optional(),
      timeout_ms: z.number().int().positive().optional(),
    },
  },
  async ({ script_path, user_args, timeout_ms }) => {
    const runId = nextRunId("script");
    const absoluteScript = resolveProjectPath(script_path);
    const args = [
      "--headless",
      "--path",
      projectRoot,
      "--script",
      absoluteScript,
      "--log-file",
      path.join(artifactRoot, runId, "script.log"),
    ];
    if (Array.isArray(user_args) && user_args.length) {
      args.push("--");
      appendArrayArg(args, user_args);
    }
    const result = await spawnGodot({
      runId,
      executable: godotConsolePath,
      args,
      logName: "script-stdio.log",
      visible: false,
      wait: true,
      timeoutMs: timeout_ms || 60000,
    });
    return jsonResult({
      ...result,
      tail: readTail(result.logPath, 120),
    });
  }
);

server.registerTool(
  "godot_capture_probe",
  {
    description: "Run the project with MCP probe user args and collect screenshot/state artifacts if the project supports them.",
    inputSchema: {
      scene_path: z.string().optional(),
      headless: z.boolean().optional(),
      frames: z.number().int().positive().optional(),
      timeout_ms: z.number().int().positive().optional(),
    },
  },
  async ({ scene_path, headless, frames, timeout_ms }) => {
    const runId = nextRunId("probe");
    const artifactDir = createArtifactDir(runId);
    const statePath = path.join(artifactDir, "probe_state.json");
    const screenshotPath = path.join(artifactDir, "probe.png");
    const runHeadless = headless !== false;
    const args = [
      "--path",
      projectRoot,
      "--debug",
      "--quit-after",
      String(frames || 80),
      "--log-file",
      path.join(artifactDir, "probe.log"),
    ];
    if (runHeadless) {
      args.push("--headless");
    }
    if (scene_path) {
      args.push("--scene", scene_path);
    }
    args.push("--");
    args.push("--mcp-state", statePath, "--mcp-screenshot", screenshotPath, "--mcp-quit-after-frames", String(frames || 80));
    const result = await spawnGodot({
      runId,
      executable: runHeadless ? godotConsolePath : godotGuiPath,
      args,
      logName: "probe-stdio.log",
      visible: !runHeadless,
      wait: true,
      timeoutMs: timeout_ms || 90000,
    });
    return jsonResult({
      ...result,
      headless: runHeadless,
      statePath: fs.existsSync(statePath) ? statePath : null,
      screenshotPath: fs.existsSync(screenshotPath) ? screenshotPath : null,
      state: fs.existsSync(statePath) ? JSON.parse(readText(statePath)) : null,
      tail: readTail(result.logPath, 160),
    });
  }
);

server.registerTool(
  "godot_debug_session_start",
  {
    description: "Start a Godot debug session with a local bridge for live state reads, command injection, and frame capture. Defaults to headless so automation does not steal desktop focus; set headless=false for a visible session.",
    inputSchema: {
      scene_path: z.string().optional(),
      headless: z.boolean().optional(),
      timeout_ms: z.number().int().positive().optional(),
    },
  },
  async ({ scene_path, headless, timeout_ms }) => {
    const runHeadless = headless !== false;
    const runId = nextRunId(runHeadless ? "debug-headless" : "debug");
    const artifactDir = createArtifactDir(runId);
    const bridgeDir = path.join(artifactDir, "bridge");
    const commandsDir = path.join(bridgeDir, "commands");
    const statePath = path.join(bridgeDir, "state.json");
    const capturePath = path.join(bridgeDir, "live_capture.png");
    ensureDirectory(commandsDir);
    const args = [
      "--path",
      projectRoot,
      "--debug",
      "--log-file",
      path.join(artifactDir, "debug-session.log"),
    ];
    if (runHeadless) {
      args.push("--headless");
    }
    if (scene_path) {
      args.push("--scene", scene_path);
    }
    args.push("--", "--mcp-bridge-dir", bridgeDir);
    const metadata = await spawnGodot({
      runId,
      executable: runHeadless ? godotConsolePath : godotGuiPath,
      args,
      logName: "debug-session-stdio.log",
      visible: !runHeadless,
      wait: false,
    });
    const session = {
      sessionId: runId,
      runId,
      artifactDir,
      bridgeDir,
      commandsDir,
      statePath,
      capturePath,
      startedAt: metadata.startedAt,
      headless: runHeadless,
      scenePath: scene_path || null,
    };
    activeDebugSessions.set(session.sessionId, session);
    const initialState = await waitForCondition(() => readJsonIfExists(statePath), {
      timeoutMs: timeout_ms || 15000,
      description: `initial state for ${session.sessionId}`,
    });
    return jsonResult({
      ...serializeDebugSession(session),
      initialState,
    });
  }
);

server.registerTool(
  "godot_debug_session_state",
  {
    description: "Read the latest live state from a running Godot debug session.",
    inputSchema: {
      session_id: z.string(),
    },
  },
  async ({ session_id }) => {
    const session = getDebugSession(session_id);
    return jsonResult({
      ...serializeDebugSession(session),
      state: readJsonIfExists(session.statePath),
      captureExists: fs.existsSync(session.capturePath),
    });
  }
);

server.registerTool(
  "godot_debug_send_command",
  {
    description: "Send a live control/debug command into a running Godot debug session and wait for the state acknowledgement.",
    inputSchema: {
      session_id: z.string(),
      command: z.string(),
      args: z.record(z.string(), z.any()).optional(),
      timeout_ms: z.number().int().positive().optional(),
      await_state: z.boolean().optional(),
    },
  },
  async ({ session_id, command, args, timeout_ms, await_state }) => {
    const session = getDebugSession(session_id);
    const commandId = `${Date.now()}-${String(++debugCommandSerial).padStart(4, "0")}-${crypto.randomBytes(2).toString("hex")}`;
    const commandPath = path.join(session.commandsDir, `${commandId}.json`);
    writeText(
      commandPath,
      JSON.stringify(
        {
          id: commandId,
          command,
          args: args || {},
        },
        null,
        2
      )
    );
    let state = null;
    if (await_state !== false) {
      state = await waitForCondition(() => {
        const currentState = readJsonIfExists(session.statePath);
        if (currentState?.bridge?.last_command_id === commandId) {
          return currentState;
        }
        return null;
      }, {
        timeoutMs: timeout_ms || 8000,
        description: `command ${commandId}`,
      });
    }
    return jsonResult({
      ...serializeDebugSession(session),
      commandId,
      state,
    });
  }
);

server.registerTool(
  "godot_debug_capture_frame",
  {
    description: "Capture a frame from a running Godot debug session through the live command bridge.",
    inputSchema: {
      session_id: z.string(),
      timeout_ms: z.number().int().positive().optional(),
    },
  },
  async ({ session_id, timeout_ms }) => {
    const session = getDebugSession(session_id);
    const commandId = `${Date.now()}-${String(++debugCommandSerial).padStart(4, "0")}-${crypto.randomBytes(2).toString("hex")}`;
    const commandPath = path.join(session.commandsDir, `${commandId}.json`);
    writeText(
      commandPath,
      JSON.stringify(
        {
          id: commandId,
          command: "capture_frame",
          args: {
            path: session.capturePath,
          },
        },
        null,
        2
      )
    );
    const state = await waitForCondition(() => {
      const currentState = readJsonIfExists(session.statePath);
      if (currentState?.bridge?.last_command_id === commandId && fs.existsSync(session.capturePath)) {
        return currentState;
      }
      return null;
    }, {
      timeoutMs: timeout_ms || 8000,
      description: `capture ${commandId}`,
    });
    return jsonResult({
      ...serializeDebugSession(session),
      commandId,
      capturePath: session.capturePath,
      state,
    });
  }
);

server.registerTool(
  "godot_debug_session_stop",
  {
    description: "Stop a running Godot debug session by session id.",
    inputSchema: {
      session_id: z.string(),
    },
  },
  async ({ session_id }) => {
    const session = getDebugSession(session_id);
    const run = activeRuns.get(session.runId);
    if (!run) {
      throw new Error(`Unknown run id for session: ${session.runId}`);
    }
    killProcessTree(run.pid);
    return jsonResult({
      ...serializeDebugSession(session),
      stoppedPid: run.pid,
      state: readJsonIfExists(session.statePath),
    });
  }
);

server.registerTool(
  "godot_logs_tail",
  {
    description: "Read the tail of a previously recorded Godot log file.",
    inputSchema: {
      run_id: z.string(),
      lines: z.number().int().positive().optional(),
    },
  },
  async ({ run_id, lines }) => {
    const metadata = activeRuns.get(run_id);
    if (!metadata) throw new Error(`Unknown run id: ${run_id}`);
    return jsonResult({
      runId: run_id,
      logPath: metadata.logPath,
      tail: readTail(metadata.logPath, lines || 120),
    });
  }
);

server.registerTool(
  "godot_stop_run",
  {
    description: "Stop a running Godot editor or game process by run id.",
    inputSchema: {
      run_id: z.string(),
    },
  },
  async ({ run_id }) => {
    const metadata = activeRuns.get(run_id);
    if (!metadata) throw new Error(`Unknown run id: ${run_id}`);
    killProcessTree(metadata.pid);
    return jsonResult({
      runId: run_id,
      stoppedPid: metadata.pid,
      logPath: metadata.logPath,
    });
  }
);

async function main() {
  ensureDirectory(artifactRoot);
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error) => {
  console.error("[godot-mcp-server] fatal:", error);
  process.exit(1);
});
