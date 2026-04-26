#!/usr/bin/env node
"use strict";

const assert = require("assert");
const path = require("path");
const { spawnNodeScript } = require("../../../scripts/lib/process_invocation");
const { buildHarnessStatus, readArtifact, redactStringForTest, resolveAllowedArtifact } = require("../src/server");

const repoRoot = path.resolve(__dirname, "..", "..", "..");
const serverPath = path.join(repoRoot, "tools", "harness-artifact-mcp-server", "src", "server.js");

const directStatus = buildHarnessStatus();
assert.strictEqual(directStatus.accessMode, "read-only");
assert.strictEqual(directStatus.observationOnly, true);
const directWorkerDecision = readArtifact("output/governance_public/worker_decision_surface.json");
assert.strictEqual(directWorkerDecision.observationOnly, true);
assert.strictEqual(directWorkerDecision.path, "output/governance_public/worker_decision_surface.json");
assert.throws(() => resolveAllowedArtifact("package.json"), /artifact_path_not_allowlisted/);
const directRedacted = redactStringForTest('token="abc123456789" path=C:\\Users\\akima\\secret.txt');
assert(!directRedacted.includes("abc123456789"), "token-like strings must be redacted");
assert(!directRedacted.includes("C:\\Users\\akima"), "absolute paths must be redacted");

function isEnvironmentRestrictionError(error) {
  const message = String(error && error.message ? error.message : error || "").toLowerCase();
  return message.includes("spawn eperm") || message.includes("spawn eacces") || message.includes("operation not permitted");
}

let child;
try {
  child = spawnNodeScript(serverPath, {
    cwd: repoRoot,
    stdio: ["pipe", "pipe", "pipe"]
  });
} catch (error) {
  if (isEnvironmentRestrictionError(error)) {
    console.log(`harness artifact mcp smoke environment-blocked: ${error.message}`);
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
  const error = new Error(`Harness Artifact MCP server exited early: code=${code} signal=${signal}\n${stderrBuffer}`);
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

async function expectToolError(name, args) {
  let failed = false;
  try {
    await send("tools/call", { name, arguments: args });
  } catch (error) {
    failed = true;
    assert(String(error.message).includes("artifact_path_not_allowlisted"), error.message);
  }
  assert(failed, `${name} should reject invalid path`);
}

async function main() {
  const initialize = await send("initialize", {
    protocolVersion: "2024-11-05",
    clientInfo: { name: "harness-artifact-mcp-smoke-test", version: "0.1.0" },
    capabilities: {}
  });
  assert.strictEqual(initialize.result.serverInfo.name, "harness-artifact-mcp-server");
  assert(initialize.result.capabilities.tools, "server should advertise tools capability");
  assert(initialize.result.capabilities.resources, "server should advertise resources capability");
  notify("notifications/initialized");

  const toolList = await send("tools/list");
  const names = toolList.result.tools.map((tool) => tool.name);
  assert(names.includes("harness_status"));
  assert(names.includes("harness_list_artifacts"));
  assert(names.includes("harness_read_artifact"));

  const status = parseToolJson(await send("tools/call", { name: "harness_status", arguments: {} }));
  assert.strictEqual(status.ok, true);
  assert.strictEqual(status.accessMode, "read-only");
  assert.strictEqual(status.observationOnly, true);
  assert(status.prohibitedActions.includes("decision_recalculation"));

  const listed = parseToolJson(await send("tools/call", {
    name: "harness_list_artifacts",
    arguments: { root: "logs_current" }
  }));
  assert.strictEqual(listed.root, "logs_current");
  assert(listed.artifacts.every((entry) => entry.path.startsWith("logs/current/")));

  const workerDecision = parseToolJson(await send("tools/call", {
    name: "harness_read_artifact",
    arguments: { path: "output/governance_public/worker_decision_surface.json" }
  }));
  assert.strictEqual(workerDecision.path, "output/governance_public/worker_decision_surface.json");
  assert.strictEqual(workerDecision.observationOnly, true);

  const resources = await send("resources/list");
  const resourceUris = resources.result.resources.map((resource) => resource.uri);
  assert(resourceUris.includes("harness://status"));
  assert(resourceUris.includes("harness://worker-decision"));
  assert(resourceUris.includes("harness://goal-completion"));
  assert(resourceUris.includes("harness://logs-current"));

  const statusResource = await send("resources/read", { uri: "harness://status" });
  assert.strictEqual(statusResource.result.contents[0].mimeType, "application/json");
  assert.strictEqual(JSON.parse(statusResource.result.contents[0].text).observationOnly, true);

  await expectToolError("harness_read_artifact", { path: "../package.json" });
  await expectToolError("harness_read_artifact", { path: "logs/current/../current/operator_summary.json" });
  assert.throws(() => resolveAllowedArtifact("package.json"), /artifact_path_not_allowlisted/);

  const redacted = redactStringForTest('token="abc123456789" path=C:\\Users\\akima\\secret.txt');
  assert(!redacted.includes("abc123456789"), "token-like strings must be redacted");
  assert(!redacted.includes("C:\\Users\\akima"), "absolute paths must be redacted");

  console.log("harness artifact mcp smoke test passed");
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
