#!/usr/bin/env node
"use strict";

const assert = require("assert");
const childProcess = require("child_process");
const { EventEmitter } = require("events");
const path = require("path");

const serverModulePath = path.resolve(__dirname, "..", "server.js");

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function loadServerModuleWithSpawn(spawnImpl) {
  const originalSpawn = childProcess.spawn;
  childProcess.spawn = spawnImpl;
  delete require.cache[serverModulePath];
  try {
    return {
      serverModule: require(serverModulePath),
      restore() {
        childProcess.spawn = originalSpawn;
        delete require.cache[serverModulePath];
      },
    };
  } catch (error) {
    childProcess.spawn = originalSpawn;
    delete require.cache[serverModulePath];
    throw error;
  }
}

function createFakeAppServerChild({
  failThreadStartWrite = false,
  delayedCloseMs = 0,
  threadId = "thread-recovered",
} = {}) {
  const child = new EventEmitter();
  child.killed = false;
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  child.stdin = new EventEmitter();
  child.stdin.destroyed = false;
  child.threadStartRequests = [];
  child.kill = () => {
    if (child.killed) {
      return;
    }
    child.killed = true;
    child.stdin.destroyed = true;
    setImmediate(() => child.emit("close", 0));
  };
  child.stdin.write = (chunk, encoding, callback) => {
    const done = typeof encoding === "function" ? encoding : callback;
    const raw = typeof chunk === "string" ? chunk : chunk.toString("utf8");
    const message = JSON.parse(raw.trim());
    if (message.method === "initialized") {
      if (typeof done === "function") {
        setImmediate(() => done());
      }
      return true;
    }
    if (message.method === "initialize") {
      if (typeof done === "function") {
        setImmediate(() => done());
      }
      setImmediate(() => {
        child.stdout.emit(
          "data",
          Buffer.from(`${JSON.stringify({ id: message.id, result: { protocolVersion: "2026-03-15" } })}\n`, "utf8")
        );
      });
      return true;
    }
    if (message.method === "thread/start") {
      child.threadStartRequests.push(message);
    }
    if (message.method === "thread/start" && failThreadStartWrite) {
      const error = Object.assign(new Error("broken pipe"), {
        code: "EPIPE",
        errno: -4047,
        syscall: "write",
      });
      child.stdin.destroyed = true;
      setImmediate(() => {
        if (typeof done === "function") {
          done(error);
        }
        child.stdin.emit("error", error);
        setTimeout(() => child.emit("close", 1), delayedCloseMs);
      });
      return false;
    }
    if (message.method === "thread/start") {
      if (typeof done === "function") {
        setImmediate(() => done());
      }
      setImmediate(() => {
        child.stdout.emit(
          "data",
          Buffer.from(`${JSON.stringify({ id: message.id, result: { thread: { id: threadId } } })}\n`, "utf8")
        );
      });
      return true;
    }
    if (typeof done === "function") {
      setImmediate(() => done());
    }
    setImmediate(() => {
      child.stdout.emit("data", Buffer.from(`${JSON.stringify({ id: message.id, result: {} })}\n`, "utf8"));
    });
    return true;
  };
  return child;
}

async function expectRejects(promise, pattern, message) {
  let failed = false;
  try {
    await promise;
  } catch (error) {
    failed = true;
    const text = error instanceof Error ? error.message : String(error);
    assert(pattern.test(text), `${message}: ${text}`);
  }
  assert(failed, message);
}

