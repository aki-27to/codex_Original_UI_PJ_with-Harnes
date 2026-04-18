#!/usr/bin/env node
"use strict";

const assert = require("assert");
const childProcess = require("child_process");
const path = require("path");

const serverModulePath = path.resolve(__dirname, "..", "server.js");
const serverImplementationPath = path.resolve(__dirname, "..", "server_impl.js");

function loadServerModuleWithSpawn(spawnImpl) {
  const originalSpawn = childProcess.spawn;
  childProcess.spawn = spawnImpl;
  delete require.cache[serverModulePath];
  delete require.cache[serverImplementationPath];
  try {
    return {
      serverModule: require(serverModulePath),
      restore() {
        childProcess.spawn = originalSpawn;
        delete require.cache[serverModulePath];
        delete require.cache[serverImplementationPath];
      },
    };
  } catch (error) {
    childProcess.spawn = originalSpawn;
    delete require.cache[serverModulePath];
    delete require.cache[serverImplementationPath];
    throw error;
  }
}

function createFakeAppServerChild() {
  const listeners = new Map();
  const child = {
    killed: false,
    stdout: {
      on(event, handler) {
        listeners.set(`stdout:${event}`, handler);
      },
      emit(event, payload) {
        const handler = listeners.get(`stdout:${event}`);
        if (typeof handler === "function") {
          handler(payload);
        }
      },
    },
    stderr: {
      on(event, handler) {
        listeners.set(`stderr:${event}`, handler);
      },
    },
    stdin: {
      destroyed: false,
      on(event, handler) {
        listeners.set(`stdin:${event}`, handler);
      },
      write(chunk, encoding, callback) {
        const done = typeof encoding === "function" ? encoding : callback;
        const raw = typeof chunk === "string" ? chunk : chunk.toString("utf8");
        const message = JSON.parse(raw.trim());
        if (typeof done === "function") {
          setImmediate(() => done());
        }
        if (message.method === "initialized") {
          return true;
        }
        if (message.method === "initialize") {
          setImmediate(() => {
            child.stdout.emit(
              "data",
              Buffer.from(
                `${JSON.stringify({
                  id: message.id,
                  result: {
                    protocolVersion: "2026-03-15",
                    serverInfo: { name: "fake-app-server", version: "test.v1" },
                    capabilities: {
                      memory: {
                        mode: true,
                        reset: false,
                      },
                      rawTurnItemInjection: {
                        enabled: true,
                      },
                      fs: {
                        symlinkMetadata: true,
                      },
                      mcp: {
                        supportsParallelToolCalls: true,
                      },
                    },
                  },
                })}\n`,
                "utf8"
              )
            );
          });
          return true;
        }
        if (message.method === "thread/start") {
          setImmediate(() => {
            child.stdout.emit(
              "data",
              Buffer.from(
                `${JSON.stringify({
                  id: message.id,
                  result: { thread: { id: "thread-capability-test" } },
                })}\n`,
                "utf8"
              )
            );
          });
          return true;
        }
        setImmediate(() => {
          child.stdout.emit(
            "data",
            Buffer.from(`${JSON.stringify({ id: message.id, result: {} })}\n`, "utf8")
          );
        });
        return true;
      },
    },
    on(event, handler) {
      listeners.set(`child:${event}`, handler);
    },
    emit(event, payload) {
      const handler = listeners.get(`child:${event}`);
      if (typeof handler === "function") {
        handler(payload);
      }
    },
    kill() {
      if (this.killed) {
        return;
      }
      this.killed = true;
      this.stdin.destroyed = true;
      setImmediate(() => this.emit("close", 0));
    },
  };
  return child;
}

async function run() {
  const originalTransport = process.env.CODEX_APP_SERVER_TRANSPORT;
  process.env.CODEX_APP_SERVER_TRANSPORT = "stdio";
  const { serverModule, restore } = loadServerModuleWithSpawn(() => createFakeAppServerChild());
  const client = new serverModule.__riskAudit.CodexAppServerClient(process.cwd());
  try {
    const threadStart = await client.sendRequest(
      "thread/start",
      {
        cwd: process.cwd(),
        approvalPolicy: "never",
        sandbox: "workspace-write",
        config: {},
      },
      5000
    );
    assert.strictEqual(threadStart.thread.id, "thread-capability-test", "thread/start should succeed");

    const snapshot = client.getCapabilitySnapshot();
    assert.strictEqual(snapshot.schema, "app-server-capability-snapshot.v1", "capability snapshot schema mismatch");
    assert.strictEqual(snapshot.handshakeStatus, "initialized", "initialize handshake should be marked initialized");
    assert.strictEqual(snapshot.protocolVersion, "2026-03-15", "protocol version mismatch");
    assert.strictEqual(snapshot.serverInfo.name, "fake-app-server", "serverInfo.name mismatch");
    assert.strictEqual(snapshot.serverInfo.version, "test.v1", "serverInfo.version mismatch");
    assert.strictEqual(snapshot.features.memoryMode.status, "supported", "memoryMode should be supported");
    assert.strictEqual(snapshot.features.memoryReset.status, "unsupported", "memoryReset should be unsupported");
    assert.strictEqual(snapshot.features.rawTurnItemInjection.status, "supported", "rawTurnItemInjection should be supported");
    assert.strictEqual(snapshot.features.transcriptCompletionEvents.status, "unknown", "transcriptCompletionEvents should stay unknown when absent");
    assert.strictEqual(snapshot.features.symlinkFsMetadata.status, "supported", "symlinkFsMetadata should be supported");
    assert.strictEqual(snapshot.features.parallelMcp.status, "supported", "parallelMcp should be supported");
    assert.strictEqual(
      snapshot.statusSemantics.unknown,
      "not negotiated yet or initialize payload did not provide an explicit signal",
      "status semantics for unknown mismatch"
    );
    console.log("PASS");
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

run().catch((error) => {
  console.error(error && error.stack ? error.stack : String(error));
  process.exitCode = 1;
});
