"use strict";

const assert = require("assert");
const path = require("path");
const { spawnNodeScript } = require("../../../scripts/lib/process_invocation");

const repoRoot = path.resolve(__dirname, "..", "..", "..");
const serverPath = path.join(repoRoot, "tools", "playwright-mcp-server", "src", "server.js");
const artifactRoot = path.join(repoRoot, "output", "playwright", "mcp-smoke");

function isEnvironmentRestrictionError(error) {
  const message = String(error && error.message ? error.message : error || "").toLowerCase();
  return message.includes("spawn eperm") || message.includes("spawn eacces") || message.includes("operation not permitted");
}

let child;
try {
  child = spawnNodeScript(serverPath, {
    args: ["--artifact-root", artifactRoot],
    cwd: repoRoot,
    stdio: ["pipe", "pipe", "pipe"]
  });
} catch (error) {
  if (isEnvironmentRestrictionError(error)) {
    console.log(`playwright mcp smoke environment-blocked: ${error.message}`);
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
  const payload = { jsonrpc: "2.0", id, method, params };
  child.stdin.write(`${JSON.stringify(payload)}\n`);
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

function notify(method, params = {}) {
  child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", method, params })}\n`);
}

function parseToolJson(response) {
  assert(response.result, "tools/call response should have a result");
  assert(Array.isArray(response.result.content), "tools/call result should contain content");
  const textBlock = response.result.content.find((block) => block.type === "text");
  assert(textBlock, "tools/call result should include text content");
  return JSON.parse(textBlock.text);
}

async function main() {
  const initialize = await send("initialize", {
    protocolVersion: "2024-11-05",
    clientInfo: { name: "playwright-mcp-smoke-test", version: "0.1.0" },
    capabilities: {}
  });
  assert.strictEqual(initialize.result.serverInfo.name, "playwright-mcp-server");
  assert(initialize.result.capabilities.tools, "server should advertise tools capability");
  notify("notifications/initialized");

  const toolList = await send("tools/list");
  const names = toolList.result.tools.map((tool) => tool.name);
  assert.deepStrictEqual(
    [
      "playwright_status",
      "playwright_navigate",
      "playwright_observe",
      "playwright_click",
      "playwright_fill",
      "playwright_screenshot",
      "playwright_diagnostics",
      "playwright_viewport_matrix",
      "playwright_visual_checkpoint",
      "playwright_local_smoke",
      "playwright_close_session"
    ].filter((name) => !names.includes(name)),
    []
  );

  const statusResponse = await send("tools/call", {
    name: "playwright_status",
    arguments: {}
  });
  const status = parseToolJson(statusResponse);
  assert.strictEqual(status.ok, true);
  assert.strictEqual(status.server.name, "playwright-mcp-server");
  assert.strictEqual(typeof status.playwrightAvailable, "boolean");
  assert(status.server.artifactRoot.includes(path.join("output", "playwright")), "status should report the artifact root");

  const resources = await send("resources/list");
  const resourceUris = resources.result.resources.map((resource) => resource.uri);
  assert(resourceUris.includes("playwright://status"));
  assert(resourceUris.includes("playwright://sessions"));

  const readStatus = await send("resources/read", { uri: "playwright://status" });
  assert.strictEqual(readStatus.result.contents[0].mimeType, "application/json");
  const statusResource = JSON.parse(readStatus.result.contents[0].text);
  assert.strictEqual(statusResource.ok, true);

  console.log("playwright mcp smoke test passed");
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
