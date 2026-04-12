"use strict";

function syncHarnessOverviewGovernedMemory(options={}){
  const {
    buildEvalHistoryOverview,
    buildExecutionMemoryOverview,
    buildHarnessTraceabilitySnapshot,
    buildRuntimeApiSnapshot,
    safeString,
    syncGovernedMemoryGraph,
    workspaceRoot,
    reason="runtime_sync",
  }=options;
  const runtime=buildRuntimeApiSnapshot();
  const traceability=buildHarnessTraceabilitySnapshot(
    runtime&&runtime.latestTurn&&runtime.latestTurn.planning&&typeof runtime.latestTurn.planning==="object"
      ?runtime.latestTurn.planning
      :{},
    safeString(runtime&&runtime.latestTurn&&runtime.latestTurn.agent_name,80)
      ||safeString(runtime&&runtime.activeAgent,80)
      ||"default"
  );
  return syncGovernedMemoryGraph({
    workspaceRoot,
    runtime:{
      activeAgent:runtime.activeAgent,
      latestTurn:runtime.latestTurn,
      intentFirst:runtime.intentFirst,
      executionOverview:buildExecutionMemoryOverview({limit:10,window:60}),
      evalHistory:{
        recentRuns:buildEvalHistoryOverview({limit:6}),
      },
      externalLearning:runtime.externalLearning,
      manualSelfImprovement:runtime.manualSelfImprovement,
      secondaryLearning:runtime.secondaryLearning,
      phaseStatus:runtime.phaseStatus,
      traceability,
    },
    traceability,
    reason:safeString(reason,80)||"runtime_sync",
  });
}

function buildHarnessOverviewPayload(options={}){
  const {
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
  }=options;

  const memoryLoaded=typeof harnessMemoryLoaded==="function"
    ?Boolean(harnessMemoryLoaded())
    :Boolean(harnessMemoryLoaded);
  if(!memoryLoaded){
    loadHarnessExecutionMemoryStore();
  }

  const runtime=sanitizeRuntimeSnapshotForOverview(buildRuntimeApiSnapshot());
  const skillPortfolio=buildSkillPortfolioOverview();
  const assignmentsByRole=new Map(
    Array.isArray(skillPortfolio&&skillPortfolio.assignments)
      ?skillPortfolio.assignments.map((entry)=>[entry.role,entry.skills])
      :[]
  );
  const topology=buildTopographyOverview(getAgentTopographySnapshot(),assignmentsByRole);
  const traceability=buildHarnessTraceabilitySnapshot(
    runtime&&runtime.latestTurn&&runtime.latestTurn.planning&&typeof runtime.latestTurn.planning==="object"
      ?runtime.latestTurn.planning
      :{},
    safeString(runtime&&runtime.latestTurn&&runtime.latestTurn.agent_name,80)
      ||safeString(runtime&&runtime.activeAgent,80)
      ||"default"
  );
  const governedGraph=syncHarnessOverviewGovernedMemory({
    buildEvalHistoryOverview,
    buildExecutionMemoryOverview,
    buildHarnessTraceabilitySnapshot,
    buildRuntimeApiSnapshot,
    safeString,
    syncGovernedMemoryGraph,
    workspaceRoot,
    reason:"overview_sync",
  });
  const capabilitySurface={
    browser:buildBrowserCapabilityOverview(),
    continuity:buildContinuityOverviewSnapshot(),
  };

  return{
    apiVersion,
    mode:"harness-overview",
    generatedAt:Date.now(),
    workspaceRoot,
    pages:{
      console:"/01.HarnesUI/index.html",
      overview:"/01.HarnesUI/overview.html",
    },
    apis:{
      runtime:"/api/runtime",
      overview:"/api/harness/overview",
      topography:"/api/agent-topography",
      conversationRuntime:"/api/conversation/runtime",
      evalSuites:"/api/eval/suites",
      evalHistory:"/api/eval/history",
      replayTurns:"/api/replay/turns",
      continuityTask:"/api/continuity/task",
      continuityTasks:"/api/continuity/tasks",
      sloStatus:"/api/slo/status",
    },
    capabilitySurface,
    runtime,
    topology,
    contracts:{
      governance:runtime.governancePolicy,
      turn:runtime.contractSpec,
      taskOutcome:runtime.taskOutcomeContract,
      planning:runtime.planningContracts,
      designAcceptance:runtime.intentFirst&&runtime.intentFirst.contract?runtime.intentFirst.contract:{},
    },
    evidence:{
      current:{
        root:repoRelativePath(workspaceRoot,loggingSurfacePaths.currentRoot),
        operatorSummaryPath:repoRelativePath(workspaceRoot,loggingSurfacePaths.currentOperatorSummaryPath),
        indexPath:repoRelativePath(workspaceRoot,loggingSurfacePaths.currentIndexPath),
        designConformanceSummaryPath:repoRelativePath(workspaceRoot,loggingSurfacePaths.currentDesignConformancePath),
        latestRunSummaryPath:repoRelativePath(workspaceRoot,loggingSurfacePaths.currentLatestRunSummaryPath),
        reviewLoadBreakdownPath:repoRelativePath(workspaceRoot,loggingSurfacePaths.currentReviewLoadBreakdownPath),
        latestSignoffSummaryPath:repoRelativePath(workspaceRoot,loggingSurfacePaths.currentLatestSignoffSummaryPath),
      },
      runtimeProof:buildBundleOverview(runtimeProofsRoot,"runtime_proof_summary.json",buildRuntimeProofBundleSnapshot),
      signoff:buildBundleOverview(signoffBundlesRoot,"signoff_summary.json",buildSignoffBundleSnapshot),
    },
    eval:{
      suite:runtime.evalHarness&&runtime.evalHarness.suite?runtime.evalHarness.suite:{},
      recentRuns:buildEvalHistoryOverview({limit:6}),
    },
    memory:{
      harness:runtime.harnessMemory,
      governedGraph:governedGraph&&governedGraph.summary&&typeof governedGraph.summary==="object"
        ?governedGraph.summary
        :runtime.governedMemory&&typeof runtime.governedMemory==="object"
          ?runtime.governedMemory
          :{},
      taste:runtime.intentFirst&&runtime.intentFirst.tasteMemory?runtime.intentFirst.tasteMemory:{},
      execution:buildExecutionMemoryOverview({limit:10,window:60}),
      externalLearning:runtime.externalLearning&&typeof runtime.externalLearning==="object"?runtime.externalLearning:{},
      manualSelfImprovement:runtime.manualSelfImprovement&&typeof runtime.manualSelfImprovement==="object"?runtime.manualSelfImprovement:{},
      agiImprovementFlywheel:runtime.agiImprovementFlywheel&&typeof runtime.agiImprovementFlywheel==="object"?runtime.agiImprovementFlywheel:{},
      secondaryLearning:runtime.secondaryLearning&&typeof runtime.secondaryLearning==="object"?runtime.secondaryLearning:{},
      replay:{
        recent:listReplayMemorySnapshots({limit:6}),
      },
    },
    traceability,
    health:{
      latestTurn:runtime.latestTurn,
      fullUtilization:runtime.fullUtilization,
      slo:runtime.slo,
    },
    skillPortfolio,
  };
}

module.exports={
  buildHarnessOverviewPayload,
  syncHarnessOverviewGovernedMemory,
};
