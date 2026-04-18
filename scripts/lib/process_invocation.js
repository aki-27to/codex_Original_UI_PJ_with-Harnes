"use strict";

const { spawn, spawnSync } = require("child_process");

function quoteForShell(value) {
  const text = String(value || "");
  return `"${text.replace(/"/g, '\\"')}"`;
}

function quoteCommandForCmd(value) {
  const text = String(value || "");
  return /\s/.test(text) ? quoteForShell(text) : text;
}

function quoteArgForCmd(value) {
  const text = String(value || "");
  return /\s/.test(text) ? quoteForShell(text) : text;
}

function buildCmdInvocation(command, args = []) {
  const commandLine = [
    quoteCommandForCmd(command),
    ...args.map((entry) => quoteArgForCmd(entry)),
  ].join(" ");
  return {
    command: "cmd.exe",
    args: ["/d", "/s", "/c", commandLine],
  };
}

function buildCmdScriptInvocation(execPath, scriptPath, args = []) {
  return buildCmdInvocation(execPath, [scriptPath, ...args]);
}

function resolvePackageManagerCommand(platform = process.platform) {
  return platform === "win32" ? "npm.cmd" : "npm";
}

function runPackageScriptSync(name, {
  cwd,
  env,
  stdio = "inherit",
} = {}) {
  const command = resolvePackageManagerCommand();
  const baseOptions = {
    cwd,
    env,
    stdio,
    windowsHide: true,
  };
  if (process.platform === "win32") {
    const invocation = buildCmdInvocation(command, ["run", String(name || "")]);
    return spawnSync(invocation.command, invocation.args, baseOptions);
  }
  return spawnSync(command, ["run", String(name || "")], baseOptions);
}

function spawnNodeScript(scriptPath, {
  args = [],
  cwd,
  env,
  stdio = ["ignore", "pipe", "pipe"],
} = {}) {
  const normalizedArgs = Array.isArray(args) ? args.map((entry) => String(entry)) : [];
  const options = {
    cwd,
    env,
    stdio,
    windowsHide: true,
  };
  try {
    return spawn(process.execPath, [scriptPath, ...normalizedArgs], options);
  } catch (error) {
    if (process.platform !== "win32" || !/EPERM/i.test(String(error && error.message ? error.message : error))) {
      throw error;
    }
  }
  const fallback = buildCmdScriptInvocation(process.execPath, scriptPath, normalizedArgs);
  return spawn(fallback.command, fallback.args, options);
}

module.exports = {
  buildCmdInvocation,
  buildCmdScriptInvocation,
  resolvePackageManagerCommand,
  runPackageScriptSync,
  spawnNodeScript,
};
