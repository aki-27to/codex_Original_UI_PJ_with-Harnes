#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");

const workspaceRoot = path.resolve(__dirname, "..");
const defaultWindowsCodexCmd = process.env.APPDATA
  ? path.join(process.env.APPDATA, "npm", "codex.cmd")
  : "codex.cmd";

function resolveSpawnTarget(cwd) {
  if (process.platform === "win32") {
    const cmdPath = fs.existsSync(defaultWindowsCodexCmd) ? defaultWindowsCodexCmd : "codex.cmd";
    return {
      command: `"${cmdPath}" app-server`,
      args: [],
      options: { cwd, windowsHide: true, stdio: ["pipe", "pipe", "pipe"], shell: true },
    };
  }
  return {
    command: "codex",
    args: ["app-server"],
    options: { cwd, windowsHide: true, stdio: ["pipe", "pipe", "pipe"] },
  };
}

async function run() {
  const target = resolveSpawnTarget(workspaceRoot);
  const child = spawn(target.command, target.args, target.options);
  let settled = false;
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      resolve();
    }, 3000);
    child.on("error", (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(error);
    });
    child.on("close", () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve();
    });
  });
  try {
    child.kill();
  } catch {}
  console.log("PASS rbj_spawn_smoke_test");
}

run().catch((error) => {
  console.error(`FAIL rbj_spawn_smoke_test: ${error && error.message ? error.message : String(error)}`);
  process.exit(1);
});

