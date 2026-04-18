"use strict";

function createRequestHandlerContext(deps) {
  const {
    appRegistry,
    appPlatformReadSurface,
    buildRuntimeApiSnapshot,
    rewriteNativeAppApiPath,
    resolveProxyAppForward,
    proxyConfiguredAppRequest,
    services,
    handleLegacyRuntimeRoute,
    sendJson,
    getPocStatusSnapshot,
    readRequestBody,
    execRequestBodyLimitBytes,
    defaultRequestBodyLimitBytes,
    safeString,
    normalizePocBatchMode,
    normalizeWorkingDirectory,
    workspaceRoot,
    buildWorkspaceGuardViolation,
    logOperation,
    summarizePathForOperationLog,
    getWorkspaceGuardLockedRoot,
    executePocBatchRun,
    setPocSchedulerConfig,
    normalizeBooleanFlag,
  } = deps;

  return {
    appRegistry,
    appPlatformReadSurface,
    buildRuntimeApiSnapshot,
    rewriteNativeAppApiPath,
    resolveProxyAppForward,
    proxyConfiguredAppRequest,
    services,
    sendJson,
    handleLegacyRuntimeRoute,
    getPocStatusSnapshot,
    readRequestBody,
    execRequestBodyLimitBytes,
    defaultRequestBodyLimitBytes,
    safeString,
    normalizePocBatchMode,
    normalizeWorkingDirectory,
    workspaceRoot,
    buildWorkspaceGuardViolation,
    logOperation,
    summarizePathForOperationLog,
    get workspaceGuardLockedRoot() {
      return typeof getWorkspaceGuardLockedRoot === "function" ? getWorkspaceGuardLockedRoot() : "";
    },
    executePocBatchRun,
    setPocSchedulerConfig,
    normalizeBooleanFlag,
  };
}

module.exports = {
  createRequestHandlerContext,
};
