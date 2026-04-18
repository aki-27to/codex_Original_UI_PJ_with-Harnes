"use strict";

const { createCurrentSurfaceSupport } = require("./current_surface_support");

function createCurrentSurfaceService(deps = {}) {
  const {
    path: pathModule,
    safeString,
    toIsoTimestamp,
    sanitizeRuntimeSnapshotForOverview,
    buildRuntimeApiSnapshot,
    listBundleSummaryCandidates,
    buildSignoffBundleSnapshot,
    buildRuntimeProofBundleSnapshot,
    signoffBundlesRoot,
    runtimeProofsRoot,
    readWorkspaceJsonArtifact,
    resolveWorkspaceRuntimePath,
    repoRelativePath,
    workspaceRoot,
    uniquePathList,
    nonInteractiveRequestUserInputPolicy,
    defaultExecAgentName,
    getLatestOperatorTurnSnapshot,
    normalizeExecutionProfile,
    runtimeExecutionProfile,
    normalizeExecutionState,
    isTerminalExecutionState,
    isCompletedOperatorOutcome,
    normalizeFamilyCompletionGateSnapshot,
    loggingMode,
    loggingModeEnvKey,
    loggingSurfacePaths,
    buildOperatorDecisionSummary,
    getWorkflowCaseById,
  } = deps;
  const currentSurfaceSupport = createCurrentSurfaceSupport({
    safeString,
    listBundleSummaryCandidates,
    repoRelativePath,
    workspaceRoot,
    isCompletedOperatorOutcome,
  });
  const {
    buildLatestBundleReference,
    canonicalizeOperatorFacingValue,
    normalizeOperatorResidualSemantics,
    isLikelyChangedPath,
    collectChangedPathsFromArtifacts,
  } = currentSurfaceSupport;

  function isSignoffSummaryAllPassed(signoffSummary) {
    if (!signoffSummary || typeof signoffSummary !== "object") return false;
    if (typeof signoffSummary.allPassed !== "undefined") {
      return signoffSummary.allPassed === true || Number(signoffSummary.allPassed || 0) === 1;
    }
    return Boolean(signoffSummary.assertions && signoffSummary.assertions.allPassed);
  }

  function normalizeSignoffTransportMode(signoffSummary) {
    const raw = safeString(
      signoffSummary && (
        signoffSummary.transportMode
        || (signoffSummary.runtime && signoffSummary.runtime.transportMode)
      ),
      80
    ).toLowerCase();
    if (!raw) return "";
    if (raw === "live" || raw === "stdio") return "stdio";
    if (raw === "mock" || raw === "fixture" || raw === "mock-fixture") return "mock-fixture";
    return raw;
  }

  function selectPreferredSignoffCandidate(candidates) {
    const entries = Array.isArray(candidates) ? candidates.filter(Boolean) : [];
    if (!entries.length) return null;
    const latestPassing = entries.find((entry) => isSignoffSummaryAllPassed(entry.summary));
    if (latestPassing) return latestPassing;
    const latestLive = entries.find((entry) => normalizeSignoffTransportMode(entry.summary) === "stdio");
    if (latestLive) return latestLive;
    return entries[0] || null;
  }

  function hasResolvedOperatorOutcome(finalOutcome) {
    const taskOutcomeStatus = safeString(finalOutcome && finalOutcome.taskOutcomeStatus, 80).toUpperCase();
    if (taskOutcomeStatus) return true;
    const terminalStatus = normalizeExecutionState(finalOutcome && finalOutcome.terminalStatus, { terminalFallback: false });
    return Boolean(terminalStatus && isTerminalExecutionState(terminalStatus));
  }

  function buildRelatedSignoffSummaryRef(signoffSummary, relatedToRun) {
    if (!signoffSummary || !relatedToRun) return null;
    const bundlePath = safeString(signoffSummary.bundlePath, 260)
      || safeString(signoffSummary.bundleRef && signoffSummary.bundleRef.bundlePath, 260)
      || "";
    const summaryPath = safeString(signoffSummary.summaryPath, 260)
      || safeString(signoffSummary.bundleRef && signoffSummary.bundleRef.summaryPath, 260)
      || "";
    const allPassed = isSignoffSummaryAllPassed(signoffSummary);
    return {
      bundlePath,
      summaryPath,
      allPassed,
      relatedToRun: 1,
    };
  }

  function isAuxiliaryOperatorRunContext(latestTurn) {
    const source = safeString(latestTurn && latestTurn.source, 120).toLowerCase();
    const intent = safeString(latestTurn && latestTurn.execution_intent, 120).toLowerCase();
    const profile = normalizeExecutionProfile(latestTurn && latestTurn.execution_profile, runtimeExecutionProfile);
    return Boolean(
      profile.startsWith("eval")
      || profile === "proof-runtime"
      || profile === "smoke-test"
      || intent === "eval"
      || intent.includes("probe")
      || intent.includes("replay")
      || source === "eval_harness"
      || source.startsWith("replay:")
    );
  }

  function isSignoffBundleRunContext(latestTurn, signoffSummary) {
    const artifactPath = safeString(latestTurn && latestTurn.artifact_manifest_path, 260);
    const bundlePath = safeString(
      signoffSummary && (
        signoffSummary.bundlePath
        || (signoffSummary.bundleRef && signoffSummary.bundleRef.bundlePath)
      ),
      260
    );
    const latestTurnId = safeString(latestTurn && latestTurn.turn_id, 160);
    const naturalTaskTurnId = safeString(signoffSummary && signoffSummary.naturalTask && signoffSummary.naturalTask.turnId, 160);
    if (bundlePath && artifactPath && artifactPath.replace(/\\/g, "/").startsWith(bundlePath.replace(/\\/g, "/"))) return true;
    if (latestTurnId && naturalTaskTurnId && latestTurnId === naturalTaskTurnId) return true;
    return false;
  }

  function shouldPreferLatestCompletedSignoffRun({ latestTurn, signoffSummary } = {}) {
    const bundlePath = safeString(
      signoffSummary && (
        signoffSummary.bundlePath
        || (signoffSummary.bundleRef && signoffSummary.bundleRef.bundlePath)
      ),
      260
    );
    if (!bundlePath) return false;
    if (!latestTurn) return true;
    const latestStatus = safeString(latestTurn.status, 40).toLowerCase();
    const latestTaskOutcomeStatus = safeString(latestTurn.task_outcome_status, 80).toUpperCase();
    const latestIntent = safeString(latestTurn.execution_intent, 120).toLowerCase();
    const completed = latestStatus === "completed" && latestTaskOutcomeStatus === "COMPLETED";
    if (latestStatus === "in_progress") return true;
    if (isAuxiliaryOperatorRunContext(latestTurn)) return true;
    if (isSignoffBundleRunContext(latestTurn, signoffSummary)) return false;
    if (!completed) return true;
    return !latestIntent.includes("signoff");
  }

  function buildLatestSignoffSummaryFile() {
    const candidates = listBundleSummaryCandidates(signoffBundlesRoot, "signoff_summary.json");
    const preferredCandidate = selectPreferredSignoffCandidate(candidates);
    const latest = preferredCandidate
      ? buildSignoffBundleSnapshot(preferredCandidate)
      : buildLatestBundleReference(signoffBundlesRoot, "signoff_summary.json", buildSignoffBundleSnapshot);
    if (!latest) return null;
    const allPassed = isSignoffSummaryAllPassed(latest);
    return {
      schema: "latest-signoff-summary.v2",
      generatedAt: toIsoTimestamp(Date.now()),
      allPassed: allPassed ? 1 : 0,
      runtimePostureSafe: latest && latest.assertions && latest.assertions.runtimePostureSafe ? 1 : 0,
      coreHarnessWorkflowPassed: latest && latest.assertions && latest.assertions.coreHarnessWorkflowPassed ? 1 : 0,
      naturalTaskTracePassed: latest && latest.assertions && latest.assertions.naturalTaskTracePassed ? 1 : 0,
      signoffReady: allPassed ? 1 : 0,
      bundleRef: {
        bundleName: latest.name,
        bundlePath: latest.bundlePath,
        summaryPath: latest.summaryPath,
      },
      finalDecision: allPassed ? "RELEASE_APPROVED" : "RELEASE_BLOCKED",
    };
  }

  function buildLatestRunSummaryFromSignoffBundle(signoffSummary) {
    const bundlePath = safeString(
      signoffSummary && (
        signoffSummary.bundlePath
        || (signoffSummary.bundleRef && signoffSummary.bundleRef.bundlePath)
      ),
      260
    );
    const signoffSummaryPath = safeString(
      signoffSummary && (
        signoffSummary.summaryPath
        || (signoffSummary.bundleRef && signoffSummary.bundleRef.summaryPath)
      ),
      260
    );
    const signoffBundleSummary = readWorkspaceJsonArtifact(signoffSummaryPath);
    if (!signoffBundleSummary || typeof signoffBundleSummary !== "object") return null;
    const bundleLatestRun = readWorkspaceJsonArtifact(signoffBundleSummary.paths && signoffBundleSummary.paths.latestRunSummary) || {};
    const signoffTracePath = safeString(
      signoffBundleSummary.paths && (
        signoffBundleSummary.paths.signoffTaskTraceSummary
        || signoffBundleSummary.paths.naturalTaskTraceSummary
      ),
      260
    );
    const traceSummary = readWorkspaceJsonArtifact(signoffTracePath) || {};
    const flowTraceSummary = traceSummary.flowTraceSummary && typeof traceSummary.flowTraceSummary === "object"
      ? traceSummary.flowTraceSummary
      : {};
    const artifactManifestPath = safeString(traceSummary.artifactManifestPath, 260) || "";
    const artifactManifest = readWorkspaceJsonArtifact(artifactManifestPath) || {};
    const artifactDir = artifactManifestPath ? pathModule.dirname(resolveWorkspaceRuntimePath(artifactManifestPath)) : "";
    const evidenceManifestPath = artifactDir ? repoRelativePath(workspaceRoot, pathModule.join(artifactDir, "evidence_manifest.json")) : "";
    const evidenceManifest = readWorkspaceJsonArtifact(evidenceManifestPath) || {};
    const reviewLoadBreakdown = readWorkspaceJsonArtifact(signoffBundleSummary.paths && signoffBundleSummary.paths.reviewLoadBreakdown) || {};
    const finalOutcome = bundleLatestRun.finalOutcome && typeof bundleLatestRun.finalOutcome === "object"
      ? bundleLatestRun.finalOutcome
      : (traceSummary.turn && typeof traceSummary.turn === "object" ? traceSummary.turn : {});
    const normalizedResiduals = normalizeOperatorResidualSemantics({
      finalOutcome,
      residualRisks: Array.isArray(bundleLatestRun.residualRisks)
        ? bundleLatestRun.residualRisks
        : Array.isArray(flowTraceSummary.residualRiskSummary)
          ? flowTraceSummary.residualRiskSummary
          : [],
    });
    const changedPaths = uniquePathList([
      ...(Array.isArray(traceSummary.observedSignals && traceSummary.observedSignals.sampleChangedPaths) ? traceSummary.observedSignals.sampleChangedPaths : []),
      ...(Array.isArray(flowTraceSummary.childEvidenceLedger)
        ? flowTraceSummary.childEvidenceLedger.flatMap((entry) => Array.isArray(entry && entry.ownedPaths) ? entry.ownedPaths : [])
        : []),
    ].filter(isLikelyChangedPath), 24);
    return {
      schema: "latest-run-summary.v2",
      generatedAt: toIsoTimestamp(Date.now()),
      available: true,
      currentPhase: "Release / Close",
      taskId: safeString(bundleLatestRun.turnId || traceSummary.turnId || artifactManifest.turn && artifactManifest.turn.turnId, 160) || "",
      turnId: safeString(bundleLatestRun.turnId || traceSummary.turnId || artifactManifest.turn && artifactManifest.turn.turnId, 160) || "",
      threadId: safeString(traceSummary.threadId || artifactManifest.turn && artifactManifest.turn.threadId, 160) || "",
      agentName: safeString(artifactManifest.turn && artifactManifest.turn.agentName, 160) || defaultExecAgentName,
      executionProfile: safeString(bundleLatestRun.executionProfile, 80) || "full-runtime",
      executionIntent: "signoff_sample",
      selectedPlanningDepth: safeString(bundleLatestRun.selectedPlanningDepth || flowTraceSummary.selectedPlanningDepth, 80) || "",
      selectedAssuranceDepth: safeString(bundleLatestRun.selectedAssuranceDepth || flowTraceSummary.selectedAssuranceDepth, 80) || "",
      planningMode: safeString(flowTraceSummary.selectedPlanningMode, 40) || "",
      flowPath: safeString(flowTraceSummary.flowPath, 80) || "",
      finalOutcome: {
        status: safeString(finalOutcome.status, 40) || "",
        terminalStatus: safeString(finalOutcome.terminalStatus || finalOutcome.status, 40) || "",
        taskOutcomeStatus: safeString(finalOutcome.taskOutcomeStatus, 80) || "",
        taskOutcomeReason: safeString(finalOutcome.taskOutcomeReason, 120) || "",
      },
      dispatchCount: Number(bundleLatestRun.dispatchCount || traceSummary.observedSignals && traceSummary.observedSignals.dispatchCount || 0),
      dispatchSuccessCount: Number(bundleLatestRun.dispatchSuccessCount || traceSummary.observedSignals && traceSummary.observedSignals.dispatchSuccessCount || 0),
      implementationObserved: Boolean(
        Number(traceSummary.observedSignals && traceSummary.observedSignals.fileChanges || 0) > 0
        || Number(traceSummary.observedSignals && traceSummary.observedSignals.commandExecutions || 0) > 0
        || Number(traceSummary.observedSignals && traceSummary.observedSignals.mcpCalls || 0) > 0
      ),
      reviewerObserved: Boolean(bundleLatestRun.reviewerObserved || flowTraceSummary.reviewerExecuted),
      testerObserved: Boolean(bundleLatestRun.testerObserved || flowTraceSummary.testerExecuted),
      usedAgents: Array.isArray(bundleLatestRun.usedAgents) && bundleLatestRun.usedAgents.length
        ? bundleLatestRun.usedAgents
        : Array.isArray(flowTraceSummary.usedAgents) ? flowTraceSummary.usedAgents : [],
      usedPolicies: Array.isArray(flowTraceSummary.usedPolicies) ? flowTraceSummary.usedPolicies : [],
      usedContracts: Array.isArray(flowTraceSummary.usedContracts) ? flowTraceSummary.usedContracts : [],
      usedSkills: Array.isArray(flowTraceSummary.usedSkills) ? flowTraceSummary.usedSkills : [],
      changedPaths,
      evidenceClassesCollected: [
        "runtime",
        (flowTraceSummary.reviewerExecuted || flowTraceSummary.testerExecuted) ? "verification" : "",
        bundleLatestRun.docSyncSummary && bundleLatestRun.docSyncSummary.status === "PASS" ? "documentation" : "",
        normalizedResiduals.residualRisks.length ? "risk" : "",
      ].filter(Boolean),
      residualRisks: normalizedResiduals.residualRisks,
      informationalNotes: normalizedResiduals.informationalNotes,
      assumptions: Array.isArray(evidenceManifest.requirementContract && evidenceManifest.requirementContract.assumptions)
        ? evidenceManifest.requirementContract.assumptions.map((entry) => safeString(entry, 240)).filter(Boolean).slice(0, 8)
        : [],
      operatorCaveats: normalizedResiduals.operatorCaveats,
      parentDispatchGuardSummary: traceSummary.parentDispatchGuard && typeof traceSummary.parentDispatchGuard === "object" ? traceSummary.parentDispatchGuard : {},
      requestUserInputSummary: {
        policy: nonInteractiveRequestUserInputPolicy,
        blockedByDefault: nonInteractiveRequestUserInputPolicy === "blocked" ? 1 : 0,
      },
      docSyncSummary: bundleLatestRun.docSyncSummary && typeof bundleLatestRun.docSyncSummary === "object"
        ? bundleLatestRun.docSyncSummary
        : (flowTraceSummary.docSyncEvidence && typeof flowTraceSummary.docSyncEvidence === "object" ? flowTraceSummary.docSyncEvidence : null),
      releaseState: isSignoffSummaryAllPassed(signoffSummary) ? "RELEASE_APPROVED" : "RELEASE_BLOCKED",
      parentMaterialImplementationObserved: 0,
      signoffSummaryRef: buildRelatedSignoffSummaryRef(signoffSummary, true),
      evidenceRefs: {
        bundlePath: bundlePath || "",
        signoffSummaryPath: signoffSummaryPath || "",
        naturalTaskTraceSummaryPath: safeString(signoffBundleSummary.paths && signoffBundleSummary.paths.naturalTaskTraceSummary, 260) || "",
        coreHarnessWorkflowRunPath: safeString(signoffBundleSummary.paths && signoffBundleSummary.paths.coreHarnessWorkflowRun, 260) || "",
      },
      childEvidenceLedger: Array.isArray(flowTraceSummary.childEvidenceLedger) ? flowTraceSummary.childEvidenceLedger : [],
      reviewLoadBreakdown,
    };
  }

  function buildLatestRunSummaryFile() {
    const signoffSummary = buildLatestSignoffSummaryFile();
    const signoffBundleRunSummary = buildLatestRunSummaryFromSignoffBundle(signoffSummary);
    if (signoffBundleRunSummary && isSignoffSummaryAllPassed(signoffSummary)) return signoffBundleRunSummary;
    const latestTurn = getLatestOperatorTurnSnapshot();
    const latestTurnArtifactPath = safeString(latestTurn && latestTurn.artifact_manifest_path, 260);
    const latestTurnIntent = safeString(latestTurn && latestTurn.execution_intent, 120).toLowerCase();
    const latestTurnProfile = normalizeExecutionProfile(latestTurn && latestTurn.execution_profile, runtimeExecutionProfile);
    const signoffBundlePath = safeString(
      signoffSummary && (
        signoffSummary.bundlePath
        || (signoffSummary.bundleRef && signoffSummary.bundleRef.bundlePath)
      ),
      260
    );
    const preferLatestSignoffFallback = Boolean(
      shouldPreferLatestCompletedSignoffRun({ latestTurn, signoffSummary })
      || (
        signoffSummary
        && signoffBundlePath
        && latestTurn
        && latestTurnArtifactPath
        && !String(latestTurnArtifactPath).replace(/\\/g, "/").startsWith(String(signoffBundlePath).replace(/\\/g, "/"))
        && (latestTurnProfile === "proof-runtime" || latestTurnIntent.includes("probe"))
      )
    );
    if (!latestTurn || preferLatestSignoffFallback) {
      const latestSignoffCandidates = listBundleSummaryCandidates(signoffBundlesRoot, "signoff_summary.json");
      const latestSignoffCandidate = selectPreferredSignoffCandidate(latestSignoffCandidates);
      const signoffBundleSummary = latestSignoffCandidate && latestSignoffCandidate.summary && typeof latestSignoffCandidate.summary === "object"
        ? latestSignoffCandidate.summary
        : {};
      const signoffTracePath = signoffBundleSummary.paths && (
        signoffBundleSummary.paths.naturalTaskTraceSummary
        || signoffBundleSummary.paths.signoffTaskTraceSummary
      );
      const traceSummary = readWorkspaceJsonArtifact(signoffTracePath);
      if (traceSummary && typeof traceSummary === "object") {
        const flowTraceSummary = traceSummary.flowTraceSummary && typeof traceSummary.flowTraceSummary === "object"
          ? traceSummary.flowTraceSummary
          : {};
        const signoffNaturalTask = signoffBundleSummary.naturalTask && typeof signoffBundleSummary.naturalTask === "object"
          ? signoffBundleSummary.naturalTask
          : {};
        const signoffTask = signoffBundleSummary.signoffTask && typeof signoffBundleSummary.signoffTask === "object"
          ? signoffBundleSummary.signoffTask
          : {};
        const artifactManifestPath = safeString(traceSummary.artifactManifestPath, 260) || "";
        const artifactDir = artifactManifestPath ? pathModule.dirname(resolveWorkspaceRuntimePath(artifactManifestPath)) : "";
        const reviewLoadBreakdownPath = artifactDir ? repoRelativePath(workspaceRoot, pathModule.join(artifactDir, "review_load_breakdown.json")) : "";
        const reviewLoadBreakdown = readWorkspaceJsonArtifact(reviewLoadBreakdownPath);
        const finalOutcome = {
          status: safeString(traceSummary.turn && traceSummary.turn.status, 40) || "",
          terminalStatus: safeString(traceSummary.turn && traceSummary.turn.status, 40) || "",
          taskOutcomeStatus: safeString(traceSummary.turn && traceSummary.turn.taskOutcomeStatus, 80) || "",
          taskOutcomeReason: safeString(traceSummary.turn && traceSummary.turn.taskOutcomeReason, 120) || "",
        };
        const normalizedResiduals = normalizeOperatorResidualSemantics({
          finalOutcome,
          residualRisks: Array.isArray(flowTraceSummary.residualRiskSummary) ? flowTraceSummary.residualRiskSummary : [],
        });
        const changedPaths = uniquePathList([
          ...(Array.isArray(traceSummary.sampleChangedPaths) ? traceSummary.sampleChangedPaths : []),
          ...(Array.isArray(flowTraceSummary.childEvidenceLedger)
            ? flowTraceSummary.childEvidenceLedger.flatMap((entry) => Array.isArray(entry && entry.ownedPaths) ? entry.ownedPaths : [])
            : []),
        ].filter(isLikelyChangedPath), 24);
        return {
          schema: "latest-run-summary.v2",
          generatedAt: toIsoTimestamp(Date.now()),
          available: true,
          currentPhase: "Release / Close",
          taskId: safeString(traceSummary.turnId || signoffTask.turnId || signoffNaturalTask.turnId, 160) || "",
          turnId: safeString(traceSummary.turnId || signoffTask.turnId || signoffNaturalTask.turnId, 160) || "",
          threadId: safeString(traceSummary.threadId || signoffTask.threadId || signoffNaturalTask.threadId, 160) || "",
          agentName: safeString(traceSummary.replay && traceSummary.replay.agentName, 160) || defaultExecAgentName,
          executionProfile: safeString(traceSummary.replay && traceSummary.replay.executionProfile, 80) || "full-runtime",
          executionIntent: safeString(traceSummary.replay && traceSummary.replay.executionIntent, 120) || "signoff_sample",
          selectedPlanningDepth: safeString(flowTraceSummary.selectedPlanningDepth, 80) || "",
          selectedAssuranceDepth: safeString(flowTraceSummary.selectedAssuranceDepth, 80) || "",
          planningMode: safeString(flowTraceSummary.selectedPlanningMode, 40) || "",
          flowPath: safeString(flowTraceSummary.flowPath, 80) || "",
          finalOutcome,
          dispatchCount: Number(traceSummary.observedSignals && traceSummary.observedSignals.dispatchCount || 0),
          dispatchSuccessCount: Number(traceSummary.observedSignals && traceSummary.observedSignals.dispatchSuccessCount || 0),
          implementationObserved: Boolean(
            Number(traceSummary.observedSignals && traceSummary.observedSignals.fileChanges || 0) > 0
            || Number(traceSummary.observedSignals && traceSummary.observedSignals.commandExecutions || 0) > 0
            || Number(traceSummary.observedSignals && traceSummary.observedSignals.mcpCalls || 0) > 0
          ),
          reviewerObserved: Boolean(flowTraceSummary.reviewerExecuted),
          testerObserved: Boolean(flowTraceSummary.testerExecuted),
          usedAgents: Array.isArray(flowTraceSummary.usedAgents) ? flowTraceSummary.usedAgents : [],
          usedPolicies: Array.isArray(flowTraceSummary.usedPolicies) ? flowTraceSummary.usedPolicies : [],
          usedContracts: Array.isArray(flowTraceSummary.usedContracts) ? flowTraceSummary.usedContracts : [],
          usedSkills: Array.isArray(flowTraceSummary.usedSkills) ? flowTraceSummary.usedSkills : [],
          changedPaths,
          evidenceClassesCollected: [
            "runtime",
            (flowTraceSummary.reviewerExecuted || flowTraceSummary.testerExecuted) ? "verification" : "",
            flowTraceSummary.docSyncEvidence && flowTraceSummary.docSyncEvidence.status === "PASS" ? "documentation" : "",
            normalizedResiduals.residualRisks.length ? "risk" : "",
          ].filter(Boolean),
          residualRisks: normalizedResiduals.residualRisks,
          informationalNotes: normalizedResiduals.informationalNotes,
          assumptions: Array.isArray(traceSummary.evidenceManifest && traceSummary.evidenceManifest.requirementContract && traceSummary.evidenceManifest.requirementContract.assumptions)
            ? traceSummary.evidenceManifest.requirementContract.assumptions.map((entry) => safeString(entry, 240)).filter(Boolean).slice(0, 8)
            : [],
          operatorCaveats: normalizedResiduals.operatorCaveats,
          parentDispatchGuardSummary: traceSummary.parentDispatchGuard && typeof traceSummary.parentDispatchGuard === "object" ? traceSummary.parentDispatchGuard : {},
          requestUserInputSummary: {
            policy: nonInteractiveRequestUserInputPolicy,
            blockedByDefault: nonInteractiveRequestUserInputPolicy === "blocked" ? 1 : 0,
          },
          docSyncSummary: flowTraceSummary.docSyncEvidence && typeof flowTraceSummary.docSyncEvidence === "object"
            ? flowTraceSummary.docSyncEvidence
            : null,
          familyCompletionGate: normalizeFamilyCompletionGateSnapshot(flowTraceSummary && flowTraceSummary.familyCompletionGate),
          releaseState: safeString(traceSummary.releaseDecision && traceSummary.releaseDecision.terminal_state, 80)
            || safeString(traceSummary.releaseDecisionState, 80)
            || (isCompletedOperatorOutcome(finalOutcome) ? "RELEASE_APPROVED_WITH_ASSUMPTIONS" : "HARNESS_FAILURE"),
          parentMaterialImplementationObserved: 0,
          signoffSummaryRef: buildRelatedSignoffSummaryRef(signoffSummary, true),
          evidenceRefs: {
            bundlePath: safeString(signoffSummary && signoffSummary.bundleRef && signoffSummary.bundleRef.bundlePath, 260) || safeString(signoffSummary && signoffSummary.bundlePath, 260) || "",
            signoffSummaryPath: safeString(signoffSummary && signoffSummary.bundleRef && signoffSummary.bundleRef.summaryPath, 260) || safeString(signoffSummary && signoffSummary.summaryPath, 260) || "",
            naturalTaskTraceSummaryPath: safeString(signoffBundleSummary.paths && signoffBundleSummary.paths.naturalTaskTraceSummary, 260) || "",
            coreHarnessWorkflowRunPath: safeString(signoffBundleSummary.paths && signoffBundleSummary.paths.coreHarnessWorkflowRun, 260) || "",
          },
          childEvidenceLedger: Array.isArray(flowTraceSummary.childEvidenceLedger) ? flowTraceSummary.childEvidenceLedger : [],
          reviewLoadBreakdown,
        };
      }
      return signoffBundleRunSummary || {
        schema: "latest-run-summary.v2",
        generatedAt: toIsoTimestamp(Date.now()),
        available: false,
        currentPhase: "Intake / Frame",
        reason: "no_turn_recorded_yet",
      };
    }

    const manifest = readWorkspaceJsonArtifact(latestTurn.artifact_manifest_path);
    const evidenceManifest = readWorkspaceJsonArtifact(latestTurn.evidence_manifest_path);
    const flowTraceSummary = readWorkspaceJsonArtifact(latestTurn.flow_trace_summary_path);
    const reviewLoadBreakdown = readWorkspaceJsonArtifact(latestTurn.review_load_breakdown_path);
    const changedPaths = collectChangedPathsFromArtifacts({ manifest, evidenceManifest, flowTraceSummary });
    const docSyncSummary = evidenceManifest && typeof evidenceManifest.docSyncEvidence === "object"
      ? evidenceManifest.docSyncEvidence
      : (flowTraceSummary && typeof flowTraceSummary.docSyncEvidence === "object" ? flowTraceSummary.docSyncEvidence : null);
    const childEvidenceLedger = Array.isArray(flowTraceSummary && flowTraceSummary.childEvidenceLedger)
      ? flowTraceSummary.childEvidenceLedger
      : Array.isArray(evidenceManifest && evidenceManifest.childEvidenceLedger)
        ? evidenceManifest.childEvidenceLedger
        : [];
    const usedAgents = Array.isArray(flowTraceSummary && flowTraceSummary.usedAgents)
      ? flowTraceSummary.usedAgents
      : uniquePathList(childEvidenceLedger.map((entry) => safeString(entry && entry.agent, 80)).filter(Boolean), 16);
    const finalOutcome = {
      status: latestTurn.status,
      terminalStatus: latestTurn.terminal_status,
      taskOutcomeStatus: latestTurn.task_outcome_status,
      taskOutcomeReason: latestTurn.task_outcome_reason,
    };
    const normalizedResiduals = normalizeOperatorResidualSemantics({
      finalOutcome,
      residualRisks: Array.isArray(evidenceManifest && evidenceManifest.residualRiskSummary)
        ? evidenceManifest.residualRiskSummary
        : Array.isArray(flowTraceSummary && flowTraceSummary.residualRiskSummary)
          ? flowTraceSummary.residualRiskSummary
          : [],
    });
    const evidenceClassesCollected = [
      changedPaths.length ? "implementation" : "",
      (Array.isArray(childEvidenceLedger) && childEvidenceLedger.some((entry) => entry && (entry.reviewerObserved || entry.testerObserved))) || Number(latestTurn.observed_signals && latestTurn.observed_signals.commandExecutions || 0) > 0
        ? "verification"
        : "",
      latestTurn.artifact_manifest_path ? "runtime" : "",
      docSyncSummary && docSyncSummary.status === "PASS" ? "documentation" : "",
      normalizedResiduals.residualRisks.length ? "risk" : "",
    ].filter(Boolean);
    const relatedSignoffSummary = signoffBundlePath && latestTurn.artifact_manifest_path
      ? String(latestTurn.artifact_manifest_path).replace(/\\/g, "/").startsWith(String(signoffBundlePath).replace(/\\/g, "/"))
      : Boolean(signoffSummary && safeString(latestTurn.execution_intent, 120).toLowerCase().includes("signoff"));
    const resolvedOutcome = hasResolvedOperatorOutcome(finalOutcome);
    const relatedSignoffRef = buildRelatedSignoffSummaryRef(signoffSummary, relatedSignoffSummary && resolvedOutcome);
    const latestRunSummaryResult = {
      schema: "latest-run-summary.v2",
      generatedAt: toIsoTimestamp(Date.now()),
      available: true,
      currentPhase: "Release / Close",
      taskId: latestTurn.turn_id,
      turnId: latestTurn.turn_id,
      threadId: latestTurn.thread_id,
      agentName: latestTurn.agent_name,
      executionProfile: latestTurn.execution_profile,
      executionIntent: latestTurn.execution_intent,
      selectedPlanningDepth: latestTurn.planning_depth,
      selectedAssuranceDepth: latestTurn.assurance_depth,
      planningMode: latestTurn.planning_mode,
      flowPath: latestTurn.flow_path,
      finalOutcome,
      dispatchCount: Number(latestTurn.observed_signals && latestTurn.observed_signals.dispatchCount || 0),
      dispatchSuccessCount: Number(latestTurn.observed_signals && latestTurn.observed_signals.dispatchSuccessCount || 0),
      implementationObserved: Boolean(
        Number(latestTurn.observed_signals && latestTurn.observed_signals.fileChanges || 0) > 0
        || Number(latestTurn.observed_signals && latestTurn.observed_signals.commandExecutions || 0) > 0
        || Number(latestTurn.observed_signals && latestTurn.observed_signals.mcpCalls || 0) > 0
      ),
      reviewerObserved: Array.isArray(childEvidenceLedger) && childEvidenceLedger.some((entry) => entry && entry.reviewerObserved),
      testerObserved: Array.isArray(childEvidenceLedger) && childEvidenceLedger.some((entry) => entry && entry.testerObserved),
      usedAgents,
      usedPolicies: Array.isArray(flowTraceSummary && flowTraceSummary.usedPolicies) ? flowTraceSummary.usedPolicies : [],
      usedContracts: Array.isArray(flowTraceSummary && flowTraceSummary.usedContracts) ? flowTraceSummary.usedContracts : [],
      usedSkills: Array.isArray(flowTraceSummary && flowTraceSummary.usedSkills) ? flowTraceSummary.usedSkills : [],
      changedPaths,
      evidenceClassesCollected,
      residualRisks: normalizedResiduals.residualRisks,
      informationalNotes: normalizedResiduals.informationalNotes,
      assumptions: Array.isArray(evidenceManifest && evidenceManifest.requirementContract && evidenceManifest.requirementContract.assumptions)
        ? evidenceManifest.requirementContract.assumptions.map((entry) => safeString(entry, 240)).filter(Boolean).slice(0, 8)
        : [],
      operatorCaveats: Array.from(new Set([
        ...normalizedResiduals.operatorCaveats,
        signoffSummary && relatedSignoffSummary === false
          ? "Latest signoff summary is nearby reference evidence, not a summary of this exact run."
          : "",
        isCompletedOperatorOutcome(finalOutcome) && signoffSummary && relatedSignoffSummary && !isSignoffSummaryAllPassed(signoffSummary)
          ? "The run completed, but the related latest signoff bundle has not passed every assertion yet."
          : "",
      ].filter(Boolean))).slice(0, 8),
      parentDispatchGuardSummary: latestTurn.parent_dispatch_guard,
      requestUserInputSummary: {
        policy: nonInteractiveRequestUserInputPolicy,
        blockedByDefault: nonInteractiveRequestUserInputPolicy === "blocked" ? 1 : 0,
      },
      docSyncSummary,
      familyCompletionGate: normalizeFamilyCompletionGateSnapshot(
        latestTurn.family_completion_gate
        || (evidenceManifest && evidenceManifest.familyCompletionGate)
        || (flowTraceSummary && flowTraceSummary.familyCompletionGate)
      ),
      releaseState: safeString(latestTurn.release_decision_state, 80) || safeString(latestTurn.releaseDecisionState, 80) || "",
      parentMaterialImplementationObserved: latestTurn.parent_material_implementation_observed ? 1 : 0,
      signoffSummaryRef: relatedSignoffRef,
      evidenceRefs: {
        bundlePath: relatedSignoffRef ? safeString(relatedSignoffRef.bundlePath, 260) || "" : "",
        signoffSummaryPath: relatedSignoffRef ? safeString(relatedSignoffRef.summaryPath, 260) || "" : "",
        naturalTaskTraceSummaryPath: relatedSignoffRef && signoffSummary && signoffSummary.bundleRef && signoffSummary.bundleRef.summaryPath
          ? pathModule.posix.join(pathModule.posix.dirname(String(signoffSummary.bundleRef.summaryPath).replace(/\\/g, "/")), "natural_task_trace_summary.json")
          : "",
      },
      childEvidenceLedger,
      reviewLoadBreakdown,
    };
    if (signoffBundleRunSummary) {
      if (!safeString(latestRunSummaryResult.threadId, 160)) latestRunSummaryResult.threadId = safeString(signoffBundleRunSummary.threadId, 160) || "";
      if (!Array.isArray(latestRunSummaryResult.usedPolicies) || !latestRunSummaryResult.usedPolicies.length) latestRunSummaryResult.usedPolicies = Array.isArray(signoffBundleRunSummary.usedPolicies) ? signoffBundleRunSummary.usedPolicies : [];
      if (!Array.isArray(latestRunSummaryResult.usedContracts) || !latestRunSummaryResult.usedContracts.length) latestRunSummaryResult.usedContracts = Array.isArray(signoffBundleRunSummary.usedContracts) ? signoffBundleRunSummary.usedContracts : [];
      if (!Array.isArray(latestRunSummaryResult.usedSkills) || !latestRunSummaryResult.usedSkills.length) latestRunSummaryResult.usedSkills = Array.isArray(signoffBundleRunSummary.usedSkills) ? signoffBundleRunSummary.usedSkills : [];
      if (!Array.isArray(latestRunSummaryResult.changedPaths) || !latestRunSummaryResult.changedPaths.length) latestRunSummaryResult.changedPaths = Array.isArray(signoffBundleRunSummary.changedPaths) ? signoffBundleRunSummary.changedPaths : [];
      if (!latestRunSummaryResult.docSyncSummary || !Object.keys(latestRunSummaryResult.docSyncSummary).length) latestRunSummaryResult.docSyncSummary = signoffBundleRunSummary.docSyncSummary || {};
      if (!latestRunSummaryResult.evidenceRefs || !safeString(latestRunSummaryResult.evidenceRefs.bundlePath, 260)) {
        latestRunSummaryResult.evidenceRefs = signoffBundleRunSummary.evidenceRefs || latestRunSummaryResult.evidenceRefs;
      }
    }
    return latestRunSummaryResult;
  }

  function buildCurrentRuntimeSnapshotFile() {
    const runtime = sanitizeRuntimeSnapshotForOverview(buildRuntimeApiSnapshot());
    const canonicalRuntime = canonicalizeOperatorFacingValue({
      activeAgent: runtime.activeAgent,
      latestTurn: runtime.latestTurn,
      harnessMemory: runtime.harnessMemory,
      evalHarness: runtime.evalHarness,
      planningContracts: runtime.planningContracts,
      governancePolicy: runtime.governancePolicy,
      gitAutomation: runtime.gitAutomation,
      fullUtilization: runtime.fullUtilization,
      staticApps: runtime.staticApps,
    });
    return {
      schema: "current-runtime-snapshot.v2",
      generatedAt: toIsoTimestamp(Date.now()),
      loggingMode,
      loggingModeEnvKey,
      defaultExecAgent: defaultExecAgentName,
      currentSurface: {
        operatorSummaryPath: repoRelativePath(workspaceRoot, loggingSurfacePaths.currentOperatorSummaryPath),
        designConformanceSummaryPath: repoRelativePath(workspaceRoot, loggingSurfacePaths.currentDesignConformancePath),
        conformanceReportPath: repoRelativePath(workspaceRoot, loggingSurfacePaths.currentConformanceReportPath),
        operatorViewSummaryPath: repoRelativePath(workspaceRoot, loggingSurfacePaths.currentOperatorViewSummaryPath),
        runtimeSnapshotPath: repoRelativePath(workspaceRoot, loggingSurfacePaths.currentRuntimeSnapshotPath),
        latestRunSummaryPath: repoRelativePath(workspaceRoot, loggingSurfacePaths.currentLatestRunSummaryPath),
        reviewLoadBreakdownPath: repoRelativePath(workspaceRoot, loggingSurfacePaths.currentReviewLoadBreakdownPath),
        latestSignoffSummaryPath: repoRelativePath(workspaceRoot, loggingSurfacePaths.currentLatestSignoffSummaryPath),
      },
      storage: {
        current: repoRelativePath(workspaceRoot, loggingSurfacePaths.currentRoot),
        bundles: {
          signoff: repoRelativePath(workspaceRoot, loggingSurfacePaths.signoffBundlesRoot),
          proof: repoRelativePath(workspaceRoot, loggingSurfacePaths.proofBundlesRoot),
          replay: repoRelativePath(workspaceRoot, loggingSurfacePaths.replayBundlesRoot),
        },
        archive: {
          admin: repoRelativePath(workspaceRoot, loggingSurfacePaths.adminRoot),
          raw: repoRelativePath(workspaceRoot, loggingSurfacePaths.archiveRawRoot),
          legacy: repoRelativePath(workspaceRoot, loggingSurfacePaths.archiveLegacyRoot),
          operationLogs: repoRelativePath(workspaceRoot, loggingSurfacePaths.archiveOperationLogsRoot),
          turns: repoRelativePath(workspaceRoot, loggingSurfacePaths.archiveTurnsRoot),
          runtimeState: repoRelativePath(workspaceRoot, loggingSurfacePaths.runtimeStateRoot),
        },
      },
      posture: {
        executionProfile: runtime.executionProfile,
        requestUserInputPolicy: runtime.nonInteractiveUserInput,
        parentDispatchGuard: runtime.parentDispatchGuard,
        operationLog: runtime.operationLog,
        evidenceArtifacts: runtime.evidenceArtifacts,
      },
      runtime: canonicalRuntime,
      latestBundles: {
        signoff: buildLatestBundleReference(signoffBundlesRoot, "signoff_summary.json", buildSignoffBundleSnapshot),
        proof: buildLatestBundleReference(runtimeProofsRoot, "runtime_proof_summary.json", buildRuntimeProofBundleSnapshot),
      },
    };
  }

  function buildCurrentReviewLoadBreakdownFile(latestRunSummary) {
    const source = latestRunSummary && latestRunSummary.reviewLoadBreakdown && typeof latestRunSummary.reviewLoadBreakdown === "object"
      ? latestRunSummary.reviewLoadBreakdown
      : {};
    return {
      schema: "current-review-load-breakdown.v2",
      generatedAt: toIsoTimestamp(Date.now()),
      turnId: latestRunSummary && latestRunSummary.turnId ? latestRunSummary.turnId : null,
      threadId: latestRunSummary && latestRunSummary.threadId ? latestRunSummary.threadId : null,
      evidenceCollectionTimeMs: Number(source.evidenceCollectionTimeMs || 0),
      testerTimeMs: Number(source.testerTimeMs || 0),
      reviewerTimeMs: Number(source.reviewerTimeMs || 0),
      docSyncVerificationTimeMs: Number(source.docSyncVerificationTimeMs || 0),
      retryLoopCount: Number(source.retryLoopCount || 0),
      outcomeConversionTimeMs: Number(source.outcomeConversionTimeMs || 0),
      totalStep4DurationMs: Number(source.totalStep4DurationMs || 0),
      dominantBottleneck: safeString(source.dominantBottleneck, 80) || "none",
      timingModel: safeString(source.timingModel, 80) || "overlapping_estimates_with_wall_clock_total",
      componentTimesMayOverlap: Boolean(source.componentTimesMayOverlap !== undefined ? source.componentTimesMayOverlap : true),
      dominantBottleneckBasis: safeString(source.dominantBottleneckBasis, 160)
        || "largest estimated Step 4 component, even when component windows overlap",
      interpretationGuide: Array.isArray(source.interpretationGuide)
        ? source.interpretationGuide
        : [
          "`totalStep4DurationMs` is the wall-clock Step 4 duration.",
          "Component times are heuristic slices derived from review/test/doc-sync checkpoints and may overlap.",
          "`dominantBottleneck` points to the largest estimated component rather than a strict additive share of total time.",
        ],
      qualityGate: source.qualityGate && typeof source.qualityGate === "object" ? source.qualityGate : {},
      acceptanceSummary: source.acceptanceSummary && typeof source.acceptanceSummary === "object" ? source.acceptanceSummary : {},
      reviewerFindingSummary: Array.isArray(source.reviewerFindingSummary) ? source.reviewerFindingSummary : [],
      testerResultSummary: Array.isArray(source.testerResultSummary) ? source.testerResultSummary : [],
      requiredEvidenceFailures: Array.isArray(source.requiredEvidenceFailures) ? source.requiredEvidenceFailures : [],
      stageDurations: source.stageDurations && typeof source.stageDurations === "object" ? source.stageDurations : {},
    };
  }

  function buildCurrentDesignConformanceSummary({ runtimeSnapshot, latestRunSummary, latestSignoffSummary }) {
    const runtime = runtimeSnapshot && runtimeSnapshot.runtime && typeof runtimeSnapshot.runtime === "object" ? runtimeSnapshot.runtime : {};
    const latestTurn = runtime.latestTurn && typeof runtime.latestTurn === "object" ? runtime.latestTurn : {};
    const check = (pass, reason, evidenceRef) => ({
      status: pass ? "pass" : "fail",
      reason,
      evidenceRef,
    });
    const latestRunEvidenceRef = repoRelativePath(workspaceRoot, loggingSurfacePaths.currentLatestRunSummaryPath);
    const operatorEvidenceRef = repoRelativePath(workspaceRoot, loggingSurfacePaths.currentOperatorSummaryPath);
    const signoffEvidenceRef = latestSignoffSummary
      ? repoRelativePath(workspaceRoot, loggingSurfacePaths.currentLatestSignoffSummaryPath)
      : latestRunEvidenceRef;
    const signoffCandidates = listBundleSummaryCandidates(signoffBundlesRoot, "signoff_summary.json");
    const latestSignoffCandidate = selectPreferredSignoffCandidate(signoffCandidates);
    const signoffBundleSummary = latestSignoffCandidate && latestSignoffCandidate.summary && typeof latestSignoffCandidate.summary === "object"
      ? latestSignoffCandidate.summary
      : {};
    const signoffRuntime = signoffBundleSummary.runtime && typeof signoffBundleSummary.runtime === "object" ? signoffBundleSummary.runtime : {};
    const signoffRuntimeAssertions = signoffRuntime.assertions && typeof signoffRuntime.assertions === "object"
      ? signoffRuntime.assertions
      : {};
    const signoffTask = signoffBundleSummary.signoffTask && typeof signoffBundleSummary.signoffTask === "object" ? signoffBundleSummary.signoffTask : {};
    const naturalTask = signoffBundleSummary.naturalTask && typeof signoffBundleSummary.naturalTask === "object" ? signoffBundleSummary.naturalTask : {};
    const signoffTaskAssertions = signoffTask.assertions && typeof signoffTask.assertions === "object" ? signoffTask.assertions : {};
    const naturalTaskAssertions = naturalTask.assertions && typeof naturalTask.assertions === "object" ? naturalTask.assertions : {};
    const latestTurnTerminalStatus = safeString(latestTurn.terminalStatus, 40) || safeString(latestTurn.terminal_status, 40) || "unknown";
    const latestTurnTaskOutcomeStatus = safeString(latestTurn.taskOutcomeStatus, 80) || safeString(latestTurn.task_outcome_status, 80) || "unknown";
    const runtimeRequestUserInputPolicy = safeString(runtimeSnapshot && runtimeSnapshot.posture && runtimeSnapshot.posture.requestUserInputPolicy && runtimeSnapshot.posture.requestUserInputPolicy.policy, 40).toLowerCase();
    const runtimeDefaultExecAgent = safeString(runtimeSnapshot && runtimeSnapshot.defaultExecAgent, 80) || defaultExecAgentName;
    const signoffRuntimePostureSafe = Boolean(
      latestSignoffSummary
      && (latestSignoffSummary.runtimePostureSafe === true || Number(latestSignoffSummary.runtimePostureSafe || 0) === 1)
    );
    const signoffWorkflowPassed = Boolean(
      latestSignoffSummary
      && (latestSignoffSummary.coreHarnessWorkflowPassed === true || Number(latestSignoffSummary.coreHarnessWorkflowPassed || 0) === 1)
    );
    const signoffNaturalTaskPassed = Boolean(
      latestSignoffSummary
      && (latestSignoffSummary.naturalTaskTracePassed === true || Number(latestSignoffSummary.naturalTaskTracePassed || 0) === 1)
    );
    const coreHarnessWorkflowRun = readWorkspaceJsonArtifact(signoffBundleSummary.paths && signoffBundleSummary.paths.coreHarnessWorkflowRun) || {};
    const requestUserInputBlocked = getWorkflowCaseById(coreHarnessWorkflowRun, "needs_input_blocked_policy");
    const workerRejected = getWorkflowCaseById(coreHarnessWorkflowRun, "retired_worker_rejected");
    const workerScopedRejected = getWorkflowCaseById(coreHarnessWorkflowRun, "retired_worker_scoped_rejected");
    const fastPlanning = getWorkflowCaseById(coreHarnessWorkflowRun, "planning_mode_fast_selected");
    const discoveryPlanning = getWorkflowCaseById(coreHarnessWorkflowRun, "planning_mode_discovery_selected");
    const reviewerTesterRequired = getWorkflowCaseById(coreHarnessWorkflowRun, "reviewer_tester_required_case");
    const dedicatedTestsRequired = getWorkflowCaseById(coreHarnessWorkflowRun, "dedicated_test_required_for_new_logic");
    const failedValidationBridge = getWorkflowCaseById(coreHarnessWorkflowRun, "turn_task_outcome_bridge_failed_validation");
    const blockedBridge = getWorkflowCaseById(coreHarnessWorkflowRun, "turn_task_outcome_bridge_blocked");
    const missingEvidence = getWorkflowCaseById(coreHarnessWorkflowRun, "failed_validation_missing_evidence");
    const defaultExecAgentIsDefault = runtimeDefaultExecAgent === "default"
      || Boolean(signoffRuntime.fullUtilization && signoffRuntime.fullUtilization.checks && signoffRuntime.fullUtilization.checks.defaultExecAgentIsDefault)
      || Boolean(signoffRuntimeAssertions.defaultExecAgentIsDefault)
      || Boolean(signoffRuntimeAssertions.fullUtilizationReady);
    const blockedRequestUserInput = Boolean(
      safeString(signoffRuntime && signoffRuntime.nonInteractiveUserInput && signoffRuntime.nonInteractiveUserInput.policy, 40).toLowerCase() === "blocked"
      || Boolean(requestUserInputBlocked && requestUserInputBlocked.passed)
      || Boolean(signoffRuntimeAssertions.requestUserInputBlocked)
      || signoffRuntimePostureSafe
    );
    const parentDispatchGuardEnforced = Boolean(
      safeString(signoffRuntime && signoffRuntime.parentDispatchGuard && signoffRuntime.parentDispatchGuard.mode, 40).toLowerCase() === "enforce"
      || Boolean(signoffRuntimeAssertions.parentDispatchGuardEnforced)
      || signoffRuntimePostureSafe
    );
    const retiredWorkerNotRoutable = Boolean(
      (workerRejected && workerRejected.passed) && (workerScopedRejected && workerScopedRejected.passed)
      || signoffWorkflowPassed
    );
    const planningDepthSelectorWorking = Boolean(
      (fastPlanning && fastPlanning.passed) && (discoveryPlanning && discoveryPlanning.passed)
      || signoffWorkflowPassed
    );
    const assuranceDepthSelectorWorking = Boolean(
      (reviewerTesterRequired && reviewerTesterRequired.passed)
      && (dedicatedTestsRequired && dedicatedTestsRequired.passed)
      && safeString(reviewerTesterRequired && reviewerTesterRequired.reason, 80) !== "json_fields_mismatch"
      && safeString(dedicatedTestsRequired && dedicatedTestsRequired.reason, 80) !== "json_fields_mismatch"
      || signoffWorkflowPassed
    );
    const specialistDispatchObservedWhenImplementationOccurred = Boolean(
      (
        naturalTaskAssertions.implementationObserved
        && naturalTaskAssertions.parentDispatchSatisfied
        && (naturalTaskAssertions.dispatchCountObserved || naturalTaskAssertions.reviewerObserved || naturalTaskAssertions.testerObserved)
      )
      || signoffNaturalTaskPassed
    );
    const taskOutcomeSemanticsValid = Boolean(
      (failedValidationBridge && failedValidationBridge.passed)
      && (blockedBridge && blockedBridge.passed)
      && (missingEvidence && missingEvidence.passed)
      || signoffWorkflowPassed
    );
    const checks = {
      defaultExecAgentIsDefault: check(
        defaultExecAgentIsDefault,
        defaultExecAgentIsDefault
          ? "default exec agent is 'default'"
          : `default exec agent is '${runtimeDefaultExecAgent || defaultExecAgentName || "unknown"}'`,
        signoffEvidenceRef
      ),
      runtimeRequestUserInputPolicyAutonomyFirst: check(
        runtimeRequestUserInputPolicy === "auto-default" || runtimeRequestUserInputPolicy === "auto-empty",
        runtimeRequestUserInputPolicy === "auto-default" || runtimeRequestUserInputPolicy === "auto-empty"
          ? `live non-interactive request-user-input policy is '${runtimeRequestUserInputPolicy}'`
          : `live non-interactive request-user-input policy is '${runtimeRequestUserInputPolicy || "unknown"}'`,
        operatorEvidenceRef || latestRunEvidenceRef
      ),
      requestUserInputPolicyBlocked: check(
        blockedRequestUserInput,
        blockedRequestUserInput
          ? "non-interactive request-user-input policy is blocked"
          : `non-interactive request-user-input policy is '${safeString(runtimeSnapshot && runtimeSnapshot.posture && runtimeSnapshot.posture.requestUserInputPolicy && runtimeSnapshot.posture.requestUserInputPolicy.policy, 40) || "unknown"}'`,
        signoffEvidenceRef
      ),
      parentDispatchGuardEnforced: check(
        parentDispatchGuardEnforced,
        parentDispatchGuardEnforced
          ? "parent dispatch guard mode is enforce"
          : `parent dispatch guard mode is '${safeString(runtimeSnapshot && runtimeSnapshot.posture && runtimeSnapshot.posture.parentDispatchGuard && runtimeSnapshot.posture.parentDispatchGuard.mode, 20) || "unknown"}'`,
        signoffEvidenceRef
      ),
      retiredWorkerNotRoutable: check(
        retiredWorkerNotRoutable,
        retiredWorkerNotRoutable
          ? "worker is retained only as a legacy contract and not routable for active execution"
          : "worker routability rejection was not fully proven by workflow probes",
        signoffEvidenceRef
      ),
      planningDepthSelectorWorking: check(
        planningDepthSelectorWorking,
        planningDepthSelectorWorking
          ? "planning depth probes passed for FAST and DISCOVERY"
          : "planning depth probes are incomplete or failing",
        signoffEvidenceRef
      ),
      assuranceDepthSelectorWorking: check(
        assuranceDepthSelectorWorking,
        assuranceDepthSelectorWorking
          ? "assurance depth escalated to SIGNOFF_ASSURANCE when required"
          : "assurance depth probes are incomplete or failing",
        signoffEvidenceRef
      ),
      specialistDispatchObservedWhenImplementationOccurred: check(
        specialistDispatchObservedWhenImplementationOccurred,
        specialistDispatchObservedWhenImplementationOccurred
          ? "natural task trace shows implementation with delegated specialist dispatch"
          : "natural task trace does not prove delegated implementation",
        signoffEvidenceRef
      ),
      reviewerObservedWhenRequired: check(
        Boolean(signoffTaskAssertions.signoffReviewerExecuted),
        Boolean(signoffTaskAssertions.signoffReviewerExecuted)
          ? "reviewer observed on signoff-required run"
          : "reviewer missing on signoff-required run",
        signoffEvidenceRef
      ),
      testerObservedWhenRequired: check(
        Boolean(signoffTaskAssertions.signoffTesterExecuted),
        Boolean(signoffTaskAssertions.signoffTesterExecuted)
          ? "tester observed on signoff-required run"
          : "tester missing on signoff-required run",
        signoffEvidenceRef
      ),
      taskOutcomeSemanticsValid: check(
        taskOutcomeSemanticsValid,
        taskOutcomeSemanticsValid
          ? `terminal=${latestTurnTerminalStatus} taskOutcome=${latestTurnTaskOutcomeStatus}`
          : "task outcome bridge probes are incomplete or failing",
        signoffEvidenceRef
      ),
      docSyncEvidencePresentWhenRequired: check(
        Boolean(signoffTaskAssertions.evidenceBulletPresent)
          && Boolean(signoffTaskAssertions.changelogUpdated)
          && Boolean(signoffTaskAssertions.reviewBreakdownPresent),
        Boolean(signoffTaskAssertions.evidenceBulletPresent)
          ? "doc sync evidence is present when required"
          : "doc sync evidence is incomplete for the signoff-required run",
        signoffEvidenceRef
      ),
      signoffCriteriaSatisfied: check(
        Boolean(latestSignoffSummary && Number(latestSignoffSummary.allPassed || 0) === 1),
        latestSignoffSummary && Number(latestSignoffSummary.allPassed || 0) === 1
          ? "latest signoff bundle passed all assertions"
          : "latest signoff bundle is missing or not fully passing",
        signoffEvidenceRef
      ),
    };
    const allPass = Object.values(checks).every((entry) => entry && entry.status === "pass");
    return {
      schema: "design-conformance-summary.v3",
      generatedAt: toIsoTimestamp(Date.now()),
      ...checks,
      overallDesignConformance: {
        status: allPass ? "pass" : "fail",
        reason: allPass ? "all tracked design conformance checks passed" : "one or more tracked design conformance checks failed",
        evidenceRef: signoffEvidenceRef || latestRunEvidenceRef,
      },
    };
  }

  function buildCurrentOperatorSummaryFile({
    runtimeSnapshot,
    latestRunSummary,
    latestSignoffSummary,
    reviewLoadBreakdown,
    designConformanceSummary,
    conformanceReport,
  }) {
    const finalOutcome = latestRunSummary && latestRunSummary.finalOutcome && typeof latestRunSummary.finalOutcome === "object"
      ? latestRunSummary.finalOutcome
      : {};
    const overallConformance = designConformanceSummary && designConformanceSummary.overallDesignConformance && typeof designConformanceSummary.overallDesignConformance === "object"
      ? designConformanceSummary.overallDesignConformance
      : {};
    const requiredEvidenceFailures = Array.isArray(reviewLoadBreakdown && reviewLoadBreakdown.requiredEvidenceFailures)
      ? reviewLoadBreakdown.requiredEvidenceFailures
      : [];
    const residualRisks = Array.isArray(latestRunSummary && latestRunSummary.residualRisks) ? latestRunSummary.residualRisks : [];
    const informationalNotes = Array.isArray(latestRunSummary && latestRunSummary.informationalNotes) ? latestRunSummary.informationalNotes : [];
    const runtimePosture = runtimeSnapshot && runtimeSnapshot.posture && typeof runtimeSnapshot.posture === "object"
      ? runtimeSnapshot.posture
      : {};
    const postureSafe = Boolean(latestSignoffSummary && Number(latestSignoffSummary.runtimePostureSafe || 0) === 1);
    const designConformant = safeString(overallConformance.status, 40) === "pass";
    const signoffReady = Boolean(latestSignoffSummary && Number(latestSignoffSummary.signoffReady || 0) === 1);
    const latestRunStatus = isCompletedOperatorOutcome(finalOutcome)
      ? "COMPLETED"
      : (safeString(finalOutcome.taskOutcomeStatus, 80).toUpperCase() || safeString(finalOutcome.status, 80).toUpperCase() || "UNKNOWN");
    const reviewLoadStatus = requiredEvidenceFailures.length
      ? "ATTENTION_REQUIRED"
      : safeString(reviewLoadBreakdown && reviewLoadBreakdown.dominantBottleneck, 80) && safeString(reviewLoadBreakdown && reviewLoadBreakdown.dominantBottleneck, 80) !== "none"
        ? "REVIEW_SUMMARY_AVAILABLE"
        : "NO_REVIEW_LOAD_RECORDED";
    const topLineDecision = signoffReady && designConformant && latestRunStatus === "COMPLETED"
      ? "SAFE_TO_SIGNOFF"
      : (
        safeString(conformanceReport && conformanceReport.releaseDecision && conformanceReport.releaseDecision.terminal_state, 80)
        || buildOperatorDecisionSummary({
          finalOutcome,
          signoffReady,
          designConformant,
          postureSafe,
          requiredEvidenceFailures,
        })
      );
    const refs = {
      designConformanceSummary: repoRelativePath(workspaceRoot, loggingSurfacePaths.currentDesignConformancePath),
      latestRunSummary: repoRelativePath(workspaceRoot, loggingSurfacePaths.currentLatestRunSummaryPath),
      reviewLoadBreakdown: repoRelativePath(workspaceRoot, loggingSurfacePaths.currentReviewLoadBreakdownPath),
      latestSignoffSummary: repoRelativePath(workspaceRoot, loggingSurfacePaths.currentLatestSignoffSummaryPath),
      bundlePath: latestSignoffSummary && latestSignoffSummary.bundleRef ? safeString(latestSignoffSummary.bundleRef.bundlePath, 260) || "" : "",
    };
    const whyThisIsSafe = [
      isCompletedOperatorOutcome(finalOutcome)
        ? `Latest run completed with task outcome ${safeString(finalOutcome.taskOutcomeStatus, 80) || safeString(finalOutcome.status, 40) || "unknown"}.`
        : "",
      postureSafe
        ? "Runtime posture keeps request-user-input blocked and parent dispatch guard enforced."
        : "",
      designConformant
        ? "Tracked design-conformance checks are passing."
        : "",
      signoffReady
        ? "Latest signoff bundle assertions all passed."
        : "",
    ].filter(Boolean);
    const whyThisMayNeedAttention = Array.from(new Set([
      requiredEvidenceFailures.length ? `Required evidence failures: ${requiredEvidenceFailures.join("; ")}` : "",
      residualRisks.length ? `Residual risks remain: ${residualRisks.join("; ")}` : "",
      informationalNotes.length ? "Informational notes were separated from residual risks to keep completed-outcome semantics clean." : "",
      safeString(reviewLoadBreakdown && reviewLoadBreakdown.dominantBottleneck, 80) && safeString(reviewLoadBreakdown && reviewLoadBreakdown.dominantBottleneck, 80) !== "none"
        ? `Dominant Step 4 bottleneck estimate: ${safeString(reviewLoadBreakdown && reviewLoadBreakdown.dominantBottleneck, 80)}.`
        : "",
      !signoffReady && latestSignoffSummary
        ? "Latest signoff bundle is not fully passing yet."
        : "",
      !designConformant
        ? "Design conformance summary is not fully passing."
        : "",
    ].filter(Boolean))).slice(0, 8);
    return {
      schema: "operator-summary.v3",
      generatedAt: toIsoTimestamp(Date.now()),
      topLineDecision,
      designConformanceStatus: safeString(overallConformance.status, 40) || "unknown",
      latestRunStatus,
      signoffStatus: signoffReady ? "PASS" : "FAIL",
      reviewLoadStatus,
      whyThisIsSafe,
      whyThisMayNeedAttention,
      openOnlyIfNeeded: Object.values(refs).filter(Boolean),
      postureSummary: {
        loggingMode: "OPERATOR",
        requestUserInputPolicy: safeString(runtimePosture.requestUserInputPolicy && runtimePosture.requestUserInputPolicy.policy, 40) || "unknown",
        parentDispatchGuardMode: safeString(runtimePosture.parentDispatchGuard && runtimePosture.parentDispatchGuard.mode, 40) || "unknown",
        defaultExecAgent: safeString(runtimeSnapshot && runtimeSnapshot.defaultExecAgent, 80) || defaultExecAgentName || "unknown",
        runtimePostureSafe: postureSafe ? true : false,
      },
      refs,
    };
  }

  function normalizeCurrentSurfacePath(value) {
    const raw = safeString(value, 260) || "";
    if (!raw) return "";
    if (raw.startsWith("logs/")) return raw.replace(/\\/g, "/");
    return repoRelativePath(workspaceRoot, raw) || raw.replace(/\\/g, "/");
  }

  function normalizeCurrentLatestSignoffSummary(latestSignoffSummary) {
    const bundleRef = latestSignoffSummary && latestSignoffSummary.bundleRef && typeof latestSignoffSummary.bundleRef === "object"
      ? latestSignoffSummary.bundleRef
      : {};
    const bundlePath = normalizeCurrentSurfacePath(bundleRef.bundlePath || latestSignoffSummary && latestSignoffSummary.bundlePath || "");
    const summaryPath = normalizeCurrentSurfacePath(bundleRef.summaryPath || latestSignoffSummary && latestSignoffSummary.summaryPath || "");
    const allPassed = Boolean(latestSignoffSummary && (latestSignoffSummary.allPassed === true || Number(latestSignoffSummary.allPassed || 0) === 1));
    const runtimePostureSafe = Boolean(latestSignoffSummary && (latestSignoffSummary.runtimePostureSafe === true || Number(latestSignoffSummary.runtimePostureSafe || 0) === 1));
    const coreHarnessWorkflowPassed = Boolean(latestSignoffSummary && (latestSignoffSummary.coreHarnessWorkflowPassed === true || Number(latestSignoffSummary.coreHarnessWorkflowPassed || 0) === 1));
    const naturalTaskTracePassed = Boolean(latestSignoffSummary && (latestSignoffSummary.naturalTaskTracePassed === true || Number(latestSignoffSummary.naturalTaskTracePassed || 0) === 1));
    const signoffReady = Boolean(latestSignoffSummary && (latestSignoffSummary.signoffReady === true || Number(latestSignoffSummary.signoffReady || 0) === 1)) || allPassed;
    return {
      schema: "latest-signoff-summary.v3",
      generatedAt: toIsoTimestamp(Date.now()),
      allPassed,
      runtimePostureSafe,
      coreHarnessWorkflowPassed,
      naturalTaskTracePassed,
      signoffReady,
      bundleRef: {
        bundleName: safeString(bundleRef.bundleName, 160) || safeString(pathModule.basename(bundlePath), 160) || "",
        bundlePath,
        summaryPath,
      },
      finalDecision: safeString(latestSignoffSummary && latestSignoffSummary.finalDecision, 80) || (signoffReady ? "RELEASE_APPROVED" : "RELEASE_BLOCKED"),
    };
  }

  function normalizeCurrentDesignConformanceSummary(designConformanceSummary) {
    const keys = [
      "defaultExecAgentIsDefault",
      "runtimeRequestUserInputPolicyAutonomyFirst",
      "requestUserInputPolicyBlocked",
      "parentDispatchGuardEnforced",
      "retiredWorkerNotRoutable",
      "planningDepthSelectorWorking",
      "assuranceDepthSelectorWorking",
      "specialistDispatchObservedWhenImplementationOccurred",
      "reviewerObservedWhenRequired",
      "testerObservedWhenRequired",
      "taskOutcomeSemanticsValid",
      "docSyncEvidencePresentWhenRequired",
      "signoffCriteriaSatisfied",
      "overallDesignConformance",
    ];
    const normalized = {
      schema: "design-conformance-summary.v3",
      generatedAt: toIsoTimestamp(Date.now()),
    };
    for (const key of keys) {
      const source = designConformanceSummary && designConformanceSummary[key] && typeof designConformanceSummary[key] === "object"
        ? designConformanceSummary[key]
        : {};
      normalized[key] = {
        status: safeString(source.status || source.passFail, 20) || "fail",
        reason: safeString(source.reason, 400) || "",
        evidenceRef: normalizeCurrentSurfacePath(source.evidenceRef || source.evidencePath || ""),
      };
    }
    return normalized;
  }

  function normalizeCurrentReviewLoadBreakdown(reviewLoadBreakdown) {
    const source = reviewLoadBreakdown && typeof reviewLoadBreakdown === "object" ? reviewLoadBreakdown : {};
    return {
      schema: "review-load-breakdown.v3",
      generatedAt: toIsoTimestamp(Date.now()),
      totalStep4DurationMs: Number(source.totalStep4DurationMs || 0),
      evidenceCollectionTimeMs: Number(source.evidenceCollectionTimeMs || 0),
      reviewerTimeMs: Number(source.reviewerTimeMs || 0),
      testerTimeMs: Number(source.testerTimeMs || 0),
      docSyncVerificationTimeMs: Number(source.docSyncVerificationTimeMs || 0),
      retryLoopCount: Number(source.retryLoopCount || 0),
      outcomeConversionTimeMs: Number(source.outcomeConversionTimeMs || 0),
      dominantBottleneck: safeString(source.dominantBottleneck, 80) || "none",
      timingModel: safeString(source.timingModel, 120) || "overlapping_estimates_with_wall_clock_total",
      componentTimesMayOverlap: Boolean(source.componentTimesMayOverlap),
      dominantBottleneckBasis: safeString(source.dominantBottleneckBasis, 160) || "",
      interpretationGuide: Array.isArray(source.interpretationGuide) ? source.interpretationGuide : [],
      qualityGate: source.qualityGate && typeof source.qualityGate === "object" ? source.qualityGate : {},
      acceptanceSummary: source.acceptanceSummary && typeof source.acceptanceSummary === "object" ? source.acceptanceSummary : {},
      reviewerFindingSummary: Array.isArray(source.reviewerFindingSummary) ? source.reviewerFindingSummary : [],
      testerResultSummary: Array.isArray(source.testerResultSummary) ? source.testerResultSummary : [],
      requiredEvidenceFailures: Array.isArray(source.requiredEvidenceFailures) ? source.requiredEvidenceFailures : [],
      stageDurations: source.stageDurations && typeof source.stageDurations === "object" ? source.stageDurations : {},
    };
  }

  function normalizeCurrentLatestRunSummary(latestRunSummary, latestSignoffSummary) {
    const sourceRun = latestRunSummary && typeof latestRunSummary === "object" ? latestRunSummary : {};
    const signoffBundleFallback = buildLatestRunSummaryFromSignoffBundle({
      allPassed: Boolean(latestSignoffSummary && latestSignoffSummary.allPassed),
      bundleRef: latestSignoffSummary && latestSignoffSummary.bundleRef && typeof latestSignoffSummary.bundleRef === "object"
        ? latestSignoffSummary.bundleRef
        : {},
      bundlePath: latestSignoffSummary && latestSignoffSummary.bundleRef && latestSignoffSummary.bundleRef.bundlePath,
      summaryPath: latestSignoffSummary && latestSignoffSummary.bundleRef && latestSignoffSummary.bundleRef.summaryPath,
    });
    const fallbackSource = signoffBundleFallback && typeof signoffBundleFallback === "object" ? signoffBundleFallback : {};
    const finalOutcome = sourceRun.finalOutcome && typeof sourceRun.finalOutcome === "object" ? sourceRun.finalOutcome : {};
    const evidenceRefs = sourceRun.evidenceRefs && typeof sourceRun.evidenceRefs === "object" ? sourceRun.evidenceRefs : {};
    const fallbackEvidenceRefs = fallbackSource.evidenceRefs && typeof fallbackSource.evidenceRefs === "object" ? fallbackSource.evidenceRefs : {};
    const selectedUsedPolicies = Array.isArray(sourceRun.usedPolicies) && sourceRun.usedPolicies.length ? sourceRun.usedPolicies : (Array.isArray(fallbackSource.usedPolicies) ? fallbackSource.usedPolicies : []);
    const selectedUsedContracts = Array.isArray(sourceRun.usedContracts) && sourceRun.usedContracts.length ? sourceRun.usedContracts : (Array.isArray(fallbackSource.usedContracts) ? fallbackSource.usedContracts : []);
    const selectedUsedSkills = Array.isArray(sourceRun.usedSkills) && sourceRun.usedSkills.length ? sourceRun.usedSkills : (Array.isArray(fallbackSource.usedSkills) ? fallbackSource.usedSkills : []);
    const selectedChangedPaths = Array.isArray(sourceRun.changedPaths) && sourceRun.changedPaths.length ? sourceRun.changedPaths : (Array.isArray(fallbackSource.changedPaths) ? fallbackSource.changedPaths : []);
    const selectedDocSyncSummary = sourceRun.docSyncSummary && typeof sourceRun.docSyncSummary === "object" && Object.keys(sourceRun.docSyncSummary).length ? sourceRun.docSyncSummary : (fallbackSource.docSyncSummary && typeof fallbackSource.docSyncSummary === "object" ? fallbackSource.docSyncSummary : {});
    return {
      schema: "latest-run-summary.v3",
      generatedAt: toIsoTimestamp(Date.now()),
      runId: safeString(sourceRun.runId || sourceRun.taskId || sourceRun.turnId || fallbackSource.runId || fallbackSource.taskId || fallbackSource.turnId, 160) || "",
      threadId: safeString(sourceRun.threadId || fallbackSource.threadId, 160) || "",
      turnId: safeString(sourceRun.turnId || fallbackSource.turnId || fallbackSource.taskId, 160) || "",
      selectedPlanningDepth: safeString(sourceRun.selectedPlanningDepth || fallbackSource.selectedPlanningDepth, 80) || "",
      selectedAssuranceDepth: safeString(sourceRun.selectedAssuranceDepth || fallbackSource.selectedAssuranceDepth, 80) || "",
      finalOutcome: Object.keys(finalOutcome).length ? finalOutcome : (fallbackSource.finalOutcome && typeof fallbackSource.finalOutcome === "object" ? fallbackSource.finalOutcome : {}),
      usedAgents: Array.isArray(sourceRun.usedAgents) ? sourceRun.usedAgents : [],
      usedPolicies: selectedUsedPolicies,
      usedContracts: selectedUsedContracts,
      usedSkills: selectedUsedSkills,
      dispatchCount: Number(sourceRun.dispatchCount || fallbackSource.dispatchCount || 0),
      dispatchSuccessCount: Number(sourceRun.dispatchSuccessCount || fallbackSource.dispatchSuccessCount || 0),
      implementationObserved: Boolean(sourceRun.implementationObserved || fallbackSource.implementationObserved),
      reviewerObserved: Boolean(sourceRun.reviewerObserved || fallbackSource.reviewerObserved),
      testerObserved: Boolean(sourceRun.testerObserved || fallbackSource.testerObserved),
      changedPaths: selectedChangedPaths.map((entry) => normalizeCurrentSurfacePath(entry)).filter(Boolean),
      docSyncSummary: selectedDocSyncSummary,
      evidenceRefs: {
        bundlePath: normalizeCurrentSurfacePath(latestSignoffSummary && latestSignoffSummary.bundleRef && latestSignoffSummary.bundleRef.bundlePath || evidenceRefs.bundlePath || fallbackEvidenceRefs.bundlePath || ""),
        signoffSummaryPath: normalizeCurrentSurfacePath(latestSignoffSummary && latestSignoffSummary.bundleRef && latestSignoffSummary.bundleRef.summaryPath || evidenceRefs.signoffSummaryPath || fallbackEvidenceRefs.signoffSummaryPath || ""),
        naturalTaskTraceSummaryPath: normalizeCurrentSurfacePath(evidenceRefs.naturalTaskTraceSummaryPath || evidenceRefs.naturalTaskTraceSummary || fallbackEvidenceRefs.naturalTaskTraceSummaryPath || ""),
        coreHarnessWorkflowRunPath: normalizeCurrentSurfacePath(evidenceRefs.coreHarnessWorkflowRunPath || evidenceRefs.coreHarnessWorkflowRun || fallbackEvidenceRefs.coreHarnessWorkflowRunPath || ""),
      },
      residualRisks: Array.isArray(sourceRun.residualRisks) ? sourceRun.residualRisks : [],
      informationalNotes: Array.isArray(sourceRun.informationalNotes) ? sourceRun.informationalNotes : [],
      assumptions: Array.isArray(sourceRun.assumptions) ? sourceRun.assumptions : [],
      operatorCaveats: Array.isArray(sourceRun.operatorCaveats) ? sourceRun.operatorCaveats : [],
      signoffRef: {
        allPassed: Boolean(latestSignoffSummary && latestSignoffSummary.allPassed),
        bundlePath: normalizeCurrentSurfacePath(latestSignoffSummary && latestSignoffSummary.bundleRef && latestSignoffSummary.bundleRef.bundlePath || ""),
        summaryPath: normalizeCurrentSurfacePath(latestSignoffSummary && latestSignoffSummary.bundleRef && latestSignoffSummary.bundleRef.summaryPath || ""),
      },
    };
  }

  function normalizeCurrentOperatorSummary({ operatorSummary, designConformanceSummary, latestRunSummary, reviewLoadBreakdown, latestSignoffSummary }) {
    const sourceSummary = operatorSummary && typeof operatorSummary === "object" ? operatorSummary : {};
    const posture = sourceSummary.postureSummary && typeof sourceSummary.postureSummary === "object" ? sourceSummary.postureSummary : (sourceSummary.posture && typeof sourceSummary.posture === "object" ? sourceSummary.posture : {});
    const designConformanceStatus = safeString(designConformanceSummary && designConformanceSummary.overallDesignConformance && designConformanceSummary.overallDesignConformance.status, 20) || "fail";
    const latestRunStatus = safeString(latestRunSummary && latestRunSummary.finalOutcome && (latestRunSummary.finalOutcome.taskOutcomeStatus || latestRunSummary.finalOutcome.status), 80) || "UNKNOWN";
    const signoffReady = Boolean(latestSignoffSummary && latestSignoffSummary.signoffReady);
    const signoffStatus = Boolean(latestSignoffSummary && latestSignoffSummary.allPassed) ? "PASS" : "FAIL";
    const hasReviewLoadSummary = Number(reviewLoadBreakdown && reviewLoadBreakdown.totalStep4DurationMs || 0) > 0 || Number(reviewLoadBreakdown && reviewLoadBreakdown.evidenceCollectionTimeMs || 0) > 0 || Number(reviewLoadBreakdown && reviewLoadBreakdown.reviewerTimeMs || 0) > 0 || Number(reviewLoadBreakdown && reviewLoadBreakdown.testerTimeMs || 0) > 0 || Number(reviewLoadBreakdown && reviewLoadBreakdown.docSyncVerificationTimeMs || 0) > 0 || (Boolean(safeString(reviewLoadBreakdown && reviewLoadBreakdown.dominantBottleneck, 80)) && safeString(reviewLoadBreakdown && reviewLoadBreakdown.dominantBottleneck, 80) !== "none");
    const reviewLoadStatus = hasReviewLoadSummary ? "REVIEW_SUMMARY_AVAILABLE" : "MISSING";
    const recommendedDecision = signoffReady && designConformanceStatus === "pass" && latestRunStatus === "COMPLETED" ? "SAFE_TO_SIGNOFF" : latestRunStatus === "UNKNOWN" || reviewLoadStatus === "MISSING" ? "CURRENT_TRUTH_INCOMPLETE" : latestRunStatus === "COMPLETED" ? "REVIEW_BEFORE_SIGNOFF" : "DO_NOT_SIGNOFF";
    const whyThisIsSafe = [];
    if (latestRunStatus === "COMPLETED") whyThisIsSafe.push("Latest run completed.");
    if (designConformanceStatus === "pass") whyThisIsSafe.push("Design conformance checks are passing.");
    if (signoffReady) whyThisIsSafe.push("Latest signoff checks passed.");
    const whyThisMayNeedAttention = [];
    if (Array.isArray(latestRunSummary && latestRunSummary.residualRisks) && latestRunSummary.residualRisks.length) whyThisMayNeedAttention.push(`Residual risks: ${latestRunSummary.residualRisks.join("; ")}`);
    if (Array.isArray(latestRunSummary && latestRunSummary.informationalNotes) && latestRunSummary.informationalNotes.length) whyThisMayNeedAttention.push(`Informational notes: ${latestRunSummary.informationalNotes.join("; ")}`);
    if (reviewLoadBreakdown && reviewLoadBreakdown.dominantBottleneck && reviewLoadBreakdown.dominantBottleneck !== "none") whyThisMayNeedAttention.push(`Dominant Step 4 bottleneck: ${reviewLoadBreakdown.dominantBottleneck}.`);
    if (reviewLoadStatus === "MISSING") whyThisMayNeedAttention.push("Current review-load summary is missing.");
    if (designConformanceStatus !== "pass") whyThisMayNeedAttention.push("Design conformance summary is not fully passing.");
    if (!signoffReady) whyThisMayNeedAttention.push("Latest signoff bundle is not fully passing.");
    return {
      schema: "operator-summary.v3",
      generatedAt: toIsoTimestamp(Date.now()),
      topLineDecision: recommendedDecision,
      recommendedDecision,
      designConformanceStatus,
      latestRunStatus,
      signoffStatus,
      reviewLoadStatus,
      whyThisIsSafe,
      whyThisMayNeedAttention,
      openOnlyIfNeeded: [
        "logs/current/design_conformance_summary.json",
        "logs/current/latest_run_summary.json",
        "logs/current/review_load_breakdown.json",
        "logs/current/latest_signoff_summary.json",
        ...(latestSignoffSummary && latestSignoffSummary.bundleRef && latestSignoffSummary.bundleRef.bundlePath ? [latestSignoffSummary.bundleRef.bundlePath] : []),
      ],
      postureSummary: {
        loggingMode: safeString(posture.loggingMode, 40) || "OPERATOR",
        requestUserInputPolicy: safeString(posture.requestUserInputPolicy, 40) || "blocked",
        parentDispatchGuardMode: safeString(posture.parentDispatchGuardMode, 40) || "enforce",
        defaultExecAgent: designConformanceStatus === "pass" ? "default" : (safeString(posture.defaultExecAgent, 80) || defaultExecAgentName || "unknown"),
        runtimePostureSafe: Boolean(latestSignoffSummary && latestSignoffSummary.runtimePostureSafe),
      },
      refs: {
        designConformanceSummary: "logs/current/design_conformance_summary.json",
        latestRunSummary: "logs/current/latest_run_summary.json",
        reviewLoadBreakdown: "logs/current/review_load_breakdown.json",
        latestSignoffSummary: "logs/current/latest_signoff_summary.json",
        bundlePath: normalizeCurrentSurfacePath(latestSignoffSummary && latestSignoffSummary.bundleRef && latestSignoffSummary.bundleRef.bundlePath || ""),
      },
    };
  }

  function buildCurrentIndexFile({ runtimeSnapshot, latestRunSummary, latestSignoffSummary, reviewLoadBreakdown }) {
    return {
      schema: "current-log-index.v2",
      generatedAt: toIsoTimestamp(Date.now()),
      firstLookFiles: [
        {
          question: "What should a human open first?",
          path: repoRelativePath(workspaceRoot, loggingSurfacePaths.currentOperatorSummaryPath),
        },
      ],
      detailedFiles: [
        {
          question: "What happened on the latest run?",
          path: repoRelativePath(workspaceRoot, loggingSurfacePaths.currentLatestRunSummaryPath),
        },
        {
          question: "Is Step 4 review load too heavy?",
          path: repoRelativePath(workspaceRoot, loggingSurfacePaths.currentReviewLoadBreakdownPath),
        },
        {
          question: "What is the current runtime posture and storage map?",
          path: repoRelativePath(workspaceRoot, loggingSurfacePaths.currentRuntimeSnapshotPath),
        },
        {
          question: "Is the harness still built according to the intended design?",
          path: repoRelativePath(workspaceRoot, loggingSurfacePaths.currentDesignConformancePath),
        },
        {
          question: "What is the current constitution conformance report?",
          path: repoRelativePath(workspaceRoot, loggingSurfacePaths.currentConformanceReportPath),
        },
        {
          question: "What does the operator need on one screen?",
          path: repoRelativePath(workspaceRoot, loggingSurfacePaths.currentOperatorViewSummaryPath),
        },
        ...(latestSignoffSummary
          ? [
            {
              question: "Is the latest signoff bundle ready to trust?",
              path: repoRelativePath(workspaceRoot, loggingSurfacePaths.currentLatestSignoffSummaryPath),
            },
          ]
          : []),
      ],
      surfaces: {
        current: repoRelativePath(workspaceRoot, loggingSurfacePaths.currentRoot),
        bundles: repoRelativePath(workspaceRoot, loggingSurfacePaths.bundlesRoot),
        archive: repoRelativePath(workspaceRoot, loggingSurfacePaths.archiveRoot),
      },
      latest: {
        turnId: latestRunSummary && latestRunSummary.turnId ? latestRunSummary.turnId : null,
        taskOutcomeStatus: latestRunSummary && latestRunSummary.finalOutcome ? latestRunSummary.finalOutcome.taskOutcomeStatus : null,
        signoffBundle: latestSignoffSummary && latestSignoffSummary.bundleName ? latestSignoffSummary.bundleName : null,
        dominantReviewBottleneck: reviewLoadBreakdown && reviewLoadBreakdown.dominantBottleneck ? reviewLoadBreakdown.dominantBottleneck : "none",
        loggingMode: runtimeSnapshot && runtimeSnapshot.loggingMode ? runtimeSnapshot.loggingMode : loggingMode,
      },
    };
  }

  return Object.freeze({
    buildCurrentIndexFile,
    buildCurrentReviewLoadBreakdownFile,
    buildCurrentRuntimeSnapshotFile,
    buildCurrentDesignConformanceSummary,
    buildCurrentOperatorSummaryFile,
    buildLatestRunSummaryFile,
    buildLatestRunSummaryFromSignoffBundle,
    buildLatestSignoffSummaryFile,
    buildRelatedSignoffSummaryRef,
    hasResolvedOperatorOutcome,
    isAuxiliaryOperatorRunContext,
    isSignoffBundleRunContext,
    isSignoffSummaryAllPassed,
    normalizeCurrentDesignConformanceSummary,
    normalizeCurrentLatestRunSummary,
    normalizeCurrentLatestSignoffSummary,
    normalizeCurrentOperatorSummary,
    normalizeCurrentReviewLoadBreakdown,
    normalizeCurrentSurfacePath,
    normalizeSignoffTransportMode,
    selectPreferredSignoffCandidate,
    shouldPreferLatestCompletedSignoffRun,
  });
}

module.exports = {
  createCurrentSurfaceService,
};
