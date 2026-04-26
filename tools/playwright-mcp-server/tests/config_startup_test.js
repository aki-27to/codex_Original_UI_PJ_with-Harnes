"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { spawnNodeScript } = require("../../../scripts/lib/process_invocation");

const repoRoot = path.resolve(__dirname, "..", "..", "..");
const configPath = path.join(repoRoot, ".codex", "config.toml");
const artifactRoot = path.join(repoRoot, "output", "playwright", "mcp-config-smoke");

function parseStringValue(value) {
  const trimmed = value.trim();
  if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
    return trimmed.slice(1, -1).replace(/\\"/g, '"').replace(/\\\\/g, "\\");
  }
  if (trimmed.startsWith("'") && trimmed.endsWith("'")) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function parseStringArray(value) {
  const trimmed = value.trim();
  assert(trimmed.startsWith("[") && trimmed.endsWith("]"), `Expected array value: ${value}`);
  const body = trimmed.slice(1, -1).trim();
  if (!body) {
    return [];
  }
  return body.split(",").map((entry) => parseStringValue(entry.trim()));
}

function parsePlaywrightMcpConfig(source) {
  const lines = source.split(/\r?\n/);
  const section = [];
  let inSection = false;
  for (const line of lines) {
    const trimmed = line.trim();
    if (/^\[.+\]$/.test(trimmed)) {
      inSection = trimmed === "[mcp_servers.playwright]";
      continue;
    }
    if (inSection && trimmed && !trimmed.startsWith("#")) {
      section.push(trimmed);
    }
  }

  const parsed = {};
  for (const line of section) {
    const match = line.match(/^([A-Za-z0-9_-]+)\s*=\s*(.+)$/);
    if (!match) {
      continue;
    }
    const key = match[1];
    const value = match[2];
    parsed[key] = value.trim().startsWith("[") ? parseStringArray(value) : parseStringValue(value);
  }
  return parsed;
}

const config = parsePlaywrightMcpConfig(fs.readFileSync(configPath, "utf8"));
assert.strictEqual(config.command, "node");
assert(Array.isArray(config.args), "playwright MCP args must be a string array");
assert(config.args.includes("tools/playwright-mcp-server/src/server.js"), "playwright MCP args must point to the local server");
assert(config.cwd, "playwright MCP config must set cwd so relative args resolve during Codex startup");
assert.strictEqual(path.normalize(config.cwd), path.normalize(repoRoot));

const configuredServerPath = path.resolve(config.cwd, config.args[0]);
function isEnvironmentRestrictionError(error) {
  const message = String(error && error.message ? error.message : error || "").toLowerCase();
  return message.includes("spawn eperm") || message.includes("spawn eacces") || message.includes("operation not permitted");
}

let child;
try {
  child = spawnNodeScript(configuredServerPath, {
    args: [...config.args.slice(1), "--artifact-root", artifactRoot],
    cwd: config.cwd,
    stdio: ["pipe", "pipe", "pipe"]
  });
} catch (error) {
  if (isEnvironmentRestrictionError(error)) {
    console.log(`playwright mcp config startup environment-blocked: ${error.message}`);
    process.exit(0);
  }
  throw error;
}

let nextId = 1;
let stdoutBuffer = "";
let stderrBuffer = "";
const pending = new Map();

child.stdout.setEncoding("utf8");
child.stdout.on("data", (chunk) => {
  stdoutBuffer += chunk;
  let newlineIndex = stdoutBuffer.indexOf("\n");
  while (newlineIndex >= 0) {
    const line = stdoutBuffer.slice(0, newlineIndex).trim();
    stdoutBuffer = stdoutBuffer.slice(newlineIndex + 1);
    if (line) {
      const message = JSON.parse(line);
      const waiter = pending.get(message.id);
      if (waiter) {
        pending.delete(message.id);
        waiter.resolve(message);
      }
    }
    newlineIndex = stdoutBuffer.indexOf("\n");
  }
});

child.stderr.setEncoding("utf8");
child.stderr.on("data", (chunk) => {
  stderrBuffer += chunk;
});

child.on("exit", (code, signal) => {
  const error = new Error(`Playwright MCP server exited early: code=${code} signal=${signal}\n${stderrBuffer}`);
  for (const waiter of pending.values()) {
    waiter.reject(error);
  }
  pending.clear();
});

function send(method, params = {}) {
  const id = nextId++;
  child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id, method, params })}\n`);
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error(`Timed out waiting for ${method}\n${stderrBuffer}`));
    }, 5000);
    pending.set(id, {
      resolve: (message) => {
        clearTimeout(timer);
        if (message.error) {
          reject(new Error(`${method} failed: ${JSON.stringify(message.error)}`));
        } else {
          resolve(message);
        }
      },
      reject: (error) => {
        clearTimeout(timer);
        reject(error);
      }
    });
  });
}

async function main() {
  const initialize = await send("initialize", {
    protocolVersion: "2024-11-05",
    clientInfo: { name: "playwright-mcp-config-startup-test", version: "0.1.0" },
    capabilities: {}
  });
  assert.strictEqual(initialize.result.serverInfo.name, "playwright-mcp-server");

  const statusResponse = await send("tools/call", {
    name: "playwright_status",
    arguments: {}
  });
  const textBlock = statusResponse.result.content.find((block) => block.type === "text");
  assert(textBlock, "status response should include text content");
  const status = JSON.parse(textBlock.text);
  assert.strictEqual(status.ok, true);
  assert.strictEqual(path.normalize(status.server.rootDir), path.normalize(repoRoot));

  console.log("playwright mcp config startup test passed");
}

main()
  .catch((error) => {
    console.error(error.stack || error.message || error);
    process.exitCode = 1;
  })
  .finally(() => {
    child.stdin.end();
    child.kill();
  });
