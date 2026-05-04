"use strict";

function createHarnessOverviewSnapshotService(deps = {}) {
  const {
    apiVersion,
    safeString,
    summarizePathForOperationLog,
    listBundleSummaryCandidates,
    readEvalRunHistory,
    parseOverviewTimestamp,
    harnessExecutionMemoryStore,
    normalizeExecutionMemoryRecord,
    harnessPatternMemoryStore,
    normalizeExecutionState,
    normalizeExecutionProfile,
    normalizeExecutionIntent,
    runtimeExecutionProfile,
    inferAgentRole,
    buildSkillPortfolioOverviewSurface,
    readWorkspaceJsonArtifact,
    toFiniteNumber,
    buildBrowserCapabilitySurface,
    buildContinuityOverviewSurface,
    buildRuntimeApiSnapshot,
    sanitizeRuntimeSnapshotForOverview,
    buildHarnessTraceabilitySnapshot,
    syncHarnessOverviewGovernedMemory,
    syncGovernedMemoryGraph,
    buildHarnessOverviewPayload,
    buildRuntimeProofBundleSnapshot,
    buildSignoffBundleSnapshot,
    getAgentTopographySnapshot,
    harnessMemoryLoaded,
    listReplayMemorySnapshots,
    loadHarnessExecutionMemoryStore,
    loggingSurfacePaths,
    repoRelativePath,
    runtimeProofsRoot,
    signoffBundlesRoot,
    workspaceRoot,
  } = deps;

  function buildBundleOverview(rootDir, summaryFileName, buildSnapshot) {
    const candidates = listBundleSummaryCandidates(rootDir, summaryFileName);
    return {
      storageRoot: summarizePathForOperationLog(rootDir, 220),
      bundleCount: candidates.length,
      latest: candidates.length ? buildSnapshot(candidates[0]) : null,
      recent: candidates.slice(0, 5).map((candidate) => ({
        name: safeString(candidate && candidate.name, 160) || "",
        dir: summarizePathForOperationLog(candidate && candidate.dirPath, 260),
        summaryPath: summarizePathForOperationLog(candidate && candidate.summaryPath, 260),
        generatedAt: candidate && candidate.generatedAt ? candidate.generatedAt : 0,
        updatedAt: candidate && candidate.updatedAt ? candidate.updatedAt : 0,
      })),
    };
  }

  function buildEvalHistoryOverview({ limit = 6 } = {}) {
    return readEvalRunHistory({ limit: Math.max(1, Math.min(20, Math.trunc(Number(limit) || 6))) })
      .slice()
      .reverse()
      .map((entry) => {
        const run = Array.isArray(entry && entry.runs) ? entry.runs[0] : null;
        const suite = entry && entry.suite && typeof entry.suite === "object" ? entry.suite : {};
        return {
          runId: safeString(entry && entry.runId, 160) || "",
          generatedAt: parseOverviewTimestamp(entry && entry.generatedAt),
          suiteId: safeString(suite.suiteId, 120) || "",
          caseCount: Number.isFinite(Number(suite.caseCount)) ? Math.max(0, Math.trunc(Number(suite.caseCount))) : 0,
          variantLabel: safeString(run && run.variant && run.variant.label, 80) || "",
          sampleSize: Number.isFinite(Number(run && run.sampleSize)) ? Math.max(0, Math.trunc(Number(run.sampleSize))) : 0,
          passedCases: Number.isFinite(Number(run && run.passedCases)) ? Math.max(0, Math.trunc(Number(run.passedCases))) : 0,
          failedCases: Number.isFinite(Number(run && run.failedCases)) ? Math.max(0, Math.trunc(Number(run.failedCases))) : 0,
          passRate: Number.isFinite(Number(run && run.passRate)) ? Number(Number(run.passRate).toFixed(4)) : 0,
          scoreRate: Number.isFinite(Number(run && run.scoreRate)) ? Number(Number(run.scoreRate).toFixed(4)) : 0,
          probePersistedRecords: Number.isFinite(Number(entry && entry.probePersistence && entry.probePersistence.persistedRecords))
            ? Math.max(0, Math.trunc(Number(entry.probePersistence.persistedRecords)))
            : 0,
        };
      });
  }

  function buildExecutionMemoryOverview({ limit = 10, window = 60 } = {}) {
    const normalizedWindow = Math.max(1, Math.min(200, Math.trunc(Number(window) || 60)));
    const normalizedLimit = Math.max(1, Math.min(20, Math.trunc(Number(limit) || 10)));
    const records = [...harnessExecutionMemoryStore.values()]
      .map((entry) => normalizeExecutionMemoryRecord(entry))
      .filter((entry) => entry && typeof entry === "object")
      .sort((left, right) => Math.max(Number(right.completedAt || 0), Number(right.updatedAt || 0)) - Math.max(Number(left.completedAt || 0), Number(left.updatedAt || 0)));
    const windowRecords = records.slice(0, normalizedWindow);
    const statusCounts = {};
    const taskOutcomeCounts = {};
    let guardViolations = 0;
    let implementationObserved = 0;
    for (const record of windowRecords) {
      const status = normalizeExecutionState(record.status, { terminalFallback: true });
      statusCounts[status] = (statusCounts[status] || 0) + 1;
      const taskOutcome = safeString(record && record.taskOutcomeStatus, 80).toUpperCase() || "UNSPECIFIED";
      taskOutcomeCounts[taskOutcome] = (taskOutcomeCounts[taskOutcome] || 0) + 1;
      if (record.parentDispatchGuard && record.parentDispatchGuard.violation) guardViolations += 1;
      if (
        record.observedSignals
        && (
          Number(record.observedSignals.fileChanges || 0) > 0
          || Number(record.observedSignals.commandExecutions || 0) > 0
          || Number(record.observedSignals.mcpCalls || 0) > 0
        )
      ) {
        implementationObserved += 1;
      }
    }
    const recent = records.slice(0, normalizedLimit).map((record) => ({
      turnId: record.turnId,
      threadId: record.threadId,
      agentName: record.agentName,
      status: record.status,
      taskOutcomeStatus: record.taskOutcomeStatus,
      taskOutcomeReason: record.taskOutcomeReason,
      executionProfile: record.executionProfile,
      executionIntent: record.executionIntent,
      executionSource: record.executionSource,
      completedAt: record.completedAt,
      fileChanges: Number.isFinite(Number(record.observedSignals && record.observedSignals.fileChanges))
        ? Math.max(0, Math.trunc(Number(record.observedSignals.fileChanges)))
        : 0,
      commandExecutions: Number.isFinite(Number(record.observedSignals && record.observedSignals.commandExecutions))
        ? Math.max(0, Math.trunc(Number(record.observedSignals.commandExecutions)))
        : 0,
      mcpCalls: Number.isFinite(Number(record.observedSignals && record.observedSignals.mcpCalls))
        ? Math.max(0, Math.trunc(Number(record.observedSignals.mcpCalls)))
        : 0,
      mcpWallTimeMs: Number.isFinite(Number(record.observedSignals && record.observedSignals.mcpWallTimeMs))
        ? Math.max(0, Math.trunc(Number(record.observedSignals.mcpWallTimeMs)))
        : 0,
      mcpNamespaces: Array.isArray(record.observedSignals && record.observedSignals.mcpNamespaces)
        ? record.observedSignals.mcpNamespaces.slice(0, 6)
        : [],
      collabCalls: Number.isFinite(Number(record.observedSignals && record.observedSignals.collabCalls))
        ? Math.max(0, Math.trunc(Number(record.observedSignals.collabCalls)))
        : 0,
      dispatchCount: Number.isFinite(Number(record.observedSignals && record.observedSignals.dispatchCount))
        ? Math.max(0, Math.trunc(Number(record.observedSignals.dispatchCount)))
        : 0,
      dispatchSuccessCount: Number.isFinite(Number(record.observedSignals && record.observedSignals.dispatchSuccessCount))
        ? Math.max(0, Math.trunc(Number(record.observedSignals.dispatchSuccessCount)))
        : 0,
      parentDispatchGuard: {
        mode: safeString(record.parentDispatchGuard && record.parentDispatchGuard.mode, 20) || "off",
        reason: safeString(record.parentDispatchGuard && record.parentDispatchGuard.reason, 120) || "",
        required: record.parentDispatchGuard && record.parentDispatchGuard.required ? 1 : 0,
        satisfied: record.parentDispatchGuard && record.parentDispatchGuard.satisfied ? 1 : 0,
        violation: record.parentDispatchGuard && record.parentDispatchGuard.violation ? 1 : 0,
      },
    }));
    const patterns = [...harnessPatternMemoryStore.values()]
      .filter((entry) => entry && typeof entry === "object")
      .sort((left, right) => {
        const rightCount = Number(right.count || 0);
        const leftCount = Number(left.count || 0);
        if (rightCount !== leftCount) return rightCount - leftCount;
        return Number(right.updatedAt || 0) - Number(left.updatedAt || 0);
      })
      .slice(0, 6)
      .map((entry) => ({
        signature: safeString(entry.signature, 220) || "",
        code: safeString(entry.code, 120) || "",
        severity: safeString(entry.severity, 20) || "",
        status: normalizeExecutionState(entry.status, { terminalFallback: true }),
        executionProfile: normalizeExecutionProfile(entry.executionProfile, runtimeExecutionProfile),
        executionIntent: normalizeExecutionIntent(entry.executionIntent, "interactive"),
        count: Number.isFinite(Number(entry.count)) ? Math.max(0, Math.trunc(Number(entry.count))) : 0,
        lastSeenAt: parseOverviewTimestamp(entry.lastSeenAt),
        hint: safeString(entry.hint, 220) || "",
      }));
    return {
      sampleSize: windowRecords.length,
      statusCounts,
      taskOutcomeCounts,
      guardViolations,
      implementationObserved,
      recent,
      patterns,
    };
  }

  function overviewBaseAgentName(name) {
    const normalized = safeString(name, 120).toLowerCase();
    if (!normalized) return "";
    const scopeSep = normalized.indexOf("@");
    if (scopeSep > 0) return normalized.slice(0, scopeSep);
    return normalized;
  }

  function compareOverviewAgentEntries(left, right) {
    const leftActive = left && left.active ? 1 : 0;
    const rightActive = right && right.active ? 1 : 0;
    if (rightActive !== leftActive) return rightActive - leftActive;
    const leftConfigured = left && left.source === "configured" ? 1 : 0;
    const rightConfigured = right && right.source === "configured" ? 1 : 0;
    if (rightConfigured !== leftConfigured) return rightConfigured - leftConfigured;
    return String(left && left.name || "").localeCompare(String(right && right.name || ""));
  }

  function buildTopographyOverview(topographyAgents, assignmentsByRole) {
    const rows = Array.isArray(topographyAgents) ? topographyAgents : [];
    const summary = {
      total: 0,
      configured: 0,
      runtimeOnly: 0,
      active: 0,
      parents: 0,
      specialists: 0,
      verification: 0,
      retired: 0,
      scopedRuntime: 0,
    };
    const lanes = { parents: [], specialists: [], verification: [], retired: [] };
    const entries = rows.map((row) => {
      const governance = row && row.governance && typeof row.governance === "object" ? row.governance : {};
      const baseName = overviewBaseAgentName(row && row.name);
      const role = safeString(row && row.role, 40) || inferAgentRole(baseName, "");
      let lane = "specialists";
      if (governance.legacyOnly) {
        lane = "retired";
      } else if (governance.verificationOnly || governance.readOnly) {
        lane = "verification";
      } else if (role === "parent") {
        lane = "parents";
      }
      return {
        name: safeString(row && row.name, 120) || "",
        baseName,
        role,
        lane,
        source: safeString(row && row.source, 40) || "runtime",
        status: safeString(row && row.status, 40) || "idle",
        active: row && row.isActive ? 1 : 0,
        threadId: safeString(row && row.threadId, 160) || "",
        activeTurnId: safeString(row && row.activeTurnId, 160) || "",
        sessionRef: safeString(row && row.sessionRef, 160) || "",
        description: safeString(row && row.description, 400) || "",
        configFile: safeString(row && row.configFile, 240) || "",
        skills: assignmentsByRole.get(baseName) || [],
        governance: {
          enforced: governance.enforced ? 1 : 0,
          readOnly: governance.readOnly ? 1 : 0,
          verificationOnly: governance.verificationOnly ? 1 : 0,
          legacyOnly: governance.legacyOnly ? 1 : 0,
          requiresParentOverride: governance.requiresParentOverride ? 1 : 0,
          scopePaths: Array.isArray(governance.scopePaths) ? governance.scopePaths.slice(0, 8) : [],
        },
      };
    }).sort(compareOverviewAgentEntries);
    for (const entry of entries) {
      summary.total += 1;
      if (entry.source === "configured") summary.configured += 1;
      else summary.runtimeOnly += 1;
      if (entry.active) summary.active += 1;
      if (entry.name.includes("@")) summary.scopedRuntime += 1;
      if (entry.lane === "parents") summary.parents += 1;
      else if (entry.lane === "verification") summary.verification += 1;
      else if (entry.lane === "retired") summary.retired += 1;
      else summary.specialists += 1;
      lanes[entry.lane].push(entry);
    }
    return { summary, lanes, agents: entries };
  }

  function buildSkillPortfolioOverview() {
    return buildSkillPortfolioOverviewSurface({
      summarizePathForOperationLog,
    });
  }

  function buildContinuityOverviewSnapshot() {
    return buildContinuityOverviewSurface({
      readWorkspaceJsonArtifact,
      safeString,
      toFiniteNumber,
    });
  }

  function buildBrowserCapabilityOverview() {
    return buildBrowserCapabilitySurface({
      readWorkspaceJsonArtifact,
      safeString,
      toFiniteNumber,
    });
  }

  function syncGovernedMemoryGraphFromLiveRuntime(reason = "runtime_sync") {
    return syncHarnessOverviewGovernedMemory({
      buildEvalHistoryOverview,
      buildExecutionMemoryOverview,
      buildHarnessTraceabilitySnapshot,
      buildRuntimeApiSnapshot,
      refreshTrackedLearningArtifacts: false,
      reason,
      safeString,
      syncGovernedMemoryGraph,
      workspaceRoot,
    });
  }

  function buildHarnessOverviewSnapshot() {
    return buildHarnessOverviewPayload({
      apiVersion,
      buildBrowserCapabilityOverview,
      buildBundleOverview,
      buildContinuityOverviewSnapshot,
      buildEvalHistoryOverview,
      buildExecutionMemoryOverview,
      buildHarnessTraceabilitySnapshot,
      buildRuntimeApiSnapshot,
      buildRuntimeProofBundleSnapshot,
      buildSignoffBundleSnapshot,
      buildSkillPortfolioOverview,
      buildTopographyOverview,
      getAgentTopographySnapshot,
      harnessMemoryLoaded,
      listReplayMemorySnapshots,
      loadHarnessExecutionMemoryStore,
      loggingSurfacePaths,
      repoRelativePath,
      runtimeProofsRoot,
      safeString,
      sanitizeRuntimeSnapshotForOverview,
      signoffBundlesRoot,
      syncGovernedMemoryGraph,
      workspaceRoot,
    });
  }

  return Object.freeze({
    buildBundleOverview,
    buildEvalHistoryOverview,
    buildExecutionMemoryOverview,
    buildTopographyOverview,
    buildSkillPortfolioOverview,
    buildContinuityOverviewSnapshot,
    buildBrowserCapabilityOverview,
    syncGovernedMemoryGraphFromLiveRuntime,
    buildHarnessOverviewSnapshot,
  });
}

module.exports = {
  createHarnessOverviewSnapshotService,
};
