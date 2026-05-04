"use strict";

function createRuntimeApiSnapshotService(deps = {}) {
  const {
    fs,
    path,
    processRef = process,
    apiVersion,
    getActiveAgentState,
    getLatestTurnSnapshot,
    runtimeStateService,
    getRequirementGuardExtensionSnapshot,
    getSessionPerformanceSnapshot,
    nonInteractiveRequestUserInputPolicy,
    requestUserInputPolicyEnvKey,
    buildAdversarialShadowRuntimeSnapshot,
    buildHarnessMemoryRuntimeSnapshot,
    buildWorkspaceGuardSnapshot,
    buildSloRuntimeSnapshot,
    appPlatformReadSurface,
    buildGitAutomationRuntimeSnapshot,
    buildRepoTruthRuntimeSnapshot,
    buildGovernanceRuntimeSurface,
    authorityRegistry,
    authorityRegistryPath,
    readTopLevelCodexConfigString,
    defaultParentAgentConfigPath,
    iterationControlContract,
    iterationControlContractPath,
    adoptionReadinessContract,
    adoptionReadinessContractPath,
    workerDecisionSurfaceContract,
    workerDecisionSurfaceContractPath,
    harnessPlaneContract,
    harnessPlaneContractPath,
    summarizePathForOperationLog,
    buildEvalSuiteSummary,
    defaultEvalSuite,
    evalSuiteConfigPath,
    evalLanePolicyPath,
    evalLanePolicy,
    summarizeEvalLane,
    evalRunHistoryPath,
    evalRunHistoryPathEnvKey,
    evalMaxCases,
    evalDefaultMaxVariants,
    evalCaseTimeoutMs,
    buildFullUtilizationDefaultsSnapshot,
    buildParentDispatchGuardDefaultsSnapshot,
    buildRequirementFoundationV1PhaseStatus,
    buildOpenAIBlogLearningRuntimeStateSnapshot,
    buildManualSelfImprovementRuntimeStateSnapshot,
    buildHarnessAgiImprovementFlywheelRuntimeSummary,
    workspaceRoot,
    buildDocumentToolingRuntimeSnapshot,
    safeString,
    buildAnthropicEngineeringLearningRuntimeStateSnapshot,
    buildEvalHistoryOverview,
    buildExecutionMemoryOverview,
    summarizeIntentFirstRuntime,
    designAcceptanceContract,
    tasteMemoryStore,
    designAcceptanceContractPath,
    tasteMemorySeedPath,
    tasteMemoryMemoryPath,
    buildHarnessTraceabilitySnapshot,
    activeAgentName,
    buildGovernedMemoryRuntimeSnapshot,
    runtimeExecutionProfile,
    executionProfileEnvKey,
    isSmokeExecutionProfile,
    buildAppServerTransportRuntimeSnapshot,
    operationLog,
    loggingMode,
    loggingModeEnvKey,
    loggingSurfacePaths,
    repoRelativePath,
    fastModeDefault,
    automaticApprovalReviewDefault,
    fastModeDefaultEnvKey,
    automaticApprovalReviewEnvKey,
    serverProcessStartedAt,
    agentStates,
    resolveEffectiveServiceTier,
    nonFastEffectiveServiceTier,
    getActiveExecRequestCount,
    turnArtifactsEnabled,
    turnArtifactsRoot,
    turnArtifactsMaxBytes,
    turnArtifactsMaxDays,
    turnArtifactsRedactionEnabled,
    turnArtifactsRedactionPlaceholder,
    execIdempotencyTtlMs,
    harnessMemoryPath,
    execIdempotencyStatusWaitMaxMs,
    getAgentGovernancePolicySnapshot,
    harnessTurnContractSpec,
    harnessTurnContractSpecPath,
    taskOutcomeContract,
    taskOutcomeContractPath,
    summarizeTaskOutcomeContract,
    userFacingResponseContract,
    userFacingResponseContractPath,
    summarizeUserFacingResponseContract,
    planningModeContract,
    planningModeContractPath,
    assuranceModeContract,
    assuranceModeContractPath,
    taskFamilyProfilesContract,
    taskContractManifest,
    taskFamilyProfilesPath,
    taskContractManifestPath,
    planningDecisionContractSchemaPath,
    requirementContractSchemaPath,
    dispatchPlanSchemaPath,
    requestFrameContractPath,
    routingDecisionContractPath,
    discoveryOutcomeContractPath,
    reviewBundleContractPath,
    releaseDecisionContractPath,
    conformanceInvariantsContractPath,
    evidenceContractMachinePath,
    summarizeTaskContract,
    getConversationRuntimeSnapshot,
    getPiperRuntimeSnapshot,
    getKokoroVoiceRuntimeSnapshot,
    controlApiTokenHeaderName,
    controlApiToken,
    controlApiActionAllowlist,
    execApiRequiredContentType,
    defaultExecModelName,
    defaultExecModelReasoningEffort,
    allowedModelReasoningEfforts,
    listAgentsSnapshot,
  } = deps;

  function readCurrentTruthJson(...segments) {
    try {
      const candidatePath = path.join(workspaceRoot, ...segments);
      if (!fs.existsSync(candidatePath)) {
        return null;
      }
      const parsed = JSON.parse(fs.readFileSync(candidatePath, "utf8"));
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed;
      }
    } catch {
    }
    return null;
  }

  function buildCurrentTruthSnapshot({
    currentWorkerDecisionSurface,
    currentLatestOverview,
  }) {
    const currentGoalCompletion = readCurrentTruthJson("output", "agi_readiness", "goal_completion_status.json");
    const currentSubjectiveCompletion = readCurrentTruthJson("output", "agi_readiness", "subjective_goal_completion_status.json");
    const currentCompatibilityCompletion = readCurrentTruthJson("output", "agi_readiness", "compatibility_completion_status.json");
    return {
      headlineScope: currentLatestOverview && currentLatestOverview.headlineScope
        ? currentLatestOverview.headlineScope
        : (currentWorkerDecisionSurface && currentWorkerDecisionSurface.scope ? currentWorkerDecisionSurface.scope : ""),
      workerDecisionSurface: currentWorkerDecisionSurface || null,
      goalCompletion: currentLatestOverview && currentLatestOverview.goalCompletion && typeof currentLatestOverview.goalCompletion === "object"
        ? currentLatestOverview.goalCompletion
        : {
          scope: currentGoalCompletion && currentGoalCompletion.scope ? currentGoalCompletion.scope : "",
          status: currentGoalCompletion && currentGoalCompletion.goalStatus ? currentGoalCompletion.goalStatus : "",
          whyNotYetCount: Array.isArray(currentGoalCompletion && currentGoalCompletion.whyNotYet) ? currentGoalCompletion.whyNotYet.length : 0,
        },
      subjectiveCompletion: currentLatestOverview && currentLatestOverview.subjectiveCompletion && typeof currentLatestOverview.subjectiveCompletion === "object"
        ? currentLatestOverview.subjectiveCompletion
        : {
          scope: currentSubjectiveCompletion && currentSubjectiveCompletion.scope ? currentSubjectiveCompletion.scope : "",
          status: currentSubjectiveCompletion && currentSubjectiveCompletion.subjectiveGoalStatus ? currentSubjectiveCompletion.subjectiveGoalStatus : "",
          whyNotYetCount: Array.isArray(currentSubjectiveCompletion && currentSubjectiveCompletion.subjectiveWhyNotYet) ? currentSubjectiveCompletion.subjectiveWhyNotYet.length : 0,
        },
      compatibilityCompletion: currentLatestOverview && currentLatestOverview.compatibilityCompletion && typeof currentLatestOverview.compatibilityCompletion === "object"
        ? currentLatestOverview.compatibilityCompletion
        : {
          scope: currentCompatibilityCompletion && currentCompatibilityCompletion.scope ? currentCompatibilityCompletion.scope : "",
          status: currentCompatibilityCompletion && currentCompatibilityCompletion.status ? currentCompatibilityCompletion.status : "",
          whyNotYetCount: Array.isArray(currentCompatibilityCompletion && currentCompatibilityCompletion.whyNotYet) ? currentCompatibilityCompletion.whyNotYet.length : 0,
        },
    };
  }

  function buildWorkerDecisionSupport(currentTruth) {
    return {
      goalStatus: currentTruth.goalCompletion && currentTruth.goalCompletion.status ? currentTruth.goalCompletion.status : "",
      goalStatusScope: currentTruth.goalCompletion && currentTruth.goalCompletion.scope ? currentTruth.goalCompletion.scope : "",
      subjectiveGoalStatus: currentTruth.subjectiveCompletion && currentTruth.subjectiveCompletion.status ? currentTruth.subjectiveCompletion.status : "",
      subjectiveGoalStatusScope: currentTruth.subjectiveCompletion && currentTruth.subjectiveCompletion.scope ? currentTruth.subjectiveCompletion.scope : "",
      compatibilityCompletionStatus: currentTruth.compatibilityCompletion && currentTruth.compatibilityCompletion.status ? currentTruth.compatibilityCompletion.status : "",
      compatibilityCompletionScope: currentTruth.compatibilityCompletion && currentTruth.compatibilityCompletion.scope ? currentTruth.compatibilityCompletion.scope : "",
    };
  }

  function buildStatusScopeMap() {
    return {
      schema: "status-scope-map.v1",
      scope: "status_vocabulary",
      statuses: {
        COMPLETED: [
          {
            scope: "task_outcome",
            source: "output/governance_public/worker_decision_surface.json.taskOutcomeStatus",
            meaning: "The requested task or bounded worker stop question is complete; this is not whole-program readiness.",
          },
        ],
        RELEASE_APPROVED: [
          {
            scope: "release_decision",
            source: "worker_decision_surface.releaseState or latest signoff bundle",
            meaning: "The evaluated release/signoff scope is approved; historical bundle approval must not imply current dirty tree or whole-program completion.",
          },
        ],
        NOT_YET: [
          {
            scope: "program_readiness",
            source: "output/agi_readiness/goal_completion_status.json.goalStatus",
            meaning: "Whole-program readiness debt remains open and stays separate from the bounded task verdict.",
          },
          {
            scope: "subjective_companion",
            source: "output/agi_readiness/subjective_goal_completion_status.json.subjectiveGoalStatus",
            meaning: "Subjective-quality readiness remains a companion signal, not the task headline.",
          },
          {
            scope: "compatibility_layer",
            source: "output/agi_readiness/compatibility_completion_status.json.status",
            meaning: "Compatibility readiness remains a companion signal, not the task headline.",
          },
        ],
      },
    };
  }

  function buildOperationalPostureCurrentTruth({
    deploymentPosture,
    gitAutomation,
    authorityModel,
    approvalPolicy,
    sandboxMode,
  } = {}) {
    const activePostureProfile = safeString(
      deploymentPosture && (deploymentPosture.activePostureProfile || deploymentPosture.activeProfile),
      80
    ) || "portable_local";
    const activeLabel = safeString(
      deploymentPosture && (deploymentPosture.activePostureProfileLabel || deploymentPosture.activeLabel),
      120
    ) || activePostureProfile;
    const configuredSandboxMode = safeString(
      sandboxMode || (deploymentPosture && deploymentPosture.defaults && deploymentPosture.defaults.sandboxMode),
      80
    ) || "workspace-write";
    const configuredApprovalPolicy = safeString(
      approvalPolicy || (deploymentPosture && deploymentPosture.defaults && deploymentPosture.defaults.approvalPolicy),
      80
    ) || "on-request";
    const autocommitEnabled = gitAutomation && gitAutomation.autocommitEnabled ? 1 : 0;
    const autopushEnabled = gitAutomation && gitAutomation.autopushEnabled ? 1 : 0;
    const autoCommitAndPush = autocommitEnabled && autopushEnabled ? 1 : 0;
    const strongAuthoritySignals = [];
    if (configuredSandboxMode === "danger-full-access") strongAuthoritySignals.push("danger-full-access");
    if (configuredApprovalPolicy === "never") strongAuthoritySignals.push("approval_policy_never");
    if (autoCommitAndPush) strongAuthoritySignals.push("auto_commit_and_push");
    return {
      schema: "operational-posture-current-truth.v1",
      scope: "reviewer_facing_current_truth",
      reviewerFacing: 1,
      activePostureProfile,
      activeLabel,
      ownerLocal: activePostureProfile === "owner_local" ? 1 : 0,
      referenceArchitectureDefault: deploymentPosture && deploymentPosture.referenceArchitectureDefault ? 1 : 0,
      authorityState: {
        sandboxMode: configuredSandboxMode,
        approvalPolicy: configuredApprovalPolicy,
        strongAuthorityActive: strongAuthoritySignals.length ? 1 : 0,
        strongAuthoritySignals,
      },
      gitAutomation: {
        mode: safeString(gitAutomation && gitAutomation.mode, 80) || "completed-turn",
        enabled: gitAutomation && gitAutomation.enabled ? 1 : 0,
        autocommitEnabled,
        autopushEnabled,
        autoCommitAndPush,
        remoteName: safeString(gitAutomation && gitAutomation.remoteName, 80) || "origin",
      },
      postureDefaults: deploymentPosture && deploymentPosture.defaults && typeof deploymentPosture.defaults === "object"
        ? deploymentPosture.defaults
        : {},
      sources: {
        codexConfigPath: summarizePathForOperationLog(defaultParentAgentConfigPath, 220),
        postureProfilePath: safeString(deploymentPosture && deploymentPosture.profilePath, 220) || "scripts/config/deployment_posture_profiles.json",
        authorityRegistryPath: safeString(authorityModel && authorityModel.registryPath, 220)
          || summarizePathForOperationLog(authorityRegistryPath, 220),
      },
      reviewerNote: "owner_local strong authority, autocommit, and autopush are current runtime facts, not universal reference defaults.",
    };
  }

  function buildDesignCompletionEvidenceSnapshot() {
    const requiredArtifacts = Array.isArray(designAcceptanceContract && designAcceptanceContract.requiredArtifacts)
      ? designAcceptanceContract.requiredArtifacts
      : [];
    const responseExpectations = userFacingResponseContract
      && userFacingResponseContract.reviewerPacketReporting
      && userFacingResponseContract.reviewerPacketReporting.evidenceExpectations
      && typeof userFacingResponseContract.reviewerPacketReporting.evidenceExpectations === "object"
      ? userFacingResponseContract.reviewerPacketReporting.evidenceExpectations
      : {};
    return {
      schema: "design-completion-evidence-current-truth.v1",
      currentTruth: 1,
      appliesTo: ["web_creative", "design_sensitive_ui"],
      completionStateIfMissing: "FAILED_VALIDATION",
      screenshotEvidenceRequired: responseExpectations.screenshotEvidenceRequiredForVisualClaims !== false
        && Boolean(designAcceptanceContract && designAcceptanceContract.visualReviewRequired),
      reviewerEvidenceRequired: responseExpectations.reviewerEvidenceRequiredForCompletionClaims !== false
        && Boolean(designAcceptanceContract && designAcceptanceContract.independentReviewRequired),
      requiredTogetherBeforeCompletion: true,
      requiredArtifacts: requiredArtifacts.filter((entry) => /screenshot|reviewer/i.test(String(entry || ""))),
      contractPath: summarizePathForOperationLog(designAcceptanceContractPath, 220),
      responseContractPath: summarizePathForOperationLog(userFacingResponseContractPath, 220),
    };
  }

  function buildRuntimeApiSnapshot() {
    const active = getActiveAgentState();
    const latestTurn = getLatestTurnSnapshot();
    const liveVerificationTimestamp = new Date().toISOString();
    const turnRuntime = runtimeStateService.buildTurnRuntimeSnapshot();
    const requirementGuard = getRequirementGuardExtensionSnapshot();
    const sessionPerformance = getSessionPerformanceSnapshot(active && active.sessionRef ? active.sessionRef : null);
    const nonInteractiveUserInput = { policy: nonInteractiveRequestUserInputPolicy, envKey: requestUserInputPolicyEnvKey };
    const adversarialShadow = buildAdversarialShadowRuntimeSnapshot();
    const harnessMemory = buildHarnessMemoryRuntimeSnapshot();
    const workspaceGuard = buildWorkspaceGuardSnapshot();
    const slo = buildSloRuntimeSnapshot();
    const staticApps = appPlatformReadSurface.buildStaticAppsRuntimeSnapshot();
    const gitAutomation = buildGitAutomationRuntimeSnapshot();
    const configuredApprovalPolicy = readTopLevelCodexConfigString(defaultParentAgentConfigPath, "approval_policy") || "on-request";
    const configuredSandboxMode = readTopLevelCodexConfigString(defaultParentAgentConfigPath, "sandbox_mode") || "workspace-write";
    const repoTruth = typeof buildRepoTruthRuntimeSnapshot === "function"
      ? buildRepoTruthRuntimeSnapshot({ observedAt: liveVerificationTimestamp })
      : {
        schema: "repo-truth-snapshot.v1",
        scope: "current_repo_truth",
        liveVerificationTimestamp,
        dirtyState: "unknown",
        dirtyWorkingTree: { scope: "dirty_working_tree", dirty: 0, entryCount: 0, entries: [] },
        generatedOutput: { scope: "generated_output", dirtyEntryCount: 0, entries: [] },
        head: { scope: "HEAD", commit: "" },
        origin: { scope: "origin", commit: "" },
        headEqualsOrigin: null,
      };
    const governanceRuntimeSurface = buildGovernanceRuntimeSurface({
      registry: authorityRegistry,
      authorityRegistryPath,
      approvalPolicy: configuredApprovalPolicy,
      sandboxMode: configuredSandboxMode,
      autoCommitAndPush: Boolean(gitAutomation && gitAutomation.autocommitEnabled && gitAutomation.autopushEnabled),
      iterationControlContract,
      iterationControlContractPath,
      adoptionReadinessContract,
      adoptionReadinessContractPath,
      workerDecisionSurfaceContract,
      workerDecisionSurfaceContractPath,
      harnessPlaneContract,
      harnessPlaneContractPath,
      summarizePathForOperationLog,
    });
    const authorityModel = governanceRuntimeSurface.authorityModel;
    const deploymentPosture = governanceRuntimeSurface.deploymentPosture;
    const activePostureProfile = deploymentPosture && deploymentPosture.activePostureProfile
      ? deploymentPosture.activePostureProfile
      : (deploymentPosture && deploymentPosture.activeProfile ? deploymentPosture.activeProfile : "");
    const operationalPostureCurrentTruth = buildOperationalPostureCurrentTruth({
      deploymentPosture,
      gitAutomation,
      authorityModel,
      approvalPolicy: configuredApprovalPolicy,
      sandboxMode: configuredSandboxMode,
    });
    const evalHarness = {
      suite: buildEvalSuiteSummary(defaultEvalSuite),
      configPath: summarizePathForOperationLog(evalSuiteConfigPath, 220),
      lanePolicyPath: summarizePathForOperationLog(evalLanePolicyPath, 220),
      publicLaneId: safeString(evalLanePolicy && evalLanePolicy.publicLaneId, 80) || "public_regression",
      protectedPaths: Array.isArray(evalLanePolicy && evalLanePolicy.protectedPaths)
        ? evalLanePolicy.protectedPaths.map((entry) => summarizePathForOperationLog(entry, 220))
        : [],
      lanes: Array.isArray(evalLanePolicy && evalLanePolicy.lanes)
        ? evalLanePolicy.lanes.map((entry) => summarizeEvalLane(entry))
        : [],
      historyPath: summarizePathForOperationLog(evalRunHistoryPath, 220),
      historyEnvKey: evalRunHistoryPathEnvKey,
      maxCases: evalMaxCases,
      maxVariants: evalDefaultMaxVariants,
      caseTimeoutMs: evalCaseTimeoutMs,
    };
    const fullUtilization = buildFullUtilizationDefaultsSnapshot();
    const parentDispatchGuard = buildParentDispatchGuardDefaultsSnapshot();
    const phaseStatus = buildRequirementFoundationV1PhaseStatus();
    const externalLearning = buildOpenAIBlogLearningRuntimeStateSnapshot();
    const manualSelfImprovement = buildManualSelfImprovementRuntimeStateSnapshot();
    const agiImprovementFlywheel = buildHarnessAgiImprovementFlywheelRuntimeSummary({
      workspaceRoot,
    });
    const documentTooling = buildDocumentToolingRuntimeSnapshot({
      workspaceRoot,
    });
    const iterationControlSummary = governanceRuntimeSurface.iterationControlSummary;
    const adoptionReadinessSummary = governanceRuntimeSurface.adoptionReadinessSummary;
    const workerDecisionSurfaceSummary = governanceRuntimeSurface.workerDecisionSurfaceSummary;
    const harnessPlaneSummary = governanceRuntimeSurface.harnessPlaneSummary;
    const currentWorkerDecisionSurface = readCurrentTruthJson("output", "governance_public", "worker_decision_surface.json");
    const currentLatestOverview = readCurrentTruthJson("output", "memory_public", "latest_overview.json");
    const currentTruth = buildCurrentTruthSnapshot({
      currentWorkerDecisionSurface,
      currentLatestOverview,
    });
    const designCompletionEvidence = buildDesignCompletionEvidenceSnapshot();
    const statusScopeMap = buildStatusScopeMap();
    currentTruth.designCompletionEvidence = designCompletionEvidence;
    currentTruth.statusScopeMap = statusScopeMap;
    currentTruth.repoTruth = repoTruth;
    currentTruth.operationalPosture = operationalPostureCurrentTruth;
    const workerDecisionSupport = buildWorkerDecisionSupport(currentTruth);
    const secondaryLearning = {
      anthropicEngineering: buildAnthropicEngineeringLearningRuntimeStateSnapshot(),
    };
    const evalHistoryOverview = {
      recentRuns: buildEvalHistoryOverview({ limit: 6 }),
    };
    const executionOverview = buildExecutionMemoryOverview({ limit: 10, window: 60 });
    const intentFirstSummary = {
      ...summarizeIntentFirstRuntime({ contract: designAcceptanceContract, store: tasteMemoryStore }),
      contractPath: summarizePathForOperationLog(designAcceptanceContractPath, 220),
      tasteMemorySeedPath: summarizePathForOperationLog(tasteMemorySeedPath, 220),
      tasteMemoryPath: summarizePathForOperationLog(tasteMemoryMemoryPath, 220),
    };
    const traceability = buildHarnessTraceabilitySnapshot(
      latestTurn && latestTurn.planning && typeof latestTurn.planning === "object"
        ? latestTurn.planning
        : {},
      safeString(latestTurn && latestTurn.agent_name, 80)
        || safeString(activeAgentName, 80)
        || "default"
    );
    const governedMemory = buildGovernedMemoryRuntimeSnapshot({
      workspaceRoot,
      runtime: {
        activeAgent: activeAgentName,
        latestTurn,
        intentFirst: intentFirstSummary,
        executionOverview,
        evalHistory: evalHistoryOverview,
        externalLearning,
        manualSelfImprovement,
        secondaryLearning,
        phaseStatus,
        traceability,
      },
      traceability,
    });
    const executionVisibility = {
      profile: runtimeExecutionProfile,
      envKey: executionProfileEnvKey,
      smokeLikeProfile: isSmokeExecutionProfile(runtimeExecutionProfile) ? 1 : 0,
      fullUtilization,
      parentDispatchGuard,
    };
    const serverProcessSnapshot = {
      pid: processRef.pid,
      startedAt: serverProcessStartedAt,
      uptimeMs: Math.max(0, Date.now() - serverProcessStartedAt),
      activeExecRequests: getActiveExecRequestCount(),
      restartProtection: {
        activeExecRequests: getActiveExecRequestCount(),
        restartBlocked: getActiveExecRequestCount() > 0 ? 1 : 0,
      },
    };
    const appServerTransport = buildAppServerTransportRuntimeSnapshot();
    const serverRestartMarker = readCurrentTruthJson("runtime", "server_restart_result.json");
    const serverRestart = serverRestartMarker && typeof serverRestartMarker === "object"
      ? {
        ...serverRestartMarker,
        currentPid: processRef.pid,
        currentStartedAt: serverProcessStartedAt,
      }
      : null;
    if (repoTruth && typeof repoTruth === "object") {
      repoTruth.liveRuntime = {
        scope: "live_runtime",
        liveVerificationTimestamp,
        processPid: processRef.pid,
        startedAt: serverProcessStartedAt,
        activeExecRequests: getActiveExecRequestCount(),
      };
    }
    return {
      apiVersion,
      mode: "app-server",
      workspaceRoot,
      activeAgent: activeAgentName,
      activePostureProfile,
      active_posture_profile: activePostureProfile,
      liveVerificationTimestamp,
      live_verification_timestamp: liveVerificationTimestamp,
      sessionRef: active ? active.sessionRef : null,
      agentCount: agentStates.size,
      experimental: active ? active.experimentalEnabled : false,
      experimentalFeatures: active ? Array.from(active.experimentalFeatures || []) : [],
      serviceTier: active ? resolveEffectiveServiceTier(active) : nonFastEffectiveServiceTier,
      fastModeEnabled: active ? Boolean(active.fastModeEnabled) : fastModeDefault,
      automaticApprovalReviewEnabled: active ? Boolean(active.automaticApprovalReviewEnabled) : automaticApprovalReviewDefault,
      agents: typeof listAgentsSnapshot === "function" ? listAgentsSnapshot() : [],
      turnRuntime,
      turn_runtime: turnRuntime,
      requirementGuard,
      requirement_guard: requirementGuard,
      latestTurn,
      latest_turn: latestTurn,
      sessionPerformance,
      session_performance: sessionPerformance,
      serverProcess: serverProcessSnapshot,
      server_process: serverProcessSnapshot,
      serverRestart,
      server_restart: serverRestart,
      activeExecRequests: getActiveExecRequestCount(),
      active_exec_requests: getActiveExecRequestCount(),
      appServerTransport,
      app_server_transport: appServerTransport,
      operationLog: operationLog.runtimeSnapshot(),
      loggingSurface: {
        mode: loggingMode,
        envKey: loggingModeEnvKey,
        currentRoot: repoRelativePath(workspaceRoot, loggingSurfacePaths.currentRoot),
        bundlesRoot: repoRelativePath(workspaceRoot, loggingSurfacePaths.bundlesRoot),
        archiveRoot: repoRelativePath(workspaceRoot, loggingSurfacePaths.archiveRoot),
      },
      executionProfile: runtimeExecutionProfile,
      execution_profile: runtimeExecutionProfile,
      executionVisibility,
      execution_visibility: executionVisibility,
      fullUtilization,
      full_utilization: fullUtilization,
      parentDispatchGuard,
      parent_dispatch_guard: parentDispatchGuard,
      nonInteractiveUserInput,
      non_interactive_user_input: nonInteractiveUserInput,
      operatorDefaults: {
        fastModeEnabled: fastModeDefault,
        automaticApprovalReviewEnabled: automaticApprovalReviewDefault,
        envKeys: {
          fastModeDefault: fastModeDefaultEnvKey,
          automaticApprovalReview: automaticApprovalReviewEnvKey,
        },
      },
      adversarialShadow,
      adversarial_shadow: adversarialShadow,
      staticApps,
      static_apps: staticApps,
      gitAutomation,
      git_automation: gitAutomation,
      repoTruth,
      repo_truth: repoTruth,
      authorityRegistry: authorityModel,
      authority_registry: authorityModel,
      deploymentPosture,
      deployment_posture: deploymentPosture,
      designCompletionEvidence,
      design_completion_evidence: designCompletionEvidence,
      statusScopeMap,
      status_scope_map: statusScopeMap,
      operationalPostureCurrentTruth,
      operational_posture_current_truth: operationalPostureCurrentTruth,
      harnessMemory,
      harness_memory: harnessMemory,
      governedMemory,
      governed_memory: governedMemory,
      slo,
      evalHarness,
      eval_harness: evalHarness,
      phaseStatus,
      phase_status: phaseStatus,
      externalLearning,
      external_learning: externalLearning,
      documentTooling,
      document_tooling: documentTooling,
      iterationControl: iterationControlSummary,
      iteration_control: iterationControlSummary,
      workerDecisionSurface: currentWorkerDecisionSurface || workerDecisionSurfaceSummary,
      worker_decision_surface: currentWorkerDecisionSurface || workerDecisionSurfaceSummary,
      workerDecisionSupport,
      worker_decision_support: workerDecisionSupport,
      currentTruth,
      current_truth: currentTruth,
      adoptionReadinessContract: adoptionReadinessSummary,
      adoption_readiness_contract: adoptionReadinessSummary,
      workerDecisionSurfaceContract: workerDecisionSurfaceSummary,
      worker_decision_surface_contract: workerDecisionSurfaceSummary,
      harnessPlanes: harnessPlaneSummary,
      harness_planes: harnessPlaneSummary,
      manualSelfImprovement,
      manual_self_improvement: manualSelfImprovement,
      agiImprovementFlywheel,
      agi_improvement_flywheel: agiImprovementFlywheel,
      secondaryLearning,
      secondary_learning: {
        anthropicEngineering: secondaryLearning.anthropicEngineering,
        anthropic_engineering: secondaryLearning.anthropicEngineering,
      },
      contractSpec: {
        schema: safeString(harnessTurnContractSpec && harnessTurnContractSpec.schema, 80) || "harness-turn-contract.v1",
        path: summarizePathForOperationLog(harnessTurnContractSpecPath, 220),
        terminalEvent: safeString(harnessTurnContractSpec && harnessTurnContractSpec.turn && harnessTurnContractSpec.turn.terminalEvent, 120) || "turn/completed",
        releaseDecisionStates: Array.isArray(harnessTurnContractSpec && harnessTurnContractSpec.releaseDecisionStates) ? harnessTurnContractSpec.releaseDecisionStates : [],
        taskOutcomeBridge: harnessTurnContractSpec && harnessTurnContractSpec.taskOutcomeBridge
          ? harnessTurnContractSpec.taskOutcomeBridge
          : { allowedByTurnState: {} },
      },
      taskOutcomeContract: {
        ...summarizeTaskOutcomeContract(taskOutcomeContract),
        path: summarizePathForOperationLog(taskOutcomeContractPath, 220),
      },
      userFacingResponseContract: {
        ...summarizeUserFacingResponseContract(userFacingResponseContract),
        path: summarizePathForOperationLog(userFacingResponseContractPath, 220),
      },
      planningContracts: {
        schema: safeString(planningModeContract && planningModeContract.schema, 80) || "planning-mode-contract.v1",
        version: safeString(planningModeContract && planningModeContract.version, 80) || "",
        path: summarizePathForOperationLog(planningModeContractPath, 220),
        assuranceSchema: safeString(assuranceModeContract && assuranceModeContract.schema, 80) || "assurance-mode-contract.v1",
        assuranceVersion: safeString(assuranceModeContract && assuranceModeContract.version, 80) || "",
        assurancePath: summarizePathForOperationLog(assuranceModeContractPath, 220),
        familyProfileSchema: safeString(taskFamilyProfilesContract && taskFamilyProfilesContract.schema, 80) || "task-family-profiles.v1",
        familyProfileVersion: safeString(taskFamilyProfilesContract && taskFamilyProfilesContract.version, 80) || "",
        familyProfilePath: summarizePathForOperationLog(taskFamilyProfilesPath, 220),
        taskContractSchema: safeString(taskContractManifest && taskContractManifest.schema, 80) || "task-contract-manifest.v1",
        taskContractVersion: safeString(taskContractManifest && taskContractManifest.version, 80) || "",
        taskContractPath: summarizePathForOperationLog(taskContractManifestPath, 220),
        planningDecisionSchemaPath: summarizePathForOperationLog(planningDecisionContractSchemaPath, 220),
        requirementSchemaPath: summarizePathForOperationLog(requirementContractSchemaPath, 220),
        dispatchSchemaPath: summarizePathForOperationLog(dispatchPlanSchemaPath, 220),
        requestFrameContractPath: summarizePathForOperationLog(requestFrameContractPath, 220),
        routingDecisionContractPath: summarizePathForOperationLog(routingDecisionContractPath, 220),
        discoveryOutcomeContractPath: summarizePathForOperationLog(discoveryOutcomeContractPath, 220),
        reviewBundleContractPath: summarizePathForOperationLog(reviewBundleContractPath, 220),
        releaseDecisionContractPath: summarizePathForOperationLog(releaseDecisionContractPath, 220),
        conformanceInvariantsContractPath: summarizePathForOperationLog(conformanceInvariantsContractPath, 220),
        evidenceContractMachinePath: summarizePathForOperationLog(evidenceContractMachinePath, 220),
        modes: Array.isArray(planningModeContract && planningModeContract.modes) ? planningModeContract.modes : [],
        assuranceModes: Array.isArray(assuranceModeContract && assuranceModeContract.modes) ? assuranceModeContract.modes : [],
        families: Array.isArray(taskFamilyProfilesContract && taskFamilyProfilesContract.families)
          ? taskFamilyProfilesContract.families.map((entry) => safeString(entry && entry.id, 80)).filter(Boolean)
          : [],
        taskContracts: Array.isArray(taskContractManifest && taskContractManifest.contracts)
          ? taskContractManifest.contracts.map((entry) => summarizeTaskContract(entry))
          : [],
      },
      intentFirst: intentFirstSummary,
      workspaceGuard,
      workspace_guard: workspaceGuard,
      controlApi: {
        tokenHeader: controlApiTokenHeaderName,
        token: controlApiToken,
        originCheck: true,
        actionAllowlist: Array.from(controlApiActionAllowlist),
      },
      execApi: {
        tokenHeader: controlApiTokenHeaderName,
        tokenRequired: true,
        originCheck: true,
        contentType: execApiRequiredContentType,
        idempotencyStatusApi: "/api/exec/idempotency/:key",
        replayApi: {
          listPath: "/api/replay/turns",
          getPath: "/api/replay/turn/:turnId",
          runPath: "POST /api/replay/turn",
          supportedModes: ["live_rerun", "artifact_snapshot"],
          defaultMode: "artifact_snapshot",
        },
        evalApi: {
          suitesPath: "/api/eval/suites",
          runPath: "POST /api/eval/run",
          historyPath: "/api/eval/history",
        },
        sloApi: "/api/slo/status",
        defaultModel: defaultExecModelName,
        modelReasoningEffort: defaultExecModelReasoningEffort,
        supportedModelReasoningEfforts: Array.from(allowedModelReasoningEfforts),
        supportedMemoryModes: ["default", "read_write", "read_only", "disabled"],
        resetCodexMemoryFallback: true,
      },
      conversationApi: getConversationRuntimeSnapshot(),
      piperVoiceApi: getPiperRuntimeSnapshot({ workspaceRoot }),
      piper_voice_api: getPiperRuntimeSnapshot({ workspaceRoot }),
      kokoroVoiceApi: getKokoroVoiceRuntimeSnapshot(),
      kokoro_voice_api: getKokoroVoiceRuntimeSnapshot(),
      evidenceArtifacts: {
        enabled: turnArtifactsEnabled,
        root: summarizePathForOperationLog(turnArtifactsRoot, 220),
        maxBytes: turnArtifactsMaxBytes,
        maxDays: turnArtifactsMaxDays,
        redaction: {
          enabled: turnArtifactsRedactionEnabled ? 1 : 0,
          placeholder: turnArtifactsRedactionPlaceholder,
        },
      },
      idempotency: {
        ttlMs: execIdempotencyTtlMs,
        persistent: true,
        storage: summarizePathForOperationLog(harnessMemoryPath, 220),
        statusApi: {
          path: "/api/exec/idempotency/:key",
          waitMaxMs: execIdempotencyStatusWaitMaxMs,
        },
      },
      governancePolicy: getAgentGovernancePolicySnapshot(),
    };
  }

  function sanitizeRuntimeSnapshotForOverview(runtimeSnapshot) {
    const source = runtimeSnapshot && typeof runtimeSnapshot === "object" ? runtimeSnapshot : {};
    let cloned = {};
    try {
      cloned = JSON.parse(JSON.stringify(source));
    } catch {
      cloned = { ...source };
    }
    if (cloned.controlApi && typeof cloned.controlApi === "object") {
      cloned.controlApi = {
        ...cloned.controlApi,
        token: "",
        tokenRedacted: 1,
      };
    }
    return cloned;
  }

  return Object.freeze({
    buildRuntimeApiSnapshot,
    sanitizeRuntimeSnapshotForOverview,
  });
}

module.exports = {
  createRuntimeApiSnapshotService,
};
