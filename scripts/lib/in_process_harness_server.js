"use strict";

const path = require("path");

const workspaceRoot = path.resolve(__dirname, "..", "..");
const serverModulePath = path.join(workspaceRoot, "server.js");

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
  delete require.cache[serverModulePath];
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
          delete require.cache[serverModulePath];
          restoreEnv();
        }
      },
    };
  } catch (error) {
    delete require.cache[serverModulePath];
    restoreEnv();
    throw error;
  }
}

module.exports = {
  startInProcessHarnessServer,
  workspaceRoot,
};