async function testWriteFailureAllowsRestartWithoutStaleCloseRegression() {
  const firstChild = createFakeAppServerChild({
    failThreadStartWrite: true,
    delayedCloseMs: 80,
    threadId: "thread-failed",
  });
  const secondChild = createFakeAppServerChild({
    failThreadStartWrite: false,
    threadId: "thread-recovered",
  });
  const spawnedChildren = [firstChild, secondChild];
  const originalTransport = process.env.CODEX_APP_SERVER_TRANSPORT;
  process.env.CODEX_APP_SERVER_TRANSPORT = "stdio";
  const { serverModule, restore } = loadServerModuleWithSpawn(() => {
    const next = spawnedChildren.shift();
    if (!next) {
      throw new Error("unexpected extra spawn");
    }
    return next;
  });
  const client = new serverModule.__riskAudit.CodexAppServerClient(process.cwd());
  const agentState = serverModule.__codexModes.createBaseAgentState();
  agentState.fastModeEnabled = true;
  agentState.lastFastModeEnabled = true;
  const threadStartConfig = serverModule.__codexModes.buildThreadStartConfig(
    agentState,
    false,
    "blocked",
    "gpt-5",
    "medium",
    true,
    agentState.automaticApprovalReviewEnabled
  );
  try {
    await expectRejects(
      client.sendRequest(
        "thread/start",
        {
          cwd: process.cwd(),
          approvalPolicy: "never",
          sandbox: "workspace-write",
          config: threadStartConfig,
        },
        5000
      ),
      /(broken pipe|write failed|stdin error)/i,
      "thread/start should reject with a contained transport error"
    );
    assert.strictEqual(client.pending.size, 0, "failed write should clear pending request state");
    assert.strictEqual(firstChild.threadStartRequests.length, 1, "failed child should still record the first thread/start request");
    assert.strictEqual(firstChild.threadStartRequests[0].params.config["features.fast_mode"], true, "thread/start should preserve explicit fast_mode enablement");
    assert.strictEqual(firstChild.threadStartRequests[0].params.config["features.guardian_approval"], true, "thread/start should keep guardian_approval enabled");
    assert.strictEqual(firstChild.threadStartRequests[0].params.config.service_tier, "fast", "thread/start should request fast service tier when fast_mode is enabled");
    const recovered = await client.sendRequest(
      "thread/start",
      {
        cwd: process.cwd(),
        approvalPolicy: "never",
        sandbox: "workspace-write",
        config: threadStartConfig,
      },
      5000
    );
    assert.strictEqual(recovered.thread.id, "thread-recovered", "next request should respawn a fresh child and recover");
    assert.strictEqual(secondChild.threadStartRequests.length, 1, "replacement child should receive the recovery thread/start request");
    assert.strictEqual(secondChild.threadStartRequests[0].params.config["features.fast_mode"], true, "recovery thread/start should preserve explicit fast_mode enablement");
    assert.strictEqual(secondChild.threadStartRequests[0].params.config["features.guardian_approval"], true, "recovery thread/start should preserve guardian_approval");
    assert.strictEqual(secondChild.threadStartRequests[0].params.config.service_tier, "fast", "recovery thread/start should preserve fast service tier");
    assert.strictEqual(client.child, secondChild, "replacement child should become current after recovery");
    await sleep(140);
    assert.strictEqual(client.child, secondChild, "late close from the dead child must not clobber the replacement child");
    const repeated = await client.sendRequest(
      "thread/start",
      {
        cwd: process.cwd(),
        approvalPolicy: "never",
        sandbox: "workspace-write",
        config: threadStartConfig,
      },
      5000
    );
    assert.strictEqual(repeated.thread.id, "thread-recovered", "replacement child should stay usable after stale close");
    assert.strictEqual(client.pending.size, 0, "recovery path should leave no pending requests behind");
  } finally {
    client.stop();
    restore();
    if (originalTransport === undefined) {
      delete process.env.CODEX_APP_SERVER_TRANSPORT;
    } else {
      process.env.CODEX_APP_SERVER_TRANSPORT = originalTransport;
    }
  }
}

async function testDestroyedStdinBeforeRequestRespawnsChild() {
  const firstChild = createFakeAppServerChild({
    failThreadStartWrite: false,
    threadId: "thread-initial",
  });
  const secondChild = createFakeAppServerChild({
    failThreadStartWrite: false,
    threadId: "thread-restarted",
  });
  const spawnedChildren = [firstChild, secondChild];
  const originalTransport = process.env.CODEX_APP_SERVER_TRANSPORT;
  process.env.CODEX_APP_SERVER_TRANSPORT = "stdio";
  const { serverModule, restore } = loadServerModuleWithSpawn(() => {
    const next = spawnedChildren.shift();
    if (!next) {
      throw new Error("unexpected extra spawn");
    }
    return next;
  });
  const client = new serverModule.__riskAudit.CodexAppServerClient(process.cwd());
  const agentState = serverModule.__codexModes.createBaseAgentState();
  agentState.fastModeEnabled = true;
  agentState.lastFastModeEnabled = true;
  const threadStartConfig = serverModule.__codexModes.buildThreadStartConfig(
    agentState,
    false,
    "blocked",
    "gpt-5",
    "medium",
    true,
    agentState.automaticApprovalReviewEnabled
  );
  try {
    await client.ensureStarted();
    assert.strictEqual(client.child, firstChild, "initial child should be active after ensureStarted");
    firstChild.stdin.destroyed = true;
    setTimeout(() => firstChild.emit("close", 1), 80);
    const recovered = await client.sendRequest(
      "thread/start",
      {
        cwd: process.cwd(),
        approvalPolicy: "never",
        sandbox: "workspace-write",
        config: threadStartConfig,
      },
      5000
    );
    assert.strictEqual(recovered.thread.id, "thread-restarted", "destroyed stdin should trigger a child respawn before thread/start");
    assert.strictEqual(firstChild.threadStartRequests.length, 0, "stale child should not receive the recovery thread/start request");
    assert.strictEqual(secondChild.threadStartRequests.length, 1, "replacement child should receive the first live thread/start request");
    assert.strictEqual(client.child, secondChild, "replacement child should become current after stale-stdin recovery");
    await sleep(140);
    assert.strictEqual(client.child, secondChild, "late close from stale destroyed child must not clobber the replacement child");
  } finally {
    client.stop();
    restore();
    if (originalTransport === undefined) {
      delete process.env.CODEX_APP_SERVER_TRANSPORT;
    } else {
      process.env.CODEX_APP_SERVER_TRANSPORT = originalTransport;
    }
  }
}

async function run() {
  const tests = [
    ["write failure is contained and restart survives stale close", testWriteFailureAllowsRestartWithoutStaleCloseRegression],
    ["destroyed stdin before request forces a clean respawn", testDestroyedStdinBeforeRequestRespawnsChild],
  ];
  let passed = 0;
  for (const [name, fn] of tests) {
    await fn();
    passed += 1;
    console.log(`[app-server-transport-resilience-test] PASS ${name}`);
  }
  console.log(`[app-server-transport-resilience-test] total=${tests.length} pass=${passed} fail=0`);
  console.log("PASS");
}

run().catch((error) => {
  console.log(`[app-server-transport-resilience-test] FAIL ${error instanceof Error ? error.message : String(error)}`);
  console.log("FAIL");
  process.exitCode = 1;
});
