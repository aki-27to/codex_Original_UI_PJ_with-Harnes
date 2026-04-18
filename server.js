"use strict";

const implementation = require("./server_impl");

const {
  __implementationPath,
  __riskAudit,
  __staticMount,
  __codexModes,
  __runtimeVisibility,
  __topography,
  refreshCurrentLogSurface: refreshCurrentLogSurfaceImpl,
  getHarnessServerState: getHarnessServerStateImpl,
  startHarnessServer: startHarnessServerImpl,
  stopHarnessServer: stopHarnessServerImpl,
  runHarnessServerCli: runHarnessServerCliImpl,
} = implementation;

function startHarnessServer(...args) {
  return startHarnessServerImpl(...args);
}

function stopHarnessServer(...args) {
  return stopHarnessServerImpl(...args);
}

function runHarnessServerCli(...args) {
  return runHarnessServerCliImpl(...args);
}

function refreshCurrentLogSurface(...args) {
  return refreshCurrentLogSurfaceImpl(...args);
}

function getHarnessServerState(...args) {
  return getHarnessServerStateImpl(...args);
}

const publicEntrySurface = Object.freeze({
  __implementationPath,
  startHarnessServer,
  stopHarnessServer,
  runHarnessServerCli,
  refreshCurrentLogSurface,
  getHarnessServerState,
  __riskAudit,
  __staticMount,
  __codexModes,
  __runtimeVisibility,
  __topography,
});

module.exports = publicEntrySurface;

if (require.main === module) {
  runHarnessServerCli();
}
