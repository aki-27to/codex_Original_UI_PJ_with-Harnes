"use strict";

const path = require("path");

const workspaceRoot = path.resolve(__dirname, "..", "..");
const serverModulePaths = [
  path.join(workspaceRoot, "server.js"),
  path.join(workspaceRoot, "server_impl.js"),
  path.join(workspaceRoot, "server", "request_handler.js"),
  path.join(workspaceRoot, "server", "bootstrap.js"),
  path.join(workspaceRoot, "server", "routes", "runtime_routes.js"),
  path.join(workspaceRoot, "server", "routes", "batch_routes.js"),
  path.join(workspaceRoot, "server", "routes", "eval_routes.js"),
  path.join(workspaceRoot, "server", "routes", "exec_routes.js"),
];
const serverModulePath = serverModulePaths[0];

function clearHarnessRequireCache() {
  for (const modulePath of serverModulePaths) {
    try {
      delete require.cache[require.resolve(modulePath)];
    } catch {
      delete require.cache[modulePath];
    }
  }
}

function applyEnvOverrides(overrides) {
  const entries = Object.entries(overrides || {});
  const previous = new Map();
  for (const [key, value] of entries) {
    previous.set(key, Object.prototype.hasOwnProperty.call(process.env, key) ? process.env[key] : undefined);
    if (value === undefined || value === null) {
      delete process.env[key];
      continue;
    }
    process.env[key] = String(value);
  }
  return () => {
    for (const [key, value] of previous.entries()) {
      if (value === undefined) {
        delete process.env[key];
        continue;
      }
      process.env[key] = value;
    }
  };
}

async function startInProcessHarnessServer(envOverrides = {}) {
  const restoreEnv = applyEnvOverrides(envOverrides);
  clearHarnessRequireCache();
  let serverModule;
  try {
    serverModule = require(serverModulePath);
  } catch (error) {
    restoreEnv();
    throw error;
  }
  if (!serverModule || typeof serverModule.startHarnessServer !== "function" || typeof serverModule.stopHarnessServer !== "function") {
    restoreEnv();
    throw new Error("server.js does not export in-process lifecycle helpers");
  }
  try {
    const started = await serverModule.startHarnessServer();
    let stopped = false;
    return {
      port: Number(started && started.port ? started.port : 0),
      serverModule,
      async stop() {
        if (stopped) {
          return;
        }
        stopped = true;
        try {
          await serverModule.stopHarnessServer();
        } finally {
          clearHarnessRequireCache();
          restoreEnv();
        }
      },
    };
  } catch (error) {
    clearHarnessRequireCache();
    restoreEnv();
    throw error;
  }
}

module.exports = {
  startInProcessHarnessServer,
  workspaceRoot,
};
